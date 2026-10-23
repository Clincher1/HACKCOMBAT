import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
