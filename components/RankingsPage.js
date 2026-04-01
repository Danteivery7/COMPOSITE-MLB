'use client';

import { useState, useEffect, useMemo } from 'react';

export default function RankingsPage({ favorites, toggleFavorite, onTeamClick }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [league, setLeague] = useState('All');
    const [division, setDivision] = useState('All');
    const [sortBy, setSortBy] = useState('ovrRank');
    const [refreshing, setRefreshing] = useState(false);

    const fetchRankings = async () => {
        try {
            setRefreshing(true);
            const res = await fetch('/api/rankings');
            if (!res.ok) throw new Error('Failed to fetch');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Rankings fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchRankings();
        const timer = setInterval(fetchRankings, 10000);
        return () => clearInterval(timer);
    }, []);

    const filteredRankings = useMemo(() => {
        if (!data?.rankings) return [];
        let result = [...data.rankings];

        // Filter by league
        if (league !== 'All') {
            result = result.filter(t => t.league === league);
        }

        // Filter by division
        if (division !== 'All') {
            result = result.filter(t => t.division === division);
        }

        // Search
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(t =>
                t.fullName?.toLowerCase().includes(q) ||
                t.abbr?.toLowerCase().includes(q) ||
                t.city?.toLowerCase().includes(q) ||
                t.name?.toLowerCase().includes(q)
            );
        }

        // Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'ovrRank': return a.ovrRank - b.ovrRank;
                case 'hottness': return (b.hotScore || 0) - (a.hotScore || 0);
                case 'offRank': return a.offRank - b.offRank;
                case 'defRank': return a.defRank - b.defRank;
                case 'winPct':
                case 'ovrRecord': return b.winPct - a.winPct;
                case 'xRecord': return (b.pyWinPct || 0) - (a.pyWinPct || 0);
                case 'runDiff': return b.runDiff - a.runDiff;
                case 'name': return a.fullName.localeCompare(b.fullName);
                default: return a.ovrRank - b.ovrRank;
            }
        });

        return result;
    }, [data, search, league, division, sortBy]);

    const getRankClass = (rank) => {
        if (rank <= 5) return 'top-5';
        if (rank <= 10) return 'top-10';
        if (rank <= 20) return 'mid';
        return 'bottom';
    };

    const formatLastUpdated = (iso) => {
        if (!iso) return 'Never';
        return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Rankings</h1>
                    <p className="page-subtitle">Loading composite rankings...</p>
                </div>
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="skeleton skeleton-row" />
                ))}
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Composite Rankings</h1>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <p className="page-subtitle">
                        {data?.sources?.length || 0} active sources · {filteredRankings.length} teams
                    </p>
                    <div className="last-updated">
                        <span>Updated: {formatLastUpdated(data?.lastUpdated)}</span>
                        <span className="refresh-icon" onClick={fetchRankings} style={{ opacity: refreshing ? 0.5 : 1 }}></span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="rankings-controls">
                <div className="search-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search teams..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    {['All', 'AL', 'NL'].map(l => (
                        <button
                            key={l}
                            className={`filter-btn ${league === l ? 'active' : ''}`}
                            onClick={() => setLeague(l)}
                        >
                            {l}
                        </button>
                    ))}
                </div>

                <div className="filter-group">
                    {['All', 'East', 'Central', 'West'].map(d => (
                        <button
                            key={d}
                            className={`filter-btn ${division === d ? 'active' : ''}`}
                            onClick={() => setDivision(d)}
                        >
                            {d}
                        </button>
                    ))}
                </div>

                <select
                    className="sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="ovrRank">Sort: OVR Rank</option>
                    <option value="hottness">Sort: Hottness 🔥</option>
                    <option value="offRank">Sort: OFF Rank</option>
                    <option value="defRank">Sort: DEF Rank</option>
                    <option value="winPct">Sort: Win %</option>
                    <option value="ovrRecord">Sort: OVR Record</option>
                    <option value="runDiff">Sort: Run Diff</option>
                    <option value="xRecord">Sort: xRecord</option>
                    <option value="name">Sort: Name</option>
                </select>
            </div>

            {/* Active Sources */}
            {data?.failedSources?.length > 0 && (
                <div className="card" style={{ marginBottom: '16px', padding: '12px 16px', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                    <p style={{ fontSize: '12px', color: 'var(--accent-yellow)' }}>
                        ⚠️ Unavailable sources: {data.failedSources.join(', ')} — rankings computed from remaining sources
                    </p>
                </div>
            )}

            {/* Table */}
            <div className="table-wrapper">
                <table className="rankings-table">
                    <thead>
                        <tr>
                            <th onClick={() => setSortBy('ovrRank')} className={sortBy === 'ovrRank' ? 'sorted' : ''}>Rank</th>
                            <th>Team</th>
                            <th onClick={() => setSortBy('ovrRank')} className={sortBy === 'ovrRank' ? 'sorted' : ''}>OVR Score</th>
                            <th onClick={() => setSortBy('offRank')} className={sortBy === 'offRank' ? 'sorted' : ''}>OFF</th>
                            <th onClick={() => setSortBy('defRank')} className={sortBy === 'defRank' ? 'sorted' : ''}>DEF</th>
                            <th onClick={() => setSortBy('ovrRecord')} className={sortBy === 'ovrRecord' ? 'sorted' : ''}>Record</th>
                            <th onClick={() => setSortBy('runDiff')} className={sortBy === 'runDiff' ? 'sorted' : ''}>Run Diff</th>
                            <th onClick={() => setSortBy('xRecord')} className={sortBy === 'xRecord' ? 'sorted' : ''}>xRecord</th>
                            <th onClick={() => setSortBy('hottness')} className={sortBy === 'hottness' ? 'sorted' : ''}>Streak</th>
                            <th>Fav</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRankings.map((team, idx) => (
                            <tr key={team.id} className="team-row" style={{ animationDelay: `${idx * 30}ms` }}>
                                <td className={`rank-cell ${team.ovrRank <= 3 ? `rank-${team.ovrRank}` : ''}`}>
                                    {team.ovrRank}
                                </td>
                                <td>
                                    <div className="team-cell" onClick={() => onTeamClick(team.id)} style={{ cursor: 'pointer' }}>
                                        <img
                                            src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(team.logoAbbr || team.abbr)?.toLowerCase()}.png`}
                                            alt={team.name}
                                            className="team-logo"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        <div className="team-info">
                                            <div className="team-name-row">
                                                <span className="team-name">{team.city} {team.name}</span>
                                                <span className={`streak-tag ${team.streakNum > 0 ? 'up' : team.streakNum < 0 ? 'down' : ''}`}>
                                                    {team.streak}
                                                </span>
                                            </div>
                                            <div className="last-5-row">
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{team.wins}-{team.losses}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="score-cell">{team.ovrScore?.toFixed(1)}</td>
                                <td><span className={`rank-badge ${getRankClass(team.offRank)}`}>{team.offRank}</span></td>
                                <td><span className={`rank-badge ${getRankClass(team.defRank)}`}>{team.defRank}</span></td>
                                <td className="score-cell">{(team.winPct * 100).toFixed(1)}%</td>
                                <td className="score-cell" style={{ color: team.runDiff > 0 ? 'var(--accent-green)' : team.runDiff < 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                                    {team.runDiff > 0 ? '+' : ''}{team.runDiff}
                                </td>
                                <td>
                                    {(() => {
                                        const gp = team.gamesPlayed || (team.wins + team.losses) || 0;
                                        const pyPct = team.pyWinPct || 0;
                                        const xW = Math.round(pyPct * gp);
                                        const xL = Math.max(0, gp - xW);
                                        const diff = xW - (team.wins || 0);
                                        const color = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
                                        return <span style={{ color, fontWeight: 600, fontSize: '12px' }}>{xW}-{xL}</span>;
                                    })()}
                                </td>
                                <td>
                                    {team.streakNum !== 0 ? (
                                        <span className={`trend-chip ${team.streakNum > 0 ? 'up' : 'down'}`}>
                                            {team.streak}
                                        </span>
                                    ) : (
                                        <span className="trend-chip same">—</span>
                                    )}
                                </td>
                                <td>
                                    <button
                                        className={`fav-star ${favorites.includes(team.id) ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(team.id); }}
                                    >
                                        {favorites.includes(team.id) ? '★' : '☆'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
