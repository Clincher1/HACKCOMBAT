import { RefreshCw, WifiOff } from 'lucide-react';
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
  const { loading, player, initError, retryInit } = useGame();

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

  if (!player) {
    return (
      <div className="min-h-screen cyber-grid-bg flex items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--ui-panel)] border border-rose-400/40 p-5 shadow-[0_0_32px_rgba(244,63,94,0.12)]">
          <WifiOff className="w-10 h-10 mx-auto text-rose-300 mb-3" />
          <h1 className="font-display text-base font-extrabold text-white">Терминал не подключился</h1>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Игра не получила профиль с сервера. Прогресс не изменён — попробуй подключиться ещё раз.
          </p>
          {initError && (
            <p className="mt-2 rounded-lg bg-black/20 px-2.5 py-2 text-[10px] text-rose-200 break-words">
              {initError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void retryInit()}
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-[var(--ui-primary)] px-3 py-2.5 text-sm font-extrabold text-[#061018] transition hover:brightness-110 disabled:opacity-60 cursor-pointer disabled:cursor-wait"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Повторить подключение
            </span>
          </button>
        </div>
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
