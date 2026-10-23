import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS_CONFIG } from '../../shared/achievements.config';
import { CARDS_CONFIG, getCardPrice, MAX_CARD_LEVEL } from '../../shared/cards.config';
import {
  BASE_MAX_ENERGY,
  computeDerivedStats,
  getPrestigeRequiredLevel,
  HEAT_LOCKDOWN_SECONDS,
  HEAT_PENALTY_DATA_LOSS_PCT,
  HEAT_PENALTY_THRESHOLD,
  HEAT_RESET_AFTER_PENALTY,
  RANK_TITLES,
  syncEnergy,
} from '../../shared/mechanics';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { SKINS_CONFIG } from '../../shared/skins.config';
import { TEAM_CONFIG } from '../../shared/team.config';
import type {
  ActiveMissionInstance,
  ApiSyncResponse,
  GameAlert,
  LeaderboardEntry,
  PlayerState,
} from '../../shared/types';
import { getSupabaseAdmin } from './supabaseAdmin';
import type { VerifiedTelegramUser } from './telegramAuth';

interface StoredPlayerRecord {
  id: string;
  tgId: number;
  username: string;
  data: number;
  crypto: number;
  energy: number;
  energyUpdated: string;
  heat: number;
  rep: number;
  prestigeCount: number;
  clickBlockedUntil: string | null;
  dailyStreak: number;
  lastDailyClaim: string | null;
  equippedSkin: string;
  unlockedSkins: string[];
  totalClicks: number;
  totalMissions: number;
  lastPassiveClaim: string;
  lastClickBatchAt: number;
  cards: Record<string, number>;
  team: string[];
  activeMissions: ActiveMissionInstance[];
  availableMissionKeys: string[];
  missionsRefreshedAt: string;
  achievements: string[];
}

// DEFAULT: Локальное dev/preview-хранилище (используется автоматически, если .env Supabase не задан)
const LOCAL_DB_PATH = path.resolve(process.cwd(), '.local-db.json');

interface LocalDatabase {
  playersByTgId: Record<string, StoredPlayerRecord>;
}

const RIVAL_NPCS_LEADERBOARD: LeaderboardEntry[] = [
  { username: 'CipherQueen', level: 54, data: 2_840_000, rankTitle: 'Phantom Architect', prestigeCount: 2 },
  { username: 'ZeroCool_RU', level: 48, data: 1_490_000, rankTitle: 'Darknet Legend', prestigeCount: 1 },
  { username: 'GhostProtocol', level: 39, data: 780_500, rankTitle: 'Darknet Legend', prestigeCount: 1 },
  { username: 'Kira_Neon', level: 31, data: 412_900, rankTitle: 'Shadow Broker', prestigeCount: 0 },
  { username: 'RootKit_77', level: 24, data: 164_200, rankTitle: 'Cybercriminal', prestigeCount: 0 },
  { username: 'ByteSamurai', level: 18, data: 68_400, rankTitle: 'Cybercriminal', prestigeCount: 0 },
  { username: 'SynthRunner', level: 12, data: 19_800, rankTitle: 'Netrunner', prestigeCount: 0 },
  { username: 'NullPointer', level: 7, data: 4_350, rankTitle: 'Hacker', prestigeCount: 0 },
  { username: 'PingFlood', level: 3, data: 820, rankTitle: 'Script Kiddie', prestigeCount: 0 },
];

let memoryDb: LocalDatabase | null = null;

/**
 * Персональный асинхронный мьютекс игрока (защита от параллельных Promise.all race-атак на баланс, покупки и клики!)
 */
const playerLocks = new Map<number, Promise<unknown>>();

async function withPlayerLock<T>(tgId: number, task: () => Promise<T>): Promise<T> {
  const previous = playerLocks.get(tgId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => next);
  playerLocks.set(tgId, tail);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (playerLocks.get(tgId) === tail) {
      playerLocks.delete(tgId);
    }
  }
}

function getLocalDb(): LocalDatabase {
  if (memoryDb) return memoryDb;
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      memoryDb = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8')) as LocalDatabase;
      return memoryDb;
    }
  } catch {
    // ignore corrupt temp cache
  }
  memoryDb = { playersByTgId: {} };
  return memoryDb;
}

function persistLocalDb(): void {
  if (!memoryDb) return;
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(memoryDb, null, 2), 'utf8');
  } catch {
    // ignore read-only serverless fs on Vercel when using memory mode
  }
}

/**
 * Детерминированно-случайная генерация 15-минутной витрины миссий.
 * ВАЖНО для безопасности: сид привязан к (tgId + 15-мин слот + счётчик ручных рефрешей),
 * чтобы на всех Serverless-инстансах Vercel витрина игрока была идентичной и никто не мог
 * запускать миссии вне своей витрины!
 */
const manualRefreshSalt = new Map<number, number>();

