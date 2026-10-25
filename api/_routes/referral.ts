import {
  REFERRAL_DAILY_LIMIT,
  REFERRAL_RULES_SHORT,
  REFERRAL_WEEKLY_LIMIT,
  REFERRAL_QUALIFY_ACTIVE_SECONDS,
} from '../../shared/referral.config';
import { buildReferralLink, getOrCreateReferralCode, getReferralStats } from '../_lib/referrals';
import { getBotUsername } from '../_lib/donations';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

/**
 * /api/referral — реферальная программа (v3.5).
 *
 *   GET  → { code, link, botUsername, stats, rules }
 *
 * Только чтение: награды начисляет движок в момент, когда приглашённый
 * реально наиграл свои 8 минут. Клиент ничего «забрать» не может, поэтому
 * подделать награду через DevTools не получится.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody<{ initData?: string }>(req) : {};
    const user = authenticateRequest(req, body);

    const code = await getOrCreateReferralCode(user.tgId);
    const botUsername = await getBotUsername();
    const stats = await getReferralStats(user.tgId, code);

    return sendJson(res, 200, {
      ok: true,
      code,
      link: buildReferralLink(botUsername, code),
      botUsername,
      stats,
      rules: REFERRAL_RULES_SHORT,
      qualifySeconds: REFERRAL_QUALIFY_ACTIVE_SECONDS,
      dailyLimit: REFERRAL_DAILY_LIMIT,
      weeklyLimit: REFERRAL_WEEKLY_LIMIT,
    });
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Referral error',
    });
  }
}
