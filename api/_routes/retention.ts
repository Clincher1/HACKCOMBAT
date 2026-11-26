import { handleRetentionAction, type RetentionAction } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

/**
 * POST /api/retention — действия retention-петли (v5.6).
 *
 *   { action: 'claim_offline' }                  → забрать оффлайн-копилку
 *   { action: 'reminder_opt_in', value: boolean } → галочка напоминаний
 *
 * Почему отдельный роут, а не «магическое» действие в /api/daily: claim
 * оффлайна и daily-бонус — разные экономические события с разными потолками,
 * и смешивать их в одном обработчике = получить «забрал бонус, а оффлайн
 * потерялся». Оба действия идемпотентны: повторный claim вернёт 0.
 *
 * Новых таблиц нет: всё пишется в существующий players.stats jsonb.
 * Отдельного GET не нужно — снимок приезжает в init-ответе (response.retention).
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = await readJsonBody<{ initData?: string; action?: string; value?: boolean }>(req);
    const user = authenticateRequest(req, body);

    const action = body.action;
    if (action !== 'claim_offline' && action !== 'reminder_opt_in') {
      return sendJson(res, 400, { ok: false, error: 'Неизвестное действие' });
    }
    if (action === 'reminder_opt_in' && typeof body.value !== 'boolean') {
      return sendJson(res, 400, { ok: false, error: 'value должен быть boolean' });
    }

    const result = await handleRetentionAction(user, action as RetentionAction, body.value);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Retention error',
    });
  }
}
