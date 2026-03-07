'use client';

import { useState, useEffect } from 'react';
import { MLB_TEAMS } from '@/lib/teams';

export default function SettingsPage({ favorites, toggleFavorite, theme, toggleTheme }) {
    const [dataStatus, setDataStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check data source status by calling rankings API
        fetch('/api/rankings')
            .then(res => res.json())
            .then(data => {
                setDataStatus({
                    sources: data.sources || [],
                    failedSources: data.failedSources || [],
                    lastUpdated: data.lastUpdated,
                    teamCount: data.rankings?.length || 0,
                });
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const favoriteTeams = MLB_TEAMS.filter(t => favorites.includes(t.id));

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Manage favorites, appearance, and data sources</p>
            </div>

            <div className="settings-grid">
                {/* Theme */}
                <div className="settings-card">
                    <h3>Appearance</h3>
                    <div className="status-item">
                        <span style={{ fontSize: '14px' }}>Theme</span>
                        <button className="theme-toggle" onClick={toggleTheme}>
                            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        </button>
                    </div>
                    <div className="status-item">
                        <span style={{ fontSize: '14px' }}>Current</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, textTransform: 'capitalize' }}>
                            {theme} Mode
                        </span>
                    </div>
                </div>

                {/* Data Status */}
                <div className="settings-card">
                    <h3>Data Sources</h3>
                    {loading ? (
                        <div className="skeleton skeleton-text" style={{ height: '80px' }} />
                    ) : dataStatus ? (
                        <>
                            {dataStatus.sources.map(source => (
                                <div key={source.id} className="status-item">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className={`status-dot ${source.active ? 'active' : 'error'}`} />
                                        <span style={{ fontSize: '14px' }}>{source.name}</span>
                                    </div>
                                    <span style={{ fontSize: '12px', color: source.active ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        {source.active ? 'Active' : 'Offline'}
                                    </span>
                                </div>
                            ))}

                            {dataStatus.failedSources.length > 0 && (
                                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--accent-yellow)' }}>
                                    ⚠️ Unavailable: {dataStatus.failedSources.join(', ')}
                                </div>
                            )}

                            <div className="status-item" style={{ borderBottom: 'none' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last updated</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {dataStatus.lastUpdated ? new Date(dataStatus.lastUpdated).toLocaleString() : 'Never'}
                                </span>
                            </div>

                            <div className="status-item" style={{ borderBottom: 'none' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Teams tracked</span>
                                <span style={{ fontSize: '12px', fontWeight: 700 }}>{dataStatus.teamCount}/30</span>
                            </div>
                        </>
                    ) : (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unable to load status</p>
                    )}
                </div>

                {/* Refresh Settings */}
                <div className="settings-card">
                    <h3>Auto-Refresh</h3>
                    <div className="status-item">
                        <span style={{ fontSize: '14px' }}>Live Scores</span>
                        <span style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600 }}>Every 30s</span>
                    </div>
                    <div className="status-item">
                        <span style={{ fontSize: '14px' }}>Rankings</span>
                        <span style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600 }}>Every 60s</span>
                    </div>
                    <div className="status-item">
                        <span style={{ fontSize: '14px' }}>Player Stats</span>
                        <span style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600 }}>Every 5m</span>
                    </div>
                    <button
                        className="theme-toggle"
                        style={{ width: '100%', marginTop: '12px', background: 'var(--accent)', color: '#fff', fontWeight: 700 }}
                        onClick={async () => {
                            try {
                                await fetch('/api/refresh', { method: 'POST' });
                                alert('✅ All caches cleared! Data will refresh on next load.');
                                window.location.reload();
                            } catch {
                                alert('❌ Failed to refresh. Try again.');
                            }
                        }}
                    >
                        Force Refresh All Stats
                    </button>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Clears all cached data and forces a fresh sync from ESPN
                    </p>
                </div>

                {/* Favorites */}
                <div className="settings-card">
                    <h3>Favorites ({favoriteTeams.length})</h3>
                    {favoriteTeams.length === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            No favorites yet. Star teams from the Rankings or Teams page.
                        </p>
                    ) : (
                        <>
                            {favoriteTeams.map(team => (
                                <div key={team.id} className="status-item">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <img
                                            src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(team.logoAbbr || team.abbr)?.toLowerCase()}.png`}
                                            alt={team.name}
                                            style={{ width: '24px', height: '24px', borderRadius: '4px' }}
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{team.city} {team.name}</span>
                                    </div>
                                    <button
                                        className="fav-star active"
                                        onClick={() => toggleFavorite(team.id)}
                                        title="Remove from favorites"
                                    >
                                        
                                    </button>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* About */}
                <div className="settings-card">
                    <h3>About</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <strong>Composite MLB Rankings</strong> computes team power rankings using multiple data sources
                        including win percentage, run differential, and Pythagorean win expectation.
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                        The prediction engine runs Monte Carlo simulations with Poisson-distributed scoring
                        models to estimate game outcomes.
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
                        Data sourced from ESPN&apos;s public API · Computed in real-time
                    </p>
                </div>
            </div>
        </div>
    );
}
