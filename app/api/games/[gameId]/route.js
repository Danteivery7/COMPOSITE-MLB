import { NextResponse } from 'next/server';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/cache';
import { fetchScoreboard } from '@/lib/espn';
import { predict } from '@/lib/predictor';

/**
 * GET /api/games/[gameId]
 * Returns full game detail: scores, linescore, situation, play-by-play
 */
export async function GET(request, { params }) {
    const { gameId } = await params;
    const cacheKey = `game_detail_${gameId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    try {
        // Fetch game summary from ESPN
        const summaryRes = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${gameId}`,
            { cache: 'no-store', headers: { 'User-Agent': 'MLBRankings/1.0' } }
        );

        if (!summaryRes.ok) throw new Error(`ESPN summary: ${summaryRes.status}`);
        const summary = await summaryRes.json();

        const header = summary.header;
        const competitions = header?.competitions?.[0] || {};
        const competitors = competitions.competitors || [];

        // Parse teams
        const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
        const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];

        const parseTeam = (comp) => {
            if (!comp) return null;
            const t = comp.team || {};
            const recArr = Array.isArray(comp.record) ? comp.record : [];
            const summary = recArr[0]?.summary || comp.record || '';
            
            // Opening Day Sync: If record shows > 10 games, it's stale Spring Training data.
            const totalGames = summary.split('-').reduce((a, b) => parseInt(a) + parseInt(b), 0);
            const isStale = totalGames > 10;
            const isPre = competitions.season?.type === 1 || isStale;

            return {
                name: t.displayName || t.shortDisplayName || t.name,
                abbr: t.abbreviation,
                logo: t.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${t.abbreviation?.toLowerCase()}.png`,
                score: parseInt(comp.score) || 0,
                winner: comp.winner,
                record: isPre ? '0-0' : summary,
            };
        };

        // Parse linescore
        let linescore = null;
        const linescoreData = summary.header?.competitions?.[0]?.competitors;
        if (linescoreData) {
            const homeLs = linescoreData.find(c => c.homeAway === 'home')?.linescores || [];
            const awayLs = linescoreData.find(c => c.homeAway === 'away')?.linescores || [];
            const maxInnings = Math.max(homeLs.length, awayLs.length);
            if (maxInnings > 0) {
                linescore = {
                    innings: Array.from({ length: maxInnings }, (_, i) => ({
                        home: homeLs[i]?.displayValue ?? '-',
                        away: awayLs[i]?.displayValue ?? '-',
                    })),
                    homeHits: getBoxStat(summary, 'home', 'batting', 'hits'),
                    awayHits: getBoxStat(summary, 'away', 'batting', 'hits'),
                    homeErrors: getBoxStat(summary, 'home', 'fielding', 'errors'),
                    awayErrors: getBoxStat(summary, 'away', 'fielding', 'errors'),
                };
            }
        }

        // Parse situation with batter/pitcher game stats
        const situationData = competitions.situation || summary.situation;
        let situation = null;
        if (situationData) {
            const bat = situationData.batter || {};
            const pit = situationData.pitcher || {};
            
            const isPreStatus = competitions.season?.type === 1;
            
            // Heuristic for player summaries: if they contain > 10 AB or > 5 IP in the summary string, it's season stats.
            // On Opening Day (season type 2), if the player hasn't played today, we should hide these.
            const sanitizeSummary = (s) => {
                if (!s) return null;
                const match = s.match(/(\d+)\s+IP|(\d+)-(\d+)/);
                if (match) {
                    const ip = match[1] ? parseFloat(match[1]) : 0;
                    const ab = match[3] ? parseInt(match[3]) : 0;
                    if (ip > 5 || ab > 10) return isPreStatus ? null : '0-0'; // Force reset
                }
                return s;
            };

            situation = {
                onFirst: situationData.onFirst || false,
                onSecond: situationData.onSecond || false,
                onThird: situationData.onThird || false,
                outs: situationData.outs || 0,
                balls: situationData.balls || 0,
                strikes: situationData.strikes || 0,
                batter: bat.athlete?.displayName || null,
                batterId: bat.athlete?.id || null,
                batterSummary: sanitizeSummary(bat.summary),
                pitcher: pit.athlete?.displayName || null,
                pitcherId: pit.athlete?.id || null,
                pitcherSummary: sanitizeSummary(pit.summary),
                pitchCount: pit.pitchCount || null,
                pitcherERA: pit.era || null,
                pitcherK: pit.strikeouts || null,
            };
        }

        // Parse play-by-play — only meaningful events
        const plays = [];
        const keyPlays = [];
        const allPlays = summary.plays || [];
        const meaningfulTypes = new Set([
            'Play Result', 'Home Run', 'Triple', 'Double', 'Single',
            'Walk', 'Hit By Pitch', 'Stolen Base', 'Error', 'Wild Pitch',
        ]);

        for (const play of allPlays) {
            const typeText = play.type?.text || '';
            const text = play.text || play.shortText || '';
            if (!text || typeText !== 'Play Result') continue;

            const period = play.period?.number || 0;
            const inning = play.period?.displayValue || `Inning ${period}`;
            const entry = { inning, text, isScoring: play.scoringPlay || false };
            plays.push(entry);
            if (play.scoringPlay) keyPlays.push(entry);
        }
        plays.reverse(); // most recent first
        keyPlays.reverse();

        // Game metadata
        const gameState = header?.competitions?.[0]?.status?.type?.name || '';
        const shortDetail = header?.competitions?.[0]?.status?.type?.shortDetail ||
            header?.competitions?.[0]?.status?.displayClock || '';
        const statusDetail = header?.competitions?.[0]?.status?.type?.detail || shortDetail;
        const venue = summary.gameInfo?.venue?.fullName || '';
        const broadcast = summary.header?.competitions?.[0]?.broadcasts?.[0]?.media?.shortName || '';

        // Parse Player Boxscores
        const parseBoxscoreTeam = (teamId) => {
            const teamData = summary.boxscore?.players?.find(p => p.team?.id === teamId);
            if (!teamData || !teamData.statistics) return { batters: [], pitchers: [], labels: { batting: [], pitching: [] } };
            
            const batters = [];
            const pitchers = [];
            const labels = { batting: [], pitching: [] };

            for (const group of teamData.statistics) {
                const isBatting = group.type === 'batting';
                const isPitching = group.type === 'pitching';
                if (!isBatting && !isPitching) continue;

                if (isBatting) labels.batting = group.labels || [];
                if (isPitching) labels.pitching = group.labels || [];

                for (const athlete of group.athletes || []) {
                    const mapped = {
                        id: athlete.athlete?.id,
                        name: athlete.athlete?.displayName || athlete.athlete?.shortName,
                        position: athlete.athlete?.position?.abbreviation,
                        starter: athlete.starter,
                        batOrder: athlete.batOrder,
                        stats: athlete.stats || [],
                    };
                    if (isBatting) batters.push(mapped);
                    if (isPitching) pitchers.push(mapped);
                }
            }
            return { batters, pitchers, labels };
        };

        const boxscore = {
            home: parseBoxscoreTeam(homeComp?.team?.id),
            away: parseBoxscoreTeam(awayComp?.team?.id)
        };

        const result = {
            game: {
                id: gameId,
                state: gameState.includes('PROGRESS') || gameState === 'in' ? 'in' :
                    gameState.includes('FINAL') || gameState === 'post' ? 'post' : 'pre',
                home: parseTeam(homeComp),
                away: parseTeam(awayComp),
                linescore,
                situation,
                shortDetail,
                statusDetail,
                venue,
                broadcast,
                startTime: header?.competitions?.[0]?.date,
                period: header?.competitions?.[0]?.status?.period,
            },
            plays,
            keyPlays,
            boxscore,
            lastUpdated: new Date().toISOString(),
        };

        // OVERWRITE WITH LIVE SCOREBOARD DATA FOR PERFECT SYNC
        try {
            const scoreboard = await fetchScoreboard();
            if (scoreboard && scoreboard.games) {
                const sbGame = scoreboard.games.find(g => String(g.id) === String(gameId));
                if (sbGame) {
                    if (sbGame.home && sbGame.home.score !== undefined) result.game.home.score = sbGame.home.score;
                    if (sbGame.away && sbGame.away.score !== undefined) result.game.away.score = sbGame.away.score;
                    if (sbGame.state) result.game.state = sbGame.state;
                    if (sbGame.shortDetail) result.game.shortDetail = sbGame.shortDetail;
                    if (sbGame.statusDetail) result.game.statusDetail = sbGame.statusDetail;
                    if (sbGame.situation) {
                        result.game.situation = sbGame.situation;
                        
                        // Cross-reference pitcher/batter with boxscore for rich matchup stats
                        if (result.game.situation.pitcher && boxscore) {
                            const pName = result.game.situation.pitcher;
                            const pStats = boxscore.home?.pitchers?.find(p => p.name === pName) || 
                                           boxscore.away?.pitchers?.find(p => p.name === pName);
                            if (pStats && pStats.stats) {
                                const labels = boxscore.home?.labels?.pitching || boxscore.away?.labels?.pitching || [];
                                const getStat = (label) => pStats.stats[labels.indexOf(label)];
                                result.game.situation.pitcherERA = getStat('ERA');
                                result.game.situation.pitcherK = getStat('K');
                                const pcst = getStat('PC-ST');
                                if (pcst) {
                                    const parts = pcst.split('-');
                                    result.game.situation.pitchCount = parts[0];
                                    if (parts.length > 1) {
                                        result.game.situation.strikeCount = parts[1];
                                    }
                                }
                            }
                        }

                        if (result.game.situation.batter && boxscore) {
                            const bName = result.game.situation.batter;
                            const bStats = boxscore.home?.batters?.find(b => b.name === bName) ||
                                           boxscore.away?.batters?.find(b => b.name === bName);
                            if (bStats && bStats.stats) {
                                const labels = boxscore.home?.labels?.batting || boxscore.away?.labels?.batting || [];
                                const h = bStats.stats[labels.indexOf('H')] ?? '0';
                                const ab = bStats.stats[labels.indexOf('AB')] ?? '0';
                                result.game.situation.batterSummary = `${h}-${ab}`;
                            }
                        }
                    }
                    if (sbGame.postGameOptions) {
                        result.game.postGameOptions = sbGame.postGameOptions;
                    }
                }
            }
        } catch (e) {
            console.error('Scoreboard sync error:', e);
        }

        // If the game hasn't started, run a live Monte Carlo Prediction
        if (result.game.state === 'pre' && result.game.away?.id && result.game.home?.id) {
            try {
                // Ensure IDs match ranking IDs, neutralSite false by default
                const prediction = await predict(String(result.game.away.id), String(result.game.home.id), { neutralSite: false });
                result.game.prediction = prediction;
            } catch (err) {
                console.error('API pre-game prediction error:', err.message);
            }
        }

        // Short cache for live, longer for final
        const ttl = result.game.state === 'in' ? 15 : CACHE_TTL.SCORES;
        cacheSet(cacheKey, result, ttl);

        return NextResponse.json(result);
    } catch (err) {
        console.error('Game detail error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

function getBoxStat(summary, homeAway, groupName, statName) {
    const team = summary.boxscore?.teams?.find(t => t.homeAway === homeAway);
    if (!team) return '-';
    const group = team.statistics?.find(g => g.name === groupName);
    if (!group) return '-';
    const stat = group.stats?.find(s => s.name === statName);
    return stat?.displayValue ?? '-';
}
