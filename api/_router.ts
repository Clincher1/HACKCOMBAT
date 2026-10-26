import { sendJson, type ApiRequest, type ApiResponse } from './_lib/http';
import base from './_routes/base';
import buyCard from './_routes/buy-card';
import click from './_routes/click';
import daily from './_routes/daily';
import dailyTasks from './_routes/daily-tasks';
import donate from './_routes/donate';
import hire from './_routes/hire';
import init from './_routes/init';
import leaderboard from './_routes/leaderboard';
import missions from './_routes/missions';
import pets from './_routes/pets';
import ping from './_routes/ping';
import prestige from './_routes/prestige';
import referral from './_routes/referral';
import seasonEvent from './_routes/season-event';
import skin from './_routes/skin';
import telegram from './_routes/telegram';
import tier from './_routes/tier';
import track from './_routes/track';

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

/**
 * Единый диспетчер /api/*.
 *
 * Зачем: Vercel Hobby разрешает максимум 12 Serverless Functions на деплой,
 * а игровых роутов 15. Поэтому все они живут в api/_routes/* (папка с «_»
 * не считается функциями), а наружу выставлен ровно один catch-all —
 * api/[...path].ts. Он же используется dev-сервером Vite.
 *
 * URL внутри функции остаётся исходным (/api/click), поэтому хендлеры
 * и их Origin/rate-limit проверки работают без изменений.
 */
const routes: Record<string, Handler> = {
  base,
  'buy-card': buyCard,
  click,
  daily,
  'daily-tasks': dailyTasks,
  donate,
  hire,
  init,
  leaderboard,
  missions,
  pets,
  ping,
  prestige,
  referral,
  'season-event': seasonEvent,
  skin,
  telegram,
  tier,
  track,
};

export const ROUTE_NAMES = Object.keys(routes);

function pathFromUrl(rawUrl: string): string {
  return rawUrl
    .split('?')[0]
    .replace(/^\/api\/?/, '')
    .replace(/\/+$/, '');
}

export async function dispatchApiRequest(req: ApiRequest, res: ApiResponse): Promise<void> {
  const rawUrl = String(req.url || '');
  let name = pathFromUrl(rawUrl);

  // Страховка: если платформа отдала параметры catch-all в query, а url переписала
  if (!routes[name]) {
    const q = req.query?.path;
    const alt = Array.isArray(q) ? q.join('/') : typeof q === 'string' ? q : '';
    if (alt && routes[alt]) name = alt;
  }

  const handler = routes[name];
  if (!handler) {
    sendJson(res, 404, { ok: false, error: `Неизвестный маршрут: /api/${name || ''}` });
    return;
  }

  await handler(req, res);
}
