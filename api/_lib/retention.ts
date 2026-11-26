// ============================================================================
// RETENTION-ПЕТЛЯ — серверный слой (v5.6)
// ----------------------------------------------------------------------------
// Три задачи, один файл, потому что все три живут вокруг одного события —
// init игрока и его stats jsonb:
//
//   1. ОФФЛАЙН. «Пока тебя не было стол заработал N Data». Считаем на init
//      от stats.lastSeenAt, но НЕ платим: сумма кладётся в stats.pendingOffline,
//      а деньги выдаёт только явный claim (кнопка Collect) — идемпотентно.
//      Это защищает от «модал открылся, игрок закрыл приложение, пришёл снова
//      и получил ещё раз»: pending очищается в момент выплаты.
//
//   2. DAILY STREAK. Дата клайма пишется ТОЛЬКО сервером и ТОЛЬКО в UTC
//      (stats.lastDailyClaim = 'YYYY-MM-DD'). Клиент не присылает время —
//      значит перевод часов на телефоне стрик не продлевает.
//
//   3. НАПОМИНАНИЕ в Telegram. opt-in (default OFF), не чаще раза в сутки,
//      ~24 ч после последней сессии, и только если дневной бонус не забран.
//      Без TELEGRAM_BOT_TOKEN — честный no-op с логом и UI-заглушка.
//
// Жёсткое правило: при выключенном флаге retentionV1 НИ ОДНО поле не пишется
// и ни одно сообщение не отправляется. Флаг проверяется первой строкой каждой
// функции — «выключено = ровно как до v5.6».
// ============================================================================

import {
  canSendReminder,
  computeNextStreak,
  computeOfflineEarnings,
  getUtcDayKey,
  RETENTION_OFFLINE_CAP_SECONDS,
  RETENTION_REMINDER_TEXT,
  type OfflineEarnings,
  type ReminderDecision,
} from '../../shared/economy.config';
import { isRetentionV1Enabled } from '../../shared/config';
import type { PendingOfflineEarnings } from '../../shared/types';
import { getBotToken, tgApi } from './donations';
import type { StoredPlayerRecord } from './gameEngine';

/** Поля stats, которые нужны оффлайн-логике. Передаются явно — так проще тестировать. */
export interface OfflineContext {
  dataPerHour: number;
  hasActiveMissions: boolean;
}

/**
 * Считает оффлайн на init и складывает его в stats.pendingOffline.
 *
 * Возвращает `suppressLegacyPayout: true`, когда отсутствие достаточно долгое,
 * чтобы за него платила НОВАЯ копилка. В этом случае вызывающий код обязан
 * пропустить старую выплату v3.2 за этот init — иначе игрок получит деньги
 * дважды за одни и те же часы.
 */
export function applyOfflineOnInit(
  record: StoredPlayerRecord,
  ctx: OfflineContext,
  nowMs = Date.now()
): { earnings: OfflineEarnings | null; suppressLegacyPayout: boolean } {
  if (!isRetentionV1Enabled()) return { earnings: null, suppressLegacyPayout: false };
  if (!Number.isSafeInteger(record.tgId) || record.tgId <= 0) {
    return { earnings: null, suppressLegacyPayout: false };
  }

  const seenIso = record.stats.lastSeenAt ?? null;
  const seenMs = seenIso ? Date.parse(seenIso) : Number.NaN;
  const isFirstSeen = !seenIso || Number.isNaN(seenMs);
  if (isFirstSeen) return { earnings: null, suppressLegacyPayout: false };

  const awaySeconds = Math.max(0, Math.floor((nowMs - seenMs) / 1000));
  const earnings = computeOfflineEarnings({
    dataPerHour: ctx.dataPerHour,
    awaySeconds,
    hasActiveMissions: ctx.hasActiveMissions,
  });

  // Достаточно долгое отсутствие: новая копилка берёт эти часы на себя.
  const suppressLegacyPayout = awaySeconds >= RETENTION_OFFLINE_MIN_ABSENCE_FOR_SUPPRESS;

  if (!earnings.eligible) {
    // Нечего платить — сбрасываем устаревший pending, чтобы модал не висел
    // с суммой, посчитанной неделю назад (правило «раз за сессию»).
    if (record.stats.pendingOffline) record.stats.pendingOffline = null;
    return { earnings, suppressLegacyPayout };
  }

  const prev = record.stats.pendingOffline;
  const prevData = prev && Number.isFinite(prev.data) && prev.data > 0 ? prev.data : 0;
  const pending: PendingOfflineEarnings = {
    data: Math.round((prevData + earnings.data) * 10) / 10,
    awaySeconds: (prev?.awaySeconds ?? 0) + earnings.awaySeconds,
    computedAt: new Date(nowMs).toISOString(),
  };
  record.stats.pendingOffline = pending;
  return { earnings, suppressLegacyPayout };
}

