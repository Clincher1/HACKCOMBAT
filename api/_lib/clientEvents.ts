/**
 * HACKER KOMBAT — приём клиентской аналитики в Supabase (v5.3).
 *
 * Правила:
 *  • strict TypeScript: ни одного `any`, только `unknown` с сужением;
 *  • сырой initData в базу НЕ попадает: идентичность подтверждается HMAC-подписью
 *    Telegram (api/_lib/telegramAuth.ts), в таблицу едет только player_id;
 *  • валидация и нормализация строго на входе — в БД уходит уже безопасный набор;
 *  • антифлуд и дедупликация живут в SQL-функции insert_client_event(): одна
 *    проверка + вставка в одной транзакции (см. supabase/migrations/019_client_events.sql).
 */

import type { VerifiedTelegramUser } from './telegramAuth';
import { getSupabaseAdmin } from './supabaseAdmin';

/** Шесть шагов воронки. Пишутся один раз за жизнь аккаунта (unique index в БД). */
export const FUNNEL_EVENTS = [
  'app_opened',
  'init_ok',
  'first_frame',
  'first_tap',
  'first_upgrade',
  'first_mission_start',
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

/** События, которые теперь пишутся в client_events. */
export const CLIENT_ANALYTICS_EVENTS: ReadonlySet<string> = new Set<string>([
  ...FUNNEL_EVENTS,
  'client_error',
]);

/**
 * Старая игровая телеметрия (ачивки: туториал, вкладки, сессии, ночная смена).
 * Она остаётся на прежнем пути через handleTrackEvent и возвращает синк игрока,
 * иначе сломаются бейджи, которые на неё опираются.
 */
const LEGACY_TRACK_EVENTS: ReadonlySet<string> = new Set<string>([
  // v5.4: отметка «онбординг пройден» — идёт старым путём handleTrackEvent
  // (persist в stats). Пайплайн воронки из 2d956d1 не меняется.
  'onboarding_done',
  'tutorial_open',
  'session',
  'idle_15',
  'local_hour',
  'shop_freeze_30',
]);

const LEGACY_TRACK_PREFIXES: readonly string[] = ['tutorial_tab:', 'tab:'];

export function isLegacyTelemetry(event: string): boolean {
  if (LEGACY_TRACK_EVENTS.has(event)) return true;
  return LEGACY_TRACK_PREFIXES.some((prefix) => event.startsWith(prefix));
}

export function isClientAnalyticsEvent(event: string): boolean {
  return CLIENT_ANALYTICS_EVENTS.has(event);
}

/**
 * Тело POST /api/track. Все поля приходят из JSON, поэтому типизированы как
 * `unknown`: доверять им до валидации нельзя. Наследование от Record<string, unknown>
 * позволяет передать тело в authenticateRequest без приведения типов.
 */
export interface TrackRequestBody extends Record<string, unknown> {
  event?: unknown;
  timestamp?: unknown;
  userAgent?: unknown;
  initData?: unknown;
  meta?: unknown;
}

/** Строка таблицы client_events в том виде, в каком её читает админка/SQL. */
export interface ClientEventRow extends Record<string, unknown> {
  id: number;
  player_id: string;
  event: string;
  timestamp: string;
  user_agent: string;
  meta: Record<string, string | number>;
  error_kind: string | null;
  error_message: string | null;
  error_url: string | null;
  error_line: number | null;
  error_column: number | null;
  error_stack: string | null;
  created_at: string;
}

export interface ClientEventErrorFields {
  kind: 'error' | 'unhandledrejection';
  message: string;
  url: string;
  line: number;
  column: number;
  stack: string;
}

export interface ClientEventInput {
  playerId: string;
  event: string;
  timestampIso: string;
  userAgent: string;
  meta: Record<string, string | number>;
  error: ClientEventErrorFields | null;
}

export type InsertClientEventResult = 'inserted' | 'duplicate' | 'throttled' | 'skipped';

const EVENT_NAME_LIMIT = 64;
const META_KEYS_LIMIT = 20;
const META_KEY_LIMIT = 40;
const META_STRING_LIMIT = 300;
const USER_AGENT_LIMIT = 256;
const MESSAGE_LIMIT = 300;
const URL_LIMIT = 300;
const STACK_LIMIT = 1_200;
const TIMESTAMP_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const TIMESTAMP_FUTURE_MS = 60 * 1000;
const META_KEY_RE = /^[a-z0-9_.:-]+$/i;

/** Имя события: обрезаем по длине и отсекаем управляющие символы. */
export function readEventName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, EVENT_NAME_LIMIT);
}

/**
 * Метка времени: клиентские часы врут, поэтому зажимаем диапазон
 * [сейчас − 7 суток; сейчас + 1 минута]. Мусор заменяем серверным временем.
 */
export function clampTimestamp(raw: unknown, nowMs: number = Date.now()): string {
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return new Date(nowMs).toISOString();
  const clamped = Math.min(nowMs + TIMESTAMP_FUTURE_MS, Math.max(nowMs - TIMESTAMP_PAST_MS, parsed));
  return new Date(Math.round(clamped)).toISOString();
}