export function pickMissionOffer(unlockedGrey: boolean, seed = 0): string[] {
  let state = (Math.abs(seed) || 1337) % 2147483647;
  const nextRand = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };

  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const badPool = shuffle(MISSIONS_CONFIG.filter((m) => m.targetType === 'bad'));
  const goodPool = shuffle(MISSIONS_CONFIG.filter((m) => m.targetType === 'good'));
  const neutralPool = shuffle(MISSIONS_CONFIG.filter((m) => m.targetType === 'neutral'));
  const greyPool = shuffle(MISSIONS_CONFIG.filter((m) => m.targetType === 'grey'));

  const selected: string[] = [
    ...badPool.slice(0, 3).map((m) => m.key),
    ...goodPool.slice(0, 3).map((m) => m.key),
    ...neutralPool.slice(0, 2).map((m) => m.key),
  ];

  if (unlockedGrey) {
    selected.unshift(...greyPool.slice(0, 2).map((m) => m.key));
  }

  return selected;
}

function computeOfferWindow(tgId: number, unlockedGrey: boolean): { keys: string[]; refreshedAt: string } {
  const windowMs = 15 * 60 * 1000;
  const windowIndex = Math.floor(Date.now() / windowMs);
  const salt = manualRefreshSalt.get(tgId) ?? 0;
  const seed = Math.abs(tgId * 31 + windowIndex * 7919 + salt * 104729);
  return {
    keys: pickMissionOffer(unlockedGrey, seed),
    refreshedAt: new Date(windowIndex * windowMs).toISOString(),
  };
}

function createFreshRecord(user: VerifiedTelegramUser): StoredPlayerRecord {
  const nowIso = new Date().toISOString();
  const offer = computeOfferWindow(user.tgId, false);
  return {
    id: crypto.randomUUID(),
    tgId: user.tgId,
    username: user.username,
    data: 0,
    crypto: 5,
    energy: BASE_MAX_ENERGY,
    energyUpdated: nowIso,
    heat: 0,
    rep: 0,
    prestigeCount: 0,
    clickBlockedUntil: null,
    dailyStreak: 0,
    lastDailyClaim: null,
    equippedSkin: 'default',
    unlockedSkins: ['default'],
    totalClicks: 0,
    totalMissions: 0,
    lastPassiveClaim: nowIso,
    lastClickBatchAt: 0,
    cards: {},
    team: [],
    activeMissions: [],
    availableMissionKeys: offer.keys,
    missionsRefreshedAt: offer.refreshedAt,
    achievements: [],
  };
}

const recentClickTimestamps = new Map<number, number>();
const missionOfferCache = new Map<number, { keys: string[]; refreshedAt: string }>();

function safeNonNeg(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function loadPlayerRecord(user: VerifiedTelegramUser): Promise<{
  record: StoredPlayerRecord;
  mode: 'supabase' | 'memory-fallback';
}> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const db = getLocalDb();
    const key = String(user.tgId);
    if (!db.playersByTgId[key]) {
      db.playersByTgId[key] = createFreshRecord(user);
      persistLocalDb();
    } else if (user.username && db.playersByTgId[key].username !== user.username) {
      db.playersByTgId[key].username = user.username;
    }
    return { record: db.playersByTgId[key], mode: 'memory-fallback' };
  }

  const { data: playerRow, error: initErr } = await sb.rpc('init_player', {
    p_tg_id: user.tgId,
    p_username: user.username,
  });
  if (initErr || !playerRow) {
    throw new Error(`Supabase init_player error: ${initErr?.message ?? 'no data'}`);
  }

  const pid = playerRow.id as string;
  const [cardsRes, teamRes, missionsRes, achRes] = await Promise.all([
    sb.from('cards').select('card_key, level').eq('player_id', pid),
    sb.from('team').select('npc_key').eq('player_id', pid),
    sb
      .from('missions')
      .select(
        'id, mission_key, target_type, target_name, started_at, finish_at, reward, rep_delta, heat_delta, crypto_reward'
      )
      .eq('player_id', pid)
      .eq('status', 'active'),
    sb.from('achievements').select('key').eq('player_id', pid),
  ]);

  const cardsMap: Record<string, number> = {};
  for (const row of cardsRes.data ?? []) {
    const lvl = Math.max(0, Math.min(MAX_CARD_LEVEL, Math.floor(safeNonNeg(row.level, 0))));
    if (lvl > 0) {
      cardsMap[String(row.card_key)] = lvl;
    }
  }
  const teamList = Array.from(new Set((teamRes.data ?? []).map((r) => String(r.npc_key))));
  const hasAnalyst = teamList.includes('analyst');

  let offer = missionOfferCache.get(user.tgId);
  if (!offer) {
    offer = computeOfferWindow(user.tgId, hasAnalyst);
    missionOfferCache.set(user.tgId, offer);
  }

  const energyUpdatedIso = String(playerRow.energy_updated ?? new Date().toISOString());
  const dbEnergyTs = Date.parse(energyUpdatedIso);
  // Даже после холодного рестарта Lambda берём timestamp последнего обновления энергии из PostgreSQL!
  const warmClickTs = recentClickTimestamps.get(user.tgId) ?? (Number.isFinite(dbEnergyTs) ? dbEnergyTs : 0);

  const record: StoredPlayerRecord = {
    id: pid,
    tgId: Number(playerRow.tg_id),
    username: String(playerRow.username),
    data: safeNonNeg(playerRow.data, 0),
    crypto: Math.floor(safeNonNeg(playerRow.crypto, 5)),
    energy: Math.floor(safeNonNeg(playerRow.energy, BASE_MAX_ENERGY)),
    energyUpdated: energyUpdatedIso,
    heat: Math.floor(safeNonNeg(playerRow.heat, 0)),
    rep: Math.floor(safeNonNeg(playerRow.rep, 0)),
    prestigeCount: Math.floor(safeNonNeg(playerRow.prestige_count, 0)),
    clickBlockedUntil: playerRow.click_blocked_until ?? null,
    dailyStreak: Math.floor(safeNonNeg(playerRow.daily_streak, 0)),
    lastDailyClaim: playerRow.last_daily_claim ?? null,
    equippedSkin: String(playerRow.equipped_skin ?? 'default'),
    unlockedSkins: Array.isArray(playerRow.unlocked_skins)
      ? Array.from(new Set(['default', ...playerRow.unlocked_skins.map(String)]))
      : ['default'],
    totalClicks: Math.floor(safeNonNeg(playerRow.total_clicks, 0)),
    totalMissions: Math.floor(safeNonNeg(playerRow.total_missions, 0)),
    lastPassiveClaim: String(playerRow.last_passive_claim ?? new Date().toISOString()),
    lastClickBatchAt: warmClickTs,
    cards: cardsMap,
    team: teamList,
    activeMissions: (missionsRes.data ?? []).map((m) => ({
      id: String(m.id),
      missionKey: String(m.mission_key),
      targetName: String(m.target_name),
      targetType: m.target_type,
      startedAt: String(m.started_at),
      finishAt: String(m.finish_at),
      reward: safeNonNeg(m.reward, 0),
      repDelta: Number.isFinite(Number(m.rep_delta)) ? Math.trunc(Number(m.rep_delta)) : 0,
      heatDelta: Math.floor(safeNonNeg(m.heat_delta, 0)),
      cryptoReward: Math.floor(safeNonNeg(m.crypto_reward, 0)),
    })),
    availableMissionKeys: offer.keys,
    missionsRefreshedAt: offer.refreshedAt,
    achievements: Array.from(new Set((achRes.data ?? []).map((a) => String(a.key)))),
  };

  return { record, mode: 'supabase' };
}

