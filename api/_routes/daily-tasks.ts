import { handleDailyTaskAction } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sanitizeClicks,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'claim';
      taskKey?: string;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'claim') {
      return sendJson(res, 400, { ok: false, error: 'Valid daily task action is required' });
    }
    if (typeof body.taskKey !== 'string' || body.taskKey.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'Daily task key is required' });
    }
    const result = await handleDailyTaskAction(
      user,
      body.action,
      body.taskKey.slice(0, 64),
      sanitizeClicks(body.clicks)
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Daily task action failed',
    });
  }
}
