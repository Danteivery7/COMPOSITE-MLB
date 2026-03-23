'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Returns a rich status object for a game based on its ESPN state and timing.
 *
 *   Pre-game:  >30 min → scheduled (show start time)
 *              ≤30 min → "Starting Soon"
 *              ≤5 min  → "About to Start"
 *   In-game:   Top/Bot/Mid + inning ordinal
 *   Post-game: "Final" → hidden 12 hours after game end
 */
function getGameStatus(game) {
    const now = Date.now();
    const start = game.startTime ? new Date(game.startTime).getTime() : null;
    const minsUntil = start ? (start - now) / 60000 : null;

    if (game.state === 'post') {
        // Approximate game-end time: start + 3.5 h  (typical MLB game length)
        const estimatedEnd = start ? start + 3.5 * 3600000 : now;
        const hoursSinceEnd = (now - estimatedEnd) / 3600000;
        if (hoursSinceEnd >= 12) {
            return { type: 'expired', label: 'Final', hide: true };
        }
        return { type: 'final', label: 'Final', cssClass: 'final' };
    }

    if (game.state === 'in') {
        // Build inning label from ESPN data
        const inning = game.period || 0;
        const ordinal = getOrdinal(inning);

        // Determine half-inning: ESPN statusDetail often contains "Top 3rd", "Bot 5th", "Mid 7th"
        // Also available: situation.isTopInning and inningHalf/shortDetail
        let halfLabel = '';
        const detail = (game.shortDetail || game.statusDetail || '').toLowerCase();
        if (detail.startsWith('mid')) {
            halfLabel = 'Mid';
        } else if (detail.startsWith('bot') || detail.startsWith('bottom')) {
            halfLabel = 'Bot';
        } else if (detail.startsWith('top')) {
            halfLabel = 'Top';
        } else if (detail.startsWith('end')) {
            halfLabel = 'End';
        } else if (game.situation && game.situation.isTopInning !== null) {
            halfLabel = game.situation.isTopInning ? 'Top' : 'Bot';
        } else {
            halfLabel = 'In';
        }

        return {
            type: 'live',
            label: `${halfLabel} ${ordinal}`,
            cssClass: 'live',
            isLive: true,
        };
    }

    // Pre-game
    if (minsUntil !== null && minsUntil <= 5 && minsUntil > 0) {
        return { type: 'about-to-start', label: '🔥 About to Start', cssClass: 'about-to-start' };
    }
    if (minsUntil !== null && minsUntil <= 30 && minsUntil > 0) {
        return { type: 'starting-soon', label: 'Starting Soon', cssClass: 'starting-soon' };
    }
    return { type: 'scheduled', label: null, cssClass: 'scheduled' };
}

/** 1st, 2nd, 3rd, 4th … */
function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function LivePage({ onGameClick }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const timerRef = useRef(null);

    const fetchScores = async () => {
        try {
            const res = await fetch('/api/scores');
            if (!res.ok) throw new Error('Failed to fetch scores');
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
        fetchScores();
        // Auto-refresh every 10 seconds
        timerRef.current = setInterval(fetchScores, 10000);
        return () => clearInterval(timerRef.current);
    }, []);

    const formatTime = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const formatLastUpdated = (isoString) => {
        if (!isoString) return 'Never';
        const d = new Date(isoString);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Live Scores</h1>
                    <p className="page-subtitle">Loading today&apos;s games...</p>
                </div>
                <div className="games-grid">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-card" style={{ height: '160px' }} />
                    ))}
                </div>
            </div>
        );
    }

    // Filter out expired games (Final > 12 hours ago)
    const allGames = data?.games || [];
    const visibleGames = allGames.filter(g => !getGameStatus(g).hide);

    // Sort: active → about to start → starting soon → pre → final
    const sortOrder = { 'live': 0, 'about-to-start': 1, 'starting-soon': 2, 'scheduled': 3, 'final': 4 };
    const games = [...visibleGames].sort((a, b) => {
        const sa = sortOrder[getGameStatus(a).type] ?? 3;
        const sb = sortOrder[getGameStatus(b).type] ?? 3;
        return sa - sb;
    });

    const hasLiveGames = games.some(g => g.state === 'in');
    const startingSoonCount = games.filter(
        g => ['starting-soon', 'about-to-start'].includes(getGameStatus(g).type)
    ).length;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Live Scores</h1>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <p className="page-subtitle">
                        {data?.date || 'Today'} · {games.length} game{games.length !== 1 ? 's' : ''}
                        {hasLiveGames && <span style={{ color: 'var(--accent-green)', marginLeft: '8px' }}>● Games in progress</span>}
                        {!hasLiveGames && startingSoonCount > 0 && (
                            <span style={{ color: 'var(--accent-yellow)', marginLeft: '8px' }}>
                                Starting: {startingSoonCount} starting soon
                            </span>
                        )}
                    </p>
                    <div className="last-updated">
                        <span>Updated: {formatLastUpdated(data?.lastUpdated)}</span>
                        {data?.stale && <span style={{ color: 'var(--accent-yellow)' }}> (cached)</span>}
                        <span className="refresh-icon" onClick={fetchScores}></span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
            )}

            {games.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <h3>No Games Right Now</h3>
                    <p>Check back later for upcoming MLB games.</p>
                </div>
            ) : (
                <div className="games-grid">
                    {games.map((game, idx) => (
                        <GameCard key={game.id || idx} game={game} formatTime={formatTime} index={idx} onGameClick={onGameClick} />
                    ))}
                </div>
            )}
        </div>
    );
}

