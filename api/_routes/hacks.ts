import { handleHackAction } from '../_lib/gameEngine';
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
 * v6.2: активный взлом.
 *
 * start — вход в сессию (списывает CPU Charge, выдаёт seed и таймер).
 * finish — итог сессии: клиент присылает только счётчики узлов, размер награды
 *          пересчитывает сервер по seed и сложности.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    const body = await readJsonBody<{
      action?: 'start' | 'finish';
      difficulty?: string;
      sessionId?: string;
      safeHits?: number;
      trapHits?: number;
      clicks?: number;
      initData?: string;
    }>(req);
    const user = authenticateRequest(req, body);
    if (body.action !== 'start' && body.action !== 'finish') {
      return sendJson(res, 400, { ok: false, error: 'Valid hack action is required' });
    }
    const result = await handleHackAction(
      user,
      body.action,
      {
        difficulty: typeof body.difficulty === 'string' ? body.difficulty.slice(0, 16) : undefined,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : undefined,
        safeHits: Number(body.safeHits) || 0,
        trapHits: Number(body.trapHits) || 0,
      },
      sanitizeClicks(body.clicks)
    );
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Hack action failed',
    });
  }
}
