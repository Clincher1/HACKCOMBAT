// ============================================================================
// ДОНАТЫ В TELEGRAM STARS — серверный слой (v3.4)
// ----------------------------------------------------------------------------
// Здесь живёт всё, что связано с деньгами, и намеренно НЕТ ничего, что можно
// подкрутить с клиента:
//   • цену берём только из shared/donate.config.ts (фиксированные суммы);
//   • payload собирает сервер, клиент его не присылает;
//   • выдачу «спасибо» делаем ТОЛЬКО по successful_payment и только один раз
//     на telegram_payment_charge_id (уникальный индекс в БД);
//   • сохраняем charge_id — без него нельзя оформить возврат (refundStarPayment).
// ============================================================================
import {
  buildDonatePayload,
  DONATE_CURRENCY,
  DONATE_PAYLOAD_MAX_BYTES,
  DONATE_TITLE,
  DONATE_DESCRIPTION,
  isAllowedDonateAmount,
  parseDonatePayload,
} from '../../shared/donate.config';
import { getSupabaseAdmin } from './supabaseAdmin';
import { getLocalDatabase, persistLocalDatabase } from './gameEngine';

export interface DonationRecord {
  tgId: number;
  stars: number;
  chargeId: string;
  payload: string;
  createdAt: string;
  refundedAt: string | null;
}

export interface DonationSummary {
  count: number;
  stars: number;
}

/** Токен бота берём из тех же переменных, что и остальной проект. */
export function getBotToken(): string {
  return (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

/**
 * Вызов метода Bot API. Таймаут обязателен: Telegram требует ответить на
 * pre_checkout_query за 10 секунд, поэтому зависший запрос недопустим.
 */
export async function tgApi<T = unknown>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 8_000
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Username бота (нужен для ссылки «открыть бота», когда Stars недоступны)
// ---------------------------------------------------------------------------
let cachedBotUsername: { value: string | null; expiresAt: number } = { value: null, expiresAt: 0 };

export async function getBotUsername(): Promise<string | null> {
  const envName = (process.env.BOT_USERNAME || '').replace(/^@/, '').trim();
  if (envName) return envName;

  const now = Date.now();
  if (cachedBotUsername.value && now < cachedBotUsername.expiresAt) return cachedBotUsername.value;

  const token = getBotToken();
  if (!token) return null;
  const res = await tgApi<{ username?: string }>(token, 'getMe');
  const username = res.ok && res.result?.username ? res.result.username : null;
  cachedBotUsername = { value: username, expiresAt: now + 60 * 60 * 1000 };
  return username;
}

// ---------------------------------------------------------------------------
// Создание счёта (ссылка для WebApp.openInvoice или кнопки в боте)
// ---------------------------------------------------------------------------
export interface InvoiceLinkResult {
  ok: boolean;
  invoiceLink?: string;
  stars?: number;
  error?: string;
}

/**
 * createInvoiceLink для доната. Никаких provider_token: для Stars он не нужен
 * (и даже вреден — Telegram требует опустить поле).
 */
export async function createDonateInvoiceLink(tgId: number, stars: unknown): Promise<InvoiceLinkResult> {
  const token = getBotToken();
  if (!token) return { ok: false, error: 'BOT_TOKEN не настроен на сервере' };
  if (!isAllowedDonateAmount(stars)) {
    return { ok: false, error: 'Недопустимая сумма доната' };
  }
  const amount = Number(stars);
  const payload = buildDonatePayload(tgId, amount);
  if (payload.length > DONATE_PAYLOAD_MAX_BYTES) {
    return { ok: false, error: 'Слишком длинный payload' };
  }

  const res = await tgApi<string>(token, 'createInvoiceLink', {
    title: DONATE_TITLE.slice(0, 32),
    description: DONATE_DESCRIPTION.slice(0, 255),
    payload,
    currency: DONATE_CURRENCY,
    // Ровно один элемент — требование Telegram для XTR.
    prices: [{ label: 'Поддержка проекта', amount }],
  });

  if (!res.ok || typeof res.result !== 'string') {
    return { ok: false, error: res.description || 'Telegram отклонил создание счёта' };
  }
  return { ok: true, invoiceLink: res.result, stars: amount };
}

// ---------------------------------------------------------------------------
// Хранилище: Supabase (прод) или локальный JSON (dev/preview)
// ---------------------------------------------------------------------------
function localRows(): Record<string, DonationRecord> {
  const db = getLocalDatabase();
  if (!db.donations || typeof db.donations !== 'object') db.donations = {};
  return db.donations as Record<string, DonationRecord>;
}

export interface RecordDonationInput {
  tgId: number;
  stars: number;
  chargeId: string;
  payload: string;
  providerChargeId?: string | null;
}

/**
 * Записывает донат ровно один раз. Возвращает `created: false`, если такой
 * charge_id уже был (повторный вебхук) — начислять что-либо повторно нельзя.
 */
export async function recordDonation(
  input: RecordDonationInput
): Promise<{ created: boolean; summary: DonationSummary }> {
  const tgId = Math.trunc(input.tgId);
  const stars = Math.trunc(input.stars);
  const chargeId = String(input.chargeId || '').slice(0, 128);
  if (!Number.isSafeInteger(tgId) || tgId === 0 || !Number.isInteger(stars) || stars <= 0 || !chargeId) {
    throw new Error('Некорректные данные платежа');
  }

  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from('donations').insert({
      tg_id: tgId,
      stars,
      currency: DONATE_CURRENCY,
      charge_id: chargeId,
      provider_charge_id: input.providerChargeId ?? null,
      payload: String(input.payload ?? '').slice(0, 128),
    });

    // 23505 = unique_violation: платёж уже учтён, это нормальный ретрай.
    const created = !error;
    if (error && error.code !== '23505') {
      throw new Error(`Не удалось записать донат: ${error.message}`);
    }
    return { created, summary: await getDonationSummary(tgId) };
  }

  const rows = localRows();
  if (rows[chargeId]) {
    return { created: false, summary: await getDonationSummary(tgId) };
  }
  rows[chargeId] = {
    tgId,
    stars,
    chargeId,
    payload: String(input.payload ?? '').slice(0, 128),
    createdAt: new Date().toISOString(),
    refundedAt: null,
  };
  persistLocalDatabase();
  return { created: true, summary: await getDonationSummary(tgId) };
}

/** Последние донаты игрока (для /paysupport и «спасибо» в чате). */
export async function listDonations(tgId: number, limit = 5): Promise<DonationRecord[]> {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit) || 5));
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('donations')
      .select('tg_id, stars, charge_id, payload, created_at, refunded_at')
      .eq('tg_id', tgId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) return [];
    return (data ?? []).map((row) => ({
      tgId: Number(row.tg_id),
      stars: Number(row.stars),
      chargeId: String(row.charge_id),
      payload: String(row.payload ?? ''),
      createdAt: String(row.created_at),
      refundedAt: row.refunded_at ? String(row.refunded_at) : null,
    }));
  }

  return Object.values(localRows())
    .filter((row) => row.tgId === tgId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, safeLimit);
}

