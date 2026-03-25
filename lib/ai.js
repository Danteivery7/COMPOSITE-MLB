/**
 * AI Performance Narrative Engine — PRO Edition (v2)
 * 
 * Generates in-depth, multi-paragraph insights for MLB players.
 * Factors in: Season trends, recent streaks (last 10), career baselines, 
 * status (IL, DFA), longevity, and career-weighted projections.
 */

export function generatePlayerAnalysis(player, current, career, gameLogs = [], statusLabel = '', bStats = {}, pStats = {}) {
    if (!player) return "No performance data available for analysis.";

    const isPitcher = player.isPitcher;
    const isOhtani = String(player.id) === '39832';
    const isTwoWay = (player.isTwoWay || isOhtani);
    const name = player.firstName || player.name.split(' ')[0];
    const fullName = player.name;
    const status = (statusLabel || player.statusLabel || 'Active').toUpperCase();
    const age = parseInt(player.age) || 27;
    const experience = age > 32 ? 'veteran' : age < 25 ? 'young' : 'prime';
    
    // Career context
    const careerGP = career?.GP || career?.gamesPlayed || 0;
    const isEstablished = careerGP > 400 || (isPitcher && careerGP > 100);

    // ── PARAGRAPH 1: Status & Narrative Core ──────────────────────────
    let p1 = "";
    const cp = current.GP || current.gamesPlayed || 0;
    
    // Status Logic
    const isOnIL = status.includes('IL') || status.includes('INJUR');
    const isDFA = status.includes('DFA') || status.includes('WAIV');
    const isDTD = status.includes('DAY') || status.includes('DTD');

    if (isOnIL) {
        p1 = `${fullName} is currently sidelined on the Injured List, a significant blow for the ${player.teamAbbr} ${isPitcher ? 'rotation' : 'lineup'}. `;
        if (cp > 0) {
            p1 += `Before the injury, he had managed to log ${cp} games this season, showing glimpses of his ${isEstablished ? 'veteran' : 'developing'} form. The team is eagerly awaiting his return. `;
        } else {
            p1 += `Missing the start of the 2026 campaign is a tough setback, but with his ${isEstablished ? 'prolific track record' : 'high-upside potential'}, ${name} remains a key figure in the team's long-term plans. `;
        }
    } else if (isDFA) {
        p1 = `${fullName} is currently in a transitional phase after being designated for assignment. While his ${cp} appearances this season didn't quite meet expectations, his ${careerGP} games of MLB experience suggest there's still value for a team looking for depth. `;
    } else if (isTwoWay) {
        p1 = `Shohei Ohtani continues to exist in a stratosphere of his own, anchoring the ${player.teamAbbr} both on the mound and at the plate. `;
        if (cp === 0) {
            p1 += `Entering 2026, the expectations for the game's premier dual-threat talent are sky-high, as he looks to build on a career defined by unprecedented statistical dominance in both disciplines. `;
        } else {
            p1 += `Through ${cp} games, Ohtani is effectively managing the physical toll of his dual roles, proving once again why he's the most unique asset in professional sports. `;
        }
    } else if (cp === 0) {
        p1 = `${fullName} enters the 2026 campaign as a critical piece of the ${player.teamAbbr} roster. `;
        if (isEstablished) {
            p1 += `With ${careerGP} games of MLB experience, the ${experience} star is expected to provide immediate leadership and statistical stability from the first pitch. `;
        } else {
            p1 += `As a ${experience} talent looking to cement his place in the big leagues, this season represents a major opportunity for ${name} to elevate his game. `;
        }
    } else {
        // Streak Analysis
        let streakTone = "maintaining a steady pace";
        if (gameLogs.length >= 3) {
            const recent = gameLogs.slice(0, 5);
            if (isPitcher) {
                const recentER = recent.reduce((sum, log) => sum + (parseFloat(log.stats?.[1]) || 0), 0);
                if (recentER <= 1) streakTone = "on an absolute tear, silencing opposing bats with surgical precision";
                else if (recentER > 8) streakTone = "navigating a challenging cold spell as he searches for his rhythm again";
            } else {
                const hits = recent.reduce((sum, log) => sum + (parseFloat(log.stats?.[1]) || 0), 0);
                if (hits >= 7) streakTone = "currently red-hot at the plate, appearing to see every pitch with remarkable clarity";
                else if (hits <= 1) streakTone = "slumping over the last several outings, struggling to find consistent contact";
            }
        }

        if (isPitcher) {
            const era = current.ERA || 0;
            const archetypes = ["command-first strategist", "high-velocity power arm", "finesse specialist", "reliable rotation anchor"];
            const arch = archetypes[parseInt(player.id) % 4];
            p1 = `${fullName} is ${streakTone} through his first ${cp} appearances of 2026. Operating as a ${arch}, he has posted a ${era.toFixed(2)} ERA thus far, showing ${era < 3.5 ? 'elite command' : 'flashes of brilliance'}${isDTD ? ' while nursing a minor day-to-day ailment' : ''}. `;
        } else {
            const ops = current.OPS || (current.AVG + current.SLG) || 0;
            p1 = `${fullName} is ${streakTone} as the season kicks into high gear. With a .${Math.round(ops * 1000)} OPS across ${cp} games, he's effectively ${ops > 0.850 ? 'anchoring the heart of the order' : 'contributing to the lineup depth'}${isDTD ? ' despite being monitored as day-to-day' : ''}. `;
        }
    }

    // ── PARAGRAPH 2: Two-Way Synthesis or Career Context ──────────────
    let p2 = "";
    if (isTwoWay) {
        const hHits = bStats.HR || career?.batting?.HR || 30;
        const pERA = pStats.ERA || career?.pitcher?.ERA || 3.30;
        p2 = `At the plate, his .${Math.round((bStats.OPS || 0.900) * 1000)} OPS profile forces pitchers to be perfect, while his ${pERA.toFixed(2)} ERA baseline on the mound keeps his team in every game he starts. Balancing these two elite-level skill sets is a feat of modern endurance that continues to redefine what is possible in the regular season. `;
    } else if (isPitcher) {
        const curERA = current.ERA || 0;
        const carERA = career?.ERA || 4.20;
        if (cp > 0) {
            const eraDiff = carERA - curERA;
            if (eraDiff > 0.5) {
                p2 = `Comparing this start to his career baselines, ${name} is performing significantly above his historical norm of ${carERA.toFixed(2)}. For an established arm who has logged ${careerGP} games, this implies he's finding new ways to exploit league-wide hitting trends. `;
            } else if (eraDiff < -0.5) {
                p2 = `While his current numbers are slightly inflated compared to his ${carERA.toFixed(2)} career ERA, ${name}'s track record suggests he's a prime candidate for a rebound as his mechanics settle. `;
            } else {
                p2 = `True to his ${careerGP}-game career, ${name} is operating with the professional consistency that has defined his time in the majors. He remains remarkably close to his career averages. `;
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
                p2 = `Offensively, ${name} is currently outperforming his .${Math.round(carOPS * 1000)} career OPS by a wide margin. This isn't just a lucky stretch; it's a ${experience} hitter at the peak of his powers. `;
            } else if (opsDiff < -0.080) {
                p2 = `Though he's trailing his .${Math.round(carOPS * 1000)} career OPS early on, ${name}'s historical reliability over ${careerGP} games cannot be ignored. He has a habit of adjusting as the season matures. `;
            } else {
                p2 = `${name} continues to be the model of consistency, matching his career statistical profile almost point-for-point in the early going. `;
            }
        } else {
            p2 = `Over a ${careerGP}-game career, ${name} has established himself as a .${Math.round(carOPS * 1000)} OPS threat who rarely goes through extended dry spells. `;
        }
    }

    // ── PARAGRAPH 3: Smarter Projections & Dual-Factor Outlook ───────
    let p3 = "";
    if (isOnIL) {
        p3 = `The primary projection for ${name} at this stage is a full return to health. Once cleared for action, expect him to undergo a brief ramp-up before returning to his role as a ${isEstablished ? 'cornerstone' : 'contributor'} for ${player.teamAbbr}.`;
    } else {
        const gamesRemaining = 162 - cp;
        const careerWeight = Math.max(0.25, 1 - (cp / 50)); // Fade out career influence after 50 games
        
        if (isTwoWay) {
            // Balanced Two-Way Projections
            const curERA = current.ERA || pStats.ERA || 3.30;
            const carERA = career?.pitching?.ERA || career?.ERA || 3.30;
            const xERA = (curERA * (1 - careerWeight)) + (carERA * careerWeight);
            
            const currentHRRate = (bStats.HR || 0) / Math.max(1, cp);
            const careerHRRate = (career?.batting?.HR || career?.HR || 35) / 162;
            const blendedHRRate = (currentHRRate * (1 - careerWeight)) + (careerHRRate * careerWeight);
            const projectedHR = Math.round((bStats.HR || 0) + (blendedHRRate * gamesRemaining));

            p3 = `Looking ahead, Ohtani is projected to maintain a elite ${xERA.toFixed(2)} ERA on the mound while simultaneously tracking toward a **${projectedHR}-homer season** at the plate. This unprecedented dual-threat trajectory remains the single most dominant force in individual player analytics for the 2026 campaign.`;
        } else if (isPitcher) {
            // Pitcher Projections (ERA / K/9)
            const curERA = current.ERA || 4.0;
            const carERA = career?.ERA || 4.0;
            const xERA = (curERA * (1 - careerWeight)) + (carERA * careerWeight);
            
            const curK9 = current['K/9'] || current.strikeoutsPerNineInnings || 8.5;
            const carK9 = career?.['K/9'] || 8.5;
            const xK9 = (curK9 * (1 - careerWeight)) + (carK9 * careerWeight);
            
            p3 = `Looking ahead, projections suggest ${name} will settle into a ${xERA.toFixed(2)} ERA range with a projected ${xK9.toFixed(1)} K/9 rate as the workload increases. By blending his current command with his veteran baseline, this model accounts for a realistic evolution of his arsenal across the 162-game grind.`;
        } else {
            // Hitter Projections (HR)
            const currentHRRate = (current.HR || 0) / Math.max(1, cp);
            const careerHRRate = (career?.HR || 20) / Math.max(1, careerGP || 162);
            const blendedHRRate = (currentHRRate * (1 - careerWeight)) + (careerHRRate * careerWeight);
            const projectedHR = Math.min(65, Math.round((current.HR || 0) + (blendedHRRate * gamesRemaining)));

            p3 = `If these early trends hold, ${name} is projected to finish the year with approximately ${projectedHR} home runs. By blending his current output with his historical HR/season baseline, this model accounts for both his ${experience} capabilities and the remaining ${gamesRemaining} games on the schedule.`;
        }
    }

    return `${p1}\n\n${p2}\n\n${p3}`;
}
