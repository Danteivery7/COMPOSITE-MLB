/**
 * ESPN MLB API client — expanded with team stats, rosters, schedules, player stats
 * Uses ESPN's public site API (no auth required)
 * Build Sync: 2026-03-26T14:21:00Z
 */

import { cacheGet, cacheSet, CACHE_TTL } from './cache';
import { getTeamByEspnId, ALL_TEAMS } from './teams';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';
const ESPN_WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb';

/* ======================================================================
   SCOREBOARD
   ====================================================================== */
export async function fetchScoreboard() {
    const cached = cacheGet('espn_scoreboard');
    if (cached) return cached;

    try {
        const now = new Date();
        const currentHour = now.getHours();
        
        // ESPN date format: YYYYMMDD
        const formatDate = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
        };
        
        const todayStr = formatDate(now);
        let url = `${ESPN_BASE}/scoreboard`;
        
        // If it's past 10 AM, we want to ensure we're looking at today's slate,
        // even if ESPN's default "current" day hasn't flipped yet.
        if (currentHour >= 10) {
            url += `?dates=${todayStr}`;
        }

        const res = await fetch(url, {
            cache: 'no-store',
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN scoreboard: ${res.status}`);
        const data = await res.json();

        const isPreseason = data.leagues?.[0]?.season?.type?.type === 1;

        // Map base games
        let mappedGames = (data.events || []).map(event => {
            const competition = event.competitions?.[0];
            const status = competition?.status;
            const situation = competition?.situation;

            const competitors = (competition?.competitors || []).map(c => {
                const team = getTeamByEspnId(parseInt(c.team?.id));
                return {
                    teamId: team?.id || c.team?.abbreviation?.toLowerCase(),
                    espnId: parseInt(c.team?.id),
                    name: c.team?.displayName || c.team?.name,
                    abbr: c.team?.abbreviation,
                    score: parseInt(c.score) || 0,
                    homeAway: c.homeAway,
                    winner: c.winner || false,
                    record: (isPreseason || (c.records?.[0]?.summary?.split('-')?.reduce((a, b) => parseInt(a) + parseInt(b), 0) > 35)) ? '0-0' : (c.records?.[0]?.summary || '0-0'),
                    logo: c.team?.logo || `https://a.espncdn.com/i/teamlogos/mlb/500/${c.team?.id}.png`,
                };
            });

            const home = competitors.find(c => c.homeAway === 'home');
            const away = competitors.find(c => c.homeAway === 'away');
            const winner = competitors.find(c => c.winner);

            // Extract linescore for in-progress no-hitter detection
            const linescores = competition?.competitors?.map(c => {
                const ls = c.linescores || [];
                return {
                    homeAway: c.homeAway,
                    hits: parseInt(c.statistics?.find(s => s.name === 'hits')?.displayValue) || ls.reduce((sum, inn) => sum + (parseInt(inn.value) || 0), 0) || 0,
                    errors: parseInt(c.statistics?.find(s => s.name === 'errors')?.displayValue) || 0,
                    runs: parseInt(c.score) || 0,
                };
            }) || [];
            const homeLs = linescores.find(l => l.homeAway === 'home') || {};
            const awayLs = linescores.find(l => l.homeAway === 'away') || {};

            return {
                id: event.id,
                name: event.name,
                shortName: event.shortName,
                startTime: event.date,
                state: status?.type?.state || 'pre',
                statusDetail: status?.type?.detail || '',
                shortDetail: status?.type?.shortDetail || '',
                displayClock: status?.displayClock || '',
                period: status?.period || 0,
                inningHalf: status?.type?.description || '',
                home: { ...home, hits: homeLs.hits, errors: homeLs.errors },
                away: { ...away, hits: awayLs.hits, errors: awayLs.errors },
                winningAbbr: winner?.abbr || null,
                situation: situation ? {
                    onFirst: situation.onFirst || false,
                    onSecond: situation.onSecond || false,
                    onThird: situation.onThird || false,
                    outs: situation.outs || 0,
                    balls: situation.balls || 0,
                    strikes: situation.strikes || 0,
                    isTopInning: situation.isTopInning ?? null,
                    batter: situation.batter?.athlete?.displayName || null,
                    pitcher: situation.pitcher?.athlete?.displayName || null,
                } : null,
            };
        });

        // Concurrently fetch post-game deep summaries for FINAL games
        const postGamePromises = mappedGames.map(async (game) => {
            if (game.state === 'post') {
                game.postGameOptions = await fetchPostGameSummary(game.id, game.winningAbbr);
            }
            return game;
        });
        const games = await Promise.all(postGamePromises);

        const result = {
            games,
            isPreseason,
            date: data.day?.date || new Date().toISOString().split('T')[0],
            lastUpdated: new Date().toISOString(),
        };

        cacheSet('espn_scoreboard', result, CACHE_TTL.SCORES);
        return result;
    } catch (err) {
        console.error('ESPN scoreboard fetch error:', err.message);
        const stale = cacheGet('espn_scoreboard_stale');
        if (stale) return { ...stale, stale: true };
        return { games: [], date: new Date().toISOString().split('T')[0], lastUpdated: null, error: err.message };
    }
}

