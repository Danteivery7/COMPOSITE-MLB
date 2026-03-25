/**
 * AI Performance Narrative Engine — PRO Edition
 * 
 * Generates in-depth, multi-paragraph insights for MLB players.
 * Factors in: Season trends, recent streaks (last 10), career baselines, 
 * status (IL, DFA), longevity, and projections.
 */

export function generatePlayerAnalysis(player, current, career, gameLogs = []) {
    if (!player || !current) return "No performance data available for analysis.";

    const isPitcher = player.isPitcher;
    const name = player.firstName || player.name.split(' ')[0];
    const fullName = player.name;
    const status = (player.statusLabel || 'Active').toUpperCase();
    const age = parseInt(player.age) || 27;
    const experience = age > 32 ? 'veteran' : age < 25 ? 'young' : 'prime';
    
    // Career context
    const careerGP = career?.GP || career?.gamesPlayed || 0;
    const isEstablished = careerGP > 400 || (isPitcher && careerGP > 100);

    // ── PARAGRAPH 1: Status, Season Trend & Streak Analysis ────────────
    let p1 = "";
    const cp = current.GP || current.gamesPlayed || 0;
    
    // Status Logic
    const isOnIL = status.includes('IL') || status.includes('INJUR');
    const isDFA = status.includes('DFA') || status.includes('WAIV');
    const isDTD = status.includes('DAY') || status.includes('DTD');

    if (isOnIL) {
        p1 = `${fullName} is currently sidelined on the Injured List, a significant blow for the ${player.teamAbbr} ${isPitcher ? 'rotation' : 'lineup'}. `;
        if (cp > 0) {
            p1 += `Before the injury, he had managed to log ${cp} games this season, showing glimpses of his ${isEstablished ? 'veteran' : 'developing'} form. The team is eagerly awaiting his return to stabilize their ${isPitcher ? 'pitching staff' : 'offensive production'}. `;
        } else {
            p1 += `Missing the start of the 2026 campaign is a tough setback, but with his ${isEstablished ? 'prolific track record' : 'high-upside potential'}, ${name} remains a key figure in the team's long-term postseason plans. `;
        }
    } else if (isDFA) {
        p1 = `${fullName} is currently in a transitional phase after being designated for assignment. While his ${cp} appearances this season didn't quite meet expectations, his ${careerGP} games of MLB experience suggest there's still value for a team looking for ${isPitcher ? 'arm depth' : 'a veteran bat'}. `;
    } else if (cp === 0) {
        p1 = `${fullName} enters the 2026 campaign as a critical piece of the ${player.teamAbbr} roster. `;
        if (isEstablished) {
            p1 += `With ${careerGP} games of MLB experience under his belt, the ${experience} star is expected to provide immediate leadership and statistical stability from the first pitch of the season. `;
        } else {
            p1 += `As a ${experience} talent looking to cement his place in the big leagues, this season represents a major opportunity for ${name} to elevate his game to the next level. `;
        }
    } else {
        // Streak Analysis
        let streakTone = "maintaining a steady pace";
        if (gameLogs.length >= 3) {
            const recent = gameLogs.slice(0, 5);
            if (isPitcher) {
                const recentER = recent.reduce((sum, log) => sum + (parseFloat(log.stats[1]) || 0), 0);
                if (recentER <= 1) streakTone = "on an absolute tear, silencing opposing bats with surgical precision";
                else if (recentER > 8) streakTone = "navigating a challenging cold spell as he searches for his rhythm again";
            } else {
                const hits = recent.reduce((sum, log) => sum + (parseFloat(log.stats[1]) || 0), 0);
                if (hits >= 7) streakTone = "currently red-hot at the plate, appearing to see every pitch with remarkable clarity";
                else if (hits <= 1) streakTone = "slumping over the last several outings, struggling to find consistent contact";
            }
        }

        const isReturning = isEstablished && cp < 5 && gameLogs.length > 0;
        if (isReturning) {
            p1 = `${fullName} is recently back in action for ${player.teamAbbr} after missing time. He is ${streakTone} as he works to regain his ${experience} timing and re-establish himself as a focal point of the ${isPitcher ? 'staff' : 'lineup'}. `;
        } else {
            if (isPitcher) {
                const era = current.ERA || 0;
                p1 = `${fullName} is ${streakTone} through his first ${cp} appearances of 2026. Posting a ${era.toFixed(2)} ERA thus far, he's shown ${era < 3.5 ? 'elite command' : 'flashes of brilliance'}${isDTD ? ' while nursing a minor day-to-day ailment' : ''}. `;
            } else {
                const ops = current.OPS || (current.AVG + current.SLG) || 0;
                p1 = `${fullName} is ${streakTone} as the season kicks into high gear. With a .${Math.round(ops * 1000)} OPS across ${cp} games, he's effectively ${ops > 0.850 ? 'anchoring the heart of the order' : 'contributing to the lineup depth'}${isDTD ? ' despite being monitored as day-to-day' : ''}. `;
            }
        }
    }

    // ── PARAGRAPH 2: Career Comparison & Historical Context ──────────
    let p2 = "";
    if (isPitcher) {
        const curERA = current.ERA || 0;
        const carERA = career?.ERA || 4.20;
        if (cp > 0) {
            const eraDiff = carERA - curERA;
            if (eraDiff > 0.5) {
                p2 = `Comparing this start to his career baselines, ${name} is performing significantly above his historical norm of ${carERA.toFixed(2)}. For a pitcher who has logged ${careerGP} games, this spike in efficiency suggests he's found a new gear or refined his arsenal during the winter. `;
            } else if (eraDiff < -0.5) {
                p2 = `While his current numbers are slightly inflated compared to his ${carERA.toFixed(2)} career ERA, ${name}'s long-term track record over ${careerGP} games suggests he's a prime candidate for a statistical rebound as his mechanics settle. `;
            } else {
                p2 = `True to his ${careerGP}-game career, ${name} is operating with the professional consistency that has defined his time in the majors. He remains remarkably close to his career averages, proving why he is a trusted rotation staple. `;
            }
        } else {
            p2 = `Historically, ${name} has been a force on the mound, carrying a ${carERA.toFixed(2)} career ERA and ${careerGP} games of high-pressure experience into this season. `;
        }
    } else {
        const curOPS = current.OPS || 0;
        const carOPS = career?.OPS || 0.750;
        if (cp > 0) {
            const opsDiff = curOPS - carOPS;
            if (opsDiff > 0.080) {
                p2 = `Offensively, ${name} is currently outperforming his .${Math.round(carOPS * 1000)} career OPS by a wide margin. This isn't just a lucky stretch; it's a ${experience} hitter at the peak of his powers, threatening to reset his personal benchmarks in 2026. `;
            } else if (opsDiff < -0.080) {
                p2 = `Though he's trailing his .${Math.round(carOPS * 1000)} career OPS early on, ${name}'s historical reliability over ${careerGP} games cannot be ignored. He has a habit of adjusting to league trends, and his veteran poise remains a critical asset for ${player.teamAbbr}. `;
            } else {
                p2 = `${name} continues to be the model of consistency. Matching his career statistical profile almost point-for-point, he provides a level of predictability that is invaluable to any clubhouse. `;
            }
        } else {
            p2 = `Over a ${careerGP}-game career, ${name} has established himself as a .${Math.round(carOPS * 1000)} OPS threat who rarely goes through extended dry spells. `;
        }
    }

    // ── PARAGRAPH 3: Projections & Outlook ──────────────────────────
    let p3 = "";
    if (isOnIL) {
        p3 = `The primary projection for ${name} at this stage is a full return to health. Once cleared for action, expect him to undergo a brief ramp-up period before returning to his role as a ${isEstablished ? 'cornerstone' : 'productive contributor'} for the ${player.teamAbbr} roster. His second-half projection remains bullish if he can regain his pre-injury velocity and timing.`;
    } else if (isPitcher) {
        const xERA = (current.ERA || 4.0) * 0.9 + 0.3;
        p3 = `Looking ahead, projections suggest ${name} will settle into a ${xERA.toFixed(2)} ERA range as the sample size grows. If he maintains his recent command, he is well on pace to finish the 2026 season among the team leaders in quality starts and workload.`;
    } else {
        const projectHR = Math.round((current.HR || 0) / Math.max(1, cp) * 162) || 20;
        p3 = `If these early trends hold, ${name} is projected to approach ${projectHR} home runs by the season's end. His ability to ${experience === 'young' ? 'develop his plate discipline' : 'maintain his focus'} will be the deciding factor in whether he matches his career-best marks or sets entirely new milestones in 2026.`;
    }

    return `${p1}\n\n${p2}\n\n${p3}`;
}
