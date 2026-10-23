import { handleBuyCard } from './_lib/gameEngine';
import { authenticateRequest, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{ cardKey?: string; initData?: string }>(req);
    const user = authenticateRequest(req, body);
    if (!body.cardKey) {
      return sendJson(res, 400, { ok: false, error: 'cardKey is required' });
    }
    const result = await handleBuyCard(user, body.cardKey);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Buy card failed',
    });
  }
}
