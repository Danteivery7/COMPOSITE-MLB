/**
 * Player Rating Engine v3
 *
 * Computes a 0-99 composite rating for every MLB player based on
 * ALL available advanced analytics from ESPN.
 *
 * KEY FEATURES:
 * - GP-scaled benchmarks: Counting stats are scaled to the player's games played
 * - Career blending: 30% career weight early, fading to 15% by game 80
 * - Reliever protection: Inactive relievers don't spike to 99
 * - Two-way detection: Ohtani gets 50/50 batting/pitching blend
 */

// ── Counting stats that need GP-scaling ─────────────────────────────────
const COUNTING_BATTING = new Set(['HR', 'RBI', 'SB', 'R', 'H', 'AB', '2B', '3B', 'BB', 'SO', 'CS', 'XBH', 'PA', 'GP']);
const COUNTING_PITCHING = new Set(['IP', 'SV', 'HLD', 'QS', 'CG', 'SO', 'BB', 'HR', 'GP', 'W', 'L']);

// ── League-average baselines (FULL 162-game season) ─────────────────────
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

// Standard deviations (approximate for full season)
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
    const pct = (z + 3) / 6;
    const raw = 20 + pct * 79;
    return Math.round(Math.min(99, Math.max(20, raw)));
}

// ── GP-Scaled benchmark ─────────────────────────────────────────────────
// For counting stats: scale the full-season mean/SD by the fraction of games played.
// For rate stats (AVG, OBP, ERA, etc.): keep full-season benchmarks as-is.
function getScaledBenchmark(stat, mean, sd, gp, isCounting, fullSeasonGP = 162) {
    if (!isCounting || gp <= 0) return { mean, sd };
    const fraction = Math.min(1, gp / fullSeasonGP);
    return {
        mean: mean * fraction,
        sd: Math.max(sd * Math.sqrt(fraction), sd * 0.15), // sqrt scaling for SD, floor at 15%
    };
}

// ── INVERTED stats (lower is better) ────────────────────────────────────
const INVERTED = new Set(['ERA', 'WHIP', 'OOPS', 'OBA', 'OOBP', 'OSLUG']);

/**
 * Compute rating for a BATTER with GP-scaled benchmarks
 */
