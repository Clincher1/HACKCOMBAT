import { dispatchApiRequest } from './_router';
import type { ApiRequest, ApiResponse } from './_lib/http';

/**
 * Единственная Serverless Function приложения (лимит Vercel Hobby — 12).
 * Все 15 маршрутов обслуживает api/_router.ts по исходному req.url (/api/<route>).
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  await dispatchApiRequest(req, res);
}
