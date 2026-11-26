import { handleContractAction } from '../_lib/gameEngine';
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
 * v6.1: контракты дня.
 *
 * Клиент присылает только id контракта — размер и состав награды считает сервер
 * из shared/contracts.config.ts, поэтому подменить награду из браузера нельзя.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'claim';
      contractId?: string;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'claim') {
      return sendJson(res, 400, { ok: false, error: 'Valid contract action is required' });
    }
    if (typeof body.contractId !== 'string' || body.contractId.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'Contract id is required' });
    }
    const result = await handleContractAction(
      user,
      body.contractId.slice(0, 64),
      sanitizeClicks(body.clicks)
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Contract action failed',
    });
  }
}