/**
 * Порог «оффлайн теперь наша ответственность». Чуть меньше минимума окна
 * (3 ч), чтобы не было зазора: как только копилка v3.2 могла бы заплатить за
 * такое отсутствие, платит pending-механика.
 */
export const RETENTION_OFFLINE_MIN_ABSENCE_FOR_SUPPRESS = 3 * 3600;

/**
 * Выплата оффлайн-копилки по действию claim_offline.
 *
 * Идемпотентно: после выплаты pendingOffline = null, повторный вызов вернёт 0.
 * Больше RETENTION_OFFLINE_CAP_SECONDS × ставка за раз выплатить нельзя —
 * сумма пришла из computeOfflineEarnings(), где кап уже применён.
 */
export function claimOfflineEarnings(
  record: StoredPlayerRecord,
  nowMs = Date.now()
): { claimed: number; claimedAwaySeconds: number } {
  if (!isRetentionV1Enabled()) return { claimed: 0, claimedAwaySeconds: 0 };

  const pending = record.stats.pendingOffline;
  const data = pending && Number.isFinite(pending.data) ? pending.data : 0;
  if (!pending || data <= 0) {
    record.stats.pendingOffline = null;
    return { claimed: 0, claimedAwaySeconds: 0 };
  }

  record.data += data;
  record.stats.pendingOffline = null;
  record.stats.lastOfflineClaimAt = new Date(nowMs).toISOString();
  return { claimed: Math.round(data * 10) / 10, claimedAwaySeconds: pending.awaySeconds };
}

/** Сдвигает lastSeenAt. Возвращает прежнее значение (для лога и QA). */
export function touchLastSeen(record: StoredPlayerRecord, nowMs = Date.now()): string | null {
  if (!isRetentionV1Enabled()) return null;
  const prev = record.stats.lastSeenAt ?? null;
  record.stats.lastSeenAt = new Date(nowMs).toISOString();
  return prev;
}

/**
 * Зеркалит players.daily_streak / last_daily_claim в stats, чтобы клиент
 * получил стрик в том же init-ответе (нового эндпоинта не нужно).
 */
export function mirrorDailyStreak(record: StoredPlayerRecord, nowMs = Date.now()): void {
  if (!isRetentionV1Enabled()) return;
  const todayKey = getUtcDayKey(nowMs);
  const lastIso = record.lastDailyClaim ? new Date(record.lastDailyClaim) : null;
  const lastKey = lastIso && !Number.isNaN(lastIso.getTime()) ? getUtcDayKey(lastIso.getTime()) : null;

  // Первый заход после v5.6: у старых сейвов stats.lastDailyClaim пуст —
  // восстанавливаем его из players.last_daily_claim (серверное время, не клиент).
  if (!record.stats.lastDailyClaim && lastKey) {
    record.stats.lastDailyClaim = lastKey;
  }

  const current = Math.max(record.stats.dailyStreak ?? 0, record.dailyStreak ?? 0);
  const next = computeNextStreak({
    lastClaimDayKey: record.stats.lastDailyClaim ?? lastKey,
    todayKey,
    currentStreak: current,
  });
  // Стрик «сегодня ещё не забран» отдаём как есть: день цикла = текущий+1,
  // чтобы bar подсветил следующую клетку, а не уже полученную.
  // Стрик в stats = то, что уже заработано; клетка bar = следующая цель.
  record.stats.dailyStreak = current;
  record.stats.dailyStreakDay = next.alreadyClaimedToday ? next.day : Math.min(7, current + 1);
  record.stats.dailyClaimedToday = next.alreadyClaimedToday;
}

/**
 * Записывает факт дневного клайма в stats (UTC-дата + длина стрика).
 * Вызывается из handleDailyBonus ПОСЛЕ успешной CAS-записи в players.
 */
