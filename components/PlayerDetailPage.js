'use client';

import { useState, useEffect } from 'react';

export default function PlayerDetailPage({ playerId, onBack }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!playerId) return;
        setLoading(true);
        fetch(`/api/players/${playerId}`)
            .then(res => res.json())
            .then(json => { setData(json); setLoading(false); })
            .catch(() => setLoading(false));
    }, [playerId]);

    if (loading) {
        return (
            <div className="page-container">
                <button className="back-btn" onClick={onBack}>← Back</button>
                <div className="player-detail">
                    <div className="skeleton" style={{ height: '120px', borderRadius: '16px', marginBottom: '16px' }} />
                    <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
                </div>
            </div>
        );
    }

    const p = data?.player;
    if (!p) {
        return (
            <div className="page-container">
                <button className="back-btn" onClick={onBack}>← Back</button>
                <div className="empty-state"><h3>Player Not Found</h3></div>
            </div>
        );
    }

    const ratingColor = p.rating >= 85 ? 'var(--accent-green)' :
        p.rating >= 70 ? 'var(--accent)' :
            p.rating >= 55 ? 'var(--accent-yellow)' : 'var(--text-muted)';
    const teamLogo = `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(p.teamLogoAbbr || p.teamAbbr)?.toLowerCase()}.png`;

    return (
        <div className="page-container">
            <button className="back-btn" onClick={onBack}>← Back</button>
            <div className="player-detail">
                {/* Hero */}
                <div className="player-hero">
                    <img src={p.headshot} alt={p.name} className="player-hero-img"
                        onError={(e) => { e.target.src = 'https://a.espncdn.com/i/headshots/nophoto.png'; }} />
                    <div className="player-hero-info">
                        <h2>{p.name}</h2>
                        <div className="player-meta-line">
                            <img src={teamLogo} alt={p.teamAbbr} style={{ width: 20, height: 20 }} onError={(e) => { e.target.style.display = 'none'; }} />
                            <span>{p.teamName}</span> · <span>{p.position}</span>
                            {p.jersey && <span>· #{p.jersey}</span>}
                        </div>
                        <div className="player-meta-line" style={{ marginTop: 4 }}>
                            {p.age && <span>Age {p.age}</span>}
                            {p.height && <span>· {p.height}</span>}
                            {p.weight && <span>· {p.weight}</span>}
                            {p.batHand && <span>· B: {p.batHand}</span>}
                            {p.throwHand && <span>· T: {p.throwHand}</span>}
                        </div>
                    </div>
                    <div className="player-hero-rating">
                        <div className="rating-num" style={{ color: ratingColor }}>{p.rating}</div>
                        <div className="rating-label">OVR</div>
                    </div>
                </div>

                {/* AI Performance Analysis */}
                {p.aiAnalysis && (
                    <div className="card ai-analysis-card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--accent)', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '20px' }}>🤖</span>
                            <h3 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent)' }}>AI Performance Analysis</h3>
                        </div>
                        <div style={{ fontSize: '15px', lineHeight: '1.7', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                            {p.aiAnalysis.split('\n\n').map((para, i) => (
                                <p key={i} style={{ marginBottom: i < p.aiAnalysis.split('\n\n').length - 1 ? '12px' : 0 }}>
                                    "{para}"
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {/* Next Game Props */}
                {p.playerProps && (
                    <div className="card" style={{ marginBottom: '24px', borderLeft: `4px solid ${p.playerProps.lineupStatus === 'not-in-lineup' ? 'var(--accent-red, #ef4444)' : 'var(--accent-green, #10b981)'}`, padding: '20px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '20px' }}>🎯</span>
                                <h3 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent-green, #10b981)' }}>
                                    {p.playerProps.allProps?.[0]?.isModel ? 'AI Model Projections' : 'Next Game Props'}
                                </h3>
                                {p.playerProps.allProps?.[0]?.isModel ? (
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>🤖 AI PROJECTION</span>
                                ) : (
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green, #10b981)' }}>🎯 VERIFIED LINE</span>
                                )}
                                {p.playerProps.lineupStatus === 'in-lineup' && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green, #10b981)' }}>IN LINEUP ✓</span>}
                                {p.playerProps.lineupStatus === 'not-in-lineup' && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.12)', color: 'var(--accent-red, #ef4444)' }}>NOT IN LINEUP</span>}
                            </div>
                            <div className="prop-opponent" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {p.playerProps.opponent?.logo && <img src={p.playerProps.opponent.logo} alt="" style={{ width: '20px', height: '20px' }} onError={e => e.target.style.display='none'} />}
                                <span style={{ fontWeight: 700 }}>{p.playerProps.opponent?.isHome ? 'vs' : '@'} {p.playerProps.opponent?.abbr}</span>
                                <span style={{ color: 'var(--text-muted)' }}>· #{p.playerProps.oppRank}</span>
                            </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                            {(p.playerProps.allProps || []).map((prop, i) => (
                                <div key={i} style={{ padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '6px' }}>{prop.category}</div>
                                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '4px' }}>{prop.line}</div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: prop.direction === 'Over' ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)' }}>{prop.direction}</div>
                                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '4px', opacity: 0.6 }}>{Math.round(prop.confidence * 100)}% Conf</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Current Season Stats (determines OVR) */}
                {p.isTwoWay ? (
                    <>
                        <CurrentPitcherStats stats={p.pitchingStats} expected={p.expectedPitching} isTwoWay />
                        <CurrentBatterStats stats={p.battingStats} expected={p.expectedBatting} isTwoWay />
                    </>
                ) : p.isPitcher ? (
                    <CurrentPitcherStats stats={p.currentStats} expected={p.expectedStats} />
                ) : (
                    <CurrentBatterStats stats={p.currentStats} expected={p.expectedStats} />
                )}

                {/* Career Stats */}
                {p.isTwoWay ? (
                    <>
                        <CareerPitcherStats stats={p.careerPitching} isTwoWay />
                        <CareerBatterStats stats={p.careerBatting} isTwoWay />
                    </>
                ) : p.isPitcher ? (
                    <CareerPitcherStats stats={p.careerStats} />
                ) : (
                    <CareerBatterStats stats={p.careerStats} />
                )}
            </div>
        </div>
    );
}

const f = (v, d = 3) => v != null && v !== 0 ? (typeof v === 'number' ? v.toFixed(d) : v) : '–';
const fi = (v) => v != null && v !== 0 ? Math.round(v) : '–';

function CurrentBatterStats({ stats, expected, isTwoWay }) {
    const s = stats || {};
    return (
        <>
            <div className="stats-section">
                <h3>{isTwoWay ? 'Current Season (Hitting)' : 'Current Season'}</h3>
                <div className="stats-grid-4">
                    <SC l="AVG" v={f(s.AVG || s.avg || s.battingAverage)} />
                    <SC l="OBP" v={f(s.OBP || s.onBasePct)} />
                    <SC l="SLG" v={f(s.SLG || s.slugAvg)} />
                    <SC l="OPS" v={f(s.OPS || s.ops)} />
                </div>
                <div className="stats-grid-4" style={{ marginTop: 8 }}>
                    <SC l="HR" v={fi(s.homeRuns || s.HR)} />
                    <SC l="RBI" v={fi(s.RBIs || s.RBI)} />
                    <SC l="R" v={fi(s.runs || s.R)} />
                    <SC l="H" v={fi(s.hits || s.H)} />
                </div>
                <div className="stats-grid-4" style={{ marginTop: 8 }}>
                    <SC l="BB" v={fi(s.walks || s.BB)} />
                    <SC l="SO" v={fi(s.strikeouts || s.SO)} />
                    <SC l="SB" v={fi(s.stolenBases || s.SB)} />
                    <SC l="WAR" v={f(s.WAR, 1)} />
                </div>
            </div>
            {expected && Object.keys(expected).length > 0 && (
                <div className="stats-section">
                    <h3>Expected Stats</h3>
                    <div className="stats-grid-4">
                        {expected.xAVG != null && <SC l="xAVG" v={f(expected.xAVG)} ex />}
                        {expected.xSLG != null && <SC l="xSLG" v={f(expected.xSLG)} ex />}
                        {expected.xOPS != null && <SC l="xOPS" v={f(expected.xOPS)} ex />}
                        {expected.xWAR != null && <SC l="xWAR" v={f(expected.xWAR, 1)} ex />}
                    </div>
                </div>
            )}
        </>
    );
}

function CurrentPitcherStats({ stats, expected, isTwoWay }) {
    const s = stats || {};
    return (
        <>
            <div className="stats-section">
                <h3>{isTwoWay ? 'Current Season (Pitching)' : 'Current Season'}</h3>
                <div className="stats-grid-4">
                    <SC l="ERA" v={f(s.ERA || s.earnedRunAverage, 2)} />
                    <SC l="WHIP" v={f(s.WHIP, 2)} />
                    <SC l="K/9" v={f(s.strikeoutsPerNineInnings || s['K/9'], 2)} />
                    <SC l="W%" v={f(s.winPct || s['W%'], 3)} />
                </div>
                <div className="stats-grid-4" style={{ marginTop: 8 }}>
                    <SC l="W" v={fi(s.wins || s.W)} />
                    <SC l="L" v={fi(s.losses || s.L)} />
                    <SC l="K" v={fi(s.strikeouts || s.SO || s.K)} />
                    <SC l="BB" v={fi(s.walks || s.BB)} />
                </div>
                <div className="stats-grid-4" style={{ marginTop: 8 }}>
                    <SC l="IP" v={f(s.inningsPitched || s.IP || s.innings, 1)} />
                    <SC l="HR" v={fi(s.homeRuns || s.HR)} />
                    <SC l="GP" v={fi(s.gamesPlayed || s.GP)} />
                    <SC l="WAR" v={f(s.WAR, 1)} />
                </div>
            </div>
            {expected && Object.keys(expected).length > 0 && (
                <div className="stats-section">
                    <h3>Expected Stats</h3>
                    <div className="stats-grid-4">
                        {expected.xERA != null && <SC l="xERA" v={f(expected.xERA, 2)} ex />}
                        {expected.xWHIP != null && <SC l="xWHIP" v={f(expected.xWHIP, 2)} ex />}
                        {expected.xK9 != null && <SC l="xK/9" v={f(expected.xK9, 2)} ex />}
                        {expected.xWAR != null && <SC l="xWAR" v={f(expected.xWAR, 1)} ex />}
                    </div>
                </div>
            )}
        </>
    );
}

function CareerBatterStats({ stats, isTwoWay }) {
    const s = stats || {};
    return (
        <div className="stats-section" style={{ opacity: 0.85 }}>
            <h3>{isTwoWay ? 'Career Stats (Hitting)' : 'Career Stats'}</h3>
            <div className="stats-grid-4">
                <SC l="AVG" v={f(s.AVG || s.avg)} />
                <SC l="OBP" v={f(s.OBP || s.onBasePct)} />
                <SC l="SLG" v={f(s.SLG || s.slugAvg)} />
                <SC l="OPS" v={f(s.OPS || s.ops)} />
            </div>
            <div className="stats-grid-4" style={{ marginTop: 8 }}>
                <SC l="HR" v={fi(s.homeRuns || s.HR)} />
                <SC l="RBI" v={fi(s.RBIs || s.RBI)} />
                <SC l="BB" v={fi(s.walks || s.BB)} />
                <SC l="H" v={fi(s.hits || s.H)} />
            </div>
            <div className="stats-grid-4" style={{ marginTop: 8 }}>
                <SC l="R" v={fi(s.runs || s.R)} />
                <SC l="SB" v={fi(s.stolenBases || s.SB)} />
                <SC l="SO" v={fi(s.strikeouts || s.SO)} />
                <SC l="WAR" v={f(s.WAR, 1)} />
            </div>
        </div>
    );
}

function CareerPitcherStats({ stats, isTwoWay }) {
    const s = stats || {};
    return (
        <div className="stats-section" style={{ opacity: 0.85 }}>
            <h3>{isTwoWay ? 'Career Stats (Pitching)' : 'Career Stats'}</h3>
            <div className="stats-grid-4">
                <SC l="ERA" v={f(s.ERA || s.earnedRunAverage, 2)} />
                <SC l="WHIP" v={f(s.WHIP, 2)} />
                <SC l="W" v={fi(s.wins || s.W)} />
                <SC l="L" v={fi(s.losses || s.L)} />
            </div>
            <div className="stats-grid-4" style={{ marginTop: 8 }}>
                <SC l="K" v={fi(s.strikeouts || s.SO)} />
                <SC l="BB" v={fi(s.walks || s.BB)} />
                <SC l="IP" v={f(s.inningsPitched || s.IP, 1)} />
                <SC l="WAR" v={f(s.WAR, 1)} />
            </div>
        </div>
    );
}

function SC({ l, v, ex }) {
    return (
        <div className={`stat-card-mini ${ex ? 'expected' : ''}`}>
            <div className="stat-value">{v}</div>
            <div className="stat-label">{l}</div>
        </div>
    );
}
