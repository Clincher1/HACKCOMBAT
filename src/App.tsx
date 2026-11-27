import { RefreshCw, WifiOff } from 'lucide-react';
import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertStack } from './components/AlertStack';
import { BottomNav } from './components/BottomNav';
import { LocationBackdrop } from './components/LocationBackdrop';
import { LockedTab } from './components/LockedTab';
import { Onboarding } from './components/Onboarding';
import { TopHud } from './components/TopHud';
import { GameProvider, useGame } from './context/GameContext';
import { WORLD_Z_INDEX } from '../shared/world.config';

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
const TeamPage = React.lazy(async () => {
  const module = await import('./pages/TeamPage');
  return { default: module.TeamPage };
});
const UpgradesPage = React.lazy(async () => {
  const module = await import('./pages/UpgradesPage');
  return { default: module.UpgradesPage };
});
// v6.0: раздел заданий — отдельный экран (поручения, прогресс, события).
const TasksPage = React.lazy(async () => {
  const module = await import('./pages/TasksPage');
  return { default: module.TasksPage };
});
// v6.8: «История» — отдельный ленивый чанк: тексты глав не попадают в главный
// бандл, а стол получает только строку «состояние мира» из API.
const StoryPage = React.lazy(async () => {
  const module = await import('./pages/StoryPage');
  return { default: module.StoryPage };
});
const ModalsAndOverlays = React.lazy(async () => {
  const module = await import('./components/Modals');
  return { default: module.ModalsAndOverlays };
});
// v4.3: демо-витрина всех открытий.
// v6.4: билд-тайм флаг __HK_DEMO__ (см. vite.config.mts) — в прод-сборке он
// false, поэтому динамический import вырезается и чанк витрины не эмитится.
// Для отладки: VITE_ENABLE_DEMO=1 npm run build (или npm run dev — там true).
const DemoPage = __HK_DEMO__
  ? React.lazy(async () => {
      const module = await import('./pages/DemoPage');
      return { default: module.DemoPage };
    })
  : null;

const RouteLoading: React.FC = () => (
  <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
    <div className="w-9 h-9 rounded-xl border-2 border-[var(--ui-primary)] border-t-transparent animate-spin mb-3" />
    <p className="text-[13px] text-slate-400">Секунду…</p>
  </div>
);

/**
 * v6.5: мост к мемоизированному фону. Сам слой читает только локацию и флаг,
 * поэтому тапы по столу не перерисовывают <img> и не дёргают CSS-переменные.
 */
const LocationBackdropLayer: React.FC = () => {
  const { activeLocation, worldEnabled } = useGame();
  return <LocationBackdrop location={activeLocation} enabled={worldEnabled} />;
};

const AppShell: React.FC = () => {
  const { loading, player, initError, retryInit, newPlayerMode } = useGame();

  if (loading) {
    return (
      <div className="min-h-screen cyber-grid-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl border-2 border-[var(--ui-primary)] border-t-transparent animate-spin mb-4" />
        <div className="font-display text-[20px] font-extrabold text-[var(--ui-primary)] tracking-widest">
          HACKER KOMBAT
        </div>
        <p className="text-[13px] text-slate-400 mt-1">Загружаем твой стол…</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen cyber-grid-bg flex items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--ui-panel)] border border-rose-400/40 p-5 shadow-[0_0_32px_rgba(244,63,94,0.12)]">
          <WifiOff className="w-10 h-10 mx-auto text-rose-300 mb-3" />
          <h1 className="font-display text-[16px] font-extrabold text-white">Терминал не подключился</h1>
          <p className="text-[13px] text-slate-300 mt-2 leading-relaxed">
            Игра не получила профиль с сервера. Прогресс не изменён — попробуй подключиться ещё раз.
          </p>
          {initError && (
            <p className="mt-2 rounded-lg bg-black/20 px-2.5 py-2 text-[11px] text-rose-200 break-words">
              {initError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void retryInit()}
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-[var(--ui-primary)] px-3 py-2.5 text-[16px] font-extrabold text-[var(--ui-on-primary)] transition hover:brightness-110 disabled:opacity-60 cursor-pointer disabled:cursor-wait"
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
    <div className="min-h-screen flex flex-col">
      {/* v5.6-fix: базовый фон вынесен в отдельный fixed-слой. Корневой шелл
          обязан быть прозрачным, иначе его background-color перекрывает слои
          с отрицательным z-index (фон локации) и они становятся невидимыми. */}
      <div
        className="cyber-grid-bg fixed inset-0"
        style={{ zIndex: WORLD_Z_INDEX.shell }}
        aria-hidden="true"
        data-qa-layer="shell"
      />
      {/* v5.5: фон и акцент локации. Слой лежит ПОД контентом (z = backdrop =
          -1), мир может быть выключен флагом — тогда компонент не рендерит
          ничего. */}
      <LocationBackdropLayer />
      <TopHud />
      <AlertStack />
      {/* v5.4: гейт первого сеанса. Онбординг рисуется над контентом, но под
          навигацией — залоченные вкладки остаются видны. */}
      <Onboarding />
      {/* v5.6-fix: <main> намеренно БЕЗ position/z-index. Стек-контекст здесь
          «запер» бы модалы внутри страниц (LocationPicker z-70, профиль z-50)
          под навигацией (z-30). Контент и так выше фона локации, потому что
          фон уведён в отрицательный слой. */}
      <main
        className="flex-1 w-full max-w-xl mx-auto px-3 pt-3 pb-24"
        data-qa-layer="content"
      >
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<DeskPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/story" element={<StoryPage />} />
            <Route
              path="/upgrades"
              element={newPlayerMode ? <LockedTab title="Улучшения" hint="Пока — одна подсказка на столе." /> : <UpgradesPage />}
            />
            <Route
              path="/hacks"
              element={newPlayerMode ? <LockedTab title="Взломы" hint="Первый контракт запускается прямо с экрана знакомства." /> : <HacksPage />}
            />
            <Route
              path="/team"
              element={newPlayerMode ? <LockedTab title="Команда" hint="Специалисты появятся позже." /> : <TeamPage />}
            />
            <Route
              path="/profile"
              element={newPlayerMode ? <LockedTab title="Профиль" hint="Сначала — первый заказ." /> : <ProfilePage />}
            />
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

/**
 * /demo живёт ВНЕ GameProvider: витрина не должна зависеть от Telegram-сессии,
 * от /api/init и не может ничего записать в живой сейв. Остальные маршруты —
 * обычная игра.
 */
const AppRoutes: React.FC = () => {
  const { pathname } = useLocation();
  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (__HK_DEMO__ && DemoPage && normalized === '/demo') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--ui-panel-deep)] flex items-center justify-center">
            <div className="w-9 h-9 rounded-xl border-2 border-[var(--ui-secondary)] border-t-transparent animate-spin" />
          </div>
        }
      >
        <DemoPage />
      </Suspense>
    );
  }

  return (
    <GameProvider>
      <AppShell />
    </GameProvider>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
