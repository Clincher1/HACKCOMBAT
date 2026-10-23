import type { ApiSyncResponse, LeaderboardEntry } from '../../shared/types';
import { initTelegramMiniApp } from './telegram';

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

  const json = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `API Error (${res.status})`);
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
  leaderboard: () =>
    apiRequest<{ ok: true; entries: LeaderboardEntry[] }>('/api/leaderboard', 'GET'),
};
