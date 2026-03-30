import { NextResponse } from 'next/server';
import { fetchPlayerStats, fetchPlayerGameLogs } from '@/lib/espn';
import { computePlayerRating } from '@/lib/players';
import { cacheGet, cacheSet } from '@/lib/cache';
import { generatePlayerAnalysis } from '@/lib/ai';

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

        const result = {
            player: {
                ...playerData,
                isTwoWay,
                ratingType: ratingData.type,
                currentStats: currentSeasonStats, // compat
                battingStats,
                pitchingStats,
                careerStats, // compat
                careerBatting,
                careerPitching,
                expectedStats,
                expectedBatting,
                expectedPitching,
                aiAnalysis: generatePlayerAnalysis(playerData, isTwoWay ? (isPitcher ? pitchingStats : battingStats) : currentSeasonStats, careerStats, gameLogRes?.logs || [], playerData.statusLabel, battingStats, pitchingStats),
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
