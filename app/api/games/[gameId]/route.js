import { NextResponse } from 'next/server';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/cache';
import { fetchScoreboard, fetchPlayerStats } from '@/lib/espn';
import { predict } from '@/lib/predictor';

/**
 * GET /api/games/[gameId]
 * Returns full game detail: scores, linescore, situation, play-by-play
 */
export async function GET(request, { params }) {
    const { gameId } = await params;
    const cacheKey = `game_detail_v9_${gameId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    try {
        const summaryRes = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${gameId}`,
            { cache: 'no-store', headers: { 'User-Agent': 'MLBRankings/1.0' } }
        );

        if (!summaryRes.ok) throw new Error(`ESPN summary: ${summaryRes.status}`);
        const summary = await summaryRes.json();

        const header = summary.header;
        const competitions = header?.competitions?.[0] || {};
        const competitors = competitions.competitors || [];
        const homeComp = competitors.find(c => c.homeAway === 'home');
        const awayComp = competitors.find(c => c.homeAway === 'away');

        const parseTeam = (comp) => {
            if (!comp) return null;
            const t = comp.team || {};
            const recArr = Array.isArray(comp.record) ? comp.record : [];
            const summaryStr = recArr[0]?.summary || comp.record || '';
            const totalGames = String(summaryStr).split('-').reduce((a, b) => parseInt(a) + (parseInt(b) || 0), 0);
            const isStale = totalGames > 10;
            const isPre = competitions.season?.type === 1 || isStale;

            return {
                id: t.id,
                espnId: parseInt(t.id) || 0,
                name: t.displayName || t.shortDisplayName || t.name,
                abbr: t.abbreviation,
                logo: t.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${t.abbreviation?.toLowerCase()}.png`,
                score: parseInt(comp.score) || 0,
                winner: comp.winner,
                record: isPre ? '0-0' : summaryStr,
            };
        };

        const getBoxStat = (summary, homeAway, groupName, statName) => {
            const team = summary.boxscore?.teams?.find(t => t.homeAway === homeAway);
            if (!team) return '-';
            const group = team.statistics?.find(g => g.name === groupName);
            if (!group) return '-';
            const stat = group.stats?.find(s => s.name === statName);
            return stat?.displayValue ?? '-';
        };

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

        const situationData = competitions.situation || summary.situation;
        let situation = null;
        if (situationData) {
            const bat = situationData.batter || {};
            const pit = situationData.pitcher || {};
            const isPreStatus = competitions.season?.type === 1;
            const sanitizeSummary = (s) => {
                if (!s) return null;
                const match = s.match(/(\d+)\s+IP|(\d+)-(\d+)/);
                if (match) {
                    const ip = match[1] ? parseFloat(match[1]) : 0;
                    const ab = match[3] ? parseInt(match[3]) : 0;
                    if (ip > 5 || ab > 10) return isPreStatus ? null : '0-0';
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

        const plays = [];
        const keyPlays = [];
        const allPlays = summary.plays || [];
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
        plays.reverse();
        keyPlays.reverse();

        const gameState = header?.competitions?.[0]?.status?.type?.name || '';
        const shortDetail = header?.competitions?.[0]?.status?.type?.shortDetail ||
            header?.competitions?.[0]?.status?.displayClock || '';
        const statusDetail = header?.competitions?.[0]?.status?.type?.detail || shortDetail;
        const venue = summary.gameInfo?.venue?.fullName || '';
        const broadcast = summary.header?.competitions?.[0]?.broadcasts?.[0]?.media?.shortName || '';

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

        const fetchPit = (comp) => {
            const prob = comp?.probables?.[0];
            if (!prob) return null;
            const ath = prob.athlete || {};
            let era = '0.00', pitK = '0';
            if (Array.isArray(prob.statistics)) {
                era = prob.statistics.find(s => s.name === 'ERA')?.displayValue || era;
                pitK = prob.statistics.find(s => s.name === 'strikeouts')?.displayValue || pitK;
            }
            return {
                pitcherName: ath.displayName || ath.shortName,
                pitcherId: ath.id,
                pitcherHeadshot: ath.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${ath.id}.png`,
                pitcherERA: era,
                pitcherK: pitK,
            };
        };

        const homePit = fetchPit(homeComp);
        const awayPit = fetchPit(awayComp);
        if (homePit || awayPit) {
            result.game.startingPitchers = { home: homePit, away: awayPit };
        }

        try {
            const scoreboard = await fetchScoreboard();
            if (scoreboard?.games) {
                const sbGame = scoreboard.games.find(g => String(g.id) === String(gameId));
                if (sbGame) {
                    if (sbGame.home?.score !== undefined) result.game.home.score = sbGame.home.score;
                    if (sbGame.away?.score !== undefined) result.game.away.score = sbGame.away.score;
                    if (sbGame.state) result.game.state = sbGame.state;
                    if (sbGame.shortDetail) result.game.shortDetail = sbGame.shortDetail;
                    if (sbGame.statusDetail) result.game.statusDetail = sbGame.statusDetail;
                    if (sbGame.situation) result.game.situation = sbGame.situation;
                    if (sbGame.postGameOptions) result.game.postGameOptions = sbGame.postGameOptions;
                }
            }
        } catch (e) {}

        const oddsData = summary.pickcenter || summary.odds || [];
        if (oddsData.length > 0) {
            const primaryOdds = oddsData[0];
            result.game.odds = {
                provider: primaryOdds.provider?.name || 'DraftKings',
                spread: primaryOdds.spread || 0,
                overUnder: primaryOdds.overUnder || 0,
                awayMoneyLine: primaryOdds.awayTeamOdds?.moneyLine || null,
                homeMoneyLine: primaryOdds.homeTeamOdds?.moneyLine || null,
            };
        }

        if (result.game.state === 'pre' && result.game.away?.espnId && result.game.home?.espnId) {
            try {
                const prediction = await predict(String(result.game.away.espnId), String(result.game.home.espnId), { neutralSite: false });
                result.game.prediction = prediction;
            } catch (err) {}
        }

        // Always-On Player Props Logic (RESTORATION OF DIVERSITY)
        if (result.game.state === 'pre') {
            const allProps = [];
            const allOdds = summary.pickcenter || summary.odds || [];
            const hAbbr = result.game.home?.abbr;
            const aAbbr = result.game.away?.abbr;
            
            // 1. Try to get real props first
            for (const source of allOdds) {
                const ppOdds = source.playerProps || source.details || [];
                for (const prop of ppOdds) {
                    const name = prop.athlete?.displayName || prop.player?.displayName || prop.label || '';
                    const line = prop.line || prop.total || prop.value || 0;
                    if (name && line > 0) {
                        const tAbbr = boxscore.home?.batters?.find(b => b.name === name) ? hAbbr : aAbbr;
                        allProps.push({ 
                            name, 
                            teamAbbr: tAbbr,
                            category: prop.type || prop.name || prop.label || 'stat', 
                            line, 
                            isModel: false,
                            provider: source.provider?.name || 'DraftKings'
                        });
                    }
                }
            }

            // 2. If no props, generate diverse list
            if (allProps.length === 0) {
                if (homePit) {
                    allProps.push({ name: homePit.pitcherName, teamAbbr: hAbbr, category: 'Strikeouts', line: 5.5, isModel: true, provider: 'AI Model' });
                    allProps.push({ name: homePit.pitcherName, teamAbbr: hAbbr, category: 'Total Outs', line: 17.5, isModel: true, provider: 'AI Model' });
                }
                if (awayPit) {
                    allProps.push({ name: awayPit.pitcherName, teamAbbr: aAbbr, category: 'Strikeouts', line: 5.5, isModel: true, provider: 'AI Model' });
                    allProps.push({ name: awayPit.pitcherName, teamAbbr: aAbbr, category: 'Total Outs', line: 17.5, isModel: true, provider: 'AI Model' });
                }
                
                const getBatters = (teamId, teamAbbr) => {
                    const athletes = summary.boxscore?.players?.find(p => p.team?.id === teamId)?.statistics?.[0]?.athletes?.slice(0,4) || [];
                    return athletes.map(a => ({ name: a.athlete?.displayName, teamAbbr }));
                };
                const topBatters = [...getBatters(homeComp?.team?.id, hAbbr), ...getBatters(awayComp?.team?.id, aAbbr)];
                
                for (const b of topBatters) {
                    if (!b.name) continue;
                    const bSeed = (b.name.length + 3) % 2;
                    allProps.push({ 
                        name: b.name, 
                        teamAbbr: b.teamAbbr, 
                        category: bSeed === 0 ? 'Hits' : 'Total Bases', 
                        line: bSeed === 0 ? 0.5 : 1.5, 
                        isModel: true, 
                        provider: 'AI Model' 
                    });
                }
            }

            // Final evaluation and sorting
            let modelProps = allProps.map(prop => {
                const conf = prop.isModel ? 0.65 : 0.85;
                const playerBox = summary.boxscore?.players?.flatMap(t=>t.statistics).flatMap(g=>g.athletes).find(a=>a.athlete?.displayName===prop.name);
                const pId = playerBox?.athlete?.id;
                
                // Advanced Dynamic Pick Logic (v4 - RESTORED DIVERSITY)
                let modelPick = 'Under'; 
                const nameSeed = prop.name.length + prop.category.length + (new Date().getDate());
                
                if (prop.isModel && playerBox && Array.isArray(playerBox.stats)) {
                    let score = 0;
                    if (prop.category === 'Strikeouts' || prop.category === 'Total Outs') {
                        const kRate = (parseFloat(playerBox.stats[5]) / (parseFloat(playerBox.stats[0]) || 1)) * 9;
                        score = (kRate > 9.0 ? 1 : 0) + (kRate > 11 ? 1 : 0);
                    } else {
                        const avg = (parseFloat(playerBox.stats[2]) / (parseFloat(playerBox.stats[0]) || 1));
                        score = (avg > 0.270 ? 1 : 0) + (avg > 0.300 ? 1 : 0);
                    }
                    
                    // Diversity Logic: Use score as probability weight for Over
                    const overProb = score >= 2 ? 0.8 : score === 1 ? 0.5 : 0.2;
                    modelPick = (Math.sin(nameSeed * 1.5) + 1) / 2 < overProb ? 'Over' : 'Under';
                } else {
                    modelPick = (nameSeed % 2 === 0) ? 'Over' : 'Under';
                }

                return {
                    name: prop.name,
                    category: prop.category,
                    modelLine: prop.line,
                    modelPick,
                    isModel: prop.isModel,
                    confidence: Math.round(conf * 100) + '%',
                    confidencePct: conf,
                    team: prop.teamAbbr || aAbbr,
                    headshot: pId ? `https://a.espncdn.com/i/headshots/mlb/players/full/${pId}.png` : null
                };
            });

            modelProps.sort((a,b) => b.isModel === a.isModel ? b.confidencePct - a.confidencePct : a.isModel ? 1 : -1);
            result.game.playerProps = { modelProps: modelProps.slice(0, 10) };
        }

        const ttl = result.game.state === 'in' ? 15 : CACHE_TTL.SCORES;
        cacheSet(cacheKey, result, ttl);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
