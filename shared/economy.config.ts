/**
 * HACKER KOMBAT — экономика удержания (v5.6).
 * ----------------------------------------------------------------------------
 * Один файл — одна правда о трёх вещах:
 *   1. оффлайн-доход (сколько стол заработал, пока игрока не было);
 *   2. daily streak (таблица наград дней 1..7, UTC-день, сброс при пропуске);
 *   3. политика напоминаний в Telegram (не чаще раза в сутки, только opt-in).
 *
 * Почему отдельный файл, а не константы внутри движка: те же цифры нужны
 * клиенту для превью в welcome-back модале и в streak bar. Если клиент и
 * сервер считают по-разному, игрок видит «+120 Data», а получает «+80» —
 * это худший вид бага в экономике. Поэтому формула живёт здесь и
 * импортируется в api/_lib/gameEngine.ts, api/_lib/retention.ts и в UI.
 */

import { CHIP_REWARD_PER_DAILY } from './base.config';
import { OFFLINE_PASSIVE_RATE_MULT, OFFLINE_TAP_CAP_SECONDS } from './mechanics';

// ============================================================================
// 1. ОФФЛАЙН-ДОХОД
// ============================================================================

/**
 * Доля онлайн-ставки за оффлайн. 0.5 = карточки приносят ровно половину того,
 * что принесли бы в игре: оффлайн выгоден, но играть всегда выгоднее вдвое.
 * Источник истины — shared/mechanics.ts (копилка v3.2), здесь только алиас,
 * чтобы у retention-петли и у старого движка не разъехались множители.
 */
export const RETENTION_OFFLINE_RATE_MULT = OFFLINE_PASSIVE_RATE_MULT;

/** Кап оффлайна: 8 часов. Дольше — «как будто вернулся через 8 часов». */
export const RETENTION_OFFLINE_CAP_SECONDS = OFFLINE_TAP_CAP_SECONDS;

/**
 * Минимальная пауза, чтобы вообще считать её оффлайном.
 * 3 часа: короче — игрок просто переключал вкладки, модал «пока тебя не было»
 * на такое показывать нельзя (он превратится в спам и его начнут закрывать).
 */
export const RETENTION_OFFLINE_MIN_ABSENCE_SECONDS = 3 * 3600;

/** Меньше этого — модал не показываем: «+3 Data» выглядит как издевательство. */
export const RETENTION_OFFLINE_MIN_CLAIM_DATA = 10;

export interface OfflineEarnings {
  /** Есть что забирать (модал показываем). */
  eligible: boolean;
  /** Почему не начислено — для алерта и для QA. */
  reason: 'ok' | 'no_rate' | 'too_short' | 'capped_zero' | 'active_missions' | 'below_threshold';
  /** Сколько секунд игрока не было (по lastSeenAt). */
  awaySeconds: number;
  /** Сколько из них реально оплачено (после капа). */
  paidSeconds: number;
  /** Начисляемая сумма Data (уже округлена до 0.1). */
  data: number;
  /** Ставка, по которой считали (Data/ч, уже с ×0.5). */
  ratePerHour: number;
  /** На сколько часов срезал кап (0 — кап не сработал). */
  cappedHours: number;
}

export interface OfflineEarningsInput {
  /** Полная онлайн-ставка игрока (deriveStats(record).dataPerHour). */
  dataPerHour: number;
  /** Время с последнего визита, секунды (now - lastSeenAt). */
  awaySeconds: number;
  /**
   * Идут активные миссии ⇒ оффлайн НЕ начисляется.
   * Причина не в жадности: миссия уже платит за время, и вторая выплата за те
   * же часы превращает «запустил миссию и ушёл» в лучшую стратегию игры.
   */
  hasActiveMissions?: boolean;
}

/**
 * Чистая функция: сколько Data стол заработал за отсутствие.
 * Вызывается и на сервере (решение о выплате), и на клиенте (превью).
 */