/** User-Agent: сначала из тела, иначе из заголовка. Только текст, только по длине. */
export function readUserAgent(body: TrackRequestBody, headerValue: string | string[] | undefined): string {
  if (typeof body.userAgent === 'string' && body.userAgent.trim().length > 0) {
    return body.userAgent.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, USER_AGENT_LIMIT);
  }
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return typeof header === 'string' ? header.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, USER_AGENT_LIMIT) : '';
}

/**
 * meta: плоский объект из примитивов, максимум 20 ключей.
 * Вложенные объекты, массивы и функции отбрасываются — они не нужны для воронки.
 */
export function sanitizeMeta(raw: unknown): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result;

  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(result).length >= META_KEYS_LIMIT) break;
    const key = rawKey.slice(0, META_KEY_LIMIT);
    if (!META_KEY_RE.test(key)) continue;
    if (typeof value === 'string') {
      if (value.length > 0) result[key] = value.slice(0, META_STRING_LIMIT);
      continue;
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) result[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      result[key] = value ? 1 : 0;
    }
  }
  return result;
}

function readMetaNumber(meta: Record<string, unknown>, key: string): number {
  const value = meta[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.floor(parsed), 1_000_000);
}

function readMetaString(meta: Record<string, unknown>, key: string, limit: number): string {
  const value = meta[key];
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, limit);
}

/**
 * Разбор ошибки для client_error. `null` = это не ошибка.
 * Возвращает `undefined`, если событие — ошибка, но message нет (это 400).
 */
export function readErrorFields(
  event: string,
  rawMeta: unknown
): ClientEventErrorFields | null | undefined {
  if (event !== 'client_error') return null;
  if (typeof rawMeta !== 'object' || rawMeta === null || Array.isArray(rawMeta)) return undefined;
  const meta = rawMeta as Record<string, unknown>;
  const message = readMetaString(meta, 'message', MESSAGE_LIMIT).trim();
  if (message.length === 0) return undefined;
  const kind = readMetaString(meta, 'kind', 32) === 'unhandledrejection' ? 'unhandledrejection' : 'error';
  return {
    kind,
    message,
    url: readMetaString(meta, 'url', URL_LIMIT),
    line: readMetaNumber(meta, 'line'),
    column: readMetaNumber(meta, 'column'),
    stack: readMetaString(meta, 'stack', STACK_LIMIT),
  };
}

function readRowId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const id = (raw as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}

/**
 * player_id по подтверждённому Telegram ID. Если строки ещё нет (самое первое
 * событие app_opened приходит ДО /api/init), создаём её штатной RPC init_player —
 * иначе первый шаг воронки новых игроков терялся бы именно там, где он важнее всего.
 */
export async function resolvePlayerId(user: VerifiedTelegramUser): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null; // локальный режим без БД: аналитику некуда писать

  const lookup = await sb.from('players').select('id').eq('tg_id', user.tgId).maybeSingle();
  if (lookup.error) throw new Error(`players lookup failed: ${lookup.error.message}`);
  const existing: unknown = lookup.data;
  const existingId = readRowId(existing);
  if (existingId) return existingId;

  const created = await sb.rpc('init_player', { p_tg_id: user.tgId, p_username: user.username });
  if (created.error) throw new Error(`init_player failed: ${created.error.message}`);
  const createdRow: unknown = created.data;
  return readRowId(createdRow);
}

/**
 * Одна RPC = один roundtrip: антифлуд, дедупликация шага воронки и INSERT
 * выполняются атомарно в Postgres. Ошибка БД пробрасывается наверх (роут отдаст 500).
 */
export async function insertClientEvent(input: ClientEventInput): Promise<InsertClientEventResult> {
  const sb = getSupabaseAdmin();
  if (!sb) return 'skipped';

  const { data, error } = await sb.rpc('insert_client_event', {
    p_player_id: input.playerId,
    p_event: input.event,
    p_timestamp: input.timestampIso,
    p_user_agent: input.userAgent,
    p_meta: input.meta,
    p_error_kind: input.error ? input.error.kind : null,
    p_error_message: input.error ? input.error.message : null,
    p_error_url: input.error ? input.error.url : null,
    p_error_line: input.error ? input.error.line : null,
    p_error_column: input.error ? input.error.column : null,
    p_error_stack: input.error ? input.error.stack : null,
  });

  if (error) throw new Error(`insert_client_event failed: ${error.message}`);

  const status: unknown = data;
  if (status === 'inserted' || status === 'duplicate' || status === 'throttled') return status;
  if (status === 'invalid') return 'skipped';
  throw new Error('insert_client_event returned unexpected result');
}

/** Сколько событий сохранилось по каждому шагу воронки (для админки/отчётов). */
export async function loadFunnelStats(minTimestampIso: string): Promise<Record<string, number>> {
  const sb = getSupabaseAdmin();
  if (!sb) return {};

  const { data, error } = await sb
    .from('client_events')
    .select('event')
    .in('event', [...FUNNEL_EVENTS])
    .gte('timestamp', minTimestampIso);
  if (error) throw new Error(`funnel stats failed: ${error.message}`);

  const rows: unknown = data;
  const counts: Record<string, number> = {};
  for (const name of FUNNEL_EVENTS) counts[name] = 0;
  if (!Array.isArray(rows)) return counts;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const event = (row as Record<string, unknown>).event;
    if (typeof event === 'string' && event in counts) counts[event] += 1;
  }
  return counts;
}
