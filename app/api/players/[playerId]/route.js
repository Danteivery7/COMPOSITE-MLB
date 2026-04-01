import { NextResponse } from 'next/server';
import { fetchPlayerStats, fetchPlayerGameLogs, fetchScoreboard } from '@/lib/espn';
import { computePlayerRating } from '@/lib/players';
import { cacheGet, cacheSet } from '@/lib/cache';
import { generatePlayerAnalysis } from '@/lib/ai';
import { getPlayerAccolades } from '@/lib/accolades';
import { getTeamByEspnId } from '@/lib/teams';
import { computeRankings } from '@/lib/rankings';

export async function GET(request, { params }) {
    const { playerId } = await params;
    const cacheKey = `player_detail_v19_${playerId}`;
    const cached = cacheGet(cacheKey);
    // Robust JSON fetcher to prevent 404s from killing the page
    const fetchJSON = async (url) => {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'MLBRankings/1.0' }, next: { revalidate: 60 } });
            return res.ok ? await res.json() : null;
        } catch (e) { return null; }
    };

    try {
        const [bioRes, overviewRes, currentStats, gameLogRes] = await Promise.all([
            fetchJSON(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/athletes/${playerId}`),
            fetchJSON(`https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${playerId}/overview`),
            fetchPlayerStats(playerId).catch(() => null), 
            fetchPlayerGameLogs(playerId).catch(() => ({ logs: [] })),
        ]);

        if (!bioRes) throw new Error("Critical BIOS data missing");

        const bio = bioRes || {};
        const position = bio.position?.abbreviation || '';
        const isPitcher = ['SP', 'RP', 'CP', 'P'].includes(position);

        const isOhtani = String(playerId) === '39832';
        const isRosterTwoWay = (bio.position?.abbreviation === 'SP/DH' || bio.position?.abbreviation === 'DH/SP') && isOhtani;
        const careerFromStats = currentStats?.career || { batting: {}, pitching: {} };
        const ratingData = computePlayerRating(currentStats || { batting: {}, pitching: {} }, isRosterTwoWay ? 'two-way' : (isPitcher || bio.position?.abbreviation === 'DH'), bio.position?.abbreviation, playerId, careerFromStats, bio.age);

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
                const isPitchSplit = obj.ERA !== undefined || obj.innings !== undefined;
                if (isPitchSplit) careerPitching = obj;
                else careerBatting = obj;

                if (isPitcher && isPitchSplit) careerStats = obj;
                else if (!isPitcher && !isPitchSplit) careerStats = obj;
            }
        }

        const hasCriticalPitching = careerPitching.ERA !== undefined || careerPitching.earnedRunAverage !== undefined;
        const hasCriticalBatting = careerBatting.OPS !== undefined || careerBatting.ops !== undefined || careerBatting.AVG !== undefined || careerBatting.avg !== undefined;
        const needsFallback = isTwoWay ? (!hasCriticalPitching || !hasCriticalBatting) : (isPitcher ? !hasCriticalPitching : !hasCriticalBatting);

        if (needsFallback && bio.fullName) {
            try {
                const searchRes = await fetchJSON(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(bio.fullName)}`);
                const mlbId = searchRes?.people?.[0]?.id;

                if (mlbId) {
                    const mlbStats = await fetchJSON(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career,season&group=hitting,pitching`);
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

        let expectedStats = {};
        let expectedBatting = {};
        let expectedPitching = {};

        if (isTwoWay) {
            expectedPitching = computeExpected(true, pitchingStats);
            expectedBatting = computeExpected(false, battingStats);
        } else {
            expectedStats = computeExpected(isPitcher, currentSeasonStats);
        }

        let teamGP = 0;
        let nextOpponent = null;
        try {
            const rankData = await computeRankings();
            const teamAbbr = playerData.teamAbbr;
            const teamRank = (rankData.rankings || []).find(t => t.abbr === teamAbbr);
            if (teamRank) {
                teamGP = teamRank.gamesPlayed || 0;
            }
            const scoreboard = await fetchScoreboard();
            if (scoreboard?.games) {
                const teamGame = scoreboard.games.find(g => 
                    g.home?.abbr === teamAbbr || g.away?.abbr === teamAbbr
                );
                if (teamGame) {
                    const isHome = teamGame.home?.abbr === teamAbbr;
                    const thisTeam = isHome ? teamGame.home : teamGame.away;
                    
                    if (thisTeam?.record && thisTeam.record !== '0-0') {
                        const parts = thisTeam.record.split('-');
                        if (parts.length === 2) {
                            const recordGP = parseInt(parts[0]) + parseInt(parts[1]);
                            if (!isNaN(recordGP) && recordGP > teamGP) teamGP = recordGP;
                        }
                    }

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
                        id: teamGame.id
                    };
                }
            }
        } catch (e) { /* Rankings may fail early season */ }

        let playerProps = null;
        let lineupStatus = 'unknown';
        if (nextOpponent) {
            let gameSummary = null;
            try {
                if (nextOpponent.id) {
                    gameSummary = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${nextOpponent.id}`);
                    const rosters = gameSummary?.rosters || gameSummary?.boxscore?.players || [];
                    const allAthletes = rosters.flatMap(r => 
                        (r.roster || r.statistics || []).flatMap(s => 
                            (s.athletes || []).map(a => String(a.athlete?.id || a.id || ''))
                        )
                    );
                    if (allAthletes.length > 0) {
                        lineupStatus = allAthletes.includes(String(playerId)) ? 'in-lineup' : 'not-in-lineup';
                    }
                    const scoreboard = await fetchScoreboard();
                    const teamGame = (scoreboard?.games || []).find(g => g.id === nextOpponent.id);
                    if (teamGame && (teamGame.state === 'in' || teamGame.state === 'post')) {
                        lineupStatus = 'game-active';
                    }
                }
            } catch (e) { /* Lineup check failed */ }

            playerProps = generatePlayerProps(playerData, currentSeasonStats, careerStats, battingStats, pitchingStats, nextOpponent, isPitcher, isTwoWay, gameSummary);
            if (playerProps) {
                playerProps.lineupStatus = lineupStatus;
            }
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
        if (ip === 0) return { xERA: 0, xWHIP: 0, xK9: 0, xWAR: 0 };
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
    if (ab === 0 && pa === 0) return { xAVG: 0, xSLG: 0, xOPS: 0, xWAR: 0 };
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
        const runsSaved = ((4.50 - era) * (ip / 9)) / 10;
        const baseline = ip / 150;
        return rd(Math.max(-2, runsSaved + baseline), 1);
    }
    const obp = g(s, 'OBP', 'onBasePct');
    const slg = g(s, 'SLG', 'slugAvg');
    const ops = g(s, 'OPS', 'ops') || (obp + slg);
    const gp = g(s, 'GP', 'gamesPlayed');
    if (gp === 0) return 0;
    const runsAboveAvg = (ops - 0.720) * 20;
    const battingWAR = runsAboveAvg * (gp / 150);
    const baselineWAR = (gp / 150) * 1.5;
    return rd(Math.max(-2, battingWAR + baselineWAR), 1);
}

