import { handleSkinAction } from './_lib/gameEngine';
import { authenticateRequest, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
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
    const result = await handleSkinAction(user, body.action ?? 'buy_or_equip', body.skinKey);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Skin action failed',
    });
  }
}
