/**
 * Player Rating Engine
 *
 * Computes a 0-99 composite rating for every MLB player based on
 * ALL available advanced analytics from ESPN.
 *
 * BATTERS  use: AVG, OBP, SLG, OPS, HR rate, RBI rate, SB, WAR, ISO, BB/K, RC/27
 * PITCHERS use: ERA, WHIP, K/9, opponent OPS, Win%, WAR, K/BB, IP workload
 *
 * The rating uses z-score normalization against league averages so that
 * every stat is weighted fairly regardless of scale.
 */

// ── League-average baselines (used for z-score normalization) ────────────
const LEAGUE_AVG_BATTING = {
    AVG: 0.248, OBP: 0.315, SLG: 0.405, OPS: 0.720,
    HR: 18, RBI: 60, SB: 10, WAR: 1.5,
    ISOP: 0.157, 'BB/K': 0.42, 'RC/27': 4.5,
    GP: 130, AB: 450, R: 60, H: 112,
    '2B': 22, '3B': 2, BB: 45, SO: 120, CS: 3,
    SECA: 0.22, XBH: 38, PA: 500,
};

const LEAGUE_AVG_PITCHING = {
    ERA: 4.20, WHIP: 1.30, 'K/9': 8.5,
    OOPS: 0.720, 'W%': 0.500, WAR: 1.0,
    IP: 120, 'K/BB': 2.5, OBA: 0.250,
    OOBP: 0.310, OSLUG: 0.400,
    SV: 5, HLD: 5, QS: 10, CG: 0.3,
    SO: 100, BB: 40, HR: 14,
    GP: 40, W: 7, L: 7,
};

// Standard deviations (approximate)
const SD_BATTING = {
    AVG: 0.032, OBP: 0.038, SLG: 0.075, OPS: 0.100,
    HR: 12, RBI: 25, SB: 10, WAR: 1.8,
    ISOP: 0.055, 'BB/K': 0.25, 'RC/27': 2.0,
    GP: 30, AB: 120, R: 22, H: 35,
    '2B': 8, '3B': 2, BB: 20, SO: 30, CS: 3,
    SECA: 0.10, XBH: 14, PA: 130,
};

const SD_PITCHING = {
    ERA: 1.20, WHIP: 0.22, 'K/9': 2.0,
    OOPS: 0.100, 'W%': 0.200, WAR: 1.5,
    IP: 60, 'K/BB': 1.2, OBA: 0.030,
    OOBP: 0.035, OSLUG: 0.065,
    SV: 10, HLD: 8, QS: 8, CG: 0.8,
    SO: 50, BB: 18, HR: 7,
    GP: 20, W: 5, L: 4,
};

// ── Weights  (higher = more important) ──────────────────────────────────
const BATTER_WEIGHTS = {
    WAR: 22, OPS: 14, OBP: 10, SLG: 10, AVG: 6,
    ISOP: 6, HR: 5, RBI: 4, 'RC/27': 6, 'BB/K': 5,
    SB: 3, R: 3, SECA: 3, XBH: 3,
};

const PITCHER_WEIGHTS_SP = {
    WAR: 22, ERA: 18, WHIP: 14, 'K/9': 10,
    OOPS: 8, 'W%': 6, 'K/BB': 8, IP: 6,
    QS: 8, OBA: 5,
};

const PITCHER_WEIGHTS_RP = {
    WAR: 18, ERA: 20, WHIP: 16, 'K/9': 14,
    OOPS: 10, SV: 15, HLD: 10, 'K/BB': 10,
    GP: 5, OBA: 5,
};

const BATTER_WEIGHTS_DH = {
    WAR: 25, OPS: 20, OBP: 15, SLG: 15, AVG: 10,
    ISOP: 8, HR: 10, RBI: 8, 'RC/27': 10, 'BB/K': 5,
};

// ── Helper: z-score ─────────────────────────────────────────────────────
function zscore(value, mean, sd) {
    if (!sd || sd === 0) return 0;
    return (value - mean) / sd;
}

// ── Helper: z-score to 0-99 rating (clamped) ────────────────────────────
function zToRating(z) {
    // Map z ∈ [-3, +3] → rating ∈ [20, 99]
    const pct = (z + 3) / 6;              // 0..1
    const raw = 20 + pct * 79;            // 20..99
    return Math.round(Math.min(99, Math.max(20, raw)));
}

// ── INVERTED stats (lower is better) ────────────────────────────────────
const INVERTED = new Set(['ERA', 'WHIP', 'OOPS', 'OBA', 'OOBP', 'OSLUG']);

