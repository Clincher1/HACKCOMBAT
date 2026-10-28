import {
  GIFT_COLA_ITEM_KEY,
  GIFT_SNUS_ITEM_KEY,
  GIFT_WHISKEY_ITEM_KEY,
  getInventoryItemDefinition,
} from '../../shared/inventory.config';
import type { PlayerProgressStats } from '../../shared/types';

/**
 * Серверный реестр постоянных предметных подарков.
 *
 * Назначение привязано к стабильному Telegram ID, а не к username: ник может
 * измениться, а подарок должен оставаться у того же игрока навсегда.
 * Предметы добавляются только в коллекцию — игрок сам решает, выставлять их
 * в публичной витрине или оставить скрытыми.
 */
const PERMANENT_PROFILE_INVENTORY_GIFTS: Readonly<Record<number, readonly string[]>> = {
  296_857_803: [GIFT_COLA_ITEM_KEY, GIFT_WHISKEY_ITEM_KEY, GIFT_SNUS_ITEM_KEY],
  495_832_433: [GIFT_COLA_ITEM_KEY, GIFT_WHISKEY_ITEM_KEY, GIFT_SNUS_ITEM_KEY],
  6_623_819_182: [GIFT_COLA_ITEM_KEY, GIFT_WHISKEY_ITEM_KEY, GIFT_SNUS_ITEM_KEY],
};

export function ensurePermanentProfileInventoryGifts(
  stats: PlayerProgressStats,
  tgId: number
): boolean {
  const assigned = PERMANENT_PROFILE_INVENTORY_GIFTS[tgId] ?? [];
  const validAssigned = assigned.filter((key) => {
    const item = getInventoryItemDefinition(key);
    return item?.kind === 'reward' && item.usable === false && item.equipAction === null;
  });
  if (validAssigned.length === 0) return false;

  const before = stats.inventoryOwned ?? [];
  const next = Array.from(new Set([...before, ...validAssigned]));
  const changed = next.length !== before.length || next.some((key, index) => key !== before[index]);
  if (changed) stats.inventoryOwned = next;
  return changed;
}

export const PERSONAL_PROFILE_INVENTORY_GIFT_ASSIGNMENTS = PERMANENT_PROFILE_INVENTORY_GIFTS;
