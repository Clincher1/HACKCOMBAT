import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS_CONFIG, ACHIEVEMENTS_BY_KEY } from '../../shared/achievements.config';
import {
  BASE_UPGRADES_CONFIG,
  CHIP_DAILY_CAP,
  CHIP_REWARD_PER_DAILY,
  CHIP_REWARD_PER_GREY_MISSION,
  CHIP_REWARD_PER_MISSION,
  getBaseUpgradeChipCost,
  getBaseUpgradeConfig,
  getBaseUpgradePrice,
} from '../../shared/base.config';
import {
  CARDS_CONFIG,
  CARD_TIERS,
  getCardPrice,
  getCardTierConfig,
  getMaxCardLevel,
  MAX_CARD_LEVEL,
} from '../../shared/cards.config';
import {
  BASE_MAX_ENERGY,
  computeDerivedStats,
  getPetFeedPrice,
  getPrestigeRequiredLevel,
  HEAT_LOCKDOWN_SECONDS,
  HEAT_PENALTY_DATA_LOSS_PCT,
  HEAT_PENALTY_THRESHOLD,
  HEAT_RESET_AFTER_PENALTY,
  ACTIVITY_HEARTBEAT_MAX_GAP_SEC,
  getGameDayBoundsMs,
  getGameDayKey,
  normalizePetState,
  OFFLINE_PASSIVE_RATE_MULT,
  OFFLINE_REQUIRED_ACTIVE_SECONDS,
  OFFLINE_TAP_CAP_SECONDS,
  OFFLINE_TAP_RATE_PER_SEC,
  RANK_TITLES,
  syncEnergy,
} from '../../shared/mechanics';
import {
  getHackOdds,
  getLevelProgress,
  getMissionRewardScale,
  getMissionXpAward,
  getTotalXpForLevel,
  HACK_OUTCOME_REWARD,
  rollHackOutcome,
} from '../../shared/hack.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import {
  getPetAffection,
  getEffectiveHunger,
  getPetBuffMultiplier,
  PETS_CONFIG,
} from '../../shared/pets.config';
import { SKINS_CONFIG } from '../../shared/skins.config';
import { BASE_THEMES } from '../../shared/themes.config';
import {
  DAILY_TASKS_PER_DAY,
  getDailyTaskDefinition,
  getDailyTaskDefinitions,
} from '../../shared/dailyTasks.config';
import { getProfileFrame, PROFILE_FRAMES } from '../../shared/profileFrames.config';
import {
  ACTIVE_SEASON_EVENT,
  getSeasonEventWindow,
  isSeasonEventLive,
} from '../../shared/seasonalEvent.config';
import { TEAM_CONFIG } from '../../shared/team.config';
import type {
  ActiveMissionInstance,
  ApiSyncResponse,
  DailyTaskKind,
  DailyTaskState,
  DerivedStats,
  SeasonEventState,
  GameAlert,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardSelf,
  LeaderboardSort,
  PlayerProgressStats,
  PlayerState,
  SkinCategory,
} from '../../shared/types';
import { getSupabaseAdmin } from './supabaseAdmin';
import { attributeReferral, payoutReferrals, qualifyInvitee } from './referrals';
import type { VerifiedTelegramUser } from './telegramAuth';

interface StoredPet {
  key: string;
  hunger: number;
  lastFedAt: string;
  feedCount: number;
}

export interface StoredPlayerRecord {
  id: string;
  tgId: number;
  username: string;
  data: number;
  crypto: number;
  chips: number;
  xp: number;
  energy: number;
  energyUpdated: string;
  heat: number;
  rep: number;
  prestigeCount: number;
  cardTier: number;
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
  pets: StoredPet[];
  baseUpgrades: Record<string, number>;
  stats: PlayerProgressStats;
  activeMissions: ActiveMissionInstance[];
  availableMissionKeys: string[];
  missionsRefreshedAt: string;
  achievements: string[];
}

const EMPTY_STATS: PlayerProgressStats = {
  tutorialTabs: [],
  tutorialOpens: 0,
  tabsVisited: [],
  petFeedings: 0,
  petHungrySeen: 0,
  missionFails: 0,
  missionTypes: [],
  greyMissions: 0,
  nightSessions: 0,
  earlySessions: 0,
  idleSessions: 0,
  maxSessionMinutes: 0,
  bestHeatEscape: 0,
  heatPenalties: 0,
  shopFreezeMinutes: 0,
  petFeedingStreakDays: 0,
  lastPetFeedDay: null,
  trackEventsToday: 0,
  trackEventsDay: null,
  hackSuccessByType: {},
  hackFailByType: {},
  totalXpEarned: 0,
  lastTapClaimAt: null,
  activeDayKey: null,
  activeSecondsToday: 0,
  missionRefreshSalt: 0,
  lastQualifiedDayKey: null,
  lastActiveAt: null,
  offlineGraceUsed: false,
};

/**
 * v3.6.5: валидация ключа слота. Возвращает ключ только если он существует
 * и относится к нужной категории, иначе undefined (слот пуст).
 */
function pickSkinKey(raw: unknown, category: SkinCategory): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const skin = SKINS_CONFIG.find((s) => s.key === raw);
  return skin && skin.category === category ? skin.key : undefined;
}

function normalizeDailyTaskState(raw: unknown): DailyTaskState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const dayKey = typeof src.dayKey === 'string' ? src.dayKey.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return undefined;

  const taskKeys = Array.isArray(src.taskKeys)
    ? Array.from(
        new Set(
          src.taskKeys
            .map((key) => String(key))
            .filter((key) => Boolean(getDailyTaskDefinition(key)))
        )
      ).slice(0, DAILY_TASKS_PER_DAY)
    : [];
  if (taskKeys.length !== DAILY_TASKS_PER_DAY) return undefined;

  const progress: Record<string, number> = {};
  const rawProgress =
    src.progress && typeof src.progress === 'object'
      ? (src.progress as Record<string, unknown>)
      : {};
  for (const key of taskKeys) {
    const target = getDailyTaskDefinition(key)?.target ?? 0;
    const value = Number(rawProgress[key]);
    progress[key] = Number.isFinite(value)
      ? Math.max(0, Math.min(target, Math.floor(value)))
      : 0;
  }

  const claimed = Array.isArray(src.claimed)
    ? Array.from(
        new Set(
          src.claimed
            .map((key) => String(key))
            .filter((key) => taskKeys.includes(key))
        )
      )
    : [];

  return { dayKey, taskKeys, progress, claimed };
}

function normalizeSeasonEventState(raw: unknown): SeasonEventState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const weekKey = typeof src.weekKey === 'string' ? src.weekKey.slice(0, 10) : '';
  if (src.eventKey !== ACTIVE_SEASON_EVENT.key || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    return undefined;
  }
  const rawProgress =
    src.progress && typeof src.progress === 'object'
      ? (src.progress as Record<string, unknown>)
      : {};
  const progress: Record<string, number> = {};
  for (const goal of ACTIVE_SEASON_EVENT.goals) {
    const value = Number(rawProgress[goal.key]);
    progress[goal.key] = Number.isFinite(value)
      ? Math.max(0, Math.min(goal.target, Math.floor(value)))
      : 0;
  }
  return {
    eventKey: ACTIVE_SEASON_EVENT.key,
    weekKey,
    progress,
    participationClaimed: src.participationClaimed === true,
    masteryClaimed: src.masteryClaimed === true,
  };
}

function pickProfileFrameKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const frame = getProfileFrame(raw);
  return frame.key === raw && frame.key !== 'default' ? frame.key : undefined;
}

function normalizeStats(raw: unknown): PlayerProgressStats {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, max = 1_000_000_000) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.floor(n)) : 0;
  };
  const numRecord = (v: unknown, allowed?: Set<string>) => {
    const out: Record<string, number> = {};
    if (!v || typeof v !== 'object') return out;
    for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
      if (allowed && !allowed.has(key)) continue;
      out[key] = num(value);
    }
    return out;
  };
  const strArr = (v: unknown, allowed?: Set<string>) => {
    if (!Array.isArray(v)) return [];
    const out = v
      .map((x) => String(x).slice(0, 32))
      .filter((x) => (allowed ? allowed.has(x) : true));
    return Array.from(new Set(out)).slice(0, 32);
  };
  return {
    tutorialTabs: strArr(src.tutorialTabs),
    tutorialOpens: num(src.tutorialOpens, 100_000),
    tabsVisited: strArr(src.tabsVisited),
    petFeedings: num(src.petFeedings),
    petHungrySeen: num(src.petHungrySeen),
    missionFails: num(src.missionFails),
    missionTypes: strArr(src.missionTypes, new Set(['bad', 'good', 'neutral', 'grey'])),
    greyMissions: num(src.greyMissions),
    nightSessions: num(src.nightSessions),
    earlySessions: num(src.earlySessions),
    idleSessions: num(src.idleSessions),
    maxSessionMinutes: num(src.maxSessionMinutes, 240),
    bestHeatEscape: num(src.bestHeatEscape, 100),
    heatPenalties: num(src.heatPenalties),
    shopFreezeMinutes: num(src.shopFreezeMinutes),
    petFeedingStreakDays: num(src.petFeedingStreakDays, 3650),
    lastPetFeedDay: typeof src.lastPetFeedDay === 'string' ? src.lastPetFeedDay.slice(0, 10) : null,
    trackEventsToday: num(src.trackEventsToday, 10_000),
    trackEventsDay: typeof src.trackEventsDay === 'string' ? src.trackEventsDay.slice(0, 10) : null,
    hackSuccessByType: numRecord(src.hackSuccessByType, new Set(['bad', 'good', 'neutral', 'grey'])),
    hackFailByType: numRecord(src.hackFailByType, new Set(['bad', 'good', 'neutral', 'grey'])),
    totalXpEarned: num(src.totalXpEarned, 1e12),
    lastTapClaimAt:
      typeof src.lastTapClaimAt === 'string' && !Number.isNaN(new Date(src.lastTapClaimAt).getTime())
        ? src.lastTapClaimAt
        : null,
    activeDayKey: typeof src.activeDayKey === 'string' ? src.activeDayKey.slice(0, 10) : null,
    dailyTasks: normalizeDailyTaskState(src.dailyTasks),
    seasonEvent: normalizeSeasonEventState(src.seasonEvent),
    unlockedProfileFrames: strArr(src.unlockedProfileFrames).filter((key) =>
      PROFILE_FRAMES.some((frame) => frame.key === key && frame.key !== 'default')
    ),
    equippedProfileFrame: pickProfileFrameKey(src.equippedProfileFrame),
    activeSecondsToday: num(src.activeSecondsToday, 86_400),
    chipsDayKey: typeof src.chipsDayKey === 'string' ? src.chipsDayKey.slice(0, 10) : null,
    chipsToday: num(src.chipsToday, 100_000),
    chipsCapNotifiedDay:
      typeof src.chipsCapNotifiedDay === 'string' ? src.chipsCapNotifiedDay.slice(0, 10) : null,
    missionRefreshSalt: num(src.missionRefreshSalt, 1_000_000_000),
    baseTheme:
      src.baseTheme === 'femme' ? 'femme' : src.baseTheme === 'classic' ? 'classic' : undefined,
    // v3.6.5: слоты интерфейса и аватара. Храним только известные ключи нужной
    // категории — мусор из jsonb не должен попадать в экипировку.
    equippedUi: pickSkinKey(src.equippedUi, 'ui'),
    equippedAvatar: pickSkinKey(src.equippedAvatar, 'avatar'),
    lastQualifiedDayKey:
      typeof src.lastQualifiedDayKey === 'string' ? src.lastQualifiedDayKey.slice(0, 10) : null,
    lastActiveAt:
      typeof src.lastActiveAt === 'string' && !Number.isNaN(new Date(src.lastActiveAt).getTime())
        ? src.lastActiveAt
        : null,
    offlineGraceUsed: src.offlineGraceUsed === true,
  };
}

