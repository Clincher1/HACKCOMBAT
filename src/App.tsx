import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AlertStack } from './components/AlertStack';
import { BottomNav } from './components/BottomNav';
import { ModalsAndOverlays } from './components/Modals';
import { TopHud } from './components/TopHud';
import { GameProvider, useGame } from './context/GameContext';
import { DeskPage } from './pages/DeskPage';
import { HacksPage } from './pages/HacksPage';
import { ProfilePage } from './pages/ProfilePage';
import { TeamPage } from './pages/TeamPage';
import { UpgradesPage } from './pages/UpgradesPage';

const AppShell: React.FC = () => {
  const { loading } = useGame();

  if (loading) {
    return (
      <div className="min-h-screen cyber-grid-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl border-2 border-[#00f0ff] border-t-transparent animate-spin mb-4" />
        <div className="font-display text-lg font-extrabold text-[#00f0ff] tracking-widest">
          HACKER KOMBAT
        </div>
        <p className="text-xs text-slate-400 mt-1">Загрузка кибер-терминала...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen cyber-grid-bg flex flex-col">
      <TopHud />
      <AlertStack />
      <main className="flex-1 w-full max-w-xl mx-auto px-3 pt-3 pb-24">
        <Routes>
          <Route path="/" element={<DeskPage />} />
          <Route path="/upgrades" element={<UpgradesPage />} />
          <Route path="/hacks" element={<HacksPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
      <ModalsAndOverlays />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <GameProvider>
        <AppShell />
      </GameProvider>
    </BrowserRouter>
  );
};

export default App;
