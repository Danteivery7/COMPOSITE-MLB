'use client';

import { useState, useEffect, useRef } from 'react';

export default function PlayersPage({ onPlayerClick }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [posFilter, setPosFilter] = useState('All');
    const timerRef = useRef(null);

    const fetchPlayers = async () => {
        try {
            const res = await fetch('/api/players');
            if (!res.ok) throw new Error('Failed to fetch players');
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlayers();
        timerRef.current = setInterval(fetchPlayers, 10000); // refresh every 10 sec
        return () => clearInterval(timerRef.current);
    }, []);

    const formatLastUpdated = (isoString) => {
        if (!isoString) return 'Never';
        return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    };

    const positionGroups = ['All', 'Hitters', 'Pitchers'];

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Top 50 Players</h1>
                    <p className="page-subtitle">Loading player ratings...</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {[...Array(15)].map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: '52px', borderRadius: '8px' }} />
                    ))}
                </div>
            </div>
        );
    }

    let players = data?.players || [];

    // Filter by position group
    if (posFilter === 'Hitters') players = players.filter(p => !p.isPitcher);
    if (posFilter === 'Pitchers') players = players.filter(p => p.isPitcher);

    // Search
    if (search) {
        const q = search.toLowerCase();
        players = players.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.teamName.toLowerCase().includes(q) ||
            p.teamAbbr.toLowerCase().includes(q) ||
            p.position.toLowerCase().includes(q)
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Top 50 Players</h1>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <p className="page-subtitle">
                        Rated by advanced analytics · {data?.totalPlayers || 0} total players tracked
                    </p>
                    <div className="last-updated">
                        <span>Updated: {formatLastUpdated(data?.lastUpdated)}</span>
                        <span className="refresh-icon" onClick={fetchPlayers}></span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
            )}

            <div className="rankings-controls">
                <div className="search-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                        className="search-input"
                        placeholder="Search players..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    {positionGroups.map(pg => (
                        <button
                            key={pg}
                            className={`filter-btn ${posFilter === pg ? 'active' : ''}`}
                            onClick={() => setPosFilter(pg)}
                        >
                            {pg}
                        </button>
                    ))}
                </div>
            </div>

            {players.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <h3>No Players Found</h3>
                    <p>Try adjusting your search or filter.</p>
                </div>
            ) : (
                <div className="players-table-wrap">
                    <table className="rankings-table players-table">
                        <thead>
                            <tr>
                                <th style={{ width: '50px' }}>Rank</th>
                                <th>Player</th>
                                <th>Pos</th>
                                <th>Team</th>
                                <th style={{ textAlign: 'right' }}>Rating</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p, idx) => (
                                <PlayerRow key={p.id} player={p} index={idx} onPlayerClick={onPlayerClick} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function PlayerRow({ player, index, onPlayerClick }) {
    const p = player;
    const ratingClass = p.rating >= 85 ? 'elite' : p.rating >= 70 ? 'great' : p.rating >= 55 ? 'good' : 'avg';

    return (
        <tr className="team-row player-row-clickable" style={{ animationDelay: `${index * 25}ms` }} onClick={() => onPlayerClick && onPlayerClick(p.id)}>
            <td className={`rank-cell ${p.rank <= 3 ? `rank-${p.rank}` : ''}`}>
                {p.rank}
            </td>
            <td>
                <div className="player-cell">
                    <img
                        src={p.headshot}
                        alt={p.name}
                        className="player-headshot"
                        onError={(e) => { e.target.src = `https://a.espncdn.com/i/headshots/nophoto.png`; }}
                    />
                    <div className="player-info">
                        <span className="player-name">{p.name}</span>
                        <span className="player-meta">#{p.jersey} · {p.batHand && `B: ${p.batHand}`} {p.throwHand && `T: ${p.throwHand}`}</span>
                    </div>
                </div>
            </td>
            <td>
                <span className={`pos-badge ${p.isPitcher ? 'pitcher' : 'hitter'}`}>
                    {p.position}
                </span>
            </td>
            <td>
                <div className="player-team-cell">
                    <img
                        src={p.teamLogo}
                        alt={p.teamAbbr}
                        className="team-logo-sm"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span>{p.teamAbbr}</span>
                </div>
            </td>
            <td style={{ textAlign: 'right' }}>
                <span className={`player-rating ${ratingClass}`}>
                    {p.rating}
                </span>
            </td>
        </tr>
    );
}
