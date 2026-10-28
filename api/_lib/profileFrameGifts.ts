import { getProfileFrame } from '../../shared/profileFrames.config';
import type { PlayerProgressStats } from '../../shared/types';

/**
 * Серверный реестр персональных подарков. В клиентский bundle он не попадает:
 * назначение зависит от Telegram ID, а не от редактируемого username.
 *
 * Подарок добавляется только в коллекцию. Автоматически надевать его при
 * каждом sync нельзя: игрок должен иметь возможность снять рамку и выбрать её
 * позже самостоятельно.
 */
const PERMANENT_PROFILE_FRAME_GIFTS: Readonly<Record<number, readonly string[]>> = {
  296_857_803: ['frame_rainbow_fish'],
  495_832_433: ['frame_rooster_red'],
  6_623_819_182: ['frame_matrix_rain'],
};

export function ensurePermanentProfileFrameGifts(
  stats: PlayerProgressStats,
  tgId: number
): boolean {
  const assigned = PERMANENT_PROFILE_FRAME_GIFTS[tgId] ?? [];
  const validAssigned = assigned.filter((key) => {
    const frame = getProfileFrame(key);
    return frame.key === key && frame.giftOnly === true;
  });
  if (validAssigned.length === 0) return false;

  const before = stats.unlockedProfileFrames ?? [];
  const next = Array.from(new Set([...before, ...validAssigned]));
  const changed = next.length !== before.length || next.some((key, index) => key !== before[index]);
  if (changed) stats.unlockedProfileFrames = next;
  return changed;
}
