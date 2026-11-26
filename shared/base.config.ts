import { anchorPrice, hoursForBaseLevel } from './pricing.config';
import type { BaseUpgradeConfig } from './types';

// ============================================================================
// «БАЗА» — ПАССИВНЫЕ ПОКУПКИ ИГРОКА (12 улучшений × 15 уровней)
// ----------------------------------------------------------------------------
// В отличие от карточек, «База» НЕ сбрасывается Global Hack Престижем —
// это долгая инвестиция в комфорт между перерождениями.
// Суммарные бонусы жёстко ограничены (~+15% к экономике), чтобы не сломать баланс престижа.
// ТЗ v3: было 10 уровней за копейки — стало 15 уровней, цены ×20 и порог по уровню игрока,
// а эффект на уровень уменьшен так, чтобы МАКСИМУМ остался прежним (гриндить дольше, потолок тот же).
// ============================================================================
export const BASE_UPGRADES_CONFIG: BaseUpgradeConfig[] = [
  {
    key: 'coffee_machine',
    requiredLevel: 1,
    name: 'Кофемашина «Турбо»',
    description: 'Двойной эспрессо не спрашивает, он просто работает.',
    effectLabel: '+1.33% к скорости регена CPU Energy за уровень',
    icon: '☕',
    maxLevel: 15,
    basePrice: 24_000,
    priceGrowth: 1.85,
    baseChipCost: 1,
    effectPerLevel: 0.0133,
  },
  {
    key: 'standing_desk',
    requiredLevel: 3,
    name: 'Стоячий стол',
    description: 'Спина прямая — палец быстрее.',
    effectLabel: '+0.67% к силе клика за уровень',
    icon: '🪑',
    maxLevel: 15,
    basePrice: 48_000,
    priceGrowth: 1.85,
    baseChipCost: 1,
    effectPerLevel: 0.0067,
  },
  {
    key: 'vpn_router',
    requiredLevel: 5,
    name: 'VPN-роутер «Туман»',
    description: 'Три прыжка через вымышленные узлы — и следов нет.',
    effectLabel: '−1% к приросту Heat за уровень',
    icon: '🛡️',
    maxLevel: 15,
    basePrice: 96_000,
    priceGrowth: 1.9,
    baseChipCost: 2,
    effectPerLevel: 0.01,
  },
  {
    key: 'ups_battery',
    requiredLevel: 8,
    name: 'ИБП «Последний Бастион»',
    description: 'Город может погаснуть. Твой терминал — нет.',
    effectLabel: '+40 минут к оффлайн-копилке за уровень',
    icon: '🔋',
    maxLevel: 15,
    basePrice: 150_000,
    priceGrowth: 1.9,
    baseChipCost: 2,
    effectPerLevel: 2_400,
  },
  {
    key: 'auto_script',
    requiredLevel: 10,
    name: 'Авто-скрипт «Роевик»',
    description: 'Пока ты пьёшь кофе, он печатает.',
    effectLabel: '+0.067 авто-клика/сек за уровень',
    icon: '🤖',
    maxLevel: 15,
    basePrice: 240_000,
    priceGrowth: 1.95,
    baseChipCost: 2,
    effectPerLevel: 0.0667,
  },
  {
    key: 'analytics_desk',
    requiredLevel: 13,
    name: 'Аналитический терминал',
    description: 'Графики говорят громче слов.',
    effectLabel: '+1% к награде за контракты за уровень',
    icon: '📊',
    maxLevel: 15,
    basePrice: 360_000,
    priceGrowth: 1.95,
    baseChipCost: 3,
    effectPerLevel: 0.01,
  },
  {
    key: 'storage_rack',
    requiredLevel: 17,
    name: 'Стеллаж-хранилище',
    description: 'Каждый байт на своём месте — и работает на тебя.',
    effectLabel: '+1% к пассивному доходу за уровень',
    icon: '🗄️',
    maxLevel: 15,
    basePrice: 520_000,
    priceGrowth: 2.0,
    baseChipCost: 3,
    effectPerLevel: 0.01,
  },
  {
    key: 'thermal_paste',
    requiredLevel: 21,
    name: 'Жидкий металл',
    description: 'Минус 12 градусов — плюс пара процентов скидки у поставщиков.',
    effectLabel: '−0.67% к цене всех карточек за уровень',
    icon: '🧴',
    maxLevel: 15,
    basePrice: 800_000,
    priceGrowth: 2.05,
    baseChipCost: 4,
    effectPerLevel: 0.0067,
  },
  {
    key: 'auto_feeder',
    requiredLevel: 25,
    name: 'Авто-кормушка',
    description: 'Питомцы едят сами, пока ты в рейде.',
    effectLabel: 'Авто-кормление питомцев +1.33% скидки на корм за уровень',
    icon: '🍽️',
    maxLevel: 15,
    basePrice: 1_200_000,
    priceGrowth: 2.0,
    baseChipCost: 4,
    effectPerLevel: 0.0133,
  },
  {
    key: 'lucky_charm',
    requiredLevel: 30,
    name: 'Талисман удачи',
    description: 'Кусок материнской платы на шнурке. Работает. Не спрашивай.',
    effectLabel: '+0.67% к шансу дропа Crypto с контрактов за уровень',
    icon: '🍀',
    maxLevel: 15,
    basePrice: 1_800_000,
    priceGrowth: 2.1,
    baseChipCost: 5,
    effectPerLevel: 0.0067,
  },
  // ==========================================================================
  // v6.6: МИДГЕЙМ L34–L38. После 30 уровня «База» упиралась в потолок, и вплоть
  // до престижа (L50) новых покупок не появлялось. Два улучшения используют уже
  // существующие эффекты (награда за контракты, реген CPU) — новой механики нет.
  // ==========================================================================
  {
    key: 'neural_coprocessor',
    requiredLevel: 34,
    name: 'Нейро-сопроцессор',
    description: 'Считает вероятности исхода раньше, чем ты нажмёшь «старт».',
    effectLabel: '+0.67% к награде за контракты за уровень',
    icon: '🧠',
    maxLevel: 15,
    basePrice: 2_400_000,
    priceGrowth: 1.9,
    baseChipCost: 5,
    effectPerLevel: 0.0067,
  },
  {
    key: 'quantum_cooler',
    requiredLevel: 38,
    name: 'Квантовый охладитель',
    description: 'Минус градус — плюс заряд. Физика против жары.',
    effectLabel: '+1% к скорости регена CPU Energy за уровень',
    icon: '❄️',
    maxLevel: 15,
    basePrice: 3_200_000,
    priceGrowth: 1.9,
    baseChipCost: 5,
    effectPerLevel: 0.01,
  },
];

export function getBaseUpgradeConfig(key: string): BaseUpgradeConfig | undefined {
  return BASE_UPGRADES_CONFIG.find((u) => u.key === key);
}

/**
 * Цена уровня «Базы».
 *
 * v6.6: та же привязка к доходу, что и у карточек — цена не может превышать
 * «часы дохода» (2.5 ч на первом уровне → 24 ч на 15-м). Раньше последние
 * уровни стоили десятки миллиардов при доходе в сотни миллионов в час.
 */
export function getBaseUpgradePrice(
  config: BaseUpgradeConfig,
  currentLevel: number,
  playerLevel?: number
): number {
  const safeLevel = Math.max(0, Math.min(config.maxLevel, Math.floor(Number(currentLevel) || 0)));
  const nominal = Math.floor(config.basePrice * Math.pow(config.priceGrowth, safeLevel));
  return anchorPrice(nominal, hoursForBaseLevel(safeLevel), playerLevel);
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