async function savePlayerCore(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback'
): Promise<void> {
  recentClickTimestamps.set(record.tgId, record.lastClickBatchAt);
  missionOfferCache.set(record.tgId, {
    keys: record.availableMissionKeys,
    refreshedAt: record.missionsRefreshedAt,
  });

  // Защита от переполнения и отрицательных значений перед записью в БД
  record.data = Math.max(0, Math.floor(safeNonNeg(record.data, 0) * 100) / 100);
  record.crypto = Math.max(0, Math.floor(safeNonNeg(record.crypto, 0)));
  record.rep = Math.max(0, Math.floor(safeNonNeg(record.rep, 0)));
  record.heat = Math.max(0, Math.floor(safeNonNeg(record.heat, 0)));
  record.totalClicks = Math.max(0, Math.floor(safeNonNeg(record.totalClicks, 0)));
  record.totalMissions = Math.max(0, Math.floor(safeNonNeg(record.totalMissions, 0)));

  const derived = computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
  });

  record.energy = Math.max(0, Math.min(derived.maxEnergy, Math.floor(safeNonNeg(record.energy, 0))));

  if (mode === 'memory-fallback') {
    const db = getLocalDb();
    db.playersByTgId[String(record.tgId)] = record;
    persistLocalDb();
    return;
  }

  const sb = getSupabaseAdmin();
  if (!sb) return;

  const { error } = await sb
    .from('players')
    .update({
      username: record.username,
      rank: derived.rankIndex,
      data: record.data,
      crypto: record.crypto,
      energy: record.energy,
      energy_updated: record.energyUpdated,
      heat: record.heat,
      rep: record.rep,
      level: derived.level,
      data_per_hour: derived.dataPerHour,
      prestige_count: record.prestigeCount,
      click_blocked_until: record.clickBlockedUntil,
      daily_streak: record.dailyStreak,
      last_daily_claim: record.lastDailyClaim,
      equipped_skin: record.equippedSkin,
      unlocked_skins: record.unlockedSkins,
      total_clicks: record.totalClicks,
      total_missions: record.totalMissions,
      last_passive_claim: record.lastPassiveClaim,
    })
    .eq('id', record.id);

  if (error) {
    throw new Error(`Supabase update player error: ${error.message}`);
  }
}

