import { NextResponse } from 'next/server';
import { fetchPlayerStats, fetchPlayerGameLogs, fetchScoreboard } from '@/lib/espn';
import { computePlayerRating } from '@/lib/players';
import { cacheGet, cacheSet } from '@/lib/cache';
import { generatePlayerAnalysis } from '@/lib/ai';
import { getPlayerAccolades } from '@/lib/accolades';
import { computeRankings } from '@/lib/rankings';

export async function GET(request, { params }) {
    const { playerId } = await params;
    const cacheKey = `player_detail_v9_${playerId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    try {
        const [bioRes, overviewRes, currentStats, gameLogRes] = await Promise.all([
            fetchJSON(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/athletes/${playerId}`),
            fetchJSON(`https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${playerId}/overview`),
            fetchPlayerStats(playerId), 
            fetchPlayerGameLogs(playerId),
        ]);

        const bio = bioRes || {};
        const position = bio.position?.abbreviation || '';
        const isPitcher = ['SP', 'RP', 'CP', 'P'].includes(position);

        // Use SAME rating computation as top-100 list
        // If they had dual roles in roster or have dual career stats, treat as two-way
        const isOhtani = String(playerId) === '39832';
        const isRosterTwoWay = (bio.position?.abbreviation === 'SP/DH' || bio.position?.abbreviation === 'DH/SP') && isOhtani;
        const careerFromStats = currentStats?.career || { batting: {}, pitching: {} };
        const ratingData = computePlayerRating(currentStats || { batting: {}, pitching: {} }, isRosterTwoWay ? 'two-way' : (isPitcher || bio.position?.abbreviation === 'DH'), bio.position?.abbreviation, playerId, careerFromStats, bio.age);

        let isTwoWay = ratingData.type === 'two-way' || isRosterTwoWay;

        const playerData = {
            id: playerId,
            name: bio.displayName || bio.fullName || 'Unknown',
            position, isPitcher,
            jersey: bio.jersey || '',
            age: bio.age || null,
            height: bio.displayHeight || null,
            weight: bio.displayWeight || null,
            headshot: bio.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
            teamName: bio.team?.displayName || '',
            teamAbbr: bio.team?.abbreviation || '',
            teamLogoAbbr: bio.team?.abbreviation || '',
            batHand: bio.bats?.displayValue || null,
            throwHand: bio.throws?.displayValue || null,
            rating: ratingData?.rating || 40,
            statusLabel: bio.status?.type || bio.status?.name || 'Active', // IL, DFA, Active, etc.
        };

        // Parse current + career from overview
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
                const isPitchSplit = obj.ERA !== undefined || obj.innings !== undefined;
                if (isPitchSplit) careerPitching = obj;
                else careerBatting = obj;

                // Keep default careerStats for backward compat
                if (isPitcher && isPitchSplit) careerStats = obj;
                else if (!isPitcher && !isPitchSplit) careerStats = obj;
            }
        }

        const hasCriticalPitching = careerPitching.ERA !== undefined || careerPitching.earnedRunAverage !== undefined;
        const hasCriticalBatting = careerBatting.OPS !== undefined || careerBatting.ops !== undefined || careerBatting.AVG !== undefined || careerBatting.avg !== undefined;
        const needsFallback = isTwoWay ? (!hasCriticalPitching || !hasCriticalBatting) : (isPitcher ? !hasCriticalPitching : !hasCriticalBatting);

        // Fallback to official MLB Stats API for career + two-way blocks
        if (needsFallback && bio.fullName) {
            try {
                // Search for the player's true MLB ID by name
                const searchRes = await fetchJSON(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(bio.fullName)}`);
                const mlbId = searchRes?.people?.[0]?.id;

                if (mlbId) {
                    const mlbStats = await fetchJSON(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career&group=hitting,pitching`);
                    const statBlocks = mlbStats?.stats || [];

                    for (const block of statBlocks) {
                        const isPitchBlock = block.group?.displayName === 'pitching';
                        const raw = block.splits?.[0]?.stat || {};

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
                }
            } catch (fallbackErr) {
                console.error('MLB API Fallback failed:', fallbackErr);
            }
        }

        // Add computed WAR
        if (isPitcher) {
            currentSeasonStats.WAR = computeWAR(true, currentSeasonStats);
            careerStats.WAR = computeWAR(true, careerStats);
        } else {
            currentSeasonStats.WAR = computeWAR(false, currentSeasonStats);
            careerStats.WAR = computeWAR(false, careerStats);
        }

        if (Object.keys(careerBatting).length > 0 && Object.keys(careerPitching).length > 0) {
            if (String(playerId) === '39832') {
                isTwoWay = true;
            }
        }

        // Expected stats from current season
        let expectedStats = {};
        let expectedBatting = {};
        let expectedPitching = {};

        if (isTwoWay) {
            expectedPitching = computeExpected(true, pitchingStats);
            expectedBatting = computeExpected(false, battingStats);
        } else {
            expectedStats = computeExpected(isPitcher, currentSeasonStats);
        }

                // Get team games played for accurate projections
                let teamGP = 0;
                let nextOpponent = null;
                try {
                    const rankData = await computeRankings();
                    const teamAbbr = playerData.teamAbbr;
                    const teamRank = (rankData.rankings || []).find(t => t.abbr === teamAbbr);
                    if (teamRank) {
                        teamGP = teamRank.gamesPlayed || 0;
                    }
                    // Find next game for this team from scoreboard
                    const scoreboard = await fetchScoreboard();
                    if (scoreboard?.games) {
                        const teamGame = scoreboard.games.find(g => 
                            g.state === 'pre' && (
                                g.home?.abbr === teamAbbr || g.away?.abbr === teamAbbr
                            )
                        );
                        if (teamGame) {
                            const isHome = teamGame.home?.abbr === teamAbbr;
                            const opp = isHome ? teamGame.away : teamGame.home;
                            const oppRank = (rankData.rankings || []).find(t => t.abbr === opp?.abbr);
                            nextOpponent = {
                                abbr: opp?.abbr,
                                name: opp?.name,
                                logo: opp?.logo,
                                isHome,
                                startTime: teamGame.startTime,
                                oppRPG: oppRank?.rpg || 4.4,
                                oppERA: oppRank?.teamERA || 4.20,
                                oppOVR: oppRank?.ovrScore || 50,
                                oppRank: oppRank?.ovrRank || 15,
                            };
                        }
                    }
                } catch (e) { /* Rankings may fail early season */ }

                // Generate player props for the next game
                let playerProps = null;
                if (nextOpponent) {
                    playerProps = generatePlayerProps(playerData, currentSeasonStats, careerStats, battingStats, pitchingStats, nextOpponent, isPitcher, isTwoWay);
                }

                const aiAnalysis = generatePlayerAnalysis(playerData, isTwoWay ? (isPitcher ? pitchingStats : battingStats) : currentSeasonStats, careerStats, gameLogRes?.logs || [], playerData.statusLabel, battingStats, pitchingStats, getPlayerAccolades(playerId).narrativeText, teamGP);

                const result = {
            player: {
                ...playerData,
                isTwoWay,
                ratingType: ratingData.type,
                currentStats: currentSeasonStats,
                battingStats,
                pitchingStats,
                careerStats,
                careerBatting,
                careerPitching,
                expectedStats,
                expectedBatting,
                expectedPitching,
                aiAnalysis,
                teamGamesPlayed: teamGP,
                nextOpponent,
                playerProps,
            },
        };

        cacheSet(cacheKey, result, 120);
        return NextResponse.json(result);
    } catch (err) {
        console.error('Player detail error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function fetchJSON(url) {
    try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 5000);
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: c.signal });
        clearTimeout(t);
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

