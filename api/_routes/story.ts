import { handleStoryClaim } from '../_lib/gameEngine';
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
 * v6.8: сюжет — забрать награду за шаг главы.
 *
 * Тело: { action: 'claim', stepId } + «хвост» кликов. Никаких сумм и прогресса
 * клиент не присылает: id шага, остальное пересчитывает сервер по своей записи.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'claim';
      stepId?: string;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'claim') {
      return sendJson(res, 400, { ok: false, error: 'Valid story action is required' });
    }
    const stepId = typeof body.stepId === 'string' ? body.stepId.slice(0, 64) : '';
    if (!stepId) {
      return sendJson(res, 400, { ok: false, error: 'stepId is required' });
    }
    const result = await handleStoryClaim(user, stepId, sanitizeClicks(body.clicks));
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Story action failed',
    });
  }
}
