import { NextResponse } from 'next/server';
import { fetchPlayerStats, fetchPlayerGameLogs, fetchScoreboard } from '@/lib/espn';
import { computePlayerRating } from '@/lib/players';
import { cacheGet, cacheSet } from '@/lib/cache';
import { generatePlayerAnalysis } from '@/lib/ai';
import { getPlayerAccolades } from '@/lib/accolades';
import { getTeamByEspnId } from '@/lib/teams';
import { computeRankings } from '@/lib/rankings';

/**
 * GET /api/players/[playerId]
 * Returns full player detail with AI narrative and prop analysis.
 * Hardened version to prevent 'Player Not Found' for pitchers/relievers.
 */
export async function GET(request, { params }) {
    const { playerId } = await params;
    const cacheKey = `player_detail_v20_${playerId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Safe JSON fetch helper
    const safeFetch = async (url) => {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'MLBRankings/1.0' }, next: { revalidate: 60 } });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    };

    try {
        const [bioRes, overviewRes, currentStats, gameLogRes] = await Promise.all([
            safeFetch(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/athletes/${playerId}`),
            safeFetch(`https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${playerId}/overview`),
            fetchPlayerStats(playerId).catch(() => null),
            fetchPlayerGameLogs(playerId).catch(() => ({ logs: [] })),
        ]);

        if (!bioRes) throw new Error("Player not found in core database");

        const bio = bioRes || {};
        const position = bio.position?.abbreviation || bio.position?.name || '';
        const isPitcher = ['SP', 'RP', 'CP', 'P', 'Pitcher'].some(p => String(position).includes(p));

        const isOhtani = String(playerId) === '39832';
        const isRosterTwoWay = (position === 'SP/DH' || position === 'DH/SP' || position === 'Two-Way') && isOhtani;
        const careerFromStats = currentStats?.career || { batting: {}, pitching: {} };
        const ratingData = computePlayerRating(currentStats || { batting: {}, pitching: {} }, isRosterTwoWay ? 'two-way' : (isPitcher || position === 'DH'), position, playerId, careerFromStats, bio.age);

        let isTwoWay = ratingData.type === 'two-way' || isRosterTwoWay;

        let teamName = bio.team?.displayName || '';
        let teamAbbr = bio.team?.abbreviation || '';
        if (bio.team?.$ref) {
            const teamMatch = bio.team.$ref.match(/teams\/(\d+)/);
            if (teamMatch) {
                const teamData = getTeamByEspnId(parseInt(teamMatch[1]));
                if (teamData) {
                    teamName = teamData.name;
                    teamAbbr = teamData.abbr;
                }
            }
        }

        const playerData = {
            id: playerId,
            name: bio.displayName || bio.fullName || 'Unknown',
            position, isPitcher,
            jersey: bio.jersey || '',
            age: bio.age || null,
            height: bio.displayHeight || null,
            weight: bio.displayWeight || null,
            headshot: bio.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
            teamName,
            teamAbbr,
            teamLogoAbbr: teamAbbr,
            batHand: bio.bats?.displayValue || null,
            throwHand: bio.throws?.displayValue || null,
            rating: ratingData?.rating || 40,
            statusLabel: bio.status?.type || bio.status?.name || 'Active',
        };

        let currentSeasonStats = isPitcher ? (currentStats?.pitching || {}) : (currentStats?.batting || {});
        let battingStats = currentStats?.batting || {};
        let pitchingStats = currentStats?.pitching || {};

        let careerStats = {};
        let careerBatting = {};
        let careerPitching = {};

        const overview = overviewRes?.statistics || {};
        const names = overview.names || [];
        const splits = overview.splits || [];

        for (const split of splits) {
            const label = (split.displayName || '').toLowerCase();
            const obj = {};
            (split.stats || []).forEach((v, i) => {
                obj[names[i] || `s${i}`] = parseFloat(v) || 0;
            });

            if (label.includes('career')) {
                const isPitchSplit = obj.ERA !== undefined || obj.innings !== undefined || obj.wins !== undefined;
                if (isPitchSplit) careerPitching = obj;
                else careerBatting = obj;

                if (isPitcher && isPitchSplit) careerStats = obj;
                else if (!isPitcher && !isPitchSplit) careerStats = obj;
            }
        }

        const hasCriticalPitching = careerPitching.ERA !== undefined || careerPitching.earnedRunAverage !== undefined || careerPitching.wins !== undefined;
        const hasCriticalBatting = careerBatting.OPS !== undefined || careerBatting.ops !== undefined || careerBatting.AVG !== undefined || careerBatting.avg !== undefined;
        const needsFallback = isTwoWay ? (!hasCriticalPitching || !hasCriticalBatting) : (isPitcher ? !hasCriticalPitching : !hasCriticalBatting);

        if (needsFallback && bio.fullName) {
            try {
                const searchRes = await safeFetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(bio.fullName)}`);
                const mlbId = searchRes?.people?.[0]?.id;

                if (mlbId) {
                    const mlbStats = await safeFetch(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career,season&group=hitting,pitching`);
                    const statBlocks = mlbStats?.stats || [];

                    for (const block of statBlocks) {
                        const isPitchBlock = block.group?.displayName === 'pitching';
                        const isCareer = block.type?.displayName === 'career';
                        const isSeason = block.type?.displayName === 'season';
                        const raw = block.splits?.[0]?.stat || {};

                        if (isCareer) {
                            if (isPitchBlock) {
                                careerPitching = {
                                    ...careerPitching,
                                    ERA: parseFloat(raw.era) || 0,
                                    IP: parseFloat(raw.inningsPitched) || 0,
                                    K: parseFloat(raw.strikeOuts) || 0,
                                    WHIP: parseFloat(raw.whip) || 0,
                                    wins: parseInt(raw.wins) || 0,
                                    losses: parseInt(raw.losses) || 0,
                                    walks: parseInt(raw.baseOnBalls) || 0,
                                };
                                if (isPitcher) careerStats = careerPitching;
                            } else {
                                careerBatting = {
                                    ...careerBatting,
                                    AVG: parseFloat(raw.avg) || 0,
                                    SLG: parseFloat(raw.slg) || 0,
                                    OBP: parseFloat(raw.obp) || 0,
                                    OPS: parseFloat(raw.ops) || 0,
                                    HR: parseInt(raw.homeRuns) || 0,
                                    GP: parseInt(raw.gamesPlayed) || 0,
                                    RBIs: parseInt(raw.rbi) || 0,
                                    hits: parseInt(raw.hits) || 0,
                                    runs: parseInt(raw.runs) || 0,
                                    walks: parseInt(raw.baseOnBalls) || 0,
                                    stolenBases: parseInt(raw.stolenBases) || 0,
                                    strikeouts: parseInt(raw.strikeOuts) || 0,
                                };
                                if (!isPitcher) careerStats = careerBatting;
                            }
                        }

                        if (isSeason) {
                            if (isPitchBlock && Object.keys(pitchingStats).length < 3) {
                                pitchingStats = {
                                    ...pitchingStats,
                                    ERA: parseFloat(raw.era) || 0,
                                    IP: parseFloat(raw.inningsPitched) || 0,
                                    K: parseFloat(raw.strikeOuts) || 0,
                                    WHIP: parseFloat(raw.whip) || 0,
                                    wins: parseInt(raw.wins) || 0,
                                    losses: parseInt(raw.losses) || 0,
                                    walks: parseInt(raw.baseOnBalls) || 0,
                                };
                                if (isPitcher) currentSeasonStats = pitchingStats;
                            } else if (!isPitchBlock && Object.keys(battingStats).length < 3) {
                                battingStats = {
                                    ...battingStats,
                                    AVG: parseFloat(raw.avg) || 0,
                                    SLG: parseFloat(raw.slg) || 0,
                                    OBP: parseFloat(raw.obp) || 0,
                                    OPS: parseFloat(raw.ops) || 0,
                                    HR: parseInt(raw.homeRuns) || 0,
                                    GP: parseInt(raw.gamesPlayed) || 0,
                                    RBIs: parseInt(raw.rbi) || 0,
                                    hits: parseInt(raw.hits) || 0,
                                    runs: parseInt(raw.runs) || 0,
                                    walks: parseInt(raw.baseOnBalls) || 0,
                                    stolenBases: parseInt(raw.stolenBases) || 0,
                                    strikeouts: parseInt(raw.strikeOuts) || 0,
                                };
                                if (!isPitcher || isTwoWay) currentSeasonStats = battingStats;
                            }
                        }
                    }
                }
            } catch (fallbackErr) {
                console.error('MLB API Fallback failed:', fallbackErr);
            }
        }

        let teamGP = 0;
        let nextOpponent = null;
        try {
            const rankData = await computeRankings();
            const teamAbbr = playerData.teamAbbr;
            const teamRank = (rankData.rankings || []).find(t => t.abbr === teamAbbr);
            if (teamRank) teamGP = teamRank.gamesPlayed || 0;
            const scoreboard = await fetchScoreboard();
            if (scoreboard?.games) {
                const teamGame = scoreboard.games.find(g => g.home?.abbr === teamAbbr || g.away?.abbr === teamAbbr);
                if (teamGame) {
                    const isHome = teamGame.home?.abbr === teamAbbr;
                    const opp = isHome ? teamGame.away : teamGame.home;
                    const oppRank = (rankData.rankings || []).find(t => t.abbr === opp?.abbr);
                    nextOpponent = {
                        abbr: opp?.abbr, name: opp?.name, logo: opp?.logo, isHome, startTime: teamGame.startTime,
                        oppRPG: oppRank?.rpg || 4.4, oppERA: oppRank?.teamERA || 4.20, oppOVR: oppRank?.ovrScore || 50,
                        oppRank: oppRank?.ovrRank || 15, id: teamGame.id
                    };
                }
            }
        } catch (e) {}

        const aiAnalysis = generatePlayerAnalysis(playerData, isTwoWay ? (isPitcher ? pitchingStats : battingStats) : currentSeasonStats, careerStats, gameLogRes?.logs || [], playerData.statusLabel, battingStats, pitchingStats, getPlayerAccolades(playerId).narrativeText, teamGP);

        const result = {
            player: {
                ...playerData, isTwoWay, currentStats: currentSeasonStats, battingStats, pitchingStats, careerStats, careerBatting, careerPitching
            },
            aiAnalysis,
            opponent: nextOpponent,
            lastUpdated: new Date().toISOString(),
        };

        cacheSet(cacheKey, result, 60);
        return NextResponse.json(result);
    } catch (err) {
        console.error('Player route fatal error:', err);
        return NextResponse.json({ error: 'Player not found', message: err.message }, { status: 404 });
    }
}
