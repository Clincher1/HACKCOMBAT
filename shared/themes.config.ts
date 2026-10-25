// ============================================================================
// БАЗОВЫЕ ТЕМЫ (v3.6.1)
// ----------------------------------------------------------------------------
// Тема — это фундамент интерфейса: палитра, фон сцены, свечение, поверх которого
// накладываются обычные скины (они остаются платными и с бонусами к тапу).
//
// Обе темы БЕСПЛАТНЫ и НЕ ДАЮТ бонусов к клику: это чистая косметика, чтобы
// выбор «классика / женская» не превращался в pay-to-win.
//
// Почему отдельный слой, а не ещё один SkinConfig:
//   скин поверх темы задаёт hue-rotate, и если у базы уже своя палитра,
//   двойной сдвиг даёт кашу. Поэтому у каждой темы есть themeOffset —
//   поправка, которая компенсирует базу и возвращает скину его задуманный вид.
// ============================================================================

export type BaseThemeKey = 'classic' | 'femme';

export interface BaseThemeConfig {
  key: BaseThemeKey;
  name: string;
  tagline: string;
  /** Бесплатна ли тема (обе бесплатные — поле на будущее, если появятся платные). */
  free: boolean;
  /** Глиф для превью-карточки в модалке скинов. */
  glyph: string;
  /** Цвета превью (градиент карточки). */
  previewFrom: string;
  previewTo: string;
  /** Палитра интерфейса — то, что уходит в CSS-переменные. */
  palette: {
    cyan: string;
    magenta: string;
    green: string;
    purple: string;
    panel: string;
    panelDeep: string;
    bg: string;
    text: string;
    textMuted: string;
  };
  /** Мягкая вуаль поверх сцены — «температура» темы. */
  sceneVignette: string;
  /** Своя фоновая сцена (если нет — используется обычный эволюционирующий стол). */
  sceneUrl?: string;
  /** Маскот-компаньон на рабочем столе (путь к webp). */
  mascotUrl?: string;
  mascotName?: string;
  /**
   * Поправка hue-rotate (в градусах) для скинов поверх этой темы.
   * Классика ничего не сдвигает — у неё 0.
   */
  themeOffset: number;
}

export const BASE_THEMES: BaseThemeConfig[] = [
  {
    key: 'classic',
    name: 'Классика',
    tagline: 'Тот самый кибер-неон: циан, маджента и ночной мегаполис.',
    free: true,
    glyph: '🕶️',
    previewFrom: '#00f0ff',
    previewTo: '#ff00a0',
    palette: {
      cyan: '#00f0ff',
      magenta: '#ff00a0',
      green: '#7dff00',
      purple: '#c084fc',
      panel: '#10172e',
      panelDeep: '#0a0e1a',
      bg: '#0a0e1a',
      text: '#ffffff',
      textMuted: '#94a3b8',
    },
    sceneVignette: 'rgba(0, 240, 255, 0.10)',
    themeOffset: 0,
  },
  {
    key: 'femme',
    name: 'Neon Muse',
    tagline: 'Розово-лавандовый неон, тёплая комнатная подсветка и Муза за столом.',
    free: true,
    glyph: '🌸',
    previewFrom: '#ff6fb5',
    previewTo: '#b06bff',
    palette: {
      cyan: '#ff6fb5', // основной акцент темы (кнопки, рамки, свечение)
      magenta: '#b06bff',
      green: '#7cf5c8', // «денёк» — мягкий мятный вместо кислотного лайма
      purple: '#e0a7ff',
      panel: '#171029',
      panelDeep: '#0d0918',
      bg: '#0d0918',
      text: '#ffffff',
      textMuted: '#b8a8cc',
    },
    sceneVignette: 'rgba(255, 111, 181, 0.14)',
    sceneUrl: '/assets/themes/femme/stage-base.webp',
    mascotUrl: '/assets/themes/femme/mascot.webp',
    mascotName: 'Муза',
    // База уже смещена в розово-фиолетовый диапазон; при появлении платных
    // тем-баз здесь будет компенсация, чтобы скины не уезжали.
    themeOffset: 0,
  },
];

export const DEFAULT_BASE_THEME: BaseThemeKey = 'classic';

export function getBaseTheme(key: string | undefined | null): BaseThemeConfig {
  return BASE_THEMES.find((t) => t.key === key) ?? BASE_THEMES[0];
}

/**
 * Итоговый CSS-фильтр сцены: фильтр скина + поправка темы.
 * Для классики (offset 0) поведение 1:1 как раньше.
 */
export function composeSceneFilter(skinFilter: string, theme: BaseThemeConfig): string {
  const base = (skinFilter ?? 'none').trim();
  if (theme.themeOffset === 0) return base || 'none';
  const offset = `hue-rotate(${theme.themeOffset}deg)`;
  if (!base || base === 'none') return offset;
  return `${base} ${offset}`;
}
