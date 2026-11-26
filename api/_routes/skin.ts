import { handleSkinAction } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sanitizeClicks,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

const ALLOWED_SKIN_ACTIONS = new Set([
  'buy_or_equip',
  'clear_lockdown',
  'set_theme',
  'set_backdrop',
  'profile_frame',
  // v5.5: переезд между локациями мира (изменение stats.locationId).
  'set_location',
]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?:
        | 'buy_or_equip'
        | 'clear_lockdown'
        | 'set_theme'
        | 'set_backdrop'
        | 'profile_frame'
        | 'set_location';
      skinKey?: string;
      locationId?: string;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    const action = body.action ?? 'buy_or_equip';
    if (!ALLOWED_SKIN_ACTIONS.has(action)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid skin action' });
    }
    // Локация приходит отдельным полем, но валидируется тем же ключом:
    // длина режется здесь, принадлежность миру — в gameEngine.
    const key = action === 'set_location' ? body.locationId : body.skinKey;
    const result = await handleSkinAction(
      user,
      action,
      typeof key === 'string' ? key.slice(0, 64) : undefined,
      sanitizeClicks(body.clicks)
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Skin action failed',
    });
  }
}