export function computeOfflineEarnings(input: OfflineEarningsInput): OfflineEarnings {
  const ratePerHour = Math.max(0, input.dataPerHour) * RETENTION_OFFLINE_RATE_MULT;
  const awaySeconds = Math.max(0, Math.floor(input.awaySeconds));
  const paidSeconds = Math.min(awaySeconds, RETENTION_OFFLINE_CAP_SECONDS);
  const cappedHours = Math.max(0, (awaySeconds - paidSeconds) / 3600);

  const base: OfflineEarnings = {
    eligible: false,
    reason: 'too_short',
    awaySeconds,
    paidSeconds,
    data: 0,
    ratePerHour,
    cappedHours,
  };

  if (ratePerHour <= 0) return { ...base, reason: 'no_rate' };
  if (awaySeconds < RETENTION_OFFLINE_MIN_ABSENCE_SECONDS) return base;
  if (input.hasActiveMissions) return { ...base, reason: 'active_missions' };

  const data = Math.floor(((ratePerHour / 3600) * paidSeconds) * 10) / 10;
  if (data <= 0) return { ...base, reason: 'capped_zero' };
  if (data < RETENTION_OFFLINE_MIN_CLAIM_DATA) return { ...base, data, reason: 'below_threshold' };

  return { ...base, eligible: true, reason: 'ok', data };
}

// ============================================================================
// 2. DAILY STREAK
// ============================================================================

/** Потолок стрика: после 7-го дня цикл начинается заново с первого. */
export const DAILY_STREAK_MAX = 7;

/**
 * Окно «ещё не пропустил»: клайм вчерашнего дня + сегодняшний = стрик растёт.
 * Сутки + запас 12 часов: игрок, зашедший «сегодня вечером» после вчерашнего
 * утра, стрик не теряет — иначе on-бординг наказаний съест всю петлю.
 */
export const DAILY_STREAK_GRACE_HOURS = 12;

/** Сколько часов между клаймами одного дня (античит, как в v3.2). */
export const DAILY_CLAIM_COOLDOWN_HOURS = 20;

export interface DailyStreakReward {
  /** День цикла 1..7. */
  day: number;
  /** Множитель Data: фактическая выплата = 150 × day × престиж × уровень/3. */
  dataUnits: number;
  /** Crypto за день (3 + day × 2 — та же формула, что платит движок). */
  crypto: number;
  /** Чипы за день. */
  chips: number;
  /** Короткая подпись для streak bar. */
  label: string;
}

/**
 * Таблица наград дней 1..7.
 *
 * Числа повторяют выплату серверного handleDailyBonus(): crypto = 3 + day·2,
 * data = 150·day·prestige·ceil(level/3), chips = CHIP_REWARD_PER_DAILY.
 * Дублирование намеренное: таблица нужна UI до первого клайма, когда никакой
 * записи игрока ещё нет, а движок обязан остаться единственным плательщиком.
 */
export const DAILY_STREAK_REWARDS: readonly DailyStreakReward[] = Array.from(
  { length: DAILY_STREAK_MAX },
  (_, i) => {
    const day = i + 1;
    return {
      day,
      dataUnits: day,
      crypto: 3 + day * 2,
      chips: CHIP_REWARD_PER_DAILY,
      label: `День ${day}`,
    } as DailyStreakReward;
  }
);

export function getDailyStreakReward(day: number): DailyStreakReward {
  const safe = Math.min(DAILY_STREAK_MAX, Math.max(1, Math.floor(day) || 1));
  return DAILY_STREAK_REWARDS[safe - 1];
}

/**
 * UTC-ключ дня 'YYYY-MM-DD'.
 *
 * Почему UTC, а не «день игры» по Москве (как в копилке v3.2): streak
 * проверяется ТОЛЬКО на сервере, а сервер живёт в UTC и не имеет права
 * зависеть от часового пояса клиента (иначе переезд пояса = лишний клайм).
 */
