import { handleGetLeaderboard } from './_lib/gameEngine';
import { authenticateRequest, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const user = authenticateRequest(req);
    const result = await handleGetLeaderboard(user);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Leaderboard error',
    });
  }
}
