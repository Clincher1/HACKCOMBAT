import { handleDailyGoalAction } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sanitizeClicks,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

/**
 * v1.6: сбор награды за цель дня.
 *
 * Клиент присылает только индекс цели на доске (0–2). Таргет, прогресс и
 * награда живут на сервере; какой именно предмет выпадет за полный сбор,
 * решает тоже сервер — клиент этого не знает до ответа.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'claim';
      goalIndex?: number;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'claim') {
      return sendJson(res, 400, { ok: false, error: 'Valid daily goal action is required' });
    }
    const goalIndex = Number(body.goalIndex);
    if (!Number.isInteger(goalIndex) || goalIndex < 0 || goalIndex > 2) {
      return sendJson(res, 400, { ok: false, error: 'Daily goal index must be 0, 1 or 2' });
    }
    const result = await handleDailyGoalAction(user, goalIndex, sanitizeClicks(body.clicks));
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Daily goal action failed',
    });
  }
}
