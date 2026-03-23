'use client';

import { useState, useEffect, useRef } from 'react';

export default function GameDetailPage({ gameId, onBack }) {
    const [game, setGame] = useState(null);
    const [plays, setPlays] = useState([]);
    const [keyPlays, setKeyPlays] = useState([]);
    const [boxscore, setBoxscore] = useState(null);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef(null);

    const fetchGame = async () => {
        try {
            const res = await fetch(`/api/games/${gameId}`);
            if (!res.ok) throw new Error('Failed');
            const json = await res.json();
            setGame(json.game);
            setPlays(json.plays || []);
            setKeyPlays(json.keyPlays || []);
            setBoxscore(json.boxscore || null);
        } catch (err) {
            console.error('Game fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!gameId) return;
        fetchGame();
        timerRef.current = setInterval(fetchGame, 10000);
        return () => clearInterval(timerRef.current);
    }, [gameId]);

    if (loading) {
        return (
            <div className="page-container">
                <button className="back-btn" onClick={onBack}>Back</button>
                <div className="game-detail">
                    <div className="skeleton" style={{ height: '140px', borderRadius: '16px', marginBottom: '16px' }} />
                    <div className="skeleton" style={{ height: '300px', borderRadius: '12px' }} />
                </div>
            </div>
        );
    }

    if (!game) {
        return (
            <div className="page-container">
                <button className="back-btn" onClick={onBack}>Back</button>
                <div className="empty-state"><h3>Game Not Found</h3></div>
            </div>
        );
    }

    const isLive = game.state === 'in';
    const isFinal = game.state === 'post';
    const status = game.shortDetail || game.statusDetail || '';
    const sit = game.situation;

    return (
        <div className="page-container">
            <button className="back-btn" onClick={onBack}>Back to Scores</button>

            <div className="game-detail">
                {/* Scoreboard */}
                <div className="game-detail-header">
                    <div className="game-detail-team">
                        <img src={game.away?.logo} alt={game.away?.name} className="team-logo" onError={(e) => { e.target.style.display = 'none'; }} />
                        <span className="team-name">{game.away?.abbr || game.away?.name}</span>
                        <span className="team-record">{game.away?.record}</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div className="game-detail-score">
                            {game.away?.score ?? 0} &ndash; {game.home?.score ?? 0}
                        </div>
                        <div className="game-detail-status">
                            {isLive && <span className="live-dot" style={{ display: 'inline-block', marginRight: '6px' }} />}
                            {status || (isFinal ? 'Final' : '')}
                        </div>
                    </div>
                    <div className="game-detail-team">
                        <img src={game.home?.logo} alt={game.home?.name} className="team-logo" onError={(e) => { e.target.style.display = 'none'; }} />
                        <span className="team-name">{game.home?.abbr || game.home?.name}</span>
                        <span className="team-record">{game.home?.record}</span>
                    </div>
                </div>

                {/* Live Situation: Batter/Pitcher + Diamond */}
                {isLive && sit && (
                    <div className="card" style={{ padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                            <Diamond situation={sit} />
                            <Outs count={sit.outs} />
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                {sit.balls}-{sit.strikes}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {sit.batter && (
                                <div style={{ flex: 1, minWidth: '140px', padding: '8px 12px', background: 'rgba(var(--accent-rgb, 99,102,241), 0.08)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '4px' }}>At Bat</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{sit.batter}</div>
                                    {sit.batterSummary && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{sit.batterSummary}</div>}
                                </div>
                            )}
                            {sit.pitcher && (
                                <div style={{ flex: 1, minWidth: '140px', padding: '8px 12px', background: 'rgba(var(--accent-rgb, 99,102,241), 0.08)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '4px' }}>Pitching</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{sit.pitcher}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        {sit.pitcherSummary || ''}
                                        {sit.pitchCount != null && <span> · {sit.pitchCount}P</span>}
                                        {sit.pitcherERA != null && <span> · {sit.pitcherERA} ERA</span>}
                                        {sit.pitcherK != null && <span> · {sit.pitcherK}K</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Linescore */}
                {game.linescore && (
                    <div className="card" style={{ padding: '12px', marginBottom: '16px', overflow: 'auto' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Linescore</h3>
                        <table className="linescore-table">
                            <thead>
                                <tr>
                                    <th className="team-col"></th>
                                    {game.linescore.innings?.map((_, i) => (<th key={i}>{i + 1}</th>))}
                                    <th className="total-col">R</th>
                                    <th className="total-col">H</th>
                                    <th className="total-col">E</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="team-col">{game.away?.abbr}</td>
                                    {game.linescore.innings?.map((inn, i) => (<td key={i}>{inn.away ?? '-'}</td>))}
                                    <td className="total-col">{game.away?.score ?? 0}</td>
                                    <td className="total-col">{game.linescore.awayHits ?? '-'}</td>
                                    <td className="total-col">{game.linescore.awayErrors ?? '-'}</td>
                                </tr>
                                <tr>
                                    <td className="team-col">{game.home?.abbr}</td>
                                    {game.linescore.innings?.map((inn, i) => (<td key={i}>{inn.home ?? '-'}</td>))}
                                    <td className="total-col">{game.home?.score ?? 0}</td>
                                    <td className="total-col">{game.linescore.homeHits ?? '-'}</td>
                                    <td className="total-col">{game.linescore.homeErrors ?? '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Live Box Score */}
                {boxscore && (boxscore.home?.batters?.length > 0 || boxscore.away?.batters?.length > 0) && (
                    <BoxscoreTabs boxscore={boxscore} away={game.away} home={game.home} />
                )}

                {/* Key Plays */}
                {keyPlays.length > 0 && (
                    <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-green)' }}>
                            Key Plays
                        </h3>
                        <div className="play-by-play">
                            {keyPlays.map((play, i) => (
                                <div key={i} className="play-item scoring">
                                    <span className="play-inning">{play.inning}</span>
                                    <span className="play-text">{play.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Play-by-Play */}
                <div className="card" style={{ padding: '16px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                        Play-by-Play
                        {isLive && <span style={{ fontSize: '10px', color: 'var(--accent-green)', fontWeight: 600 }}>LIVE</span>}
                    </h3>
                    {plays.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                            {isLive ? 'Waiting for plays...' : 'No play-by-play available.'}
                        </p>
                    ) : (
                        <div className="play-by-play">
                            {plays.map((play, i) => (
                                <div key={i} className={`play-item ${play.isScoring ? 'scoring' : ''}`}>
                                    <span className="play-inning">{play.inning}</span>
                                    <span className="play-text">{play.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Game Info */}
                {(game.venue || game.broadcast) && (
                    <div className="card" style={{ padding: '16px', marginTop: '16px' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Game Info</h3>
                        {game.venue && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{game.venue}</p>}
                        {game.broadcast && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{game.broadcast}</p>}
                        {game.startTime && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                {new Date(game.startTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function BoxscoreTabs({ boxscore, away, home }) {
    const [activeTab, setActiveTab] = useState('away');

    const data = activeTab === 'away' ? boxscore.away : boxscore.home;
    const team = activeTab === 'away' ? away : home;
    if (!data) return null;

    return (
        <div className="card" style={{ padding: '16px', marginBottom: '16px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button 
                    style={{ flex: 1, padding: '10px', border: 'none', background: activeTab === 'away' ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: activeTab === 'away' ? '#fff' : 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                    onClick={() => setActiveTab('away')}>{away?.abbr || away?.name} Box</button>
                <button 
                    style={{ flex: 1, padding: '10px', border: 'none', background: activeTab === 'home' ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: activeTab === 'home' ? '#fff' : 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                    onClick={() => setActiveTab('home')}>{home?.abbr || home?.name} Box</button>
            </div>

            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Hitters</h4>
            <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table className="linescore-table" style={{ width: '100%', fontSize: '13px' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', minWidth: '140px' }}>Batter</th>
                            {data.labels?.batting?.map((l, i) => <th key={i} style={{ textAlign: 'right' }}>{l}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.batters?.map((b, idx) => (
                            <tr key={b.id || idx}>
                                <td style={{ textAlign: 'left', fontWeight: b.starter ? 600 : 400 }}>
                                    {b.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '4px' }}>{b.position}</span>
                                </td>
                                {b.stats?.map((s, i) => <td key={i} style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{s}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Pitchers</h4>
            <div style={{ overflowX: 'auto' }}>
                <table className="linescore-table" style={{ width: '100%', fontSize: '13px' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', minWidth: '140px' }}>Pitcher</th>
                            {data.labels?.pitching?.map((l, i) => <th key={i} style={{ textAlign: 'right' }}>{l}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.pitchers?.map((p, idx) => (
                            <tr key={p.id || idx}>
                                <td style={{ textAlign: 'left', fontWeight: p.starter ? 600 : 400 }}>
                                    {p.name}
                                </td>
                                {p.stats?.map((s, i) => <td key={i} style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{s}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Diamond({ situation }) {
    const fill = 'rgba(245,158,11,1)';
    const empty = 'transparent';
    const stroke = 'rgba(100,116,139,0.6)';
    return (
        <div className="diamond-wrap">
            <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <rect x="16" y="2" width="8" height="8" rx="1"
                    transform="rotate(45 20 6)"
                    fill={situation.onSecond ? fill : empty}
                    stroke={situation.onSecond ? fill : stroke} strokeWidth="1.5" />
                <rect x="2" y="16" width="8" height="8" rx="1"
                    transform="rotate(45 6 20)"
                    fill={situation.onThird ? fill : empty}
                    stroke={situation.onThird ? fill : stroke} strokeWidth="1.5" />
                <rect x="30" y="16" width="8" height="8" rx="1"
                    transform="rotate(45 34 20)"
                    fill={situation.onFirst ? fill : empty}
                    stroke={situation.onFirst ? fill : stroke} strokeWidth="1.5" />
            </svg>
        </div>
    );
}

function Outs({ count }) {
    return (
        <div className="outs-indicator">
            {[0, 1, 2].map(i => (
                <div key={i} className={`out-dot ${i < count ? 'active' : ''}`} />
            ))}
        </div>
    );
}
