/**
 * AI Performance Narrative Engine — PRO Edition (v3)
 * 
 * Generates in-depth, multi-paragraph insights for MLB players.
 * Uses actual stat values, league comparisons, career context, and positional analysis.
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
    const experience = age > 32 ? 'veteran' : age < 25 ? 'young' : 'prime-age';
    const pos = player.position || '';
    
    // Career context
    const careerGP = career?.GP || career?.gamesPlayed || 0;
    const isEstablished = careerGP > 400 || (isPitcher && careerGP > 100);

    // Current season GP
    const cp = current.GP || current.gamesPlayed || 0;

    // Status flags
    const isOnIL = status.includes('IL') || status.includes('INJUR');
    const isDFA = status.includes('DFA') || status.includes('WAIV');
    const isDTD = status.includes('DAY') || status.includes('DTD');

    // ── Helper: format stat ─────────────────────────────────────────────
    const fmt3 = (v) => v ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '.000';
    const fmt2 = (v) => v ? v.toFixed(2) : '0.00';
    const fmtInt = (v) => v ? Math.round(v).toString() : '0';

    // ── PARAGRAPH 1: Core Status + Performance Snapshot ──────────────────
    let p1 = "";
    
    if (isOnIL) {
        p1 = `${fullName} is currently sidelined on the Injured List, leaving a significant void in the ${player.teamAbbr || ''} ${isPitcher ? 'pitching staff' : 'batting order'}. `;
        if (cp > 0) {
            if (isPitcher) {
                const era = current.ERA || pStats.ERA || 0;
                const ip = current.IP || current.innings || 0;
                p1 += `Before the injury, he posted a ${fmt2(era)} ERA across ${fmt2(ip)} innings in ${cp} appearances, ${era < 3.80 ? 'establishing himself as one of the more reliable arms on the staff' : 'showing the kind of effort that will be missed during his absence'}. `;
            } else {
                const avg = current.AVG || current.avg || 0;
                const hr = current.HR || current.homeRuns || 0;
                p1 += `Before going down, he was slashing ${fmt3(avg)} with ${fmtInt(hr)} home run${hr !== 1 ? 's' : ''} across ${cp} games, ${avg > .280 ? 'producing at a level that makes his absence acutely felt' : 'contributing steady at-bats that the team will need to replace internally'}. `;
            }
        } else {
            p1 += `Having missed the start of the 2026 campaign entirely, ${name}'s ${isEstablished ? `${careerGP}-game body of work` : 'untapped potential'} remains in a holding pattern while the IL stint runs its course. `;
        }
    } else if (isDFA) {
        p1 = `${fullName} finds himself at a crossroads after being designated for assignment by ${player.teamAbbr || 'his club'}. With ${careerGP > 0 ? `${careerGP} games of MLB experience` : 'his career trajectory'} hanging in the balance, his next steps will be pivotal. `;
    } else if (isTwoWay && cp > 0) {
        const batOPS = bStats.OPS || bStats.ops || 0;
        const pitERA = pStats.ERA || pStats.era || 0;
        const batHR = bStats.HR || bStats.homeRuns || 0;
        const pitK = pStats.SO || pStats.strikeouts || pStats.K || 0;
        p1 = `Shohei Ohtani is ${cp} games into the 2026 season and already imposing his singular will on both sides of the ball. At the plate, his ${fmt3(batOPS)} OPS and ${fmtInt(batHR)} home run${batHR !== 1 ? 's' : ''} confirm his status as one of baseball's most feared hitters, while his ${fmt2(pitERA)} ERA and ${fmtInt(pitK)} strikeout${pitK !== 1 ? 's' : ''} on the mound reflect the dominance of a frontline ace. No other player in the modern era sustains this dual output. `;
    } else if (isTwoWay && cp === 0) {
        p1 = `Shohei Ohtani enters the 2026 season as the most uniquely talented player in professional baseball. With a career built on defying the conventional separation of pitching and hitting, the expectations placed on him are unlike those of any other athlete in the sport. `;
    } else if (cp === 0) {
        // Pre-season / hasn't played yet
        if (isPitcher) {
            const careerERA = career?.ERA || career?.earnedRunAverage || 0;
            const careerIP = career?.IP || career?.innings || career?.inningsPitched || 0;
            if (isEstablished) {
                p1 = `${fullName} enters the 2026 season as a proven ${pos === 'SP' ? 'rotation arm' : 'bullpen weapon'} with a ${fmt2(careerERA)} career ERA across ${fmt2(careerIP)} innings of MLB service. At ${age} years old, this ${experience} ${pos} is expected to anchor ${player.teamAbbr || 'his team'}'s pitching plans from day one. `;
            } else {
                p1 = `${fullName} is poised for a breakout opportunity in 2026, entering the campaign as a ${age}-year-old ${pos} with the kind of ${experience} arm that ${player.teamAbbr || 'his club'} is banking on for innings and growth. `;
            }
        } else {
            const careerOPS = career?.OPS || career?.ops || 0;
            const careerHR = career?.HR || career?.homeRuns || 0;
            if (isEstablished) {
                p1 = `${fullName}, a ${experience} ${pos} with a ${fmt3(careerOPS)} career OPS and ${fmtInt(careerHR)} home runs over ${careerGP} games, steps into 2026 as a cornerstone of the ${player.teamAbbr || ''} lineup. His track record sets the expectation: consistent, productive at-bats from the first pitch of the season. `;
            } else {
                p1 = `${fullName} opens the 2026 season looking to carve out a bigger role in the ${player.teamAbbr || ''} lineup. At just ${age}, the ${experience} ${pos} has the physical tools to break through — the question is whether opportunity and execution align this year. `;
            }
        }
    } else {
        // Active and has played — the richest analysis
        if (isPitcher) {
            const era = current.ERA || pStats.ERA || 0;
            const whip = current.WHIP || pStats.WHIP || 0;
            const k9 = current['K/9'] || current.strikeoutsPerNineInnings || pStats['K/9'] || 0;
            const ip = current.IP || current.innings || 0;
            const so = current.SO || current.strikeouts || pStats.SO || 0;
            const bb = current.BB || current.walks || pStats.BB || 0;

            let streakNote = '';
            if (gameLogs.length >= 3) {
                const recent = gameLogs.slice(0, 3);
                const recentER = recent.reduce((sum, log) => sum + (parseFloat(log.stats?.[1]) || 0), 0);
                if (recentER <= 2) streakNote = ` He's been virtually unhittable in his last few outings, surrendering just ${recentER} earned run${recentER !== 1 ? 's' : ''}.`;
                else if (recentER > 8) streakNote = ` His recent outings have been rocky, with ${recentER} earned runs over the stretch — a trend he'll need to reverse.`;
            }

            p1 = `${fullName} has logged ${fmt2(ip)} innings across ${cp} appearance${cp !== 1 ? 's' : ''} in 2026, posting a ${fmt2(era)} ERA with a ${fmt2(whip)} WHIP and ${fmt2(k9)} K/9 rate. `;
            if (era < 3.00) p1 += `That ERA sits firmly in elite territory, combining with ${fmtInt(so)} strikeout${so !== 1 ? 's' : ''} against just ${fmtInt(bb)} walk${bb !== 1 ? 's' : ''} to paint the picture of a pitcher in complete command.`;
            else if (era < 4.00) p1 += `That's a quality line for any ${pos}, with ${fmtInt(so)} K${so !== 1 ? 's' : ''} and ${fmtInt(bb)} BB${bb !== 1 ? 's' : ''} reflecting a pitcher who's keeping hitters off balance consistently.`;
            else p1 += `While the ERA suggests some early-season turbulence, his ${fmtInt(so)} strikeout${so !== 1 ? 's' : ''} show the stuff is still there — it's about locating it more consistently.`;
            p1 += streakNote + (isDTD ? ` He is currently being monitored as day-to-day.` : '') + ' ';
        } else {
            const avg = current.AVG || current.avg || 0;
            const obp = current.OBP || current.onBasePct || 0;
            const slg = current.SLG || current.slugAvg || 0;
            const ops = current.OPS || current.ops || (obp + slg) || 0;
            const hr = current.HR || current.homeRuns || 0;
            const rbi = current.RBI || current.RBIs || 0;
            const sb = current.SB || current.stolenBases || 0;
            const so = current.SO || current.strikeouts || 0;
            const bb = current.BB || current.walks || 0;

            let streakNote = '';
            if (gameLogs.length >= 3) {
                const recent = gameLogs.slice(0, 5);
                const hits = recent.reduce((sum, log) => sum + (parseFloat(log.stats?.[1]) || 0), 0);
                if (hits >= 7) streakNote = ` His recent stretch has been scorching — the kind of hot streak that raises his profile across the league.`;
                else if (hits <= 1) streakNote = ` He's hit a cold patch recently, but his underlying approach suggests the results will follow.`;
            }

            p1 = `Through ${cp} game${cp !== 1 ? 's' : ''} in 2026, ${fullName} is slashing ${fmt3(avg)}/${fmt3(obp)}/${fmt3(slg)} with ${fmtInt(hr)} HR${hr !== 1 ? 's' : ''}, ${fmtInt(rbi)} RBI${rbi !== 1 ? 's' : ''}, and ${fmtInt(sb)} stolen base${sb !== 1 ? 's' : ''}. `;
            if (ops > 0.900) p1 += `His ${fmt3(ops)} OPS is elite-level production, the kind of output that anchors an entire lineup's offensive identity.`;
            else if (ops > 0.750) p1 += `That ${fmt3(ops)} OPS line represents quality production, with ${fmtInt(bb)} walk${bb !== 1 ? 's' : ''} against ${fmtInt(so)} strikeout${so !== 1 ? 's' : ''} reflecting a disciplined approach at the plate.`;
            else if (ops > 0) p1 += `The ${fmt3(ops)} OPS is below the league average (.720), though with only ${cp} game${cp !== 1 ? 's' : ''} in the book, the sample size is far too small to draw firm conclusions.`;
            else p1 += `With the season still in its earliest stages, these initial numbers are more noise than signal.`;
            p1 += streakNote + (isDTD ? ` He is currently listed as day-to-day.` : '') + ' ';
        }
    }

    // ── PARAGRAPH 2: Career Comparison & Context ─────────────────────────
    let p2 = "";

    if (isTwoWay) {
        const careerBatOPS = career?.batting?.OPS || career?.OPS || career?.ops || 0;
        const careerPitERA = career?.pitching?.ERA || career?.ERA || career?.era || 0;
        const careerPitK = career?.pitching?.SO || career?.pitching?.strikeouts || 0;
        const careerBatHR = career?.batting?.HR || career?.HR || career?.homeRuns || 0;
        p2 = `Across his ${careerGP > 0 ? `${careerGP}-game` : ''} career, Ohtani has maintained a ${fmt3(careerBatOPS > 0 ? careerBatOPS : 0.875)} OPS at the plate while posting a ${fmt2(careerPitERA > 0 ? careerPitERA : 3.01)} ERA on the mound — a statistical paradox that defies the specialization-driven structure of modern baseball. His ${fmtInt(careerBatHR)} career home runs and ${fmtInt(careerPitK)} career strikeouts as a pitcher encapsulate the duality that makes him a generational figure. `;
    } else if (isPitcher) {
        const curERA = current.ERA || pStats.ERA || 0;
        const carERA = career?.ERA || career?.earnedRunAverage || 4.20;
        const carIP = career?.IP || career?.innings || career?.inningsPitched || 0;
        const carK = career?.SO || career?.strikeouts || career?.K || 0;
        if (cp > 0 && careerGP > 0) {
            const eraDiff = carERA - curERA;
            if (eraDiff > 0.50) {
                p2 = `Relative to his career ${fmt2(carERA)} ERA over ${fmt2(carIP)} innings and ${fmtInt(carK)} strikeouts, ${name} is currently pitching well above his historical baseline. This kind of early-season overperformance can indicate a mechanical adjustment or pitch-mix evolution — something the analytics community will be watching closely. `;
            } else if (eraDiff < -0.50) {
                p2 = `His current numbers sit above his ${fmt2(carERA)} career ERA, a gap that his ${careerGP}-game track record and ${fmtInt(carK)} career strikeouts suggest will likely narrow. Established pitchers of his caliber rarely stay this far from their mean for extended stretches. `;
            } else {
                p2 = `True to form, ${name}'s 2026 line sits within striking distance of his ${fmt2(carERA)} career ERA — the hallmark of a ${experience} arm who has logged ${fmt2(carIP)} innings of professional consistency. When a pitcher's outputs match his historical profile this early, it's a sign of repeatable mechanics. `;
            }
        } else if (careerGP > 0) {
            p2 = `Over ${careerGP} career appearances and ${fmt2(carIP)} innings, ${name} has built a ${fmt2(carERA)} ERA baseline with ${fmtInt(carK)} strikeouts. That body of work provides the foundation for early-season projections and informs the expectations placed on him by ${player.teamAbbr || 'his organization'}. `;
        }
    } else {
        const curOPS = current.OPS || current.ops || 0;
        const carOPS = career?.OPS || career?.ops || 0.720;
        const carHR = career?.HR || career?.homeRuns || 0;
        const carAVG = career?.AVG || career?.avg || 0;
        if (cp > 0 && careerGP > 0) {
            const opsDiff = curOPS - carOPS;
            if (opsDiff > 0.080) {
                p2 = `${name}'s current ${fmt3(curOPS)} OPS outstrips his ${fmt3(carOPS)} career mark by a meaningful margin, built on top of ${fmtInt(carHR)} career home runs and a ${fmt3(carAVG)} career average across ${careerGP} games. This isn't just a hot start — the underlying contact quality and plate discipline suggest a hitter operating at peak confidence. `;
            } else if (opsDiff < -0.080) {
                p2 = `While his 2026 OPS is currently trailing his ${fmt3(carOPS)} career baseline, ${name}'s ${careerGP}-game résumé with ${fmtInt(carHR)} home runs and a ${fmt3(carAVG)} average is a powerful argument for patience. Slow starts are common in the first week of a season, especially for ${experience} hitters adjusting to new pitching matchups. `;
            } else {
                p2 = `${name} is tracking right in line with his career norms — a ${fmt3(carOPS)} OPS hitter with ${fmtInt(carHR)} career home runs who delivers exactly what you'd expect from a ${experience} ${pos}. Consistency at this level is its own form of excellence. `;
            }
        } else if (careerGP > 0) {
            p2 = `${name}'s career profile — ${fmt3(carOPS)} OPS, ${fmtInt(carHR)} home runs, ${fmt3(carAVG)} average across ${careerGP} games — provides the statistical backbone for what ${player.teamAbbr || 'his team'} expects from him in 2026. `;
        }
    }

    // ── PARAGRAPH 3: Forward Projection ──────────────────────────────────
    let p3 = "";
    
    if (isOnIL) {
        p3 = `The priority for ${name} is a full recovery. Once cleared, expect a measured ramp-up period before he returns to his regular workload. ${isEstablished ? `His track record suggests he can recapture his form quickly once healthy.` : `The opportunity to prove himself remains — it's just been delayed, not denied.`}`;
    } else {
        const gamesRemaining = Math.max(0, 162 - cp);
        const careerWeight = Math.max(0.25, 1 - (cp / 50));
        
        if (isTwoWay) {
            const curERA = pStats.ERA || current.ERA || 3.30;
            const carERA = career?.pitching?.ERA || career?.ERA || 3.30;
            const xERA = (curERA * (1 - careerWeight)) + (carERA * careerWeight);
            
            const curHR = bStats.HR || bStats.homeRuns || 0;
            const carHRRate = (career?.batting?.HR || career?.HR || 35) / Math.max(1, careerGP || 162);
            const curHRRate = curHR / Math.max(1, cp);
            const blendedHRRate = (curHRRate * (1 - careerWeight)) + (carHRRate * careerWeight);
            const projHR = Math.round(curHR + (blendedHRRate * gamesRemaining));

            const curK9 = pStats['K/9'] || pStats.strikeoutsPerNineInnings || 10;
            const carK9 = career?.pitching?.['K/9'] || 10;
            const xK9 = (curK9 * (1 - careerWeight)) + (carK9 * careerWeight);

            p3 = `Projecting forward, Ohtani is tracking toward a ${fmt2(xERA)} ERA with a ${fmt2(xK9)} K/9 on the mound, while his bat projects to finish with approximately ${projHR} home runs. This blended model weights his career baselines at ${Math.round(careerWeight * 100)}% and his current 2026 outputs at ${Math.round((1 - careerWeight) * 100)}%, naturally shifting toward his live performance as the sample grows across the remaining ${gamesRemaining} games.`;
        } else if (isPitcher) {
            const curERA = current.ERA || pStats.ERA || 4.00;
            const carERA = career?.ERA || 4.00;
            const xERA = (curERA * (1 - careerWeight)) + (carERA * careerWeight);
            
            const curK9 = current['K/9'] || current.strikeoutsPerNineInnings || pStats['K/9'] || 8.5;
            const carK9 = career?.['K/9'] || 8.5;
            const xK9 = (curK9 * (1 - careerWeight)) + (carK9 * careerWeight);

            const curWHIP = current.WHIP || pStats.WHIP || 1.30;
            const carWHIP = career?.WHIP || 1.30;
            const xWHIP = (curWHIP * (1 - careerWeight)) + (carWHIP * careerWeight);
            
            p3 = `Blending ${name}'s current 2026 performance (${Math.round((1 - careerWeight) * 100)}% weight) with his career baselines (${Math.round(careerWeight * 100)}% weight), projections peg him for a ${fmt2(xERA)} ERA, ${fmt2(xWHIP)} WHIP, and ${fmt2(xK9)} K/9 rate as the season unfolds. With ${gamesRemaining} games remaining, these numbers will shift naturally as his live data accumulates and the career influence fades.`;
        } else {
            const curHR = current.HR || current.homeRuns || 0;
            const curHRRate = curHR / Math.max(1, cp);
            const carHRRate = (career?.HR || career?.homeRuns || 20) / Math.max(1, careerGP || 162);
            const blendedHRRate = (curHRRate * (1 - careerWeight)) + (carHRRate * careerWeight);
            const projHR = Math.min(65, Math.round(curHR + (blendedHRRate * gamesRemaining)));

            const curOPS = current.OPS || current.ops || 0;
            const carOPS = career?.OPS || career?.ops || 0.720;
            const xOPS = (curOPS * (1 - careerWeight)) + (carOPS * careerWeight);

            const curAVG = current.AVG || current.avg || 0;
            const carAVG = career?.AVG || career?.avg || 0.248;
            const xAVG = (curAVG * (1 - careerWeight)) + (carAVG * careerWeight);

            p3 = `Using a ${Math.round(careerWeight * 100)}% career / ${Math.round((1 - careerWeight) * 100)}% current-season blend, ${name} projects for a ${fmt3(xAVG)} average, ${fmt3(xOPS)} OPS, and approximately ${projHR} home runs over the full 162-game schedule. As the season progresses through the remaining ${gamesRemaining} games, his live 2026 data will increasingly drive these projections while his career baseline provides stability.`;
        }
    }

    return `${p1}\n\n${p2}\n\n${p3}`;
}
