/**
 * /api/teams/[teamId] — Team detail with roster, last 5 games, and player ratings
 */

export const dynamic = 'force-dynamic';

import { getTeam, ALL_TEAMS } from '@/lib/teams';
import { computeRankings } from '@/lib/rankings';
import { fetchTeamRoster, fetchTeamSchedule, fetchBatchPlayerStats } from '@/lib/espn';
import { computePlayerRating } from '@/lib/players';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/cache';

const refreshing = new Set();

async function computeTeamDetail(teamId) {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');

    // Fetch rankings, roster, and schedule in parallel
    const [rankingsData, rosterData, scheduleData] = await Promise.all([
        computeRankings(),
        fetchTeamRoster(team.espnId),
        fetchTeamSchedule(team.espnId),
    ]);

    // Find this team in rankings
    const ranked = rankingsData.rankings?.find(t => t.id === teamId) || {};

    // Last 5 completed games
    const completedGames = (scheduleData.games || [])
        .filter(g => g.result)
        .slice(-5)
        .reverse(); // most recent first

    // Fetch player stats for roster
    const players = rosterData.players || [];
    const playerIds = players.map(p => p.id);
    const statsMap = await fetchBatchPlayerStats(playerIds, 50);

    // Compute player ratings
    const ratedPlayers = players.map(p => {
        const stats = statsMap[p.id] || { batting: {}, pitching: {} };
        const result = computePlayerRating(stats, p.isPitcher, p.position, p.id);
        return {
            ...p,
            rating: result.rating,
            ratingType: result.type,
            batHand: p.batHand || stats.batHand || '',
            throwHand: p.throwHand || stats.throwHand || '',
        };
    });

    // Sort roster: highest rated first
    ratedPlayers.sort((a, b) => b.rating - a.rating);

    return {
        team: {
            ...team,
            ...ranked,
        },
        roster: ratedPlayers,
        lastFive: completedGames,
        lastUpdated: new Date().toISOString(),
    };
}

function refreshInBackground(teamId) {
    if (refreshing.has(teamId)) return;
    refreshing.add(teamId);
    computeTeamDetail(teamId)
        .then(result => {
            cacheSet(`team_detail_${teamId}`, result, CACHE_TTL.TEAM_DETAIL);
        })
        .catch(err => console.error(`Background team detail refresh failed for ${teamId}:`, err.message))
        .finally(() => { refreshing.delete(teamId); });
}

export async function GET(request, { params }) {
    const { teamId } = await params;
    const team = getTeam(teamId);

    if (!team) {
        return Response.json({ error: 'Team not found' }, { status: 404 });
    }

    const cacheKey = `team_detail_${teamId}`;

    // Return cached data immediately if available (stale-while-revalidate)
    const cached = cacheGet(cacheKey);
    if (cached) {
        // Trigger background refresh if data is > 10 seconds old
        const age = Date.now() - new Date(cached.lastUpdated).getTime();
        if (age > 10000) refreshInBackground(teamId);
        return Response.json(cached);
    }

    // No cache at all — must compute synchronously (first load only)
    try {
        const result = await computeTeamDetail(teamId);
        cacheSet(cacheKey, result, CACHE_TTL.TEAM_DETAIL);
        return Response.json(result);
    } catch (err) {
        console.error('Team detail error:', err.message);
        return Response.json(
            { error: err.message, lastUpdated: new Date().toISOString() },
            { status: 500 }
        );
    }
}