async function syncTimeAndRules(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[]
): Promise<{ offlineEarned: number }> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const derived = computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
  });

  // 1. Восстановление энергии 1 Energy / 3 сек
  const syncedEnergy = syncEnergy(record.energy, record.energyUpdated, derived.maxEnergy, nowMs);
  record.energy = syncedEnergy.energy;
  record.energyUpdated = syncedEnergy.updatedAtIso;

  // 2. Пассивный доход с момента lastPassiveClaim (кап 24ч оффлайн-копилки)
  let offlineEarned = 0;
  const lastPassiveMs = new Date(record.lastPassiveClaim).getTime();
  if (!Number.isNaN(lastPassiveMs) && nowMs > lastPassiveMs && derived.dataPerHour > 0) {
    const elapsedSec = Math.min(86400, (nowMs - lastPassiveMs) / 1000);
    if (elapsedSec >= 2) {
      const earned = Math.floor(((derived.dataPerHour / 3600) * elapsedSec) * 10) / 10;
      if (earned > 0) {
        record.data += earned;
        record.lastPassiveClaim = nowIso;
        if (elapsedSec >= 45) {
          offlineEarned = Math.round(earned);
        }
      }
    }
  } else {
    record.lastPassiveClaim = nowIso;
  }

  // 3. Авто-обновление витрины миссий каждые 15 минут
  const refreshedMs = new Date(record.missionsRefreshedAt).getTime();
  if (Number.isNaN(refreshedMs) || nowMs - refreshedMs >= 15 * 60 * 1000) {
    const nextOffer = computeOfferWindow(record.tgId, derived.unlockedGreyMissions);
    record.availableMissionKeys = nextOffer.keys;
    record.missionsRefreshedAt = nowIso;
  }

  // 4. Проверка штрафа Heat > 100
  if (record.heat > HEAT_PENALTY_THRESHOLD) {
    const lostData = Math.floor(record.data * HEAT_PENALTY_DATA_LOSS_PCT);
    record.data = Math.max(0, record.data - lostData);
    record.heat = HEAT_RESET_AFTER_PENALTY;
    record.clickBlockedUntil = new Date(nowMs + HEAT_LOCKDOWN_SECONDS * 1000).toISOString();
    alerts.push({
      id: crypto.randomUUID(),
      type: 'penalty',
      title: '🚨 ПЕРЕХВАТ КИБЕРПАТРУЛЯ (HEAT > 100)!',
      message: `Потеряно ${lostData.toLocaleString('ru-RU')} Data (-10%), клики заблокированы на 60 сек. Heat сброшен до 50.`,
    });
  }

  if (record.clickBlockedUntil && new Date(record.clickBlockedUntil).getTime() <= nowMs) {
    record.clickBlockedUntil = null;
  }

  // 5. Проверка всех 24 достижений (автоматически и безопасно доначисляет новые ачивки существующим игрокам!)
  const updatedDerived = computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
  });

  const newlyUnlocked: string[] = [];
  const tryUnlock = (key: string, condition: boolean) => {
    if (condition && !record.achievements.includes(key)) {
      record.achievements.push(key);
      newlyUnlocked.push(key);
    }
  };

  tryUnlock('first_boot', record.totalClicks >= 25);
  tryUnlock('first_upgrade', updatedDerived.totalCardLevels >= 1);
  tryUnlock('first_mission', record.totalMissions >= 1);
  tryUnlock('first_teammate', record.team.length >= 1);
  tryUnlock('desk_lvl_5', updatedDerived.level >= 5);
  tryUnlock('click_sprinter_500', record.totalClicks >= 500);
  tryUnlock('white_hat_path', updatedDerived.alignment === 'white_hat' && record.rep >= 40);
  tryUnlock('black_hat_path', updatedDerived.alignment === 'black_hat' && record.heat >= 35);
  tryUnlock('missions_veteran_15', record.totalMissions >= 15);
  tryUnlock('desk_lvl_15', updatedDerived.level >= 15);
  tryUnlock('triple_slots_20', updatedDerived.level >= 20);
  tryUnlock('data_millionaire', record.data >= 100_000);
  tryUnlock('click_master_2500', record.totalClicks >= 2_500);
  tryUnlock('energy_overcharge_2500', updatedDerived.maxEnergy >= 2_500);
  tryUnlock('desk_lvl_30', updatedDerived.level >= 30);
  tryUnlock('full_squad', record.team.length >= 6);
  tryUnlock('elite_syndicate_8', record.team.length >= TEAM_CONFIG.length);
  tryUnlock('true_millionaire_1m', record.data >= 1_000_000);
  tryUnlock('missions_master_50', record.totalMissions >= 50);
  tryUnlock('click_legend_10k', record.totalClicks >= 10_000);
  tryUnlock('rep_guardian_250', record.rep >= 250);
  tryUnlock('global_hack_prestige', record.prestigeCount >= 1);
  tryUnlock('data_tycoon_25m', record.data >= 25_000_000);
  tryUnlock('global_hack_prestige_2', record.prestigeCount >= 2);

  if (newlyUnlocked.length > 0) {
    const sb = getSupabaseAdmin();
    for (const achKey of newlyUnlocked) {
      let granted = true;
      if (mode === 'supabase' && sb) {
        // Атомарная вставка достижения с ignoreDuplicates защищает от двойного начисления Crypto при гонках!
        const { data: insertedRows, error: achErr } = await sb
          .from('achievements')
          .upsert({ player_id: record.id, key: achKey }, { onConflict: 'player_id,key', ignoreDuplicates: true })
          .select('id');
        if (achErr || !insertedRows || insertedRows.length === 0) {
          granted = false;
        }
      }
      if (granted) {
        const cfg = ACHIEVEMENTS_CONFIG.find((a) => a.key === achKey);
        if (cfg) {
          record.crypto += cfg.cryptoReward;
          alerts.push({
            id: crypto.randomUUID(),
            type: 'achievement',
            title: `🏆 Достижение: ${cfg.title}`,
            message: `+${cfg.cryptoReward} 💎 Crypto начислено на счёт!`,
          });
        }
      }
    }
  }

  return { offlineEarned };
}

