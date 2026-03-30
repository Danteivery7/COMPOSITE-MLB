/**
 * Player Accolades Registry
 * 
 * Recent awards and accomplishments that influence both player ratings
 * and AI narrative context. Awards within 2 years carry weight;
 * more recent = more influence.
 *
 * Format: { playerESPNId: [{ award, year, tier }] }
 *   tier 1 = MVP, Cy Young (highest impact)
 *   tier 2 = World Series MVP, ROY, Silver Slugger, Gold Glove
 *   tier 3 = All-Star, notable achievements
 */

const ACCOLADES = {
    // ── 2025 Award Winners ──────────────────────────────────────────────
    '33192':  [{ award: 'AL MVP', year: 2025, tier: 1 }, { award: 'AL MVP', year: 2024, tier: 1 }],           // Aaron Judge
    '39832':  [{ award: 'NL MVP', year: 2025, tier: 1 }, { award: 'NL MVP', year: 2024, tier: 1 }],           // Shohei Ohtani
    '36185':  [{ award: 'AL Cy Young', year: 2025, tier: 1 }],       // Tarik Skubal
    '4917922': [{ award: 'NL Cy Young', year: 2025, tier: 1 }],      // Paul Skenes
    '33373':  [{ award: 'World Series MVP', year: 2025, tier: 2 }],  // Yoshinobu Yamamoto
    '41044':  [{ award: 'AL ROY', year: 2025, tier: 2 }],            // Colton Cowser
    '40573':  [{ award: 'NL ROY', year: 2025, tier: 2 }],            // Jackson Merrill

    // ── 2024 Award Winners ──────────────────────────────────────────────
    '36018':  [{ award: 'AL Cy Young', year: 2024, tier: 1 }],       // Cole Ragans / Tarik Skubal (already above)
    '30193':  [{ award: 'World Series MVP', year: 2024, tier: 2 }],  // Freddie Freeman
    '33095':  [{ award: 'NL Cy Young', year: 2024, tier: 1 }],       // Chris Sale

    // ── Perennial All-Stars / Multi-Award Players ────────────────────
    '36185a': [], // placeholder
    '35078':  [{ award: 'NL MVP', year: 2023, tier: 1 }],            // Ronald Acuña Jr (torn ACL but context)
    '32078':  [{ award: 'All-Star', year: 2025, tier: 3 }, { award: 'All-Star', year: 2024, tier: 3 }], // Mookie Betts
    '33912':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Juan Soto
    '39911':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Bobby Witt Jr
    '31668':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Trea Turner
    '40921':  [{ award: 'All-Star', year: 2025, tier: 3 }, { award: 'NL ROY', year: 2024, tier: 2 }], // Paul Skenes (covered above too)
    '36195':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Elly De La Cruz
    '37890':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Julio Rodríguez
    '33767':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Corbin Burnes
    '32768':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Rafael Devers
    '40587':  [{ award: 'All-Star', year: 2025, tier: 3 }],          // Gunnar Henderson
};

/**
 * Get accolades for a player, with recency weights.
 * Returns { accolades: [], ratingBoost: number, narrativeText: string }
 */
export function getPlayerAccolades(playerId, currentYear = 2026) {
    const id = String(playerId);
    const raw = ACCOLADES[id];
    if (!raw || raw.length === 0) return { accolades: [], ratingBoost: 0, narrativeText: '' };

    // Filter to last 2 years only
    const recent = raw.filter(a => (currentYear - a.year) <= 2);
    if (recent.length === 0) return { accolades: [], ratingBoost: 0, narrativeText: '' };

    // Calculate rating boost based on tier and recency
    let totalBoost = 0;
    const descriptions = [];

    for (const a of recent) {
        const yearsAgo = currentYear - a.year;
        // Recency multiplier: this year = 1.0, last year = 0.6, 2 years ago = 0.25
        const recency = yearsAgo === 0 ? 1.0 : yearsAgo === 1 ? 0.6 : 0.25;
        
        // Tier impact (raw OVR points before recency)
        let boost = 0;
        if (a.tier === 1) boost = 6;       // MVP / Cy Young = up to +6 OVR
        else if (a.tier === 2) boost = 3;  // WS MVP / ROY / Silver Slugger = up to +3
        else if (a.tier === 3) boost = 1;  // All-Star = up to +1

        totalBoost += Math.round(boost * recency);
        descriptions.push(`${a.year} ${a.award}`);
    }

    // Cap total boost at +10
    totalBoost = Math.min(10, totalBoost);

    // Build narrative-friendly text
    let narrativeText = '';
    if (descriptions.length === 1) {
        narrativeText = descriptions[0];
    } else if (descriptions.length === 2) {
        narrativeText = `${descriptions[0]} and ${descriptions[1]}`;
    } else {
        narrativeText = descriptions.slice(0, -1).join(', ') + ', and ' + descriptions[descriptions.length - 1];
    }

    return { accolades: recent, ratingBoost: totalBoost, narrativeText };
}