function ensureDailyTasks(record: StoredPlayerRecord, dayKey: string): DailyTaskState {
  const current = record.stats.dailyTasks;
  const currentIsValid =
    current?.dayKey === dayKey &&
    current.taskKeys.length === DAILY_TASKS_PER_DAY &&
    current.taskKeys.every((key) => Boolean(getDailyTaskDefinition(key)));

  if (!currentIsValid) {
    const taskKeys = getDailyTaskDefinitions(record.tgId, dayKey).map((task) => task.key);
    record.stats.dailyTasks = {
      dayKey,
      taskKeys,
      progress: Object.fromEntries(taskKeys.map((key) => [key, 0])),
      claimed: [],
    };
  }

  const state = record.stats.dailyTasks;
  // The generator always creates a valid state; this fallback only protects
  // against a malformed legacy jsonb value arriving between normalization and
  // the first save.
  if (!state) {
    throw new Error('Не удалось подготовить ежедневные поручения');
  }
  for (const key of state.taskKeys) {
    const target = getDailyTaskDefinition(key)?.target ?? 0;
    state.progress[key] = Math.max(0, Math.min(target, Math.floor(Number(state.progress[key]) || 0)));
  }
  state.claimed = state.claimed.filter((key) => state.taskKeys.includes(key));
  return state;
}

function ensureSeasonEvent(record: StoredPlayerRecord, nowMs: number = Date.now()): SeasonEventState {
  const window = getSeasonEventWindow(nowMs);
  const current = record.stats.seasonEvent;
  if (
    !current ||
    current.eventKey !== ACTIVE_SEASON_EVENT.key ||
    current.weekKey !== window.weekKey
  ) {
    record.stats.seasonEvent = {
      eventKey: ACTIVE_SEASON_EVENT.key,
      weekKey: window.weekKey,
      progress: Object.fromEntries(ACTIVE_SEASON_EVENT.goals.map((goal) => [goal.key, 0])),
      participationClaimed: false,
      masteryClaimed: false,
    };
  }

  const state = record.stats.seasonEvent;
  if (!state) throw new Error('Не удалось подготовить сезонную операцию');
  for (const goal of ACTIVE_SEASON_EVENT.goals) {
    state.progress[goal.key] = Math.max(
      0,
      Math.min(goal.target, Math.floor(Number(state.progress[goal.key]) || 0))
    );
  }
  return state;
}

function incrementSeasonEventProgress(
  record: StoredPlayerRecord,
  kind: DailyTaskKind,
  amount: number
): void {
  const state = record.stats.seasonEvent;
  if (!state || amount <= 0) return;
  for (const goal of ACTIVE_SEASON_EVENT.goals) {
    if (goal.kind !== kind) continue;
    state.progress[goal.key] = Math.min(
      goal.target,
      (state.progress[goal.key] ?? 0) + Math.floor(amount)
    );
  }
}

function incrementDailyTaskProgress(
  record: StoredPlayerRecord,
  kind: DailyTaskKind,
  amount: number
): void {
  const state = record.stats.dailyTasks;
  if (!state || amount <= 0) return;
  for (const key of state.taskKeys) {
    const task = getDailyTaskDefinition(key);
    if (!task || task.kind !== kind) continue;
    state.progress[key] = Math.min(task.target, (state.progress[key] ?? 0) + Math.floor(amount));
  }
}

/**
 * v3.5 — ВЫДАЧА ЧИПОВ С СУТОЧНЫМ ЛИМИТОМ.
 *
 * Зачем лимит: Чипы открывают Тиры карточек (60/150/320) и всю Базу (705),
 * то есть это единственная «долгая» валюта. Без потолка человек с тремя слотами
 * миссий выбивал весь контент за вечер, и прогрессия теряла смысл.
 *
 * CHIP_DAILY_CAP был объявлен в конфиге и даже импортирован, но нигде не
 * применялся — то есть лимит существовал только на бумаге (в README).
 * Здесь он наконец работает: считается по игровым суткам (Москва, UTC+3),
 * тем же ключом, что и активность.
 *
 * Достижения награду за Чипы выдают В ОБХОД лимита: они одноразовые и редкие,
 * поэтому не превращаются в бесконечный фарм.
 */
function grantChips(
  record: StoredPlayerRecord,
  amount: number,
  dayKey: string
): { granted: number; capped: boolean } {
  if (record.stats.chipsDayKey !== dayKey) {
    record.stats.chipsDayKey = dayKey;
    record.stats.chipsToday = 0;
  }
  const used = Math.max(0, Math.floor(record.stats.chipsToday ?? 0));
  const left = Math.max(0, CHIP_DAILY_CAP - used);
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const granted = Math.min(requested, left);
  if (granted > 0) {
    record.chips += granted;
    record.stats.chipsToday = used + granted;
  }
  return { granted, capped: granted < requested };
}

/** Единая точка расчёта производных характеристик — чтобы сервер и UI считали одинаково. */
function deriveStats(record: StoredPlayerRecord, nowMs: number = Date.now()): DerivedStats {
  return computeDerivedStats({
    cards: record.cards,
    team: record.team,
    rep: record.rep,
    heat: record.heat,
    data: record.data,
    xp: record.xp,
    prestigeCount: record.prestigeCount,
    equippedSkin: record.equippedSkin,
    equippedUi: record.stats.equippedUi,
    equippedAvatar: record.stats.equippedAvatar,
    baseUpgrades: record.baseUpgrades,
    cardTier: record.cardTier,
    pets: record.pets.map((p) => {
      const cfg = PETS_CONFIG.find((c) => c.key === p.key);
      const hunger = cfg
        ? getEffectiveHunger(p.hunger, p.lastFedAt, cfg.hungerDecayPerHour, nowMs)
        : p.hunger;
      return {
        key: p.key,
        hunger: p.hunger,
        lastFedAt: p.lastFedAt,
        feedCount: p.feedCount,
        affection: getPetAffection(p.feedCount),
        effectiveHunger: hunger,
        isHungry: hunger < 30,
        buffMultiplier: cfg ? getPetBuffMultiplier(hunger, p.feedCount) : 0,
        canFeedAt: new Date(nowMs).toISOString(),
      };
    }),
    nowMs,
  });
}

// DEFAULT: Локальное dev/preview-хранилище (используется автоматически, если .env Supabase не задан)
const LOCAL_DB_PATH = path.resolve(process.cwd(), '.local-db.json');

export interface LocalDatabase {
  playersByTgId: Record<string, StoredPlayerRecord>;
  /** v3.4: леджер донатов (ключ — telegram_payment_charge_id). */
  donations?: Record<string, unknown>;
}

// XP у NPC выводим из кривой уровней: иначе в рейтинге «по опыту» они
// показывали бы 0 и проваливались в самый низ, хотя уровни у них высокие.
const RIVAL_NPCS_LEADERBOARD: LeaderboardEntry[] = (
  [
    { username: 'CipherQueen', level: 54, data: 2_840_000, rankTitle: 'Phantom Architect', prestigeCount: 2 },
    { username: 'ZeroCool_RU', level: 48, data: 1_490_000, rankTitle: 'Darknet Legend', prestigeCount: 1 },
    { username: 'GhostProtocol', level: 39, data: 780_500, rankTitle: 'Darknet Legend', prestigeCount: 1 },
    { username: 'Kira_Neon', level: 31, data: 412_900, rankTitle: 'Shadow Broker', prestigeCount: 0 },
    { username: 'RootKit_77', level: 24, data: 164_200, rankTitle: 'Cybercriminal', prestigeCount: 0 },
    { username: 'ByteSamurai', level: 18, data: 68_400, rankTitle: 'Cybercriminal', prestigeCount: 0 },
    { username: 'SynthRunner', level: 12, data: 19_800, rankTitle: 'Netrunner', prestigeCount: 0 },
    { username: 'NullPointer', level: 7, data: 4_350, rankTitle: 'Hacker', prestigeCount: 0 },
    { username: 'PingFlood', level: 3, data: 820, rankTitle: 'Script Kiddie', prestigeCount: 0 },
  ] as Omit<LeaderboardEntry, 'xp'>[]
).map((npc) => ({ ...npc, xp: getTotalXpForLevel(npc.level) }));

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
 * Доступ к тому же локальному JSON-хранилищу для других модулей (донаты).
 * Важно возвращать ОДИН И ТОТ ЖЕ объект, иначе запись донатов затрёт игроков.
 */
export function getLocalDatabase(): LocalDatabase {
  return getLocalDb();
}

export function persistLocalDatabase(): void {
  persistLocalDb();
}

/**
 * Детерминированно-случайная генерация 15-минутной витрины миссий.
 * ВАЖНО для безопасности: сид привязан к (tgId + 15-мин слот + счётчик ручных рефрешей),
 * чтобы на всех Serverless-инстансах Vercel витрина игрока была идентичной и никто не мог
 * запускать миссии вне своей витрины!
 */