/* ======================================================================
   STANDINGS
   ====================================================================== */
export async function fetchStandings() {
    const cached = cacheGet('espn_standings_v5');
    if (cached) return cached;

    try {
        const res = await fetch(`${ESPN_BASE}/standings`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN standings: ${res.status}`);
        const data = await res.json();

        const teams = {};

        // Detect if the standings response is for Spring Training (Cactus/Grapefruit Leagues)
        // If true, we must zero out all records so the app correctly displays a 0-0 baseline until Opening Day.
        const isPreseason = data.children?.some(c =>
            (c.name || '').includes('Cactus') ||
            (c.name || '').includes('Grapefruit') ||
            (c.name || '').includes('Spring')
        ) || false;

        for (const group of data.children || []) {
            for (const division of group.children || []) {
                for (const entry of division.standings?.entries || []) {
                    const espnId = parseInt(entry.team?.id);
                    const team = getTeamByEspnId(espnId);
                    if (!team) continue;
                    const stats = {};
                    for (const stat of entry.stats || []) {
                        // Priority on displayValue for streaks (W2, L1) and records
                        if (stat.name.includes('streak') || stat.name === 'record') {
                            stats[stat.name] = stat.displayValue || stat.value;
                        } else {
                            stats[stat.name] = stat.value ?? stat.displayValue;
                        }
                    }

                    // Precise Pre-Season detection: Look at team group name
                    const groupName = division.name || '';
                    const rawWins = parseInt(stats.wins) || 0;
                    const rawLosses = parseInt(stats.losses) || 0;
                    const gp = rawWins + rawLosses;

                    // Final Streak Sanitization: Ensure we have W1/L1 even if API just gives a number
                    let streakVal = String(stats.streak || '—');
                    let streakNum = 0;
                    
                    // If the API gave a raw number (e.g. "2"), we check if they won their last game
                    if (!isNaN(streakVal) && streakVal !== '—') {
                        const num = parseInt(streakVal);
                        // Heuristic: If they are hot, it's a Win streak. If not, it's a Loss streak.
                        // But better yet, we can check the 'last10' string which usually ends in W1/L1.
                        const l10 = String(stats.record || stats.last10 || '');
                        if (l10.includes('W')) { streakVal = `W${num}`; streakNum = num; }
                        else if (l10.includes('L')) { streakVal = `L${num}`; streakNum = -num; }
                        else { streakVal = `W${num}`; streakNum = num; } // Default to Win for 0-0 cases
                    } else {
                        if (streakVal.startsWith('W')) streakNum = parseInt(streakVal.slice(1)) || 0;
                        if (streakVal.startsWith('L')) streakNum = -(parseInt(streakVal.slice(1)) || 0);
                    }

                    // Lockdown removed: If any wins or losses are recorded, trust the data.
                    // Only zero out if the scoreboard explicitly says preseason AND games played is still 0.
                    const forceZero = isPreseason && gp === 0;

                    teams[team.id] = {
                        teamId: team.id,
                        espnId,
                        wins: forceZero ? 0 : rawWins,
                        losses: forceZero ? 0 : rawLosses,
                        winPct: forceZero ? 0 : parseFloat(stats.winPercent) || 0,
                        gamesBack: forceZero ? '-' : stats.gamesBehind || '-',
                        runsScored: forceZero ? 0 : parseFloat(stats.pointsFor) || 0,
                        runsAllowed: forceZero ? 0 : parseFloat(stats.pointsAgainst) || 0,
                        runDiff: forceZero ? 0 : parseFloat(stats.differential) || 0,
                        streak: forceZero ? '—' : streakVal,
                        last10: forceZero ? '0-0' : (stats.record || stats.last10 || '0-0'),
                        gamesPlayed: forceZero ? 0 : gp,
                    };
                }
            }
        }

        const result = { teams, lastUpdated: new Date().toISOString() };
        cacheSet('espn_standings_v6', result, CACHE_TTL.STATS);
        cacheSet('espn_standings_stale', result, CACHE_TTL.STATS * 10);
        return result;
    } catch (err) {
        console.error('ESPN standings fetch error:', err.message);
        const stale = cacheGet('espn_standings_stale');
        if (stale) return { ...stale, stale: true };
        return { teams: {}, lastUpdated: null, error: err.message };
    }
}

/* ======================================================================
   TEAM STATISTICS  (batting + pitching – deep analytics)
   ====================================================================== */
export async function fetchTeamStats(espnId) {
    const cacheKey = `team_stats_${espnId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`${ESPN_BASE}/teams/${espnId}/statistics`, {
            next: { revalidate: 10 },
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN team stats ${espnId}: ${res.status}`);
        const data = await res.json();

        // Detect if these stats are stale (from Spring Training)
        // Heuristic: If games played is high, it's preseason data.
        const stats = data.results?.stats || {};
        const gp = stats.categories?.find(c => c.name === 'batting')?.stats?.find(s => s.name === 'gamesPlayed')?.value || 0;
        const isStale = gp > 10;
        const isPre = data.season?.type === 1 || isStale;

        const categories = stats.categories || [];
        const batting = {};
        const pitching = {};

        for (const cat of categories) {
            const target = cat.name === 'batting' || cat.displayName === 'Batting' ? batting : pitching;
            for (const s of cat.stats || []) {
                target[s.name] = isPre ? 0 : (parseFloat(s.value) || 0);
                target[`${s.name}_display`] = isPre ? '0' : (s.displayValue || String(s.value));
            }
        }

        const result = { batting, pitching, lastUpdated: new Date().toISOString() };
        cacheSet(cacheKey, result, CACHE_TTL.STATS);
        return result;
    } catch (err) {
        console.error(`Team stats ${espnId} error:`, err.message);
        return { batting: {}, pitching: {}, error: err.message };
    }
}

/** Fetch stats for ALL 30 teams in parallel */
export async function fetchAllTeamStats() {
    const cached = cacheGet('all_team_stats');
    if (cached) return cached;

    const teams = {};
    const promises = ALL_TEAMS.map(async (t) => {
        const stats = await fetchTeamStats(t.espnId);
        teams[t.id] = stats;
    });

    await Promise.all(promises);
    const result = { teams, lastUpdated: new Date().toISOString() };
    cacheSet('all_team_stats', result, CACHE_TTL.STATS);
    return result;
}

/* ======================================================================
   TEAM ROSTER
   ====================================================================== */
export async function fetchTeamRoster(espnId) {
    const cacheKey = `team_roster_${espnId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`${ESPN_BASE}/teams/${espnId}/roster`, {
            next: { revalidate: 10 },
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN roster ${espnId}: ${res.status}`);
        const data = await res.json();

        const players = [];
        for (const group of data.athletes || []) {
            for (const a of group.items || []) {
                players.push({
                    id: parseInt(a.id),
                    name: a.displayName || a.fullName || 'Unknown',
                    firstName: a.firstName || '',
                    lastName: a.lastName || '',
                    jersey: a.jersey || '',
                    position: a.position?.abbreviation || '',
                    positionName: a.position?.displayName || '',
                    headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${a.id}.png`,
                    age: a.age || null,
                    height: a.displayHeight || '',
                    weight: a.displayWeight || '',
                    birthPlace: a.birthPlace?.city ? `${a.birthPlace.city}, ${a.birthPlace.state || a.birthPlace.country || ''}` : '',
                    batHand: a.bats?.abbreviation || a.batHand?.abbreviation || '',
                    throwHand: a.throws?.abbreviation || a.throwHand?.abbreviation || '',
                    isPitcher: ['SP', 'RP', 'CP', 'P'].includes(a.position?.abbreviation || ''),
                });
            }
        }

        const result = { players, lastUpdated: new Date().toISOString() };
        cacheSet(cacheKey, result, CACHE_TTL.ROSTER);
        return result;
    } catch (err) {
        console.error(`Roster ${espnId} error:`, err.message);
        return { players: [], error: err.message };
    }
}

/* ======================================================================
   TEAM SCHEDULE  (for last N games)
   ====================================================================== */
export async function fetchTeamSchedule(espnId, season = null) {
    const yr = season || new Date().getFullYear();
    const cacheKey = `team_schedule_${espnId}_${yr}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`${ESPN_BASE}/teams/${espnId}/schedule?season=${yr}&seasontype=2`, {
            next: { revalidate: 10 },
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN schedule ${espnId}: ${res.status}`);
        const data = await res.json();

        const games = (data.events || []).map(ev => {
            const comp = ev.competitions?.[0];
            const comps = comp?.competitors || [];
            const status = comp?.status?.type;

            const home = comps.find(c => c.homeAway === 'home');
            const away = comps.find(c => c.homeAway === 'away');

            const isHome = parseInt(home?.team?.id) === espnId;
            const opponent = isHome ? away : home;
            const teamScore = isHome ? parseFloat(home?.score?.value || 0) : parseFloat(away?.score?.value || 0);
            const oppScore = isHome ? parseFloat(away?.score?.value || 0) : parseFloat(home?.score?.value || 0);

            const oppAbbr = opponent?.team?.abbreviation || '';
            return {
                id: ev.id,
                date: ev.date,
                opponent: {
                    name: opponent?.team?.displayName || 'TBD',
                    abbr: oppAbbr || '?',
                    logo: opponent?.team?.logo || (oppAbbr ? `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${oppAbbr.toLowerCase()}.png` : ''),
                },
                isHome,
                teamScore,
                oppScore,
                result: status?.state === 'post' ? (teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T') : null,
                state: status?.state || 'pre',
                statusDetail: status?.detail || '',
            };
        });

        // Only completed games
        const completed = games.filter(g => g.state === 'post' && g.result);

        const result = { games: completed, lastUpdated: new Date().toISOString() };
        cacheSet(cacheKey, result, CACHE_TTL.SCHEDULE);
        return result;
    } catch (err) {
        console.error(`Schedule ${espnId} error:`, err.message);
        return { games: [], error: err.message };
    }
}

