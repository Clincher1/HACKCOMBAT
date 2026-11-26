/**
 * HACKER KOMBAT — клиентская аналитика и перехват ошибок.
 *
 * Правила проекта:
 *  • strict TypeScript: ни одного `any` и `@ts-ignore`, только `unknown` с сужением;
 *  • аналитика НИКОГДА не ломает игру: сеть, парсинг и Telegram SDK глушатся;
 *  • один вызов = один POST /api/track, таймаут 2 секунды, без ретраев и очередей.
 *
 * Зачем это нужно: 97% игроков не делают ни одного тапа. Поэтому шесть шагов
 * воронки (app_opened → init_ok → first_frame → first_tap → first_upgrade →
 * first_mission_start) пишутся отдельными событиями и ровно один раз за сессию —
 * по ним видно, на каком шаге человек отвалился.
 */

import { initTelegramMiniApp } from './telegram';

/**
 * Шаги воронки в порядке прохождения.
 *
 * v5.5: с миром «День хакера» ключевой шаг — не тап, а выход из дома, поэтому
 * появляется first_move. Имя first_tap остаётся в типе и в индексе БД: старые
 * клиенты и игроки с выключенным WORLD_V2 продолжают писать его как раньше.
 */
export type FunnelEvent =
  | 'app_opened'
  | 'init_ok'
  | 'first_frame'
  | 'first_tap'
  | 'first_move'
  | 'first_upgrade'
  | 'first_mission_start';

/**
 * Имя события. Известные имена подсказываются в редакторе, но сервер сам решает,
 * что сохранять, поэтому произвольная строка тоже допустима.
 */
export type TrackEventName = FunnelEvent | 'client_error' | (string & Record<never, never>);

/** Значение контекста события: только примитивы, без вложенных объектов. */
export type TrackMetaValue = string | number | boolean | null | undefined;
export type TrackMeta = Record<string, TrackMetaValue>;

/** Тело запроса /api/track. `meta` — необязательный контекст, сервер режет и валидирует его. */
interface TrackBody {
  event: string;
  timestamp: number;
  userAgent: string;
  initData: string;
  meta?: Record<string, string | number>;
}

/** Описание пойманной ошибки — ровно те поля, которые нужны для разбора. */
export interface ClientErrorReport {
  message: string;
  url: string;
  line: number;
  column: number;
  stack: string;
  kind: 'error' | 'unhandledrejection';
}

const TRACK_ENDPOINT = '/api/track';
const TRACK_TIMEOUT_MS = 2_000;
/** Потолок событий за сессию: сервер всё равно держит 200/сутки на игрока. */
const MAX_EVENTS_PER_SESSION = 80;
const MAX_ERRORS_PER_SESSION = 20;
const ERROR_DEDUPE_WINDOW_MS = 5_000;
const META_KEY_LIMIT = 40;
const META_STRING_LIMIT = 300;
const STACK_LIMIT = 1_200;
/** Сервер обрезает имя события до 64 символов — режем на клиенте. */
const EVENT_NAME_LIMIT = 64;

let eventsSent = 0;
let errorsSent = 0;
let errorTrackingReady = false;
const sentFunnelEvents = new Set<FunnelEvent>();
const recentErrorKeys = new Map<string, number>();

/**
 * `window.initData`, который выставляет Telegram WebApp (а в браузере — сам клиент).
 * Объявлен через сужение, чтобы не трогать глобальные d.ts.
 */
function readWindowInitData(): string {
  const scope = globalThis as unknown as { initData?: unknown };
  const candidate = scope.initData;
  return typeof candidate === 'string' ? candidate : '';
}

interface TransportIdentity {
  initData: string;
  demoId: string;
  demoName: string;
}

/**
 * Тот же профиль, что использует src/lib/api.ts: подписанный initData из Telegram
 * и демо-идентичность для гостей из браузера. Ошибка SDK не должна ломать трекинг.
 */
function readIdentity(): TransportIdentity {
  let demoId = '0';
  let demoName = 'guest';
  let telegramInitData = '';
  try {
    const tg = initTelegramMiniApp();
    demoId = String(tg.tgId);
    demoName = tg.username;
    telegramInitData = tg.rawInitData;
  } catch {
    // Telegram SDK недоступен — уходит гостевое событие, это нормально.
  }
  return { initData: readWindowInitData() || telegramInitData, demoId, demoName };
}

