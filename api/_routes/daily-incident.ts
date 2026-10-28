import { handleDailyIncidentAction } from '../_lib/gameEngine';
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
      choiceKey?: string;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (typeof body.choiceKey !== 'string' || body.choiceKey.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'Incident choice is required' });
    }

    const result = await handleDailyIncidentAction(
      user,
      body.choiceKey.slice(0, 64),
      sanitizeClicks(body.clicks)
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Daily incident action failed',
    });
  }
}
