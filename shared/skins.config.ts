import type { SkinConfig } from './types';

// ============================================================================
// КОСМЕТИКА v3 (ТЗ: «существенно расширить ассортимент»)
// ----------------------------------------------------------------------------
// 3 категории:
//   desk   — тема рабочего стола и неона (меняет палитру всего приложения);
//   ui     — акцент интерфейса (панели, кнопки, рамки);
//   avatar — аватар игрока (эмодзи-глиф + цвет рамки).
// Все прежние ключи сохранены 1:1, потому что они уже лежат в сейвах игроков.
// ============================================================================
export const SKINS_CONFIG: SkinConfig[] = [
  // ---------------------------- DESK ----------------------------
  {
    key: 'default',
    name: 'Cyber Cyan OS',
    description: 'Классический неоновый терминал ночного мегаполиса.',
    category: 'desk',
    cryptoCost: 0,
    primaryHex: '#00f0ff',
    secondaryHex: '#ff00a0',
    accentHex: '#7dff00',
    cssFilter: 'none',
    clickBonusPct: 0,
  },
  {
    key: 'sakura',
    name: 'Shibuya Overdrive',
    description: 'Пурпурно-малиновый неон с постоянным +5% к мощности тапа.',
    category: 'desk',
    cryptoCost: 12,
    primaryHex: '#ff00a0',
    secondaryHex: '#bd00ff',
    accentHex: '#00f0ff',
    cssFilter: 'hue-rotate(85deg) saturate(1.25)',
    clickBonusPct: 0.05,
  },
  {
    key: 'matrix',
    name: 'Zion Phosphor',
    description: 'Изумрудный терминал Матрицы с постоянным +8% к мощности тапа.',
    category: 'desk',
    cryptoCost: 22,
    primaryHex: '#7dff00',
    secondaryHex: '#00ff88',
    accentHex: '#00f0ff',
    cssFilter: 'hue-rotate(255deg) saturate(1.3)',
    clickBonusPct: 0.08,
  },
  {
    key: 'solar',
    name: 'Gold Mainframe',
    description: 'Кибер-золото элиты даркнета с +12% к мощности тапа.',
    category: 'desk',
    cryptoCost: 35,
    primaryHex: '#ffb800',
    secondaryHex: '#ff006e',
    accentHex: '#ffe600',
    cssFilter: 'hue-rotate(165deg) saturate(1.35) contrast(1.05)',
    clickBonusPct: 0.12,
  },
  {
    key: 'void_phantom',
    name: 'Void Phantom Ultra',
    description: 'Редкий коллекционный скин эндгейма за Crypto (+18% к мощности тапа).',
    category: 'desk',
    cryptoCost: 65,
    primaryHex: '#38bdf8',
    secondaryHex: '#c084fc',
    accentHex: '#f43f5e',
    cssFilter: 'hue-rotate(310deg) saturate(1.4) contrast(1.08)',
    clickBonusPct: 0.18,
  },
  {
    key: 'prestige_omega',
    name: 'Omega Singularity',
    description: 'Награда за Global Hack Престиж — даёт +22% к мощности тапа!',
    category: 'desk',
    cryptoCost: 0,
    prestigeRequired: true,
    primaryHex: '#a855f7',
    secondaryHex: '#00f0ff',
    accentHex: '#7dff00',
    cssFilter: 'hue-rotate(48deg) saturate(1.45) contrast(1.08)',
    clickBonusPct: 0.22,
  },
  {
    key: 'neon_tokyo',
    name: 'Neon Tokyo Rain',
    description: 'Мокрая неоновая улица: розовые вывески и отражения в лужах.',
    category: 'desk',
    cryptoCost: 18,
    requiredLevel: 6,
    primaryHex: '#ff4d9d',
    secondaryHex: '#7c3aed',
    accentHex: '#22d3ee',
    cssFilter: 'hue-rotate(300deg) saturate(1.3)',
    clickBonusPct: 0.06,
  },
  {
    key: 'ice_archive',
    name: 'Ice Vault',
    description: 'Холодный ледяной дата-центр: сине-белые блики на стекле.',
    category: 'desk',
    cryptoCost: 28,
    requiredLevel: 10,
    primaryHex: '#7dd3fc',
    secondaryHex: '#e0f2fe',
    accentHex: '#38bdf8',
    cssFilter: 'hue-rotate(180deg) saturate(0.85) brightness(1.08)',
    clickBonusPct: 0.09,
  },
  {
    key: 'blood_lan',
    name: 'Blood LAN',
    description: 'Красная тревога в серверной: багровый неон и аварийные лампы.',
    category: 'desk',
    cryptoCost: 48,
    requiredLevel: 16,
    primaryHex: '#ef4444',
    secondaryHex: '#7f1d1d',
    accentHex: '#fca5a5',
    cssFilter: 'hue-rotate(140deg) saturate(1.5) contrast(1.1)',
    clickBonusPct: 0.15,
  },
  {
    key: 'aurora_grid',
    name: 'Aurora Grid',
    description: 'Северное сияние поверх сетки дата-центра — редкий стол для долгих рейдов (+10% к мощности тапа).',
    category: 'desk',
    cryptoCost: 180,
    requiredLevel: 24,
    primaryHex: '#67e8f9',
    secondaryHex: '#8b5cf6',
    accentHex: '#bef264',
    cssFilter: 'hue-rotate(225deg) saturate(1.28) brightness(1.04)',
    clickBonusPct: 0.10,
  },
  {
    key: 'black_ice',
    name: 'Black ICE',
    description: 'Чёрный лёд: холодный доступ к закрытому контуру и +15% к мощности тапа.',
    category: 'desk',
    cryptoCost: 360,
    requiredLevel: 40,
    primaryHex: '#38bdf8',
    secondaryHex: '#0f172a',
    accentHex: '#f8fafc',
    cssFilter: 'hue-rotate(190deg) saturate(1.35) contrast(1.12)',
    clickBonusPct: 0.15,
  },
  {
    key: 'singularity_crown',
    name: 'Singularity Crown',
    description: 'Корона сингулярности для тех, кто уже пережил первый Global Hack (+20% к мощности тапа).',
    category: 'desk',
    cryptoCost: 750,
    prestigeRequired: true,
    primaryHex: '#f0abfc',
    secondaryHex: '#312e81',
    accentHex: '#67e8f9',
    cssFilter: 'hue-rotate(285deg) saturate(1.42) contrast(1.08)',
    clickBonusPct: 0.20,
  },

  // ----------------------------- UI -----------------------------
  {
    key: 'ui_amber',
    name: 'Amber Panels',
    description: 'Янтарные панели интерфейса в духе старого CRT-монитора.',
    category: 'ui',
    cryptoCost: 8,
    requiredLevel: 3,
    primaryHex: '#fbbf24',
    secondaryHex: '#f97316',
    accentHex: '#fde68a',
    cssFilter: 'sepia(0.35) hue-rotate(5deg) saturate(1.2)',
    clickBonusPct: 0.02,
    uiTokens: {
      accent: '#fbbf24',
      accent2: '#f97316',
      panel: '#1a1206',
      text: '#fde9c2',
    },
  },
  {
    key: 'ui_mint',
    name: 'Mint Terminal',
    description: 'Мятные акценты: спокойный интерфейс для долгих сессий.',
    category: 'ui',
    cryptoCost: 14,
    requiredLevel: 5,
    primaryHex: '#34d399',
    secondaryHex: '#06b6d4',
    accentHex: '#a7f3d0',
    cssFilter: 'hue-rotate(60deg) saturate(1.1)',
    clickBonusPct: 0.03,
    uiTokens: {
      accent: '#34d399',
      accent2: '#06b6d4',
      panel: '#08201c',
      text: '#c8f8e6',
    },
  },
  {
    key: 'ui_grape',
    name: 'Grape Protocol',
    description: 'Виноградный неон и мягкие тени — стиль закрытого клуба.',
    category: 'ui',
    cryptoCost: 26,
    requiredLevel: 9,
    primaryHex: '#a78bfa',
    secondaryHex: '#6d28d9',
    accentHex: '#f0abfc',
    cssFilter: 'hue-rotate(250deg) saturate(1.25)',
    clickBonusPct: 0.05,
    uiTokens: {
      accent: '#a78bfa',
      accent2: '#6d28d9',
      panel: '#150f2b',
      text: '#e4d9ff',
    },
  },
  {
    key: 'ui_steel',
    name: 'Steel Frame',
    description: 'Монохромная сталь: строгий интерфейс без лишнего света.',
    category: 'ui',
    cryptoCost: 40,
    requiredLevel: 14,
    primaryHex: '#94a3b8',
    secondaryHex: '#334155',
    accentHex: '#e2e8f0',
    cssFilter: 'saturate(0.25) brightness(1.05)',
    clickBonusPct: 0.08,
    uiTokens: {
      accent: '#94a3b8',
      accent2: '#475569',
      panel: '#12161d',
      text: '#dbe3ee',
    },
  },
  {
    key: 'ui_crimson',
    name: 'Crimson HUD',
    description: 'Алый HUD боевого дрона: максимум тревоги на минимуме площади.',
    category: 'ui',
    cryptoCost: 72,
    requiredLevel: 22,
    primaryHex: '#f43f5e',
    secondaryHex: '#881337',
    accentHex: '#fecdd3',
    cssFilter: 'hue-rotate(155deg) saturate(1.45)',
    clickBonusPct: 0.12,
    uiTokens: {
      accent: '#f43f5e',
      accent2: '#881337',
      panel: '#1c0710',
      text: '#ffd7dd',
    },
  },
  {
    key: 'ui_hologram',
    name: 'Hologram Deck',
    description: 'Призматические панели и голографические блики для тех, кто любит чистый high-tech (+5% к тапу).',
    category: 'ui',
    cryptoCost: 220,
    requiredLevel: 28,
    primaryHex: '#67e8f9',
    secondaryHex: '#c084fc',
    accentHex: '#e0f2fe',
    cssFilter: 'hue-rotate(185deg) saturate(1.18) brightness(1.05)',
    clickBonusPct: 0.05,
    uiTokens: {
      accent: '#67e8f9',
      accent2: '#c084fc',
      panel: '#101827',
      text: '#e0f2fe',
    },
  },
  {
    key: 'ui_obsidian',
    name: 'Obsidian Command',
    description: 'Чёрное стекло командного центра с тонкой серебряной разметкой (+9% к тапу).',
    category: 'ui',
    cryptoCost: 460,
    requiredLevel: 50,
    primaryHex: '#e2e8f0',
    secondaryHex: '#475569',
    accentHex: '#94a3b8',
    cssFilter: 'saturate(0.55) contrast(1.14) brightness(0.98)',
    clickBonusPct: 0.09,
    uiTokens: {
      accent: '#e2e8f0',
      accent2: '#64748b',
      panel: '#0d1117',
      text: '#e2e8f0',
    },
  },
  {
    key: 'ui_aurora',
    name: 'Aurora Control',
    description: 'Лаймово-бирюзовый контур мастерской — дорогой HUD для высокого ранга (+14% к тапу).',
    category: 'ui',
    cryptoCost: 900,
    requiredLevel: 90,
    primaryHex: '#a3e635',
    secondaryHex: '#22d3ee',
    accentHex: '#d9f99d',
    cssFilter: 'hue-rotate(80deg) saturate(1.22) brightness(1.04)',
    clickBonusPct: 0.14,
    uiTokens: {
      accent: '#a3e635',
      accent2: '#22d3ee',
      panel: '#0b1d1a',
      text: '#ecfccb',
    },
  },

  // --------------------------- AVATAR ---------------------------
  {
    key: 'avatar_ghost',
    name: 'Аватар «Призрак»',
    description: 'Полупрозрачный силуэт без лица — тебя не запомнят.',
    category: 'avatar',
    cryptoCost: 10,
    requiredLevel: 4,
    primaryHex: '#e2e8f0',
    secondaryHex: '#64748b',
    accentHex: '#00f0ff',
    cssFilter: 'saturate(0.6)',
    clickBonusPct: 0.02,
    avatarGlyph: '👻',
  },
  {
    key: 'avatar_oracle',
    name: 'Аватар «Оракул»',
    description: 'Три глаза видят трафик насквозь.',
    category: 'avatar',
    cryptoCost: 20,
    requiredLevel: 8,
    primaryHex: '#c084fc',
    secondaryHex: '#4c1d95',
    accentHex: '#e879f9',
    cssFilter: 'hue-rotate(280deg)',
    clickBonusPct: 0.04,
    avatarGlyph: '👁️',
  },
  {
    key: 'avatar_ronin',
    name: 'Аватар «Ронин»',
    description: 'Кибер-самурай без хозяина и без лишних вопросов.',
    category: 'avatar',
    cryptoCost: 32,
    requiredLevel: 12,
    primaryHex: '#fca5a5',
    secondaryHex: '#7f1d1d',
    accentHex: '#fbbf24',
    cssFilter: 'hue-rotate(330deg) saturate(1.2)',
    clickBonusPct: 0.06,
    avatarGlyph: '🥷',
  },
  {
    key: 'avatar_daemon',
    name: 'Аватар «Демон»',
    description: 'Процесс, который не убивается даже reboot-ом.',
    category: 'avatar',
    cryptoCost: 55,
    requiredLevel: 18,
    primaryHex: '#fb7185',
    secondaryHex: '#4c0519',
    accentHex: '#f59e0b',
    cssFilter: 'hue-rotate(120deg) saturate(1.5)',
    clickBonusPct: 0.1,
    avatarGlyph: '😈',
  },
  {
    key: 'avatar_zero',
    name: 'Аватар «Ноль»',
    description: 'Абсолютная пустота и одинокая звезда в центре.',
    category: 'avatar',
    cryptoCost: 95,
    requiredLevel: 26,
    primaryHex: '#38bdf8',
    secondaryHex: '#0c4a6e',
    accentHex: '#a5f3fc',
    cssFilter: 'hue-rotate(200deg) saturate(1.3)',
    clickBonusPct: 0.15,
    avatarGlyph: '🌌',
  },
  {
    key: 'avatar_cyber_fox',
    name: 'Аватар «Кибер-лис»',
    description: 'Хитрый неоновый следопыт: милый ровно до первого взлома (+4% к тапу).',
    category: 'avatar',
    cryptoCost: 160,
    requiredLevel: 24,
    primaryHex: '#fb923c',
    secondaryHex: '#7c2d12',
    accentHex: '#fed7aa',
    cssFilter: 'hue-rotate(340deg) saturate(1.25)',
    clickBonusPct: 0.04,
    avatarGlyph: '🦊',
  },
  {
    key: 'avatar_wyrm',
    name: 'Аватар «Кодовый Вирм»',
    description: 'Пиксельный дракон, который поселился в ядре терминала (+8% к тапу).',
    category: 'avatar',
    cryptoCost: 420,
    requiredLevel: 45,
    primaryHex: '#34d399',
    secondaryHex: '#064e3b',
    accentHex: '#a7f3d0',
    cssFilter: 'hue-rotate(90deg) saturate(1.35)',
    clickBonusPct: 0.08,
    avatarGlyph: '🐉',
  },
  {
    key: 'avatar_starborn',
    name: 'Аватар «Звёздный Оператор»',
    description: 'Космический силуэт для тех, кто уже перезапустил карьеру через Global Hack (+14% к тапу).',
    category: 'avatar',
    cryptoCost: 950,
    prestigeRequired: true,
    primaryHex: '#c4b5fd',
    secondaryHex: '#312e81',
    accentHex: '#fef08a',
    cssFilter: 'hue-rotate(240deg) saturate(1.35) brightness(1.06)',
    clickBonusPct: 0.14,
    avatarGlyph: '🪐',
  },
];

