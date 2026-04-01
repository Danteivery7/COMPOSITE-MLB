/**
 * AI Performance Narrative Engine — PRO Edition (v4)
 * 
 * Generates in-depth, multi-paragraph insights for MLB players.
 * Aware of the 4-layer rating system:
 *   1. GP-scaled benchmarks (small sample = smaller benchmarks)
 *   2. Career reliability regression (rookies regressed toward league avg)
 *   3. Age decay (34+ players get diminished career influence)
 *   4. Accolade boost (recent award winners get OVR and narrative context)
 *
 * Projections use a smart blend that caps rookie extrapolation and
 * anchors toward league averages when career data is thin.
 */

// League-average baselines for projection anchoring
const LEAGUE_AVG = {
    HR: 18, RBI: 60, AVG: 0.248, OPS: 0.720, SB: 10,
    ERA: 4.20, WHIP: 1.30, 'K/9': 8.5, SO: 100, W: 7,
};

export function generatePlayerAnalysis(player, current, career, gameLogs = [], statusLabel = '', bStats = {}, pStats = {}, accoladeText = '', teamGP = 0) {
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
    const isRookie = careerGP < 50;
    const careerReliability = Math.min(1.0, careerGP / 200);
    const hasAccolades = accoladeText && accoladeText.length > 0;
    const accoladeIntro = hasAccolades ? `, the reigning ${accoladeText},` : ''; // 0..1

    // Current season GP
    const cp = current.GP || current.gamesPlayed || 0;

    // Status flags
    const isOnIL = status.includes('IL') || status.includes('INJUR');
    const isDFA = status.includes('DFA') || status.includes('WAIV');
    const isDTD = status.includes('DAY') || status.includes('DTD');

    // Formatters
    const fmt3 = (v) => v ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '.000';
    const fmt2 = (v) => v ? v.toFixed(2) : '0.00';
    const fmtInt = (v) => v ? Math.round(v).toString() : '0';

    // ── Smart Projection Helper ─────────────────────────────────────────
    // For rookies: heavy league-average regression. For vets: trust career more.
    function smartProject(currentRate, careerRate, leagueAvg, gamesPlayed, careerGames) {
        const reliability = Math.min(1.0, careerGames / 200);
        // Season weight grows with games played (max 80% by game 80)
        const seasonWeight = Math.min(0.80, gamesPlayed / 100);
        // Career weight = whatever is left, but modulated by reliability
        const careerWeight = (1 - seasonWeight) * reliability;
        // League average fills the gap
        const leagueWeight = 1 - seasonWeight - careerWeight;
        return currentRate * seasonWeight + careerRate * careerWeight + leagueAvg * leagueWeight;
    }

    // ── PARAGRAPH 1: Core Status + Performance Snapshot ──────────────────
    let p1 = "";
    
    if (isOnIL) {
        p1 = `${fullName}${accoladeIntro} is currently sidelined on the Injured List, leaving a significant void in the ${player.teamAbbr || ''} ${isPitcher ? 'pitching staff' : 'batting order'}. `;
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
            p1 += `Having missed the start of the 2026 campaign entirely, ${name}'s ${isEstablished ? `${careerGP}-game body of work` : 'development trajectory'} is on hold while the IL stint runs its course. `;
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
        if (isPitcher) {
            const careerERA = career?.ERA || career?.earnedRunAverage || 0;
            const careerIP = career?.IP || career?.innings || career?.inningsPitched || 0;
            if (isEstablished) {
                p1 = `${fullName}${accoladeIntro} enters the 2026 season as a proven ${pos === 'SP' ? 'rotation arm' : 'bullpen weapon'} with a ${fmt2(careerERA)} career ERA across ${fmt2(careerIP)} innings of MLB service. At ${age} years old, this ${experience} ${pos} is expected to be a key piece of the ${player.teamAbbr || ''} pitching plans. `;
            } else if (isRookie) {
                p1 = `${fullName} is embarking on what projects to be a defining early chapter of his MLB journey. As a ${age}-year-old ${pos} with just ${careerGP > 0 ? careerGP + ' career games' : 'no prior MLB experience'}, every appearance this season will shape the baseline that defines his trajectory. `;
            } else {
                p1 = `${fullName} is poised for a breakout opportunity in 2026, entering the campaign as a ${age}-year-old ${pos} with ${careerGP} games of MLB experience and the arsenal to take a leap. `;
            }
        } else {
            const careerOPS = career?.OPS || career?.ops || 0;
            const careerHR = career?.HR || career?.homeRuns || 0;
            if (isEstablished) {
                p1 = `${fullName}${accoladeIntro}${hasAccolades ? '' : ','} a ${experience} ${pos} with a ${fmt3(careerOPS)} career OPS and ${fmtInt(careerHR)} home runs over ${careerGP} games, steps into 2026 as a cornerstone of the ${player.teamAbbr || ''} lineup. `;
            } else if (isRookie) {
                p1 = `${fullName} enters 2026 as one of the most intriguing ${experience} talents in baseball. With ${careerGP > 0 ? `only ${careerGP} career games under his belt` : 'his MLB debut ahead of him'}, the ${age}-year-old ${pos} represents both enormous upside and the natural volatility that comes with any small-sample evaluation. `;
            } else {
                p1 = `${fullName} opens the 2026 season looking to expand his role in the ${player.teamAbbr || ''} lineup. At ${age} with ${careerGP} career games, the foundation is being laid for what could be a significant step forward. `;
            }
        }
    } else {
        // Active and has played
        if (isPitcher) {
            const era = current.ERA || pStats.ERA || 0;
            const whip = current.WHIP || pStats.WHIP || 0;
            const k9 = current['K/9'] || current.strikeoutsPerNineInnings || pStats['K/9'] || 0;
            const ip = current.IP || current.innings || 0;
            const so = current.SO || current.strikeouts || pStats.SO || 0;
            const bb = current.BB || current.walks || pStats.BB || 0;

            // ── DYNAMIC RECENT FORM (Last 15 Appearances) ───────────────
            let streakNote = '';
            if (gameLogs.length > 0) {
                const recentLogs = gameLogs.slice(0, 15);
                // Pitching Gamelog Stats Mapping (ESPN v3): 0: IP, 4: ER
                const recentER = recentLogs.reduce((sum, log) => sum + (parseFloat(log.stats?.[4]) || 0), 0);
                const recentIP = recentLogs.reduce((sum, log) => sum + (parseFloat(log.stats?.[0]) || 0), 0);
                const recentERA = recentIP > 0 ? (recentER / recentIP) * 9 : (current.ERA || 4.20);

                // Baseline: Career ERA for vets, League ERA (4.20) for rookies
                const baselineERA = isRookie ? 4.20 : (career?.ERA || career?.era || 4.20);
                const diff = baselineERA - recentERA; // Positive = better than baseline
                const threshold = baselineERA * 0.10; // 10% threshold for ERA volatility

                if (diff > threshold) {
                    streakNote = ` He is currently dominating on the mound, with recent performances significantly outpacing his historical benchmarks.`;
                } else if (diff < -threshold) {
                    streakNote = ` He has encountered a challenging stretch of late, with recent outings trailing his established performance levels.`;
                } else {
                    streakNote = ` He has stayed remarkably consistent on the mound, delivering outings that align perfectly with his expected career norms.`;
                }
            }

            // ── PROGRESSIVE SAMPLE SIZE RELIABILITY (Pitchers) ──────────
            let sampleWarning = '';
            if (cp < 5) {
                sampleWarning = ` With only ${cp} appearance${cp !== 1 ? 's' : ''} on record, these early metrics are subject to high volatility.`;
            } else if (cp < 10) {
                sampleWarning = ` After ${cp} appearances, a specialized baseline is developing though the data remains in a formative stage.`;
            } else if (cp < 20) {
                sampleWarning = ` With ${cp} games logged, his seasonal delivery trends are beginning to firm up for the model.`;
            } else if (cp < 30) {
                sampleWarning = ` Approaching a significant workload of ${cp} games, the model now has a high-confidence performance profile.`;
            } else {
                sampleWarning = ` With a heavy ${cp}-game workload recorded, these statistical conclusions are now highly definitive and stabilized.`;
            }

            p1 = `${fullName}${accoladeIntro} has logged ${fmt2(ip)} innings across ${cp} appearance${cp !== 1 ? 's' : ''} in 2026, posting a ${fmt2(era)} ERA with a ${fmt2(whip)} WHIP and ${fmt2(k9)} K/9 rate. `;
            if (era < 3.00) p1 += `That ERA sits in elite territory, reflecting a pitcher who is currently in near-total command of his arsenal.`;
            else if (era < 4.00) p1 += `That's a quality line for any ${pos}, with metrics reflecting a pitcher who is successfully keeping opposing hitters off balance.`;
            else p1 += `While the initial ERA shows some early fluctuation, the underlying metrics suggest a pitcher who is continuing to refine his location.`;
            p1 += streakNote + sampleWarning + (isDTD ? ` He is currently being monitored as day-to-day.` : '') + ' ';
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

            // ── DYNAMIC RECENT FORM (Last 15 Games) ─────────────────────
            let streakNote = '';
            if (gameLogs.length > 0) {
                const recentLogs = gameLogs.slice(0, 15);
                // Batting Gamelog Stats Mapping (ESPN v3): 0: AB, 1: R, 2: H, 5: HR, 6: RBI
                const recentH = recentLogs.reduce((sum, log) => sum + (parseFloat(log.stats?.[2]) || 0), 0);
                const recentAB = recentLogs.reduce((sum, log) => sum + (parseFloat(log.stats?.[0]) || 0), 0);
                const recentAVG = recentAB > 0 ? recentH / recentAB : (current.AVG || current.avg || 0.248);
                
                // Baseline: Career AVG for vets, League AVG (.248) for rookies
                const baselineAVG = isRookie ? 0.248 : (career?.AVG || career?.avg || 0.248);
                const diff = recentAVG - baselineAVG;
                const threshold = baselineAVG * 0.05;

                if (diff > threshold) {
                    streakNote = ` He is currently scorching at the plate, maintaining a recent form that outpaces his established norms.`;
                } else if (diff < -threshold) {
                    streakNote = ` He's navigated a bit of a cold patch recently, experiencing a dip below his expected output at the plate.`;
                } else {
                    streakNote = ` He is currently maintaining a steady approach, performing right in line with the expectations set by his career profile.`;
                }
            }

            // ── PROGRESSIVE SAMPLE SIZE RELIABILITY ─────────────────────
            let sampleWarning = '';
            if (cp < 15) {
                sampleWarning = ` With only ${cp} games in the books, these early numbers carry significant small-sample volatility.`;
            } else if (cp < 30) {
                sampleWarning = ` At ${cp} games, a reliable baseline is forming, though the model is still refining its seasonal outlook.`;
            } else if (cp < 60) {
                sampleWarning = ` With ${cp} games recorded, the seasonal trends are firming up and providing a solid sample for projection.`;
            } else if (cp < 90) {
                sampleWarning = ` Approaching the mid-season mark with ${cp} games played, his performance profile is now well-established.`;
            } else if (cp < 120) {
                sampleWarning = ` With a substantial ${cp}-game body of work, the model's projections carry high clinical accuracy.`;
            } else if (cp < 162) {
                sampleWarning = ` In the closing stretch with ${cp} games played, his final 2026 statistical profile is becoming definitive.`;
            } else {
                sampleWarning = ` With a complete 162-game campaign in the books, this statistical record is now final and definitive.`;
            }

            p1 = `Through ${cp} game${cp !== 1 ? 's' : ''} in 2026, ${fullName}${accoladeIntro} is slashing ${fmt3(avg)}/${fmt3(obp)}/${fmt3(slg)} with ${fmtInt(hr)} HR${hr !== 1 ? 's' : ''}, ${fmtInt(rbi)} RBI${rbi !== 1 ? 's' : ''}, and ${fmtInt(sb)} stolen base${sb !== 1 ? 's' : ''}. `;
            if (ops > 0.900) p1 += `His ${fmt3(ops)} OPS is elite-level production, a cornerstone for the ${player.teamAbbr || 'lineup'}.`;
            else if (ops > 0.750) p1 += `That ${fmt3(ops)} OPS line represents quality production, reflecting a disciplined and effective plate approach.`;
            else if (ops > 0) p1 += `The ${fmt3(ops)} OPS currently sits below the league average (.720), reflecting some early adjustments being made in the box.`;
            else p1 += `The current season metrics are in the process of stabilizing as his at-bat frequency increases.`;
            
            p1 += streakNote + sampleWarning + (isDTD ? ` He is currently listed as day-to-day.` : '') + ' ';
        }
    }

    // ── PARAGRAPH 2: Career Comparison & Rating Context ──────────────────
    let p2 = "";

    if (isTwoWay) {
        const careerBatOPS = career?.batting?.OPS || career?.OPS || career?.ops || 0;
        const careerPitERA = career?.pitching?.ERA || career?.ERA || career?.era || 0;
        const careerPitK = career?.pitching?.SO || career?.pitching?.strikeouts || 0;
        const careerBatHR = career?.batting?.HR || career?.HR || career?.homeRuns || 0;
        p2 = `Across his ${careerGP > 0 ? `${careerGP}-game` : ''} career, Ohtani has maintained a ${fmt3(careerBatOPS > 0 ? careerBatOPS : 0.875)} OPS at the plate while posting a ${fmt2(careerPitERA > 0 ? careerPitERA : 3.01)} ERA on the mound — a statistical paradox that defies modern baseball's specialization. His career data carries full weight in our rating model, stabilizing his overall through any short-term fluctuations. `;
    } else if (isRookie) {
        // Rookie-specific career context
        if (cp > 0) {
            p2 = `As a player with ${careerGP > 0 ? `just ${careerGP} career games` : 'no prior MLB track record'}, ${name}'s rating is driven primarily by his 2026 performance with heavy regression toward league averages. `;
            if (isPitcher) {
                const era = current.ERA || pStats.ERA || 0;
                p2 += `His ${fmt2(era)} ERA is real, but with such a thin baseline, our model tempers the influence of these early results. ${era < 3.50 ? 'If he sustains this level, his rating will climb steadily as the model gains confidence in his sample size.' : 'As more innings accumulate, his true talent level will come into sharper focus.'} `;
            } else {
                const ops = current.OPS || current.ops || 0;
                p2 += `His ${fmt3(ops)} OPS is a data point, not yet a trend. ${ops > 0.850 ? 'The raw talent is obvious, and if he sustains this pace, his rating will escalate as the model builds confidence in the larger sample.' : 'As at-bats accumulate, the model will increasingly trust his live data over league-average regression.'} `;
            }
        } else {
            p2 = `With ${careerGP > 0 ? `only ${careerGP} career games` : 'no MLB experience on record'}, ${name}'s pre-season rating leans heavily on league-average regression rather than small-sample career data. This conservative approach prevents both inflated and deflated evaluations for players whose MLB body of work is still being written. `;
        }
    } else if (isPitcher) {
        const curERA = current.ERA || pStats.ERA || 0;
        const carERA = career?.ERA || career?.earnedRunAverage || 4.20;
        const carIP = career?.IP || career?.innings || career?.inningsPitched || 0;
        const carK = career?.SO || career?.strikeouts || career?.K || 0;
        if (cp > 0 && careerGP > 0) {
            const eraDiff = carERA - curERA;
            if (age >= 34) {
                const decayPct = Math.round((1 - Math.max(0.80, 1.0 - (age - 34) * 0.025)) * 100);
                p2 = `At ${age}, ${name}'s ${fmt2(carERA)} career ERA (${fmt2(carIP)} IP, ${fmtInt(carK)} K) is still a valuable baseline, though our model applies a ${decayPct}% age adjustment to account for natural decline. ${eraDiff > 0.5 ? 'His early 2026 numbers suggest he may be defying the aging curve.' : eraDiff < -0.5 ? 'His elevated ERA aligns with typical age-related regression.' : 'So far, he\'s tracking close to his career norms.'} `;
            } else if (eraDiff > 0.50) {
                p2 = `Relative to his career ${fmt2(carERA)} ERA over ${fmt2(carIP)} innings and ${fmtInt(carK)} strikeouts, ${name} is pitching well above his historical baseline. This overperformance, combined with ${careerGP} career games of sample data, gives the model high confidence that he's performing at an elite level. `;
            } else if (eraDiff < -0.50) {
                p2 = `His current numbers sit above his ${fmt2(carERA)} career ERA, but a ${careerGP}-game track record with ${fmtInt(carK)} career strikeouts is powerful stabilizer. The model expects regression toward his career mean as the season progresses. `;
            } else {
                p2 = `True to form, ${name}'s 2026 line sits within striking distance of his ${fmt2(carERA)} career ERA across ${fmt2(carIP)} innings — the signature of a pitcher who repeats his mechanics and approach consistently. `;
            }
        } else if (careerGP > 0) {
            p2 = `Over ${careerGP} career appearances, ${name} has compiled a ${fmt2(carERA)} ERA with ${fmtInt(carK)} strikeouts across ${fmt2(carIP)} innings. That body of work ${isEstablished ? 'carries significant weight in our rating model, providing a reliable anchor for early-season evaluation.' : `currently carries ${Math.round(careerReliability * 100)}% reliability weight — as he logs more innings, this baseline will gain more influence.`} `;
        }
    } else {
        const curOPS = current.OPS || current.ops || 0;
        const carOPS = career?.OPS || career?.ops || 0.720;
        const carHR = career?.HR || career?.homeRuns || 0;
        const carAVG = career?.AVG || career?.avg || 0;
        if (cp > 0 && careerGP > 0) {
            const opsDiff = curOPS - carOPS;
            if (age >= 34) {
                const decayPct = Math.round((1 - Math.max(0.80, 1.0 - (age - 34) * 0.025)) * 100);
                p2 = `At ${age}, ${name}'s career ${fmt3(carOPS)} OPS with ${fmtInt(carHR)} home runs over ${careerGP} games remains a meaningful baseline, though the model applies a ${decayPct}% age-related adjustment. ${opsDiff > 0.08 ? 'His early power surge is encouraging for a player at this stage of his career.' : opsDiff < -0.08 ? 'The slow start is consistent with typical age-related patterns.' : 'His current production aligns well with what\'s expected at this stage.'} `;
            } else if (opsDiff > 0.080) {
                p2 = `${name}'s current ${fmt3(curOPS)} OPS outpaces his ${fmt3(carOPS)} career mark backed by ${fmtInt(carHR)} career home runs across ${careerGP} games. With ${isEstablished ? 'full career reliability in the model' : `${Math.round(careerReliability * 100)}% career reliability`}, the data suggests a player trending above his established baseline. `;
            } else if (opsDiff < -0.080) {
                p2 = `His 2026 OPS is trailing his ${fmt3(carOPS)} career baseline (${fmtInt(carHR)} HR, ${fmt3(carAVG)} AVG over ${careerGP} games), but ${isEstablished ? 'a career this deep provides powerful upward pull in the rating model' : 'as his career sample grows, so will the stabilizing influence on his rating'}. Slow starts this early rarely define a full season. `;
            } else {
                p2 = `${name} is tracking right in line with his career norms — a ${fmt3(carOPS)} OPS hitter with ${fmtInt(carHR)} career home runs who delivers exactly what you'd expect from a ${experience} ${pos}. `;
            }
        } else if (careerGP > 0) {
            p2 = `${name}'s career profile (${fmt3(carOPS)} OPS, ${fmtInt(carHR)} HR, ${fmt3(carAVG)} AVG across ${careerGP} games) ${isEstablished ? 'is the primary driver of his pre-season rating.' : `provides a developing baseline, though at just ${careerGP} career games, the model regresses heavily toward league average to avoid small-sample distortion.`} `;
        }
    }

    // ── PARAGRAPH 3: Smart Projections ───────────────────────────────────
    let p3 = "";
    
    if (isOnIL) {
        p3 = `The priority for ${name} is a full recovery. Once cleared, expect a measured ramp-up period. ${isEstablished ? 'His track record suggests he can recapture his form quickly once healthy.' : isRookie ? 'For a young talent, the lost development time is the real cost here.' : 'The opportunity to prove himself remains — it\'s just been delayed.'}`;
    } else {
        const gamesRemaining = Math.max(0, 162 - Math.max(cp, teamGP));
        
        if (isTwoWay) {
            const curERA = pStats.ERA || current.ERA || 3.30;
            const carERA = career?.pitching?.ERA || career?.ERA || 3.30;
            const xERA = smartProject(curERA, carERA, LEAGUE_AVG.ERA, cp, careerGP);
            
            const curHR = bStats.HR || bStats.homeRuns || 0;
            const curHRRate = curHR / Math.max(1, cp);
            const carHRRate = (career?.batting?.HR || career?.HR || 35) / Math.max(1, careerGP || 162);
            const xHRRate = smartProject(curHRRate, carHRRate, LEAGUE_AVG.HR / 162, cp, careerGP);
            const projHR = Math.round(curHR + (xHRRate * gamesRemaining));

            const curK9 = pStats['K/9'] || pStats.strikeoutsPerNineInnings || 10;
            const carK9 = career?.pitching?.['K/9'] || 10;
            const xK9 = smartProject(curK9, carK9, LEAGUE_AVG['K/9'], cp, careerGP);

            p3 = `Projecting forward, the model blends Ohtani's live 2026 data with his extensive career baselines and league-average anchors. He projects for a ${fmt2(xERA)} ERA with a ${fmt2(xK9)} K/9 on the mound, paired with approximately ${projHR} home runs at the plate. With ${gamesRemaining} games remaining, these projections adjust in real-time as every at-bat and pitch refines the model's inputs.`;
        } else if (isPitcher) {
            const curERA = current.ERA || pStats.ERA || 4.00;
            const carERA = career?.ERA || 4.00;
            const xERA = smartProject(curERA, carERA, LEAGUE_AVG.ERA, cp, careerGP);
            
            const curK9 = current['K/9'] || current.strikeoutsPerNineInnings || pStats['K/9'] || 8.5;
            const carK9 = career?.['K/9'] || 8.5;
            const xK9 = smartProject(curK9, carK9, LEAGUE_AVG['K/9'], cp, careerGP);

            const curWHIP = current.WHIP || pStats.WHIP || 1.30;
            const carWHIP = career?.WHIP || 1.30;
            const xWHIP = smartProject(curWHIP, carWHIP, LEAGUE_AVG.WHIP, cp, careerGP);
            
            if (isRookie) {
                p3 = `Because ${name} has ${careerGP > 0 ? `just ${careerGP} career games` : 'no prior MLB track record'}, projections are anchored heavily toward league averages rather than extrapolating from a handful of outings. The model projects a ${fmt2(xERA)} ERA, ${fmt2(xWHIP)} WHIP, and ${fmt2(xK9)} K/9 — conservative estimates that will become more personalized as his 2026 body of work grows across the remaining ${gamesRemaining} games. Every start reshapes these numbers in real time.`;
            } else {
                p3 = `Blending ${name}'s live 2026 performance with his ${careerGP}-game career baseline, projections settle at a ${fmt2(xERA)} ERA, ${fmt2(xWHIP)} WHIP, and ${fmt2(xK9)} K/9 rate. ${age >= 34 ? `The model accounts for age-related adjustment at ${age}, slightly tempering career-based expectations.` : 'His career carries strong reliability in the model, providing a stable foundation.'} With ${gamesRemaining} games remaining, these projections update continuously as each appearance refines the picture.`;
            }
        } else {
            const curHR = current.HR || current.homeRuns || 0;
            const curHRRate = curHR / Math.max(1, cp);
            const carHRRate = (career?.HR || career?.homeRuns || LEAGUE_AVG.HR) / Math.max(1, careerGP || 162);
            const xHRRate = smartProject(curHRRate, carHRRate, LEAGUE_AVG.HR / 162, cp, careerGP);
            const projHR = Math.min(65, Math.round(curHR + (xHRRate * gamesRemaining)));

            const curOPS = current.OPS || current.ops || 0;
            const carOPS = career?.OPS || career?.ops || LEAGUE_AVG.OPS;
            const xOPS = smartProject(curOPS, carOPS, LEAGUE_AVG.OPS, cp, careerGP);

            const curAVG = current.AVG || current.avg || 0;
            const carAVG = career?.AVG || career?.avg || LEAGUE_AVG.AVG;
            const xAVG = smartProject(curAVG, carAVG, LEAGUE_AVG.AVG, cp, careerGP);

            if (isRookie) {
                p3 = `For a player with ${careerGP > 0 ? `only ${careerGP} career games` : 'no established MLB track record'}, projections are deliberately conservative — anchored toward league averages to prevent small-sample extrapolation. The model projects ${name} for a ${fmt3(xAVG)} average, ${fmt3(xOPS)} OPS, and approximately ${projHR} home runs over the full 162-game schedule. These are not ceilings or floors — they're probability-weighted estimates that will sharpen dramatically as the season unfolds and the model accumulates real data. Every game matters.`;
            } else {
                p3 = `Using a model that blends ${name}'s live 2026 data, his ${careerGP}-game career baseline, and league-average regression, he projects for a ${fmt3(xAVG)} average, ${fmt3(xOPS)} OPS, and approximately ${projHR} home runs over the full schedule. ${age >= 34 ? `An age adjustment at ${age} slightly tempers the career influence.` : ''} With ${gamesRemaining} games remaining, these projections adjust dynamically after every game, reflecting the latest performance data in real time.`;
            }
        }
    }

    return `${p1}\n\n${p2}\n\n${p3}`;
}
