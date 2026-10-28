// ============================================================================
// РЕФЕРАЛЬНАЯ ПРОГРАММА (v3.5)
// ----------------------------------------------------------------------------
// Принцип: награда не «флэт», а ДОЛЯ от текущей прогрессии игрока.
//   • XP   — половина текущего уровня: 0.5 × getXpToNext(level);
//   • Data — один час пассивного дохода, но в разумной вилке.
// Поэтому и новичку не даёт «перепрыгнуть игру», и ветерану не даёт пустышку.
//
// Лимиты ниже — это защита экономики и Престижа: рефералка не должна быть
// быстрее самой игры. Все значения в одном месте, чтобы правки не расползались.
// ============================================================================
import { getXpToNext } from './hack.config';

/** Друг считается «настоящим», когда реально поиграл столько секунд. */
export const REFERRAL_QUALIFY_ACTIVE_SECONDS = 8 * 60;

/** Награда пригласившему: половина его текущего уровня в XP. */
export const REFERRAL_REFERRER_XP_SHARE = 0.5;

/** Награда пригласившему: час пассивного дохода, но в вилке. */
export const REFERRAL_REFERRER_DATA_HOURS = 1;
export const REFERRAL_REFERRER_DATA_MIN = 2_000;
export const REFERRAL_REFERRER_DATA_MAX = 250_000;

/** Приглашённому: немного на старт, чтобы не уйти сразу. */
export const REFERRAL_INVITEE_XP_SHARE = 0.15;
export const REFERRAL_INVITEE_DATA = 2_000;

/** Потолки, чтобы рефералка не заменила игру. */
export const REFERRAL_DAILY_LIMIT = 3;
export const REFERRAL_WEEKLY_LIMIT = 10;
export const REFERRAL_XP_DAILY_LEVELS = 1;
export const REFERRAL_XP_WEEKLY_LEVELS = 3;
export const REFERRAL_DATA_WEEKLY_HOURS = 8;

/** Префикс кода приглашения в ссылке: ?startapp=ref_ab12cd34 */
export const REFERRAL_LINK_PREFIX = 'ref_';
export const REFERRAL_CODE_LENGTH = 8;

/** Через сколько суток после регистрации приглашённого ещё можно засчитать. */
export const REFERRAL_ATTRIBUTION_WINDOW_DAYS = 7;

/** Храним только хэш (не сам IP) — для эвристики «много аккаунтов с одной сети». */
export const REFERRAL_MAX_SAME_NETWORK_PER_DAY = 3;

export type ReferralStatus = 'attributed' | 'qualified' | 'rewarded' | 'flagged';

export function isValidReferralCode(code: unknown): code is string {
  if (typeof code !== 'string') return false;
  return new RegExp(`^[a-z0-9]{${REFERRAL_CODE_LENGTH}}$`).test(code);
}

/** Достаёт код из start_param вида "ref_ab12cd34". */
export function parseReferralStartParam(startParam: unknown): string | null {
  if (typeof startParam !== 'string') return null;
  const raw = startParam.trim().toLowerCase();
  if (!raw.startsWith(REFERRAL_LINK_PREFIX)) return null;
  const code = raw.slice(REFERRAL_LINK_PREFIX.length);
  return isValidReferralCode(code) ? code : null;
}

/** XP пригласившему — половина текущего уровня, включая открытый эндгейм. */
export function getReferrerXpReward(level: number): number {
  const next = getXpToNext(level);
  if (!Number.isFinite(next) || next <= 0) return 0;
  return Math.max(1, Math.round(next * REFERRAL_REFERRER_XP_SHARE));
}

/** Data пригласившему — час пассива с вилкой. */
export function getReferrerDataReward(dataPerHour: number): number {
  const hour = Math.max(0, Number(dataPerHour) || 0) * REFERRAL_REFERRER_DATA_HOURS;
  return Math.round(Math.min(REFERRAL_REFERRER_DATA_MAX, Math.max(REFERRAL_REFERRER_DATA_MIN, hour)));
}

export function getInviteeXpReward(level: number): number {
  const next = getXpToNext(level);
  if (!Number.isFinite(next) || next <= 0) return 0;
  return Math.max(1, Math.round(next * REFERRAL_INVITEE_XP_SHARE));
}

export const REFERRAL_INVITEE_DATA_REWARD = REFERRAL_INVITEE_DATA;

/** Человекочитаемые правила для UI и бота (одна строка). */
export const REFERRAL_RULES_SHORT =
  'Друг должен сыграть 8 минут. За каждого засчитанного друга: половина твоего уровня в XP ' +
  'и час пассивного дохода в Data. Другу — стартовый бонус. Лимит: 3 друга в сутки, 10 в неделю.';
