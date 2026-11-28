import type { ConsumableItemDefinition, ItemRarity } from './types';

/**
 * HACKER KOMBAT — «Инвентарь оживает»: каталог расходников и таблицы дропа.
 * ----------------------------------------------------------------------------
 * Файл отдельный от inventory.config.ts намеренно: его импортируют и сервер
 * (эффекты, ролл), и ленивый чанк инвентаря (карточки). Если положить каталог в
 * inventory.config.ts, экран потащил бы за собой конфиги скинов, питомцев и
 * достижений ради пяти предметов.
 *
 * Здесь только данные и чистые функции. Сами эффекты (CPU, Heat, таймеры)
 * считает сервер: api/_lib/gameEngine.ts.
 */

/** Кофе-раф: мгновенно +150 CPU, но не выше капа энергии. */
export const COFFEE_RAF_ITEM_KEY = 'consumable:coffee_raf';
/** Стержень охлаждения: −50 Heat, но не ниже нуля. */
export const COOLING_ROD_ITEM_KEY = 'consumable:cooling_rod';
/** Эксплойт-инъекция: +15% к шансу следующего контракта, тратится при старте. */
export const EXPLOIT_INJECTION_ITEM_KEY = 'consumable:exploit_injection';
/** Модификатор канала: 15 минут ×1.25 Data с тапов, повтор продлевает таймер. */
export const CHANNEL_MODIFIER_ITEM_KEY = 'consumable:channel_modifier';
/** Протокол-Феникс: при провале контракта вернёт 50% входа, тратится сам. */
export const PHOENIX_PROTOCOL_ITEM_KEY = 'consumable:phoenix_protocol';

export const CONSUMABLES_CONFIG: ConsumableItemDefinition[] = [
  {
    key: COFFEE_RAF_ITEM_KEY,
    kind: 'consumable',
    name: 'Кофе-раф',
    description: '+150 CPU сразу. Выше капа энергии не поднимает — остаток сгорает.',
    icon: '☕',
    source: 'Дроп: взломы и контракты',
    accent: '#f59e0b',
    rarity: 'common',
    usable: true,
    equipAction: null,
    effect: { kind: 'energy', amount: 150 },
  },
  {
    key: COOLING_ROD_ITEM_KEY,
    kind: 'consumable',
    name: 'Стержень охлаждения',
    description: '−50 Heat сразу. Ниже нуля не опускает — переохлаждение не считается.',
    icon: '🧊',
    source: 'Дроп: взломы и контракты',
    accent: '#38bdf8',
    rarity: 'common',
    usable: true,
    equipAction: null,
    effect: { kind: 'heat', amount: -50 },
  },
  {
    key: EXPLOIT_INJECTION_ITEM_KEY,
    kind: 'consumable',
    name: 'Эксплойт-инъекция',
    description: '+15% к шансу успеха следующего контракта. Списывается в момент запуска.',
    icon: '💉',
    source: 'Дроп: взломы и контракты',
    accent: '#a855f7',
    rarity: 'rare',
    usable: true,
    equipAction: null,
    effect: { kind: 'exploit', successBonus: 0.15 },
  },
  {
    key: CHANNEL_MODIFIER_ITEM_KEY,
    kind: 'consumable',
    name: 'Модификатор канала',
    description: '15 минут ×1.25 Data с тапов. Повторное применение продлевает таймер, а не складывает множитель.',
    icon: '📡',
    source: 'Дроп: взломы и контракты',
    accent: '#22d3ee',
    rarity: 'rare',
    usable: true,
    equipAction: null,
    durationLabel: '15 мин',
    effect: { kind: 'channel', multiplier: 1.25, durationSec: 900 },
  },
  {
    key: PHOENIX_PROTOCOL_ITEM_KEY,
    kind: 'consumable',
    name: 'Протокол-Феникс',
    description: 'Если контракт провалится, вернёт 50% входной платы. Срабатывает сам и сгорает.',
    icon: '🐦',
    source: 'Дроп: взломы и контракты',
    accent: '#fb7185',
    rarity: 'epic',
    usable: false,
    equipAction: null,
    effect: { kind: 'phoenix', refundPct: 0.5 },
  },
];

