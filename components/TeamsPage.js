'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

export default function TeamsPage({ favorites, toggleFavorite, onTeamClick }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [league, setLeague] = useState('All');
    const [division, setDivision] = useState('All');
    const [search, setSearch] = useState('');
    const timerRef = useRef(null);

    const fetchRankings = async () => {
        try {
            const res = await fetch('/api/rankings');
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRankings();
        timerRef.current = setInterval(fetchRankings, 10000);
        return () => clearInterval(timerRef.current);
    }, []);

    const filtered = useMemo(() => {
        if (!data?.rankings) return [];
        let result = [...data.rankings];

        if (league !== 'All') result = result.filter(t => t.league === league);
        if (division !== 'All') result = result.filter(t => t.division === division);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(t =>
                t.fullName?.toLowerCase().includes(q) ||
                t.abbr?.toLowerCase().includes(q)
            );
        }

        return result.sort((a, b) => a.ovrRank - b.ovrRank);
    }, [data, league, division, search]);

    const favoriteTeams = useMemo(() => {
        if (!data?.rankings) return [];
        return data.rankings.filter(t => favorites.includes(t.id));
    }, [data, favorites]);

    const getRankClass = (rank) => {
        if (rank <= 5) return 'top-5';
        if (rank <= 10) return 'top-10';
        if (rank <= 20) return 'mid';
        return 'bottom';
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Teams</h1>
                </div>
                <div className="teams-grid">
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-card" style={{ height: '180px' }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Teams</h1>
                <p className="page-subtitle">All 30 MLB teams — click for details</p>
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
                        <button key={l} className={`filter-btn ${league === l ? 'active' : ''}`} onClick={() => setLeague(l)}>
                            {l}
                        </button>
                    ))}
                </div>

                <div className="filter-group">
                    {['All', 'East', 'Central', 'West'].map(d => (
                        <button key={d} className={`filter-btn ${division === d ? 'active' : ''}`} onClick={() => setDivision(d)}>
                            {d}
                        </button>
                    ))}
                </div>
            </div>

            {/* Favorites */}
            {favoriteTeams.length > 0 && (
                <div className="favorites-section">
                    <h2>Favorites</h2>
                    <div className="teams-grid">
                        {favoriteTeams.map((team, idx) => (
                            <TeamCard
                                key={team.id}
                                team={team}
                                isFavorite={true}
                                onFavToggle={() => toggleFavorite(team.id)}
                                onClick={() => onTeamClick(team.id)}
                                getRankClass={getRankClass}
                                index={idx}
                            />
                        ))}
                    </div>
                    <div className="section-divider" />
                </div>
            )}

            {/* All Teams */}
            <div className="teams-grid">
                {filtered.map((team, idx) => (
                    <TeamCard
                        key={team.id}
                        team={team}
                        isFavorite={favorites.includes(team.id)}
                        onFavToggle={() => toggleFavorite(team.id)}
                        onClick={() => onTeamClick(team.id)}
                        getRankClass={getRankClass}
                        index={idx}
                    />
                ))}
            </div>
        </div>
    );
}

function TeamCard({ team, isFavorite, onFavToggle, onClick, getRankClass, index }) {
    return (
        <div
            className="team-card"
            style={{ '--team-color': team.color, animationDelay: `${index * 40}ms` }}
            onClick={onClick}
        >
            <div className="team-card-header">
                <img
                    src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(team.logoAbbr || team.abbr)?.toLowerCase()}.png`}
                    alt={team.name}
                    className="team-logo"
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="team-info">
                    <h3>{team.city} {team.name}</h3>
                    <span className="team-sub">{team.league} {team.division} · {team.wins}-{team.losses}</span>
                </div>
                <button
                    className={`fav-star ${isFavorite ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onFavToggle(); }}
                    style={{ marginLeft: 'auto' }}
                >
                    {isFavorite ? '★' : '☆'}
                </button>
            </div>

            <div className="team-card-ranks">
                <div className="rank-item">
                    <div className="rank-label">OVR</div>
                    <div className={`rank-value`} style={{ color: getRankClass(team.ovrRank) === 'top-5' ? 'var(--accent-green)' : getRankClass(team.ovrRank) === 'bottom' ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                        #{team.ovrRank}
                    </div>
                </div>
                <div className="rank-item">
                    <div className="rank-label">OFF</div>
                    <div className="rank-value">#{team.offRank}</div>
                </div>
                <div className="rank-item">
                    <div className="rank-label">DEF</div>
                    <div className="rank-value">#{team.defRank}</div>
                </div>
            </div>
        </div>
    );
}
