import { handleInventoryAction } from '../_lib/gameEngine';
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
 * Инвентарь: единственный канал записи по предметам.
 *   set_public — показать/скрыть предмет профиля (без начисления);
 *   use        — применить расходник (эффект считает только сервер);
 *   seen       — погасить точку «есть новый дроп» на HUD.
 * Клиент ничего не начисляет и не списывает: только просит и отображает ответ.
 */
const INVENTORY_ACTIONS = new Set(['set_public', 'use', 'seen']);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = await readJsonBody<{
      action?: 'set_public' | 'use' | 'seen';
      itemKey?: string;
      visible?: boolean;
      clicks?: number;
    }>(req);
    const user = authenticateRequest(req, body);
    const action = typeof body.action === 'string' ? body.action : '';
    if (!INVENTORY_ACTIONS.has(action)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid inventory action' });
    }
    const itemKey = typeof body.itemKey === 'string' ? body.itemKey.slice(0, 120) : '';
    if (action !== 'seen' && !itemKey) {
      return sendJson(res, 400, { ok: false, error: 'Не указан предмет' });
    }
    const result = await handleInventoryAction(
      user,
      action as 'set_public' | 'use' | 'seen',
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