export function pickMissionOffer(unlockedGrey: boolean, seed = 0, playerLevel = 99): string[] {
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

  // Контракты открываются по уровню игрока: не даём новичку сразу взять эндгейм-цель на миллионы
  const unlocked = MISSIONS_CONFIG.filter((m) => (m.minLevel ?? 1) <= playerLevel);
  const badPool = shuffle(unlocked.filter((m) => m.targetType === 'bad'));
  const goodPool = shuffle(unlocked.filter((m) => m.targetType === 'good'));
  const neutralPool = shuffle(unlocked.filter((m) => m.targetType === 'neutral'));
  const greyPool = shuffle(unlocked.filter((m) => m.targetType === 'grey'));

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

function computeOfferWindow(
  tgId: number,
  unlockedGrey: boolean,
  playerLevel = 99,
  refreshSalt = 0
): { keys: string[]; refreshedAt: string } {
  const windowMs = 15 * 60 * 1000;
  const windowIndex = Math.floor(Date.now() / windowMs);
  // Salt хранится в players.stats, а не в памяти Lambda: после холодного старта
  // и на другом Vercel-инстансе игрок получает тот же самый скан целей.
  const salt = Math.max(0, Math.floor(Number(refreshSalt) || 0));
  const seed = Math.abs(tgId * 31 + windowIndex * 7919 + salt * 104729);
  return {
    keys: pickMissionOffer(unlockedGrey, seed, playerLevel),
    refreshedAt: new Date(windowIndex * windowMs).toISOString(),
  };
}

function createFreshRecord(user: VerifiedTelegramUser): StoredPlayerRecord {
  const nowIso = new Date().toISOString();
  const offer = computeOfferWindow(user.tgId, false, 1);
  return {
    id: crypto.randomUUID(),
    tgId: user.tgId,
    username: user.username,
    // DEFAULT: стартовый капитал 250 Data — чтобы первые 2 улучшения покупались сразу,
    // а дальше уже начиналась честная (медленная) прогрессия.
    data: 250,
    crypto: 5,
    chips: 0,
    xp: 0,
    energy: BASE_MAX_ENERGY,
    energyUpdated: nowIso,
    heat: 0,
    rep: 0,
    prestigeCount: 0,
    cardTier: 1,
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
    pets: [],
    baseUpgrades: {},
    stats: { ...EMPTY_STATS, tutorialTabs: [], tabsVisited: [], missionTypes: [] },
    activeMissions: [],
    availableMissionKeys: offer.keys,
    missionsRefreshedAt: offer.refreshedAt,
    achievements: [],
  };
}

/** Человеческая формулировка шанса успеха для алертов. */
function describeOdds(chance: number): string {
  if (chance >= 0.8) return 'полная готовность';
  if (chance >= 0.55) return 'рискованно, но реально';
  return 'не готов — высокий риск провала';
}

const recentClickTimestamps = new Map<number, number>();

function safeNonNeg(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * v3.6.5: разовая раскладка старых сейвов по слотам.
 *
 * До этой версии все три категории писались в players.equipped_skin. Если
 * игрок когда-то надел скин интерфейса или аватар, в поле лежит НЕ скин стола.
 * Переносим его в свой слот, а стол откатываем на дефолтный — иначе игрок
 * после обновления остался бы без нормального стола.
 *
 * Идемпотентно: после переноса условие больше не выполняется.
 */
function migrateLegacyEquippedSkins(record: StoredPlayerRecord): void {
  const equipped = SKINS_CONFIG.find((s) => s.key === record.equippedSkin);
  if (!equipped || equipped.category === 'desk') return;
  record.stats = normalizeStats(record.stats);
  if (equipped.category === 'ui' && !record.stats.equippedUi) {
    record.stats.equippedUi = equipped.key;
  } else if (equipped.category === 'avatar' && !record.stats.equippedAvatar) {
    record.stats.equippedAvatar = equipped.key;
  }
  record.equippedSkin = 'default';
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
    } else {
      const rec = db.playersByTgId[key];
      if (user.username && rec.username !== user.username) {
        rec.username = user.username;
      }
      // Совместимость со старыми локальными сейвами (до 003-й миграции)
      rec.chips = Math.floor(safeNonNeg(rec.chips, 0));
      rec.xp = Math.floor(safeNonNeg(rec.xp, 0));
      rec.cardTier = Math.max(1, Math.min(4, Math.floor(safeNonNeg(rec.cardTier, 1)) || 1));
      rec.pets = Array.isArray(rec.pets) ? rec.pets : [];
      rec.baseUpgrades = rec.baseUpgrades && typeof rec.baseUpgrades === 'object' ? rec.baseUpgrades : {};
      rec.stats = normalizeStats(rec.stats);
    }
    migrateLegacyEquippedSkins(db.playersByTgId[key]);
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
  const [cardsRes, teamRes, missionsRes, achRes, petsRes, baseRes] = await Promise.all([
    sb.from('cards').select('card_key, level').eq('player_id', pid),
    sb.from('team').select('npc_key').eq('player_id', pid),
    sb
      .from('missions')
      .select(
        'id, mission_key, target_type, target_name, started_at, finish_at, reward, rep_delta, heat_delta, crypto_reward, xp_reward, success_chance, outcome'
      )
      .eq('player_id', pid)
      .eq('status', 'active'),
    sb.from('achievements').select('key').eq('player_id', pid),
    // Если миграция 003 ещё не применена — просто получим пустой список, игра не упадёт
    sb.from('pets').select('pet_key, hunger, last_fed_at, feed_count').eq('player_id', pid),
    sb.from('base_upgrades').select('upgrade_key, level').eq('player_id', pid),
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

  // Уровень для скана миссий считается по опыту (v3), а не по уровням карточек.
  const previewLevel = getLevelProgress(Math.floor(safeNonNeg(playerRow.xp, 0))).level;
  // Считываем stats один раз: в нём лежит версия ручного скана, общая для всех
  // serverless-инстансов. Раньше salt жил в памяти Lambda — из-за этого список
  // на экране и серверная проверка иногда расходились.
  const persistedStats = normalizeStats(playerRow.stats);
  const offer = computeOfferWindow(
    user.tgId,
    hasAnalyst,
    previewLevel,
    persistedStats.missionRefreshSalt
  );

  const petsList: StoredPet[] = (petsRes.data ?? [])
    .map((row) => {
      const cfg = PETS_CONFIG.find((p) => p.key === String(row.pet_key));
      if (!cfg) return null;
      return {
        key: cfg.key,
        hunger: Math.max(0, Math.min(100, Number(row.hunger) || 0)),
        lastFedAt: new Date(String(row.last_fed_at ?? new Date().toISOString())).toISOString(),
        feedCount: Math.floor(safeNonNeg(row.feed_count, 0)),
      } satisfies StoredPet;
    })
    .filter((p): p is StoredPet => p !== null);

  const baseUpgradesMap: Record<string, number> = {};
  for (const row of baseRes.data ?? []) {
    const cfg = getBaseUpgradeConfig(String(row.upgrade_key));
    if (!cfg) continue;
    const lvl = Math.max(0, Math.min(cfg.maxLevel, Math.floor(safeNonNeg(row.level, 0))));
    if (lvl > 0) baseUpgradesMap[cfg.key] = lvl;
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
    chips: Math.floor(safeNonNeg(playerRow.chips, 0)),
    xp: Math.floor(safeNonNeg(playerRow.xp, 0)),
    cardTier: Math.max(1, Math.min(4, Math.floor(safeNonNeg(playerRow.card_tier, 1)) || 1)),
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
    pets: petsList,
    baseUpgrades: baseUpgradesMap,
    stats: persistedStats,
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
      xpReward: Math.floor(safeNonNeg(m.xp_reward, 0)),
      successChance: Math.max(0, Math.min(1, Number(m.success_chance) || 0)),
      outcome: m.outcome === 'success' || m.outcome === 'fail' ? m.outcome : ('partial' as const),
    })),
    availableMissionKeys: offer.keys,
    missionsRefreshedAt: offer.refreshedAt,
    achievements: Array.from(new Set((achRes.data ?? []).map((a) => String(a.key)))),
  };

  migrateLegacyEquippedSkins(record);
  return { record, mode: 'supabase' };
}

async function savePlayerCore(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  expectedXp?: number
): Promise<void> {
  recentClickTimestamps.set(record.tgId, record.lastClickBatchAt);
  // Защита от переполнения и отрицательных значений перед записью в БД
  record.data = Math.max(0, Math.floor(safeNonNeg(record.data, 0) * 100) / 100);
  record.crypto = Math.max(0, Math.floor(safeNonNeg(record.crypto, 0)));
  record.rep = Math.max(0, Math.floor(safeNonNeg(record.rep, 0)));
  record.heat = Math.max(0, Math.floor(safeNonNeg(record.heat, 0)));
  record.totalClicks = Math.max(0, Math.floor(safeNonNeg(record.totalClicks, 0)));
  record.totalMissions = Math.max(0, Math.floor(safeNonNeg(record.totalMissions, 0)));
  record.chips = Math.max(0, Math.floor(safeNonNeg(record.chips, 0)));
  record.xp = Math.max(0, Math.floor(safeNonNeg(record.xp, 0)));
  record.cardTier = Math.max(1, Math.min(4, Math.floor(safeNonNeg(record.cardTier, 1)) || 1));
  record.stats = normalizeStats(record.stats);

  const derived = deriveStats(record);

  record.energy = Math.max(0, Math.min(derived.maxEnergy, Math.floor(safeNonNeg(record.energy, 0))));

  if (mode === 'memory-fallback') {
    const db = getLocalDb();
    db.playersByTgId[String(record.tgId)] = record;
    persistLocalDb();
    return;
  }

  const sb = getSupabaseAdmin();
  if (!sb) return;

  let updateQuery = sb
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
      chips: record.chips,
      xp: record.xp,
      card_tier: record.cardTier,
      stats: record.stats,
    })
    .eq('id', record.id);

  // Daily-task claim uses the XP value as a compare-and-swap guard. Two
  // serverless instances cannot both award the same task from one snapshot.
  if (expectedXp !== undefined) {
    updateQuery = updateQuery.eq('xp', expectedXp);
  }
  const { data: updatedRows, error } = await updateQuery.select('id');

  if (error) {
    throw new Error(`Supabase update player error: ${error.message}`);
  }
  if (expectedXp !== undefined && (!updatedRows || updatedRows.length === 0)) {
    throw new Error('Ежедневное поручение уже обрабатывается в другой сессии — обнови экран');
  }

  // Питомцы и «База» живут в отдельных таблицах: сохраняем только при изменениях,
  // ошибки из-за ещё не применённой миграции 003 не должны ломать игровую сессию.
  try {
    if (record.pets.length > 0) {
      await sb.from('pets').upsert(
        record.pets.map((p) => ({
          player_id: record.id,
          pet_key: p.key,
          hunger: Math.max(0, Math.min(100, p.hunger)),
          last_fed_at: p.lastFedAt,
          feed_count: Math.max(0, Math.floor(p.feedCount)),
        })),
        { onConflict: 'player_id,pet_key' }
      );
    }
    const baseRows = Object.entries(record.baseUpgrades)
      .filter(([, lvl]) => Number.isFinite(lvl) && lvl > 0)
      .map(([key, lvl]) => ({
        player_id: record.id,
        upgrade_key: key,
        level: Math.max(1, Math.min(15, Math.floor(lvl))),
      }));
    if (baseRows.length > 0) {
      await sb.from('base_upgrades').upsert(baseRows, { onConflict: 'player_id,upgrade_key' });
    }
  } catch {
    // таблицы появятся после миграции 003
  }
}