function computeExpected(isPitcher, s) {
    if (!s || Object.keys(s).length === 0) {
        return isPitcher ? { xERA: 0, xWHIP: 0, xK9: 0, xWAR: 0 } : { xAVG: 0, xSLG: 0, xOPS: 0, xWAR: 0 };
    }
    const g = (obj, ...keys) => { for (const k of keys) if (obj[k]) return parseFloat(obj[k]) || 0; return 0; };
    const rd = (v, d) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };

    if (isPitcher) {
        const ip = g(s, 'innings', 'IP', 'inningsPitched');
        if (ip === 0) return { xERA: 0, xWHIP: 0, xK9: 0, xWAR: 0 }; // Baseline 0 for preseason

        const era = g(s, 'ERA', 'earnedRunAverage');
        const bb = g(s, 'walks', 'BB'), hr = g(s, 'homeRuns', 'HR');
        const so = g(s, 'strikeouts', 'SO', 'K');
        const whip = g(s, 'WHIP');
        const k9 = g(s, 'K/9', 'strikeoutsPerNineInnings');
        const fip = ((13 * hr + 3 * bb - 2 * so) / ip) + 3.10;
        return {
            xERA: rd(era > 0 ? era * 0.4 + fip * 0.6 : fip, 2),
            xWHIP: rd(whip > 0 ? whip * 0.7 + 1.30 * 0.3 : 1.30, 2),
            xK9: rd(k9 > 0 ? k9 * 0.85 + 8 * 0.15 : 8, 2),
            xWAR: rd(Math.max(-1, ((4.50 - (era > 0 ? era * 0.4 + fip * 0.6 : fip)) * ip / 9) / 10), 1),
        };
    }
    const ab = g(s, 'AB', 'atBats');
    const pa = ab + g(s, 'walks', 'BB') + g(s, 'hitByPitch', 'HBP') + g(s, 'sacFlies', 'SF');
    if (ab === 0 && pa === 0) return { xAVG: 0, xSLG: 0, xOPS: 0, xWAR: 0 }; // Baseline 0 for preseason

    const avg = g(s, 'AVG', 'avg'), slg = g(s, 'SLG', 'slugAvg');
    const obp = g(s, 'OBP', 'onBasePct'), ops = g(s, 'OPS', 'ops') || (obp + slg);
    const iso = g(s, 'ISOP') || (slg - avg), gp = g(s, 'GP', 'gamesPlayed') || 1;
    const xAVG = avg > 0 ? avg * 0.75 + 0.250 * 0.25 : 0.250;
    const xSLG = (iso > 0 ? iso * 0.8 + 0.140 * 0.2 : 0.140) + xAVG;
    const xOBP = obp > 0 ? obp * 0.7 + 0.320 * 0.3 : 0.320;
    return {
        xAVG: rd(xAVG, 3), xSLG: rd(xSLG, 3), xOPS: rd(xOBP + xSLG, 3),
        xWAR: rd(Math.max(0, (((ops / 0.730 - 1) * 100) * gp / 162) / 20), 1),
    };
}