/**
 * Compute rating for a BATTER
 * @param   {Object}  stats – batting stats object (keys like AVG, OBP, SLG, etc.)
 * @returns {{ rating: number, breakdown: Object }}
 */
export function rateBatter(stats) {
    if (!stats || Object.keys(stats).length === 0) return { rating: 40, breakdown: {} };

    let totalWeight = 0;
    let weightedSum = 0;
    const breakdown = {};

    for (const [key, weight] of Object.entries(BATTER_WEIGHTS)) {
        const value = stats[key];
        if (value === undefined || value === null) continue;

        const mean = LEAGUE_AVG_BATTING[key] ?? 0;
        const sd = SD_BATTING[key] ?? 1;
        const z = zscore(value, mean, sd);
        const rating = zToRating(z);

        weightedSum += z * weight;
        totalWeight += weight;
        breakdown[key] = { value, z: Math.round(z * 100) / 100, rating };
    }

    const avgZ = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const rating = zToRating(avgZ);

    return { rating, breakdown };
}

/**
 * Compute rating for a PITCHER
 * @param   {Object}  stats – pitching stats object
 * @param   {string}  position – player position (SP, RP, CL, etc.)
 * @returns {{ rating: number, breakdown: Object }}
 */
export function ratePitcher(stats, position) {
    if (!stats || Object.keys(stats).length === 0) return { rating: 40, breakdown: {} };

    const isReliever = ['RP', 'CL'].includes(position);
    const weights = isReliever ? PITCHER_WEIGHTS_RP : PITCHER_WEIGHTS_SP;

    let totalWeight = 0;
    let weightedSum = 0;
    const breakdown = {};

    for (const [key, weight] of Object.entries(weights)) {
        const value = stats[key];
        if (value === undefined || value === null) continue;

        const mean = LEAGUE_AVG_PITCHING[key] ?? 0;
        const sd = SD_PITCHING[key] ?? 1;
        let z = zscore(value, mean, sd);

        // Invert z for stats where lower is better
        if (INVERTED.has(key)) z = -z;

        const rating = zToRating(z);

        weightedSum += z * weight;
        totalWeight += weight;
        breakdown[key] = { value, z: Math.round(z * 100) / 100, rating };
    }

    const avgZ = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const rating = zToRating(avgZ);

    return { rating, breakdown };
}

/**
 * Map raw ESPN player stats into the keys our rating functions expect.
 *
 * ESPN labels from the /athletes/{id}/stats endpoint:
 *   Batting:  GP, AB, R, H, 2B, 3B, HR, RBI, BB, HBP, SO, SB, CS, AVG, OBP, SLG, OPS, WAR
 *   Expanded: PA, P, P/PA, XBH, TB, IBB, HBP, GIDP, SH, SF, SB, CS, SB%
 */