/** Сколько всего поддержал игрок. */
export async function getDonationSummary(tgId: number): Promise<DonationSummary> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb.from('donations').select('stars').eq('tg_id', tgId);
    if (error) return { count: 0, stars: 0 };
    const stars = (data ?? []).reduce((sum, row) => sum + Number(row.stars ?? 0), 0);
    return { count: data?.length ?? 0, stars };
  }
  const rows = Object.values(localRows()).filter((row) => row.tgId === tgId);
  return { count: rows.length, stars: rows.reduce((sum, row) => sum + row.stars, 0) };
}

/** Отметка о возврате: чтобы /paysupport не предлагал вернуть одно и то же дважды. */
export async function markDonationRefunded(chargeId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb
      .from('donations')
      .update({ refunded_at: new Date().toISOString() })
      .eq('charge_id', chargeId);
    return !error;
  }
  const rows = localRows();
  const row = rows[chargeId];
  if (!row) return false;
  row.refundedAt = new Date().toISOString();
  persistLocalDatabase();
  return true;
}

export async function findDonationByChargeId(chargeId: string): Promise<DonationRecord | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('donations')
      .select('tg_id, stars, charge_id, payload, created_at, refunded_at')
      .eq('charge_id', chargeId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      tgId: Number(data.tg_id),
      stars: Number(data.stars),
      chargeId: String(data.charge_id),
      payload: String(data.payload ?? ''),
      createdAt: String(data.created_at),
      refundedAt: data.refunded_at ? String(data.refunded_at) : null,
    };
  }
  return localRows()[chargeId] ?? null;
}

/**
 * Проверка pre_checkout_query. Возвращает причину отказа или null, если всё ок.
 * Проверяем всё, что может подделать клиент: валюту, сумму, payload и автора.
 */
export function validatePreCheckoutQuery(query: {
  from?: { id?: number };
  currency?: string;
  total_amount?: number;
  invoice_payload?: string;
}): string | null {
  if (query.currency !== DONATE_CURRENCY) return 'Неверная валюта платежа';
  const parsed = parseDonatePayload(query.invoice_payload);
  if (!parsed) return 'Некорректный счёт';
  if (Number(query.total_amount) !== parsed.stars) return 'Сумма не совпадает со счётом';
  if (query.from?.id && Math.trunc(Number(query.from.id)) !== parsed.tgId) {
    return 'Счёт выставлен другому пользователю';
  }
  return null;
}
