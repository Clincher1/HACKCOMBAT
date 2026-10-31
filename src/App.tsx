import { RefreshCw, WifiOff } from 'lucide-react';
import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertStack } from './components/AlertStack';
import { BottomNav } from './components/BottomNav';
import { TopHud } from './components/TopHud';
import { GameProvider, useGame } from './context/GameContext';

// The shell and the first API request stay small. Pages and the modal bundle are
// fetched only when the authenticated shell is ready, which keeps the Telegram
// WebView's first paint free of every tab's UI and tutorial code.
const DeskPage = React.lazy(async () => {
  const module = await import('./pages/DeskPage');
  return { default: module.DeskPage };
});
const HacksPage = React.lazy(async () => {
  const module = await import('./pages/HacksPage');
  return { default: module.HacksPage };
});
const ProfilePage = React.lazy(async () => {
  const module = await import('./pages/ProfilePage');
  return { default: module.ProfilePage };
});
const InventoryPage = React.lazy(async () => {
  const module = await import('./pages/InventoryPage');
  return { default: module.InventoryPage };
});
const TeamPage = React.lazy(async () => {
  const module = await import('./pages/TeamPage');
  return { default: module.TeamPage };
});
const UpgradesPage = React.lazy(async () => {
  const module = await import('./pages/UpgradesPage');
  return { default: module.UpgradesPage };
});
const ModalsAndOverlays = React.lazy(async () => {
  const module = await import('./components/Modals');
  return { default: module.ModalsAndOverlays };
});

const RouteLoading: React.FC = () => (
  <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
    <div className="w-9 h-9 rounded-xl border-2 border-[var(--ui-primary)] border-t-transparent animate-spin mb-3" />
    <p className="text-xs text-slate-400">Открываем раздел…</p>
  </div>
);

// Старые ссылки на вкладку инвентаря в профиле ведут в новый раздел.
const ProfileRoute: React.FC = () => {
  const location = useLocation();
  return new URLSearchParams(location.search).get('tab') === 'inventory'
    ? <Navigate to="/inventory" replace />
    : <ProfilePage />;
};

const AppShell: React.FC = () => {
  const { loading, player, initError, retryInit } = useGame();
  const location = useLocation();
  const sectionLabels: Record<string, [string, string]> = {
    '/': ['РАБОЧЕЕ ПРОСТРАНСТВО', 'Личный терминал'],
    '/upgrades': ['ОБОРУДОВАНИЕ', 'Мастерская'],
    '/hacks': ['ОПЕРАЦИИ', 'Взломы и контракты'],
    '/team': ['СОТРУДНИКИ', 'Команда'],
    '/profile': ['АККАУНТ', 'Профиль и достижения'],
    '/inventory': ['КОЛЛЕКЦИЯ', 'Инвентарь'],
  };
  const section = sectionLabels[location.pathname] ?? sectionLabels['/'];

  if (loading) {
    return (
      <div className="min-h-screen cyber-grid-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl border-2 border-[#bdccd0] border-t-transparent animate-spin mb-4" />
        <div className="font-display text-lg font-extrabold text-[#bdccd0] tracking-widest">
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
    <div className="min-h-screen cyber-grid-bg flex flex-col visual-demo-shell">
      <TopHud />
      <AlertStack />
      <main className="visual-demo-main flex-1 w-full max-w-xl mx-auto px-3 pt-3 pb-24">
        <div className="modern-section-title"><div><span>{section[0]}</span><h1>{section[1]}</h1></div><div className="modern-section-indicator" aria-hidden="true">●</div></div>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<DeskPage />} />
            <Route path="/upgrades" element={<UpgradesPage />} />
            <Route path="/hacks" element={<HacksPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/profile" element={<ProfileRoute />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
      <Suspense fallback={null}>
        <ModalsAndOverlays />
      </Suspense>
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