function buildResponse(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[] = [],
  offlineEarned = 0
): ApiSyncResponse {
  const derived = computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
  });

  const player: PlayerState = {
    id: record.id,
    tgId: record.tgId,
    username: record.username,
    data: Math.round(record.data * 10) / 10,
    crypto: record.crypto,
    energy: record.energy,
    energyUpdated: record.energyUpdated,
    heat: record.heat,
    rep: record.rep,
    prestigeCount: record.prestigeCount,
    clickBlockedUntil: record.clickBlockedUntil,
    dailyStreak: record.dailyStreak,
    lastDailyClaim: record.lastDailyClaim,
    equippedSkin: record.equippedSkin,
    unlockedSkins: record.unlockedSkins,
    totalClicks: record.totalClicks,
    totalMissions: record.totalMissions,
    cards: record.cards,
    team: record.team,
    activeMissions: record.activeMissions,
    availableMissionKeys: record.availableMissionKeys,
    missionsRefreshedAt: record.missionsRefreshedAt,
    achievements: record.achievements,
    derived,
  };

  return {
    ok: true,
    player,
    offlineEarned: offlineEarned > 0 ? offlineEarned : undefined,
    alerts: alerts.length > 0 ? alerts : undefined,
    storageMode: mode,
  };
}

// ============================================================================
// ЗАЩИЩЁННЫЕ ПУБЛИЧНЫЕ МЕТОДЫ ИГРОВОГО ДВИЖКА ДЛЯ /api/*
// ============================================================================

export async function handleInitPlayer(user: VerifiedTelegramUser): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    const { offlineEarned } = await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, offlineEarned);
  });
}