export const SKIN_CATEGORIES: { id: 'desk' | 'ui' | 'avatar'; label: string }[] = [
  { id: 'desk', label: '🖥️ Рабочий стол' },
  { id: 'ui', label: '🎛️ Интерфейс' },
  { id: 'avatar', label: '🧑‍💻 Аватары' },
];

/**
 * v3.6.5: потолок суммарного бонуса к тапу от косметики.
 *
 * До v3.6.5 у игрока мог быть надет только один скин, и максимум был
 * +22% (Omega Singularity). Теперь слотов три, и без потолка сумма
 * дошла бы до +49% — это уже вмешательство в баланс, который считается
 * вокруг прежней планки. Сумма режется до 22%: три скина позволяют
 * добрать максимум дешевле, но выше прежнего потолка не поднимают.
 */
export const SKIN_CLICK_BONUS_CAP = 0.22;

/** Ключи слотов косметики: стол, интерфейс, аватар. */
export interface EquippedSkinSlots {
  desk: string;
  ui: string;
  avatar: string;
}

/** Слот по умолчанию для каждой категории (значение = «ничего не надето»). */
export const DEFAULT_SKIN_SLOTS: EquippedSkinSlots = {
  desk: 'default',
  ui: '',
  avatar: '',
};

export function getSkinByKey(key: string): SkinConfig | undefined {
  return SKINS_CONFIG.find((s) => s.key === key);
}

/** Собирает три слота из полей игрока, подставляя значения по умолчанию. */
export function resolveSkinSlots(input: {
  equippedSkin?: string;
  stats?: { equippedUi?: string; equippedAvatar?: string };
}): EquippedSkinSlots {
  return {
    desk: input.equippedSkin || DEFAULT_SKIN_SLOTS.desk,
    ui: input.stats?.equippedUi || DEFAULT_SKIN_SLOTS.ui,
    avatar: input.stats?.equippedAvatar || DEFAULT_SKIN_SLOTS.avatar,
  };
}

/** Готовые конфиги для всех трёх слотов (undefined — слот пуст). */
export function resolveEquippedSkins(input: {
  equippedSkin?: string;
  stats?: { equippedUi?: string; equippedAvatar?: string };
}): { desk: SkinConfig; ui?: SkinConfig; avatar?: SkinConfig } {
  const slots = resolveSkinSlots(input);
  return {
    desk: getSkinByKey(slots.desk) ?? SKINS_CONFIG[0],
    ui: slots.ui ? getSkinByKey(slots.ui) : undefined,
    avatar: slots.avatar ? getSkinByKey(slots.avatar) : undefined,
  };
}
