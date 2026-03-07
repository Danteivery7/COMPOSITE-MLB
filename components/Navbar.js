'use client';

import { useState } from 'react';

export default function Navbar({ currentPage, onNavigate, theme, toggleTheme }) {
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { id: 'live', label: 'Live' },
        { id: 'rankings', label: 'Rankings' },
        { id: 'teams', label: 'Teams' },
        { id: 'players', label: 'Players' },
        { id: 'predictor', label: 'Predictor' },
        { id: 'settings', label: 'Settings' },
    ];

    const handleNav = (id) => {
        onNavigate(id);
        setMobileOpen(false);
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <div className="navbar-brand" onClick={() => handleNav('live')} style={{ cursor: 'pointer', display: 'flex' }}>
                    <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.5px' }}>COMPOSITE</span>
                    <span className="brand-accent" style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.5px' }}>MLB</span>
                </div>

                <ul className={`nav-links ${mobileOpen ? 'open' : ''}`}>
                    {navItems.map(item => (
                        <li key={item.id}>
                            <a
                                className={currentPage === item.id ? 'active' : ''}
                                onClick={() => handleNav(item.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <span>{item.label}</span>
                            </a>
                        </li>
                    ))}
                </ul>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                        {theme === 'dark' ? 'Light' : 'Dark'}
                    </button>
                    <button
                        className="nav-mobile-toggle"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? '✕' : '☰'}
                    </button>
                </div>
            </div>
        </nav>
    );
}