/* ======================================================================
   INDIVIDUAL PLAYER STATS (via overview endpoint)
   ====================================================================== */
export async function fetchPlayerStats(athleteId) {
    const cacheKey = `player_stats_${athleteId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        // Use overview endpoint which reliably returns career stats
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const res = await fetch(
            `${ESPN_BASE.replace('/site/v2/', '/common/v3/')}/athletes/${athleteId}/overview`,
            {
                signal: controller.signal,
                headers: { 'User-Agent': 'MLBRankings/1.0' },
            }
        );
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Player stats ${athleteId}: ${res.status}`);
        const data = await res.json();

        const stats = { batting: {}, pitching: {}, career: { batting: {}, pitching: {} } };
        const statBlock = data.statistics || {};
        const labels = statBlock.labels || [];
        const names = statBlock.names || [];
        const splits = statBlock.splits || [];

        // Detect if the stats belong to a previous season (e.g. 2025 during the 2026 preseason)
        const currentYear = new Date().getFullYear();
        const statYearMatch = (statBlock.displayName || '').match(/\d{4}/);
        const statYear = statYearMatch ? parseInt(statYearMatch[0], 10) : currentYear;
        
        // If the top-level displayName says "2026 Batting" or "2026 Stats", this is current-year data.
        const isCurrentYearBlock = statYear >= currentYear;

        // Determine roles present in the labels/names
        const hasPitching = names.includes('innings') || names.includes('ERA') || labels.includes('IP');
        const hasBatting = names.includes('avg') || names.includes('AVG') || labels.includes('AB');

        const isShohei = String(athleteId) === '39832';

        splits.forEach(s => {
            const splitName = (s.displayName || '').toLowerCase();
            
            const isCareer = splitName.includes('career');
            if (splitName.includes('preseason') && !isShohei && !splitName.includes(String(currentYear))) return;
            if (splitName.includes('projected')) return; // Skip ESPN projections

            const isBattingSplit = splitName.includes('batting') || splitName.includes('hitting') || (s.stats && s.stats.length === labels.length && hasBatting && !hasPitching);
            const isPitchingSplit = splitName.includes('pitching') || (s.stats && s.stats.length === labels.length && hasPitching && !hasBatting);

            // Map labels to stats for this split
            const raw = {};
            
            // FIXED: ESPN splits are named just "Regular Season" without the year.
            // The year is in the top-level displayName (e.g. "2026 Batting").
            // So if isCurrentYearBlock AND this split is "regular season", it's live 2026 data.
            const isRegSeason = splitName.includes('regular') && isCurrentYearBlock;
            const shouldZero = !isCareer && !isRegSeason;

            labels.forEach((label, i) => {
                if (s.stats?.[i] !== undefined) {
                    raw[label] = shouldZero ? 0 : (parseFloat(s.stats[i]) || 0);
                }
            });
            names.forEach((name, i) => {
                if (s.stats?.[i] !== undefined) {
                    raw[name] = shouldZero ? 0 : (parseFloat(s.stats[i]) || 0);
                }
            });

            // Role identification by metrics
            const identifiesAsBatting = raw.avg !== undefined || raw.AVG !== undefined || raw.battingAverage !== undefined;
            const identifiesAsPitching = raw.ERA !== undefined || raw.innings !== undefined || raw.inningsPitched !== undefined;

            // Career splits → store in stats.career
            if (isCareer) {
                if (isBattingSplit || identifiesAsBatting) stats.career.batting = { ...stats.career.batting, ...raw };
                if (isPitchingSplit || identifiesAsPitching) stats.career.pitching = { ...stats.career.pitching, ...raw };
                return;
            }

            if ((isBattingSplit || (identifiesAsBatting && isShohei)) && (!stats.batting.AVG || isRegSeason)) {
                stats.batting = { ...stats.batting, ...raw };
            }
            if ((isPitchingSplit || identifiesAsPitching) && (!stats.pitching.ERA || isRegSeason)) {
                stats.pitching = { ...stats.pitching, ...raw };
            }
        });

        if (Object.keys(stats.pitching).length > 0) {
            const raw = stats.pitching;
            // Compute derived if missing
            const ip = raw.innings || raw.IP || 0;
            const er = raw.earnedRuns || raw.ER || 0;
            const h = raw.hits || raw.H || 0;
            const bb = raw.walks || raw.BB || 0;
            const so = raw.strikeouts || raw.K || raw.SO || 0;
            if (ip > 0 && !raw.ERA) stats.pitching.ERA = (er / ip) * 9;
            if (ip > 0 && !raw.WHIP) stats.pitching.WHIP = (h + bb) / ip;
            if (ip > 0 && !raw['K/9']) stats.pitching['K/9'] = (so / ip) * 9;
            if (bb > 0) stats.pitching['K/BB'] = so / bb;
            const w = raw.wins || raw.W || 0;
            const l = raw.losses || raw.L || 0;
            if (w + l > 0 && !raw['W%']) stats.pitching['W%'] = w / (w + l);
        }
        
        if (Object.keys(stats.batting).length > 0) {
            // Batting stats - Use the data merged in the loop above
            const b = stats.batting;
            // Compute derived stats from counting stats
            const ab = b.atBats || b.AB || 0;
            const h = b.hits || b.H || 0;
            const bb = b.walks || b.BB || 0;
            const hbp = b.hitByPitch || b.HBP || 0;
            const sf = b.sacFlies || b.SF || 0;
            const hr = b.homeRuns || b.HR || 0;
            const d = b.doubles || b['2B'] || 0;
            const t = b.triples || b['3B'] || 0;
            const so = b.strikeouts || b.SO || 0;
            const sb = b.stolenBases || b.SB || 0;

            const pa = ab + bb + hbp + sf;

            if (ab > 0) {
                if (!b.AVG) b.AVG = h / ab;
                const tb = h + d + 2 * t + 3 * hr;
                if (!b.SLG) b.SLG = tb / ab;
                if (!b.ISOP) b.ISOP = (tb / ab) - (h / ab);
            }
            if (pa > 0) {
                if (!b.OBP) b.OBP = (h + bb + hbp) / pa;
            }
            if (!b.OPS) {
                b.OPS = (b.OBP || 0) + (b.SLG || 0);
            }
            if (so > 0 && !b['BB/K']) b['BB/K'] = bb / so;
            b.GP = b.gamesPlayed || b.GP || 0;
            b.HR = hr;
            b.RBI = b.RBIs || b.RBI || 0;
            b.SB = sb;
            b.R = b.runs || b.R || 0;
        }

        cacheSet(cacheKey, stats, CACHE_TTL.PLAYER_STATS); // 10s cache for frequent OVR updates
        return stats;
    } catch {
        cacheSet(`player_stats_${athleteId}`, empty, CACHE_TTL.PLAYER_STATS); // 10s
        return empty;
    }
}

