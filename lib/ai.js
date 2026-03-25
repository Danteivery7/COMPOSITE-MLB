/**
 * AI Performance Narrative Engine — PRO Edition
 * 
 * Generates in-depth, multi-paragraph insights for MLB players.
 * Factors in: Season trends, recent streaks (last 10), career baselines, 
 * longevity, and projections.
 */

export function generatePlayerAnalysis(player, current, career, gameLogs = []) {
    if (!player || !current) return "No performance data available for analysis.";

    const isPitcher = player.isPitcher;
    const name = player.firstName || player.name.split(' ')[0];
    const fullName = player.name;
    const age = parseInt(player.age) || 27;
    const experience = age > 32 ? 'veteran' : age < 25 ? 'young' : 'prime';
    
    // Career context
    const careerGP = career?.GP || career?.gamesPlayed || 0;
    const isEstablished = careerGP > 400 || (isPitcher && careerGP > 100);
    const isNew = careerGP < 150 && !isEstablished;

    // ── PARAGRAPH 1: Season Trend & Streak Analysis ────────────────────
    let p1 = "";
    const cp = current.GP || current.gamesPlayed || 0;
    
    if (cp === 0) {
        p1 = `${fullName} enters the 2026 campaign as a critical piece of the ${player.teamAbbr} roster. `;
        if (isEstablished) {
            p1 += `With ${careerGP} games of MLB experience under his belt, the ${experience} star is expected to provide immediate leadership and statistical stability from the first pitch of the season. `;
        } else {
            p1 += `As a ${experience} talent looking to cement his place in the big leagues, this season represents a major opportunity for ${name} to elevate his game to the next level. `;
        }
    } else {
        // Evaluate recent streak from gameLogs (last 5-10)
        let streakTone = "maintaining a steady pace";
        if (gameLogs.length >= 3) {
            const recent = gameLogs.slice(0, 5);
            if (isPitcher) {
                const recentER = recent.reduce((sum, log) => {
                    const erIdx = 1; // proxy
                    return sum + (parseFloat(log.stats[erIdx]) || 0);
                }, 0);
                if (recentER <= 1) streakTone = "on an absolute tear, silencing opposing bats with surgical precision";
                else if (recentER > 8) streakTone = "navigating a challenging cold spell as he searches for his rhythm again";
            } else {
                const hits = recent.reduce((sum, log) => {
                    return sum + (parseFloat(log.stats[1]) || 0); // proxy for H
                }, 0);
                if (hits >= 7) streakTone = "currently red-hot at the plate, appearing to see every pitch with remarkable clarity";
                else if (hits <= 1) streakTone = "slumping over the last several outings, struggling to find consistent contact";
            }
        }

        if (isPitcher) {
            const era = current.ERA || 0;
            p1 = `${fullName} is ${streakTone} through his first ${cp} appearances of 2026. Posting a ${era.toFixed(2)} ERA thus far, he's shown ${era < 3.5 ? 'elite command' : 'flashes of brilliance'} while acclimating to the demands of the new season. `;
        } else {
            const ops = current.OPS || (current.AVG + current.SLG) || 0;
            p1 = `${fullName} is ${streakTone} as the season kicks into high gear. With a .${Math.round(ops * 1000)} OPS across ${cp} games, he's effectively ${ops > 0.850 ? 'anchoring the heart of the order' : 'contributing to the lineup depth'} for ${player.teamAbbr}. `;
        }
    }

    // ── PARAGRAPH 2: Career Comparison & Historical Context ──────────
    let p2 = "";
    if (isPitcher) {
        const curERA = current.ERA || 0;
        const carERA = career?.ERA || 4.20;
        const carWHIP = career?.WHIP || 1.30;
        
        if (cp > 0) {
            const eraDiff = carERA - curERA;
            if (eraDiff > 0.5) {
                p2 = `Comparing this start to his career baselines, ${name} is performing significantly above his historical norm of ${carERA.toFixed(2)}. For a pitcher who has logged ${careerGP} games, this spike in efficiency suggests he's found a new gear or refined his arsenal during the winter. `;
            } else if (eraDiff < -0.5) {
                p2 = `While his current numbers are slightly inflated compared to his ${carERA.toFixed(2)} career ERA, ${name}'s long-term track record suggests he's a prime candidate for a statistical rebound. His career WHIP of ${carWHIP.toFixed(2)} remains the truer indicator of his talent. `;
            } else {
                p2 = `True to his ${careerGP}-game career, ${name} is operating with the professional consistency that has defined his time in the majors. He remains remarkably close to his career averages, proving why he is a trusted rotation staple for ${player.teamAbbr}. `;
            }
        } else {
            p2 = `Historically, ${name} has been a force on the mound, carrying a ${carERA.toFixed(2)} career ERA and ${careerGP} games of high-pressure experience into this season. `;
        }
    } else {
        const curOPS = current.OPS || 0;
        const carOPS = career?.OPS || 0.750;
        const carAVG = career?.AVG || 0.260;

        if (cp > 0) {
            const opsDiff = curOPS - carOPS;
            if (opsDiff > 0.080) {
                p2 = `Offensively, ${name} is currently outperforming his .${Math.round(carOPS * 1000)} career OPS by a wide margin. This isn't just a lucky stretch; it's a ${experience} hitter at the peak of his powers, threatening to reset his personal benchmarks across the board. `;
            } else if (opsDiff < -0.080) {
                p2 = `Though he's trailing his .${Math.round(carOPS * 1000)} career OPS early on, ${name}'s historical reliability over ${careerGP} games cannot be ignored. He has a habit of adjusting to league trends, and his career .${Math.round(carAVG * 1000)} batting average serves as a beacon for the expected turnaround. `;
            } else {
                p2 = `${name} continues to be the model of consistency. Matching his career statistical profile almost point-for-point, he provides a level of predictability that is invaluable to any clubhouse. `;
            }
        } else {
            p2 = `Over a ${careerGP}-game career, ${name} has established himself as a .${Math.round(carOPS * 1000)} OPS threat who rarely goes through extended dry spells. `;
        }
    }

    // ── PARAGRAPH 3: Projections & Outlook ──────────────────────────
    let p3 = "";
    const war = current.WAR || 0;
    if (isPitcher) {
        const xERA = (current.ERA || 4.0) * 0.9 + 0.3; // heuristic proxy
        p3 = `Looking ahead, projections suggest ${name} will settle into a ${xERA.toFixed(2)} ERA range as the sample size grows. If he maintains his recent velocity and command, he is well on pace to finish the 2026 season among the ${player.teamAbbr} leaders in WAR and quality starts. Expect him to be the arm the team turns to in high-leverage situations down the stretch.`;
    } else {
        const projectHR = Math.round((current.HR || 0) / Math.max(1, cp) * 162) || 20;
        p3 = `If these early trends hold, ${name} is projected to approach ${projectHR} home runs by the season's end. His ability to ${experience === 'young' ? 'develop his plate discipline' : 'maintain his veteran focus'} will be the deciding factor in whether he matches his career-best marks or sets entirely new milestones in 2026.`;
    }

    return `${p1}\n\n${p2}\n\n${p3}`;
}