export function recordDailyClaim(record: StoredPlayerRecord, nowMs = Date.now()): void {
  if (!isRetentionV1Enabled()) return;
  const todayKey = getUtcDayKey(nowMs);
  record.stats.lastDailyClaim = todayKey;
  record.stats.dailyStreak = record.dailyStreak;
  record.stats.dailyStreakDay = Math.min(7, Math.max(1, record.dailyStreak || 1));
  record.stats.dailyClaimedToday = true;
}

/** Включил/выключил напоминания игрок (галочка в streak-модале, default OFF). */
export function setReminderOptIn(record: StoredPlayerRecord, value: boolean): boolean {
  if (!isRetentionV1Enabled()) return false;
  record.stats.reminderOptIn = value === true;
  return record.stats.reminderOptIn;
}

export interface ReminderOutcome {
  decision: ReminderDecision;
  sent: boolean;
  /** Текст, который ушёл в Telegram (или ушёл бы — для UI-заглушки и QA). */
  text: string;
}

/**
 * Отправляет напоминание, если все условия сошлись.
 *
 * Без токена возвращаем decision='no_token' и пишем ЯВНЫЙ лог — это штатный
 * сценарий dev/preview, а не ошибка, поэтому init не падает.
 */
export async function maybeSendDailyReminder(
  record: StoredPlayerRecord,
  nowMs = Date.now()
): Promise<ReminderOutcome> {
  const text = RETENTION_REMINDER_TEXT;
  if (!isRetentionV1Enabled()) return { decision: 'disabled', sent: false, text };

  const todayKey = getUtcDayKey(nowMs);
  const dailyClaimedToday =
    record.stats.lastDailyClaim === todayKey ||
    (record.lastDailyClaim ? getUtcDayKey(Date.parse(record.lastDailyClaim)) === todayKey : false);

  const decision = canSendReminder({
    enabled: true,
    optedIn: record.stats.reminderOptIn === true,
    hasBotToken: Boolean(getBotToken()),
    lastSentAt: record.stats.lastReminderSentAt ?? null,
    lastSeenAt: record.stats.lastSeenAt ?? null,
    dailyClaimedToday,
    nowMs,
  });

  if (decision !== 'send') {
    if (decision === 'no_token' && record.stats.reminderOptIn === true) {
      // Штатный сценарий без секрета: предупреждаем в логах, но не падаем.
      console.info('[retention] reminder skipped: TELEGRAM_BOT_TOKEN is not set', {
        tgId: record.tgId,
      });
    }
    return { decision, sent: false, text };
  }

  const res = await tgApi<{ message_id?: number }>(getBotToken(), 'sendMessage', {
    chat_id: record.tgId,
    text,
    disable_web_page_preview: true,
  });
  if (!res.ok) {
    console.warn('[retention] reminder send failed', { tgId: record.tgId, description: res.description });
    return { decision: 'send', sent: false, text };
  }

  record.stats.lastReminderSentAt = new Date(nowMs).toISOString();
  return { decision: 'send', sent: true, text };
}

/** Снимок retention-состояния для клиента (кладётся в init-ответ). */
export interface RetentionSnapshot {
  enabled: boolean;
  lastSeenAt: string | null;
  pendingOffline: PendingOfflineEarnings | null;
  offlineCapHours: number;
  lastDailyClaim: string | null;
  dailyStreak: number;
  dailyStreakDay: number;
  dailyClaimedToday: boolean;
  reminderOptIn: boolean;
  reminderAvailable: boolean;
}

export function buildRetentionSnapshot(record: StoredPlayerRecord, nowMs = Date.now()): RetentionSnapshot {
  const todayKey = getUtcDayKey(nowMs);
  const enabled = isRetentionV1Enabled();
  const pending = record.stats.pendingOffline ?? null;
  return {
    enabled,
    lastSeenAt: record.stats.lastSeenAt ?? null,
    pendingOffline: pending && pending.data > 0 ? pending : null,
    offlineCapHours: Math.round(RETENTION_OFFLINE_CAP_SECONDS / 3600),
    lastDailyClaim: record.stats.lastDailyClaim ?? null,
    dailyStreak: enabled ? record.stats.dailyStreak ?? record.dailyStreak ?? 0 : 0,
    dailyStreakDay: enabled ? record.stats.dailyStreakDay ?? 0 : 0,
    dailyClaimedToday: enabled
      ? record.stats.dailyClaimedToday === true || record.stats.lastDailyClaim === todayKey
      : false,
    reminderOptIn: record.stats.reminderOptIn === true,
    reminderAvailable: Boolean(getBotToken()),
  };
}
