'use client';

import { useState, useEffect } from 'react';
import { MLB_TEAMS } from '@/lib/teams';

export default function PredictorPage() {
    const [teamAId, setTeamAId] = useState('');
    const [teamBId, setTeamBId] = useState('');
    const [formEmphasis, setFormEmphasis] = useState(50);
    const [neutralSite, setNeutralSite] = useState(false);
    const [prediction, setPrediction] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const canPredict = teamAId && teamBId && teamAId !== teamBId;

    const runPrediction = async () => {
        if (!canPredict) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamA: teamAId,
                    teamB: teamBId,
                    formEmphasis: formEmphasis / 100,
                    neutralSite,
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Prediction failed');
            }

            const data = await res.json();
            setPrediction(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const teamA = MLB_TEAMS.find(t => t.id === teamAId);
    const teamB = MLB_TEAMS.find(t => t.id === teamBId);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Game Predictor</h1>
                <p className="page-subtitle">Monte Carlo simulation engine · 3,000 sims per matchup</p>
            </div>

            <div className="predictor-layout">
                {/* Selector Panel */}
                <div className="predictor-selector">
                    <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Select Matchup</h3>

                    {/* Team A */}
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                        Team A (Away)
                    </label>
                    <select
                        className="team-select"
                        value={teamAId}
                        onChange={(e) => setTeamAId(e.target.value)}
                    >
                        <option value="">Select team...</option>
                        {MLB_TEAMS.map(t => (
                            <option key={t.id} value={t.id} disabled={t.id === teamBId}>
                                {t.city} {t.name} ({t.abbr})
                            </option>
                        ))}
                    </select>

                    {/* VS */}
                    <div className="vs-divider">
                        <div className="vs-badge">VS</div>
                    </div>

                    {/* Team B */}
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                        Team B (Home)
                    </label>
                    <select
                        className="team-select"
                        value={teamBId}
                        onChange={(e) => setTeamBId(e.target.value)}
                    >
                        <option value="">Select team...</option>
                        {MLB_TEAMS.map(t => (
                            <option key={t.id} value={t.id} disabled={t.id === teamAId}>
                                {t.city} {t.name} ({t.abbr})
                            </option>
                        ))}
                    </select>

                    {/* Options */}
                    <div className="slider-group">
                        <label>Recent Form Emphasis: {formEmphasis}%</label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={formEmphasis}
                            onChange={(e) => setFormEmphasis(parseInt(e.target.value))}
                        />
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="neutral"
                            checked={neutralSite}
                            onChange={(e) => setNeutralSite(e.target.checked)}
                        />
                        <label htmlFor="neutral">Neutral site (no home advantage)</label>
                    </div>

                    <button
                        className="predict-btn"
                        onClick={runPrediction}
                        disabled={!canPredict || loading}
                    >
                        {loading ? 'Running Simulation...' : 'Run Prediction'}
                    </button>

                    {teamAId === teamBId && teamAId && (
                        <p style={{ color: 'var(--accent-red)', fontSize: '12px', marginTop: '8px' }}>
                            Please select two different teams
                        </p>
                    )}
                </div>

                {/* Results Panel */}
                <div>
                    {error && (
                        <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', marginBottom: '16px' }}>
                            <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                        </div>
                    )}

                    {!prediction && !loading && (
                        <div className="predictor-results" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                            <div className="empty-state">
                                <div className="empty-icon"></div>
                                <h3>Select a Matchup</h3>
                                <p>Choose two teams and run the prediction engine</p>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="predictor-results" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '48px', animation: 'spin 1s linear infinite', display: 'inline-block' }}></div>
                                <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Running 3,000 simulations...</p>
                            </div>
                        </div>
                    )}

                    {prediction && !loading && (
                        <div className="predictor-results">
                            <div className="result-header">
                                <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Prediction Results
                                </h3>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Based on {prediction.simulations?.toLocaleString()} simulations
                                </p>
                            </div>

                            {/* Win Probability Bars */}
                            <div className="win-pcts">
                                <div className="win-pct-team">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '4px' }}>
                                        {teamA && (
                                            <img
                                                src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(teamA.logoAbbr || teamA.abbr)?.toLowerCase()}.png`}
                                                alt={teamA.name}
                                                style={{ width: '24px', height: '24px' }}
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        )}
                                        <span className="win-pct-label">{prediction.teamA.abbr}</span>
                                    </div>
                                    <div className="win-pct-value">{prediction.teamA.winPct}%</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>({prediction.teamA.americanOdds > 0 ? '+' : ''}{prediction.teamA.americanOdds})</div>
                                </div>
                                <div className="win-pct-team">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '4px' }}>
                                        {teamB && (
                                            <img
                                                src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(teamB.logoAbbr || teamB.abbr)?.toLowerCase()}.png`}
                                                alt={teamB.name}
                                                style={{ width: '24px', height: '24px' }}
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        )}
                                        <span className="win-pct-label">{prediction.teamB.abbr}</span>
                                    </div>
                                    <div className="win-pct-value">{prediction.teamB.winPct}%</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>({prediction.teamB.americanOdds > 0 ? '+' : ''}{prediction.teamB.americanOdds})</div>
                                </div>
                            </div>

                            <div className="win-bars">
                                <div className="win-bar-a" style={{ width: `${prediction.teamA.winPct}%` }} />
                                <div className="win-bar-b" style={{ width: `${prediction.teamB.winPct}%` }} />
                            </div>

                            {/* Projected Score */}
                            <div className="projected-score">
                                <div>
                                    <div className="score-team">{prediction.teamA.abbr}</div>
                                    <div className="score">{prediction.teamA.projectedScore}</div>
                                </div>
                                <div className="score-dash">—</div>
                                <div>
                                    <div className="score-team">{prediction.teamB.abbr}</div>
                                    <div className="score">{prediction.teamB.projectedScore}</div>
                                </div>
                            </div>

                            {/* Spread & Confidence */}
                            <div className="spread-row">
                                <span className="spread-badge spread">
                                    Spread: {prediction.teamA.winPct > prediction.teamB.winPct 
                                        ? `${prediction.teamA.abbr} -${Math.abs(prediction.spread).toFixed(1)}` 
                                        : `${prediction.teamB.abbr} -${Math.abs(prediction.spread).toFixed(1)}`}
                                </span>
                                <span className={`confidence-badge ${prediction.confidence}`}>
                                    {prediction.confidence} Confidence
                                </span>
                            </div>

                            {/* Why Bullets */}
                            {prediction.whyBullets?.length > 0 && (
                                <div style={{ marginTop: '20px' }}>
                                    <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                        Why?
                                    </h4>
                                    <ul className="why-list">
                                        {prediction.whyBullets.map((bullet, i) => (
                                            <li key={i}>{bullet}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                Generated: {new Date(prediction.timestamp).toLocaleString()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
