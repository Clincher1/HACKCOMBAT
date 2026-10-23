import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS_CONFIG } from '../../shared/achievements.config';
import { CARDS_CONFIG, getCardPrice, MAX_CARD_LEVEL } from '../../shared/cards.config';
import {
  BASE_MAX_ENERGY,
  computeDerivedStats,
  HEAT_LOCKDOWN_SECONDS,
  HEAT_PENALTY_DATA_LOSS_PCT,
  HEAT_PENALTY_THRESHOLD,
  HEAT_RESET_AFTER_PENALTY,
  PRESTIGE_REQUIRED_LEVEL,
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

// DEFAULT: Локальное dev/preview-хранилище (используется автоматически, если .env Supabase ещё не заполнен)
const LOCAL_DB_PATH = path.resolve(process.cwd(), '.local-db.json');

interface LocalDatabase {
  playersByTgId: Record<string, StoredPlayerRecord>;
}

const RIVAL_NPCS_LEADERBOARD: LeaderboardEntry[] = [
  { username: 'CipherQueen', level: 54, data: 2_840_000, rankTitle: 'Darknet Legend', prestigeCount: 2 },
  { username: 'ZeroCool_RU', level: 48, data: 1_490_000, rankTitle: 'Darknet Legend', prestigeCount: 1 },
  { username: 'GhostProtocol', level: 39, data: 780_500, rankTitle: 'Darknet Legend', prestigeCount: 1 },
  { username: 'Kira_Neon', level: 31, data: 412_900, rankTitle: 'Darknet Legend', prestigeCount: 0 },
  { username: 'RootKit_77', level: 24, data: 164_200, rankTitle: 'Cybercriminal', prestigeCount: 0 },
  { username: 'Byte Samurai', level: 18, data: 68_400, rankTitle: 'Cybercriminal', prestigeCount: 0 },
  { username: 'SynthRunner', level: 12, data: 19_800, rankTitle: 'Hacker', prestigeCount: 0 },
  { username: 'NullPointer', level: 7, data: 4_350, rankTitle: 'Hacker', prestigeCount: 0 },
  { username: ' PingFlood', level: 3, data: 820, rankTitle: 'Script Kiddie', prestigeCount: 0 },
];

let memoryDb: LocalDatabase | null = null;

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

export function pickMissionOffer(unlockedGrey: boolean): string[] {
  const badPool = [...MISSIONS_CONFIG.filter((m) => m.targetType === 'bad')].sort(() => Math.random() - 0.5);
  const goodPool = [...MISSIONS_CONFIG.filter((m) => m.targetType === 'good')].sort(() => Math.random() - 0.5);
  const neutralPool = [...MISSIONS_CONFIG.filter((m) => m.targetType === 'neutral')].sort(() => Math.random() - 0.5);
  const greyPool = [...MISSIONS_CONFIG.filter((m) => m.targetType === 'grey')].sort(() => Math.random() - 0.5);

  const selected: string[] = [
    ...badPool.slice(0, 3).map((m) => m.key),
    ...goodPool.slice(0, 3).map((m) => m.key),
    ...neutralPool.slice(0, 2).map((m) => m.key),
  ];

  if (unlockedGrey) {
    selected.unshift(...greyPool.map((m) => m.key));
  }

  return selected;
}

function createFreshRecord(user: VerifiedTelegramUser): StoredPlayerRecord {
  const nowIso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tgId: user.tgId,
    username: user.username,
    data: 0,
    crypto: 5, // DEFAULT: приветственные 5 Crypto
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
    availableMissionKeys: pickMissionOffer(false),
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

// In-memory rate-limit tracker for Supabase mode as well
const recentClickTimestamps = new Map<number, number>();
const missionOfferCache = new Map<number, { keys: string[]; refreshedAt: string }>();

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

  // Supabase PostgreSQL mode: call init_player RPC + fetch related tables
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
      .select('id, mission_key, target_type, target_name, started_at, finish_at, reward, rep_delta, heat_delta, crypto_reward')
      .eq('player_id', pid)
      .eq('status', 'active'),
    sb.from('achievements').select('key').eq('player_id', pid),
  ]);

  const cardsMap: Record<string, number> = {};
  for (const row of cardsRes.data ?? []) {
    cardsMap[row.card_key] = Number(row.level);
  }
  const teamList = (teamRes.data ?? []).map((r) => String(r.npc_key));
  const hasAnalyst = teamList.includes('analyst');

  let offer = missionOfferCache.get(user.tgId);
  if (!offer) {
    offer = { keys: pickMissionOffer(hasAnalyst), refreshedAt: new Date().toISOString() };
    missionOfferCache.set(user.tgId, offer);
  }

  const record: StoredPlayerRecord = {
    id: pid,
    tgId: Number(playerRow.tg_id),
    username: String(playerRow.username),
    data: Number(playerRow.data ?? 0),
    crypto: Number(playerRow.crypto ?? 5),
    energy: Number(playerRow.energy ?? BASE_MAX_ENERGY),
    energyUpdated: String(playerRow.energy_updated ?? new Date().toISOString()),
    heat: Number(playerRow.heat ?? 0),
    rep: Number(playerRow.rep ?? 0),
    prestigeCount: Number(playerRow.prestige_count ?? 0),
    clickBlockedUntil: playerRow.click_blocked_until ?? null,
    dailyStreak: Number(playerRow.daily_streak ?? 0),
    lastDailyClaim: playerRow.last_daily_claim ?? null,
    equippedSkin: String(playerRow.equipped_skin ?? 'default'),
    unlockedSkins: Array.isArray(playerRow.unlocked_skins) ? playerRow.unlocked_skins : ['default'],
    totalClicks: Number(playerRow.total_clicks ?? 0),
    totalMissions: Number(playerRow.total_missions ?? 0),
    lastPassiveClaim: String(playerRow.last_passive_claim ?? new Date().toISOString()),
    lastClickBatchAt: recentClickTimestamps.get(user.tgId) ?? 0,
    cards: cardsMap,
    team: teamList,
    activeMissions: (missionsRes.data ?? []).map((m) => ({
      id: String(m.id),
      missionKey: String(m.mission_key),
      targetName: String(m.target_name),
      targetType: m.target_type,
      startedAt: String(m.started_at),
      finishAt: String(m.finish_at),
      reward: Number(m.reward),
      repDelta: Number(m.rep_delta ?? 0),
      heatDelta: Number(m.heat_delta ?? 0),
      cryptoReward: Number(m.crypto_reward ?? 0),
    })),
    availableMissionKeys: offer.keys,
    missionsRefreshedAt: offer.refreshedAt,
    achievements: (achRes.data ?? []).map((a) => String(a.key)),
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

  const derived = computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
  });

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
      data: Math.floor(record.data * 100) / 100,
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