function GameCard({ game, formatTime, index, onGameClick }) {
    const status = getGameStatus(game);
    const isLive = status.type === 'live';
    const isFinal = status.type === 'final';
    const isPre = ['scheduled', 'starting-soon', 'about-to-start'].includes(status.type);

    return (
        <div className={`game-card ${isLive ? 'live' : ''} ${status.type === 'about-to-start' ? 'about-to-start' : ''}`} style={{ animationDelay: `${index * 50}ms` }} onClick={() => onGameClick && game.id && onGameClick(game.id)}>
            <div className={`game-status ${status.cssClass}`}>
                {isLive && <span className="live-dot" />}
                {status.type === 'about-to-start' && <span className="pulse-dot" />}
                <span>
                    {status.label
                        ? status.label
                        : formatTime(game.startTime)}
                </span>
            </div>

            <div className="game-teams">
                <TeamRow
                    team={game.away}
                    isWinner={isFinal && game.away?.winner}
                    isLoser={isFinal && !game.away?.winner}
                    showScore={!isPre}
                />
                <div className="game-divider" />
                <TeamRow
                    team={game.home}
                    isWinner={isFinal && game.home?.winner}
                    isLoser={isFinal && !game.home?.winner}
                    showScore={!isPre}
                />
            </div>

            {isLive && game.situation && (
                <div className="game-footer" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Diamond situation={game.situation} />
                        <Outs count={game.situation.outs} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {game.situation.balls}-{game.situation.strikes}
                        </span>
                    </div>
                    {/* Live Matchup Strings */}
                    {(game.situation.pitcher || game.situation.batter) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
                            {game.situation.pitcher && <div><span style={{ color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>P:</span><span style={{ color: 'var(--text-primary)' }}>{game.situation.pitcher}</span></div>}
                            {game.situation.batter && <div><span style={{ color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>AB:</span><span style={{ color: 'var(--text-primary)' }}>{game.situation.batter}</span></div>}
                        </div>
                    )}
                </div>
            )}

            {isFinal && game.postGameOptions && (
                <div className="game-postgame">
                    <div className="postgame-decisions">
                        {game.postGameOptions.winningPitcher && (
                            <div className="decision-pill">
                                <strong>W:</strong>
                                <img src={game.postGameOptions.winningPitcher.headshot} alt="W" onError={(e) => e.target.style.display='none'} />
                                <span>{game.postGameOptions.winningPitcher.name}</span>
                            </div>
                        )}
                        {game.postGameOptions.losingPitcher && (
                            <div className="decision-pill">
                                <strong>L:</strong>
                                <img src={game.postGameOptions.losingPitcher.headshot} alt="L" onError={(e) => e.target.style.display='none'} />
                                <span>{game.postGameOptions.losingPitcher.name}</span>
                            </div>
                        )}
                        {game.postGameOptions.savingPitcher && (
                            <div className="decision-pill">
                                <strong>S:</strong>
                                <img src={game.postGameOptions.savingPitcher.headshot} alt="S" onError={(e) => e.target.style.display='none'} />
                                <span>{game.postGameOptions.savingPitcher.name}</span>
                            </div>
                        )}
                    </div>
                    {game.postGameOptions.pog && (
                        <div className="pog-banner">
                            <div className="pog-tag">👑 POG</div>
                            <img src={game.postGameOptions.pog.headshot} alt="POG" className="pog-headshot" onError={(e) => e.target.style.display='none'} />
                            <div className="pog-info">
                                <span className="pog-name">{game.postGameOptions.pog.name}</span>
                                <span className="pog-stats">{game.postGameOptions.pog.statLine}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function TeamRow({ team, isWinner, isLoser, showScore }) {
    if (!team) return null;

    return (
        <div className={`game-team-row ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}`}>
            <img
                src={team.logo}
                alt={team.name}
                className="team-logo"
                onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="team-name">{team.abbr || team.name}</span>
            <span className="team-record">{team.record}</span>
            {showScore && <span className="team-score">{team.score}</span>}
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
                {/* 2nd base - top center */}
                <rect x="16" y="2" width="8" height="8" rx="1"
                    transform="rotate(45 20 6)"
                    fill={situation.onSecond ? fill : empty}
                    stroke={situation.onSecond ? fill : stroke} strokeWidth="1.5" />
                {/* 3rd base - left */}
                <rect x="2" y="16" width="8" height="8" rx="1"
                    transform="rotate(45 6 20)"
                    fill={situation.onThird ? fill : empty}
                    stroke={situation.onThird ? fill : stroke} strokeWidth="1.5" />
                {/* 1st base - right */}
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