export function normalizePlayerStats(raw) {
    const batting = {};
    const pitching = {};

    if (raw.batting) {
        const b = raw.batting;
        batting.AVG = b.AVG ?? b.avg ?? 0;
        batting.OBP = b.OBP ?? b.obp ?? b.onBasePct ?? 0;
        batting.SLG = b.SLG ?? b.slg ?? b.slugAvg ?? 0;
        batting.OPS = b.OPS ?? b.ops ?? (batting.OBP + batting.SLG);
        batting.HR = b.HR ?? b.homeRuns ?? 0;
        batting.RBI = b.RBI ?? b.RBIs ?? 0;
        batting.SB = b.SB ?? b.stolenBases ?? 0;
        batting.WAR = b.WAR ?? b.WARBR ?? 0;
        batting.ISOP = b.ISOP ?? b.isolatedPower ?? (batting.SLG - batting.AVG);
        batting['BB/K'] = b['BB/K'] ?? b.walkToStrikeoutRatio ?? (
            (b.BB ?? b.walks ?? 0) / Math.max(1, b.SO ?? b.strikeouts ?? 1)
        );
        batting['RC/27'] = b['RC/27'] ?? b.runsCreatedPer27Outs ?? 0;
        batting.R = b.R ?? b.runs ?? 0;
        batting.GP = b.GP ?? b.gamesPlayed ?? 0;
        batting.AB = b.AB ?? b.atBats ?? 0;
        batting.H = b.H ?? b.hits ?? 0;
        batting['2B'] = b['2B'] ?? b.doubles ?? 0;
        batting['3B'] = b['3B'] ?? b.triples ?? 0;
        batting.BB = b.BB ?? b.walks ?? 0;
        batting.SO = b.SO ?? b.strikeouts ?? 0;
        batting.CS = b.CS ?? b.caughtStealing ?? 0;
        batting.SECA = b.SECA ?? b.secondaryAvg ?? 0;
        batting.XBH = b.XBH ?? b.extraBaseHits ?? 0;
        batting.PA = b.PA ?? b.plateAppearances ?? 0;
    }

    if (raw.pitching) {
        const p = raw.pitching;
        pitching.ERA = p.ERA ?? p.era ?? 0;
        pitching.WHIP = p.WHIP ?? p.whip ?? 0;
        pitching['K/9'] = p['K/9'] ?? p.strikeoutsPerNineInnings ?? 0;
        pitching.OOPS = p.OOPS ?? p.opponentOPS ?? 0;
        pitching['W%'] = p['W%'] ?? p.winPct ?? 0;
        pitching.WAR = p.WAR ?? p.WARBR ?? 0;
        pitching.IP = p.IP ?? p.innings ?? 0;
        pitching['K/BB'] = (p.SO ?? p.strikeouts ?? 0) / Math.max(1, p.BB ?? p.walks ?? 1);
        pitching.OBA = p.OBA ?? p.opponentAvg ?? 0;
        pitching.OOBP = p.OOBP ?? p.opponentOnBasePct ?? 0;
        pitching.OSLUG = p.OSLUG ?? p.opponentSlugAvg ?? 0;
        pitching.GP = p.GP ?? p.gamesPlayed ?? 0;
        pitching.W = p.W ?? p.wins ?? 0;
        pitching.L = p.L ?? p.losses ?? 0;
        pitching.SV = p.SV ?? p.saves ?? 0;
        pitching.HLD = p.HLD ?? p.holds ?? 0;
        pitching.QS = p.QS ?? p.qualityStarts ?? 0;
        pitching.SO = p.SO ?? p.strikeouts ?? 0;
        pitching.BB = p.BB ?? p.walks ?? 0;
        pitching.HR = p.HR ?? p.homeRuns ?? 0;
    }

    return { batting, pitching };
}

/**
 * Given a player's raw ESPN stats and position, compute the overall rating.
 */
export function computePlayerRating(rawStats, isPitcher, position = '', playerId = null) {
    const normalized = normalizePlayerStats(rawStats);

    if (isPitcher) {
        // Enforce baseline 40 OVR rating if season hasn't started (0 Innings Pitched)
        if (normalized.pitching.IP === 0) {
            return { rating: 40, breakdown: {}, type: 'pitcher' };
        }

        // Pitchers are rated based on their specific role (SP vs RP)
        const pitchResult = ratePitcher(normalized.pitching, position);
        const hasBatting = Object.keys(normalized.batting).length > 3;

        // Two-way player detection:
        // ONLY trigger for Ohtani (39832) or explicitly marked "two-way" roles.
        // This prevents regular pitchers who might have minor hitting stats from being blended.
        const isOhtani = String(playerId) === '39832';
        if (hasBatting && (isOhtani || isPitcher === 'two-way')) {
            // Two-way player: 50/50 average blend
            const batResult = rateBatter(normalized.batting);
            const blended = Math.round(pitchResult.rating * 0.50 + batResult.rating * 0.50);
            return { rating: Math.min(99, blended), breakdown: { pitching: pitchResult.breakdown, batting: batResult.breakdown }, type: 'two-way' };
        }
        return { rating: pitchResult.rating, breakdown: pitchResult.breakdown, type: 'pitcher' };
    }

    // Enforce baseline 40 OVR rating if season hasn't started (0 At Bats)
    if (normalized.batting.AB === 0 && normalized.batting.PA === 0) {
        return { rating: 40, breakdown: {}, type: 'batter' };
    }

    // Position player
    let batResult;
    if (position === 'DH') {
        // DH specific rating (purely offensive)
        let totalWeight = 0;
        let weightedSum = 0;
        const breakdown = {};
        for (const [key, weight] of Object.entries(BATTER_WEIGHTS_DH)) {
            const value = normalized.batting[key];
            if (value === undefined || value === null) continue;
            const mean = LEAGUE_AVG_BATTING[key] ?? 0;
            const sd = SD_BATTING[key] ?? 1;
            const z = zscore(value, mean, sd);
            weightedSum += z * weight;
            totalWeight += weight;
            breakdown[key] = { value, z: Math.round(z * 100) / 100, rating: zToRating(z) };
        }
        const avgZ = totalWeight > 0 ? weightedSum / totalWeight : 0;
        batResult = { rating: zToRating(avgZ), breakdown };
    } else {
        batResult = rateBatter(normalized.batting);
    }

    return { rating: batResult.rating, breakdown: batResult.breakdown, type: 'batter' };
}
