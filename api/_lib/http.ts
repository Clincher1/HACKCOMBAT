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

export async function readJsonBody<T = Record<string, unknown>>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    return JSON.parse(req.body) as T;
  }
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res: ApiResponse, statusCode: number, data: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
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

  return verifyTelegramInitData(
    rawInitData,
    process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    Array.isArray(demoIdHeader) ? demoIdHeader[0] : demoIdHeader,
    Array.isArray(demoNameHeader) ? decodeURIComponent(demoNameHeader[0]) : demoNameHeader ? decodeURIComponent(demoNameHeader) : undefined
  );
}
