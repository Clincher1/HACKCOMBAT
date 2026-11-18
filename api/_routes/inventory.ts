import { handleInventoryAction, handleUseNewYearCandy } from '../_lib/gameEngine';
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
      action?: 'set_public' | 'use';
      requestId?: string;
      itemKey?: string;
      visible?: boolean;
      clicks?: number;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'set_public' && body.action !== 'use') {
      return sendJson(res, 400, { ok: false, error: 'Invalid inventory action' });
    }
    const itemKey = typeof body.itemKey === 'string' ? body.itemKey.slice(0, 120) : '';
    if (!itemKey) {
      return sendJson(res, 400, { ok: false, error: 'Не указан предмет' });
    }
    if (body.action === 'use') {
      if (itemKey !== 'reward:new_year_candy') return sendJson(res, 400, { ok: false, error: 'Этот предмет нельзя использовать' });
      const result = await handleUseNewYearCandy(user, String(body.requestId ?? ''), sanitizeClicks(body.clicks));
      return sendJson(res, 200, result);
    }
    const result = await handleInventoryAction(
      user,
      'set_public',
      itemKey,
      body.visible !== false,
      sanitizeClicks(body.clicks)
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Inventory action failed',
    });
  }
}