/** Fetch last 10 game logs for a player for streak analysis */
export async function fetchPlayerGameLogs(athleteId, season = null) {
    const yr = season || new Date().getFullYear();
    const cacheKey = `player_gamelogs_${athleteId}_${yr}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`${ESPN_BASE.replace('/site/v2/', '/common/v3/')}/athletes/${athleteId}/gamelog?season=${yr}&seasontype=2`, {
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });
        if (!res.ok) throw new Error(`Gamelog ${athleteId} failed: ${res.status}`);
        const data = await res.json();
        
        const logs = [];
        const events = data.events || {};
        const eventIds = Object.keys(events);
        
        for (const id of eventIds.slice(-10).reverse()) {
            const ev = events[id];
            logs.push({
                id,
                date: ev.date,
                opponent: ev.opponent?.abbreviation,
                stats: ev.stats || []
            });
        }

        const result = { logs, lastUpdated: new Date().toISOString() };
        cacheSet(cacheKey, result, CACHE_TTL.STATS);
        return result;
    } catch (err) {
        console.error(`Player gamelog ${athleteId} error:`, err.message);
        return { logs: [], error: err.message };
    }
}

/** Batch fetch player stats with concurrency control */
export async function fetchBatchPlayerStats(playerIds, concurrency = 5) {
    const results = {};
    const chunks = [];
    for (let i = 0; i < playerIds.length; i += concurrency) {
        chunks.push(playerIds.slice(i, i + concurrency));
    }
    for (const chunk of chunks) {
        const promises = chunk.map(async (id) => {
            results[id] = await fetchPlayerStats(id);
        });
        await Promise.all(promises);
    }
    return results;
}

/* ======================================================================
   ESPN POWER INDEX (approximated from teams endpoint)
   ====================================================================== */
export async function fetchESPNPowerIndex() {
    const cached = cacheGet('espn_power_index');
    if (cached) return cached;

    try {
        const res = await fetch(`${ESPN_BASE}/teams`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN teams: ${res.status}`);
        const data = await res.json();

        const teamsRaw = [];
        for (const group of data.sports?.[0]?.leagues?.[0]?.teams || []) {
            const t = group.team;
            const espnId = parseInt(t.id);
            const team = getTeamByEspnId(espnId);
            if (!team) continue;

            teamsRaw.push({
                teamId: team.id,
                espnId,
                record: t.record?.items?.[0]?.summary || '0-0',
            });
        }

        const result = { teams: teamsRaw, lastUpdated: new Date().toISOString() };
        cacheSet('espn_power_index', result, CACHE_TTL.RANKINGS);
        return result;
    } catch (err) {
        console.error('ESPN Power Index fetch error:', err.message);
        return { teams: [], lastUpdated: null, error: err.message };
    }
}

