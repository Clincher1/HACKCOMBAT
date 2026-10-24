import {
  enforceHttpSecurity,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin';

/**
 * GET /api/ping — Cron Keep-Alive пинг каждые 3 дня (раздел 6 и шаг 10 ТЗ)
 * Пробуждает базу Supabase Free, чтобы проект не ушёл в авто-паузу после 7 дней.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from('players').select('id', { count: 'exact', head: true });
    return sendJson(res, 200, {
      ok: !error,
      mode: 'supabase',
      timestamp: new Date().toISOString(),
    });
  }
  return sendJson(res, 200, {
    ok: true,
    mode: 'memory-fallback',
    timestamp: new Date().toISOString(),
  });
}
