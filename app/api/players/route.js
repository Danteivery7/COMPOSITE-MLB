/**
 * /api/players — Top 50 players with stale-while-revalidate for speed
 * Returns cached data instantly, refreshes in background if stale
 */

export const dynamic = 'force-dynamic';

import { ALL_TEAMS } from '@/lib/teams';
import { fetchTeamRoster, fetchBatchPlayerStats } from '@/lib/espn';
import { computePlayerRating } from '@/lib/players';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/cache';

// In-memory background refresh flag
let isRefreshing = false;

async function computeTop50() {
    const allPlayers = [];
    // Fetch all 30 rosters in parallel
    const rosterPromises = ALL_TEAMS.map(async (team) => {
        try {
            const roster = await fetchTeamRoster(team.espnId);
            for (const p of roster.players || []) {
                const existing = allPlayers.find(ap => ap.id === p.id);
                if (existing) {
                    // Merge positions if duplicated
                    if (!existing.position.includes(p.position)) {
                        existing.position = `${existing.position}/${p.position}`;
                    }
                    if (p.isPitcher) existing.isPitcher = true;
                    existing.isTwoWay = true; // Mark as two-way
                    continue;
                }
                allPlayers.push({
                    ...p,
                    teamId: team.id,
                    teamName: team.name,
                    teamAbbr: team.abbr,
                    teamCity: team.city,
                    teamColor: team.color,
                    teamLogo: `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${team.abbr.toLowerCase()}.png`,
                });
            }
        } catch (e) {
            console.error(`Roster fetch failed for ${team.id}:`, e.message);
        }
    });
    await Promise.all(rosterPromises);

    // Fetch stats with high concurrency
    const playerIds = allPlayers.map(p => p.id);
    const statsMap = await fetchBatchPlayerStats(playerIds, 50);

    // Compute ratings
    const rated = allPlayers.map(p => {
        const stats = statsMap[p.id] || { batting: {}, pitching: {}, career: { batting: {}, pitching: {} } };
        const careerRaw = stats.career || { batting: {}, pitching: {} };
        // Use SAME rating computation as top-100 list
        // If they had dual roles in roster or have dual career stats, treat as two-way
        const isOhtani = String(p.id) === '39832';
        const isRosterTwoWay = (p.position === 'SP/DH' || p.position === 'DH/SP') && isOhtani;
        const ratingData = computePlayerRating(stats, isRosterTwoWay ? 'two-way' : (p.isPitcher || p.position === 'DH'), p.position, p.id, careerRaw, p.age);

        let isTwoWay = ratingData.type === 'two-way' || isRosterTwoWay;

        return {
            ...p,
            rating: ratingData.rating,
            ratingType: ratingData.type,
            isTwoWay: isTwoWay,
        };
    });

    rated.sort((a, b) => b.rating - a.rating);
    const top50 = rated.slice(0, 50);
    top50.forEach((p, i) => { p.rank = i + 1; });

    return {
        players: top50,
        totalPlayers: rated.length,
        lastUpdated: new Date().toISOString(),
    };
}

function refreshInBackground() {
    if (isRefreshing) return;
    isRefreshing = true;
    computeTop50()
        .then(result => {
            cacheSet('top_50_players', result, CACHE_TTL.PLAYERS_TOP);
        })
        .catch(err => console.error('Background top-50 refresh failed:', err.message))
        .finally(() => { isRefreshing = false; });
}

export async function GET() {
    // Return cached data immediately if available (stale-while-revalidate)
    const cached = cacheGet('top_50_players');
    if (cached) {
        // Trigger background refresh if data is > 10 seconds old
        const age = Date.now() - new Date(cached.lastUpdated).getTime();
        if (age > 10000) refreshInBackground();
        return Response.json(cached);
    }

    // No cache at all — must compute synchronously (first load only)
    try {
        const result = await computeTop50();
        cacheSet('top_50_players', result, CACHE_TTL.PLAYERS_TOP);
        return Response.json(result);
    } catch (err) {
        console.error('Players API error:', err);
        return Response.json(
            { players: [], error: err.message, lastUpdated: new Date().toISOString() },
            { status: 200 }
        );
    }
}
