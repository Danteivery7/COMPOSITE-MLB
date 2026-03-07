'use client';

import { useState, useEffect, useRef } from 'react';

export default function TeamDetailPage({ teamId, onBack, favorites, toggleFavorite, onPlayerClick }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef(null);

    const fetchTeam = async () => {
        try {
            const r = await fetch(`/api/teams/${teamId}`);
            if (r.ok) {
                const d = await r.json();
                setData(d);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchTeam();
        timerRef.current = setInterval(fetchTeam, 10000);
        return () => clearInterval(timerRef.current);
    }, [teamId]);

    if (loading) {
        return (
            <div className="page-container">
                <button className="back-btn" onClick={onBack}>← Back</button>
                <div className="page-header">
                    <h1 className="page-title">Loading…</h1>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-card" style={{ height: '120px' }} />
                    ))}
                </div>
            </div>
        );
    }

    const team = data?.team || {};
    const roster = data?.roster || [];
    const lastFive = data?.lastFiveGames || [];
    const sources = data?.sources || [];

    const logo = `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(team.logoAbbr || team.abbr)?.toLowerCase()}.png`;

    return (
        <div className="page-container">
            <button className="back-btn" onClick={onBack}>← Back to Teams</button>

            {/* ── Hero Header ──────────────────────────────────────────── */}
            <div className="team-hero" style={{ '--team-color': team.color || '#3b82f6' }}>
                <img src={logo} alt={team.name} className="team-hero-logo" onError={e => e.target.style.display = 'none'} />
                <div className="team-hero-info">
                    <h1 className="page-title">{team.fullName}</h1>
                    <p className="page-subtitle">{team.league} {team.division} · {team.wins || 0}-{team.losses || 0}</p>
                    <div className="team-hero-ranks">
                        <RankPill label="OVR" value={team.ovrRank} />
                        <RankPill label="OFF" value={team.offRank} />
                        <RankPill label="DEF" value={team.defRank} />
                    </div>
                </div>
            </div>

            {/* ── Composite Score Card ─────────────────────────────────── */}
            <div className="detail-section">
                <h2 className="section-title">Composite Breakdown</h2>
                <div className="stats-grid">
                    <StatCard label="OVR Score" value={team.ovrScore?.toFixed(1)} />
                    <StatCard label="OFF Score" value={team.offScore?.toFixed(1)} />
                    <StatCard label="DEF Score" value={team.defScore?.toFixed(1)} />
                    <StatCard label="Win%" value={team.winPct ? (team.winPct * 100).toFixed(1) + '%' : '–'} />
                    <StatCard label="Run Diff" value={team.runDiff > 0 ? `+${team.runDiff}` : team.runDiff || '0'} />
                    <StatCard label="Pythag W%" value={team.pyWinPct ? (team.pyWinPct * 100).toFixed(1) + '%' : '–'} />
                </div>
            </div>

            {/* ── Advanced Stats ───────────────────────────────────────── */}
            <div className="detail-section">
                <h2 className="section-title">⚡ Advanced Analytics</h2>
                <div className="stats-two-col">
                    <div>
                        <h3 className="subsection-title">Offense</h3>
                        <div className="stat-list">
                            <StatRow label="Runs/Game" value={team.rpg || '–'} />
                            <StatRow label="Team OPS" value={team.teamOPS?.toFixed(3) || '–'} />
                            <StatRow label="Team OBP" value={team.teamOBP?.toFixed(3) || '–'} />
                            <StatRow label="Team SLG" value={team.teamSLG?.toFixed(3) || '–'} />
                            <StatRow label="Team AVG" value={team.teamAVG?.toFixed(3) || '–'} />
                            <StatRow label="ISO" value={team.teamISO?.toFixed(3) || '–'} />
                            <StatRow label="RC/27" value={team.teamRC27?.toFixed(1) || '–'} />
                            <StatRow label="Team HR" value={team.teamHR || '–'} />
                            <StatRow label="SB" value={team.teamSB || '–'} />
                            <StatRow label="XBH" value={team.teamXBH || '–'} />
                            <StatRow label="BB/K" value={team.teamBBK?.toFixed(2) || '–'} />
                        </div>
                    </div>
                    <div>
                        <h3 className="subsection-title">Pitching / Defense</h3>
                        <div className="stat-list">
                            <StatRow label="Opp R/G" value={team.oppRpg || '–'} />
                            <StatRow label="Team ERA" value={team.teamERA?.toFixed(2) || '–'} />
                            <StatRow label="Team WHIP" value={team.teamWHIP?.toFixed(3) || '–'} />
                            <StatRow label="Team K's" value={team.teamK || '–'} />
                            <StatRow label="K/9" value={team.teamK9?.toFixed(1) || '–'} />
                            <StatRow label="Opp OPS" value={team.teamOppOPS?.toFixed(3) || '–'} />
                            <StatRow label="Opp OBA" value={team.teamOppOBA?.toFixed(3) || '–'} />
                            <StatRow label="Opp OBP" value={team.teamOppOBP?.toFixed(3) || '–'} />
                            <StatRow label="Opp SLG" value={team.teamOppSLG?.toFixed(3) || '–'} />
                            <StatRow label="Quality Starts" value={team.teamQS || '–'} />
                            <StatRow label="Saves" value={team.teamSV || '–'} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Last 5 Games ─────────────────────────────────────────── */}
            <div className="detail-section">
                <h2 className="section-title">Last 5 Games</h2>
                {lastFive.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No recent games available</p>
                ) : (
                    <div className="last-five-grid">
                        {lastFive.map((g, i) => (
                            <div key={g.id || i} className={`last-five-card ${g.result === 'W' ? 'win' : 'loss'}`}>
                                <div className="l5-result">
                                    <span className={`l5-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                                    <span className="l5-score">{g.teamScore} - {g.oppScore}</span>
                                </div>
                                <div className="l5-opp">
                                    <span className="l5-label">{g.isHome ? 'vs' : '@'}</span>
                                    {(g.opponent?.logo || g.opponent?.abbr) && (
                                        <img
                                            src={g.opponent.logo || `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${g.opponent.abbr.toLowerCase()}.png`}
                                            alt={g.opponent?.abbr}
                                            className="l5-logo"
                                            onError={e => e.target.style.display = 'none'}
                                        />
                                    )}
                                    <span className="l5-opp-name">{g.opponent?.abbr}</span>
                                </div>
                                <div className="l5-date">
                                    {new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Source Rankings ───────────────────────────────────────── */}
            {sources.length > 0 && team.sourceRankings && (
                <div className="detail-section">
                    <h2 className="section-title">📈 Source Rankings</h2>
                    <div className="source-ranks-grid">
                        {sources.map(s => {
                            const sr = team.sourceRankings[s.id];
                            if (!sr) return null;
                            return (
                                <div key={s.id} className="source-rank-chip">
                                    <span className="src-name">{s.name}</span>
                                    <span className="src-scope">{s.scope}</span>
                                    <span className={`src-rank ${sr.rank <= 5 ? 'top5' : sr.rank <= 10 ? 'top10' : sr.rank <= 20 ? 'mid' : 'bottom'}`}>
                                        #{sr.rank}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Full Roster ─────────────────────────────────────────── */}
            <div className="detail-section">
                <h2 className="section-title">👥 Full Roster ({roster.length} players)</h2>
                {roster.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Roster unavailable</p>
                ) : (
                    <div className="roster-table-wrap">
                        <table className="rankings-table roster-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>#</th>
                                    <th>Player</th>
                                    <th>Pos</th>
                                    <th>Age</th>
                                    <th>B/T</th>
                                    <th style={{ textAlign: 'right' }}>Rating</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roster.map((p, i) => (
                                    <RosterRow key={p.id} player={p} index={i} onPlayerClick={onPlayerClick} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function RankPill({ label, value }) {
    return (
        <div className="rank-pill">
            <span className="rp-label">{label}</span>
            <span className="rp-value">#{value || '–'}</span>
        </div>
    );
}

function StatCard({ label, value }) {
    return (
        <div className="mini-stat-card">
            <span className="msc-value">{value ?? '–'}</span>
            <span className="msc-label">{label}</span>
        </div>
    );
}

function StatRow({ label, value }) {
    return (
        <div className="stat-row">
            <span className="sr-label">{label}</span>
            <span className="sr-value">{value}</span>
        </div>
    );
}

function RosterRow({ player, index, onPlayerClick }) {
    const p = player;
    const ratingClass = p.rating >= 85 ? 'elite' : p.rating >= 70 ? 'great' : p.rating >= 55 ? 'good' : 'avg';

    return (
        <tr className="team-row player-row-clickable" style={{ animationDelay: `${index * 15}ms` }} onClick={() => onPlayerClick && onPlayerClick(p.id)}>
            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{p.jersey || '–'}</td>
            <td>
                <div className="player-cell">
                    <img
                        src={p.headshot}
                        alt={p.name}
                        className="player-headshot-sm"
                        onError={e => { e.target.src = 'https://a.espncdn.com/i/headshots/nophoto.png'; }}
                    />
                    <span className="player-name">{p.name}</span>
                </div>
            </td>
            <td>
                <span className={`pos-badge ${p.isPitcher ? 'pitcher' : 'hitter'}`}>
                    {p.position}
                </span>
            </td>
            <td style={{ color: 'var(--text-secondary)' }}>{p.age || '–'}</td>
            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.batHand}/{p.throwHand}</td>
            <td style={{ textAlign: 'right' }}>
                <span className={`player-rating ${ratingClass}`}>{p.rating}</span>
            </td>
        </tr>
    );
}