export const CONSUMABLES_BY_KEY: Record<string, ConsumableItemDefinition> = Object.fromEntries(
  CONSUMABLES_CONFIG.map((item) => [item.key, item])
);

export function getConsumableItem(key: string): ConsumableItemDefinition | null {
  return CONSUMABLES_BY_KEY[key] ?? null;
}

/** Шанс дропа за успешный исход. Тап-дропа не существует: тапы сервер не подтверждает. */
export const ITEM_DROP_CHANCE_BY_HACK: Record<string, number> = {
  easy: 0.1,
  medium: 0.15,
  hard: 0.2,
};
export const ITEM_DROP_CHANCE_MISSION = 0.08;
/** Внутри дропа: 85% common / 12% rare / 3% epic. */
export const ITEM_RARITY_WEIGHTS: Record<ItemRarity, number> = { common: 85, rare: 12, epic: 3 };
/** Гарантированный предмет за достижение уровня (по одному, ровно один раз). */
export const LEVEL_ITEM_MILESTONES = [5, 10, 15, 20] as const;
/** На уровнях-рубежах выпадает common (80%) или rare (20%), epic — никогда. */
export const LEVEL_ITEM_RARE_WEIGHT = 20;

/**
 * Источник дропа. `daily` (v1.6) — гарантированный предмет за полный сбор трёх
 * целей дня; расширение CHECK в таблице `item_drops` делает миграция 023.
 */
export type ItemDropSource = 'hack' | 'mission' | 'level' | 'daily';

/**
 * Редкость по весам. rng подставляется в тестах (засеянный генератор),
 * в игре — Math.random на сервере.
 */
export function rollItemRarity(rng: () => number = Math.random): ItemRarity {
  const roll = rng() * 100;
  if (roll < ITEM_RARITY_WEIGHTS.epic) return 'epic';
  if (roll < ITEM_RARITY_WEIGHTS.epic + ITEM_RARITY_WEIGHTS.rare) return 'rare';
  return 'common';
}

/** Случайный предмет нужной редкости (внутри редкости — равные шансы). */
export function pickConsumableByRarity(rarity: ItemRarity, rng: () => number = Math.random): ConsumableItemDefinition {
  const pool = CONSUMABLES_CONFIG.filter((item) => item.rarity === rarity);
  if (pool.length === 0) return CONSUMABLES_CONFIG[0];
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[index];
}

/**
 * Ролл дропа за успешный исход. Возвращает предмет или null.
 * `difficulty` принимается только для взломов (easy/medium/hard).
 */
export function rollItemDrop(
  source: 'hack' | 'mission',
  options: { difficulty?: string } = {},
  rng: () => number = Math.random
): ConsumableItemDefinition | null {
  const chance =
    source === 'hack'
      ? ITEM_DROP_CHANCE_BY_HACK[String(options.difficulty ?? 'easy')] ?? ITEM_DROP_CHANCE_BY_HACK.easy
      : ITEM_DROP_CHANCE_MISSION;
  if (rng() >= chance) return null;
  return pickConsumableByRarity(rollItemRarity(rng), rng);
}

/** Предмет за уровень-рубеж: common или rare, никогда epic. */
export function rollLevelItem(rng: () => number = Math.random): ConsumableItemDefinition {
  const rarity: ItemRarity = rng() * 100 < LEVEL_ITEM_RARE_WEIGHT ? 'rare' : 'common';
  return pickConsumableByRarity(rarity, rng);
}

/**
 * Полный сбор целей дня (v1.6): гарантированный предмет, common 80% / rare 20%.
 * Epic исключён осознанно — ежедневный полный сбор не должен быть источником
 * лучшего расходника в игре; его дают взломы (3% внутри дропа) и рулетка уровней.
 */
export const DAILY_FULL_SET_RARE_WEIGHT = 20;

export function rollDailyFullSetItem(rng: () => number = Math.random): ConsumableItemDefinition {
  const rarity: ItemRarity = rng() * 100 < DAILY_FULL_SET_RARE_WEIGHT ? 'rare' : 'common';
  return pickConsumableByRarity(rarity, rng);
}

export function isLevelItemMilestone(level: number): boolean {
  return (LEVEL_ITEM_MILESTONES as readonly number[]).includes(level);
}
