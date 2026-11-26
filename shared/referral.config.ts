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

// ============================================================================
// v5.6 — DEEP LINKS ПО TELEGRAM ID (?start=ref_<tgId>)
// ----------------------------------------------------------------------------
// Старая ссылка v3.5 (?startapp=ref_ab12cd34) требует таблицы referral_codes
// и уникальна на игрока. Новая — читаемый tgId: человек видит, кого зовёт:
//   https://t.me/<bot>?start=ref_123456789
// Атрибуция остаётся серверной: код находится по tgId, а привязку делает тот
// же движок v3.5 (PK(invitee_tg) — двойной привязки быть не может).
// ============================================================================

/** Префикс tgId-ссылки. Совпадает с кодовым — различает только содержимое. */
export const REFERRAL_TG_ID_PREFIX = 'ref_';

/** Telegram IDs короче 5 и длиннее 15 цифр не бывает. */
export const REFERRAL_TG_ID_MIN = 10_000;
export const REFERRAL_TG_ID_MAX = 9_999_999_999_999_999;

/**
 * K: сколько успешных приглашений засчитываем одному рефереру в неделю.
 * Жёстче общего REFERRAL_WEEKLY_LIMIT=10 осознанно: tgId-ссылка расшаривается
 * в чаты, и без отдельного потолка «пригласи всех» превращается в спам-акцию.
 */
export const REFERRAL_TG_WEEKLY_CAP = 3;

/** Приглашённому — разовый welcome-бонус в первый заход по ссылке. */
export const REFERRAL_TG_WELCOME_DATA = 1_000;
export const REFERRAL_TG_WELCOME_CHIPS = 1;

/** Пригласившему — M Чипов сверх обычной выплаты v3.5 за первого сеанс друга. */
export const REFERRAL_TG_REFERRER_CHIPS = 2;

/** Есть ли в start_param tgId-ссылка. */
export function isReferralTgStartParam(startParam: unknown): boolean {
  return parseReferrerTgId(startParam) !== null;
}

/**
 * Достаёт Telegram ID пригласившего из start_param вида "ref_123456789".
 * Возвращает null для кодовой ссылки v3.5 (8 hex-символов) и мусора.
 */
export function parseReferrerTgId(startParam: unknown): number | null {
  if (typeof startParam !== 'string') return null;
  const raw = startParam.trim().toLowerCase();
  if (!raw.startsWith(REFERRAL_TG_ID_PREFIX)) return null;
  const digits = raw.slice(REFERRAL_TG_ID_PREFIX.length);
  if (!/^\d+$/.test(digits)) return null;
  // Код v3.5 тоже может состоять из 8 цифр — такие значения не считаем tgId,
  // если они не проходят вилку Telegram ID.
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value < REFERRAL_TG_ID_MIN || value > REFERRAL_TG_ID_MAX) return null;
  return value;
}

/**
 * Ссылка приглашения. Бот берётся из TELEGRAM_BOT_USERNAME; fallback —
 * публичный юзернейм текущего прод-бота, чтобы ссылка не была пустой, если
 * переменная не заведена (см. api/_lib/retention.ts).
 */
export const REFERRAL_FALLBACK_BOT_USERNAME = 'HackerKombatBot';

export function buildReferralTgLink(botUsername: string | null | undefined, tgId: number): string {
  const bot = (botUsername || REFERRAL_FALLBACK_BOT_USERNAME).replace(/^@/, '').trim();
  return `https://t.me/${bot}?start=${REFERRAL_TG_ID_PREFIX}${tgId}`;
}

/** Правила v5.6 — одна строка для карточки в профиле. */
export const REFERRAL_TG_RULES_SHORT =
  `Ссылка вида ?start=ref_<твой ID>: друг заходит по ней, играет 8 минут — ты получаешь ` +
  `награду v3.5 плюс ${REFERRAL_TG_REFERRER_CHIPS} Чипа, а друг — ${REFERRAL_TG_WELCOME_DATA} Data ` +
  `на старт. Не больше ${REFERRAL_TG_WEEKLY_CAP} друзей в неделю.`;
