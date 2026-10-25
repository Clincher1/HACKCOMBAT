import { handleInitPlayer } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  getClientIp,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const user = authenticateRequest(req, body);
    const result = await handleInitPlayer(user, getClientIp(req));
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Init error',
    });
  }
}
