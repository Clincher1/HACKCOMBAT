import { handleGetLeaderboard } from '../_lib/gameEngine';
import type { LeaderboardSort } from '../../shared/types';
import {
  authenticateRequest,
  enforceHttpSecurity,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  try {
    const user = authenticateRequest(req);
    // ?sort=data|xp|level — турнирная таблица умеет три метрики.
    const url = new URL(req.url || '/api/leaderboard', 'http://localhost');
    const rawSort = url.searchParams.get('sort');
    const sort: LeaderboardSort = rawSort === 'xp' || rawSort === 'level' ? rawSort : 'data';
    const result = await handleGetLeaderboard(user, sort);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Leaderboard error',
    });
  }
}