/** Приводит контекст к безопасным примитивам: без undefined, объектов и длинных строк. */
function sanitizeMeta(meta: TrackMeta | undefined): Record<string, string | number> | undefined {
  if (!meta) return undefined;
  const result: Record<string, string | number> = {};
  for (const [rawKey, value] of Object.entries(meta)) {
    const key = rawKey.slice(0, META_KEY_LIMIT);
    if (key.length === 0) continue;
    if (typeof value === 'string') {
      if (value.length > 0) result[key] = value.slice(0, META_STRING_LIMIT);
      continue;
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) result[key] = value;
      continue;
    }
    if (typeof value === 'boolean') result[key] = value ? 1 : 0;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Отправка события. Никогда не возвращает ошибку наружу и не задерживает UI:
 * прерванный по таймауту запрос просто пропадает.
 */
function postEvent(event: string, meta: Record<string, string | number> | undefined): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;

  const identity = readIdentity();
  const body: TrackBody = {
    event,
    timestamp: Date.now(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 256) : '',
    initData: identity.initData,
    ...(meta ? { meta } : {}),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Demo-User-Id': identity.demoId,
    'X-Demo-Username': encodeURIComponent(identity.demoName),
  };
  if (identity.initData) headers['X-Telegram-Init-Data'] = identity.initData;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer =
    controller !== null
      ? window.setTimeout(() => controller.abort(), TRACK_TIMEOUT_MS)
      : null;

  void fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller ? controller.signal : undefined,
    keepalive: true,
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      if (timer !== null) window.clearTimeout(timer);
    });
}

/**
 * Основной вызов: `track('event_name', { level: 3 })`.
 * Событие уходит «выстрелил и забыл» — await не нужен и не должен использоваться.
 */
export function track(event: TrackEventName, meta?: TrackMeta): void {
  if (typeof window === 'undefined') return;
  if (eventsSent >= MAX_EVENTS_PER_SESSION) return;

  const name = event.slice(0, EVENT_NAME_LIMIT);
  if (name.length === 0) return;

  eventsSent += 1;
  postEvent(name, sanitizeMeta(meta));
}

/** Шаг воронки пишется один раз за сессию — повторные вызовы бесплатны и безопасны. */
export function trackFunnel(event: FunnelEvent, meta?: TrackMeta): void {
  if (sentFunnelEvents.has(event)) return;
  sentFunnelEvents.add(event);
  track(event, meta);
}

/**
 * `first_frame` = первый кадр после монтирования React.
 * Двойной requestAnimationFrame гарантирует, что браузер уже отрисовал разметку.
 */
export function markFirstFrame(): void {
  if (typeof window === 'undefined') return;
  if (typeof window.requestAnimationFrame !== 'function') {
    trackFunnel('first_frame');
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => trackFunnel('first_frame'));
  });
}

/** Любое значение из catch/rejection превращаем в читаемые message + stack. */
function describeThrown(value: unknown): { message: string; stack: string } {
  if (value instanceof Error) {
    return { message: value.message || value.name, stack: value.stack ?? '' };
  }
  if (typeof value === 'string') {
    return { message: value, stack: '' };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : '';
    const stack = typeof record.stack === 'string' ? record.stack : '';
    if (message.length > 0) return { message, stack };
    try {
      return { message: JSON.stringify(value).slice(0, META_STRING_LIMIT), stack };
    } catch {
      return { message: 'Unserializable rejection', stack };
    }
  }
  return { message: String(value), stack: '' };
}

/** window.onerror отдаёт либо текст, либо Event — приводим к строке без any. */
function messageToText(message: string | Event): string {
  if (typeof message === 'string') return message;
  return message.type.length > 0 ? `Event: ${message.type}` : 'Unknown error';
}

/** Отправка клиентской ошибки: дедупликация 5 секунд + потолок 20 ошибок за сессию. */
export function reportClientError(report: ClientErrorReport): void {
  if (typeof window === 'undefined') return;
  if (errorsSent >= MAX_ERRORS_PER_SESSION) return;

  const key = `${report.kind}:${report.message.slice(0, 120)}:${report.url}`;
  const now = Date.now();
  const last = recentErrorKeys.get(key);
  if (typeof last === 'number' && now - last < ERROR_DEDUPE_WINDOW_MS) return;
  recentErrorKeys.set(key, now);

  errorsSent += 1;
  track('client_error', {
    kind: report.kind,
    message: report.message.slice(0, META_STRING_LIMIT),
    url: report.url.slice(0, META_STRING_LIMIT),
    line: report.line,
    column: report.column,
    stack: report.stack.slice(0, STACK_LIMIT),
  });
}

/**
 * Ставит глобальные перехватчики ошибок. Вызывать один раз при старте приложения,
 * до createRoot: тогда ловятся и ошибки монтирования. Повторный вызов игнорируется.
 */
export function initErrorTracking(): void {
  if (typeof window === 'undefined' || errorTrackingReady) return;
  errorTrackingReady = true;

  const previousOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const messageText = error instanceof Error ? error.message || messageToText(message) : messageToText(message);
    reportClientError({
      kind: 'error',
      message: messageText,
      url: typeof source === 'string' && source.length > 0 ? source : window.location.href,
      line: typeof lineno === 'number' ? lineno : 0,
      column: typeof colno === 'number' ? colno : 0,
      stack: error instanceof Error ? error.stack ?? '' : '',
    });

    // Чужой обработчик (если он был) обязан остаться рабочим.
    if (typeof previousOnError === 'function') {
      const result: unknown = previousOnError.call(window, message, source, lineno, colno, error);
      return typeof result === 'boolean' ? result : false;
    }
    return false;
  };

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    const described = describeThrown(reason);
    reportClientError({
      kind: 'unhandledrejection',
      message: described.message,
      url: window.location.href,
      line: 0,
      column: 0,
      stack: described.stack,
    });
  });
}
