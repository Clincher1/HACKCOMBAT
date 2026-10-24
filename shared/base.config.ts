import type { BaseUpgradeConfig } from './types';

// ============================================================================
// «БАЗА» — ПАССИВНЫЕ ПОКУПКИ ИГРОКА (10 улучшений × 10 уровней)
// ----------------------------------------------------------------------------
// В отличие от карточек, «База» НЕ сбрасывается Global Hack Престижем —
// это долгая инвестиция в комфорт между перерождениями.
// Суммарные бонусы жёстко ограничены (~+15% к экономике), чтобы не сломать баланс престижа.
// ============================================================================
export const BASE_UPGRADES_CONFIG: BaseUpgradeConfig[] = [
  {
    key: 'coffee_machine',
    name: 'Кофемашина «Турбо»',
    description: 'Двойной эспрессо не спрашивает, он просто работает.',
    effectLabel: '+2% к скорости регена CPU Energy за уровень',
    icon: '☕',
    maxLevel: 10,
    basePrice: 1_200,
    priceGrowth: 1.85,
    baseChipCost: 1,
    effectPerLevel: 0.02,
  },
  {
    key: 'standing_desk',
    name: 'Стоячий стол',
    description: 'Спина прямая — палец быстрее.',
    effectLabel: '+1% к силе клика за уровень',
    icon: '🪑',
    maxLevel: 10,
    basePrice: 2_400,
    priceGrowth: 1.85,
    baseChipCost: 1,
    effectPerLevel: 0.01,
  },
  {
    key: 'vpn_router',
    name: 'VPN-роутер «Туман»',
    description: 'Три прыжка через вымышленные узлы — и следов нет.',
    effectLabel: '−1.5% к приросту Heat за уровень',
    icon: '🛡️',
    maxLevel: 10,
    basePrice: 4_800,
    priceGrowth: 1.9,
    baseChipCost: 2,
    effectPerLevel: 0.015,
  },
  {
    key: 'ups_battery',
    name: 'ИБП «Последний Бастион»',
    description: 'Город может погаснуть. Твой терминал — нет.',
    effectLabel: '+1 час к оффлайн-копилке за уровень',
    icon: '🔋',
    maxLevel: 10,
    basePrice: 7_500,
    priceGrowth: 1.9,
    baseChipCost: 2,
    effectPerLevel: 3_600,
  },
  {
    key: 'auto_script',
    name: 'Авто-скрипт «Роевик»',
    description: 'Пока ты пьёшь кофе, он печатает.',
    effectLabel: '+0.1 авто-клика/сек за уровень',
    icon: '🤖',
    maxLevel: 10,
    basePrice: 12_000,
    priceGrowth: 1.95,
    baseChipCost: 2,
    effectPerLevel: 0.1,
  },
  {
    key: 'analytics_desk',
    name: 'Аналитический терминал',
    description: 'Графики говорят громче слов.',
    effectLabel: '+1.5% к награде за контракты за уровень',
    icon: '📊',
    maxLevel: 10,
    basePrice: 18_000,
    priceGrowth: 1.95,
    baseChipCost: 3,
    effectPerLevel: 0.015,
  },
  {
    key: 'storage_rack',
    name: 'Стеллаж-хранилище',
    description: 'Каждый байт на своём месте — и работает на тебя.',
    effectLabel: '+1.5% к пассивному доходу за уровень',
    icon: '🗄️',
    maxLevel: 10,
    basePrice: 26_000,
    priceGrowth: 2.0,
    baseChipCost: 3,
    effectPerLevel: 0.015,
  },
  {
    key: 'thermal_paste',
    name: 'Жидкий металл',
    description: 'Минус 12 градусов — плюс пара процентов скидки у поставщиков.',
    effectLabel: '−1% к цене всех карточек за уровень',
    icon: '🧴',
    maxLevel: 10,
    basePrice: 40_000,
    priceGrowth: 2.05,
    baseChipCost: 4,
    effectPerLevel: 0.01,
  },
  {
    key: 'auto_feeder',
    name: 'Авто-кормушка',
    description: 'Питомцы едят сами, пока ты в рейде.',
    effectLabel: 'Авто-кормление питомцев +2% скидки на корм за уровень',
    icon: '🍽️',
    maxLevel: 10,
    basePrice: 60_000,
    priceGrowth: 2.0,
    baseChipCost: 4,
    effectPerLevel: 0.02,
  },
  {
    key: 'lucky_charm',
    name: 'Талисман удачи',
    description: 'Кусок материнской платы на шнурке. Работает. Не спрашивай.',
    effectLabel: '+1% к шансу дропа Crypto с контрактов за уровень',
    icon: '🍀',
    maxLevel: 10,
    basePrice: 90_000,
    priceGrowth: 2.1,
    baseChipCost: 5,
    effectPerLevel: 0.01,
  },
];

export function getBaseUpgradeConfig(key: string): BaseUpgradeConfig | undefined {
  return BASE_UPGRADES_CONFIG.find((u) => u.key === key);
}

export function getBaseUpgradePrice(config: BaseUpgradeConfig, currentLevel: number): number {
  const safeLevel = Math.max(0, Math.min(config.maxLevel, Math.floor(Number(currentLevel) || 0)));
  return Math.floor(config.basePrice * Math.pow(config.priceGrowth, safeLevel));
}

export function getBaseUpgradeChipCost(config: BaseUpgradeConfig, currentLevel: number): number {
  const safeLevel = Math.max(0, Math.min(config.maxLevel, Math.floor(Number(currentLevel) || 0)));
  return Math.max(1, config.baseChipCost + Math.floor(safeLevel / 3));
}

/** Сколько Чипов нужно за конкретный уровень карточки (только на границах тиров). */
export const CHIP_REWARD_PER_MISSION = 1;
export const CHIP_REWARD_PER_GREY_MISSION = 2;
export const CHIP_REWARD_PER_DAILY = 3;
export const CHIP_DAILY_CAP = 45;
