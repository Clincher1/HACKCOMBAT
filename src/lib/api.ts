import type {
  ApiSyncResponse,
  LeaderboardResponse,
  LeaderboardSort,
  PublicProfileResponse,
} from '../../shared/types';
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

// v3.3: «хвост» кликов — если игрок только что тапал, остаток неотправленных
// тапов уезжает вместе с покупкой. Один сетевой круг вместо двух: покупка
// ощущается мгновенной, и сервер уже видит свежий баланс.
export const gameApi = {
  /**
   * Для direct-link Mini Apps Telegram иногда кладёт startapp только в
   * tgWebAppStartParam внешнего launch payload, а не в подписанный tgWebAppData.
   * Досылаем его на самый первый init; сервер принимает fallback только после
   * успешной проверки Telegram initData и всё равно проверяет код/новизну игрока.
   */
  init: () => {
    const tg = initTelegramMiniApp();
    return apiRequest<ApiSyncResponse>('/api/init', 'POST', {
      ...(tg.startParam ? { startParam: tg.startParam } : {}),
    });
  },
  clickBatch: (clicks: number) => apiRequest<ApiSyncResponse>('/api/click', 'POST', { clicks }),
  buyCard: (cardKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/buy-card', 'POST', { cardKey, clicks }),
  missionAction: (
    action: 'start' | 'claim' | 'skip' | 'refresh',
    payload?: { missionKey?: string; missionId?: string },
    clicks = 0
  ) => apiRequest<ApiSyncResponse>('/api/missions', 'POST', { action, clicks, ...payload }),
  hireNpc: (npcKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/hire', 'POST', { npcKey, clicks }),
  claimDaily: (clicks = 0) => apiRequest<ApiSyncResponse>('/api/daily', 'POST', { clicks }),
  // v5.6: retention — забрать оффлайн (идемпотентно) и галочка напоминаний.
  retentionAction: (action: 'claim_offline' | 'reminder_opt_in', value?: boolean) =>
    apiRequest<ApiSyncResponse>('/api/retention', 'POST', value === undefined ? { action } : { action, value }),
  resolveDailyIncident: (choiceKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/daily-incident', 'POST', { choiceKey, clicks }),
  claimDailyTask: (taskKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/daily-tasks', 'POST', { action: 'claim', taskKey, clicks }),
  /** v6.3: активация сезонного леденца (×2 Data на час, раз в сутки). */
  activateLollipop: (clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/lollipop', 'POST', { action: 'activate', clicks }),
  /**
   * v6.8: забрать награду за шаг сюжета. Клиент присылает только id шага —
   * прогресс и награду считает сервер по своей записи.
   */
  storyClaim: (stepId: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/story', 'POST', { action: 'claim', stepId, clicks }),
  /** v6.2: вход в сессию взлома — сервер списывает CPU Charge и выдаёт seed. */
  startHack: (difficulty: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/hacks', 'POST', { action: 'start', difficulty, clicks }),
  /**
   * v6.2: итог сессии. Клиент присылает только счётчики узлов; Data, Heat и
   * валидность результата считает сервер.
   */
  finishHack: (sessionId: string, safeHits: number, trapHits: number, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/hacks', 'POST', {
      action: 'finish',
      sessionId,
      safeHits,
      trapHits,
      clicks,
    }),
  /** v6.1: забор награды за контракт дня. Тело — только id, награду считает сервер. */
  claimContract: (contractId: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/contracts', 'POST', { action: 'claim', contractId, clicks }),
  claimSeasonEvent: (action: 'claim_participation' | 'claim_mastery', clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/season-event', 'POST', { action, clicks }),
  skinAction: (
    action: 'buy_or_equip' | 'clear_lockdown' | 'set_theme' | 'set_backdrop' | 'profile_frame',
    skinKey?: string,
    clicks = 0
  ) => apiRequest<ApiSyncResponse>('/api/skin', 'POST', { action, skinKey, clicks }),
  /**
   * v5.5: переезд между локациями мира. Идёт тем же путём, что и косметика
   * (/api/skin), но отдельным действием — сервер проверит уровень локации.
   */
  setLocation: (locationId: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/skin', 'POST', { action: 'set_location', locationId, clicks }),
  profileFrameAction: (frameKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/skin', 'POST', { action: 'profile_frame', skinKey: frameKey, clicks }),
  inventoryVisibility: (itemKey: string, visible: boolean, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/inventory', 'POST', {
      action: 'set_public',
      itemKey,
      visible,
      clicks,
    }),
  publicProfile: (profileId: string) =>
    apiRequest<PublicProfileResponse>(`/api/profile?profileId=${encodeURIComponent(profileId)}`, 'GET'),
  prestige: (clicks = 0) => apiRequest<ApiSyncResponse>('/api/prestige', 'POST', { clicks }),
  unlockTier: (clicks = 0) => apiRequest<ApiSyncResponse>('/api/tier', 'POST', { clicks }),
  buyBaseUpgrade: (upgradeKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/base', 'POST', { upgradeKey, clicks }),
  petAction: (action: 'buy' | 'feed', petKey: string, clicks = 0) =>
    apiRequest<ApiSyncResponse>('/api/pets', 'POST', { action, petKey, clicks }),
  track: (event: string, value?: number) =>
    apiRequest<ApiSyncResponse>('/api/track', 'POST', { event, value }),
  leaderboard: (sort: LeaderboardSort = 'data') =>
    apiRequest<LeaderboardResponse>(`/api/leaderboard?sort=${sort}`, 'GET'),
  // v3.4: донат. Сервер сам сверяет сумму со своим конфигом — клиент может
  // попросить только одну из фиксированных сумм.
  donateInfo: () =>
    apiRequest<{
      ok: true;
      enabled: boolean;
      /** v3.6.6: постоянный итог поддержки (не только текущая сессия). */
      summary?: { count: number; stars: number };
      currency: string;
      minStars: number;
      maxStars: number;
      tiers: number[];
      botUsername: string | null;
      /** v3.6.8: внешняя страница доната (карта/СБП). null — фича выключена. */
      external?: { url: string; label: string } | null;
    }>('/api/donate', 'GET'),
  // v3.5: рефералка — только чтение своей ссылки и статистики.
  referralInfo: () =>
    apiRequest<{
      ok: true;
      code: string;
      link: string | null;
      botUsername: string | null;
      stats: { invited: number; qualified: number; xpEarned: number; dataEarned: number };
      rules: string;
      qualifySeconds: number;
      dailyLimit: number;
      weeklyLimit: number;
      /** v5.6: ссылка по Telegram ID (?start=ref_<tgId>) и её недельный кап. */
      tgLink?: string | null;
      tgWeeklyCap?: number;
      referralV1?: boolean;
    }>('/api/referral', 'GET'),
  donateLink: (stars: number) =>
    apiRequest<{
      ok: true;
      invoiceLink: string;
      stars: number;
      summary: { count: number; stars: number };
    }>('/api/donate', 'POST', { stars }),
};