function generatePlayerProps(player, currentStats, careerStats, bStats, pStats, nextOpp, isPitcher, isTwoWay, gameSummary = null) {
    const g = (obj, ...keys) => { for (const k of keys) if (obj?.[k]) return parseFloat(obj[k]) || 0; return 0; };
    const gp = g(currentStats, 'GP', 'gamesPlayed') || 1;
    const carGP = g(careerStats, 'GP', 'gamesPlayed') || 1;

    let projK = 0, projIP = 0, projRunsAllowed = 0;
    let projHR = 0, projHits = 0, projTB = 0, projRBI = 0;
    let kConfidence = 0, ipConfidence = 0, raConfidence = 0;
    let hrConfidence = 0, hitsConfidence = 0, tbConfidence = 0, rbiConfidence = 0;

    const props = [];

    if (isPitcher || isTwoWay) {
        const curK = g(pStats, 'strikeouts', 'SO', 'K');
        const curIP = g(pStats, 'innings', 'IP', 'inningsPitched');
        const curERA = g(pStats, 'ERA', 'earnedRunAverage');
        const carK9 = g(careerStats, 'K/9', 'strikeoutsPerNineInnings') || 8.5;
        const carERA = g(careerStats, 'ERA', 'earnedRunAverage') || 4.20;
        const pGP = g(pStats, 'gamesPlayed', 'GP', 'G');
        const carPGP = g(careerStats, 'gamesPlayed', 'GP', 'G');
        const isStarter = (g(careerStats, 'gamesStarted', 'GS') / Math.max(1, carPGP)) > 0.5 || (carPGP > 0 && (g(careerStats, 'IP', 'inningsPitched') / carPGP) >= 4.0);
        const defaultIP = isStarter ? 5.5 : 1.0;
        const defaultK = isStarter ? (carK9 * defaultIP / 9) : (carK9 * defaultIP / 9);
        const ipPerApp = pGP > 0 ? curIP / pGP : defaultIP;
        const kPerApp = pGP > 0 ? (curK / pGP) : defaultK;
        const oppFactor = nextOpp.oppRPG > 0 ? 4.4 / nextOpp.oppRPG : 1.0;
        const blendedK = pGP > 0 ? (kPerApp * 0.6 + defaultK * 0.4) : defaultK;
        const blendedIP = pGP > 0 ? (ipPerApp * 0.7 + defaultIP * 0.3) : defaultIP;

        projK = Math.max(0.5, Math.round(blendedK * Math.min(1.2, oppFactor) * 2) / 2);
        projIP = Math.max(0.5, Math.round(Math.min(8.0, blendedIP) * 2) / 2);
        const maxSaneKs = Math.max(1.5, Math.round(projIP * 1.5 * 2) / 2);
        if (projK > maxSaneKs) projK = maxSaneKs;
        const blendedERA = curERA > 0 ? curERA * 0.4 + carERA * 0.6 : carERA;
        projRunsAllowed = Math.max(0.5, Math.round((blendedERA / 9 * projIP) / nextOpp.oppRPG * 4.4 * 2) / 2);

        kConfidence = curIP > 10 ? 0.8 : curIP > 5 ? 0.6 : 0.4;
        
        // --- Advanced Dynamic Pick Logic (v3) ---
        // Expose a score logic even before aiAnalysis is returned
        const pScore = (curKRate > carKRate ? 1 : 0) + (projK >= 6.5 ? 1 : 0) + (curIP / Math.max(1, pGP) > 5.5 ? 1 : 0);
        let kPick = 'Under';
        if (pScore >= 2) kPick = 'Over';
        else if (pScore === 0) kPick = 'Under';
        else kPick = (player.name.length % 2 === 0) ? 'Over' : 'Under'; // Deterministic mix
        
        props.push({ category: 'Strikeouts', line: projK, confidence: kConfidence, direction: kPick, unit: 'K', isModel: true });
    }

    if (!isPitcher || isTwoWay) {
        const curHR = g(bStats, 'HR', 'homeRuns');
        const curRBI = g(bStats, 'RBI', 'RBIs');
        const curH = g(bStats, 'H', 'hits');
        const curAB = g(bStats, 'AB', 'atBats') || 1;
        const curAVG = g(bStats, 'AVG', 'avg') || curH / curAB;
        const curSLG = g(bStats, 'SLG', 'slugAvg') || 0;
        const carHR = g(careerStats, 'HR', 'homeRuns');
        const carAVG = g(careerStats, 'AVG', 'avg') || 0.248;
        const carSLG = g(careerStats, 'SLG', 'slugAvg') || 0.400;
        
        const blendedHRRate = (curHR / Math.max(1, gp)) * 0.4 + (carHR / Math.max(1, carGP)) * 0.6;
        const oppPitchFactor = nextOpp.oppERA > 0 ? nextOpp.oppERA / 4.20 : 1.0;
        projHR = Math.round(blendedHRRate * oppPitchFactor * 10) / 10;
        projHits = Math.round((curAVG * 0.4 + carAVG * 0.6) * 4 * oppPitchFactor * 2) / 2;
        projTB = Math.round((curSLG * 0.4 + carSLG * 0.6) * 4 * oppPitchFactor * 2) / 2;
        projRBI = Math.round((curRBI / Math.max(1, gp)) * oppPitchFactor * 2) / 2 || 0.5;

        hrConfidence = gp > 5 ? 0.5 : 0.3;
        hitsConfidence = gp > 3 ? 0.7 : 0.45;
        tbConfidence = gp > 3 ? 0.65 : 0.4;
        rbiConfidence = gp > 5 ? 0.55 : 0.3;

        // Dynamic Pick Logic for Batters: Tied to 5-point consensus principle
        const bScore = (curAVG > carAVG ? 1 : 0) + (curSLG > carSLG ? 1 : 0) + (projHR > 0.2 ? 1 : 0);
        
        const getPick = (score, seed) => {
            if (score >= 2) return 'Over';
            if (score === 0) return 'Under';
            return (seed % 2 === 0) ? 'Over' : 'Under';
        };

        props.push({ category: 'Home Runs', line: 0.5, confidence: hrConfidence, direction: getPick(bScore, player.name.length), unit: 'HR', isModel: true });
        props.push({ category: 'Hits', line: projHits || 1.5, confidence: hitsConfidence, direction: getPick(bScore, player.name.length + 1), unit: 'H', isModel: true });
        props.push({ category: 'Total Bases', line: projTB || 1.5, confidence: tbConfidence, direction: getPick(bScore, player.name.length + 2), unit: 'TB', isModel: true });
        props.push({ category: 'RBI', line: projRBI || 0.5, confidence: rbiConfidence, direction: getPick(bScore, player.name.length + 3), unit: 'RBI', isModel: true });
    }

    let mergedProps = [...props];
    if (gameSummary) {
        const allOdds = gameSummary.pickcenter || gameSummary.odds || [];
        const realProps = [];
        for (const source of allOdds) {
            const ppOdds = source.playerProps || source.details || [];
            for (const prop of ppOdds) {
                const pName = prop.athlete?.displayName || prop.player?.displayName || prop.label || '';
                if (pName.toLowerCase() === player.name.toLowerCase() || player.name.toLowerCase().includes(pName.toLowerCase())) {
                    const line = prop.line || prop.total || prop.value || 0;
                    if (line > 0) {
                        realProps.push({ 
                            category: prop.type || prop.name || prop.label || 'stat', 
                            line, 
                            overOdds: prop.overOdds || prop.overUnderOdds?.over || null, 
                            underOdds: prop.underOdds || prop.overUnderOdds?.under || null, 
                            provider: source.provider?.name || 'DraftKings' 
                        });
                    }
                }
            }
        }
        if (realProps.length > 0) {
            mergedProps = realProps.map(rp => {
                let modelPick = 'Over', conf = 0.5, mappedModelLine = 0, finalUnit = '';
                if (rp.category?.includes('Strikeout')) { mappedModelLine = projK; finalUnit = 'K'; modelPick = mappedModelLine >= rp.line ? 'Over' : 'Under'; conf = kConfidence + Math.abs(rp.line - mappedModelLine) * 0.1; }
                else if (rp.category?.includes('Outs')) { mappedModelLine = Math.floor(projIP) * 3 + (projIP % 1) * 3; finalUnit = 'Outs'; modelPick = mappedModelLine >= rp.line ? 'Over' : 'Under'; conf = ipConfidence + Math.abs(rp.line - mappedModelLine) * 0.08; }
                else if (rp.category?.includes('Hits')) { mappedModelLine = projHits; finalUnit = 'H'; modelPick = mappedModelLine > rp.line ? 'Over' : 'Under'; conf = hitsConfidence + Math.abs(rp.line - mappedModelLine) * 0.15; }
                else { modelPick = Math.random() > 0.5 ? 'Over' : 'Under'; conf = 0.5; finalUnit = 'O/U'; }
                return { ...rp, confidence: Math.min(0.99, conf), direction: modelPick, unit: finalUnit, isModel: false };
            });
        }
    }

    mergedProps.sort((a, b) => b.confidence - a.confidence);
    return {
        opponent: { abbr: nextOpp.abbr, name: nextOpp.name, logo: nextOpp.logo, isHome: nextOpp.isHome, startTime: nextOpp.startTime },
        oppRank: nextOpp.oppRank,
        oppERA: nextOpp.oppERA,
        oppRPG: nextOpp.oppRPG,
        bestProp: mergedProps[0] || null,
        allProps: mergedProps.slice(0, 4),
    };
}
