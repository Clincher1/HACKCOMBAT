import type { ApiSyncResponse, LeaderboardEntry } from '../../shared/types';
import { initTelegramMiniApp } from './telegram';

/** Ошибка API со статусом ответа: нужна, чтобы мягко обрабатывать 429 (rate limit) без пугающих тостов. */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSec: number;

  constructor(message: string, status: number, retryAfterSec = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

async function apiRequest<T>(path: string, method: 'GET' | 'POST' = 'POST', body?: unknown): Promise<T> {
  const tg = initTelegramMiniApp();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Demo-User-Id': String(tg.tgId),
    'X-Demo-Username': encodeURIComponent(tg.username),
  };
  if (tg.rawInitData) {
    headers['X-Telegram-Init-Data'] = tg.rawInitData;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

  const json = (await res.json()) as T & { ok?: boolean; error?: string; retryAfterSec?: number };
  if (!res.ok || json.ok === false) {
    throw new ApiError(
      json.error || `API Error (${res.status})`,
      res.status,
      Number(json.retryAfterSec ?? res.headers.get('Retry-After') ?? 0) || 0
    );
  }
  return json;
}

export const gameApi = {
  init: () => apiRequest<ApiSyncResponse>('/api/init', 'POST'),
  clickBatch: (clicks: number) => apiRequest<ApiSyncResponse>('/api/click', 'POST', { clicks }),
  buyCard: (cardKey: string) => apiRequest<ApiSyncResponse>('/api/buy-card', 'POST', { cardKey }),
  missionAction: (
    action: 'start' | 'claim' | 'skip' | 'refresh',
    payload?: { missionKey?: string; missionId?: string }
  ) => apiRequest<ApiSyncResponse>('/api/missions', 'POST', { action, ...payload }),
  hireNpc: (npcKey: string) => apiRequest<ApiSyncResponse>('/api/hire', 'POST', { npcKey }),
  claimDaily: () => apiRequest<ApiSyncResponse>('/api/daily', 'POST'),
  skinAction: (action: 'buy_or_equip' | 'clear_lockdown', skinKey?: string) =>
    apiRequest<ApiSyncResponse>('/api/skin', 'POST', { action, skinKey }),
  prestige: () => apiRequest<ApiSyncResponse>('/api/prestige', 'POST'),
  unlockTier: () => apiRequest<ApiSyncResponse>('/api/tier', 'POST'),
  buyBaseUpgrade: (upgradeKey: string) =>
    apiRequest<ApiSyncResponse>('/api/base', 'POST', { upgradeKey }),
  petAction: (action: 'buy' | 'feed', petKey: string) =>
    apiRequest<ApiSyncResponse>('/api/pets', 'POST', { action, petKey }),
  track: (event: string, value?: number) =>
    apiRequest<ApiSyncResponse>('/api/track', 'POST', { event, value }),
  leaderboard: () =>
    apiRequest<{ ok: true; entries: LeaderboardEntry[] }>('/api/leaderboard', 'GET'),
};
