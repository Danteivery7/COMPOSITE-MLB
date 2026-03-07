'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import LivePage from '@/components/LivePage';
import RankingsPage from '@/components/RankingsPage';
import TeamsPage from '@/components/TeamsPage';
import PredictorPage from '@/components/PredictorPage';
import SettingsPage from '@/components/SettingsPage';
import TeamDetailPage from '@/components/TeamDetailPage';
import PlayersPage from '@/components/PlayersPage';
import PlayerDetailPage from '@/components/PlayerDetailPage';
import GameDetailPage from '@/components/GameDetailPage';

export default function Home() {
  const [currentPage, setCurrentPage] = useState('live');
  const [theme, setTheme] = useState('dark');
  const [favorites, setFavorites] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const prevPageRef = useRef('players'); // Track where user came from

  useEffect(() => {
    const savedFavs = localStorage.getItem('mlb_favorites');
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
    const savedTheme = localStorage.getItem('mlb_theme');
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Proactively pre-fetch and cache Top 50 players in the background on initial load
    // This guarantees a 0ms load time when the user finally clicks the 'Players' tab
    fetch('/api/players').catch(() => { });
  }, []);

  const toggleFavorite = useCallback((teamId) => {
    setFavorites(prev => {
      const next = prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId];
      localStorage.setItem('mlb_favorites', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('mlb_theme', next);
      return next;
    });
  }, []);

  const navigateToTeam = useCallback((teamId) => {
    setSelectedTeamId(teamId);
    setCurrentPage('team-detail');
  }, []);

  const navigateToPlayer = useCallback((playerId, fromPage) => {
    prevPageRef.current = fromPage || currentPage;
    setSelectedPlayerId(playerId);
    setCurrentPage('player-detail');
  }, [currentPage]);

  const navigateToGame = useCallback((gameId) => {
    setSelectedGameId(gameId);
    setCurrentPage('game-detail');
  }, []);

  const goBack = useCallback(() => {
    setCurrentPage('teams');
    setSelectedTeamId(null);
  }, []);

  const goBackFromPlayer = useCallback(() => {
    setSelectedPlayerId(null);
    // Go back to where user came from
    const prev = prevPageRef.current;
    if (prev === 'team-detail') {
      setCurrentPage('team-detail');
    } else {
      setCurrentPage('players');
    }
  }, []);

  const goBackFromGame = useCallback(() => {
    setSelectedGameId(null);
    setCurrentPage('live');
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'live':
        return <LivePage onGameClick={navigateToGame} />;
      case 'rankings':
        return <RankingsPage favorites={favorites} toggleFavorite={toggleFavorite} onTeamClick={navigateToTeam} />;
      case 'teams':
        return <TeamsPage favorites={favorites} toggleFavorite={toggleFavorite} onTeamClick={navigateToTeam} />;
      case 'players':
        return <PlayersPage onPlayerClick={(id) => navigateToPlayer(id, 'players')} />;
      case 'team-detail':
        return <TeamDetailPage teamId={selectedTeamId} onBack={goBack} favorites={favorites} toggleFavorite={toggleFavorite} onPlayerClick={(id) => navigateToPlayer(id, 'team-detail')} />;
      case 'player-detail':
        return <PlayerDetailPage playerId={selectedPlayerId} onBack={goBackFromPlayer} />;
      case 'game-detail':
        return <GameDetailPage gameId={selectedGameId} onBack={goBackFromGame} />;
      case 'predictor':
        return <PredictorPage />;
      case 'settings':
        return <SettingsPage favorites={favorites} toggleFavorite={toggleFavorite} theme={theme} toggleTheme={toggleTheme} />;
      default:
        return <LivePage onGameClick={navigateToGame} />;
    }
  };

  return (
    <>
      <Navbar currentPage={currentPage} onNavigate={setCurrentPage} theme={theme} toggleTheme={toggleTheme} />
      {renderPage()}
    </>
  );
}
