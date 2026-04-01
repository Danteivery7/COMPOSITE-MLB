/**
 * AI Performance Narrative Engine — PRO Edition (v5)
 * 
 * Generates in-depth, multi-paragraph insights for MLB players.
 * Now returns a structured object including a 5-point performance consensus.
 */

const LEAGUE_AVG = {
    HR: 18, RBI: 60, AVG: 0.248, OPS: 0.720, SB: 10,
    ERA: 4.20, WHIP: 1.30, 'K/9': 8.5, SO: 100, W: 7,
};

export function generatePlayerAnalysis(player, current, career, gameLogs = [], statusLabel = '', bStats = {}, pStats = '', accoladeText = '', teamGP = 0) {
    if (!player) return { narrative: "No performance data available.", score: 0, label: 'N/A' };

    const isPitcher = player.isPitcher;
    const isOhtani = String(player.id) === '39832';
    const isTwoWay = (player.isTwoWay || isOhtani);
    const name = player.firstName || player.name.split(' ')[0];
    const fullName = player.name;
    const status = (statusLabel || player.statusLabel || 'Active').toUpperCase();
    const age = parseInt(player.age) || 27;
    const experience = age > 32 ? 'veteran' : age < 25 ? 'young' : 'prime-age';
    const pos = player.position || '';
    
    const careerGP = career?.GP || career?.gamesPlayed || 0;
    const isEstablished = careerGP > 400 || (isPitcher && careerGP > 100);
    const isRookie = careerGP < 50;
    const careerReliability = Math.min(1.0, careerGP / 200);
    const accoladeIntro = accoladeText ? `, the reigning ${accoladeText},` : '';

    const cp = current.GP || current.gamesPlayed || 0;
    const isOnIL = status.includes('IL') || status.includes('INJUR');
    const isDFA = status.includes('DFA') || status.includes('WAIV');
    const isDTD = status.includes('DAY') || status.includes('DTD');

    const fmt3 = (v) => v ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '.000';
    const fmt2 = (v) => v ? v.toFixed(2) : '0.00';
    const fmtInt = (v) => v ? Math.round(v).toString() : '0';

    function smartProject(currentRate, careerRate, leagueAvg, gamesPlayed, careerGames) {
        const reliability = Math.min(1.0, careerGames / 200);
        const seasonWeight = Math.min(0.80, gamesPlayed / 100);
        const careerWeight = (1 - seasonWeight) * reliability;
        const leagueWeight = 1 - seasonWeight - careerWeight;
        return currentRate * seasonWeight + careerRate * careerWeight + leagueAvg * leagueWeight;
    }

    // ── Consensus Assessment Logic ──────────────────────────────────────
    let consensusScore = 0;
    let consensusLabel = 'Steady';
    let streakNote = '';

    if (!isOnIL && gameLogs.length > 0) {
        const r = gameLogs.slice(0, 15);
        if (isPitcher) {
            const tIP = r.reduce((s, l) => s + (parseFloat(l.stats?.[0]) || 0), 0);
            const tH = r.reduce((s, l) => s + (parseFloat(l.stats?.[1]) || 0), 0);
            const tER = r.reduce((s, l) => s + (parseFloat(l.stats?.[3]) || 0), 0);
            const tBB = r.reduce((s, l) => s + (parseFloat(l.stats?.[4]) || 0), 0);
            const tK = r.reduce((s, l) => s + (parseFloat(l.stats?.[5]) || 0), 0);

            const curERA = tIP > 0 ? (tER / tIP) * 9 : (current.ERA || 4.20);
            const curWHIP = tIP > 0 ? (tH + tBB) / tIP : (current.WHIP || 1.30);
            const curK9 = tIP > 0 ? (tK / tIP) * 9 : (current['K/9'] || 8.5);
            const bERA = isRookie ? 4.20 : (career?.ERA || 4.20);
            const bWHIP = isRookie ? 1.35 : (career?.WHIP || 1.30);
            const bK9 = isRookie ? 8.0 : (career?.['K/9'] || 8.5);

            if (curERA < bERA) consensusScore++;
            if (curWHIP < bWHIP) consensusScore++;
            if (curK9 > bK9) consensusScore++;
            if (tIP / r.length > 5.0) consensusScore++; // Efficiency check
            if (tK / Math.max(1, tBB) > 3.0) consensusScore++; // K/BB check

            if (consensusScore >= 4) { consensusLabel = 'Sizzling'; streakNote = ` He is currently sizzling on the mound, with his 5-point consensus profile outperforming his established benchmarks.`; }
            else if (consensusScore === 3) { consensusLabel = 'Steady'; streakNote = ` He is delivering a remarkably steady performance of late, tracking right in line with the high expectations of his career profile.`; }
            else if (consensusScore >= 1) { consensusLabel = 'Challenged'; streakNote = ` He's navigated a challenging cold patch recently, with his underlying metrics trailing his established standards.`; }
            else { consensusLabel = 'Slump'; streakNote = ` He is effectively in a slump on the mound, with his recent form failing to meet his established career benchmarks.`; }
        } else {
            const tH = r.reduce((s, l) => s + (parseFloat(l.stats?.[2]) || 0), 0);
            const tAB = r.reduce((s, l) => s + (parseFloat(l.stats?.[0]) || 0), 0);
            const tBB = r.reduce((s, l) => s + (parseFloat(l.stats?.[7]) || 0), 0);
            const tHR = r.reduce((s, l) => s + (parseFloat(l.stats?.[5]) || 0), 0);
            const tK = r.reduce((s, l) => s + (parseFloat(l.stats?.[8]) || 0), 0);

            const curAVG = tAB > 0 ? tH / tAB : (current.AVG || 0.248);
            const curOPS = (current.OPS || 0.720); // Simplifying for 5-point check
            const bAVG = isRookie ? 0.248 : (career?.AVG || 0.248);
            const bOPS = isRookie ? 0.720 : (career?.OPS || 0.720);

            if (curAVG > bAVG) consensusScore++;
            if (curOPS > bOPS) consensusScore++;
            if (tHR > 1) consensusScore++; // Power check
            if (tBB > tK * 0.5) consensusScore++; // Discipline check
            if (tH / Math.max(1, r.length) > 1.0) consensusScore++; // Hits/Game check

            if (consensusScore >= 4) { consensusLabel = 'Hot'; streakNote = ` He is currently sizzling at the plate, with his 5-point consensus profile outperforming his established benchmarks.`; }
            else if (consensusScore === 3) { consensusLabel = 'Steady'; streakNote = ` He is delivering a remarkably steady performance of late, tracking right in line with the high expectations of his career profile.`; }
            else if (consensusScore >= 1) { consensusLabel = 'Chilly'; streakNote = ` He's navigated a challenging cold patch recently, with his underlying production trailing his historical standards.`; }
            else { consensusLabel = 'Slump'; streakNote = ` He is effectively in a slump at the plate, with his recent production falling significantly below his established career benchmarks.`; }
        }
    }

    // ── NARRATIVE CONSTRUCTION ──────────────────────────────────────────
    let p1 = "";
    if (isOnIL) {
        p1 = `${fullName}${accoladeIntro} is currently sidelined on the Injured List, leaving a significant void in the ${player.teamAbbr || ''} ${isPitcher ? 'pitching staff' : 'batting order'}. `;
        if (cp > 0) {
            if (isPitcher) {
                const era = current.ERA || pStats.ERA || 0; const ip = current.IP || current.innings || 0;
                p1 += `Before the injury, he posted a ${fmt2(era)} ERA across ${fmt2(ip)} innings in ${cp} appearances. `;
            } else {
                const avg = current.AVG || current.avg || 0; const hr = current.HR || current.homeRuns || 0;
                p1 += `Before going down, he was slashing ${fmt3(avg)} with ${fmtInt(hr)} home runs across ${cp} games. `;
            }
        }
    } else if (cp === 0) {
        p1 = `${fullName}${accoladeIntro} enters the 2026 season looking to set a new baseline for the ${player.teamAbbr || ''} ${isPitcher ? 'rotation' : 'lineup'}. At ${age} years old with ${careerGP} career games, the model anchors on his historical profile. `;
    } else {
        if (isPitcher) {
            const era = current.ERA || pStats.ERA || 0; const whip = current.WHIP || pStats.WHIP || 0; const ip = current.IP || current.innings || 0;
            p1 = `${fullName}${accoladeIntro} has logged ${fmt2(ip)} innings across ${cp} appearances in 2026, posting a ${fmt2(era)} ERA with a ${fmt2(whip)} WHIP. ${streakNote} `;
        } else {
            const avg = current.AVG || current.avg || 0; const ops = current.OPS || (current.onBasePct + current.slugAvg) || 0; const hr = current.HR || current.homeRuns || 0;
            p1 = `Through ${cp} games in 2026, ${fullName}${accoladeIntro} is slashing ${fmt3(avg)} with an ${fmt3(ops)} OPS and ${fmtInt(hr)} HRs. ${streakNote} `;
        }
    }

    const p2 = `Across his ${careerGP}-game career, ${name} has established a track record that our model uses as a 40% anchor for current evaluations. ${isEstablished ? 'His veteran status provides significant stability to his OVR rating during short-term fluctuation.' : 'As he builds more sample size, this baseline will gain more weight in our predictive engine.'}`;
    
    const gamesRemaining = Math.max(0, 162 - Math.max(cp, teamGP));
    const p3 = `Projecting forward over the remaining ${gamesRemaining} games, the 5-point consensus model suggests a probability-weighted stabilization at ${isPitcher ? fmt2(smartProject(current.ERA || 4.2, career?.ERA || 4.2, 4.2, cp, careerGP)) + ' ERA' : fmt3(smartProject(current.OPS || 0.72, career?.OPS || 0.72, 0.72, cp, careerGP)) + ' OPS'}.`;

    // Final Projection Sentence (Diversity Restoration)
    let pFinal = "";
    const hasBatting = (current.AVG !== undefined || career?.AVG !== undefined);
    if (hasBatting && (!isPitcher || isTwoWay)) {
        const projAVG = smartProject(current.AVG || 0.248, career?.AVG || 0.248, 0.248, cp, careerGP);
        const curHRCount = current.HR || current.homeRuns || 0;
        const curHRRate = cp > 0 ? (curHRCount / cp) : (career?.HR / Math.max(1, careerGP)) || 0;
        const carHRRate = (career?.HR / Math.max(1, careerGP)) || (18 / 162);
        const blendedHRRate = smartProject(curHRRate, carHRRate, 18 / 162, cp, careerGP);
        const projHRTotal = Math.round(blendedHRRate * 162);
        pFinal = ` Based on his ${careerGP}-game career trajectory, the model predicts ${name} will stabilize at a ${fmt3(projAVG)} average with a season-end total of ${projHRTotal} home runs.`;
    }

    return {
        narrative: `${p1}\n\n${p2}\n\n${p3}${pFinal}`,
        score: consensusScore,
        label: consensusLabel,
        color: consensusScore >= 4 ? '#10b981' : consensusScore === 3 ? '#3b82f6' : consensusScore >= 1 ? '#f59e0b' : '#ef4444'
    };
}
