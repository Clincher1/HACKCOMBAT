// ============================================================================
// БАЗОВЫЕ ТЕМЫ (v3.6.1)
// ----------------------------------------------------------------------------
// Тема — это фундамент интерфейса: палитра, фон сцены, свечение И форма
// (радиусы, ушки на кнопке, цвет «плюсов»), поверх которого накладываются
// обычные скины (они остаются платными и с бонусами к тапу).
//
// Все темы БЕСПЛАТНЫ и НЕ ДАЮТ бонусов к клику: это чистая косметика.
// Старые скрытые темы сохраняются для совместимости с выбором игроков.
//
// Почему отдельный слой, а не ещё один SkinConfig:
//   скин поверх темы задаёт hue-rotate, и если у базы уже своя палитра,
//   двойной сдвиг даёт кашу. Поэтому у каждой темы есть themeOffset —
//   поправка, которая компенсирует базу и возвращает скину его задуманный вид.
// ============================================================================

export type BaseThemeKey = 'classic' | 'femme' | 'light_mist' | 'light_sand' | 'new_year';

export interface BaseThemeConfig {
  key: BaseThemeKey;
  name: string;
  tagline: string;
  /** Бесплатна ли тема (поле на будущее, если появятся платные). */
  free: boolean;
  /** Светлая схема интерфейса (существующие тёмные темы не меняются). */
  colorScheme?: 'light';
  /** Прятать тему из выбора, сохраняя существующий выбор на сервере. */
  hiddenFromSelection?: boolean;
  /** Использовать палитру темы, временно не перекрашивая её UI-скином. */
  overrideUiSkinPalette?: boolean;
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
  /**
   * Свои сцены по этапам эволюции (1/5/10/15/20/25/30).
   * v3.6.3: у женской темы рабочий стол растёт вместе с уровнем, как в классике,
   * а не показывает один и тот же арт на всех этапах.
   */
  stageScenes?: Record<string, string>;
  /** Превью-картинка для карточки темы в магазине (если нет — градиент). */
  previewImage?: string;
  /**
   * Форма интерфейса (v3.6.2). Это не просто палитра: тема может менять
   * геометрию и характер свечения, оставаясь в киберпанке.
   */
  ui: {
    /** Дополнительный радиус панелей в px — мягче силуэт. */
    radiusBoost: number;
    /** Ушки на главной кнопке HACK (игривый, но аккуратный акцент). */
    catEars: boolean;
    /** Градиент главной кнопки: от primary к accent темы. */
    buttonGradient: [string, string];
    /** Цвет «плюсов»/успеха: у женской темы мягкая мята вместо кислотного лайма. */
    successHex: string;
  };
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
    ui: {
      radiusBoost: 0,
      catEars: false,
      buttonGradient: ['#00f0ff', '#ff00a0'],
      successHex: '#7dff00',
    },
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
    sceneUrl: '/assets/themes/femme/stage-01.webp',
    previewImage: '/assets/themes/femme/stage-01.webp',
    stageScenes: {
      '1': '/assets/themes/femme/stage-01.webp',
      '5': '/assets/themes/femme/stage-05.webp',
      '10': '/assets/themes/femme/stage-10.webp',
      '15': '/assets/themes/femme/stage-15.webp',
      '20': '/assets/themes/femme/stage-20.webp',
      '25': '/assets/themes/femme/stage-25.webp',
      '30': '/assets/themes/femme/stage-30.webp',
    },
    ui: {
      radiusBoost: 6,
      catEars: true,
      buttonGradient: ['#ff8cc6', '#b06bff'],
      successHex: '#7cf5c8',
    },
    // База уже смещена в розово-фиолетовый диапазон; при появлении платных
    // тем-баз здесь будет компенсация, чтобы скины не уезжали.
    themeOffset: 0,
  },
  {
    key: 'new_year',
    name: 'Новогодний интерфейс',
    tagline: 'Зимний неон, хвоя и ёлочные игрушки над рабочим столом.',
    free: true,
    overrideUiSkinPalette: true,
    glyph: '🎄',
    previewFrom: '#5de0ba',
    previewTo: '#f4c96b',
    previewImage: '/assets/themes/new-year/preview.svg',
    palette: {
      cyan: '#73e5c2', magenta: '#ffc676', green: '#8ae5a4', purple: '#e8a2a9',
      panel: '#10271f', panelDeep: '#091c17', bg: '#081b17',
      text: '#f4fff8', textMuted: '#a6c8b8',
    },
    sceneVignette: 'rgba(68, 212, 150, 0.16)',
    ui: { radiusBoost: 2, catEars: false, buttonGradient: ['#6be2b3', '#f5c56b'], successHex: '#8ae5a4' },
    themeOffset: 0,
  },
  {
    key: 'light_mist',
    hiddenFromSelection: true,
    name: 'Тихий свет',
    tagline: 'Прохладный светлый интерфейс без резкого неона.',
    free: true,
    colorScheme: 'light',
    glyph: '☁️',
    previewFrom: '#477b89',
    previewTo: '#7785ad',
    palette: {
      cyan: '#245f70', magenta: '#71518d', green: '#296d53', purple: '#674991',
      panel: '#f5f7f8', panelDeep: '#e6edf0', bg: '#edf2f4',
      text: '#1c3340', textMuted: '#526976',
    },
    sceneVignette: 'rgba(95, 150, 175, 0.08)',
    ui: { radiusBoost: 2, catEars: false, buttonGradient: ['#b8d4db', '#cfcae2'], successHex: '#296d53' },
    themeOffset: 0,
  },
  {
    key: 'light_sand',
    hiddenFromSelection: true,
    name: 'Тёплый свет',
    tagline: 'Мягкие песочные оттенки и спокойные тёплые акценты.',
    free: true,
    colorScheme: 'light',
    glyph: '☀️',
    previewFrom: '#a87955',
    previewTo: '#a56d7c',
    palette: {
      cyan: '#805332', magenta: '#88485f', green: '#42683f', purple: '#755782',
      panel: '#faf6ee', panelDeep: '#ece4d6', bg: '#f3ede2',
      text: '#3d3028', textMuted: '#716052',
    },
    sceneVignette: 'rgba(185, 139, 95, 0.07)',
    ui: { radiusBoost: 2, catEars: false, buttonGradient: ['#e2c8aa', '#d7b9bc'], successHex: '#42683f' },
    themeOffset: 0,
  },
];

export const DEFAULT_BASE_THEME: BaseThemeKey = 'classic';

/**
 * Сцена темы для конкретного этапа эволюции стола.
 * Если у темы нет набора по этапам — берём единственную sceneUrl (поведение как раньше).
 */
export function getThemeScene(theme: BaseThemeConfig, stage: number): string | undefined {
  if (theme.stageScenes) return theme.stageScenes[String(stage)] ?? theme.sceneUrl;
  return theme.sceneUrl;
}

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