function computeWAR(isPitcher, s) {
    if (!s || Object.keys(s).length === 0) return 0;
    const g = (obj, ...keys) => { for (const k of keys) if (obj[k]) return parseFloat(obj[k]) || 0; return 0; };
    const rd = (v, d) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };

    if (isPitcher) {
        const era = g(s, 'ERA', 'earnedRunAverage');
        const ip = g(s, 'innings', 'IP', 'inningsPitched');
        if (ip === 0) return 0;

        // Cumulative WAR estimation for pitchers
        const runsSaved = ((4.50 - era) * (ip / 9)) / 10;
        const baseline = ip / 150;
        return rd(Math.max(-2, runsSaved + baseline), 1);
    }
    const obp = g(s, 'OBP', 'onBasePct');
    const slg = g(s, 'SLG', 'slugAvg');
    const ops = g(s, 'OPS', 'ops') || (obp + slg);
    const gp = g(s, 'GP', 'gamesPlayed');
    if (gp === 0) return 0;

    // Cumulative WAR estimation for batters
    const runsAboveAvg = (ops - 0.720) * 20; // Approx runs per 150 games
    const battingWAR = runsAboveAvg * (gp / 150);
    const baselineWAR = (gp / 150) * 1.5; // Replacement level baseline
    return rd(Math.max(-2, battingWAR + baselineWAR), 1);
}

/**
 * Generate per-game player prop predictions based on stats, career, and opponent
 */
