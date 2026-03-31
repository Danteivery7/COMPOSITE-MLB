/**
 * Composite Ranking Engine — ENHANCED
 *
 * Sources:
 *   1) Win Percentage (from standings)
 *   2) Run Differential (from standings)
 *   3) Pythagorean Expectation (from standings)
 *   4) Team Batting Analytics (OPS, OBP, SLG, AVG, R/G, ISO, RC/27, XBH)
 *   5) Team Pitching Analytics (ERA, WHIP, K/9, opp OPS, opp OBA)
 *
 * Offense rank uses: sources 1, 2, 3, 4   (batting-weighted)
 * Defense rank uses: sources 1, 2, 3, 5   (pitching-weighted)
 * OVR rank uses:     all sources blended
 */

import { fetchStandings, fetchAllTeamStats, fetchScoreboard, fetchTeamSchedule } from './espn';
import { ALL_TEAMS } from './teams';
import { cacheGet, cacheSet, CACHE_TTL } from './cache';

/* ======================================================================
   COMPOSITE RANKING COMPUTATION
   ====================================================================== */
export async function computeRankings() {
    const cached = cacheGet('computed_rankings');
    if (cached) return cached;

    // Fetch standings + deep team stats in parallel + scoreboard for live records
    const [standingsData, teamStatsData, scoreboardData] = await Promise.all([
        fetchStandings(),
        fetchAllTeamStats(),
        fetchScoreboard(),
    ]);

    const standings = standingsData.teams || {};
    const teamStats = teamStatsData.teams || {};
    const liveGames = scoreboardData.games || [];

    // Extract live records and live run differentials from scoreboard
    const liveRecords = {};
    const liveRunDiff = {};

    // Completely silence live scoring accumulations during Spring Training
    if (!scoreboardData.isPreseason) {
        for (const g of liveGames) {
            const home = g.home;
            const away = g.away;
            if (!home || !away) continue;

            for (const c of [home, away]) {
                if (c.record) {
                    const parts = c.record.split('-');
                    if (parts.length >= 2) {
                        liveRecords[c.teamId] = {
                            wins: parseInt(parts[0], 10) || 0,
                            losses: parseInt(parts[1], 10) || 0
                        };
                    }
                }
            }

            // Capture live runs scored/allowed today to patch standings delay
            if (g.state === 'in' || g.state === 'post') {
                const homeScore = home.score || 0;
                const awayScore = away.score || 0;
                liveRunDiff[home.teamId] = { rsAdd: homeScore, raAdd: awayScore, isFinal: g.state === 'post' };
                liveRunDiff[away.teamId] = { rsAdd: awayScore, raAdd: homeScore, isFinal: g.state === 'post' };
            }
        }
    }

    // ── Build raw data for each team ────────────────────────────────────
    const teamData = ALL_TEAMS.map(t => {
        const s = standings[t.id] || {};
        const ts = teamStats[t.id] || {};
        const bat = ts.batting || {};
        const pit = ts.pitching || {};

        let wins = s.wins || pit.wins || 0;
        let losses = s.losses || pit.losses || 0;
        const lr = liveRecords[t.id];
        if (lr) {
            wins = lr.wins;
            losses = lr.losses;
        }

        let rs = s.runsScored || bat.runs || 0;
        let ra = s.runsAllowed || pit.runs || 0;

        let gp = wins + losses || bat.gamesPlayed || bat.teamGamesPlayed || 0;

        // Preseason Lockdown: Ensure no Spring Training stats leak into team algorithms
        if (scoreboardData.isPreseason) {
            wins = 0;
            losses = 0;
            rs = 0;
            ra = 0;
            gp = 0;
        }

        const winPct = gp > 0 ? wins / gp : 0;

        // Apply live runs if standings haven't caught up
        const ld = liveRunDiff[t.id];
        if (ld) {
            let applyRuns = false;
            if (!ld.isFinal) {
                applyRuns = true; // game in progress
            } else {
                const sGames = (s.wins || 0) + (s.losses || 0);
                const lGames = wins + losses;
                if (lGames > sGames) applyRuns = true; // game went final but standings lack it
            }
            if (applyRuns) {
                rs += ld.rsAdd;
                ra += ld.raAdd;
            }
        }

        const runDiff = rs - ra;
        const rpg = gp > 0 ? rs / gp : 0;
        const oppRpg = gp > 0 ? ra / gp : 0;
        const pyWinPct = scoreboardData.isPreseason ? 0 : (rs > 0 || ra > 0
            ? Math.pow(rs, 1.83) / (Math.pow(rs, 1.83) + Math.pow(ra, 1.83))
            : 0.5);
        
        // Final Season Kickoff: Fetch Last 5 games (only if not preseason)
        const last5 = [];
        if (!scoreboardData.isPreseason) {
            // This is handled by a secondary pass to keep main compute fast, 
            // but we'll prepare the field here.
        }

        const streakVal = s.streak || '-';
        let streakNum = 0;
        if (streakVal.startsWith('W')) streakNum = parseInt(streakVal.slice(1)) || 0;
        if (streakVal.startsWith('L')) streakNum = -(parseInt(streakVal.slice(1)) || 0);

        // Hottness Score Heuristic
        // (Streak * 15) + (WinPct * 50) + (RunDiff/Game * 5)
        const hotScore = (streakNum * 15) + (winPct * 50) + (runDiff / Math.max(1, gp) * 5);

        return {
            ...t,
            wins, losses, gamesPlayed: gp, winPct,
            runsScored: rs, runsAllowed: ra, runDiff,
            rpg: Math.round(rpg * 100) / 100,
            oppRpg: Math.round(oppRpg * 100) / 100,
            pyWinPct: Math.round(pyWinPct * 1000) / 1000,
            streak: streakVal,
            streakNum,
            hotScore: Math.round(hotScore * 100) / 100,
            // Advanced batting (Zeroed out during Spring Training)
            teamOPS: scoreboardData.isPreseason ? 0 : (bat.OPS || bat.ops || 0),
            teamOBP: scoreboardData.isPreseason ? 0 : (bat.onBasePct || bat.OBP || 0),
            teamSLG: scoreboardData.isPreseason ? 0 : (bat.slugAvg || bat.SLG || 0),
            teamAVG: scoreboardData.isPreseason ? 0 : (bat.avg || bat.AVG || 0),
            teamISO: scoreboardData.isPreseason ? 0 : (bat.isolatedPower || 0),
            teamRC27: scoreboardData.isPreseason ? 0 : (bat.runsCreatedPer27Outs || 0),
            teamXBH: scoreboardData.isPreseason ? 0 : (bat.extraBaseHits || 0),
            teamHR: scoreboardData.isPreseason ? 0 : (bat.homeRuns || 0),
            teamSB: scoreboardData.isPreseason ? 0 : (bat.stolenBases || 0),
            teamBBK: scoreboardData.isPreseason ? 0 : (bat.walkToStrikeoutRatio || 0),
            teamWAR_bat: scoreboardData.isPreseason ? 0 : (bat.WARBR || bat.offWARBR || 0),
            // Advanced pitching (Zeroed out during Spring Training)
            teamERA: scoreboardData.isPreseason ? 0 : (pit.ERA || pit.era || 0),
            teamWHIP: scoreboardData.isPreseason ? 0 : (pit.WHIP || pit.whip || 0),
            teamK: scoreboardData.isPreseason ? 0 : (pit.strikeouts || pit.SO || pit.K || 0),
            teamK9: scoreboardData.isPreseason ? 0 : (pit.strikeoutsPerNineInnings || 0),
            teamOppOPS: scoreboardData.isPreseason ? 0 : (pit.opponentOPS || 0),
            teamOppOBA: scoreboardData.isPreseason ? 0 : (pit.opponentAvg || 0),
            teamOppOBP: scoreboardData.isPreseason ? 0 : (pit.opponentOnBasePct || 0),
            teamOppSLG: scoreboardData.isPreseason ? 0 : (pit.opponentSlugAvg || 0),
            teamQS: scoreboardData.isPreseason ? 0 : (pit.qualityStarts || 0),
            teamSV: scoreboardData.isPreseason ? 0 : (pit.saves || 0),
            teamWAR_pit: scoreboardData.isPreseason ? 0 : (pit.WARBR || 0),
            teamPitWinPct: scoreboardData.isPreseason ? 0 : (pit.winPct || 0),
        };
    });

    // ── Define ranking sources ──────────────────────────────────────────
    const sources = [
        // Classic sources
        { id: 'win_pct', name: 'Win Percentage', key: 'winPct', weight: 15, higher: true, scope: 'both' },
        { id: 'run_diff', name: 'Run Differential', key: 'runDiff', weight: 10, higher: true, scope: 'both' },
        { id: 'pythag', name: 'Pythagorean Win%', key: 'pyWinPct', weight: 12, higher: true, scope: 'both' },
        // Offense sources
        { id: 'team_ops', name: 'Team OPS', key: 'teamOPS', weight: 10, higher: true, scope: 'offense' },
        { id: 'team_rpg', name: 'Runs Per Game', key: 'rpg', weight: 8, higher: true, scope: 'offense' },
        { id: 'team_obp', name: 'Team OBP', key: 'teamOBP', weight: 5, higher: true, scope: 'offense' },
        { id: 'team_slg', name: 'Team SLG', key: 'teamSLG', weight: 5, higher: true, scope: 'offense' },
        { id: 'team_iso', name: 'Team ISO', key: 'teamISO', weight: 3, higher: true, scope: 'offense' },
        { id: 'team_rc27', name: 'Runs Created/27', key: 'teamRC27', weight: 4, higher: true, scope: 'offense' },
        // Defense / pitching sources
        { id: 'team_era', name: 'Team ERA', key: 'teamERA', weight: 10, higher: false, scope: 'defense' },
        { id: 'team_whip', name: 'Team WHIP', key: 'teamWHIP', weight: 8, higher: false, scope: 'defense' },
        { id: 'team_k9', name: 'Strikeouts / 9 Inn', key: 'teamK9', weight: 5, higher: true, scope: 'defense' },
        { id: 'team_opp_ops', name: 'Opponent OPS', key: 'teamOppOPS', weight: 5, higher: false, scope: 'defense' },
    ];

    // ── Compute source rankings ─────────────────────────────────────────
    const sourceRankings = {};
    const activeSources = [];
    const failedSources = [];

    for (const src of sources) {
        // Check if data exists (at least one non-zero value)
        const hasData = teamData.some(t => t[src.key] !== 0);
        if (!hasData) {
            failedSources.push(src.id);
            continue;
        }
        activeSources.push(src);

        // Sort teams by this metric
        const sorted = [...teamData].sort((a, b) => {
            if (src.higher) return b[src.key] - a[src.key];
            return a[src.key] - b[src.key];
        });

        sorted.forEach((team, i) => {
            if (!sourceRankings[team.id]) sourceRankings[team.id] = {};
            sourceRankings[team.id][src.id] = {
                rank: i + 1,
                score: normalize(i + 1, 1, 30),
                value: team[src.key],
            };
        });
    }

    // ── Weighted composite scoring ──────────────────────────────────────
    const totalWeight = activeSources.reduce((s, src) => s + src.weight, 0);
    const offenseSources = activeSources.filter(s => s.scope === 'offense' || s.scope === 'both');
    const defenseSources = activeSources.filter(s => s.scope === 'defense' || s.scope === 'both');
    const offWeight = offenseSources.reduce((s, src) => s + src.weight, 0);
    const defWeight = defenseSources.reduce((s, src) => s + src.weight, 0);

    const ranked = teamData.map(t => {
        const sr = sourceRankings[t.id] || {};

        // OVR score
        let ovrScore = 0;
        for (const src of activeSources) {
            const r = sr[src.id];
            if (r) ovrScore += r.score * (src.weight / totalWeight);
        }

        // Offense score
        let offScore = 0;
        for (const src of offenseSources) {
            const r = sr[src.id];
            if (r) offScore += r.score * (src.weight / offWeight);
        }

        // Defense score
        let defScore = 0;
        for (const src of defenseSources) {
            const r = sr[src.id];
            if (r) defScore += r.score * (src.weight / defWeight);
        }

        return {
            ...t,
            ovrScore: Math.round(ovrScore * 100) / 100,
            offScore: Math.round(offScore * 100) / 100,
            defScore: Math.round(defScore * 100) / 100,
            sourceRankings: sr,
            last5: [], // Placeholder for second pass
        };
    });

    // ── Secondary Pass: Fetch Last 5 Schedules in Parallel ────────────────
    const schedulePromises = ranked.map(async (t) => {
        try {
            const sched = await fetchTeamSchedule(t.espnId);
            t.last5 = (sched.games || []).slice(-5).reverse();
        } catch (e) {
            console.error(`Failed to fetch last5 for ${t.id}:`, e.message);
        }
    });
    await Promise.all(schedulePromises);

    // ── Sort + assign ranks ─────────────────────────────────────────────
    ranked.sort((a, b) => b.ovrScore - a.ovrScore || a.runDiff - b.runDiff);
    ranked.forEach((t, i) => { t.ovrRank = i + 1; });

    const offSorted = [...ranked].sort((a, b) => b.offScore - a.offScore);
    offSorted.forEach((t, i) => { t.offRank = i + 1; });

    const defSorted = [...ranked].sort((a, b) => b.defScore - a.defScore);
    defSorted.forEach((t, i) => { t.defRank = i + 1; });

    // ── Trend from previous rankings ────────────────────────────────────
    let prev = cacheGet('prev_rankings');
    const snapshotTimestamp = cacheGet('prev_rankings_ts');
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    let takeNewSnapshot = false;

    if (prev) {
        for (const t of ranked) {
            const old = prev.find(p => p.teamId === t.id);
            t.trend = old ? old.ovrRank - t.ovrRank : 0;
        }
        
        if (!snapshotTimestamp || (Date.now() - snapshotTimestamp > TWO_HOURS)) {
            takeNewSnapshot = true;
        }
    } else {
        ranked.forEach(t => { t.trend = 0; });
        takeNewSnapshot = true;
    }

    // Only overwrite the historical snapshot every 2 hours to keep trend arrows visible for the duration of a game
    if (takeNewSnapshot) {
        cacheSet('prev_rankings', ranked.map(t => ({ teamId: t.id, ovrRank: t.ovrRank })), 7200 * 24); // Kept alive long-term
        cacheSet('prev_rankings_ts', Date.now(), 7200 * 24);
    }

    // ── Build result ────────────────────────────────────────────────────
    const result = {
        rankings: ranked,
        sources: activeSources.map(s => ({ id: s.id, name: s.name, active: true, scope: s.scope })),
        failedSources,
        lastUpdated: new Date().toISOString(),
    };

    cacheSet('computed_rankings', result, CACHE_TTL.RANKINGS);
    return result;
}

/* ── Normalize rank 1..N → 100..0 ─────────────────────────────────── */
function normalize(rank, best, worst) {
    return ((worst - rank) / (worst - best)) * 100;
}
