import { handleGetPublicProfile } from '../_lib/gameEngine';
import {
  authenticateRequest,
  enforceHttpSecurity,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const user = authenticateRequest(req);
    const url = new URL(req.url || '/api/profile', 'http://localhost');
    const profileId = url.searchParams.get('profileId') || '';
    const result = await handleGetPublicProfile(user, profileId);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Profile lookup failed',
    });
  }
}