async function syncTimeAndRules(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[]
): Promise<{ offlineEarned: number; offlineTaps: number }> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const derived = deriveStats(record);

  // 1. Восстановление энергии (базово 1 Energy / 3 сек, «Кофемашина» ускоряет)
  const syncedEnergy = syncEnergy(
    record.energy,
    record.energyUpdated,
    derived.maxEnergy,
    nowMs,
    derived.energyRegenPerSec
  );
  record.energy = syncedEnergy.energy;
  record.energyUpdated = syncedEnergy.updatedAtIso;

  // ==========================================================================
  // 2. ОФФЛАЙН-ДОХОД (v3.2)
  // --------------------------------------------------------------------------
  // Правило: копилка работает только за те сутки, в которые набралось
  // OFFLINE_REQUIRED_ACTIVE_SECONDS (8 минут) реальной игры.
  // Не доиграл день — за него не платят, и следующий день тоже пустой,
  // «долг впрок» не растёт: точка отсчёта просто переезжает на «сейчас».
  // Сам оффлайн даёт ТОЛЬКО Data: XP, Crypto и чипы начисляются лишь в игре.
  // ==========================================================================
  const prevDayKey = record.stats.activeDayKey ?? null;
  const qualifiedDayKey = record.stats.lastQualifiedDayKey ?? null;
  // Старым сейвам (играли до v3.2, счётчиков ещё нет) прощаем один раз,
  // чтобы не отнять уже накопленную копилку. Новый игрок права на оффлайн
  // не имеет, пока реально не наиграет свои 8 минут.
  const isLegacyVeteran =
    qualifiedDayKey === null &&
    record.stats.offlineGraceUsed !== true &&
    (record.totalClicks > 0 || record.totalMissions > 0 || record.xp > 0 || record.stats.totalXpEarned > 0);
  // Единственный день, за который сейчас можно платить.
  const paidDayKey = isLegacyVeteran ? getGameDayKey(nowMs) : qualifiedDayKey;
  if (isLegacyVeteran) record.stats.offlineGraceUsed = true;

  /**
   * Отрезок [from, to] внутри «оплаченного» дня, который ещё не оплачен.
   * Всё, что случилось вне закрытого 8 минутами дня, не оплачивается никогда.
   */
  const paidWindow = (sinceMs: number): { from: number; to: number } | null => {
    if (!paidDayKey) return null;
    const bounds = getGameDayBoundsMs(paidDayKey);
    const from = Math.max(sinceMs, bounds.start);
    const to = Math.min(nowMs, bounds.end);
    return to > from ? { from, to } : null;
  };

  // 2.1. Пассивный доход с карточек: ставка ×0.5, кап — offlineCapSeconds.
  let offlineEarned = 0;
  const lastPassiveMs = new Date(record.lastPassiveClaim).getTime();
  const passiveWindow =
    Number.isNaN(lastPassiveMs) || derived.dataPerHour <= 0 ? null : paidWindow(lastPassiveMs);
  if (passiveWindow) {
    const elapsedSec = Math.min(derived.offlineCapSeconds, (passiveWindow.to - passiveWindow.from) / 1000);
    if (elapsedSec >= 2) {
      const ratePerHour = derived.dataPerHour * OFFLINE_PASSIVE_RATE_MULT;
      const earned = Math.floor(((ratePerHour / 3600) * elapsedSec) * 10) / 10;
      if (earned > 0) {
        record.data += earned;
        if (elapsedSec >= 45) offlineEarned += Math.round(earned);
      }
    }
  }
  // Точку отсчёта двигаем всегда: неоплаченные часы «в долг» не копятся.
  record.lastPassiveClaim = nowIso;

  // 2.2. «Фоновая копилка тапов»: 6 тапов/мин (0.1 в секунду) × сила клика, кап 8 часов.
  let offlineTaps = 0;
  const lastTapIso = record.stats.lastTapClaimAt ?? null;
  const lastTapMs = lastTapIso ? new Date(lastTapIso).getTime() : nowMs;
  const tapWindow = !lastTapIso || Number.isNaN(lastTapMs) ? null : paidWindow(lastTapMs);
  if (tapWindow && derived.clickPower > 0) {
    const tapSec = Math.min(OFFLINE_TAP_CAP_SECONDS, (tapWindow.to - tapWindow.from) / 1000);
    const taps = Math.floor(tapSec * OFFLINE_TAP_RATE_PER_SEC);
    if (taps > 0) {
      const tapEarned = Math.floor(taps * derived.clickPower * 10) / 10;
      if (tapEarned > 0) {
        record.data += tapEarned;
        if (tapSec >= 45) {
          offlineTaps = taps;
          offlineEarned += Math.round(tapEarned);
        }
      }
    }
  }
  record.stats.lastTapClaimAt = nowIso;

  // 2.3. Если оффлайн не заплатил из-за короткой игры — честно объясняем почему.
  const missedPayout =
    !paidWindow(lastPassiveMs) &&
    !Number.isNaN(lastPassiveMs) &&
    nowMs - lastPassiveMs > 10 * 60 * 1000 &&
    !isLegacyVeteran;
  if (missedPayout) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'warning',
      title: '⏸ Оффлайн-доход не начислен',
      message:
        `За прошлые сутки не набралось ${Math.round(OFFLINE_REQUIRED_ACTIVE_SECONDS / 60)} минут игры. ` +
        'Поиграйте сегодня — и копилка снова заработает.',
    });
  }

  // ==========================================================================
  // 3. УЧЁТ АКТИВНОГО ВРЕМЕНИ ЗА ТЕКУЩИЙ ДЕНЬ (v3.2)
  // --------------------------------------------------------------------------
  // Активность = непрерывная сессия. Клиент обращается к серверу минимум раз в
  // 30 секунд, поэтому «разрыв ≤ 45 с» означает, что человек действительно в игре.
  // Сутки считаем по Москве: смена дня обнуляет счётчик.
  // ==========================================================================
  const nowDayKey = getGameDayKey(nowMs);
  const prevActiveMs = record.stats.lastActiveAt ? new Date(record.stats.lastActiveAt).getTime() : 0;
  if (prevDayKey !== nowDayKey) {
    record.stats.activeDayKey = nowDayKey;
    record.stats.activeSecondsToday = 0;
  }
  // Тот же игровой день, что и у активности: лимит Чипов обнуляется.
  if (record.stats.chipsDayKey !== nowDayKey) {
    record.stats.chipsDayKey = nowDayKey;
    record.stats.chipsToday = 0;
  }
  // Ежедневные поручения используют те же московские сутки, что и активность
  // и лимит Чипов. Создание/сброс происходит только на сервере.
  ensureDailyTasks(record, nowDayKey);
  // Сезонная операция живёт ровно в согласованном окне 27.10 09:00 →
  // 03.11 09:00 по Москве; после окончания новый state не создаётся.
  if (isSeasonEventLive(nowMs)) ensureSeasonEvent(record, nowMs);
  if (prevActiveMs > 0 && nowMs > prevActiveMs && nowMs - prevActiveMs <= ACTIVITY_HEARTBEAT_MAX_GAP_SEC * 1000) {
    const gainedSec = (nowMs - prevActiveMs) / 1000;
    record.stats.activeSecondsToday = Math.min(86_400, (record.stats.activeSecondsToday ?? 0) + gainedSec);
  }
  if ((record.stats.activeSecondsToday ?? 0) >= OFFLINE_REQUIRED_ACTIVE_SECONDS) {
    record.stats.lastQualifiedDayKey = nowDayKey;
  }
  record.stats.lastActiveAt = nowIso;

  // ==========================================================================
  // 3b. РЕФЕРАЛЬНАЯ ПРОГРАММА (v3.5)
  // --------------------------------------------------------------------------
  // Правим ТОЛЬКО свою запись: приглашённый получает свой маленький бонус,
  // пригласивший — свои награды на своём же синке (см. api/_lib/referrals.ts).
  // Так нет записи в чужую строку под чужим мьютексом.
  // ==========================================================================
  await qualifyInvitee(record, derived.level);
  const refPayout = await payoutReferrals(record, derived.level, derived.dataPerHour);
  if (refPayout.count > 0) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🔗 Друг засчитан: +${Math.round(refPayout.xp)} XP`,
      message:
        `Тебе начислено ${Math.round(refPayout.data).toLocaleString('ru-RU')} Data за ` +
        `${refPayout.count} приглашённ${refPayout.count === 1 ? 'ого' : 'ых'}. Спасибо, что зовёшь людей!`,
    });
  }

  // 4. Авто-обновление витрины миссий каждые 15 минут
  const refreshedMs = new Date(record.missionsRefreshedAt).getTime();
  if (Number.isNaN(refreshedMs) || nowMs - refreshedMs >= 15 * 60 * 1000) {
    const nextOffer = computeOfferWindow(
      record.tgId,
      derived.unlockedGreyMissions,
      derived.level,
      record.stats.missionRefreshSalt
    );
    record.availableMissionKeys = nextOffer.keys;
    record.missionsRefreshedAt = nowIso;
  }

  // 5. Проверка штрафа Heat > 100
  if (record.heat > HEAT_PENALTY_THRESHOLD) {
    const lostData = Math.floor(record.data * HEAT_PENALTY_DATA_LOSS_PCT);
    record.data = Math.max(0, record.data - lostData);
    record.heat = HEAT_RESET_AFTER_PENALTY;
    record.clickBlockedUntil = new Date(nowMs + HEAT_LOCKDOWN_SECONDS * 1000).toISOString();
    record.stats.heatPenalties += 1;
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

  // 5.1. Фиксируем, что игрок видел голодного питомца (секретная ачивка «Ну Где Ты Был»)
  if (record.pets.length > 0) {
    const hungry = record.pets.some((pet) => {
      const cfg = PETS_CONFIG.find((c) => c.key === pet.key);
      if (!cfg) return false;
      return getEffectiveHunger(pet.hunger, pet.lastFedAt, cfg.hungerDecayPerHour, nowMs) < 30;
    });
    if (hungry) record.stats.petHungrySeen = Math.min(1_000_000, record.stats.petHungrySeen + 1);
  }

  // 6. Авто-кормление питомцев (открывается покупкой «Авто-кормушки» на Базе)
  let autoFed = 0;
  if (derived.autoFeedEnabled && record.pets.length > 0) {
    for (const pet of record.pets) {
      const cfg = PETS_CONFIG.find((c) => c.key === pet.key);
      if (!cfg) continue;
      const hunger = getEffectiveHunger(pet.hunger, pet.lastFedAt, cfg.hungerDecayPerHour, nowMs);
      if (hunger >= 60) continue;
      const cooldownMs = cfg.feedCooldownHours * 3_600_000;
      if (nowMs - new Date(pet.lastFedAt).getTime() < cooldownMs) continue;
      const price = getPetFeedPrice(cfg, derived.dataPerHour, derived.feedDiscountPct);
      if (record.data < price) continue;
      record.data -= price;
      pet.hunger = Math.min(100, Math.round((hunger + cfg.feedHunger) * 10) / 10);
      pet.lastFedAt = nowIso;
      pet.feedCount += 1;
      record.stats.petFeedings += 1;
      autoFed += 1;
    }
    if (autoFed > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: '🍽️ Авто-кормушка сработала',
        message: `Питомцы покормлены автоматически (${autoFed} шт.). Бафы снова активны!`,
      });
    }
  }

  // 7. Отслеживаем «грань» Heat для секретной ачивки «На Лезвии»
  if (record.heat > record.stats.bestHeatEscape && record.heat <= HEAT_PENALTY_THRESHOLD) {
    record.stats.bestHeatEscape = Math.max(0, Math.floor(record.heat));
  }

  // 8. Проверка всех 80 достижений (автоматически доначисляет новые ачивки существующим игрокам!)
  const updatedDerived = deriveStats(record, nowMs);

  const newlyUnlocked: string[] = [];
  const tryUnlock = (key: string, condition: boolean) => {
    if (condition && !record.achievements.includes(key)) {
      record.achievements.push(key);
      newlyUnlocked.push(key);
    }
  };

  const ownedCards = Object.values(record.cards);
  const maxCardLvl = ownedCards.length > 0 ? Math.max(...ownedCards) : 0;
  const baseLevels = Object.values(record.baseUpgrades);
  const baseOwned = baseLevels.filter((lvl) => lvl > 0).length;
  const maxBaseLevel = baseLevels.length > 0 ? Math.max(...baseLevels) : 0;
  const allCardsAt = (min: number) =>
    CARDS_CONFIG.every((card) => (record.cards[card.key] ?? 0) >= min);
  const maxAffection =
    record.pets.length > 0 ? Math.max(...record.pets.map((p) => getPetAffection(p.feedCount))) : 0;
  const stats = record.stats;

  tryUnlock('first_boot', record.totalClicks >= 25);
  tryUnlock('first_upgrade', updatedDerived.totalCardLevels >= 1);
  tryUnlock('first_mission', record.totalMissions >= 1);
  tryUnlock('first_teammate', record.team.length >= 1);
  tryUnlock('first_pet', record.pets.length >= 1);
  tryUnlock('first_feed', stats.petFeedings >= 1);
  tryUnlock('first_base', baseOwned >= 1);
  tryUnlock(
    'first_chip',
    record.chips > 0 || baseOwned > 0 || record.cardTier > 1 || record.totalMissions >= 1
  );

  tryUnlock('desk_lvl_5', updatedDerived.level >= 5);
  tryUnlock('desk_lvl_10', updatedDerived.level >= 10);
  tryUnlock('desk_lvl_15', updatedDerived.level >= 15);
  tryUnlock('triple_slots_20', updatedDerived.level >= 20);
  tryUnlock('desk_lvl_25', updatedDerived.level >= 25);
  tryUnlock('desk_lvl_30', updatedDerived.level >= 30);
  tryUnlock('level_40', updatedDerived.level >= 40);
  tryUnlock('level_50', updatedDerived.level >= 50);
  tryUnlock('level_60', updatedDerived.level >= 60);

  tryUnlock('card_first_max', maxCardLvl >= updatedDerived.maxCardLevel);
  tryUnlock('tier_2', record.cardTier >= 2);
  tryUnlock('tier_3', record.cardTier >= 3);
  tryUnlock('tier_4', record.cardTier >= 4);
  tryUnlock('card_level_15', maxCardLvl >= 15);
  tryUnlock('card_level_20', maxCardLvl >= 20);
  tryUnlock('card_level_25', maxCardLvl >= 25);
  tryUnlock('cards_all_5', allCardsAt(5));
  tryUnlock('cards_all_10', allCardsAt(10));
  tryUnlock('cards_all_15', allCardsAt(15));

  tryUnlock('chips_50', record.chips >= 50);
  tryUnlock('chips_250', record.chips >= 250);
  tryUnlock('chips_1000', record.chips >= 1000);
  tryUnlock('chips_no_spend', record.chips >= 500 && record.cardTier === 1);

  tryUnlock('full_squad', record.team.length >= 6);
  tryUnlock('elite_syndicate_8', record.team.length >= TEAM_CONFIG.length);
  tryUnlock('grey_missions_10', stats.greyMissions >= 10);

  tryUnlock('missions_veteran_15', record.totalMissions >= 15);
  tryUnlock('missions_master_50', record.totalMissions >= 50);
  tryUnlock('missions_100', record.totalMissions >= 100);
  tryUnlock('missions_250', record.totalMissions >= 250);
  tryUnlock('mission_fail', stats.missionFails >= 1);
  tryUnlock('missions_all_types', stats.missionTypes.length >= 4);

  tryUnlock('click_sprinter_500', record.totalClicks >= 500);
  tryUnlock('click_master_2500', record.totalClicks >= 2_500);
  tryUnlock('click_legend_10k', record.totalClicks >= 10_000);
  tryUnlock('click_25k', record.totalClicks >= 25_000);
  tryUnlock('click_50k', record.totalClicks >= 50_000);

  tryUnlock('data_millionaire', record.data >= 100_000);
  tryUnlock('true_millionaire_1m', record.data >= 1_000_000);
  tryUnlock('data_tycoon_25m', record.data >= 25_000_000);
  tryUnlock('data_100m', record.data >= 100_000_000);
  tryUnlock('crypto_baron_500', record.crypto >= 500);
  tryUnlock('energy_overcharge_2500', updatedDerived.maxEnergy >= 2_500);

  tryUnlock('white_hat_path', updatedDerived.alignment === 'white_hat' && record.rep >= 40);
  tryUnlock('black_hat_path', updatedDerived.alignment === 'black_hat' && record.heat >= 35);
  tryUnlock('rep_guardian_250', record.rep >= 250);
  tryUnlock('heat_edge', stats.bestHeatEscape >= 95 && stats.bestHeatEscape < 100);
  tryUnlock('clean_hands_20', updatedDerived.level >= 20 && stats.bestHeatEscape === 0);

  tryUnlock('global_hack_prestige', record.prestigeCount >= 1);
  tryUnlock('global_hack_prestige_2', record.prestigeCount >= 2);
  tryUnlock('prestige_3', record.prestigeCount >= 3);

  tryUnlock('all_pets', record.pets.length >= PETS_CONFIG.length);
  tryUnlock('pet_feed_50', stats.petFeedings >= 50);
  tryUnlock('pet_streak_7', stats.petFeedingStreakDays >= 7);
  tryUnlock('pet_max_affection', maxAffection >= 10);

  tryUnlock('base_all_bought', baseOwned >= BASE_UPGRADES_CONFIG.length);
  tryUnlock('base_max_one', maxBaseLevel >= 10);
  tryUnlock(
    'base_all_max',
    BASE_UPGRADES_CONFIG.every((u) => (record.baseUpgrades[u.key] ?? 0) >= u.maxLevel)
  );

  tryUnlock('skins_3', record.unlockedSkins.length >= 3);
  tryUnlock('skins_all', record.unlockedSkins.length >= SKINS_CONFIG.length);

  tryUnlock('tutorial_all_tabs', stats.tutorialTabs.length >= 5);
  tryUnlock('tutorial_reread_10', stats.tutorialOpens >= 10);
  tryUnlock('tabs_tourist', stats.tabsVisited.length >= 5);
  tryUnlock('night_owl', stats.nightSessions >= 1);
  tryUnlock('early_bird', stats.earlySessions >= 1);
  tryUnlock('coffee_break', stats.idleSessions >= 1);
  tryUnlock('session_30m', stats.maxSessionMinutes >= 30);
  tryUnlock('shop_freeze_30', stats.shopFreezeMinutes >= 30);
  tryUnlock('stubborn_50', updatedDerived.level >= 50 && record.prestigeCount === 0);
  tryUnlock('pet_hungry', stats.petHungrySeen >= 1);
  tryUnlock('zoo_keeper_30', stats.petFeedings >= 30);
  tryUnlock('heat_survivor', stats.heatPenalties >= 1 && stats.bestHeatEscape >= 1);

  if (newlyUnlocked.length > 0) {
    const sb = getSupabaseAdmin();
    for (const achKey of newlyUnlocked) {
      let granted = true;
      if (mode === 'supabase' && sb) {
        // Атомарная вставка достижения с ignoreDuplicates защищает от двойного начисления награды при гонках!
        const { data: insertedRows, error: achErr } = await sb
          .from('achievements')
          .upsert({ player_id: record.id, key: achKey }, { onConflict: 'player_id,key', ignoreDuplicates: true })
          .select('id');
        if (achErr || !insertedRows || insertedRows.length === 0) {
          granted = false;
        }
      }
      if (granted) {
        const cfg = ACHIEVEMENTS_BY_KEY[achKey];
        if (cfg) {
          record.crypto += cfg.cryptoReward;
          if (cfg.chipReward) record.chips += cfg.chipReward;
          if (cfg.dataReward) record.data += cfg.dataReward;
          const extra: string[] = [];
          if (cfg.chipReward) extra.push(`+${cfg.chipReward} ⚙️ Чипов`);
          if (cfg.dataReward) extra.push(`+${cfg.dataReward.toLocaleString('ru-RU')} Data`);
          alerts.push({
            id: crypto.randomUUID(),
            type: 'achievement',
            title: cfg.secret ? `🏆 Секретное достижение: ${cfg.title}` : `🏆 Достижение: ${cfg.title}`,
            message:
              `+${cfg.cryptoReward} 💎 Crypto` +
              (extra.length > 0 ? `, ${extra.join(', ')}` : '') +
              ' начислено на счёт!',
          });
        }
      }
    }
  }

  return { offlineEarned, offlineTaps };
}

function buildResponse(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[] = [],
  offlineEarned = 0,
  offlineTaps = 0,
  appliedClicks?: number
): ApiSyncResponse {
  const derived = deriveStats(record);

  const nowMs = Date.now();
  const petStates = record.pets
    .map((pet) => {
      const cfg = PETS_CONFIG.find((c) => c.key === pet.key);
      if (!cfg) return null;
      return normalizePetState(
        cfg,
        { hunger: pet.hunger, lastFedAt: pet.lastFedAt, feedCount: pet.feedCount },
        nowMs
      );
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const player: PlayerState = {
    id: record.id,
    tgId: record.tgId,
    username: record.username,
    data: Math.round(record.data * 10) / 10,
    crypto: record.crypto,
    chips: record.chips,
    xp: record.xp,
    cardTier: record.cardTier,
    pets: petStates,
    baseUpgrades: record.baseUpgrades,
    stats: record.stats,
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
    offlineTaps: offlineTaps > 0 ? offlineTaps : undefined,
    alerts: alerts.length > 0 ? alerts : undefined,
    appliedClicks,
    storageMode: mode,
  };
}

// ============================================================================
// ЗАЩИЩЁННЫЕ ПУБЛИЧНЫЕ МЕТОДЫ ИГРОВОГО ДВИЖКА ДЛЯ /api/*
// ============================================================================

export async function handleInitPlayer(
  user: VerifiedTelegramUser,
  clientIp?: string
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    // Привязка «кто позвал» — до синка, пока аккаунт ещё нулевой.
    // Код берётся из подписанного initData, повторный вызов безопасен.
    await attributeReferral(record, user.startParam, clientIp);
    const { offlineEarned, offlineTaps } = await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, offlineEarned, offlineTaps);
  });
}

/**
 * Применяет к записи пачку кликов с серверным анти-читом (v3.3).
 * Используется и самим /api/click, и «хвостом» кликов внутри покупок:
 * так между тапом и покупкой нет второго сетевого круга, а сервер видит
 * актуальный баланс и не отвечает «Недостаточно Data» на устаревшие данные.
 *
 * Возвращает, сколько кликов реально зачтено (клиент досылает остаток).
 */
async function applyPendingClicks(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  requestedClicks: number,
  /**
   * Минимальный «человеческий» всплеск. Клиент прикладывает к покупке пачку
   * не больше 20 кликов (CLICK_MAX_BATCH), поэтому для покупок разрешаем их
   * целиком — иначе игрок, тапнувший 20 раз и сразу купивший, получал бы
   * ложное «Недостаточно Data». Доход всё равно ограничен энергией.
   */
  minBurst = 1
): Promise<number> {
  const count = Math.floor(Number(requestedClicks) || 0);
  if (count <= 0) return 0;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  if (record.clickBlockedUntil && new Date(record.clickBlockedUntil).getTime() > nowMs) {
    return 0;
  }

  // Серверный Anti-Cheat кликов (v3.1 — дружелюбнее к живому пальцу):
  // 1) не более 60 кликов в одной пачке (клиент отправляет по 20);
  // 2) не более 30 кликов/сек — это вдвое быстрее, чем реально тапает человек,
  //    но всё ещё не даёт скрипту «бесконечный» поток;
  // 3) главный ограничитель — энергия: каждый клик её сжигает, запас не бесконечен.
  const rawCount = Math.max(0, Math.min(60, count));
  let allowedByRate = rawCount;
  if (record.lastClickBatchAt > 0) {
    const elapsedSec = Math.max(0.15, (nowMs - record.lastClickBatchAt) / 1000);
    const maxHumanBurst = Math.max(minBurst, Math.ceil(elapsedSec * 30));
    allowedByRate = Math.min(rawCount, maxHumanBurst);
  } else {
    allowedByRate = Math.min(rawCount, Math.max(minBurst, 30));
  }

  const validClicks = Math.min(allowedByRate, record.energy);
  if (validClicks <= 0) return 0;

  const prevTotalClicks = record.totalClicks;
  const derived = deriveStats(record);

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
        return 0;
      }
    }
  }

  record.energy = Math.max(0, record.energy - validClicks);
  record.energyUpdated = nowIso;
  record.data += validClicks * derived.clickPower;
  record.totalClicks = prevTotalClicks + validClicks;
  record.lastClickBatchAt = nowMs;
  incrementDailyTaskProgress(record, 'tap', validClicks);
  incrementSeasonEventProgress(record, 'tap', validClicks);
  return validClicks;
}

export async function handleClickBatch(
  user: VerifiedTelegramUser,
  requestedClicks: number
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const nowMs = Date.now();
    if (record.clickBlockedUntil && new Date(record.clickBlockedUntil).getTime() > nowMs) {
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, 0);
    }

    const applied = await applyPendingClicks(record, mode, requestedClicks);

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, applied);
  });
}

export async function handleBuyCard(
  user: VerifiedTelegramUser,
  cardKey: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const card = CARDS_CONFIG.find((c) => c.key === cardKey);
    if (!card) {
      throw new Error('Карточка не найдена');
    }

    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const prevDerived = deriveStats(record);

    // Серверная проверка требования по уровню для эндгейм-карт!
    if (card.minLevel && prevDerived.level < card.minLevel) {
      throw new Error(`Эта карточка открывается на ${card.minLevel} уровне игрока!`);
    }

    const tierCfg = getCardTierConfig(record.cardTier);
    const maxLevel = getMaxCardLevel(record.cardTier);
    const currentLevel = record.cards[card.key] ?? 0;
    if (currentLevel >= maxLevel) {
      throw new Error(
        `Достигнут максимум ${maxLevel} уровней для текущего Тира. Открой следующий Тир за Чипы!`
      );
    }

    const price = getCardPrice(
      card,
      currentLevel,
      prevDerived.totalCardLevels,
      prevDerived.cardPriceDiscountPct
    );
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

    const newDerived = deriveStats(record);

    if (newDerived.deskStage > prevDerived.deskStage) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `✨ ЭВОЛЮЦИЯ СТОЛА (УР. ${newDerived.deskStage})!`,
        message: 'Рабочее место хакера обновилось визуально — загляни на вкладку «Стол»!',
      });
    }

    if (nextLevel === maxLevel && tierCfg.tier === record.cardTier) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: `🧱 ${card.name} — максимум Тира ${tierCfg.tier}`,
        message:
          tierCfg.tier < CARD_TIERS.length
            ? `Дальше только через Тир ${tierCfg.tier + 1}: ${CARD_TIERS[tierCfg.tier].chipCost} ⚙️ Чипов.`
            : 'Это абсолютный максимум карточки — 25 уровней!',
      });
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/** Открытие следующего Тира карточек за Чипы + Data. */
export async function handleUnlockTier(user: VerifiedTelegramUser,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const nextTier = record.cardTier + 1;
    if (nextTier > CARD_TIERS.length) {
      throw new Error('Все Тира уже открыты — ты на максимуме!');
    }
    const tierCfg = getCardTierConfig(nextTier);
    const derived = deriveStats(record);

    if (derived.level < tierCfg.requiredPlayerLevel) {
      throw new Error(
        `${tierCfg.title} откроется на ${tierCfg.requiredPlayerLevel} уровне (сейчас ${derived.level})`
      );
    }
    if (record.chips < tierCfg.chipCost) {
      throw new Error(
        `Недостаточно Чипов: нужно ${tierCfg.chipCost} ⚙️ (у тебя ${record.chips}). Чипы падают с контрактов!`
      );
    }
    if (record.data < tierCfg.dataCost) {
      throw new Error(`Недостаточно Data: нужно ${tierCfg.dataCost.toLocaleString('ru-RU')}`);
    }

    record.chips -= tierCfg.chipCost;
    record.data -= tierCfg.dataCost;
    record.cardTier = nextTier;

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🔓 ${tierCfg.title} ОТКРЫТ!`,
      message: `Потолок всех карточек поднят до ${tierCfg.maxLevel} уровня. Вперёд за железом!`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/** Покупка уровня пассивного улучшения «База» (переживает престиж). */
