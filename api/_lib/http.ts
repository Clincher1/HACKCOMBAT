import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyTelegramInitData, type VerifiedTelegramUser } from './telegramAuth';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[]>;
}

export type ApiResponse = ServerResponse & {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => void;
};

const MAX_BODY_BYTES = 16_384; // 16 KB лимит тела запроса (защита от DoS переполнением памяти)

// ============================================================================
// RATE LIMIT (v3.1)
// ----------------------------------------------------------------------------
// Раньше был один лимит 140 запросов в минуту на IP — и живой человек, который
// быстро тапает ХАК, упирался в него (клики идут пачками, а мобильные операторы
// ещё и держат десятки игроков за одним IP через CGNAT).
// Теперь бюджеты разделены и сильно подняты:
//   • IP        — только грубый антифлуд (не мешает живому тапу);
//   • игрок     — свой бюджет по стабильному id (заголовок X-Demo-User-Id);
//   • anti-cheat по кликам живёт отдельно, в gameEngine (пачки + клики/сек + энергия),
//     поэтому поднятие HTTP-лимита НЕ открывает дыру для автокликера.
// ============================================================================
const RATE_WINDOW_MS = 60_000;
const IP_REQUESTS_PER_WINDOW = 900; // ~15 запросов/сек с одного IP
const USER_REQUESTS_PER_WINDOW = 600; // ~10 запросов/сек на одного игрока
const MAX_RATE_BUCKETS = 20_000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(req: ApiRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return (raw ? raw.split(',')[0].trim() : req.socket?.remoteAddress || 'local').slice(0, 64);
}

/** Стабильный «ключ игрока» для лимита: id из заголовка превью/Telegram-клиента. */
function getRateLimitUserKey(req: ApiRequest): string {
  const raw = req.headers['x-demo-user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  return String(value).replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 32);
}

/**
 * Считает запрос в бакете. Возвращает 0, если лимит не превышен,
 * либо число секунд до сброса окна (для заголовка Retry-After).
 */
function hitRateBucket(key: string, limit: number, nowMs: number): number {
  const bucket = rateBuckets.get(key);
  if (!bucket || nowMs >= bucket.resetAt) {
    if (rateBuckets.size > MAX_RATE_BUCKETS) rateBuckets.clear();
    rateBuckets.set(key, { count: 1, resetAt: nowMs + RATE_WINDOW_MS });
    return 0;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return 0;
  return Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000));
}

export function enforceHttpSecurity(req: ApiRequest, res: ApiResponse): boolean {
  // Защитные заголовки протокола на каждом ответе API
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Rate-limit: сначала грубый потолок на IP, затем персональный бюджет игрока.
  const now = Date.now();
  const ip = getClientIp(req);
  const userKey = getRateLimitUserKey(req);
  let retryAfterSec = hitRateBucket(`ip:${ip}`, IP_REQUESTS_PER_WINDOW, now);
  if (retryAfterSec === 0 && userKey) {
    retryAfterSec = hitRateBucket(`u:${userKey}`, USER_REQUESTS_PER_WINDOW, now);
  }
  if (retryAfterSec > 0) {
    res.setHeader('Retry-After', String(retryAfterSec));
    sendJson(res, 429, {
      ok: false,
      error: 'Слишком быстро — синхронизация догонит автоматически.',
      retryAfterSec,
    });
    return false;
  }

  // Проверка Origin на мутирующих POST-запросах (защита от межсайтового CSRF, включая чужие *.vercel.app!)
  if (req.method === 'POST' && !String(req.url || '').startsWith('/api/telegram')) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const host = req.headers.host || '';
        let publicWebappHost = '';
        if (process.env.PUBLIC_WEBAPP_URL) {
          try {
            publicWebappHost = new URL(process.env.PUBLIC_WEBAPP_URL).host;
          } catch {
            publicWebappHost = '';
          }
        }
        const allowed =
          (host.length > 0 && originHost === host) ||
          (publicWebappHost.length > 0 && originHost === publicWebappHost) ||
          originHost.endsWith('.e2b.app') ||
          originHost.startsWith('localhost:') ||
          originHost.startsWith('127.0.0.1:');
        if (!allowed) {
          sendJson(res, 403, { ok: false, error: 'Cross-origin request forbidden' });
          return false;
        }
      } catch {
        sendJson(res, 400, { ok: false, error: 'Malformed Origin header' });
        return false;
      }
    }
  }

  return true;
}

export async function readJsonBody<T = Record<string, unknown>>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
      throw new Error('Request payload too large');
    }
    return req.body.length > 0 ? (JSON.parse(req.body) as T) : ({} as T);
  }
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Request payload too large'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('Expected JSON object body'));
          return;
        }
        resolve(parsed as T);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res: ApiResponse, statusCode: number, data: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

export function authenticateRequest(req: ApiRequest, body?: Record<string, unknown>): VerifiedTelegramUser {
  const headerInitData = req.headers['x-telegram-init-data'];
  const rawInitData =
    (Array.isArray(headerInitData) ? headerInitData[0] : headerInitData) ||
    (typeof body?.initData === 'string' ? body.initData : '');

  const demoIdHeader = req.headers['x-demo-user-id'];
  const demoNameHeader = req.headers['x-demo-username'];

  let decodedDemoName: string | undefined;
  try {
    const rawDemoName = Array.isArray(demoNameHeader) ? demoNameHeader[0] : demoNameHeader;
    decodedDemoName = rawDemoName ? decodeURIComponent(rawDemoName) : undefined;
  } catch {
    decodedDemoName = undefined;
  }

  return verifyTelegramInitData(
    rawInitData,
    process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    Array.isArray(demoIdHeader) ? demoIdHeader[0] : demoIdHeader,
    decodedDemoName
  );
}

/**
 * Клики, присланные «хвостом» вместе с покупкой (v3.3).
 * Клиент шлёт остаток ещё не отправленных тапов, чтобы сервер видел свежий
 * баланс за один сетевой круг. Значение всегда зажимается в безопасный диапазон.
 */
export function sanitizeClicks(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(60, n);
}