export async function handleClickBatch(
  user: VerifiedTelegramUser,
  requestedClicks: number
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const prevTotalClicks = record.totalClicks;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (record.clickBlockedUntil && new Date(record.clickBlockedUntil).getTime() > nowMs) {
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts);
    }

    // Жёсткий серверный Anti-Cheat:
    // 1) не более 50 кликов в одной пачке;
    // 2) не более 20 кликов/сек (включая кросс-инстанс проверку через energyUpdated из БД!).
    const rawCount = Math.max(0, Math.min(50, Math.floor(Number(requestedClicks) || 0)));
    let allowedByRate = rawCount;
    if (record.lastClickBatchAt > 0) {
      const elapsedSec = Math.max(0.15, (nowMs - record.lastClickBatchAt) / 1000);
      const maxHumanBurst = Math.max(1, Math.ceil(elapsedSec * 20));
      allowedByRate = Math.min(rawCount, maxHumanBurst);
    } else {
      allowedByRate = Math.min(rawCount, 20);
    }

    const validClicks = Math.min(allowedByRate, record.energy);
    if (validClicks > 0) {
      const derived = computeDerivedStats({
        cards: record.cards,
        team: record.team,
        rep: record.rep,
        heat: record.heat,
        data: record.data,
        prestigeCount: record.prestigeCount,
        equippedSkin: record.equippedSkin,
      });

      // Атомарная кросс-Lambda проверка на уровне PostgreSQL (защита от параллельного флуда с 10 инстансов)
      if (mode === 'supabase') {
        const sb = getSupabaseAdmin();
        if (sb) {
          const { data: lockedRow } = await sb
            .from('players')
            .update({
              total_clicks: prevTotalClicks + validClicks,
              energy_updated: nowIso,
            })
            .eq('id', record.id)
            .eq('total_clicks', prevTotalClicks)
            .select('id');
          if (!lockedRow || lockedRow.length === 0) {
            return buildResponse(record, mode, alerts);
          }
        }
      }

      record.energy = Math.max(0, record.energy - validClicks);
      record.energyUpdated = nowIso;
      record.data += validClicks * derived.clickPower;
      record.totalClicks = prevTotalClicks + validClicks;
      record.lastClickBatchAt = nowMs;
    }

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleBuyCard(
  user: VerifiedTelegramUser,
  cardKey: string
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const card = CARDS_CONFIG.find((c) => c.key === cardKey);
    if (!card) {
      throw new Error('Карточка не найдена');
    }

    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const prevDerived = computeDerivedStats({
      cards: record.cards,
      team: record.team,
      rep: record.rep,
      heat: record.heat,
      data: record.data,
      prestigeCount: record.prestigeCount,
      equippedSkin: record.equippedSkin,
    });

    // Серверная проверка требования по уровню для эндгейм-карт!
    if (card.minLevel && prevDerived.level < card.minLevel) {
      throw new Error(`Эта карточка открывается на ${card.minLevel} уровне игрока!`);
    }

    const currentLevel = record.cards[card.key] ?? 0;
    if (currentLevel >= MAX_CARD_LEVEL) {
      throw new Error('Достигнут максимальный 10-й уровень карточки');
    }

    const price = getCardPrice(card, currentLevel);
    if (record.data < price) {
      throw new Error(`Недостаточно Data (нужно ${price.toLocaleString('ru-RU')})`);
    }

    record.data -= price;
    const nextLevel = currentLevel + 1;
    record.cards[card.key] = nextLevel;

    if (card.heatOnBuy) {
      record.heat += Math.round(card.heatOnBuy * prevDerived.heatMultiplier);
    }

    if (card.energyMaxPerLevel) {
      record.energy = Math.min(5000, record.energy + card.energyMaxPerLevel);
    }

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { error: cardErr } = await sb
          .from('cards')
          .upsert(
            { player_id: record.id, card_key: card.key, level: nextLevel },
            { onConflict: 'player_id,card_key' }
          );
        if (cardErr) {
          throw new Error(`Ошибка сохранения карточки: ${cardErr.message}`);
        }
      }
    }

    await syncTimeAndRules(record, mode, alerts);

    const newDerived = computeDerivedStats({
      cards: record.cards,
      team: record.team,
      rep: record.rep,
      heat: record.heat,
      data: record.data,
      prestigeCount: record.prestigeCount,
      equippedSkin: record.equippedSkin,
    });

    if (newDerived.deskStage > prevDerived.deskStage) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `✨ ЭВОЛЮЦИЯ СТОЛА (УР. ${newDerived.deskStage})!`,
        message: 'Рабочее место хакера обновилось визуально — загляни на вкладку «Стол»!',
      });
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleHireNpc(
  user: VerifiedTelegramUser,
  npcKey: string
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const npc = TEAM_CONFIG.find((n) => n.key === npcKey);
    if (!npc) {
      throw new Error('Персонаж не найден');
    }

    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    if (record.team.includes(npc.key)) {
      throw new Error('Специалист уже в вашей команде');
    }

    if (npc.costCurrency === 'data') {
      if (record.data < npc.costAmount) {
        throw new Error(`Недостаточно Data для найма (нужно ${npc.costAmount.toLocaleString('ru-RU')})`);
      }
      record.data -= npc.costAmount;
    } else {
      if (record.rep < npc.costAmount) {
        throw new Error(`Недостаточно Репутации Rep (нужно ${npc.costAmount} Rep)`);
      }
      record.rep -= npc.costAmount;
    }

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: insertedTeam, error: hireErr } = await sb
          .from('team')
          .upsert({ player_id: record.id, npc_key: npc.key }, { onConflict: 'player_id,npc_key', ignoreDuplicates: true })
          .select('id');
        if (hireErr || !insertedTeam || insertedTeam.length === 0) {
          throw new Error('Специалист уже нанят в параллельной сессии');
        }
      }
    }

    record.team.push(npc.key);

    if (npc.unlocksGreyMissions) {
      manualRefreshSalt.set(user.tgId, (manualRefreshSalt.get(user.tgId) ?? 0) + 1);
      const nextOffer = computeOfferWindow(user.tgId, true);
      record.availableMissionKeys = nextOffer.keys;
      record.missionsRefreshedAt = new Date().toISOString();
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: '🟣 Секретные миссии открыты!',
        message: 'Аналитик добавил закрытые «серые» контракты с шансом дропа Crypto во вкладку «Взломы».',
      });
    }

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleMissionAction(
  user: VerifiedTelegramUser,
  action: 'start' | 'claim' | 'skip' | 'refresh',
  payload: { missionKey?: string; missionId?: string }
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const derived = computeDerivedStats({
      cards: record.cards,
      team: record.team,
      rep: record.rep,
      heat: record.heat,
      data: record.data,
      prestigeCount: record.prestigeCount,
      equippedSkin: record.equippedSkin,
    });

    if (action === 'refresh') {
      manualRefreshSalt.set(user.tgId, (manualRefreshSalt.get(user.tgId) ?? 0) + 1);
      const nextOffer = computeOfferWindow(user.tgId, derived.unlockedGreyMissions);
      record.availableMissionKeys = nextOffer.keys;
      record.missionsRefreshedAt = new Date().toISOString();
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts);
    }

    if (action === 'start') {
      if (record.activeMissions.length >= derived.missionSlots) {
        throw new Error(
          `Достигнут лимит одновременных миссий (${derived.missionSlots}/${derived.missionSlots}). 3 слота открываются на 20 уровне!`
        );
      }
      const cfg = MISSIONS_CONFIG.find((m) => m.key === payload.missionKey);
      if (!cfg) {
        throw new Error('Миссия не найдена');
      }
      // Строгая серверная проверка: нельзя подделать ключ миссии вне текущей витрины!
      if (!record.availableMissionKeys.includes(cfg.key)) {
        throw new Error('Эта цель сейчас не представлена в текущем скане сети — обновите список');
      }
      if (cfg.targetType === 'grey' && !derived.unlockedGreyMissions) {
        throw new Error('Серые миссии требуют найма Analyst в разделе «Команда»');
      }
      if (record.activeMissions.some((m) => m.missionKey === cfg.key)) {
        throw new Error('Эта цель уже взламывается в данный момент');
      }

      const levelScale = 1 + (derived.level - 1) * 0.22;
      const whiteHatBonus = derived.alignment === 'white_hat' && cfg.targetType === 'bad' ? 2 : 1;
      const reward = Math.round(
        cfg.baseDataReward * levelScale * whiteHatBonus * derived.prestigeMultiplier
      );
      const repDelta = cfg.repDelta * (whiteHatBonus > 1 && cfg.repDelta > 0 ? 2 : 1);
      const heatDelta = Math.round(cfg.heatDelta * derived.heatMultiplier);
      const cryptoReward =
        cfg.cryptoDropChance && Math.random() < cfg.cryptoDropChance ? 1 : 0;

      const nowMs = Date.now();
      const startedAt = new Date(nowMs).toISOString();
      const finishAt = new Date(nowMs + cfg.durationSec * 1000).toISOString();

      let instanceId: string = crypto.randomUUID();

      if (mode === 'supabase') {
        const sb = getSupabaseAdmin();
        if (sb) {
          const { data: inserted, error } = await sb
            .from('missions')
            .insert({
              player_id: record.id,
              mission_key: cfg.key,
              target_type: cfg.targetType,
              target_name: cfg.targetName,
              status: 'active',
              started_at: startedAt,
              finish_at: finishAt,
              reward,
              rep_delta: repDelta,
              heat_delta: heatDelta,
              crypto_reward: cryptoReward,
            })
            .select('id')
            .single();
          if (error) throw new Error(error.message);
          if (inserted?.id) instanceId = String(inserted.id);
        }
      }

      record.activeMissions.push({
        id: instanceId,
        missionKey: cfg.key,
        targetName: cfg.targetName,
        targetType: cfg.targetType,
        startedAt,
        finishAt,
        reward,
        repDelta,
        heatDelta,
        cryptoReward,
      });

      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts);
    }

    // Атомарное завершение миссии (claim / skip) — 100% защита от двойного забора награды параллельными запросами!
    const idx = record.activeMissions.findIndex((m) => m.id === payload.missionId);
    if (idx === -1) {
      throw new Error('Активная миссия не найдена');
    }
    const mission = record.activeMissions[idx];

    if (action === 'skip') {
      if (record.crypto < 1) {
        throw new Error('Нужна 1 💎 Crypto для мгновенного пропуска таймера');
      }
    } else {
      const finishMs = new Date(mission.finishAt).getTime();
      if (Date.now() + 250 < finishMs) {
        throw new Error('Взлом ещё не завершён — дождитесь окончания таймера');
      }
    }

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: claimedRows, error: claimErr } = await sb
          .from('missions')
          .update({ status: 'completed' })
          .eq('id', mission.id)
          .eq('player_id', record.id)
          .eq('status', 'active')
          .select('id');
        if (claimErr || !claimedRows || claimedRows.length === 0) {
          throw new Error('Награда за эту миссию уже была получена');
        }
      }
    }

    if (action === 'skip') {
      record.crypto -= 1;
    }

    record.activeMissions.splice(idx, 1);
    record.data += mission.reward;
    record.rep = Math.max(0, record.rep + mission.repDelta);
    record.heat = Math.max(0, record.heat + mission.heatDelta);
    record.crypto += mission.cryptoReward;
    record.totalMissions += 1;

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `✅ Цель ${mission.targetName} взломана!`,
      message:
        `+${mission.reward.toLocaleString('ru-RU')} Data` +
        (mission.repDelta !== 0 ? ` | ${mission.repDelta > 0 ? '+' : ''}${mission.repDelta} Rep` : '') +
        (mission.heatDelta > 0 ? ` | +${mission.heatDelta} Heat` : '') +
        (mission.cryptoReward > 0 ? ` | +${mission.cryptoReward} 💎 Crypto!` : ''),
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleDailyBonus(user: VerifiedTelegramUser): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const prevDailyClaim = record.lastDailyClaim;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (record.lastDailyClaim) {
      const elapsedHours = (nowMs - new Date(record.lastDailyClaim).getTime()) / (1000 * 3600);
      if (elapsedHours < 20) {
        const waitHours = Math.ceil(20 - elapsedHours);
        throw new Error(`Ежедневный бонус уже получен! Следующий через ~${waitHours} ч.`);
      }
      if (elapsedHours > 48) {
        record.dailyStreak = 0;
      }
    }

    const nextStreak = (record.dailyStreak % 7) + 1;

    // Атомарная CAS-проверка в PostgreSQL против параллельного дюпа ежедневного бонуса!
    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (sb) {
        const query = sb
          .from('players')
          .update({ last_daily_claim: nowIso, daily_streak: nextStreak })
          .eq('id', record.id);
        const guarded =
          prevDailyClaim === null
            ? query.is('last_daily_claim', null)
            : query.eq('last_daily_claim', prevDailyClaim);
        const { data: updatedRows, error } = await guarded.select('id');
        if (error || !updatedRows || updatedRows.length === 0) {
          throw new Error('Ежедневный бонус уже получен!');
        }
      }
    }

    record.dailyStreak = nextStreak;
    record.lastDailyClaim = nowIso;

    const cryptoBonus = 3 + record.dailyStreak * 2;
    const dataBonus = 150 * record.dailyStreak * Math.max(1, Math.pow(2, record.prestigeCount));
    record.crypto += cryptoBonus;
    record.data += dataBonus;

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🎁 День ${record.dailyStreak}/7 получен!`,
      message: `Начислено +${cryptoBonus} 💎 Crypto и +${dataBonus.toLocaleString('ru-RU')} Data!`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleSkinAction(
  user: VerifiedTelegramUser,
  action: 'buy_or_equip' | 'clear_lockdown',
  skinKey?: string
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    if (action === 'clear_lockdown') {
      if (!record.clickBlockedUntil) {
        return buildResponse(record, mode, alerts);
      }
      if (record.crypto < 2) {
        throw new Error('Нужно 2 💎 Crypto для мгновенного сброса блокировки терминала');
      }
      record.crypto -= 2;
      record.clickBlockedUntil = null;
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: '⚡ Блокировка снята!',
        message: 'Новый прокси-туннель активирован — терминал снова в строю!',
      });
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts);
    }

    const skin = SKINS_CONFIG.find((s) => s.key === skinKey);
    if (!skin) {
      throw new Error('Скин не найден');
    }

    if (record.unlockedSkins.includes(skin.key)) {
      record.equippedSkin = skin.key;
    } else {
      if (skin.prestigeRequired && record.prestigeCount < 1) {
        throw new Error('Этот скин открывается только через Global Hack Престиж!');
      }
      if (record.crypto < skin.cryptoCost) {
        throw new Error(`Недостаточно Crypto (нужно ${skin.cryptoCost} 💎)`);
      }
      record.crypto -= skin.cryptoCost;
      record.unlockedSkins.push(skin.key);
      record.equippedSkin = skin.key;
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `🎨 Скин «${skin.name}» активирован!`,
        message: 'Тема рабочего стола и неоновые акценты обновлены.',
      });
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleGlobalHackPrestige(
  user: VerifiedTelegramUser
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const expectedPrestige = record.prestigeCount;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const derived = computeDerivedStats({
      cards: record.cards,
      team: record.team,
      rep: record.rep,
      heat: record.heat,
      data: record.data,
      prestigeCount: record.prestigeCount,
      equippedSkin: record.equippedSkin,
    });

    const requiredLevel = getPrestigeRequiredLevel(record.prestigeCount);
    if (derived.level < requiredLevel) {
      throw new Error(
        `Следующий Global Hack Престиж открывается на ${requiredLevel} уровне (сейчас ${derived.level} ур.)`
      );
    }

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (sb) {
        // Атомарная проверка prestige_count исключает двойную накрутку множителя параллельным POST!
        const { data: lockedRows, error } = await sb
          .from('players')
          .update({ prestige_count: expectedPrestige + 1, data: 0 })
          .eq('id', record.id)
          .eq('prestige_count', expectedPrestige)
          .select('id');
        if (error || !lockedRows || lockedRows.length === 0) {
          throw new Error('Global Hack Престиж уже был выполнен!');
        }
        await Promise.all([
          sb.from('cards').delete().eq('player_id', record.id),
          sb.from('team').delete().eq('player_id', record.id),
          sb.from('missions').delete().eq('player_id', record.id).eq('status', 'active'),
        ]);
      }
    }

    record.cards = {};
    record.team = [];
    record.activeMissions = [];
    record.data = 0;
    record.heat = 0;
    record.energy = BASE_MAX_ENERGY;
    record.prestigeCount = expectedPrestige + 1;

    if (!record.unlockedSkins.includes('prestige_omega')) {
      record.unlockedSkins.push('prestige_omega');
    }
    record.equippedSkin = 'prestige_omega';

    alerts.push({
      id: crypto.randomUUID(),
      type: 'achievement',
      title: `🌐 GLOBAL HACK #${record.prestigeCount} ВЫПОЛНЕН!`,
      message: `Постоянный множитель дохода теперь ×${Math.pow(2, record.prestigeCount)}! Все ваши Crypto, достижения, скины и Rep сохранены!`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