export function rateBatter(stats, gp = 0) {
    if (!stats || Object.keys(stats).length === 0) return { rating: 40, breakdown: {} };

    const effectiveGP = gp || stats.GP || stats.gamesPlayed || 0;
    let totalWeight = 0;
    let weightedSum = 0;
    const breakdown = {};

    for (const [key, weight] of Object.entries(BATTER_WEIGHTS)) {
        const value = stats[key];
        if (value === undefined || value === null) continue;

        const baseMean = LEAGUE_AVG_BATTING[key] ?? 0;
        const baseSD = SD_BATTING[key] ?? 1;
        const isCounting = COUNTING_BATTING.has(key);
        const { mean, sd } = getScaledBenchmark(key, baseMean, baseSD, effectiveGP, isCounting);
        
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
 * Compute rating for a PITCHER with GP-scaled benchmarks
 */
export function ratePitcher(stats, position, gp = 0) {
    if (!stats || Object.keys(stats).length === 0) return { rating: 40, breakdown: {} };

    const isReliever = ['RP', 'CL'].includes(position);
    const weights = isReliever ? PITCHER_WEIGHTS_RP : PITCHER_WEIGHTS_SP;
    const effectiveGP = gp || stats.GP || stats.gamesPlayed || 0;

    // Reliever protection: if a reliever has 0 IP, don't let them spike
    if (isReliever && (stats.IP === 0 || stats.innings === 0) && effectiveGP === 0) {
        return { rating: 40, breakdown: {} };
    }

    let totalWeight = 0;
    let weightedSum = 0;
    const breakdown = {};

    // For pitchers, use GP as pitcher appearances (typically ~40 for RP, ~33 for SP)
    const fullSeasonGP = isReliever ? 60 : 33;

    for (const [key, weight] of Object.entries(weights)) {
        const value = stats[key];
        if (value === undefined || value === null) continue;

        const baseMean = LEAGUE_AVG_PITCHING[key] ?? 0;
        const baseSD = SD_PITCHING[key] ?? 1;
        const isCounting = COUNTING_PITCHING.has(key);
        const { mean, sd } = getScaledBenchmark(key, baseMean, baseSD, effectiveGP, isCounting, fullSeasonGP);

        let z = zscore(value, mean, sd);
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
 * Compute career weight factor.
 * Starts at ~30% career weight, fades to 15% by game 80.
 */
function getCareerWeight(gp) {
    if (gp <= 0) return 1.0; // 100% career when no season data
    return Math.max(0.15, 0.30 * (1 - gp / 80));
}

/**
 * Given a player's raw ESPN stats, career stats, and position, compute the overall rating.
 * Career stats are blended at a weight that decreases as games played increases.
 */
export function computePlayerRating(rawStats, isPitcher, position = '', playerId = null, careerRaw = null) {
    const normalized = normalizePlayerStats(rawStats);
    const careerNormalized = careerRaw ? normalizePlayerStats(careerRaw) : null;

    const isOhtani = String(playerId) === '39832';

    if (isPitcher || isPitcher === 'two-way') {
        const gp = normalized.pitching.GP || 0;
        const ip = normalized.pitching.IP || 0;

        // Compute season rating (or use 40 baseline if no IP)
        let seasonResult;
        if (ip === 0 && gp === 0) {
            seasonResult = { rating: 40, breakdown: {} };
        } else {
            seasonResult = ratePitcher(normalized.pitching, position, gp);
        }

        // Compute career rating if available
        let careerResult = null;
        if (careerNormalized && Object.keys(careerNormalized.pitching).length > 3) {
            // Use full-season GP scaling for career (career stats ARE full-season)
            careerResult = ratePitcher(careerNormalized.pitching, position, 162);
        }

        // Blend season + career
        let finalPitchRating = seasonResult.rating;
        if (careerResult) {
            const cw = getCareerWeight(gp);
            finalPitchRating = Math.round(seasonResult.rating * (1 - cw) + careerResult.rating * cw);
        }

        // Two-way player detection (Ohtani)
        const hasBatting = Object.keys(normalized.batting).length > 3;
        if (hasBatting && (isOhtani || isPitcher === 'two-way')) {
            const batGP = normalized.batting.GP || 0;
            const batResult = rateBatter(normalized.batting, batGP);
            
            let careerBatResult = null;
            if (careerNormalized && Object.keys(careerNormalized.batting).length > 3) {
                careerBatResult = rateBatter(careerNormalized.batting, 162);
            }
            
            let finalBatRating = batResult.rating;
            if (careerBatResult) {
                const cw = getCareerWeight(batGP);
                finalBatRating = Math.round(batResult.rating * (1 - cw) + careerBatResult.rating * cw);
            }

            const blended = Math.round(finalPitchRating * 0.50 + finalBatRating * 0.50);
            return {
                rating: Math.min(99, blended),
                breakdown: { pitching: seasonResult.breakdown, batting: batResult.breakdown },
                type: 'two-way',
            };
        }

        return {
            rating: Math.min(99, Math.max(20, finalPitchRating)),
            breakdown: seasonResult.breakdown,
            type: 'pitcher',
        };
    }

    // ── BATTER ──────────────────────────────────────────────────────────
    const batGP = normalized.batting.GP || 0;
    const ab = normalized.batting.AB || 0;
    const pa = normalized.batting.PA || 0;

    // Compute season rating
    let seasonResult;
    if (ab === 0 && pa === 0 && batGP === 0) {
        seasonResult = { rating: 40, breakdown: {} };
    } else if (position === 'DH') {
        // DH specific rating
        let totalWeight = 0, weightedSum = 0;
        const breakdown = {};
        for (const [key, weight] of Object.entries(BATTER_WEIGHTS_DH)) {
            const value = normalized.batting[key];
            if (value === undefined || value === null) continue;
            const baseMean = LEAGUE_AVG_BATTING[key] ?? 0;
            const baseSD = SD_BATTING[key] ?? 1;
            const isCounting = COUNTING_BATTING.has(key);
            const { mean, sd } = getScaledBenchmark(key, baseMean, baseSD, batGP, isCounting);
            const z = zscore(value, mean, sd);
            weightedSum += z * weight;
            totalWeight += weight;
            breakdown[key] = { value, z: Math.round(z * 100) / 100, rating: zToRating(z) };
        }
        const avgZ = totalWeight > 0 ? weightedSum / totalWeight : 0;
        seasonResult = { rating: zToRating(avgZ), breakdown };
    } else {
        seasonResult = rateBatter(normalized.batting, batGP);
    }

    // Compute career rating
    let careerResult = null;
    if (careerNormalized && Object.keys(careerNormalized.batting).length > 3) {
        careerResult = rateBatter(careerNormalized.batting, 162);
    }

    // Blend
    let finalRating = seasonResult.rating;
    if (careerResult) {
        const cw = getCareerWeight(batGP);
        finalRating = Math.round(seasonResult.rating * (1 - cw) + careerResult.rating * cw);
    }

    return {
        rating: Math.min(99, Math.max(20, finalRating)),
        breakdown: seasonResult.breakdown,
        type: 'batter',
    };
}
