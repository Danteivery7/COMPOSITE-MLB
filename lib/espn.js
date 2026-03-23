/**
 * ESPN MLB API client — expanded with team stats, rosters, schedules, player stats
 * Uses ESPN's public site API (no auth required)
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
        const res = await fetch(`${ESPN_BASE}/scoreboard`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'MLBRankings/1.0' },
        });

        if (!res.ok) throw new Error(`ESPN scoreboard: ${res.status}`);
        const data = await res.json();

        const isPreseason = data.leagues?.[0]?.season?.type?.type === 1;

        const games = (data.events || []).map(event => {
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
                    record: isPreseason ? '0-0' : (c.records?.[0]?.summary || ''),
                    logo: c.team?.logo || `https://a.espncdn.com/i/teamlogos/mlb/500/${c.team?.id}.png`,
                };
            });

            const home = competitors.find(c => c.homeAway === 'home');
            const away = competitors.find(c => c.homeAway === 'away');

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
                home,
                away,
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
    const cached = cacheGet('espn_standings');
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
                        stats[stat.name] = stat.value ?? stat.displayValue;
                    }

                    teams[team.id] = {
                        teamId: team.id,
                        espnId,
                        wins: isPreseason ? 0 : parseInt(stats.wins) || 0,
                        losses: isPreseason ? 0 : parseInt(stats.losses) || 0,
                        winPct: isPreseason ? 0 : parseFloat(stats.winPercent) || 0,
                        gamesBack: isPreseason ? '-' : stats.gamesBehind || '-',
                        runsScored: isPreseason ? 0 : parseFloat(stats.pointsFor) || 0,
                        runsAllowed: isPreseason ? 0 : parseFloat(stats.pointsAgainst) || 0,
                        runDiff: isPreseason ? 0 : parseFloat(stats.differential) || 0,
                        streak: isPreseason ? '-' : stats.streak || '-',
                        last10: isPreseason ? '0-0' : stats.record || '',
                        gamesPlayed: isPreseason ? 0 : (parseInt(stats.wins) || 0) + (parseInt(stats.losses) || 0),
                    };
                }
            }
        }

        const result = { teams, lastUpdated: new Date().toISOString() };
        cacheSet('espn_standings', result, CACHE_TTL.STATS);
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

        const categories = data.results?.stats?.categories || [];
        const batting = {};
        const pitching = {};

        for (const cat of categories) {
            const target = cat.name === 'batting' || cat.displayName === 'Batting' ? batting : pitching;
            for (const s of cat.stats || []) {
                target[s.name] = parseFloat(s.value) || 0;
                target[`${s.name}_display`] = s.displayValue || String(s.value);
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

        const stats = { batting: {}, pitching: {} };
        const statBlock = data.statistics || {};
        const labels = statBlock.labels || [];
        const names = statBlock.names || [];
        const splits = statBlock.splits || [];

        // Detect if the stats belong to a previous season (e.g. 2025 during the 2026 preseason)
        const currentYear = new Date().getFullYear();
        const statYearMatch = (statBlock.displayName || '').match(/\d{4}/);
        const statYear = statYearMatch ? parseInt(statYearMatch[0], 10) : currentYear;
        // GLOBAL OVERRIDE: While in Spring Training, force all 2024 stats to 0s to prevent 2023 bleeding
        const FORCE_PRESEASON_RESET = true;
        const isOldSeason = statYear < currentYear || FORCE_PRESEASON_RESET;

        // Determine roles present in the labels/names
        const hasPitching = names.includes('innings') || names.includes('ERA') || labels.includes('IP');
        const hasBatting = names.includes('avg') || names.includes('AVG') || labels.includes('AB');

        const isShohei = String(athleteId) === '39832';

        splits.forEach(s => {
            const splitName = (s.displayName || '').toLowerCase();
            // Skip career splits (but allow preseason for the current year to detect roles early)
            if (splitName.includes('career')) return;
            if (splitName.includes('preseason') && !isShohei && !splitName.includes(String(currentYear))) return;

            const isBattingSplit = splitName.includes('batting') || splitName.includes('hitting') || (s.stats && s.stats.length === labels.length && hasBatting && !hasPitching);
            const isPitchingSplit = splitName.includes('pitching') || (s.stats && s.stats.length === labels.length && hasPitching && !hasBatting);

            // Map labels to stats for this split
            const raw = {};
            labels.forEach((label, i) => {
                if (s.stats?.[i] !== undefined) {
                    raw[label] = isOldSeason ? 0 : (parseFloat(s.stats[i]) || 0);
                }
            });
            names.forEach((name, i) => {
                if (s.stats?.[i] !== undefined) {
                    raw[name] = isOldSeason ? 0 : (parseFloat(s.stats[i]) || 0);
                }
            });

            // Role identification by metrics
            const identifiesAsBatting = raw.avg !== undefined || raw.AVG !== undefined || raw.battingAverage !== undefined;
            const identifiesAsPitching = raw.ERA !== undefined || raw.innings !== undefined || raw.inningsPitched !== undefined;

            if (isBattingSplit || (identifiesAsBatting && isShohei)) {
                stats.batting = { ...stats.batting, ...raw };
            }
            if (isPitchingSplit || identifiesAsPitching) {
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
        // Cache empty result briefly to avoid hammering for missing players
        const empty = { batting: {}, pitching: {} };
        cacheSet(`player_stats_${athleteId}`, empty, CACHE_TTL.PLAYER_STATS); // 10s
        return empty;
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
