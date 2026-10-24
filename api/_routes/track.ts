import { handleTrackEvent } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
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
    const body = await readJsonBody<{ event?: string; value?: number; initData?: string }>(req);
    const user = authenticateRequest(req, body);
    if (!body.event || typeof body.event !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'event is required' });
    }
    const result = await handleTrackEvent(
      user,
      body.event,
      Number.isFinite(Number(body.value)) ? Number(body.value) : undefined
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Track event failed',
    });
  }
}