function generatePlayerProps(player, currentStats, careerStats, bStats, pStats, nextOpp, isPitcher, isTwoWay) {
    const g = (obj, ...keys) => { for (const k of keys) if (obj?.[k]) return parseFloat(obj[k]) || 0; return 0; };
    const gp = g(currentStats, 'GP', 'gamesPlayed') || 1;
    const carGP = g(careerStats, 'GP', 'gamesPlayed') || 1;

    const props = [];

    if (isPitcher || isTwoWay) {
        // Pitcher props: K, IP, Runs Allowed
        const curK = g(pStats, 'strikeouts', 'SO', 'K');
        const curIP = g(pStats, 'innings', 'IP', 'inningsPitched');
        const curERA = g(pStats, 'ERA', 'earnedRunAverage');
        const carK9 = g(careerStats, 'K/9', 'strikeoutsPerNineInnings') || 8.5;
        const carERA = g(careerStats, 'ERA', 'earnedRunAverage') || 4.20;
        const kPerStart = curIP > 0 ? (curK / curIP) * 6 : carK9 * 6 / 9;
        const ipPerStart = gp > 0 ? curIP / gp : 5.5;
        
        // Opponent quality factor (weaker offense = more K, better for pitcher)
        const oppFactor = nextOpp.oppRPG > 0 ? 4.4 / nextOpp.oppRPG : 1.0;
        
        const projK = Math.max(2, Math.round((kPerStart * 0.6 + carK9 * 6 / 9 * 0.4) * Math.min(1.15, oppFactor) * 2) / 2);
        const projIP = Math.round(Math.min(8, ipPerStart * 0.7 + 5.5 * 0.3) * 2) / 2;
        const blendedERA = curERA > 0 ? curERA * 0.4 + carERA * 0.6 : carERA;
        const projRunsAllowed = Math.max(0.5, Math.round((blendedERA / 9 * projIP) / nextOpp.oppRPG * 4.4 * 2) / 2);

        // Score each prop by confidence (lower variance = higher confidence)
        const kConfidence = curIP > 10 ? 0.8 : curIP > 5 ? 0.6 : 0.4;
        const ipConfidence = gp > 2 ? 0.7 : 0.4;
        const raConfidence = curIP > 10 ? 0.65 : 0.35;

        props.push({ category: 'Strikeouts', line: projK, confidence: kConfidence, direction: projK >= 5.5 ? 'Over' : 'Under', unit: 'K' });
        props.push({ category: 'Innings Pitched', line: projIP, confidence: ipConfidence, direction: projIP >= 5.5 ? 'Over' : 'Under', unit: 'IP' });
        props.push({ category: 'Runs Allowed', line: projRunsAllowed, confidence: raConfidence, direction: projRunsAllowed <= 2.5 ? 'Under' : 'Over', unit: 'RA' });
    }

    if (!isPitcher || isTwoWay) {
        // Batter props: HR, RBI, Hits, Total Bases, Runs
        const curHR = g(bStats, 'HR', 'homeRuns');
        const curRBI = g(bStats, 'RBI', 'RBIs');
        const curH = g(bStats, 'H', 'hits');
        const curAB = g(bStats, 'AB', 'atBats') || 1;
        const curAVG = g(bStats, 'AVG', 'avg') || curH / curAB;
        const curSLG = g(bStats, 'SLG', 'slugAvg') || 0;
        const carHR = g(careerStats, 'HR', 'homeRuns');
        const carAVG = g(careerStats, 'AVG', 'avg') || 0.248;
        const carSLG = g(careerStats, 'SLG', 'slugAvg') || 0.400;
        
        const hrRate = curHR / Math.max(1, gp);
        const carHRRate = carHR / Math.max(1, carGP);
        const blendedHRRate = hrRate * 0.4 + carHRRate * 0.6;
        
        // Opponent pitching factor (worse ERA = more offense)
        const oppPitchFactor = nextOpp.oppERA > 0 ? nextOpp.oppERA / 4.20 : 1.0;
        
        const projHR = Math.round(blendedHRRate * oppPitchFactor * 10) / 10;
        const blendedAVG = curAVG > 0 ? curAVG * 0.4 + carAVG * 0.6 : carAVG;
        const projHits = Math.round(blendedAVG * 4 * oppPitchFactor * 2) / 2; // ~4 AB per game
        const blendedSLG = curSLG > 0 ? curSLG * 0.4 + carSLG * 0.6 : carSLG;
        const projTB = Math.round(blendedSLG * 4 * oppPitchFactor * 2) / 2;
        const rbiRate = curRBI / Math.max(1, gp);
        const projRBI = Math.round(rbiRate * oppPitchFactor * 2) / 2 || 0.5;

        const hrConfidence = gp > 5 ? 0.5 : 0.3; // HRs are inherently volatile
        const hitsConfidence = gp > 3 ? 0.7 : 0.45;
        const tbConfidence = gp > 3 ? 0.65 : 0.4;
        const rbiConfidence = gp > 5 ? 0.55 : 0.3;

        props.push({ category: 'Home Runs', line: projHR > 0.3 ? 0.5 : 0.5, confidence: hrConfidence, direction: projHR > 0.3 ? 'Over' : 'Under', unit: 'HR', rawRate: projHR });
        props.push({ category: 'Hits', line: projHits || 1.5, confidence: hitsConfidence, direction: projHits >= 1.5 ? 'Over' : 'Under', unit: 'H' });
        props.push({ category: 'Total Bases', line: projTB || 1.5, confidence: tbConfidence, direction: projTB >= 1.5 ? 'Over' : 'Under', unit: 'TB' });
        props.push({ category: 'RBI', line: projRBI || 0.5, confidence: rbiConfidence, direction: projRBI >= 0.8 ? 'Over' : 'Under', unit: 'RBI' });
    }

    // Sort by confidence to pick the best prop
    props.sort((a, b) => b.confidence - a.confidence);
    const bestProp = props[0] || null;

    return {
        opponent: { abbr: nextOpp.abbr, name: nextOpp.name, logo: nextOpp.logo, isHome: nextOpp.isHome, startTime: nextOpp.startTime },
        oppRank: nextOpp.oppRank,
        oppERA: nextOpp.oppERA,
        oppRPG: nextOpp.oppRPG,
        bestProp,
        allProps: props.slice(0, 4), // Top 4 props
    };
}