/**
 * Применяет пассивный доход, восстановление энергии, авто-обновление 15-мин витрины миссий,
 * проверку Heat > 100 и анлок достижений.
 */
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

  // 2. Пассивный доход с момента lastPassiveClaim
  let offlineEarned = 0;
  const lastPassiveMs = new Date(record.lastPassiveClaim).getTime();
  if (!Number.isNaN(lastPassiveMs) && nowMs > lastPassiveMs && derived.dataPerHour > 0) {
    const elapsedSec = Math.min(86400, (nowMs - lastPassiveMs) / 1000); // DEFAULT: кап оффлайн-накопления 24ч
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

  // 3. Авто-обновление витрины миссий каждые 15 минут (п. 4.3 ТЗ)
  const refreshedMs = new Date(record.missionsRefreshedAt).getTime();
  if (Number.isNaN(refreshedMs) || nowMs - refreshedMs >= 15 * 60 * 1000) {
    record.availableMissionKeys = pickMissionOffer(derived.unlockedGreyMissions);
    record.missionsRefreshedAt = nowIso;
  }

  // 4. Проверка штрафа Heat > 100 (п. 2 и 5.4 ТЗ):
  // теряется 10% Data, блокировка кликов на 60 сек, Heat сбрасывается на 50
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

  // Истечение блокировки кликов
  if (record.clickBlockedUntil && new Date(record.clickBlockedUntil).getTime() <= nowMs) {
    record.clickBlockedUntil = null;
  }

  // 5. Проверка достижений (+Crypto за каждую новую ачивку!)
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
  tryUnlock('desk_lvl_5', updatedDerived.level >= 5);
  tryUnlock('first_mission', record.totalMissions >= 1);
  tryUnlock('first_teammate', record.team.length >= 1);
  tryUnlock('white_hat_path', updatedDerived.alignment === 'white_hat' && record.rep >= 40);
  tryUnlock('black_hat_path', updatedDerived.alignment === 'black_hat' && record.heat >= 35);
  tryUnlock('desk_lvl_15', updatedDerived.level >= 15);
  tryUnlock('full_squad', record.team.length >= TEAM_CONFIG.length);
  tryUnlock('data_millionaire', record.data >= 100_000);
  tryUnlock('desk_lvl_30', updatedDerived.level >= 30);
  tryUnlock('global_hack_prestige', record.prestigeCount >= 1);

  if (newlyUnlocked.length > 0) {
    const sb = getSupabaseAdmin();
    for (const achKey of newlyUnlocked) {
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
      if (mode === 'supabase' && sb) {
        await sb
          .from('achievements')
          .upsert({ player_id: record.id, key: achKey }, { onConflict: 'player_id,key' });
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
// ПУБЛИЧНЫЕ МЕТОДЫ ИГРОВОГО ДВИЖКА ДЛЯ /api/*
// ============================================================================

export async function handleInitPlayer(user: VerifiedTelegramUser): Promise<ApiSyncResponse> {
  const { record, mode } = await loadPlayerRecord(user);
  const alerts: GameAlert[] = [];
  const { offlineEarned } = await syncTimeAndRules(record, mode, alerts);
  await savePlayerCore(record, mode);
  return buildResponse(record, mode, alerts, offlineEarned);
}

export async function handleClickBatch(
  user: VerifiedTelegramUser,
  requestedClicks: number
): Promise<ApiSyncResponse> {
  const { record, mode } = await loadPlayerRecord(user);
  const alerts: GameAlert[] = [];
  await syncTimeAndRules(record, mode, alerts);

  const nowMs = Date.now();

  // Проверка активного штрафа Heat > 100 (блокировка кликов на 60 сек)
  if (record.clickBlockedUntil && new Date(record.clickBlockedUntil).getTime() > nowMs) {
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  }

  // Anti-cheat (Шаг 4 и п. 5.1 ТЗ): лимит не более 30 кликов/сек + проверка Energy
  const rawCount = Math.max(0, Math.min(150, Math.floor(Number(requestedClicks) || 0)));
  let allowedByRate = rawCount;
  if (record.lastClickBatchAt > 0) {
    const elapsedSec = Math.max(0.25, (nowMs - record.lastClickBatchAt) / 1000);
    const maxPossible = Math.ceil(elapsedSec * 30);
    allowedByRate = Math.min(rawCount, maxPossible);
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
    record.energy = Math.max(0, record.energy - validClicks);
    record.data += validClicks * derived.clickPower;
    record.totalClicks += validClicks;
    record.lastClickBatchAt = nowMs;
  }

  await syncTimeAndRules(record, mode, alerts);
  await savePlayerCore(record, mode);
  return buildResponse(record, mode, alerts);
}

export async function handleBuyCard(
  user: VerifiedTelegramUser,
  cardKey: string
): Promise<ApiSyncResponse> {
  const card = CARDS_CONFIG.find((c) => c.key === cardKey);
  if (!card) {
    throw new Error('Карточка не найдена');
  }

  const { record, mode } = await loadPlayerRecord(user);
  const alerts: GameAlert[] = [];
  await syncTimeAndRules(record, mode, alerts);

  const currentLevel = record.cards[card.key] ?? 0;
  if (currentLevel >= MAX_CARD_LEVEL) {
    throw new Error('Достигнут максимальный 10-й уровень карточки');
  }

  const price = getCardPrice(card, currentLevel);
  if (record.data < price) {
    throw new Error(`Недостаточно Data (нужно ${price})`);
  }

  const prevDerived = computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
  });

  record.data -= price;
  const nextLevel = currentLevel + 1;
  record.cards[card.key] = nextLevel;

  // Если карточка из категории Darknet — начисляем Heat с учётом множителя
  if (card.heatOnBuy) {
    record.heat += Math.round(card.heatOnBuy * prevDerived.heatMultiplier);
  }

  // Если вырос Energy Max (категория Comfort) — добавляем прирост к текущей шкале
  if (card.energyMaxPerLevel) {
    record.energy = Math.min(5000, record.energy + card.energyMaxPerLevel);
  }

  if (mode === 'supabase') {
    const sb = getSupabaseAdmin();
    if (sb) {
      await sb
        .from('cards')
        .upsert(
          { player_id: record.id, card_key: card.key, level: nextLevel },
          { onConflict: 'player_id,card_key' }
        );
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
}

export async function handleHireNpc(
  user: VerifiedTelegramUser,
  npcKey: string
): Promise<ApiSyncResponse> {
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
      throw new Error(`Недостаточно Data для найма (нужно ${npc.costAmount})`);
    }
    record.data -= npc.costAmount;
  } else {
    if (record.rep < npc.costAmount) {
      throw new Error(`Недостаточно Репутации Rep (нужно ${npc.costAmount} Rep)`);
    }
    // Rep тратится на найм топ-команды (раздел 2 ТЗ: Rep -> На что тратить: найм топ-команды)
    record.rep -= npc.costAmount;
  }

  record.team.push(npc.key);

  if (npc.unlocksGreyMissions) {
    record.availableMissionKeys = pickMissionOffer(true);
    record.missionsRefreshedAt = new Date().toISOString();
    alerts.push({
      id: crypto.randomUUID(),
      type: 'info',
      title: '🟣 Секретные миссии открыты!',
      message: 'Аналитик добавил закрытые «серые» контракты с шансом дропа Crypto во вкладку «Взломы».',
    });
  }

  if (mode === 'supabase') {
    const sb = getSupabaseAdmin();
    if (sb) {
      await sb
        .from('team')
        .upsert({ player_id: record.id, npc_key: npc.key }, { onConflict: 'player_id,npc_key' });
    }
  }

  await syncTimeAndRules(record, mode, alerts);
  await savePlayerCore(record, mode);
  return buildResponse(record, mode, alerts);
}

export async function handleMissionAction(
  user: VerifiedTelegramUser,
  action: 'start' | 'claim' | 'skip' | 'refresh',
  payload: { missionKey?: string; missionId?: string }
): Promise<ApiSyncResponse> {
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
    record.availableMissionKeys = pickMissionOffer(derived.unlockedGreyMissions);
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
    if (cfg.targetType === 'grey' && !derived.unlockedGreyMissions) {
      throw new Error('Серые миссии требуют найма Analyst в разделе «Команда»');
    }
    if (record.activeMissions.some((m) => m.missionKey === cfg.key)) {
      throw new Error('Эта цель уже взламывается в данный момент');
    }

    // Расчёт финальной награды с учётом уровня игрока, престижа и ветки White Hat (×2 на легальные/Bad миссии, п. 5.4 ТЗ)
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

  // Завершение миссии (claim по истечении finishAt ИЛИ мгновенный пропуск таймера за 1 Crypto — п. 2 ТЗ)
  const idx = record.activeMissions.findIndex((m) => m.id === payload.missionId);
  if (idx === -1) {
    throw new Error('Активная миссия не найдена');
  }
  const mission = record.activeMissions[idx];

  if (action === 'skip') {
    if (record.crypto < 1) {
      throw new Error('Нужна 1 💎 Crypto для мгновенного пропуска таймера');
    }
    record.crypto -= 1;
  } else {
    const finishMs = new Date(mission.finishAt).getTime();
    if (Date.now() + 350 < finishMs) {
      throw new Error('Взлом ещё не завершён — дождитесь окончания таймера');
    }
  }

  record.activeMissions.splice(idx, 1);
  record.data += mission.reward;
  record.rep = Math.max(0, record.rep + mission.repDelta);
  record.heat = Math.max(0, record.heat + mission.heatDelta);
  record.crypto += mission.cryptoReward;
  record.totalMissions += 1;

  if (mode === 'supabase') {
    const sb = getSupabaseAdmin();
    if (sb) {
      await sb.from('missions').update({ status: 'completed' }).eq('id', mission.id);
    }
  }

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
}

export async function handleDailyBonus(user: VerifiedTelegramUser): Promise<ApiSyncResponse> {
  const { record, mode } = await loadPlayerRecord(user);
  const alerts: GameAlert[] = [];
  await syncTimeAndRules(record, mode, alerts);

  const nowMs = Date.now();
  if (record.lastDailyClaim) {
    const elapsedHours = (nowMs - new Date(record.lastDailyClaim).getTime()) / (1000 * 3600);
    if (elapsedHours < 20) {
      const waitHours = Math.ceil(20 - elapsedHours);
      throw new Error(`Ежедневный бонус уже получен! Следующий через ~${waitHours} ч.`);
    }
    if (elapsedHours > 48) {
      record.dailyStreak = 0; // Сброс серии при пропуске дня
    }
  }

  record.dailyStreak = (record.dailyStreak % 7) + 1;
  record.lastDailyClaim = new Date(nowMs).toISOString();

  // Награда растёт от 5 до 25 Crypto + пакет Data
  const cryptoBonus = 3 + record.dailyStreak * 2;
  const dataBonus = 150 * record.dailyStreak;
  record.crypto += cryptoBonus;
  record.data += dataBonus;

  alerts.push({
    id: crypto.randomUUID(),
    type: 'success',
    title: `🎁 День ${record.dailyStreak}/7 получен!`,
    message: `Начислено +${cryptoBonus} 💎 Crypto и +${dataBonus} Data!`,
  });

  await syncTimeAndRules(record, mode, alerts);
  await savePlayerCore(record, mode);
  return buildResponse(record, mode, alerts);
}

export async function handleSkinAction(
  user: VerifiedTelegramUser,
  action: 'buy_or_equip' | 'clear_lockdown',
  skinKey?: string
): Promise<ApiSyncResponse> {
  const { record, mode } = await loadPlayerRecord(user);
  const alerts: GameAlert[] = [];
  await syncTimeAndRules(record, mode, alerts);

  // DEFAULT: дополнительное применение Crypto — снятие 60-сек блокировки кликов за 2 Crypto (п. 2 ТЗ: пропуск таймеров)
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
      throw new Error('Этот скин открывается только через Global Hack Престиж на 50 уровне!');
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
}

export async function handleGlobalHackPrestige(
  user: VerifiedTelegramUser
): Promise<ApiSyncResponse> {
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

  if (derived.level < PRESTIGE_REQUIRED_LEVEL) {
    throw new Error(
      `Global Hack Престиж открывается на ${PRESTIGE_REQUIRED_LEVEL} уровне (сейчас ${derived.level} ур.)`
    );
  }

  // Пункт 5.5 ТЗ: сбрасывает карточки, команду, Data; даёт постоянный множитель ×2 (+100%), ачивку и скин стола!
  record.cards = {};
  record.team = [];
  record.activeMissions = [];
  record.data = 0;
  record.heat = 0;
  record.energy = BASE_MAX_ENERGY;
  record.prestigeCount += 1;

  if (!record.unlockedSkins.includes('prestige_omega')) {
    record.unlockedSkins.push('prestige_omega');
  }
  record.equippedSkin = 'prestige_omega';

  if (mode === 'supabase') {
    const sb = getSupabaseAdmin();
    if (sb) {
      await Promise.all([
        sb.from('cards').delete().eq('player_id', record.id),
        sb.from('team').delete().eq('player_id', record.id),
        sb.from('missions').delete().eq('player_id', record.id).eq('status', 'active'),
      ]);
    }
  }

  alerts.push({
    id: crypto.randomUUID(),
    type: 'achievement',
    title: `🌐 GLOBAL HACK #${record.prestigeCount} ВЫПОЛНЕН!`,
    message: `Постоянный множитель дохода теперь ×${Math.pow(2, record.prestigeCount)}! Разблокирован скин Omega Singularity.`,
  });

  await syncTimeAndRules(record, mode, alerts);
  await savePlayerCore(record, mode);
  return buildResponse(record, mode, alerts);
}

export async function handleGetLeaderboard(
  currentUser: VerifiedTelegramUser
): Promise<{ ok: true; entries: LeaderboardEntry[] }> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb.from('leaderboard').select('*').limit(100);
    if (!error && data) {
      const entries: LeaderboardEntry[] = data.map((row) => {
        const rankIdx = Math.max(1, Math.min(4, Number(row.rank ?? 1)));
        return {
          username: String(row.username),
          level: Number(row.level ?? 1),
          data: Math.round(Number(row.data ?? 0)),
          rankTitle: RANK_TITLES[rankIdx - 1]?.title ?? 'Script Kiddie',
          prestigeCount: Number(row.prestige_count ?? 0),
          isCurrentUser: row.username === currentUser.username,
        };
      });
      return { ok: true, entries };
    }
  }

  // Fallback Leaderboard: объединяем реальных игроков из local DB + кибер-соперников из симуляции
  const db = getLocalDb();
  const realEntries: LeaderboardEntry[] = Object.values(db.playersByTgId).map((rec) => {
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
