import { handleLollipopAction } from '../_lib/gameEngine';
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
 * v6.3: сезонный леденец (×2 Data на час, раз в игровые сутки).
 * Тело — только действие: окно и множитель целиком считает сервер.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'activate';
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'activate') {
      return sendJson(res, 400, { ok: false, error: 'Valid lollipop action is required' });
    }
    const result = await handleLollipopAction(user, body.action, sanitizeClicks(body.clicks));
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Lollipop action failed',
    });
  }
}