export async function handleGetLeaderboard(
  currentUser: VerifiedTelegramUser
): Promise<{ ok: true; entries: LeaderboardEntry[] }> {
  const sb = getSupabaseAdmin();
  if (sb) {
    // Выбираем только реальных верифицированных игроков Telegram (tg_id > 0) и официальных кибер-соперников (-1009..-1001)!
    // Ни один неавторизованный гость из браузерного превью (-900M..-100M) не попадает в глобальный рейтинг!
    const { data, error } = await sb
      .from('players')
      .select('tg_id, username, level, data, rank, prestige_count')
      .gt('tg_id', -10_000_000)
      .order('data', { ascending: false })
      .limit(100);

    if (!error && data) {
      const entries: LeaderboardEntry[] = data.map((row) => {
        const rankIdx = Math.max(1, Math.min(RANK_TITLES.length, Number(row.rank ?? 1)));
        return {
          username: String(row.username),
          level: Number(row.level ?? 1),
          data: Math.round(Number(row.data ?? 0)),
          rankTitle: RANK_TITLES[rankIdx - 1]?.title ?? 'Script Kiddie',
          prestigeCount: Number(row.prestige_count ?? 0),
          isCurrentUser: Number(row.tg_id) === currentUser.tgId,
        };
      });
      return { ok: true, entries };
    }
  }

  const db = getLocalDb();
  const realEntries: LeaderboardEntry[] = Object.values(db.playersByTgId)
    .filter((rec) => rec.tgId > -10_000_000 || rec.tgId === currentUser.tgId)
    .map((rec) => {
    const d = computeDerivedStats({
      cards: rec.cards,
      team: rec.team,
      rep: rec.rep,
      heat: rec.heat,
      data: rec.data,
      prestigeCount: rec.prestigeCount,
      equippedSkin: rec.equippedSkin,
    });
    return {
      username: rec.username,
      level: d.level,
      data: Math.round(rec.data),
      rankTitle: d.rankTitle,
      prestigeCount: rec.prestigeCount,
      isCurrentUser: rec.tgId === currentUser.tgId,
    };
  });

  const merged = [...realEntries, ...RIVAL_NPCS_LEADERBOARD]
    .sort((a, b) => b.data - a.data)
    .slice(0, 100);

  return { ok: true, entries: merged };
}