export function getUtcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Разница в календарных днях между двумя UTC-ключами (b - a). */
export function diffUtcDayKeys(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00.000Z`);
  const b = Date.parse(`${toKey}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export interface NextStreakInput {
  /** UTC-ключ последнего клайма ('YYYY-MM-DD') из stats.lastDailyClaim. */
  lastClaimDayKey?: string | null;
  /** Сегодняшний UTC-ключ (считает сервер, клиент только отображает). */
  todayKey: string;
  /** Текущее значение stats.dailyStreak. */
  currentStreak: number;
}

export interface NextStreakResult {
  /** Что записать в stats.dailyStreak. */
  streak: number;
  /** День цикла 1..7 — подсветка клетки в streak bar. */
  day: number;
  /** Пропущен день (или первый клайм) ⇒ стрик начался заново с 1. */
  reset: boolean;
  /** Уже забирали сегодня (повторный клайм запрещён). */
  alreadyClaimedToday: boolean;
}

/**
 * Следующее значение стрика по UTC-дню.
 *
 * Правила (именно они проверяются в scripts/qa/retention.mjs):
 *   • сегодня уже забирали            → стрик не меняется, alreadyClaimedToday;
 *   • последний клайм вчера           → streak + 1, но не больше 7;
 *   • последний клайм сегодня-минус-1 и стрик = 7 → снова 1 (цикл);
 *   • пропуск дня (или первый клайм)  → 1.
 */
export function computeNextStreak(input: NextStreakInput): NextStreakResult {
  const current = Math.min(DAILY_STREAK_MAX, Math.max(0, Math.floor(input.currentStreak) || 0));
  const day = Math.min(DAILY_STREAK_MAX, Math.max(1, current || 1));
  const last = input.lastClaimDayKey ?? null;

  if (last === input.todayKey) {
    return { streak: current, day, reset: false, alreadyClaimedToday: true };
  }

  if (!last) {
    return { streak: 1, day: 1, reset: true, alreadyClaimedToday: false };
  }

  const gap = diffUtcDayKeys(last, input.todayKey);
  // gap = 1 — вчерашний клайм, стрик растёт; всё остальное (0 не бывает,
  // больше 1 — пропуск, отрицательный — испорченные данные) = обрыв.
  if (gap === 1 && current > 0) {
    const next = current >= DAILY_STREAK_MAX ? 1 : current + 1;
    return { streak: next, day: next, reset: next === 1, alreadyClaimedToday: false };
  }

  return { streak: 1, day: 1, reset: true, alreadyClaimedToday: false };
}

// ============================================================================
// 3. НАПОМИНАНИЯ В TELEGRAM (opt-in)
// ============================================================================

/** Не чаще одного напоминания в сутки — даже если игрок заходит каждый час. */
export const RETENTION_REMINDER_MIN_INTERVAL_SECONDS = 24 * 3600;

/**
 * Пауза после последней сессии, прежде чем писать «забери бонус».
 * ~24 часа: раньше — это не напоминание, а навязчивость.
 */
export const RETENTION_REMINDER_IDLE_SECONDS = 24 * 3600;

export interface ReminderDecisionInput {
  /** Флаг retentionV1 включён. */
  enabled: boolean;
  /** Игрок сам поставил галочку (default OFF). */
  optedIn: boolean;
  /** Есть ли TELEGRAM_BOT_TOKEN: без него отправлять некуда. */
  hasBotToken: boolean;
  /** Последняя отправка (ISO) из stats.lastReminderSentAt. */
  lastSentAt?: string | null;
  /** Время последней сессии (ISO) из stats.lastSeenAt. */
  lastSeenAt?: string | null;
  /** Дневной клайм за сегодня уже взят. */
  dailyClaimedToday: boolean;
  /** Текущее время, мс. */
  nowMs: number;
}

export type ReminderDecision = 'send' | 'disabled' | 'opted_out' | 'no_token' | 'cooldown' | 'recently_active' | 'already_claimed';

/**
 * Можно ли слать напоминание прямо сейчас.
 * Порядок проверок важен для QA: сначала «выключено», потом «не opt-in»,
 * потом «нет токена», и только затем тайминги.
 */
export function canSendReminder(input: ReminderDecisionInput): ReminderDecision {
  if (!input.enabled) return 'disabled';
  if (!input.optedIn) return 'opted_out';
  if (!input.hasBotToken) return 'no_token';
  if (input.dailyClaimedToday) return 'already_claimed';

  const sentMs = input.lastSentAt ? Date.parse(input.lastSentAt) : Number.NaN;
  if (!Number.isNaN(sentMs) && input.nowMs - sentMs < RETENTION_REMINDER_MIN_INTERVAL_SECONDS * 1000) {
    return 'cooldown';
  }

  const seenMs = input.lastSeenAt ? Date.parse(input.lastSeenAt) : Number.NaN;
  if (Number.isNaN(seenMs)) return 'recently_active';
  if (input.nowMs - seenMs < RETENTION_REMINDER_IDLE_SECONDS * 1000) return 'recently_active';

  return 'send';
}

/** Текст напоминания. Один и тот же на сервере и в UI-заглушке. */
export const RETENTION_REMINDER_TEXT =
  '🎁 Стол ждёт: дневной бонус не забран, а карточки копили Data. Заходи в Hacker Kombat.';
