import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { configureFeatureFlags, parseFlag } from '../shared/config';
import { initErrorTracking, markFirstFrame, trackFunnel } from './lib/analytics';
import './index.css';

// v5.4: гейт первого сеанса можно выключить без правки кода — VITE_ONBOARDING_V2=false
// (или ONBOARDING_V2=false на сервере / window.__HK_FLAGS__ в консоли).
const onboardingEnvFlag = parseFlag(import.meta.env.VITE_ONBOARDING_V2);
if (onboardingEnvFlag !== undefined) configureFeatureFlags({ onboardingV2: onboardingEnvFlag });

// v5.5: мир «День хакера» гасится так же — VITE_WORLD_V2=false (или WORLD_V2=false
// на сервере / window.__HK_FLAGS__.worldV2 в консоли). Выключено = прежний экран.
const worldEnvFlag = parseFlag(import.meta.env.VITE_WORLD_V2);
if (worldEnvFlag !== undefined) configureFeatureFlags({ worldV2: worldEnvFlag });

// Опциональная бесплатная аналитика (Umami / Yandex Metrica по разделу 6 ТЗ), если заданы переменные в .env
const umamiId = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
const umamiSrc = import.meta.env.VITE_UMAMI_SCRIPT_URL as string | undefined;
if (umamiId && umamiSrc) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = umamiSrc;
  s.dataset.websiteId = umamiId;
  document.head.appendChild(s);
}

// Воронка: обработчики ошибок ставим до первого рендера, чтобы поймать и сбой
// монтирования. app_opened — самая первая точка: «приложение вообще открылось».
initErrorTracking();
trackFunnel('app_opened', {
  mode: import.meta.env.MODE,
  telegram: 'Telegram' in window,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// first_frame — первый отрисованный кадр (двойной rAF уже внутри markFirstFrame).
markFirstFrame();
