import { handlePetAction } from '../_lib/gameEngine';
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
    const body = await readJsonBody<{ action?: string; petKey?: string; clicks?: number; initData?: string }>(req);
    const user = authenticateRequest(req, body);
    const action = body.action === 'feed' ? 'feed' : body.action === 'buy' ? 'buy' : null;
    if (!action) {
      return sendJson(res, 400, { ok: false, error: 'action must be "buy" or "feed"' });
    }
    if (!body.petKey || typeof body.petKey !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'petKey is required' });
    }
    const result = await handlePetAction(user, action, body.petKey.slice(0, 48), sanitizeClicks(body.clicks));
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Pet action failed',
    });
  }
}