export async function handleBuyBaseUpgrade(
  user: VerifiedTelegramUser,
  upgradeKey: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const cfg = getBaseUpgradeConfig(upgradeKey);
    if (!cfg) {
      throw new Error('Улучшение Базы не найдено');
    }

    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const currentLevel = record.baseUpgrades[cfg.key] ?? 0;
    if (currentLevel >= cfg.maxLevel) {
      throw new Error(`${cfg.name} уже прокачан до максимума`);
    }
    const baseLevelNow = deriveStats(record).level;
    if ((cfg.requiredLevel ?? 1) > baseLevelNow) {
      throw new Error(
        `«${cfg.name}» открывается на ${cfg.requiredLevel} уровне (ты — ${baseLevelNow}).`
      );
    }

    const price = getBaseUpgradePrice(cfg, currentLevel);
    const chipCost = getBaseUpgradeChipCost(cfg, currentLevel);

    if (record.data < price) {
      throw new Error(`Недостаточно Data (нужно ${price.toLocaleString('ru-RU')})`);
    }
    if (record.chips < chipCost) {
      throw new Error(`Недостаточно Чипов (нужно ${chipCost} ⚙️)`);
    }

    record.data -= price;
    record.chips -= chipCost;
    record.baseUpgrades[cfg.key] = currentLevel + 1;

    if (record.baseUpgrades[cfg.key] === cfg.maxLevel) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `🔧 ${cfg.name} — МАКСИМУМ!`,
        message: `Улучшение Базы прокачано до ${cfg.maxLevel} уровня и сохранено навсегда.`,
      });
    }

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleHireNpc(
  user: VerifiedTelegramUser,
  npcKey: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const npc = TEAM_CONFIG.find((n) => n.key === npcKey);
    if (!npc) {
      throw new Error('Персонаж не найден');
    }

    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    if (record.team.includes(npc.key)) {
      throw new Error('Специалист уже в вашей команде');
    }

    const derivedNow = deriveStats(record);
    if ((npc.requiredLevel ?? 1) > derivedNow.level) {
      throw new Error(
        `Найм «${npc.callsign}» открывается на ${npc.requiredLevel} уровне (ты — ${derivedNow.level}). Уровень качается только взломами.`
      );
    }
    if ((npc.requiredMissions ?? 0) > record.totalMissions) {
      throw new Error(
        `Нужно закрыть ${npc.requiredMissions} контрактов (закрыто ${record.totalMissions}) — репутация в сети не покупается.`
      );
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
      record.stats.missionRefreshSalt = (record.stats.missionRefreshSalt ?? 0) + 1;
      const nextOffer = computeOfferWindow(
        user.tgId,
        true,
        deriveStats(record).level,
        record.stats.missionRefreshSalt
      );
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
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleMissionAction(
  user: VerifiedTelegramUser,
  action: 'start' | 'claim' | 'skip' | 'refresh',
  payload: { missionKey?: string; missionId?: string },
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const derived = deriveStats(record);

    if (action === 'refresh') {
      record.stats.missionRefreshSalt = (record.stats.missionRefreshSalt ?? 0) + 1;
      const nextOffer = computeOfferWindow(
        user.tgId,
        derived.unlockedGreyMissions,
        derived.level,
        record.stats.missionRefreshSalt
      );
      record.availableMissionKeys = nextOffer.keys;
      record.missionsRefreshedAt = new Date().toISOString();
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
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
      if ((cfg.minLevel ?? 1) > derived.level) {
        throw new Error(`Этот контракт открывается на ${cfg.minLevel} уровне игрока`);
      }
      if (record.activeMissions.some((m) => m.missionKey === cfg.key)) {
        throw new Error('Эта цель уже взламывается в данный момент');
      }

      // Шанс успеха фиксируется НА СТАРТЕ и хранится в БД: подкрутить задним числом нельзя.
      // Он зависит от силы железа (hackPower), запаса уровня, опыта по этому классу целей и Heat.
      const odds = getHackOdds({
        mission: cfg,
        level: derived.level,
        hackPower: derived.hackPower,
        heat: record.heat,
        tierSuccesses: record.stats.hackSuccessByType[cfg.targetType] ?? 0,
        tierFails: record.stats.hackFailByType[cfg.targetType] ?? 0,
      });
      const successChance = Math.round(odds.chance * 1000) / 1000;

      // Денежная награда за успешный взлом. Растёт по уровню игрока, но решает всё-таки успех.
      const whiteHatBonus = derived.alignment === 'white_hat' && cfg.targetType === 'bad' ? 2 : 1;
      const reward = Math.round(
        cfg.baseDataReward *
          getMissionRewardScale(derived.level) *
          whiteHatBonus *
          derived.prestigeMultiplier *
          (1 + derived.missionRewardBonusPct)
      );
      const repDelta = cfg.repDelta * (whiteHatBonus > 1 && cfg.repDelta > 0 ? 2 : 1);
      const heatDelta = Math.round(cfg.heatDelta * derived.heatMultiplier);
      // «Талисман удачи» на Базе повышает шанс редкого дропа Crypto
      const baseDropChance =
        cfg.targetType === 'grey' ? 0.35 : cfg.cryptoDropChance ?? 0;
      const cryptoReward =
        Math.random() < Math.min(0.9, baseDropChance + derived.cryptoDropBonusPct) ? 1 : 0;
      const xpReward = getMissionXpAward(cfg.xpReward ?? 10, cfg.tier ?? 1, derived.level);

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
              xp_reward: xpReward,
              success_chance: successChance,
              outcome: 'partial',
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
        xpReward,
        successChance,
        outcome: 'partial',
      });
      incrementDailyTaskProgress(record, 'mission_start', 1);
      incrementSeasonEventProgress(record, 'mission_start', 1);

      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: `🛰️ Взлом ${cfg.targetName} запущен`,
        message:
          `Шанс успеха ${Math.round(successChance * 100)}% · ` +
          `до ${xpReward.toLocaleString('ru-RU')} XP · ` +
          `до ${reward.toLocaleString('ru-RU')} Data. ` +
          `Готовность: ${describeOdds(successChance)}.`,
      });

      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
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

    // Бросок исхода. Пропуск за Crypto = гарантированный «частичный» результат: таймер обошёл — плати выходом.
    const outcome: 'success' | 'partial' | 'fail' =
      action === 'skip'
        ? 'partial'
        : rollHackOutcome(mission.successChance ?? 0.5);
    const outcomeMult = HACK_OUTCOME_REWARD[outcome];

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: claimedRows, error: claimErr } = await sb
          .from('missions')
          .update({ status: 'completed', outcome })
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

    const levelBefore = deriveStats(record).level;
    const dataGain = Math.round(mission.reward * outcomeMult.data);
    const repGain = Math.round(mission.repDelta * outcomeMult.rep);
    const heatGain = Math.round(mission.heatDelta * outcomeMult.heat);
    const xpGain = Math.max(1, Math.round((mission.xpReward || 0) * outcomeMult.xp));
    const cryptoGain = outcome === 'success' ? mission.cryptoReward : 0;

    record.data += dataGain;
    record.rep = Math.max(0, record.rep + repGain);
    record.heat = Math.max(0, record.heat + heatGain);
    record.crypto += cryptoGain;
    record.xp += xpGain;
    record.totalMissions += 1;
    record.stats.totalXpEarned += xpGain;
    incrementDailyTaskProgress(record, 'mission_complete', 1);
    incrementSeasonEventProgress(record, 'mission_complete', 1);

    // Чипы начисляются только за ЧИСТЫЙ успех (частичный результат и пропуск
    // за Crypto — без Чипов) и только в пределах суточного лимита.
    const chipsRequested =
      outcome === 'success'
        ? mission.targetType === 'grey'
          ? CHIP_REWARD_PER_GREY_MISSION
          : CHIP_REWARD_PER_MISSION
        : 0;
    const chipsDayKey = getGameDayKey(Date.now());
    const chipsGrant =
      chipsRequested > 0
        ? grantChips(record, chipsRequested, chipsDayKey)
        : { granted: 0, capped: false };
    const chipsGained = chipsGrant.granted;
    // Предупреждаем ОДИН раз за сутки, иначе каждый следующий контракт
    // присылал бы одинаковый тост — это раздражает сильнее самого лимита.
    if (chipsGrant.capped && record.stats.chipsCapNotifiedDay !== chipsDayKey) {
      record.stats.chipsCapNotifiedDay = chipsDayKey;
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: `⚙️ Дневной лимит Чипов достигнут (${CHIP_DAILY_CAP})`,
        message:
          'Чипы снова начнут падать после полуночи по Москве. Data, XP и Crypto продолжают капать как обычно.',
      });
    }

    // Опыт по классу целей: успехи немного помогают, настоящие провалы штрафуют сильнее.
    // Частичный результат (в том числе пропуск за Crypto) опыт не портит.
    if (outcome === 'success') {
      const ok = record.stats.hackSuccessByType;
      ok[mission.targetType] = (ok[mission.targetType] ?? 0) + 1;
    } else if (outcome === 'fail') {
      const bad = record.stats.hackFailByType;
      bad[mission.targetType] = (bad[mission.targetType] ?? 0) + 1;
      record.stats.missionFails += 1;
    }

    // Счётчики для «неочевидных» достижений
    if (!record.stats.missionTypes.includes(mission.targetType)) {
      record.stats.missionTypes.push(mission.targetType);
    }
    if (mission.targetType === 'grey') {
      record.stats.greyMissions += 1;
    }

    const levelAfter = getLevelProgress(record.xp).level;
    if (levelAfter > levelBefore) {
      const slotsBefore = levelBefore >= 20 ? 3 : levelBefore >= 10 ? 2 : 1;
      const slotsAfter = levelAfter >= 20 ? 3 : levelAfter >= 10 ? 2 : 1;
      alerts.push({
        id: crypto.randomUUID(),
        type: 'achievement',
        title: `⬆️ НОВЫЙ УРОВЕНЬ: ${levelAfter}!`,
        message:
          `Опыт ${record.xp.toLocaleString('ru-RU')} XP. ` +
          (slotsAfter > slotsBefore
            ? `Открыт ${slotsAfter}-й слот взлома! `
            : '') +
          (levelAfter >= 12 && levelBefore < 12
            ? 'В «Команде» стал доступен первый специалист (Coder). '
            : '') +
          'Новые контракты и Тир-пороги открываются автоматически.',
      });
    }

    const rewardLine =
      `+${xpGain.toLocaleString('ru-RU')} XP` +
      (dataGain > 0 ? ` | +${dataGain.toLocaleString('ru-RU')} Data` : ' | 0 Data') +
      (repGain !== 0 ? ` | ${repGain > 0 ? '+' : ''}${repGain} Rep` : '') +
      (heatGain > 0 ? ` | +${heatGain} Heat` : '') +
      (cryptoGain > 0 ? ` | +${cryptoGain} 💎 Crypto!` : '') +
      (chipsGained > 0 ? ` | +${chipsGained} ⚙️ Чип` : '');

    if (outcome === 'success') {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `✅ Цель ${mission.targetName} взломана!`,
        message: rewardLine,
      });
    } else if (outcome === 'partial') {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: `🟡 ${mission.targetName}: частичный доступ`,
        message:
          `Цель закрылась на середине — данные вытащены частично. ${rewardLine}` +
          (action === 'skip' ? ' (мгновенный пропуск всегда даёт частичный результат)' : ''),
      });
    } else {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'penalty',
        title: `❌ ${mission.targetName}: взлом сорвался`,
        message:
          `Цель подняла тревогу и сожгла след. ${rewardLine}. ` +
          `Подними силу железа (карточки, База) или вернись на цели попроще — Chance сейчас ` +
          `${Math.round((mission.successChance ?? 0) * 100)}%.`,
      });
    }

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleDailyBonus(user: VerifiedTelegramUser,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const prevDailyClaim = record.lastDailyClaim;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

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
    const dataBonus =
      150 *
      record.dailyStreak *
      Math.max(1, Math.pow(2, record.prestigeCount)) *
      Math.max(1, Math.ceil(deriveStats(record).level / 3));
    const chipsBonus = grantChips(record, CHIP_REWARD_PER_DAILY, getGameDayKey(Date.now())).granted;
    record.crypto += cryptoBonus;
    record.data += dataBonus;

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🎁 День ${record.dailyStreak}/7 получен!`,
      message: `Начислено +${cryptoBonus} 💎 Crypto, +${chipsBonus} ⚙️ Чипов и +${dataBonus.toLocaleString('ru-RU')} Data!`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleDailyTaskAction(
  user: VerifiedTelegramUser,
  action: 'claim',
  taskKey: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    // Пачка тапов может сама закрыть ежедневное поручение. Сохраняем её до
    // проверки кнопки, чтобы ошибка/повтор не теряли уже принятые клики.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const state = ensureDailyTasks(record, getGameDayKey(Date.now()));
    const task = getDailyTaskDefinition(taskKey);
    if (!task || !state.taskKeys.includes(task.key)) {
      throw new Error('Это поручение не входит в сегодняшнюю тройку');
    }
    if (state.claimed.includes(task.key)) {
      throw new Error('Награда за это поручение уже получена');
    }
    const progress = state.progress[task.key] ?? 0;
    if (progress < task.target) {
      throw new Error(`Поручение ещё не готово: ${progress}/${task.target}`);
    }

    // XP — единственная награда ежедневных поручений. expectedXp становится
    // CAS-сторожем для Supabase: параллельный второй claim не сможет повторить
    // начисление, даже если запросы попадут на разные serverless-инстансы.
    const expectedXp = record.xp;
    record.xp += task.rewardXp;
    record.stats.totalXpEarned += task.rewardXp;
    state.claimed.push(task.key);

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `${task.icon} Поручение выполнено`,
      message: `«${task.title}» закрыто. +${task.rewardXp} XP к прогрессу.`,
    });

    await savePlayerCore(record, mode, expectedXp);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleSeasonEventAction(
  user: VerifiedTelegramUser,
  action: 'claim_participation' | 'claim_mastery',
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    if (!isSeasonEventLive()) {
      throw new Error('Сезонная операция ещё не активирована — дата запуска будет согласована отдельно');
    }
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const state = ensureSeasonEvent(record);
    const allGoalsComplete = ACTIVE_SEASON_EVENT.goals.every(
      (goal) => (state.progress[goal.key] ?? 0) >= goal.target
    );
    const participationReady = ACTIVE_SEASON_EVENT.goals.some(
      (goal) => (state.progress[goal.key] ?? 0) > 0
    );
    const frameKey =
      action === 'claim_mastery'
        ? ACTIVE_SEASON_EVENT.masteryFrameKey
        : ACTIVE_SEASON_EVENT.participationFrameKey;
    const frame = getProfileFrame(frameKey);

    if (action === 'claim_mastery') {
      if (state.masteryClaimed) throw new Error('Мастерская рамка уже получена');
      if (!allGoalsComplete) throw new Error('Сначала закрой все три цели сезонной операции');
      state.masteryClaimed = true;
    } else {
      if (state.participationClaimed) throw new Error('Рамка участника уже получена');
      if (!participationReady) throw new Error('Сначала выполни хотя бы одну цель операции');
      state.participationClaimed = true;
    }

    const unlocked = new Set(record.stats.unlockedProfileFrames ?? []);
    unlocked.add(frame.key);
    record.stats.unlockedProfileFrames = Array.from(unlocked);
    // Последняя полученная рамка включается сразу, чтобы награда была видна
    // и в личном профиле, и в строках турнирной таблицы.
    record.stats.equippedProfileFrame = frame.key;

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🖼️ Рамка «${frame.name}» получена`,
      message: 'Косметическая награда включена и видна в турнирной таблице.',
    });

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleSkinAction(
  user: VerifiedTelegramUser,
  action: 'buy_or_equip' | 'clear_lockdown' | 'set_theme',
  skinKey?: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    if (action === 'clear_lockdown') {
      if (!record.clickBlockedUntil) {
        return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
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
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    // v3.6.1: выбор бесплатной базовой темы. Это косметика, поэтому ни Data,
    // ни Crypto не списываются — но и бонусов к тапу тема не даёт.
    if (action === 'set_theme') {
      const theme = BASE_THEMES.find((t) => t.key === skinKey);
      if (!theme) {
        throw new Error('Тема не найдена');
      }
      if (!theme.free) {
        throw new Error('Эта тема пока недоступна');
      }
      record.stats.baseTheme = theme.key;
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `${theme.glyph} Тема «${theme.name}» включена`,
        message: 'Оформление интерфейса обновлено. Скины по-прежнему накладываются сверху.',
      });
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    const skin = SKINS_CONFIG.find((s) => s.key === skinKey);
    if (!skin) {
      throw new Error('Скин не найден');
    }

    // v3.6.5: у каждой категории свой слот. Раньше все три писались в
    // record.equippedSkin, из-за чего надевание интерфейса сбрасывало стол
    // и аватар (а надевание стола — аватар). Теперь слоты независимы.
    const equipIntoSlot = () => {
      if (skin.category === 'ui') {
        record.stats.equippedUi = skin.key;
      } else if (skin.category === 'avatar') {
        record.stats.equippedAvatar = skin.key;
      } else {
        record.equippedSkin = skin.key;
      }
    };

    if (record.unlockedSkins.includes(skin.key)) {
      equipIntoSlot();
    } else {
      if (skin.prestigeRequired && record.prestigeCount < 1) {
        throw new Error('Этот скин открывается только через Global Hack Престиж!');
      }
      const skinLevel = deriveStats(record).level;
      if ((skin.requiredLevel ?? 1) > skinLevel) {
        throw new Error(
          `Скин «${skin.name}» открывается на ${skin.requiredLevel} уровне (ты — ${skinLevel}).`
        );
      }
      if (record.crypto < skin.cryptoCost) {
        throw new Error(`Недостаточно Crypto (нужно ${skin.cryptoCost} 💎)`);
      }
      record.crypto -= skin.cryptoCost;
      record.unlockedSkins.push(skin.key);
      equipIntoSlot();
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `🎨 Скин «${skin.name}» активирован!`,
        message:
          skin.category === 'ui'
            ? 'Интерфейс перекрашен. Скин стола и аватар остались на месте.'
            : skin.category === 'avatar'
              ? 'Аватар обновлён. Стол и интерфейс остались на месте.'
              : 'Тема рабочего стола обновлена. Интерфейс и аватар остались на месте.',
      });
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleGlobalHackPrestige(
  user: VerifiedTelegramUser,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const expectedPrestige = record.prestigeCount;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const derived = deriveStats(record);

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

    // ВАЖНО: сбрасываются только карточки, команда, активные миссии и Data/Heat.
    // Питомцы, «База», Чипы, Тир, скины, Crypto и достижения — сохраняются навсегда.
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
      message: `Постоянный множитель дохода теперь ×${Math.pow(2, record.prestigeCount)}! Crypto, достижения, скины, Rep, питомцы, База и Чипы сохранены!`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/** Покупка и кормление питомцев-компаньонов. */
export async function handlePetAction(
  user: VerifiedTelegramUser,
  action: 'buy' | 'feed',
  petKey: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const cfg = PETS_CONFIG.find((p) => p.key === petKey);
    if (!cfg) {
      throw new Error('Питомец не найден');
    }

    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const owned = record.pets.find((p) => p.key === cfg.key);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (action === 'buy') {
      if (owned) {
        throw new Error('Этот питомец уже живёт у тебя на базе');
      }
      const petLevel = deriveStats(record).level;
      if ((cfg.requiredLevel ?? 1) > petLevel) {
        throw new Error(
          `Питомец «${cfg.name}» появляется на ${cfg.requiredLevel} уровне (ты — ${petLevel}).`
        );
      }
      if (cfg.costCurrency === 'data') {
        if (record.data < cfg.costAmount) {
          throw new Error(`Недостаточно Data (нужно ${cfg.costAmount.toLocaleString('ru-RU')})`);
        }
        record.data -= cfg.costAmount;
      } else if (cfg.costCurrency === 'rep') {
        if (record.rep < cfg.costAmount) {
          throw new Error(`Недостаточно Rep (нужно ${cfg.costAmount})`);
        }
        record.rep -= cfg.costAmount;
      } else {
        if (record.crypto < cfg.costAmount) {
          throw new Error(`Недостаточно Crypto (нужно ${cfg.costAmount} 💎)`);
        }
        record.crypto -= cfg.costAmount;
      }

      record.pets.push({
        key: cfg.key,
        hunger: 100,
        lastFedAt: nowIso,
        feedCount: 0,
      });

      if (mode === 'supabase') {
        const sb = getSupabaseAdmin();
        if (sb) {
          const { error } = await sb.from('pets').upsert(
            {
              player_id: record.id,
              pet_key: cfg.key,
              hunger: 100,
              last_fed_at: nowIso,
              feed_count: 0,
            },
            { onConflict: 'player_id,pet_key', ignoreDuplicates: true }
          );
          if (error) throw new Error(`Не удалось заселить питомца: ${error.message}`);
        }
      }

      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `${cfg.emoji} ${cfg.name} теперь с тобой!`,
        message: `${cfg.buffLabel}. Не забывай кормить — баф растёт от сытости и привязанности.`,
      });

      await syncTimeAndRules(record, mode, alerts);
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    // ---- feed ----
    if (!owned) {
      throw new Error('Сначала заведи этого питомца');
    }
    const derived = deriveStats(record, nowMs);
    const hunger = getEffectiveHunger(
      owned.hunger,
      owned.lastFedAt,
      cfg.hungerDecayPerHour,
      nowMs
    );
    if (hunger >= 99) {
      throw new Error(`${cfg.name} абсолютно сыт — баф и так работает на максимум`);
    }
    const cooldownMs = cfg.feedCooldownHours * 3_600_000;
    const elapsed = nowMs - new Date(owned.lastFedAt).getTime();
    if (elapsed < cooldownMs) {
      const leftMin = Math.ceil((cooldownMs - elapsed) / 60_000);
      throw new Error(`Кормление перезаряжается: ещё ~${leftMin} мин.`);
    }

    const price = getPetFeedPrice(cfg, derived.dataPerHour, derived.feedDiscountPct);
    if (record.data < price) {
      throw new Error(`Недостаточно Data на корм (нужно ${price.toLocaleString('ru-RU')})`);
    }

    record.data -= price;
    owned.hunger = Math.min(100, Math.round((hunger + cfg.feedHunger) * 10) / 10);
    owned.lastFedAt = nowIso;
    owned.feedCount += 1;
    record.stats.petFeedings += 1;
    record.stats.petHungrySeen = Math.max(0, record.stats.petHungrySeen);

    const today = nowIso.slice(0, 10);
    if (record.stats.lastPetFeedDay !== today) {
      const yesterday = new Date(nowMs - 86_400_000).toISOString().slice(0, 10);
      record.stats.petFeedingStreakDays =
        record.stats.lastPetFeedDay === yesterday ? record.stats.petFeedingStreakDays + 1 : 1;
      record.stats.lastPetFeedDay = today;
    }

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🥕 ${cfg.name} покормлен!`,
      message: `Сытость ${Math.round(owned.hunger)}%, привязанность ${getPetAffection(
        owned.feedCount
      )}/10. Баф: ${cfg.buffLabel}.`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

const TRACK_TUTORIAL_TABS = new Set(['currencies', 'upgrades', 'hacks', 'team', 'endgame']);
const TRACK_APP_TABS = new Set(['/', '/upgrades', '/hacks', '/team', '/profile']);
const MAX_TRACK_EVENTS_PER_DAY = 200;

/**
 * Клиентская телеметрия ТОЛЬКО для «неочевидных» достижений (главы Академии, вкладки, ночная сессия).
 * Жёсткий whitelist событий, суточный кап и никакого влияния на экономику — начислить себе Data/Crypto этим нельзя.
 */
export async function handleTrackEvent(
  user: VerifiedTelegramUser,
  event: string,
  value?: number
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const nowMs = Date.now();
    const today = new Date(nowMs).toISOString().slice(0, 10);
    if (record.stats.trackEventsDay !== today) {
      record.stats.trackEventsDay = today;
      record.stats.trackEventsToday = 0;
    }
    if (record.stats.trackEventsToday >= MAX_TRACK_EVENTS_PER_DAY) {
      return buildResponse(record, mode, alerts);
    }

    const raw = typeof event === 'string' ? event.slice(0, 64) : '';
    const [kind, arg] = raw.split(':');
    let touched = false;

    switch (kind) {
      case 'tutorial_open': {
        record.stats.tutorialOpens = Math.min(100_000, record.stats.tutorialOpens + 1);
        touched = true;
        break;
      }
      case 'tutorial_tab': {
        if (TRACK_TUTORIAL_TABS.has(arg)) {
          if (!record.stats.tutorialTabs.includes(arg)) record.stats.tutorialTabs.push(arg);
          touched = true;
        }
        break;
      }
      case 'tab': {
        if (TRACK_APP_TABS.has(arg)) {
          if (!record.stats.tabsVisited.includes(arg)) record.stats.tabsVisited.push(arg);
          touched = true;
        }
        break;
      }
      case 'idle_15': {
        record.stats.idleSessions = Math.min(100_000, record.stats.idleSessions + 1);
        touched = true;
        break;
      }
      case 'session': {
        const minutes = Math.max(0, Math.min(240, Math.floor(Number(value) || 0)));
        if (minutes > record.stats.maxSessionMinutes) {
          record.stats.maxSessionMinutes = minutes;
          touched = true;
        }
        break;
      }
      case 'shop_freeze_30': {
        record.stats.shopFreezeMinutes = Math.min(100_000, record.stats.shopFreezeMinutes + 30);
        touched = true;
        break;
      }
      case 'local_hour': {
        const hour = Math.floor(Number(value));
        if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
          if (hour >= 2 && hour < 5) {
            record.stats.nightSessions = Math.min(100_000, record.stats.nightSessions + 1);
            touched = true;
          } else if (hour >= 5 && hour < 7) {
            record.stats.earlySessions = Math.min(100_000, record.stats.earlySessions + 1);
            touched = true;
          }
        }
        break;
      }
      default:
        break;
    }

    if (!touched) {
      return buildResponse(record, mode, alerts);
    }

    record.stats.trackEventsToday += 1;
    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
  });
}

/** Колонка в БД, по которой сортируем таблицу. */
const LEADERBOARD_METRIC: Record<LeaderboardSort, 'data' | 'xp' | 'level'> = {
  data: 'data',
  xp: 'xp',
  level: 'level',
};

function leaderboardValue(
  entry: { data: number; xp: number; level: number },
  sort: LeaderboardSort
): number {
  if (sort === 'xp') return entry.xp;
  if (sort === 'level') return entry.level;
  return entry.data;
}

function sortLeaderboard<T extends { data: number; xp: number; level: number; username: string }>(
  list: T[],
  sort: LeaderboardSort
): T[] {
  return [...list].sort((a, b) => {
    const diff = leaderboardValue(b, sort) - leaderboardValue(a, sort);
    if (diff !== 0) return diff;
    // Ничья по метрике: выше тот, у кого больше опыта (он реально дальше прошёл),
    // затем — по нику, чтобы порядок не «прыгал» между запросами.
    if (b.xp !== a.xp) return b.xp - a.xp;
    return a.username.localeCompare(b.username);
  });
}

/**
 * Своё место в рейтинге. В топ-100 попадают не все, а играть интереснее,
 * когда видно «ты #37 и до #36 не хватает 4 200 XP».
 */
async function buildLeaderboardSelf(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  currentUser: VerifiedTelegramUser,
  sort: LeaderboardSort
): Promise<LeaderboardSelf | null> {
  const metric = LEADERBOARD_METRIC[sort];

  const { data: selfRow, error: selfError } = await sb
    .from('players')
    .select('tg_id, username, level, data, xp')
    .eq('tg_id', currentUser.tgId)
    .maybeSingle();
  if (selfError || !selfRow) return null;
  // Гости из браузерного превью (отрицательные tg_id) в глобальном рейтинге не участвуют.
  if (Number(selfRow.tg_id) < -10_000_000) return null;

  const myLevel = Math.max(1, Number(selfRow.level ?? 1));
  const myData = Math.round(Math.max(0, Number(selfRow.data ?? 0)));
  const myXp = Math.round(Math.max(0, Number(selfRow.xp ?? 0)));
  const myValue =
    metric === 'xp' ? myXp : metric === 'level' ? myLevel : myData;

  const [aheadCount, aheadRow, totalRow] = await Promise.all([
    sb
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gt('tg_id', -10_000_000)
      .gt(metric, myValue),
    sb
      .from('players')
      .select('username, level, data, xp, rank')
      .gt('tg_id', -10_000_000)
      .gt(metric, myValue)
      .order(metric, { ascending: true })
      .limit(1),
    sb
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gt('tg_id', -10_000_000),
  ]);

  const ahead = aheadRow.data?.[0] ?? null;
  const aheadValue = ahead
    ? metric === 'xp'
      ? Math.round(Number(ahead.xp ?? 0))
      : metric === 'level'
        ? Number(ahead.level ?? 1)
        : Math.round(Number(ahead.data ?? 0))
    : null;

  return {
    rank: (aheadCount.count ?? 0) + 1,
    total: totalRow.count ?? 0,
    level: myLevel,
    data: myData,
    xp: myXp,
    metric: sort,
    value: myValue,
    aheadUsername: ahead ? String(ahead.username) : null,
    aheadValue,
    gap: aheadValue === null ? 0 : Math.max(0, aheadValue - myValue),
  };
}

function getLeaderboardCosmetics(rawStats: unknown): Pick<LeaderboardEntry, 'avatarKey' | 'profileFrameKey'> {
  const stats = normalizeStats(rawStats);
  return {
    avatarKey: stats.equippedAvatar,
    profileFrameKey: stats.equippedProfileFrame,
  };
}

export async function handleGetLeaderboard(
  currentUser: VerifiedTelegramUser,
  sort: LeaderboardSort = 'data'
): Promise<LeaderboardResponse> {
  const safeSort: LeaderboardSort =
    sort === 'xp' || sort === 'level' || sort === 'data' ? sort : 'data';
  const metric = LEADERBOARD_METRIC[safeSort];

  const sb = getSupabaseAdmin();
  if (sb) {
    // Выбираем только реальных верифицированных игроков Telegram (tg_id > 0)
    // и официальных кибер-соперников (-1009..-1001)!
    // Ни один неавторизованный гость из браузерного превью (-900M..-100M)
    // не попадает в глобальный рейтинг!
    const { data, error } = await sb
      .from('players')
      .select('tg_id, username, level, data, xp, rank, prestige_count, stats')
      .gt('tg_id', -10_000_000)
      .order(metric, { ascending: false })
      .order(metric === 'xp' ? 'data' : 'xp', { ascending: false })
      .limit(100);

    if (!error && data) {
      const entries: LeaderboardEntry[] = data.map((row) => {
        const rankIdx = Math.max(1, Math.min(RANK_TITLES.length, Number(row.rank ?? 1)));
        return {
          username: String(row.username),
          ...getLeaderboardCosmetics(row.stats),
          level: Math.max(1, Number(row.level ?? 1)),
          data: Math.round(Math.max(0, Number(row.data ?? 0))),
          xp: Math.round(Math.max(0, Number(row.xp ?? 0))),
          rankTitle: RANK_TITLES[rankIdx - 1]?.title ?? 'Script Kiddie',
          prestigeCount: Number(row.prestige_count ?? 0),
          isCurrentUser: Number(row.tg_id) === currentUser.tgId,
        };
      });

      let me: LeaderboardSelf | null = null;
      try {
        me = await buildLeaderboardSelf(sb, currentUser, safeSort);
      } catch {
        // Рейтинг не должен падать из-за необязательной карточки «твоё место».
        me = null;
      }

      return { ok: true, sort: safeSort, entries, me };
    }
  }

  const db = getLocalDb();
  const realEntries: LeaderboardEntry[] = Object.values(db.playersByTgId)
    .filter((rec) => rec.tgId > -10_000_000 || rec.tgId === currentUser.tgId)
    .map((rec) => {
      const d = deriveStats(rec);
      return {
        username: rec.username,
        ...getLeaderboardCosmetics(rec.stats),
        level: d.level,
        data: Math.round(rec.data),
        xp: Math.round(d.totalXp),
        rankTitle: d.rankTitle,
        prestigeCount: rec.prestigeCount,
        isCurrentUser: rec.tgId === currentUser.tgId,
      };
    });

  const sorted = sortLeaderboard([...realEntries, ...RIVAL_NPCS_LEADERBOARD], safeSort);
  const myIndex = sorted.findIndex((entry) => entry.isCurrentUser);
  let me: LeaderboardSelf | null = null;
  if (myIndex >= 0) {
    const myEntry = sorted[myIndex];
    const aheadEntry = myIndex > 0 ? sorted[myIndex - 1] : null;
    const myValue = leaderboardValue(myEntry, safeSort);
    const aheadValue = aheadEntry ? leaderboardValue(aheadEntry, safeSort) : null;
    me = {
      rank: myIndex + 1,
      total: sorted.length,
      level: myEntry.level,
      data: myEntry.data,
      xp: myEntry.xp,
      metric: safeSort,
      value: myValue,
      aheadUsername: aheadEntry?.username ?? null,
      aheadValue,
      gap: aheadValue === null ? 0 : Math.max(0, aheadValue - myValue),
    };
  }

  return { ok: true, sort: safeSort, entries: sorted.slice(0, 100), me };
}
