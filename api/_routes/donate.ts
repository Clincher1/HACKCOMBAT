import { getGameDayKey } from '../../shared/mechanics';
import {
  DONATE_CURRENCY,
  DONATE_MAX_STARS,
  DONATE_MIN_STARS,
  DONATE_TIER_STARS,
  isAllowedDonateAmount,
  resolveExternalDonate,
} from '../../shared/donate.config';
import {
  createDonateInvoiceLink,
  getBotToken,
  getBotUsername,
  getDonationSummary,
} from '../_lib/donations';
import {
  authenticateRequest,
  enforceHttpSecurity,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

// Антиспам на создание счетов: живой игрок жмёт кнопку редко,
// а скрипт не должен заваливать Telegram тысячами инвойсов.
const INVOICE_MIN_GAP_MS = 5_000;
const INVOICE_DAILY_LIMIT = 40;
const invoiceThrottle = new Map<string, { lastAt: number; dayKey: string; count: number }>();

function hitInvoiceThrottle(userKey: string): number {
  const now = Date.now();
  const dayKey = getGameDayKey(now);
  const bucket = invoiceThrottle.get(userKey);
  if (!bucket || bucket.dayKey !== dayKey) {
    invoiceThrottle.set(userKey, { lastAt: now, dayKey, count: 1 });
    return 0;
  }
  if (now - bucket.lastAt < INVOICE_MIN_GAP_MS) return INVOICE_MIN_GAP_MS - (now - bucket.lastAt);
  if (bucket.count >= INVOICE_DAILY_LIMIT) return 24 * 60 * 60 * 1000;
  bucket.lastAt = now;
  bucket.count += 1;
  return 0;
}

/**
 * /api/donate — добровольный донат в Telegram Stars (v3.4).
 *
 *   GET  → витрина: фиксированные суммы, валюта, username бота.
 *   POST → { stars } → { invoiceLink } для WebApp.openInvoice.
 *
 * Сумму присылает клиент, но сервер сверяет её с конфигом: произвольную цену
 * подставить нельзя. provider_token не передаём — для Stars он запрещён.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;

  if (req.method === 'GET') {
    const botUsername = await getBotUsername();
    // v3.6.6: витрина отдаёт ещё и ПОСТОЯННЫЙ итог поддержки игрока.
    // Раньше профиль показывал только звёзды, оплаченные в текущей сессии,
    // поэтому после перезапуска казалось, что донат «не начислился».
    let summary: { count: number; stars: number } | undefined;
    try {
      const user = authenticateRequest(req);
      summary = await getDonationSummary(user.tgId);
    } catch {
      // Без initData это просто публичная витрина — не ошибка.
      summary = undefined;
    }
    return sendJson(res, 200, {
      ok: true,
      enabled: Boolean(getBotToken()),
      currency: DONATE_CURRENCY,
      minStars: DONATE_MIN_STARS,
      maxStars: DONATE_MAX_STARS,
      tiers: [...DONATE_TIER_STARS],
      botUsername,
      summary,
      // v3.6.8: «настоящие деньги» — только внешней страницей (см. donate.config).
      // null, если владелец не задал DONATE_CARD_URL: витрина остаётся Star-only.
      external: resolveExternalDonate(process.env.DONATE_CARD_URL, process.env.DONATE_CARD_LABEL),
      note: 'Донат добровольный и не даёт игровых преимуществ.',
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = await readJsonBody<{ stars?: number; initData?: string }>(req);
    const user = authenticateRequest(req, body);

    // Строго число: строка "25" с клиента — это уже попытка обойти проверку.
    if (typeof body.stars !== 'number' || !isAllowedDonateAmount(body.stars)) {
      return sendJson(res, 400, {
        ok: false,
        error: `Донат доступен только на фиксированные суммы: ${DONATE_TIER_STARS.join(', ')} ⭐`,
      });
    }

    const throttleMs = hitInvoiceThrottle(String(user.tgId));
    if (throttleMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(throttleMs / 1000)));
      return sendJson(res, 429, {
        ok: false,
        error: 'Счёт уже создан — подтвердите оплату в Telegram.',
        retryAfterSec: Math.ceil(throttleMs / 1000),
      });
    }

    const result = await createDonateInvoiceLink(user.tgId, body.stars);
    if (!result.ok || !result.invoiceLink) {
      return sendJson(res, 400, { ok: false, error: result.error || 'Не удалось создать счёт' });
    }

    const summary = await getDonationSummary(user.tgId);
    return sendJson(res, 200, {
      ok: true,
      invoiceLink: result.invoiceLink,
      stars: result.stars,
      summary,
    });
  } catch (err) {
    return sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Donate failed',
    });
  }
}
