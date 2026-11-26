/**
 * Сезон «Леденец» (v6.3).
 *
 * Одна кнопка и один множитель: игрок активирует леденец раз в игровые сутки и
 * час получает ×2 Data со всех ручных действий (тапы и закрытые взломы).
 *
 * Что здесь важно:
 *   • буст — это только временное окно (`activeUntil`), он не копится и не
 *     превращается в валюту: истёк — исчез без следа;
 *   • окно живёт по абсолютному времени, поэтому тикает и вне игры;
 *   • множитель применяется на сервере при начислении, клиент его только
 *     показывает — подкрутить ×2 из консоли нельзя.
 */
import { getGameDayBoundsMs, getGameDayKey } from './mechanics';

/** Сезон включён. Выключение флага гасит механику и в UI, и на сервере. */
export const isSeasonActive = true;

/** Сезон длится сутки — окно, в котором леденец вообще доступен. */
export const durationMs = 86_400_000;

/** Сколько длится сам буст после активации. */
export const LOLLIPOP_BOOST_MS = 3_600_000;

/** Множитель Data во время буста. */
export const LOLLIPOP_MULTIPLIER = 2;

export interface LollipopTiming {
  activeUntil?: string | null;
  lastActivatedDayKey?: string | null;
}

/** Идёт ли буст прямо сейчас. */
export function isLollipopActive(
  state: LollipopTiming | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!isSeasonActive || !state?.activeUntil) return false;
  const until = new Date(state.activeUntil).getTime();
  return Number.isFinite(until) && until > nowMs;
}

/** Множитель начисления Data: 2 во время буста, иначе 1. */
export function lollipopMultiplier(
  state: LollipopTiming | undefined,
  nowMs: number = Date.now()
): number {
  return isLollipopActive(state, nowMs) ? LOLLIPOP_MULTIPLIER : 1;
}

export function lollipopRemainingMs(
  state: LollipopTiming | undefined,
  nowMs: number = Date.now()
): number {
  if (!isLollipopActive(state, nowMs)) return 0;
  return Math.max(0, new Date(String(state?.activeUntil)).getTime() - nowMs);
}

/** Сколько миллисекунд осталось до новой попытки (до 00:00 MSK). */
export function lollipopCooldownMs(state: LollipopTiming | undefined, nowMs: number): number {
  const dayKey = getGameDayKey(nowMs);
  if (state?.lastActivatedDayKey !== dayKey) return 0;
  return Math.max(0, getGameDayBoundsMs(dayKey).end - nowMs);
}

/** Можно ли активировать: сезон открыт, буст не идёт, сегодня ещё не активировали. */
export function canActivateLollipop(
  state: LollipopTiming | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!isSeasonActive) return false;
  if (isLollipopActive(state, nowMs)) return false;
  return lollipopCooldownMs(state, nowMs) === 0;
}

/** Компактный обратный отсчёт «ч:мм» — одинаковый в бейдже и в плашке. */
export function formatLollipopLeft(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}
