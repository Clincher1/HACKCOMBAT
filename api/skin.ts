import { handleSkinAction } from './_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from './_lib/http';

const ALLOWED_SKIN_ACTIONS = new Set(['buy_or_equip', 'clear_lockdown']);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'buy_or_equip' | 'clear_lockdown';
      skinKey?: string;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    const action = body.action ?? 'buy_or_equip';
    if (!ALLOWED_SKIN_ACTIONS.has(action)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid skin action' });
    }
    const result = await handleSkinAction(
      user,
      action,
      typeof body.skinKey === 'string' ? body.skinKey.slice(0, 64) : undefined
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Skin action failed',
    });
  }
}