/* ======================================================================
   POST-GAME ANALYTICS ENGINE (MVP & DECISIONS)
   ====================================================================== */
export async function fetchPostGameSummary(gameId, winningAbbr) {
    try {
        const res = await fetch(`${ESPN_BASE}/summary?event=${gameId}`, {
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        
        let winningPitcher = null, losingPitcher = null, savingPitcher = null;
        if (data.header?.competitions?.[0]) {
            const comp = data.header.competitions[0];
            const mapPitcher = (pNode) => pNode?.athlete ? {
                id: pNode.athlete.id,
                name: pNode.athlete.shortName || pNode.athlete.displayName,
                headshot: pNode.athlete.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${pNode.athlete.id}.png`
            } : null;
            
            winningPitcher = mapPitcher(comp.winningPitcher);
            losingPitcher = mapPitcher(comp.losingPitcher);
            savingPitcher = mapPitcher(comp.savingPitcher);
        }

        // Compute Single Game MVP (Player of the Game)
        let pog = null;
        let bestScore = -999;
        
        const boxscore = data.boxscore?.players || [];
        for (const teamBlock of boxscore) {
            const teamAbbr = teamBlock.team?.abbreviation;
            const isWinner = teamAbbr === winningAbbr;
            if (!isWinner && winningAbbr !== null) continue; // POG is heavily biased towards the winning team
            
            for (const statGroup of teamBlock.statistics || []) {
                const isPitching = statGroup.type === 'pitching';
                const keys = statGroup.names || [];
                
                for (const athleteObj of statGroup.athletes || []) {
                    // Skip totals and non-active players
                    if (athleteObj.starter === undefined && athleteObj.battingOrder === undefined && athleteObj.position === undefined) continue; 
                    
                    const p = athleteObj.athlete;
                    const bStats = athleteObj.stats || [];
                    const raw = {};
                    keys.forEach((k, i) => raw[k] = parseFloat(bStats[i]) || 0);

                    let score = 0;
                    let statLine = "";
                    if (isPitching) {
                        const ip = raw.IP || 0;
                        const outs = Math.floor(ip) * 3 + Math.round((ip % 1) * 10);
                        const k = raw.K || 0;
                        const h = raw.H || 0;
                        const er = raw.ER || 0;
                        const r = raw.R || 0;
                        const bb = raw.BB || 0;
                        
                        // Modified Bill James Game Score
                        let bjScore = 50 + outs + k;
                        if (outs > 12) bjScore += (outs - 12) * 2;
                        bjScore -= (h * 2);
                        bjScore -= (er * 4);
                        bjScore -= ((r - er) * 2);
                        bjScore -= bb;
                        
                        score = (bjScore - 50) * 1.5; // normalized mapping
                        
                        // Dynamically build Pitcher string
                        const stats = [];
                        stats.push(`${ip} IP`);
                        stats.push(`${er} ER`);
                        if (k > 0) stats.push(`${k} K`);
                        if (bb === 0 && ip >= 1) stats.push(`0 BB`);
                        else if (h === 0 && ip >= 1) stats.push(`0 H`);
                        else if (ip >= 5 && er === 0) stats.push(`0 R`);
                        
                        statLine = stats.slice(0, 4).join(', ');
                    } else { // Batting
                        const h = raw.H || 0;
                        // Boxscore doesn't always provide 2B/3B, we rely on total hits and HRs heavily
                        const hr = raw.HR || 0;
                        const extraBases = hr * 3; // quick proxy
                        const bb = raw.BB || 0;
                        const rbi = raw.RBI || 0;
                        const r = raw.R || 0;
                        const sb = raw.SB || 0;
                        const so = raw.K || 0;
                        const ab = raw.AB || 0;
                        
                        const tb = h + extraBases;
                        score = (tb * 2.5 + bb + (sb * 2) + (rbi * 2) + (r * 1.5) - so) * 2.0; // normalized mapping
                        
                        // Dynamically build Batter string
                        const stats = [];
                        stats.push(`${h}-${ab}`);
                        if (hr > 0) stats.push(`${hr} HR`);
                        if (rbi > 0) stats.push(`${rbi} RBI`);
                        if (r > 0 && stats.length < 4) stats.push(`${r} R`);
                        if (sb > 0 && stats.length < 4) stats.push(`${sb} SB`);
                        if (bb > 0 && stats.length < 4) stats.push(`${bb} BB`);
                        
                        statLine = stats.slice(0, 4).join(', ');
                    }
                    
                    if (score > bestScore) {
                        bestScore = score;
                        pog = {
                            id: p.id,
                            name: p.shortName || p.displayName,
                            headshot: p.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${p.id}.png`,
                            score: Math.round(score),
                            type: isPitching ? 'P' : 'B',
                            statLine
                        };
                    }
                }
            }
        }

        // ── Rare Event Detection ─────────────────────────────────────────
        let rareEvents = [];
        
        // Check for no-hitter / perfect game by examining team batting stats
        for (const teamBlock of boxscore) {
            const teamAbbr = teamBlock.team?.abbreviation;
            const isWinnerTeam = teamAbbr === winningAbbr;
            
            // Check the LOSING team's batting to detect no-hitter
            if (!isWinnerTeam || winningAbbr === null) {
                const battingGroup = (teamBlock.statistics || []).find(s => s.type === 'batting');
                if (battingGroup) {
                    let teamHits = 0, teamBB = 0, teamHBP = 0, teamErrors = 0;
                    for (const a of battingGroup.athletes || []) {
                        const stats = a.stats || [];
                        const keys = battingGroup.names || [];
                        const raw = {};
                        keys.forEach((k, i) => raw[k] = parseFloat(stats[i]) || 0);
                        teamHits += raw.H || 0;
                        teamBB += raw.BB || 0;
                        teamHBP += raw.HBP || 0;
                    }
                    
                    if (teamHits === 0) {
                        if (teamBB === 0 && teamHBP === 0) {
                            rareEvents.push({ type: 'perfect-game', team: winningAbbr });
                        } else {
                            rareEvents.push({ type: 'no-hitter', team: winningAbbr });
                        }
                    }
                }
            }
        }
        
        // Check for milestone individual performances
        for (const teamBlock of boxscore) {
            for (const statGroup of teamBlock.statistics || []) {
                const keys = statGroup.names || [];
                const isPitching = statGroup.type === 'pitching';
                
                for (const athleteObj of statGroup.athletes || []) {
                    const p = athleteObj.athlete;
                    const bStats = athleteObj.stats || [];
                    const raw = {};
                    keys.forEach((k, i) => raw[k] = parseFloat(bStats[i]) || 0);
                    const pName = p?.shortName || p?.displayName || 'Unknown';
                    
                    if (isPitching) {
                        // 15+ K dominant pitching performance
                        if ((raw.K || 0) >= 15) {
                            rareEvents.push({ type: 'milestone', label: `🔥 ${pName}: ${raw.K} K`, kind: 'dominant-k' });
                        }
                        // Complete game shutout (9+ IP, 0 ER)
                        if ((raw.IP || 0) >= 9 && (raw.ER || 0) === 0) {
                            rareEvents.push({ type: 'milestone', label: `⚡ ${pName}: CGSO`, kind: 'cgso' });
                        }
                    } else {
                        // 3+ HR game
                        if ((raw.HR || 0) >= 3) {
                            rareEvents.push({ type: 'milestone', label: `💣 ${pName}: ${raw.HR} HR`, kind: 'multi-hr' });
                        }
                        // 5+ hit game
                        if ((raw.H || 0) >= 5) {
                            rareEvents.push({ type: 'milestone', label: `🔥 ${pName}: ${raw.H}-for-${raw.AB}`, kind: 'hit-explosion' });
                        }
                        // Cycle detection (H >= 4 and HR >= 1 as proxy - true cycle needs 1B/2B/3B/HR)
                        if ((raw.H || 0) >= 4 && (raw.HR || 0) >= 1 && (raw['2B'] || raw.DOUBLES || 0) >= 1 && (raw['3B'] || raw.TRIPLES || 0) >= 1) {
                            rareEvents.push({ type: 'cycle', label: `🚴 ${pName}: Hit for the Cycle!`, kind: 'cycle' });
                        }
                    }
                }
            }
        }
        
        // Shutout detection (losing team scored 0)
        const header = data.header?.competitions?.[0];
        const competitors = header?.competitors || [];
        const loser = competitors.find(c => !c.winner);
        if (loser && parseInt(loser.score) === 0 && !rareEvents.some(e => e.type === 'perfect-game' || e.type === 'no-hitter')) {
            rareEvents.push({ type: 'shutout', team: winningAbbr });
        }

        return { winningPitcher, losingPitcher, savingPitcher, pog, rareEvents };
    } catch(e) { 
        console.error('Post Game Summary Error:', e.message);
        return null; 
    }
}
