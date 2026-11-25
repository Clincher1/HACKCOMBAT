// ============================================================================
// ВИД ИЗ ОКНА (v4.1)
// ----------------------------------------------------------------------------
// Косметический слой: сцена, у которой сидит оператор. Не копирует чужие
// франшизы — это жанровая стилистика «тёплый южный город у океана»: закат,
// пальмы, неон, дождь за стеклом. Чистая атмосфера, без бонусов к тапу.
//
// Почему отдельный слой, а не ещё один SkinConfig:
//   скины стола красят сцену CSS-фильтром (hue-rotate). На фотографических
//   фонах фильтр превращает закат в кислоту, поэтому фон выбирается отдельно
//   и не перекрашивается скином — скин продолжает жить в интерфейсе.
//
// Хранение: players.stats.deskBackdrop (jsonb), миграция не нужна.
// ============================================================================

export type BackdropWeather = 'sunset' | 'day' | 'night' | 'rain';

export interface BackdropConfig {
  key: string;
  name: string;
  tagline: string;
  /** Путь в public/assets — отдаётся как статика, минуя SPA-rewrite. */
  url: string;
  weather: BackdropWeather;
  /** Минимальный уровень (все текущие бесплатны, поле — на будущее). */
  requiredLevel: number;
  glyph: string;
  accent: string;
  /** «Погодная» подпись в углу сцены: город, температура, состояние. */
  weatherLabel: string;
}

export const BACKDROPS_CONFIG: BackdropConfig[] = [
  {
    key: 'rooftop_sunset',
    name: 'Крыша на закате',
    tagline: 'Тёплый вечер, пальмы и город в дымке. Ноут на столе, напиток рядом.',
    url: '/assets/backdrops/backdrop-rooftop-sunset.webp',
    weather: 'sunset',
    requiredLevel: 1,
    glyph: '🌇',
    accent: '#ff8a4c',
    weatherLabel: 'Сан-Мираж · 27° · закат',
  },
  {
    key: 'beach_day',
    name: 'Пляж днём',
    tagline: 'Терраса у воды, тень от зонта и шум прибоя. Работается лучше, чем в офисе.',
    url: '/assets/backdrops/backdrop-beach-day.webp',
    weather: 'day',
    requiredLevel: 1,
    glyph: '🏖️',
    accent: '#39d6d0',
    weatherLabel: 'Плая-Верде · 31° · бриз',
  },
  {
    key: 'motel_night',
    name: 'Мотель у бассейна',
    tagline: 'Неон, тёплая вода и тишина после полуночи. Самое время для тихой работы.',
    url: '/assets/backdrops/backdrop-motel-night.webp',
    weather: 'night',
    requiredLevel: 1,
    glyph: '🌴',
    accent: '#c084fc',
    weatherLabel: 'Рут-66 · 24° · ясно',
  },
  {
    key: 'rain_window',
    name: 'Дождь за окном',
    tagline: 'Плед, лампа и струи по стеклу. Город светится где-то там, за бокалом.',
    url: '/assets/backdrops/backdrop-rain-window.webp',
    weather: 'rain',
    requiredLevel: 1,
    glyph: '🌧️',
    accent: '#7aa2f7',
    weatherLabel: 'Даунтаун · 19° · дождь',
  },
];

const BACKDROP_MAP = new Map(BACKDROPS_CONFIG.map((b) => [b.key, b]));

/** Возвращает конфиг фона или undefined — тогда работает обычная сцена по уровню. */
export function getBackdrop(key: string | undefined | null): BackdropConfig | undefined {
  if (!key) return undefined;
  return BACKDROP_MAP.get(key);
}

/** Валидация ключа из jsonb: мусор из старых сейвов не должен включать фон. */
export function isBackdropKey(key: unknown): key is string {
  return typeof key === 'string' && BACKDROP_MAP.has(key);
}
