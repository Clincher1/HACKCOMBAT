import { handleMissionAction } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sanitizeClicks,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

const ALLOWED_ACTIONS = new Set(['start', 'claim', 'skip', 'refresh']);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'start' | 'claim' | 'skip' | 'refresh';
      missionKey?: string;
      missionId?: string;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
      return sendJson(res, 400, { ok: false, error: 'Valid action is required' });
    }
    const result = await handleMissionAction(user, body.action, {
      missionKey: typeof body.missionKey === 'string' ? body.missionKey.slice(0, 64) : undefined,
      missionId: typeof body.missionId === 'string' ? body.missionId.slice(0, 64) : undefined,
    }, sanitizeClicks(body.clicks));
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Mission action failed',
    });
  }
}
