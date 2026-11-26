import { handleTrackEvent } from '../_lib/gameEngine';
import {
  clampTimestamp,
  insertClientEvent,
  isClientAnalyticsEvent,
  isLegacyTelemetry,
  readErrorFields,
  readEventName,
  readUserAgent,
  resolvePlayerId,
  sanitizeMeta,
  type TrackRequestBody,
} from '../_lib/clientEvents';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';
import { isWorldFunnelEvent } from '../_lib/worldEvents';

/** 204 без тела: клиентская аналитика не ждёт данных, экономит трафик и парсинг. */
function sendNoContent(res: ApiResponse): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.statusCode = 204;
  res.end();
}

function sendBadRequest(res: ApiResponse, error: string): void {
  sendJson(res, 400, { ok: false, error });
}

/**
 * POST /api/track — приём клиентской аналитики.
 *
 * Два пути:
 *  1. client_events (6 шагов воронки + client_error) → Supabase → 204.
 *     Антифлуд 5 c и дедупликация шагов воронки живут в insert_client_event().
 *  2. старая игровая телеметрия (туториал, вкладки, сессия, ночной час) →
 *     handleTrackEvent() → 200 с синком игрока. Этот путь кормит ачивки,
 *     поэтому он сохранён без изменений.
 *
 * initData проверяется HMAC-подписью Telegram в authenticateRequest()
 * и НИКОГДА не сохраняется: в базу уходит только player_id (uuid).
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  let body: TrackRequestBody;
  try {
    body = await readJsonBody<TrackRequestBody>(req);
  } catch {
    return sendBadRequest(res, 'Некорректное тело запроса');
  }

  const event = readEventName(body.event);
  if (!event) return sendBadRequest(res, 'event is required');
  // v5.5: шаги воронки мира (first_move) принимаются отдельным списком из
  // api/_lib/worldEvents.ts — контракт воронки v5.3 (clientEvents.ts) не меняется.
  const isWorldStep = isWorldFunnelEvent(event);
  if (!isClientAnalyticsEvent(event) && !isWorldStep && !isLegacyTelemetry(event)) {
    return sendBadRequest(res, 'event is not allowed');
  }

  let user;
  try {
    user = authenticateRequest(req, body);
  } catch {
    return sendBadRequest(res, 'Не удалось подтвердить подпись initData');
  }

  // Путь 1: аналитика в client_events (шаги воронки v5.3 + шаги мира v5.5).
  if (isClientAnalyticsEvent(event) || isWorldStep) {
    const errorFields = readErrorFields(event, body.meta);
    if (errorFields === undefined) return sendBadRequest(res, 'client_error requires meta.message');

    try {
      const playerId = await resolvePlayerId(user);
      // База не настроена (локальный режим) — писать некуда, но клиент не должен видеть ошибку.
      if (!playerId) return sendNoContent(res);

      await insertClientEvent({
        playerId,
        event,
        timestampIso: clampTimestamp(body.timestamp),
        userAgent: readUserAgent(body, req.headers['user-agent']),
        meta: sanitizeMeta(body.meta),
        error: errorFields,
      });
      return sendNoContent(res);
    } catch {
      // Наружу — без текста ошибки БД: детали игроку не нужны, а лишнее знание лишнее.
      return sendJson(res, 500, { ok: false, error: 'Analytics write failed' });
    }
  }

  // Путь 2: legacy-телеметрия для ачивок (совместимость, возвращает синк игрока).
  try {
    const result = await handleTrackEvent(
      user,
      event,
      Number.isFinite(Number(body.value)) ? Number(body.value) : undefined
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Track event failed',
    });
  }
}
