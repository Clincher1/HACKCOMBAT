import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS_CONFIG, ACHIEVEMENTS_BY_KEY } from '../../shared/achievements.config';
import { BACKDROPS_CONFIG, isBackdropKey } from '../../shared/backdrops.config';
import { isNewbieProtectionActive, newPlayerSnapshotFromCounters } from '../../shared/onboarding.config';
import {
  isGameplayV3Enabled,
  isReferralV1Enabled,
  isRetentionV1Enabled,
  isWorldV2Enabled,
} from '../../shared/config';
import { isContractReady } from '../../shared/economy.config';
// v1: объявление о перезапуске — серверный конфиг, в клиентский бандл не идёт.
import { LAUNCH_ANNOUNCEMENT, LAUNCH_ANNOUNCEMENT_ID } from '../../shared/launch.config';
import {
  describeLockedLocation,
  getLocation,
  getUnlockedLocations,
  HOME_LOCATION_ID,
  isLocationMissionStartable,
  isLocationUnlocked,
  missionLocationId,
  resolveLocationId,
  WORLD_FALLBACK_LOCATION_ID,
  type LocationId,
} from '../../shared/world.config';
import {
  economyLocationId,
  economyModifiers,
  type LocationModifiers,
} from '../../shared/locations';
import { PRESTIGE_KEEPS, PRESTIGE_RESETS } from '../../shared/prestige.config';
import {
  buildStorySnapshot,
  buildStoryViews,
  findStoryStep,
  isStoryStepMet,
  STORY_ARCS,
  storyDataReward,
  storyFactsFromPlayer,
  storyStepIds,
} from '../../shared/story.config';
import {
  describeEventModifiers,
  eventAnnouncementKey,
  formatEventEnd,
  getEventAnnouncement,
  getEventModifiers,
  getWeeklySlot,
} from '../../shared/events.config';
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
  getPrestigeMultiplier,
  getPrestigeRequiredLevel,
  getRankForLevel,
  getSafePrestigeCount,
  HEAT_LOCKDOWN_SECONDS,
  HEAT_PENALTY_DATA_LOSS_PCT,
  HEAT_PENALTY_THRESHOLD,
  HEAT_RESET_AFTER_PENALTY,
  resolveTapAllowance,
  TAP_BURST_CAPACITY,
  ACTIVITY_HEARTBEAT_MAX_GAP_SEC,
  diffGameDayKeys,
  getGameDayBoundsMs,
  getGameDayKey,
  getGameDayKeyFromIso,
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
  getMissionEntryCost,
  getMissionRewardScale,
  getMissionXpAward,
  getTotalXpForLevel,
  HACK_OUTCOME_REWARD,
  rollHackOutcome,
} from '../../shared/hack.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { deskStageLabel } from '../../shared/desk-stages.config';
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
import {
  DAILY_GOALS_PER_DAY,
  DAILY_GOAL_CRYPTO_REWARD,
  buildDailyGoalsBoard,
  getDailyGoalChips,
  getDailyGoalDefinition,
  getUtcDayKey,
  isDailyGoalKind,
  normalizeDailyGoalsState,
  type DailyGoalKind,
} from '../../shared/dailyGoals.config';
import {
  LOLLIPOP_BOOST_MS,
  canActivateLollipop,
  isLollipopActive,
  isSeasonActive,
  lollipopCooldownMs,
  lollipopMultiplier,
} from '../../shared/season.config';
import {
  HACK_FINISH_GRACE_SEC,
  HACK_MAX_TAPS_PER_SEC,
  HACK_SESSION_SECONDS,
  countHackNodes,
  getHackDifficulty,
  hackDataReward,
  hackHeatGain,
} from '../../shared/hacks.config';
import {
  CONTRACTS_PER_DAY,
  MAX_ACTIVE_CONTRACTS,
  describeContractReward,
  getContractDefinition,
  getDailyContracts,
  type ContractMetric,
} from '../../shared/contracts.config';
import { getProfileFrame, PROFILE_FRAMES } from '../../shared/profileFrames.config';
import {
  FIRST_DONUT_ITEM_KEY,
  getInventoryItemDefinition,
} from '../../shared/inventory.config';
import {
  EXPLOIT_INJECTION_ITEM_KEY,
  getConsumableItem,
  LEVEL_ITEM_MILESTONES,
  PHOENIX_PROTOCOL_ITEM_KEY,
  rollDailyFullSetItem,
  rollItemDrop,
  rollLevelItem,
  type ItemDropSource,
} from '../../shared/consumables.config';
import {
  ACTIVE_SEASON_EVENT,
  getSeasonEventDayNumber,
  getSeasonEventDayTasks,
  getSeasonEventWindow,
  isSeasonEventLive,
  SEASON_EVENT_DAY_COUNT,
  SEASON_EVENT_TASKS_PER_DAY,
} from '../../shared/seasonalEvent.config';
import { TEAM_CONFIG } from '../../shared/team.config';
import {
  ensureDailyIncident,
  normalizeDailyIncidentState,
  resolveDailyIncidentOutcome,
} from './dailyIncident';
import { getDailyIncidentDefinition } from '../../shared/incidents.config';
import type {
  ActiveMissionInstance,
  ApiSyncResponse,
  ContractState,
  HackSessionState,
  LollipopState,
  DailyTaskKind,
  DailyTaskState,
  DerivedStats,
  SeasonEventState,
  GameAlert,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardSelf,
  LeaderboardSort,
  MissionConfig,
  PlayerProgressStats,
  PlayerState,
  PublicProfile,
  PublicProfileItem,
  PublicProfileResponse,
  PlayerInventoryState,
  PlayerItemStack,
  PendingOfflineEarnings,
  ReferralLedgerEntry,
  ReferralPayload,
  SkinCategory,
} from '../../shared/types';
import { getSupabaseAdmin } from './supabaseAdmin';
import { ensurePermanentProfileFrameGifts } from './profileFrameGifts';
import { ensurePermanentProfileInventoryGifts } from './profileInventoryGifts';
import {
  attributeReferral,
  attributeTgIdReferral,
  getReferralLedger,
  markReferralQualified,
  payoutReferrals,
  qualifyInvitee,
} from './referrals';
import {
  applyOfflineOnInit,
  buildRetentionSnapshot,
  claimOfflineEarnings,
  mirrorDailyStreak,
  maybeSendDailyReminder,
  recordDailyClaim,
  setReminderOptIn,
  touchLastSeen,
} from './retention';
import {
  buildReferralTgLink,
  REFERRAL_FALLBACK_BOT_USERNAME,
  REFERRAL_QUALIFY_ACTIVE_SECONDS,
  REFERRAL_TG_RULES_SHORT,
  REFERRAL_TG_WEEKLY_CAP,
} from '../../shared/referral.config';
import { getBotToken, getBotUsername } from './donations';
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
  /** «Инвентарь оживает»: выпавшие расходники (зеркало таблицы player_items). */
  items: Record<string, StoredItem>;
}

/** Стопка предмета в сейве игрока. */
export interface StoredItem {
  key: string;
  qty: number;
  firstAcquiredAt: string;
  updatedAt: string;
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
  hacksByTier: {},
  totalXpEarned: 0,
  lastTapClaimAt: null,
  activeDayKey: null,
  activeSecondsToday: 0,
  dailyIncident: undefined,
  missionRefreshSalt: 0,
  lastMissionRefreshAt: null,
  equippedProfileFrameExpiresAt: null,
  inventoryOwned: [FIRST_DONUT_ITEM_KEY],
  inventoryShowcase: [],
  lastQualifiedDayKey: null,
  lastActiveAt: null,
  offlineGraceUsed: false,
  storyClaimed: [],
  storyChaptersPaid: [],
  eventAnnouncements: {},
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

/** v6.8: журнал анонсов ивентов — ключ `${event}:${startIso}` → ISO показа. */
function normalizeEventAnnouncements(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 160) continue;
    if (!/^[a-z0-9:._-]+$/i.test(key)) continue;
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) continue;
    out[key] = value;
  }
  return out;
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

/**
 * v6.1: контракты — часть того же stats jsonb. Чистим всё, что не проходит по
 * конфигу: неизвестный ключ не должен попасть в интерфейс или в награду.
 */
function normalizeContractState(raw: unknown): ContractState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const dayKey = typeof src.dayKey === 'string' ? src.dayKey.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return undefined;

  const ids = Array.isArray(src.ids)
    ? Array.from(
        new Set(
          src.ids.map((key) => String(key)).filter((key) => Boolean(getContractDefinition(key)))
        )
      ).slice(0, MAX_ACTIVE_CONTRACTS)
    : [];
  if (ids.length === 0) return undefined;

  const rawProgress =
    src.progress && typeof src.progress === 'object' ? (src.progress as Record<string, unknown>) : {};
  const progress: Record<string, number> = {};
  for (const id of ids) {
    const target = getContractDefinition(id)?.target ?? 0;
    const value = Number(rawProgress[id]);
    progress[id] = Number.isFinite(value) ? Math.max(0, Math.min(target, Math.floor(value))) : 0;
  }

  const claimed = Array.isArray(src.claimed)
    ? Array.from(
        new Set(src.claimed.map((key) => String(key)).filter((key) => ids.includes(key)))
      )
    : [];

  return { dayKey, ids, progress, claimed };
}

/**
 * v6.2: сессия взлома. id и seed обязательны — без них итог нельзя проверить,
 * поэтому повреждённая запись просто выбрасывается.
 */
function normalizeHackSession(raw: unknown): HackSessionState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const id = typeof src.id === 'string' ? src.id.slice(0, 64) : '';
  const difficulty = getHackDifficulty(String(src.difficulty ?? ''));
  const seed = Math.floor(Number(src.seed));
  const startedAt = typeof src.startedAt === 'string' ? src.startedAt : '';
  const endsAt = typeof src.endsAt === 'string' ? src.endsAt : '';
  if (!id || !difficulty || !Number.isFinite(seed) || !startedAt || !endsAt) return undefined;
  if (Number.isNaN(new Date(startedAt).getTime()) || Number.isNaN(new Date(endsAt).getTime())) {
    return undefined;
  }
  return {
    id,
    difficulty: difficulty.key,
    seed: seed >>> 0,
    startedAt,
    endsAt,
    cost: Math.max(0, Math.floor(Number(src.cost) || 0)),
    finished: src.finished === true,
    safeHits: Math.max(0, Math.floor(Number(src.safeHits) || 0)),
    trapHits: Math.max(0, Math.floor(Number(src.trapHits) || 0)),
    dataGained: Math.max(0, Math.floor(Number(src.dataGained) || 0)),
    heatGained: Math.max(0, Math.floor(Number(src.heatGained) || 0)),
  };
}

/**
 * v6.3: состояние леденца. Протухшее окно сохраняем как есть (оно само истечёт),
 * но мусорные даты выбрасываем, чтобы UI не показывал NaN.
 */
function normalizeLollipopState(raw: unknown): LollipopState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const activeUntil =
    typeof src.activeUntil === 'string' && !Number.isNaN(new Date(src.activeUntil).getTime())
      ? src.activeUntil
      : null;
  const lastActivatedDayKey =
    typeof src.lastActivatedDayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.lastActivatedDayKey)
      ? src.lastActivatedDayKey
      : null;
  if (!activeUntil && !lastActivatedDayKey) return undefined;
  return { activeUntil, lastActivatedDayKey };
}

function normalizeSeasonEventState(raw: unknown): SeasonEventState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const weekKey = typeof src.weekKey === 'string' ? src.weekKey.slice(0, 10) : '';
  const eventWindow = getSeasonEventWindow();
  if (
    src.version !== 2 ||
    src.eventKey !== ACTIVE_SEASON_EVENT.key ||
    weekKey !== eventWindow.weekKey ||
    !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)
  ) {
    // Старые три глобальные цели намеренно не мигрируются в новую модель.
    return undefined;
  }

  const rawDays = src.days && typeof src.days === 'object'
    ? (src.days as Record<string, unknown>)
    : {};
  const days: SeasonEventState['days'] = {};
  for (let day = 1; day <= SEASON_EVENT_DAY_COUNT; day += 1) {
    const rawDay = rawDays[String(day)];
    if (!rawDay || typeof rawDay !== 'object') continue;
    const daySrc = rawDay as Record<string, unknown>;
    const dayKey = typeof daySrc.dayKey === 'string' ? daySrc.dayKey.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
    const levelAtGeneration = Number(daySrc.levelAtGeneration);
    const rawTasks = Array.isArray(daySrc.tasks) ? daySrc.tasks : [];
    if (
      rawTasks.length !== SEASON_EVENT_TASKS_PER_DAY ||
      !Number.isFinite(levelAtGeneration) ||
      levelAtGeneration < 1
    ) {
      continue;
    }

    const tasks = rawTasks
      .map((rawTask) => {
        if (!rawTask || typeof rawTask !== 'object') return undefined;
        const task = rawTask as Record<string, unknown>;
        const kind = task.kind;
        if (kind !== 'tap' && kind !== 'mission_start' && kind !== 'mission_complete') return undefined;
        const key = typeof task.key === 'string' ? task.key.slice(0, 120) : '';
        const title = typeof task.title === 'string' ? task.title.slice(0, 120) : '';
        const description = typeof task.description === 'string' ? task.description.slice(0, 240) : '';
        const icon = typeof task.icon === 'string' ? task.icon.slice(0, 8) : '';
        const target = Number(task.target);
        if (
          !key ||
          !title ||
          !description ||
          !icon ||
          !Number.isFinite(target) ||
          target < 1 ||
          target > 10_000
        ) {
          return undefined;
        }
        return {
          key,
          kind: kind as DailyTaskKind,
          target: Math.floor(target),
          title,
          description,
          icon,
        };
      })
      .filter((task): task is NonNullable<typeof task> => Boolean(task));
    const taskKeys = new Set(tasks.map((task) => task.key));
    if (tasks.length !== SEASON_EVENT_TASKS_PER_DAY || taskKeys.size !== tasks.length) continue;
    const expectedDayKey = new Date(
      eventWindow.startMs + (day - 1) * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    const expectedTasks = getSeasonEventDayTasks(day, expectedDayKey, levelAtGeneration);
    if (dayKey !== expectedDayKey || !sameSeasonEventTasks(tasks, expectedTasks)) continue;

    const rawProgress =
      daySrc.progress && typeof daySrc.progress === 'object'
        ? (daySrc.progress as Record<string, unknown>)
        : {};
    const progress: Record<string, number> = {};
    for (const task of tasks) {
      const value = Number(rawProgress[task.key]);
      progress[task.key] = Number.isFinite(value)
        ? Math.max(0, Math.min(task.target, Math.floor(value)))
        : 0;
    }
    const completeByProgress = tasks.every((task) => progress[task.key] >= task.target);
    days[String(day)] = {
      day,
      dayKey,
      levelAtGeneration: Math.floor(levelAtGeneration),
      tasks,
      progress,
      completed: daySrc.completed === true && completeByProgress,
      completedAt:
        typeof daySrc.completedAt === 'string' && !Number.isNaN(new Date(daySrc.completedAt).getTime())
          ? daySrc.completedAt
          : null,
    };
  }

  const currentDayNumber = Number(src.currentDay);
  const currentDay = Number.isFinite(currentDayNumber)
    ? Math.max(1, Math.min(SEASON_EVENT_DAY_COUNT, Math.floor(currentDayNumber)))
    : 1;
  const completedDays = Array.from(
    new Set(
      (Array.isArray(src.completedDays) ? src.completedDays : [])
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= SEASON_EVENT_DAY_COUNT)
        .filter((day) => days[String(day)]?.completed === true)
    )
  ).sort((a, b) => a - b);

  return {
    version: 2,
    eventKey: ACTIVE_SEASON_EVENT.key,
    weekKey,
    currentDay,
    days,
    completedDays,
    participationClaimed: src.participationClaimed === true && completedDays.length > 0,
    masteryClaimed:
      src.masteryClaimed === true && completedDays.length === SEASON_EVENT_DAY_COUNT,
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
  const keyArr = (v: unknown, max = 256) => {
    if (!Array.isArray(v)) return [];
    return Array.from(
      new Set(
        v
          .map((x) => String(x).slice(0, 120))
          .filter((x) => /^[a-z0-9:_-]{1,120}$/i.test(x))
      )
    ).slice(0, max);
  };
  const inventoryOwned = Array.from(
    new Set([FIRST_DONUT_ITEM_KEY, ...keyArr(src.inventoryOwned)])
  );
  const inventoryShowcase = keyArr(src.inventoryShowcase);
  const seasonEvent = normalizeSeasonEventState(src.seasonEvent);
  const validEventFrameKeys = new Set<string>();
  if (seasonEvent?.participationClaimed && seasonEvent.completedDays.length > 0) {
    validEventFrameKeys.add(ACTIVE_SEASON_EVENT.participationFrameKey);
  }
  if (
    seasonEvent?.masteryClaimed &&
    seasonEvent.completedDays.length === SEASON_EVENT_DAY_COUNT
  ) {
    validEventFrameKeys.add(ACTIVE_SEASON_EVENT.masteryFrameKey);
  }
  const equippedProfileFrame = pickProfileFrameKey(src.equippedProfileFrame);
  const equippedFrameConfig = equippedProfileFrame
    ? PROFILE_FRAMES.find((candidate) => candidate.key === equippedProfileFrame)
    : undefined;
  // Expiry is meaningful only for frames explicitly marked temporary. This
  // also migrates old gifted-frame records that still carry a stale 24-hour
  // timestamp: permanent gifts keep working and expose no expiry.
  const temporaryFrameExpiry =
    equippedFrameConfig?.temporary &&
    typeof src.equippedProfileFrameExpiresAt === 'string' &&
    !Number.isNaN(new Date(src.equippedProfileFrameExpiresAt).getTime())
      ? src.equippedProfileFrameExpiresAt
      : null;
  const temporaryFrameActive =
    temporaryFrameExpiry !== null && new Date(temporaryFrameExpiry).getTime() > Date.now();
  // Ранние админские выдачи иногда записывали только equippedProfileFrame.
  // Подарок не должен исчезнуть из коллекции из-за неполного старого JSONB.
  const rawUnlockedProfileFrames = Array.from(
    new Set([
      ...strArr(src.unlockedProfileFrames),
      ...(equippedFrameConfig?.giftOnly && equippedProfileFrame ? [equippedProfileFrame] : []),
    ])
  );
  const unlockedProfileFrames = rawUnlockedProfileFrames.filter((key) => {
    const frame = PROFILE_FRAMES.find((candidate) => candidate.key === key);
    if (!frame || frame.key === 'default') return false;
    if (frame.temporary && !temporaryFrameActive) return false;
    return !frame.eventKey || validEventFrameKeys.has(frame.key);
  });

  // v6.4: запас тап-цикла. Мусор в jsonb не должен давать бесконечный запас:
  // токены зажимаются 0..TAP_BURST_CAPACITY, время — валидное число ≥ 0.
  const tapBudgetRaw = (src.tapBudget && typeof src.tapBudget === 'object'
    ? src.tapBudget
    : null) as Record<string, unknown> | null;
  const tapTokens = tapBudgetRaw ? Number(tapBudgetRaw.tokens) : Number.NaN;
  const tapAt = tapBudgetRaw ? Number(tapBudgetRaw.at) : Number.NaN;
  const tapBudget =
    Number.isFinite(tapTokens) && Number.isFinite(tapAt)
      ? {
          tokens: Math.max(0, Math.min(TAP_BURST_CAPACITY, tapTokens)),
          at: Math.max(0, tapAt),
        }
      : undefined;

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
    // v5.4: пройден ли гейт первого сеанса (иначе оверлей показывался бы снова).
    onboardingV2Completed: src.onboardingV2Completed === true,
    // v5.5: где игрок. Храним только известный ключ — мусор из jsonb не должен
    // уводить витрину миссий и фон в несуществующую локацию.
    locationId: getLocation(src.locationId)?.id,
    hackSuccessByType: numRecord(src.hackSuccessByType, new Set(['bad', 'good', 'neutral', 'grey'])),
    hackFailByType: numRecord(src.hackFailByType, new Set(['bad', 'good', 'neutral', 'grey'])),
    // v6.11: ключ — тир контракта 1..6, значение — успешные взломы этого тира.
    hacksByTier: numRecord(src.hacksByTier, new Set(['1', '2', '3', '4', '5', '6'])),
    // v1: мусор в jsonb не должен «глушить» анонс навсегда — принимаем только
    // известный id, всё остальное читается как «ещё не видел».
    launchAnnouncement: src.launchAnnouncement === LAUNCH_ANNOUNCEMENT_ID ? LAUNCH_ANNOUNCEMENT_ID : undefined,
    totalXpEarned: num(src.totalXpEarned, 1e12),
    lastTapClaimAt:
      typeof src.lastTapClaimAt === 'string' && !Number.isNaN(new Date(src.lastTapClaimAt).getTime())
        ? src.lastTapClaimAt
        : null,
    activeDayKey: typeof src.activeDayKey === 'string' ? src.activeDayKey.slice(0, 10) : null,
    dailyTasks: normalizeDailyTaskState(src.dailyTasks),
    // v1.6: доска целей дня. Старый сейв без поля читается как undefined и
    // получает свежую доску в syncTimeAndRules — миграция данных не нужна.
    dailyGoals: normalizeDailyGoalsState(src.dailyGoals),
    contracts: normalizeContractState(src.contracts),
    hackSession: normalizeHackSession(src.hackSession),
    lollipop: normalizeLollipopState(src.lollipop),
    tapBudget,
    dailyIncident: normalizeDailyIncidentState(src.dailyIncident),
    seasonEvent,
    unlockedProfileFrames,
    // Надетой может быть только реально открытая рамка. Это не даёт старому
    // или повреждённому JSON самовольно показать золотую рамку в рейтинге.
    equippedProfileFrame:
      equippedProfileFrame && unlockedProfileFrames.includes(equippedProfileFrame)
        ? equippedProfileFrame
        : undefined,
    equippedProfileFrameExpiresAt: temporaryFrameActive ? temporaryFrameExpiry : null,
    // v6.8: сюжет и анонсы ивентов — списки id, мусор из jsonb не проходит.
    storyClaimed: keyArr(src.storyClaimed, 512),
    storyChaptersPaid: keyArr(src.storyChaptersPaid, 64),
    eventAnnouncements: normalizeEventAnnouncements(src.eventAnnouncements),
    inventoryOwned,
    inventoryShowcase,
    activeSecondsToday: num(src.activeSecondsToday, 86_400),
    chipsDayKey: typeof src.chipsDayKey === 'string' ? src.chipsDayKey.slice(0, 10) : null,
    chipsToday: num(src.chipsToday, 100_000),
    chipsCapNotifiedDay:
      typeof src.chipsCapNotifiedDay === 'string' ? src.chipsCapNotifiedDay.slice(0, 10) : null,
    missionRefreshSalt: num(src.missionRefreshSalt, 1_000_000_000),
    lastMissionRefreshAt:
      typeof src.lastMissionRefreshAt === 'string' && !Number.isNaN(new Date(src.lastMissionRefreshAt).getTime())
        ? src.lastMissionRefreshAt
        : null,
    // v5.0: список тем больше не захардкожен — «неон» добавился как опция,
    // и любой известный BASE_THEMES ключ должен переживать round-trip.
    baseTheme: BASE_THEMES.some((theme) => theme.key === src.baseTheme)
      ? (src.baseTheme as (typeof BASE_THEMES)[number]['key'])
      : undefined,
    // v4.1: только известные ключи фона — иначе старый/битый jsonb включит пустую сцену.
    deskBackdrop: isBackdropKey(src.deskBackdrop) ? src.deskBackdrop : undefined,
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
    // ------------------------------------------------------------------
    // v5.6: retention-поля. normalizeStats — белый список, поэтому каждое
    // новое поле обязано быть здесь, иначе оно молча теряется при загрузке
    // (и «пока тебя не было» никогда не сработает).
    // ------------------------------------------------------------------
    lastSeenAt: isoOrNull(src.lastSeenAt),
    pendingOffline: normalizePendingOffline(src.pendingOffline),
    lastOfflineClaimAt: isoOrNull(src.lastOfflineClaimAt),
    lastDailyClaim: utcDayOrNull(src.lastDailyClaim),
    dailyStreak: num(src.dailyStreak, 7),
    dailyStreakDay: num(src.dailyStreakDay, 7),
    dailyClaimedToday: src.dailyClaimedToday === true,
    reminderOptIn: src.reminderOptIn === true,
    lastReminderSentAt: isoOrNull(src.lastReminderSentAt),
    referrals: normalizeReferralLedger(src.referrals),
    referredByTgId: safeTgId(src.referredByTgId),
    referralQualifiedAt: isoOrNull(src.referralQualifiedAt),
    refereeWelcomeGranted: src.refereeWelcomeGranted === true,
    // ------------------------------------------------------------------
    // v1 «Инвентарь оживает». normalizeStats — белый список, поэтому
    // неперечисленные здесь поля молча теряются при каждом сохранении.
    // ------------------------------------------------------------------
    hasNewItems: src.hasNewItems === true,
    exploitInjectionReady: src.exploitInjectionReady === true,
    channelBoostUntil: isoOrNull(src.channelBoostUntil),
    itemMilestones: keyArr(src.itemMilestones, 8),
  };
}

/**
 * v5.6: ISO-строка или null. Битые даты из jsonb не должны попадать в движок:
 * из них считается оффлайн и кулдаун напоминания.
 */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

/** v5.6: UTC-дата 'YYYY-MM-DD' или null. */
function utcDayOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** v5.6: Telegram ID пригласившего: только положительный safe-integer. */
function safeTgId(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** v5.6: незабранный оффлайн. Отрицательные и «бесконечные» суммы отсекаем. */
function normalizePendingOffline(value: unknown): PendingOfflineEarnings | null {
  if (!value || typeof value !== 'object') return null;
  const src = value as Record<string, unknown>;
  const data = Number(src.data);
  if (!Number.isFinite(data) || data <= 0) return null;
  const away = Number(src.awaySeconds);
  const computedAt = isoOrNull(src.computedAt);
  if (!computedAt) return null;
  return {
    data: Math.min(data, Number.MAX_SAFE_INTEGER),
    awaySeconds: Number.isFinite(away) && away > 0 ? Math.min(Math.floor(away), 400 * 86_400) : 0,
    computedAt,
  };
}

/** v5.6: журнал приглашений — максимум 50 записей, только валидные tgId. */
function normalizeReferralLedger(value: unknown): ReferralLedgerEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ReferralLedgerEntry[] = [];
  for (const raw of value.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const referrerTgId = safeTgId(entry.referrerTgId);
    const refereeTgId = safeTgId(entry.refereeTgId);
    const createdAt = isoOrNull(entry.createdAt);
    if (!referrerTgId || !refereeTgId || !createdAt) continue;
    const status = entry.status === 'qualified' ? 'qualified' : 'attributed';
    out.push({
      referrerTgId,
      refereeTgId,
      createdAt,
      status,
      qualifiedAt: isoOrNull(entry.qualifiedAt),
    });
  }
  return out;
}

interface InventoryRecordLike {
  equippedSkin: string;
  unlockedSkins: string[];
  stats: PlayerProgressStats;
  achievements: string[];
  pets: StoredPet[];
}

function getInventoryOwnedKeys(record: InventoryRecordLike): string[] {
  const keys = new Set<string>([
    FIRST_DONUT_ITEM_KEY,
    ...(record.stats.inventoryOwned ?? []),
    ...(record.stats.unlockedProfileFrames ?? []).map((key) => `frame:${key}`),
    ...record.unlockedSkins
      .filter((key) => key !== 'default')
      .map((key) => `skin:${key}`),
    ...record.achievements.map((key) => `achievement:${key}`),
    ...record.pets.map((pet) => `companion:${pet.key}`),
  ]);

  return Array.from(keys).filter((key) => Boolean(getInventoryItemDefinition(key)));
}

function isInventoryItemEquipped(record: InventoryRecordLike, itemKey: string): boolean {
  const item = getInventoryItemDefinition(itemKey);
  if (!item?.equipKey) return false;
  return (
    record.stats.equippedProfileFrame === item.equipKey ||
    record.equippedSkin === item.equipKey ||
    record.stats.equippedUi === item.equipKey ||
    record.stats.equippedAvatar === item.equipKey
  );
}

function getInventoryState(record: InventoryRecordLike): PlayerInventoryState {
  const ownedKeys = getInventoryOwnedKeys(record);
  const owned = new Set(ownedKeys);
  const showcaseKeys = Array.from(new Set(record.stats.inventoryShowcase ?? [])).filter(
    (key) => owned.has(key) && Boolean(getInventoryItemDefinition(key))
  );
  return { ownedKeys, showcaseKeys };
}

function getPublicInventoryItems(record: InventoryRecordLike, keys: string[]): PublicProfileItem[] {
  const owned = new Set(getInventoryOwnedKeys(record));
  return Array.from(new Set(keys))
    .filter((key) => owned.has(key))
    .map((key) => {
      const item = getInventoryItemDefinition(key);
      if (!item) return null;
      return {
        ...item,
        equipped: isInventoryItemEquipped(record, key),
      } as PublicProfileItem;
    })
    .filter((item): item is PublicProfileItem => item !== null);
}

/* ──────────────────────────────────────────────────────────────────────────
 * «Инвентарь оживает»: расходники.
 * Выдача и списание — только сервер: RPC grant_item / consume_item
 * (player_items + item_drops в одной транзакции) в Supabase, а в
 * memory-fallback — тот же контракт в локальном JSON. Клиент лишь просит
 * «применить», все цифры считаются здесь.
 * ────────────────────────────────────────────────────────────────────────── */

/** Множитель «Модификатора канала» (15 минут ×1.25 Data с тапов). */
export const CHANNEL_BOOST_MULTIPLIER = 1.25;
/** Бонус «Эксплойт-инъекции» к шансу следующего контракта. */
export const EXPLOIT_INJECTION_BONUS = 0.15;
/** Доля возврата входа «Протоколом-Фениксом» при провале контракта. */
export const PHOENIX_REFUND_PCT = 0.5;

const ITEM_RARITY_TITLES: Record<string, string> = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
};

function normalizeStoredItems(raw: unknown): Record<string, StoredItem> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, StoredItem> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!getConsumableItem(key)) continue;
    const entry = (value ?? {}) as Partial<StoredItem>;
    const qty = Math.floor(safeNonNeg(entry.qty, 0));
    if (qty <= 0) continue;
    const firstAt =
      typeof entry.firstAcquiredAt === 'string' ? entry.firstAcquiredAt : new Date().toISOString();
    result[key] = {
      key,
      qty,
      firstAcquiredAt: firstAt,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : firstAt,
    };
  }
  return result;
}

function itemStacks(record: StoredPlayerRecord): PlayerItemStack[] {
  return Object.values(record.items ?? {})
    .filter((item) => item.qty > 0 && Boolean(getConsumableItem(item.key)))
    .sort((a, b) => a.firstAcquiredAt.localeCompare(b.firstAcquiredAt) || a.key.localeCompare(b.key))
    .map((item) => ({
      key: item.key,
      qty: item.qty,
      firstAcquiredAt: item.firstAcquiredAt,
      updatedAt: item.updatedAt,
    }));
}

function getItemQty(record: StoredPlayerRecord, key: string): number {
  return Math.max(0, Math.floor(safeNonNeg(record.items?.[key]?.qty, 0)));
}

/** Режим записи предметов: без клиента Supabase падаем в локальный журнал. */
function itemStorageMode(mode: 'supabase' | 'memory-fallback'): 'supabase' | 'memory-fallback' {
  return mode === 'supabase' && getSupabaseAdmin() ? 'supabase' : 'memory-fallback';
}

/**
 * Выдача одного предмета. Возвращает новое количество в стопке.
 *
 * В Supabase атомарность держит RPC: upsert qty+1 и строка журнала — одна
 * транзакция, а ON CONFLICT DO UPDATE сериализует параллельные вызовы, так что
 * два одновременных дропа дают qty+2 и две строки журнала, но не дубль.
 */
async function grantItemToPlayer(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  itemKey: string,
  source: ItemDropSource,
  outcome: string | null = null
): Promise<number> {
  const cfg = getConsumableItem(itemKey);
  if (!cfg) throw new Error('Неизвестный предмет');
  const nowIso = new Date().toISOString();
  const storage = itemStorageMode(mode);
  const previous = record.items?.[itemKey];
  let nextQty = getItemQty(record, itemKey) + 1;

  if (storage === 'supabase') {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Нет клиента Supabase');
    const { data, error } = await sb.rpc('grant_item', {
      p_player_id: record.id,
      p_item_key: itemKey,
      p_source: source,
      p_outcome: outcome,
    });
    if (error) throw new Error(`grant_item: ${error.message}`);
    const responseValue = Array.isArray(data) ? data[0] : data;
    const fromDb = Number(responseValue);
    if (!Number.isFinite(fromDb) || fromDb <= 0) throw new Error('grant_item: пустой ответ');
    nextQty = fromDb;
  } else {
    const db = getLocalDb();
    const journal = Array.isArray(db.itemDrops) ? db.itemDrops : [];
    journal.push({ playerId: record.id, key: itemKey, source, outcome, createdAt: nowIso });
    // Локальный журнал не должен пухнуть в dev-режиме — храним последние 2000 строк.
    db.itemDrops = journal.length > 2000 ? journal.slice(-2000) : journal;
  }

  record.items = record.items ?? {};
  record.items[itemKey] = {
    key: itemKey,
    qty: nextQty,
    firstAcquiredAt: previous?.firstAcquiredAt ?? nowIso,
    updatedAt: nowIso,
  };
  if (storage === 'memory-fallback') persistLocalDb();
  return nextQty;
}

/**
 * Списание предмета. false — предмета не хватает.
 * В Supabase списание делает consume_item одним UPDATE с условием qty >= p_qty,
 * поэтому одно и то же применение не может пройти дважды при гонке.
 */
async function consumeItemFromPlayer(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  itemKey: string,
  qty = 1
): Promise<boolean> {
  const owned = getItemQty(record, itemKey);
  if (owned < qty) return false;
  const nowIso = new Date().toISOString();
  const storage = itemStorageMode(mode);
  let left = owned - qty;

  if (storage === 'supabase') {
    const sb = getSupabaseAdmin();
    if (!sb) return false;
    const { data, error } = await sb.rpc('consume_item', {
      p_player_id: record.id,
      p_item_key: itemKey,
      p_qty: qty,
    });
    if (error) return false;
    const responseValue = Array.isArray(data) ? data[0] : data;
    if (responseValue === null || responseValue === undefined) return false;
    const fromDb = Number(responseValue);
    left = Number.isFinite(fromDb) ? Math.max(0, fromDb) : left;
  }

  record.items = record.items ?? {};
  const previous = record.items[itemKey];
  if (left <= 0) {
    delete record.items[itemKey];
  } else {
    record.items[itemKey] = {
      key: itemKey,
      qty: left,
      firstAcquiredAt: previous?.firstAcquiredAt ?? nowIso,
      updatedAt: nowIso,
    };
  }
  if (storage === 'memory-fallback') persistLocalDb();
  return true;
}

function buildItemDropAlert(itemKey: string, source: ItemDropSource): GameAlert {
  const cfg = getConsumableItem(itemKey);
  const name = cfg?.name ?? 'Предмет';
  const rarity = cfg ? ITEM_RARITY_TITLES[cfg.rarity] ?? '' : '';
  const where =
    source === 'level'
      ? 'за новый уровень'
      : source === 'mission'
        ? 'за контракт'
        : source === 'daily'
          ? 'за полный сбор целей дня'
          : 'за взлом';
  return {
    id: crypto.randomUUID(),
    type: 'success',
    title: `Вы получили: ${name}`,
    message: `${rarity} дроп ${where}. Примени в инвентаре.`,
  };
}

/**
 * Ролл дропа ПОСЛЕ успешного исхода и запись. Возвращает выданный предмет.
 * Ошибка выдачи не ломает сам экшен: игрок просто не получает предмет и
 * уведомление, но взлом/контракт остаются засчитанными.
 */
async function rollAndGrantLoot(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[],
  source: 'hack' | 'mission',
  options: { difficulty?: string } = {}
): Promise<string | null> {
  const item = rollItemDrop(source, options);
  if (!item) return null;
  try {
    await grantItemToPlayer(record, mode, item.key, source, 'success');
  } catch (err) {
    console.warn('[inventory] drop failed', (err as Error).message);
    return null;
  }
  record.stats.hasNewItems = true;
  alerts.push(buildItemDropAlert(item.key, source));
  return item.key;
}

/**
 * Гарантированный предмет на уровнях 5/10/15/20.
 * Метка уровня пишется ДО выдачи: повторный sync не выдаст второй предмет.
 */
async function grantLevelMilestoneItems(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[]
): Promise<void> {
  const level = getLevelProgress(Math.floor(safeNonNeg(record.xp, 0))).level;
  const granted = Array.isArray(record.stats.itemMilestones) ? record.stats.itemMilestones : [];
  const pending = LEVEL_ITEM_MILESTONES.filter(
    (milestone) => level >= milestone && !granted.includes(`level_${milestone}`)
  );
  if (pending.length === 0) return;
  record.stats.itemMilestones = [...granted];
  for (const milestone of pending) {
    record.stats.itemMilestones.push(`level_${milestone}`);
    const item = rollLevelItem();
    try {
      await grantItemToPlayer(record, mode, item.key, 'level', `milestone_${milestone}`);
    } catch (err) {
      console.warn('[inventory] milestone drop failed', (err as Error).message);
      continue;
    }
    record.stats.hasNewItems = true;
    alerts.push(buildItemDropAlert(item.key, 'level'));
  }
}

function channelBoostUntilMs(record: StoredPlayerRecord): number {
  const parsed = Date.parse(String(record.stats.channelBoostUntil ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isChannelBoostActive(record: StoredPlayerRecord, nowMs: number = Date.now()): boolean {
  return channelBoostUntilMs(record) > nowMs;
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

/**
 * Выдача контрактов на игровые сутки.
 *
 * Смена дня: старый набор просто заменяется новым — незакрытые контракты
 * сгорают без штрафа, накопленный прогресс не переносится. Это осознанно:
 * контракт — короткая цель на день, а не долг, который копится.
 */
function ensureContracts(record: StoredPlayerRecord, dayKey: string): ContractState {
  const current = record.stats.contracts;
  const currentIsValid =
    current?.dayKey === dayKey &&
    current.ids.length > 0 &&
    current.ids.length <= MAX_ACTIVE_CONTRACTS &&
    current.ids.every((id) => Boolean(getContractDefinition(id)));

  if (!currentIsValid) {
    const ids = getDailyContracts(record.tgId, dayKey)
      .map((contract) => contract.key)
      .slice(0, Math.min(CONTRACTS_PER_DAY, MAX_ACTIVE_CONTRACTS));
    record.stats.contracts = {
      dayKey,
      ids,
      progress: Object.fromEntries(ids.map((id) => [id, 0])),
      claimed: [],
    };
  }

  const state = record.stats.contracts;
  if (!state) throw new Error('Не удалось подготовить контракты');
  for (const id of state.ids) {
    const target = getContractDefinition(id)?.target ?? 0;
    state.progress[id] = Math.max(0, Math.min(target, Math.floor(Number(state.progress[id]) || 0)));
  }
  state.claimed = state.claimed.filter((id) => state.ids.includes(id));
  return state;
}

/**
 * Доска целей дня (v1.6).
 *
 * Живёт на UTC-сутках и пересоздаётся только при смене даты: таргеты
 * фиксируются в момент создания, поэтому прокачка уровня среди дня не делает
 * уже начатую цель дороже. Старый сейв без stats.dailyGoals получает свежую
 * доску при первом же синке — отдельная миграция данных не нужна.
 */
function ensureDailyGoals(
  record: StoredPlayerRecord,
  dayKey: string = getUtcDayKey(Date.now())
) {
  const current = record.stats.dailyGoals;
  const valid =
    current !== undefined &&
    current.date === dayKey &&
    current.goals.length === DAILY_GOALS_PER_DAY &&
    current.goals.every((goal) => isDailyGoalKind(goal.key)) &&
    new Set(current.goals.map((goal) => goal.key)).size === DAILY_GOALS_PER_DAY;

  if (!valid) {
    // item_use попадает в доску только если расходник реально есть: иначе цель
    // недостижима весь день, а не «сложна».
    const hasConsumables = itemStacks(record).length > 0;
    record.stats.dailyGoals = buildDailyGoalsBoard(
      record.tgId,
      dayKey,
      deriveStats(record).level,
      hasConsumables
    );
  }

  const state = record.stats.dailyGoals;
  if (!state) throw new Error('Не удалось подготовить цели дня');
  for (const goal of state.goals) {
    goal.target = Math.max(1, Math.floor(goal.target));
    goal.progress = Math.max(0, Math.min(goal.target, Math.floor(Number(goal.progress) || 0)));
    goal.claimed = goal.claimed === true;
  }
  return state;
}

function createSeasonEventState(weekKey: string): SeasonEventState {
  return {
    version: 2,
    eventKey: ACTIVE_SEASON_EVENT.key,
    weekKey,
    currentDay: 1,
    days: {},
    completedDays: [],
    participationClaimed: false,
    masteryClaimed: false,
  };
}

function sameSeasonEventTasks(
  actual: SeasonEventState['days'][string]['tasks'],
  expected: SeasonEventState['days'][string]['tasks']
): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((task, index) => {
    const candidate = expected[index];
    return (
      task.key === candidate.key &&
      task.kind === candidate.kind &&
      task.target === candidate.target &&
      task.title === candidate.title &&
      task.description === candidate.description &&
      task.icon === candidate.icon
    );
  });
}

function ensureSeasonEvent(record: StoredPlayerRecord, nowMs: number = Date.now()): SeasonEventState {
  const window = getSeasonEventWindow(nowMs);
  const current = record.stats.seasonEvent;
  if (
    !current ||
    current.version !== 2 ||
    current.eventKey !== ACTIVE_SEASON_EVENT.key ||
    current.weekKey !== window.weekKey
  ) {
    record.stats.seasonEvent = createSeasonEventState(window.weekKey);
  }

  const state = record.stats.seasonEvent;
  if (!state) throw new Error('Не удалось подготовить сезонную операцию');

  const calendarDay = getSeasonEventDayNumber(nowMs);
  if (calendarDay >= 1 && calendarDay <= SEASON_EVENT_DAY_COUNT) {
    state.currentDay = calendarDay;
    const dayKey = new Date(window.startMs + (calendarDay - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const key = String(calendarDay);
    const existing = state.days[key];
    if (!existing) {
      const levelAtGeneration = deriveStats(record).level;
      const tasks = getSeasonEventDayTasks(calendarDay, dayKey, levelAtGeneration);
      state.days[key] = {
        day: calendarDay,
        dayKey,
        levelAtGeneration,
        tasks,
        progress: Object.fromEntries(tasks.map((task) => [task.key, 0])),
        completed: false,
        completedAt: null,
      };
    } else {
      // Дневной набор — immutable: если JSON был подменён или повреждён,
      // сервер удаляет только этот незавершённый день и создаёт канонический
      // набор из сохранённого levelAtGeneration. Уже завершённые дни не reroll'ятся.
      const expected = getSeasonEventDayTasks(existing.day, existing.dayKey, existing.levelAtGeneration);
      if (!sameSeasonEventTasks(existing.tasks, expected)) {
        if (existing.completed) {
          throw new Error('Повреждённый завершённый набор сезонных задач');
        }
        state.days[key] = {
          day: calendarDay,
          dayKey: existing.dayKey,
          levelAtGeneration: existing.levelAtGeneration,
          tasks: expected,
          progress: Object.fromEntries(expected.map((task) => [task.key, 0])),
          completed: false,
          completedAt: null,
        };
      }
    }
  }

  state.completedDays = Array.from(
    new Set(
      state.completedDays
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= SEASON_EVENT_DAY_COUNT)
        .filter((day) => state.days[String(day)]?.completed === true)
    )
  ).sort((a, b) => a - b);
  state.participationClaimed = state.participationClaimed && state.completedDays.length > 0;
  state.masteryClaimed =
    state.masteryClaimed && state.completedDays.length === SEASON_EVENT_DAY_COUNT;
  return state;
}

function grantSeasonEventRewards(record: StoredPlayerRecord, state: SeasonEventState): void {
  const unlocked = new Set(record.stats.unlockedProfileFrames ?? []);
  if (state.completedDays.length > 0) {
    const wasParticipationClaimed = state.participationClaimed;
    state.participationClaimed = true;
    unlocked.add(ACTIVE_SEASON_EVENT.participationFrameKey);
    // Equip only at the moment of the first award. Completing another day must
    // not silently replace a frame the player chose in the Profile tab.
    if (!wasParticipationClaimed) {
      record.stats.equippedProfileFrame = ACTIVE_SEASON_EVENT.participationFrameKey;
    }
  }
  if (state.completedDays.length === SEASON_EVENT_DAY_COUNT) {
    const wasMasteryClaimed = state.masteryClaimed;
    state.masteryClaimed = true;
    unlocked.add(ACTIVE_SEASON_EVENT.masteryFrameKey);
    if (!wasMasteryClaimed) {
      record.stats.equippedProfileFrame = ACTIVE_SEASON_EVENT.masteryFrameKey;
    }
  }
  record.stats.unlockedProfileFrames = Array.from(unlocked);
}

function incrementSeasonEventProgress(
  record: StoredPlayerRecord,
  kind: DailyTaskKind,
  amount: number
): void {
  const state = record.stats.seasonEvent;
  if (!state || amount <= 0) return;
  const day = state.days[String(state.currentDay)];
  if (!day || day.completed) return;
  for (const task of day.tasks) {
    if (task.kind !== kind) continue;
    day.progress[task.key] = Math.min(
      task.target,
      (day.progress[task.key] ?? 0) + Math.floor(amount)
    );
  }
  if (day.tasks.every((task) => (day.progress[task.key] ?? 0) >= task.target)) {
    day.completed = true;
    day.completedAt = new Date(Date.now()).toISOString();
    if (!state.completedDays.includes(day.day)) state.completedDays.push(day.day);
    state.completedDays.sort((a, b) => a - b);
    grantSeasonEventRewards(record, state);
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
 * Прогресс цели дня. Вызывается ТОЛЬКО из серверных хендлеров после того, как
 * действие уже проверено (античит тапов, исход взлома, исход контракта,
 * фактическое списание CPU Charge или расходника). Забранная цель прогресс не
 * двигает: её цифры зафиксированы на моменте сбора.
 */
function incrementDailyGoalProgress(
  record: StoredPlayerRecord,
  kind: DailyGoalKind,
  amount: number
): void {
  const state = record.stats.dailyGoals;
  if (!state) return;
  const step = Math.floor(Number(amount));
  if (!Number.isFinite(step) || step <= 0) return;
  for (const goal of state.goals) {
    if (goal.key !== kind || goal.claimed) continue;
    goal.progress = Math.min(goal.target, Math.max(0, goal.progress) + step);
  }
}

/**
 * Прогресс контрактов растёт от уже существующих действий игрока: тап, списание
 * CPU Charge на запуск контракта, Heat по итогам взлома и закрытие контракта.
 * Отдельного действия «поиграть в контракт» нет — иначе это была бы вторая
 * мини-игра поверх первой.
 */
function incrementContractProgress(
  record: StoredPlayerRecord,
  metric: ContractMetric,
  amount: number
): void {
  const state = record.stats.contracts;
  if (!state || amount <= 0) return;
  for (const id of state.ids) {
    const contract = getContractDefinition(id);
    if (!contract || contract.metric !== metric) continue;
    if (state.claimed.includes(id)) continue;
    state.progress[id] = Math.min(
      contract.target,
      (state.progress[id] ?? 0) + Math.floor(amount)
    );
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
  /** «Инвентарь оживает»: журнал дропа — локальный аналог таблицы item_drops. */
  itemDrops?: StoredItemDrop[];
}

/** Строка журнала дропа (локальный режим). */
export interface StoredItemDrop {
  playerId: string;
  key: string;
  source: ItemDropSource;
  outcome: string | null;
  createdAt: string;
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
/**
 * Сужает пул до мира игрока (v5.5):
 *  • выбрасывает контракты локаций, которые ещё не открыты по уровню
 *    (это же правило проверяет startMission — клиент не может обойти его);
 *  • поднимает наверх контракты текущей локации;
 *  • если в локации меньше MIN_LOCATION_OFFER контрактов, добирает «Улицу»,
 *    чтобы игрок никогда не остался без работы.
 */
function scopeOfferPool(
  pool: MissionConfig[],
  playerLevel: number,
  locationId: LocationId
): MissionConfig[] {
  const reachable = pool.filter((mission) => isLocationMissionStartable(mission, playerLevel));
  const base = reachable.length > 0 ? reachable : pool;
  const local = base.filter((mission) => missionLocationId(mission) === locationId);
  const street = base.filter(
    (mission) => missionLocationId(mission) === WORLD_FALLBACK_LOCATION_ID
  );
  if (local.length >= MIN_LOCATION_OFFER) return local;
  const seen = new Set(local.map((mission) => mission.key));
  const toppedUp = [...local];
  for (const mission of street) {
    if (toppedUp.length >= MIN_LOCATION_OFFER) break;
    if (seen.has(mission.key)) continue;
    seen.add(mission.key);
    toppedUp.push(mission);
  }
  return toppedUp.length > 0 ? toppedUp : base;
}

/** Минимальный размер витрины одной локации: меньше — уже «пусто». */
const MIN_LOCATION_OFFER = 4;

export function pickMissionOffer(
  unlockedGrey: boolean,
  seed = 0,
  playerLevel = 99,
  locationId?: LocationId
): string[] {
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
  const levelScoped = MISSIONS_CONFIG.filter((m) => (m.minLevel ?? 1) <= playerLevel);
  // v5.5: при включённом мире витрина учитывает открытые локации. Без locationId
  // (флаг выключен) пул остаётся прежним — поведение до релиза не меняется.
  const unlocked = locationId ? scopeOfferPool(levelScoped, playerLevel, locationId) : levelScoped;
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

const MISSION_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Локация, для которой строим витрину миссий.
 *
 * Возвращает undefined, когда мир выключен (WORLD_V2=false) — тогда витрина
 * остаётся общей, как до v5.5. Если сохранённая локация почему-то недоступна
 * (например, уровень упал после prestige), откатываемся в Комнату.
 */
export function offerLocationId(
  stats: { locationId?: string } | undefined,
  level: number
): LocationId | undefined {
  if (!isWorldV2Enabled()) return undefined;
  const candidate = resolveLocationId(stats?.locationId);
  return isLocationUnlocked(candidate, level) ? candidate : HOME_LOCATION_ID;
}

/**
 * v6.5: множители мира, которые применяет экономика (shared/locations.ts).
 * Одна точка чтения — миссии, взломы и тапы берут числа отсюда, а UI подписывает
 * те же значения через locationEffectLabel. При выключенном WORLD_V2 — Комната.
 */
function locationEconomy(stats: { locationId?: string } | undefined): {
  id: LocationId;
  mods: LocationModifiers;
} {
  const enabled = isWorldV2Enabled();
  return {
    id: economyLocationId(stats?.locationId, enabled),
    mods: economyModifiers(stats?.locationId, enabled),
  };
}

function computeOfferWindow(
  tgId: number,
  unlockedGrey: boolean,
  playerLevel = 99,
  refreshSalt = 0,
  locationId?: LocationId
): { keys: string[]; refreshedAt: string } {
  const windowMs = MISSION_REFRESH_COOLDOWN_MS;
  const windowIndex = Math.floor(Date.now() / windowMs);
  // Salt хранится в players.stats, а не в памяти Lambda: после холодного старта
  // и на другом Vercel-инстансе игрок получает тот же самый скан целей.
  const salt = Math.max(0, Math.floor(Number(refreshSalt) || 0));
  const seed = Math.abs(tgId * 31 + windowIndex * 7919 + salt * 104729);
  return {
    keys: pickMissionOffer(unlockedGrey, seed, playerLevel, locationId),
    refreshedAt: new Date(windowIndex * windowMs).toISOString(),
  };
}

function createFreshRecord(user: VerifiedTelegramUser): StoredPlayerRecord {
  const nowIso = new Date().toISOString();
  const offer = computeOfferWindow(
    user.tgId,
    false,
    1,
    0,
    offerLocationId(undefined, 1)
  );
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
    items: {},
  };
}

/** Человеческая формулировка шанса успеха для алертов. */
function describeOdds(chance: number): string {
  if (chance >= 0.8) return 'полная готовность';
  if (chance >= 0.55) return 'рискованно, но реально';
  return 'не готов — высокий риск провала';
}

const recentClickTimestamps = new Map<number, number>();

const MAX_SAFE_DATA_BALANCE = Number.MAX_SAFE_INTEGER;

function safeNonNeg(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function safeDataBalance(val: unknown): number {
  const n = Number(val);
  if (Number.isNaN(n) || n < 0) return 0;
  // Numeric 'Infinity' from an old/compromised row is capped, never allowed
  // to become a zero/NaN reward or leak into JSON.
  return Math.min(MAX_SAFE_DATA_BALANCE, n);
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
      rec.prestigeCount = getSafePrestigeCount(rec.prestigeCount);
      rec.pets = Array.isArray(rec.pets) ? rec.pets : [];
      rec.baseUpgrades = rec.baseUpgrades && typeof rec.baseUpgrades === 'object' ? rec.baseUpgrades : {};
      rec.stats = normalizeStats(rec.stats);
      rec.items = normalizeStoredItems(rec.items);
    }
    const localRecord = db.playersByTgId[key];
    ensurePermanentProfileFrameGifts(localRecord.stats, localRecord.tgId);
    ensurePermanentProfileInventoryGifts(localRecord.stats, localRecord.tgId);
    migrateLegacyEquippedSkins(localRecord);
    return { record: localRecord, mode: 'memory-fallback' };
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
        'id, mission_key, target_type, target_name, started_at, finish_at, reward, rep_delta, heat_delta, crypto_reward, xp_reward, energy_cost, data_cost, success_chance, outcome'
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
  ensurePermanentProfileFrameGifts(persistedStats, Number(playerRow.tg_id));
  ensurePermanentProfileInventoryGifts(persistedStats, Number(playerRow.tg_id));
  const offer = computeOfferWindow(
    user.tgId,
    hasAnalyst,
    previewLevel,
    persistedStats.missionRefreshSalt,
    offerLocationId(persistedStats, previewLevel)
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

  // Миграция 022 может быть ещё не применена — тогда просто пустой инвентарь:
  // игра обязана работать до накатки SQL владельцем. Ошибку не глушим молча в лог.
  let itemsMap: Record<string, StoredItem> = {};
  const itemsRes = await sb
    .from('player_items')
    .select('item_key, qty, first_acquired_at, updated_at')
    .eq('player_id', pid);
  if (itemsRes.error) {
    console.warn('[inventory] player_items не прочитан:', itemsRes.error.message);
  } else {
    const raw: Record<string, StoredItem> = {};
    for (const row of itemsRes.data ?? []) {
      raw[String(row.item_key)] = {
        key: String(row.item_key),
        qty: Number(row.qty) || 0,
        firstAcquiredAt: String(row.first_acquired_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      };
    }
    itemsMap = normalizeStoredItems(raw);
  }

  const energyUpdatedIso = String(playerRow.energy_updated ?? new Date().toISOString());
  const dbEnergyTs = Date.parse(energyUpdatedIso);
  // Даже после холодного рестарта Lambda берём timestamp последнего обновления энергии из PostgreSQL!
  const warmClickTs = recentClickTimestamps.get(user.tgId) ?? (Number.isFinite(dbEnergyTs) ? dbEnergyTs : 0);

  const record: StoredPlayerRecord = {
    id: pid,
    tgId: Number(playerRow.tg_id),
    username: String(playerRow.username),
    data: safeDataBalance(playerRow.data),
    crypto: Math.floor(safeNonNeg(playerRow.crypto, 5)),
    chips: Math.floor(safeNonNeg(playerRow.chips, 0)),
    xp: Math.floor(safeNonNeg(playerRow.xp, 0)),
    cardTier: Math.max(1, Math.min(4, Math.floor(safeNonNeg(playerRow.card_tier, 1)) || 1)),
    energy: Math.floor(safeNonNeg(playerRow.energy, BASE_MAX_ENERGY)),
    energyUpdated: energyUpdatedIso,
    heat: Math.floor(safeNonNeg(playerRow.heat, 0)),
    rep: Math.floor(safeNonNeg(playerRow.rep, 0)),
    prestigeCount: getSafePrestigeCount(safeNonNeg(playerRow.prestige_count, 0)),
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
      reward: safeDataBalance(m.reward),
      repDelta: Number.isFinite(Number(m.rep_delta)) ? Math.trunc(Number(m.rep_delta)) : 0,
      heatDelta: Math.floor(safeNonNeg(m.heat_delta, 0)),
      cryptoReward: Math.floor(safeNonNeg(m.crypto_reward, 0)),
      xpReward: Math.floor(safeNonNeg(m.xp_reward, 0)),
      entryEnergyCost: Math.floor(safeNonNeg(m.energy_cost, 0)),
      entryDataCost: Math.floor(safeNonNeg(m.data_cost, 0)),
      successChance: Math.max(0, Math.min(1, Number(m.success_chance) || 0)),
      outcome: m.outcome === 'success' || m.outcome === 'fail' ? m.outcome : ('partial' as const),
    })),
    availableMissionKeys: offer.keys,
    missionsRefreshedAt: offer.refreshedAt,
    achievements: Array.from(new Set((achRes.data ?? []).map((a) => String(a.key)))),
    items: itemsMap,
  };

  migrateLegacyEquippedSkins(record);
  return { record, mode: 'supabase' };
}

async function savePlayerCore(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  expectedXp?: number,
  expectedData?: number,
  expectedEnergy?: number,
  expectedRep?: number,
  expectedHeat?: number
): Promise<void> {
  recentClickTimestamps.set(record.tgId, record.lastClickBatchAt);
  // Защита от переполнения и отрицательных значений перед записью в БД
  record.data = Math.max(0, Math.min(MAX_SAFE_DATA_BALANCE, Math.floor(safeDataBalance(record.data) * 100) / 100));
  record.crypto = Math.max(0, Math.floor(safeNonNeg(record.crypto, 0)));
  record.rep = Math.max(0, Math.floor(safeNonNeg(record.rep, 0)));
  record.heat = Math.max(0, Math.floor(safeNonNeg(record.heat, 0)));
  record.totalClicks = Math.max(0, Math.floor(safeNonNeg(record.totalClicks, 0)));
  record.totalMissions = Math.max(0, Math.floor(safeNonNeg(record.totalMissions, 0)));
  record.chips = Math.max(0, Math.floor(safeNonNeg(record.chips, 0)));
  record.xp = Math.max(0, Math.floor(safeNonNeg(record.xp, 0)));
  record.prestigeCount = getSafePrestigeCount(record.prestigeCount);
  record.cardTier = Math.max(1, Math.min(4, Math.floor(safeNonNeg(record.cardTier, 1)) || 1));
  record.stats = normalizeStats(record.stats);
  ensurePermanentProfileInventoryGifts(record.stats, record.tgId);

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

  // Сначала фиксируем состояние питомцев и только потом списываем Data/Rep/
  // Crypto в players. Раньше ошибка upsert в pets проглатывалась, а players
  // уже сохранялся: корм стоил валюту, но после следующего init голод
  // возвращался к старому значению. Теперь запись питомца — обязательная часть
  // операции для всех питомцев.
  //
  // Снимок нужен для компенсации: если UPDATE players не прошёл после upsert
  // pets, возвращаем предыдущие строки, чтобы не получить «бесплатное» кормление
  // или покупку питомца.
  let previousPetRows: Array<Record<string, unknown>> | null = null;
  const restorePetRows = async (): Promise<void> => {
    if (previousPetRows === null) return;
    const previousPetKeys = new Set(previousPetRows.map((row) => String(row.pet_key)));
    const newlyAddedPetKeys = record.pets
      .map((pet) => pet.key)
      .filter((key) => !previousPetKeys.has(key));
    if (newlyAddedPetKeys.length > 0) {
      const { error: deleteError } = await sb
        .from('pets')
        .delete()
        .eq('player_id', record.id)
        .in('pet_key', newlyAddedPetKeys);
      if (deleteError) throw new Error(`Не удалось откатить состояние питомца: ${deleteError.message}`);
    }
    if (previousPetRows.length === 0) return;
    const { error } = await sb.from('pets').upsert(previousPetRows, { onConflict: 'player_id,pet_key' });
    if (error) throw new Error(`Не удалось откатить состояние питомца: ${error.message}`);
  };

  if (record.pets.length > 0) {
    const { data: petRows, error: petsReadError } = await sb
      .from('pets')
      .select('player_id, pet_key, hunger, last_fed_at, feed_count')
      .eq('player_id', record.id);
    if (petsReadError) {
      throw new Error(`Не удалось прочитать состояние питомца: ${petsReadError.message}`);
    }
    previousPetRows = (petRows ?? []) as Array<Record<string, unknown>>;

    const { error: petsError } = await sb.from('pets').upsert(
      record.pets.map((p) => ({
        player_id: record.id,
        pet_key: p.key,
        hunger: Math.max(0, Math.min(100, p.hunger)),
        last_fed_at: p.lastFedAt,
        feed_count: Math.max(0, Math.floor(p.feedCount)),
      })),
      { onConflict: 'player_id,pet_key' }
    );
    if (petsError) {
      try {
        await restorePetRows();
      } catch {
        // Возвращаем исходную ошибку upsert: главное — не обновлять players.
      }
      throw new Error(`Не удалось сохранить состояние питомца: ${petsError.message}`);
    }
  }

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
  if (expectedData !== undefined) {
    const normalizedExpectedData = Math.max(0, Math.floor(safeNonNeg(expectedData, 0) * 100) / 100);
    updateQuery = updateQuery.eq('data', normalizedExpectedData);
  }
  if (expectedEnergy !== undefined) {
    const normalizedExpectedEnergy = Math.max(0, Math.floor(safeNonNeg(expectedEnergy, 0)));
    updateQuery = updateQuery.eq('energy', normalizedExpectedEnergy);
  }
  if (expectedRep !== undefined) {
    const normalizedExpectedRep = Math.max(0, Math.floor(safeNonNeg(expectedRep, 0)));
    updateQuery = updateQuery.eq('rep', normalizedExpectedRep);
  }
  if (expectedHeat !== undefined) {
    const normalizedExpectedHeat = Math.max(0, Math.floor(safeNonNeg(expectedHeat, 0)));
    updateQuery = updateQuery.eq('heat', normalizedExpectedHeat);
  }
  const { data: updatedRows, error } = await updateQuery.select('id');

  if (error) {
    try {
      await restorePetRows();
    } catch (rollbackError) {
      throw new Error(`Supabase update player error: ${error.message}; ${rollbackError instanceof Error ? rollbackError.message : 'rollback failed'}`);
    }
    throw new Error(`Supabase update player error: ${error.message}`);
  }
  if (!updatedRows || updatedRows.length === 0) {
    try {
      await restorePetRows();
    } catch (rollbackError) {
      throw new Error(
        `${expectedXp !== undefined ? 'Ежедневное поручение уже обрабатывается в другой сессии — обнови экран' : 'Supabase update player affected no rows'}; ${rollbackError instanceof Error ? rollbackError.message : 'rollback failed'}`
      );
    }
    if (expectedXp !== undefined) {
      throw new Error('Ежедневное поручение уже обрабатывается в другой сессии — обнови экран');
    }
    throw new Error('Supabase update player affected no rows');
  }

  // «База» живёт в отдельной таблице и является частью player snapshot.
  // Ошибка здесь больше не проглатывается: иначе Data/Chips уже списаны, а
  // уровень улучшения исчезает после reload.
  const baseRows = Object.entries(record.baseUpgrades)
    .filter(([, lvl]) => Number.isFinite(lvl) && lvl > 0)
    .map(([key, lvl]) => ({
      player_id: record.id,
      upgrade_key: key,
      level: Math.max(1, Math.min(15, Math.floor(lvl))),
    }));
  if (baseRows.length > 0) {
    const { error: baseError } = await sb
      .from('base_upgrades')
      .upsert(baseRows, { onConflict: 'player_id,upgrade_key' });
    if (baseError) throw new Error(`Не удалось сохранить Базу: ${baseError.message}`);
  }
}

type AtomicExpectedSnapshot = {
  data: number;
  energy: number;
  crypto: number;
  chips: number;
  xp: number;
  rep: number;
  heat: number;
  totalClicks: number;
  totalMissions: number;
  prestigeCount: number;
  cardTier: number;
};

type AtomicPurchaseOperation = 'player' | 'card' | 'base' | 'team' | 'pet_buy' | 'pet_feed';

type AtomicPurchasePayload = {
  itemKey?: string;
  itemLevel?: number;
  hunger?: number;
  lastFedAt?: string;
  feedCount?: number;
};

function captureAtomicExpected(record: StoredPlayerRecord): AtomicExpectedSnapshot {
  return {
    data: record.data,
    energy: record.energy,
    crypto: record.crypto,
    chips: record.chips,
    xp: record.xp,
    rep: record.rep,
    heat: record.heat,
    totalClicks: record.totalClicks,
    totalMissions: record.totalMissions,
    prestigeCount: record.prestigeCount,
    cardTier: record.cardTier,
  };
}

async function commitPurchaseAtomic(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  expected: AtomicExpectedSnapshot,
  operation: AtomicPurchaseOperation,
  payload: AtomicPurchasePayload = {}
): Promise<void> {
  if (mode === 'memory-fallback') {
    await savePlayerCore(record, mode);
    return;
  }

  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase недоступен: покупка не подтверждена');

  record.data = Math.max(0, Math.min(MAX_SAFE_DATA_BALANCE, Math.floor(safeDataBalance(record.data) * 100) / 100));
  record.crypto = Math.max(0, Math.floor(safeNonNeg(record.crypto, 0)));
  record.rep = Math.max(0, Math.floor(safeNonNeg(record.rep, 0)));
  record.heat = Math.max(0, Math.floor(safeNonNeg(record.heat, 0)));
  record.totalClicks = Math.max(0, Math.floor(safeNonNeg(record.totalClicks, 0)));
  record.totalMissions = Math.max(0, Math.floor(safeNonNeg(record.totalMissions, 0)));
  record.chips = Math.max(0, Math.floor(safeNonNeg(record.chips, 0)));
  record.xp = Math.max(0, Math.floor(safeNonNeg(record.xp, 0)));
  record.prestigeCount = getSafePrestigeCount(record.prestigeCount);
  record.cardTier = Math.max(1, Math.min(4, Math.floor(safeNonNeg(record.cardTier, 1)) || 1));
  record.stats = normalizeStats(record.stats);
  ensurePermanentProfileInventoryGifts(record.stats, record.tgId);

  const derived = deriveStats(record);
  record.energy = Math.max(0, Math.min(derived.maxEnergy, Math.floor(safeNonNeg(record.energy, 0))));

  const snapshot = {
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
  };

  const { error } = await sb.rpc('commit_purchase_atomic', {
    p_player_id: record.id,
    p_expected: {
      data: expected.data,
      energy: expected.energy,
      crypto: expected.crypto,
      chips: expected.chips,
      xp: expected.xp,
      rep: expected.rep,
      heat: expected.heat,
      total_clicks: expected.totalClicks,
      total_missions: expected.totalMissions,
      prestige_count: expected.prestigeCount,
      card_tier: expected.cardTier,
    },
    p_snapshot: snapshot,
    p_operation: operation,
    p_item_key: payload.itemKey,
    p_item_level: payload.itemLevel,
    p_hunger: payload.hunger,
    p_last_fed_at: payload.lastFedAt,
    p_feed_count: payload.feedCount,
  });
  if (error) {
    if (error.message.includes('PURCHASE_CONFLICT')) {
      throw new Error('Баланс изменился в другой сессии — обновите экран');
    }
    if (error.message.includes('ALREADY_PROCESSED')) {
      throw new Error('Покупка уже подтверждена в другой сессии');
    }
    throw new Error(`Ошибка атомарной покупки: ${error.message}`);
  }
}

/**
 * v6.8: анонс следующего ротационного ивента — за 12 часов, один раз на окно.
 *
 * Живёт в общей синхронизации, поэтому анонс придёт при любом действии игрока,
 * а не только на экране «Стол». Отдельного канала уведомлений не заводим:
 * используется тот же стек алертов, что и остальные новости.
 */
function announceUpcomingEvent(
  record: StoredPlayerRecord,
  alerts: GameAlert[],
  nowMs: number
): void {
  const announced = record.stats.eventAnnouncements ?? (record.stats.eventAnnouncements = {});
  const next = getEventAnnouncement(nowMs, announced);
  if (!next) return;
  announced[eventAnnouncementKey(next)] = new Date(nowMs).toISOString();
  const mods = describeEventModifiers(next.event.modifiers);
  const hours = Math.max(1, Math.round(next.hoursLeft));
  alerts.push({
    id: crypto.randomUUID(),
    type: 'info',
    title: `${next.event.emoji} Скоро: ${next.event.title}`,
    message:
      `${next.event.showcase} Старт через ${hours} ч — ${formatEventEnd(next.startsAtMs)}.` +
      (mods ? ` Влияние: ${mods}.` : ''),
  });
}

/** Факты прогрессии из записи игрока: те же числа, что видит клиент. */
function storyFactsFromRecord(record: StoredPlayerRecord) {
  const derived = deriveStats(record);
  return {
    level: derived.level,
    clicks: record.totalClicks,
    missions: record.totalMissions,
    greyMissions: record.stats.greyMissions,
    cardLevels: derived.totalCardLevels,
    teamSize: record.team.length,
    pets: record.pets.length,
    petFeedings: record.stats.petFeedings,
    achievements: record.achievements.length,
    bestHeatEscape: record.stats.bestHeatEscape,
    hacksByTier: Object.values(record.stats.hacksByTier ?? {}).reduce((sum, n) => sum + n, 0),
  };
}

async function syncTimeAndRules(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  alerts: GameAlert[],
  /**
   * v5.6: init-контекст. skipLegacyOffline=true означает, что за это отсутствие
   * платит новая retention-копилка (stats.pendingOffline + claim_offline), а
   * старая выплата v3.2 за этот же отрезок молчит — двойной оплаты быть не может.
   */
  opts?: { skipLegacyOffline?: boolean }
): Promise<{ offlineEarned: number; offlineTaps: number }> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 0. Анонс сезонного ивента за 12 часов до старта (v6.8).
  // Ключ анонса включает дату старта, поэтому повторные запросы в те же часы
  // молчат, а следующее окно недели анонсируется заново.
  announceUpcomingEvent(record, alerts, nowMs);

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
  if (passiveWindow && !opts?.skipLegacyOffline) {
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
  if (tapWindow && derived.clickPower > 0 && !opts?.skipLegacyOffline) {
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
    !opts?.skipLegacyOffline &&
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
  // Контракты дня живут по тем же московским суткам и выдаются здесь же.
  ensureContracts(record, nowDayKey);
  // Цели дня (v1.6) — отдельная система на UTC-сутках: своя доска из трёх
  // целей и ручной сбор. Смена даты пересобирает её, всё остальное не трогает.
  ensureDailyGoals(record, getUtcDayKey(nowMs));
  // Один короткий киберинцидент в сутки добавляет выбор, но не новую валюту
  // и не обязательный гринд. Сценарий фиксируется сервером до смены дня.
  ensureDailyIncident(record.stats, record.tgId, nowDayKey);
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
  // v5.6: журнал приглашённого помечает «первый сеанс засчитан» ТОЛЬКО когда
  // друг реально наиграл свои 8 минут (тот же порог, что у выплаты рефереру).
  // Иначе статус «засчитан» появлялся бы в момент перехода по ссылке.
  if (
    record.stats.referredByTgId &&
    (record.stats.activeSecondsToday ?? 0) >= REFERRAL_QUALIFY_ACTIVE_SECONDS
  ) {
    markReferralQualified(record);
  }
  const refPayout = await payoutReferrals(record, derived.level, derived.dataPerHour);
  if (refPayout.count > 0) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🔗 Друг засчитан: +${Math.round(refPayout.xp)} XP`,
      message:
        `Тебе начислено ${Math.round(refPayout.data).toLocaleString('ru-RU')} Data` +
        (refPayout.chips > 0 ? ` и ${refPayout.chips} ⚙️ Чипов` : '') +
        ` за ${refPayout.count} приглашённ${refPayout.count === 1 ? 'ого' : 'ых'}. Спасибо, что зовёшь людей!`,
    });
  }

  // 4. Авто-обновление витрины миссий каждые 15 минут
  const refreshedMs = new Date(record.missionsRefreshedAt).getTime();
  if (Number.isNaN(refreshedMs) || nowMs - refreshedMs >= MISSION_REFRESH_COOLDOWN_MS) {
    const nextOffer = computeOfferWindow(
      record.tgId,
      derived.unlockedGreyMissions,
      derived.level,
      record.stats.missionRefreshSalt,
      offerLocationId(record.stats, derived.level)
    );
    record.availableMissionKeys = nextOffer.keys;
    record.missionsRefreshedAt = nowIso;
  }

  // 5. Проверка штрафа Heat > 100
  // v5.4: новичок (ни карточки, ни миссии) не получает штраф вообще. Иначе
  // первый же Heat-всплеск отбирал 10% Data и блокировал клики на 60 секунд до
  // того, как игрок увидел первую награду (аудит: 97% не сделали ни одного тапа).
  const newbieProtection = isNewbieProtectionActive(
    newPlayerSnapshotFromCounters({
      totalCardLevels: derived.totalCardLevels,
      totalMissions: record.totalMissions,
      totalClicks: record.totalClicks,
    })
  );
  if (newbieProtection && record.heat > HEAT_PENALTY_THRESHOLD) {
    // Heat держим на пороге: ни блокировки, ни списания, ни алерта.
    record.heat = HEAT_PENALTY_THRESHOLD;
  }
  if (!newbieProtection && record.heat > HEAT_PENALTY_THRESHOLD) {
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
  tryUnlock('first_chip', record.chips > 0);

  tryUnlock('desk_lvl_5', updatedDerived.level >= 5);
  tryUnlock('desk_lvl_10', updatedDerived.level >= 10);
  tryUnlock('desk_lvl_15', updatedDerived.level >= 15);
  tryUnlock('triple_slots_20', updatedDerived.level >= 20);
  tryUnlock('desk_lvl_25', updatedDerived.level >= 25);
  tryUnlock('desk_lvl_30', updatedDerived.level >= 30);
  // v6.6: цели «пустой середины» L28–L36.
  tryUnlock('level_28', updatedDerived.level >= 28);
  tryUnlock('level_32', updatedDerived.level >= 32);
  tryUnlock('level_36', updatedDerived.level >= 36);
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
  tryUnlock('base_max_one', maxBaseLevel >= 15);
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
          const trustedTelemetry = !CLIENT_TELEMETRY_ACHIEVEMENTS.has(achKey);
          const cryptoReward = trustedTelemetry ? cfg.cryptoReward : 0;
          const chipReward = trustedTelemetry ? cfg.chipReward ?? 0 : 0;
          const dataReward = trustedTelemetry ? cfg.dataReward ?? 0 : 0;
          record.crypto += cryptoReward;
          if (chipReward) record.chips += chipReward;
          if (dataReward) record.data += dataReward;
          const extra: string[] = [];
          if (chipReward) extra.push(`+${chipReward} ⚙️ Чипов`);
          if (dataReward) extra.push(`+${dataReward.toLocaleString('ru-RU')} Data`);
          if (!trustedTelemetry) extra.push('без ресурсной награды: событие пришло из client telemetry');
          alerts.push({
            id: crypto.randomUUID(),
            type: 'achievement',
            title: cfg.secret ? `🏆 Секретное достижение: ${cfg.title}` : `🏆 Достижение: ${cfg.title}`,
            message:
              (cryptoReward > 0 ? `+${cryptoReward} 💎 Crypto` : 'Бейдж отмечен') +
              (extra.length > 0 ? `, ${extra.join(', ')}` : '') +
              ' начислено на счёт!',
          });
        }
      }
    }
  }

  // 9. Гарантированный предмет за уровни 5/10/15/20. Проверка живёт здесь, а не
  // в награде за контракт: уровень растёт от любых действий (тапы, взломы,
  // покупки), и предмет должен выдаваться один раз, независимо от источника XP.
  await grantLevelMilestoneItems(record, mode, alerts);

  // Все пути синхронизации (включая atomic mission claim) выходят с конечным
  // Data-снимком, а не надеются, что последующий savePlayerCore успеет clamp.
  record.data = safeDataBalance(record.data);
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
    inventory: getInventoryState(record),
    // «Инвентарь оживает»: только серверные стопки из player_items.
    items: itemStacks(record),
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
    // v5.6: retention-снимок и реферальный блок едут тем же ответом —
    // отдельных запросов на старте приложения не появляется.
    retention: buildRetentionSnapshot(record),
    referral: buildReferralPayload(record),
    // v6.8: сводка сюжета. Тексты глав живут в shared/story.config.ts (ленивый
    // чанк экрана «История»), клиенту на столе нужна только эта строка мира.
    story: buildStorySnapshot(
      storyFactsFromPlayer(player),
      record.stats.storyClaimed ?? [],
      record.stats.storyChaptersPaid ?? []
    ),
  };
}

/**
 * v5.6: синхронный юзернейм бота для ссылки приглашения.
 * getBotUsername() асинхронный (ходит в getMe), а buildResponse обязан быть
 * синхронным; поэтому здесь только env + задокументированный fallback.
 */
function resolveBotUsernameSync(): string {
  const env = (process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || '').replace(/^@/, '').trim();
  return env || REFERRAL_FALLBACK_BOT_USERNAME;
}

/** v5.6: реферальный блок профиля (ссылка по tgId + журнал). */
function buildReferralPayload(record: StoredPlayerRecord): ReferralPayload {
  const enabled = isReferralV1Enabled();
  const ledger = getReferralLedger(record);
  return {
    enabled,
    tgLink:
      enabled && Number.isSafeInteger(record.tgId) && record.tgId > 0
        ? buildReferralTgLink(resolveBotUsernameSync(), record.tgId)
        : null,
    referrerTgId: record.stats.referredByTgId ?? null,
    referralQualifiedAt: record.stats.referralQualifiedAt ?? null,
    ledger,
    weeklyCap: REFERRAL_TG_WEEKLY_CAP,
    rules: REFERRAL_TG_RULES_SHORT,
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

    // ------------------------------------------------------------------
    // v5.6: ОФФЛАЙН. Считаем «пока тебя не было» ДО синка, от lastSeenAt,
    // по ставке deriveStats(record).dataPerHour (онлайн-ставка × 0.5, кап 8 ч).
    // Деньги НЕ начисляются здесь: сумма уходит в stats.pendingOffline,
    // платит только claim_offline. Пока идут активные миссии — оффлайн не
    // применяется вообще (миссия уже платит за это время, см. economy.config).
    // ------------------------------------------------------------------
    const preDerived = deriveStats(record);
    const retentionOffline = applyOfflineOnInit(record, {
      dataPerHour: preDerived.dataPerHour,
      hasActiveMissions: record.activeMissions.length > 0,
    });
    if (retentionOffline.earnings?.reason === 'active_missions') {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: '⏳ Оффлайн не начислен',
        message: 'Пока идут активные миссии, фонового дохода нет — миссия уже платит за это время.',
      });
    }

    // Привязка «кто позвал» — до синка, пока аккаунт ещё нулевой.
    // v5.6: сначала пробуем tgId-ссылку (?start=ref_<tgId>). Если она
    // сработала, кодовую v3.5 не вызываем — двойной привязки быть не должно.
    const tgRef = await attributeTgIdReferral(record, user.startParam, clientIp);
    if (tgRef.attributed) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: '🎉 Приглашение принято',
        message:
          `Ты пришёл по ссылке друга — начислено +${tgRef.welcomeData.toLocaleString('ru-RU')} Data` +
          (tgRef.welcomeChips > 0 ? ` и +${tgRef.welcomeChips} ⚙️ Чип` : '') +
          '. Друг получит награду, когда ты наиграешь свои 8 минут.',
      });
    } else if (user.startParam && tgRef.reason !== 'not_tg_link' && tgRef.reason !== 'flag_off') {
      // Мягкий отказ: игрок видит «почему не засчиталось», а не молчание.
      const reasons: Record<string, string> = {
        guest: 'гостевой аккаунт не участвует в рефералке',
        self: 'нельзя пригласить самого себя',
        not_new_player: 'аккаунт уже играл — приглашение не засчитывается',
        already_attributed: 'к аккаунту уже привязан пригласивший',
        referrer_unknown: 'пригласивший не найден среди игроков',
        weekly_cap: 'у пригласившего выбран недельный лимит приглашений',
      };
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: '🔗 Приглашение не засчитано',
        message: `Причина: ${reasons[tgRef.reason] ?? tgRef.reason}.`,
      });
    }
    await attributeReferral(record, tgRef.attributed ? undefined : user.startParam, clientIp);

    const { offlineEarned, offlineTaps } = await syncTimeAndRules(record, mode, alerts, {
      skipLegacyOffline: retentionOffline.suppressLegacyPayout,
    });

    // v5.6: стрик в stats (UTC-дата).
    mirrorDailyStreak(record);

    // v5.6: напоминание — не чаще раза в сутки, только opt-in и только если
    // дневной бонус не забран. ВАЖЕН ПОРЯДОК: проверка идёт ДО touchLastSeen,
    // иначе «сутки не заходил» превращается в «зашёл только что» и мы никогда
    // никому не напомним. Без токена — штатный no-op с явным логом.
    const reminder = await maybeSendDailyReminder(record);

    // v5.6: новый lastSeenAt для следующего init (после всех проверок).
    touchLastSeen(record);
    if (reminder.sent) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: '🔔 Напоминание отправлено',
        message: 'Мы напомнили тебе в Telegram забрать дневной бонус — отключить можно в стрике.',
      });
    }
    // v5.7: контрактный раннер. Если таймеры истекли, игрок узнаёт об этом
    // сразу на входе — забирать можно вручную на «Взломах» или автоматически
    // (клиент дергает тот же идемпотентный claim после init). Сервер время не
    // подкручивает: ранний claim по-прежнему отклоняется проверкой finish_at.
    const readyContracts = record.activeMissions.filter((mission) => isContractReady(mission.finishAt, Date.now()));
    if (isGameplayV3Enabled() && readyContracts.length > 0) {
      const rewardSum = readyContracts.reduce((sum, mission) => sum + Math.max(0, mission.reward), 0);
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `📦 Контрактов готово: ${readyContracts.length}`,
        message:
          `${readyContracts.map((mission) => mission.targetName).join(', ')} — ` +
          `до +${rewardSum.toLocaleString('ru-RU')} Data. Заберите награду на экране «Взломы».`,
      });
    }

    // v1: ОДНОРАЗОВЫЙ анонс точки запуска. Показываем ровно один раз на
    // аккаунт — на первом init после вайпа. Флаг ставим ДО сохранения, поэтому
    // повторный init (в том числе параллельный) второй раз его не покажет.
    // Никакой магии на старте приложения: это обычное поле players.stats.
    if (record.stats.launchAnnouncement !== LAUNCH_ANNOUNCEMENT_ID) {
      record.stats.launchAnnouncement = LAUNCH_ANNOUNCEMENT_ID;
      alerts.push({
        id: crypto.randomUUID(),
        type: LAUNCH_ANNOUNCEMENT.type,
        title: LAUNCH_ANNOUNCEMENT.title,
        message: LAUNCH_ANNOUNCEMENT.message,
      });
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, offlineEarned, offlineTaps);
  });
}

// ============================================================================
// v5.6: RETENTION-ДЕЙСТВИЯ (/api/retention)
// ----------------------------------------------------------------------------
// Только два действия, оба идемпотентны и оба пишут лишь СВОЮ запись:
//   claim_offline    — забрать посчитанный на init оффлайн (один раз);
//   reminder_opt_in  — галочка «напоминать в Telegram» (default OFF).
// Никаких новых таблиц: всё живёт в players.stats jsonb.
// ============================================================================

export type RetentionAction = 'claim_offline' | 'reminder_opt_in';

export async function handleRetentionAction(
  user: VerifiedTelegramUser,
  action: RetentionAction,
  value?: boolean
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    if (action === 'claim_offline') {
      const { claimed, claimedAwaySeconds } = claimOfflineEarnings(record);
      if (claimed > 0) {
        const hours = Math.max(1, Math.round(claimedAwaySeconds / 3600));
        alerts.push({
          id: crypto.randomUUID(),
          type: 'success',
          title: `💤 Пока тебя не было: +${Math.round(claimed).toLocaleString('ru-RU')} Data`,
          message: `Стол работал ${hours} ч по половинной ставке. Забрано — копилка пуста до следующего захода.`,
        });
      }
    } else {
      const enabled = setReminderOptIn(record, value === true);
      if (enabled && !getBotToken()) {
        alerts.push({
          id: crypto.randomUUID(),
          type: 'warning',
          title: '🔔 Напоминания включены, но бот не настроен',
          message: 'На сервере нет TELEGRAM_BOT_TOKEN — напоминания не уходят. Настройка сохранена.',
        });
      } else {
        alerts.push({
          id: crypto.randomUUID(),
          type: 'info',
          title: enabled ? '🔔 Напоминания включены' : '🔕 Напоминания выключены',
          message: enabled
            ? 'Напомним в Telegram, если сутки не заходил и не забрал дневной бонус. Не чаще раза в сутки.'
            : 'Больше не пишем. Включить можно в любой момент в стрике.',
        });
      }
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts);
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
/**
 * «Инвентарь оживает»: применение расходника.
 * Все эффекты считаются здесь, на сервере, и только здесь: клиент присылает
 * ключ предмета и получает обновлённый стейт. Списывает предмет ровно один раз
 * и только если он есть в player_items (проверка + списание атомарны в RPC).
 */
async function applyConsumableItem(
  record: StoredPlayerRecord,
  mode: 'supabase' | 'memory-fallback',
  itemKey: string,
  alerts: GameAlert[]
): Promise<void> {
  const cfg = getConsumableItem(itemKey);
  if (!cfg) throw new Error('Этот предмет нельзя применить');
  if (getItemQty(record, itemKey) <= 0) {
    throw new Error('Этого предмета нет в инвентаре');
  }
  if (!cfg.usable) {
    throw new Error('Этот предмет срабатывает сам — применить вручную нельзя');
  }

  const effect = cfg.effect;
  const nowMs = Date.now();
  const derived = deriveStats(record);

  if (effect.kind === 'energy') {
    const before = record.energy;
    record.energy = Math.min(derived.maxEnergy, record.energy + effect.amount);
    record.energyUpdated = new Date(nowMs).toISOString();
    if (!(await consumeItemFromPlayer(record, mode, itemKey))) {
      record.energy = before;
      throw new Error('Предмет не списался — попробуй ещё раз');
    }
    const gained = Math.round(record.energy - before);
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `☕ ${cfg.name} применён`,
      message:
        gained < effect.amount
          ? `+${gained} CPU Charge: остаток сгорел, заряд уже на капе ${derived.maxEnergy}.`
          : `+${gained} CPU Charge. Терминал остыл, можно вскрывать узлы.`,
    });
    return;
  }

  if (effect.kind === 'heat') {
    const before = record.heat;
    record.heat = Math.max(0, record.heat + effect.amount);
    if (!(await consumeItemFromPlayer(record, mode, itemKey))) {
      record.heat = before;
      throw new Error('Предмет не списался — попробуй ещё раз');
    }
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🧊 ${cfg.name} применён`,
      message: `Heat ${before} → ${record.heat}. Патруль не дотягивается до порога.`,
    });
    return;
  }

  if (effect.kind === 'channel') {
    // Таймер только продлевается: ×1.25 один, повтор не складывается.
    record.stats.channelBoostUntil = new Date(nowMs + effect.durationSec * 1000).toISOString();
    if (!(await consumeItemFromPlayer(record, mode, itemKey))) {
      record.stats.channelBoostUntil = null;
      throw new Error('Предмет не списался — попробуй ещё раз');
    }
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `📡 ${cfg.name} применён`,
      message: `Data с тапов ×${effect.multiplier} до ${new Date(nowMs + effect.durationSec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}. Повторное применение продлит таймер.`,
    });
    return;
  }

  if (effect.kind === 'exploit') {
    // Флаг, а не мгновенный бонус: списывается предмет при запуске контракта.
    record.stats.exploitInjectionReady = true;
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `💉 ${cfg.name} заряжена`,
      message: `Следующий контракт получит +${Math.round(effect.successBonus * 100)}% к шансу успеха. Предмет спишется при запуске.`,
    });
    return;
  }

  throw new Error('Этот предмет срабатывает сам — применить вручную нельзя');
}

export async function handleInventoryAction(
  user: VerifiedTelegramUser,
  action: 'set_public' | 'use' | 'seen',
  itemKey: string,
  visible: boolean,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);

    // Отметка «дроп просмотрен»: гасит точку на HUD и ничего не начисляет.
    if (action === 'seen') {
      const alerts: GameAlert[] = [];
      await syncTimeAndRules(record, mode, alerts);
      const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
      record.stats.hasNewItems = false;
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    if (action === 'use') {
      const alerts: GameAlert[] = [];
      await syncTimeAndRules(record, mode, alerts);
      const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
      await applyConsumableItem(record, mode, itemKey, alerts);
      // Цель дня «примени расходник» — только после фактического списания:
      // applyConsumableItem бросает ошибку раньше, если предмет не списался.
      incrementDailyGoalProgress(record, 'item_use', 1);
      await syncTimeAndRules(record, mode, alerts);
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    const inventory = getInventoryState(record);
    if (!inventory.ownedKeys.includes(itemKey)) {
      throw new Error('Этого предмета нет в инвентаре');
    }
    if (!getInventoryItemDefinition(itemKey)) {
      throw new Error('Неизвестный предмет инвентаря');
    }

    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    await syncTimeAndRules(record, mode, alerts);
    const showcase = new Set(inventory.showcaseKeys);
    if (visible) showcase.add(itemKey);
    else showcase.delete(itemKey);
    record.stats.inventoryShowcase = Array.from(showcase);
    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

interface PublicInventoryRecord extends InventoryRecordLike {
  id: string;
  tgId: number;
  username: string;
  xp: number;
  level: number;
  rank: number;
  prestigeCount: number;
}

function buildPublicProfile(
  record: PublicInventoryRecord,
  viewerTgId: number
): PublicProfileResponse {
  const inventory = getInventoryState(record);
  const items = getPublicInventoryItems(record, inventory.showcaseKeys);
  return {
    ok: true,
    profile: {
      profileId: record.id,
      username: record.username,
      level: Math.max(1, Math.floor(record.level)),
      rankTitle: RANK_TITLES[Math.max(0, Math.min(RANK_TITLES.length - 1, record.rank - 1))]?.title ?? 'Script Kiddie',
      prestigeCount: Math.max(0, Math.floor(record.prestigeCount)),
      avatarKey: record.stats.equippedAvatar,
      profileFrameKey: record.stats.equippedProfileFrame,
      items,
      viewerIsOwner: record.tgId === viewerTgId,
    },
  };
}

export async function handleGetPublicProfile(
  currentUser: VerifiedTelegramUser,
  profileId: string
): Promise<PublicProfileResponse> {
  const normalizedId = String(profileId || '').trim().slice(0, 80);
  if (!/^[0-9a-f-]{16,80}$/i.test(normalizedId)) {
    throw new Error('Некорректный идентификатор профиля');
  }

  const sb = getSupabaseAdmin();
  if (sb) {
    const { data: row, error } = await sb
      .from('players')
      .select('id, tg_id, username, level, xp, rank, prestige_count, equipped_skin, unlocked_skins, stats')
      .eq('id', normalizedId)
      .maybeSingle();
    if (error) throw new Error(`Не удалось открыть профиль: ${error.message}`);
    if (!row) throw new Error('Профиль не найден');

    const { data: achievements, error: achievementsError } = await sb
      .from('achievements')
      .select('key')
      .eq('player_id', String(row.id));
    if (achievementsError) throw new Error(`Не удалось открыть достижения профиля: ${achievementsError.message}`);

    const stats = normalizeStats(row.stats);
    ensurePermanentProfileFrameGifts(stats, Number(row.tg_id));
    ensurePermanentProfileInventoryGifts(stats, Number(row.tg_id));
    const level = Math.max(1, Number(row.level ?? getLevelProgress(Number(row.xp ?? 0)).level));
    const rank = Math.max(1, Math.min(RANK_TITLES.length, Number(row.rank ?? getRankForLevel(level).rankIndex)));
    return buildPublicProfile(
      {
        id: String(row.id),
        tgId: Number(row.tg_id),
        username: String(row.username),
        xp: Math.max(0, Number(row.xp ?? 0)),
        level,
        rank,
        prestigeCount: Math.max(0, Number(row.prestige_count ?? 0)),
        equippedSkin: String(row.equipped_skin ?? 'default'),
        unlockedSkins: Array.isArray(row.unlocked_skins) ? row.unlocked_skins.map(String) : ['default'],
        stats,
        achievements: (achievements ?? []).map((item) => String(item.key)),
        pets: [],
      },
      currentUser.tgId
    );
  }

  const db = getLocalDb();
  const record = Object.values(db.playersByTgId).find((candidate) => candidate.id === normalizedId);
  if (!record) throw new Error('Профиль не найден');
  record.stats = normalizeStats(record.stats);
  ensurePermanentProfileFrameGifts(record.stats, record.tgId);
  ensurePermanentProfileInventoryGifts(record.stats, record.tgId);
  const derived = deriveStats(record);
  return buildPublicProfile(
    {
      id: record.id,
      tgId: record.tgId,
      username: record.username,
      xp: record.xp,
      level: derived.level,
      rank: derived.rankIndex,
      prestigeCount: record.prestigeCount,
      equippedSkin: record.equippedSkin,
      unlockedSkins: record.unlockedSkins,
      stats: record.stats,
      achievements: record.achievements,
      pets: record.pets,
    },
    currentUser.tgId
  );
}

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

  // Серверный Anti-Cheat тапов (v6.4 — тот же темп, что во взломах):
  // 1) не более TAP_MAX_BATCH (60) тапов в одной пачке (клиент отправляет по 20);
  // 2) не более TAP_MAX_PER_SEC (6) тап/с по «ведру токенов» с запасом на одну
  //    клиентскую пачку — живой палец не теряет тапы, скрипт не обгоняет его;
  // 3) главный ограничитель — CPU Charge: каждый тап сжигает 1 заряд, а без
  //    заряда тап не проходит вовсе.
  const allowance = resolveTapAllowance({
    requested: count,
    budget: record.stats.tapBudget ?? null,
    energy: record.energy,
    nowMs,
    minBurst,
  });
  record.stats.tapBudget = { tokens: allowance.tokens, at: nowMs };
  const validClicks = allowance.allowed;
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
  // v6.3: сезонный леденец удваивает Data с ручных тапов.
  const clickBoost = lollipopMultiplier(record.stats.lollipop, nowMs);
  // v6.5: место работы множит только Data — CPU/Energy тап тратит как раньше.
  const tapLocationBoost = locationEconomy(record.stats).mods.data;
  // «Модификатор канала»: 15 минут ×1.25 Data с тапов. Множитель один и не
  // складывается сам с собой — повторное применение лишь продлевает таймер.
  const channelBoost = isChannelBoostActive(record, nowMs) ? CHANNEL_BOOST_MULTIPLIER : 1;
  const tapDataGain =
    Math.round(validClicks * derived.clickPower * clickBoost * tapLocationBoost * channelBoost * 100) / 100;
  record.data += tapDataGain;
  record.totalClicks = prevTotalClicks + validClicks;
  record.lastClickBatchAt = nowMs;
  incrementDailyTaskProgress(record, 'tap', validClicks);
  incrementContractProgress(record, 'tap', validClicks);
  // Цели дня: тапы считаем только после античита (validClicks), а Data — по
  // фактически начисленной сумме, а не по «сколько клиент прислал».
  incrementDailyGoalProgress(record, 'taps', validClicks);
  incrementDailyGoalProgress(record, 'data', tapDataGain);
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
    const baselineExpected = captureAtomicExpected(record);
    let atomicExpected = baselineExpected;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Его total_clicks уже CAS-ится в applyPendingClicks, остальные поля
    // войдут в одну атомарную покупку ниже.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    // Сохраняем синхронизацию/клики до валидации цены: отказ покупки не
    // должен съедать уже честно применённые клики. Финальная покупка после
    // этого использует свежий CAS-snapshot.
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? baselineExpected.data : undefined,
      mode === 'supabase' ? baselineExpected.energy : undefined
    );
    atomicExpected = captureAtomicExpected(record);

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
      prevDerived.cardPriceDiscountPct,
      // v6.6: цена привязана к доходу игрока — сервер и UI считают одним вызовом.
      prevDerived.level
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

    await syncTimeAndRules(record, mode, alerts);

    const newDerived = deriveStats(record);

    if (newDerived.deskStage > prevDerived.deskStage) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        // v1.4 (R2): этап стола больше не называется «УР.» — уровень остался
        // только у игрока, стол подписан «Этап N/7».
        title: `✨ ЭВОЛЮЦИЯ СТОЛА: ${deskStageLabel(newDerived.deskStage)}!`,
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

    await commitPurchaseAtomic(record, mode, atomicExpected, 'card', {
      itemKey: card.key,
      itemLevel: nextLevel,
    });
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/** Открытие следующего Тира карточек за Чипы + Data. */
export async function handleUnlockTier(user: VerifiedTelegramUser,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const baselineExpected = captureAtomicExpected(record);
    let atomicExpected = baselineExpected;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Его total_clicks уже CAS-ится в applyPendingClicks, остальные поля
    // войдут в одну атомарную покупку ниже.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    // Сохраняем синхронизацию/клики до валидации цены: отказ покупки не
    // должен съедать уже честно применённые клики. Финальная покупка после
    // этого использует свежий CAS-snapshot.
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? baselineExpected.data : undefined,
      mode === 'supabase' ? baselineExpected.energy : undefined
    );
    atomicExpected = captureAtomicExpected(record);

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
    await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
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
    const baselineExpected = captureAtomicExpected(record);
    let atomicExpected = baselineExpected;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Его total_clicks уже CAS-ится в applyPendingClicks, остальные поля
    // войдут в одну атомарную покупку ниже.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    // Сохраняем синхронизацию/клики до валидации цены: отказ покупки не
    // должен съедать уже честно применённые клики. Финальная покупка после
    // этого использует свежий CAS-snapshot.
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? baselineExpected.data : undefined,
      mode === 'supabase' ? baselineExpected.energy : undefined
    );
    atomicExpected = captureAtomicExpected(record);

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

    const price = getBaseUpgradePrice(cfg, currentLevel, baseLevelNow);
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
    await commitPurchaseAtomic(record, mode, atomicExpected, 'base', {
      itemKey: cfg.key,
      itemLevel: currentLevel + 1,
    });
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
    const baselineExpected = captureAtomicExpected(record);
    let atomicExpected = baselineExpected;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Его total_clicks уже CAS-ится в applyPendingClicks, остальные поля
    // войдут в одну атомарную покупку ниже.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    // Сохраняем синхронизацию/клики до валидации цены: отказ покупки не
    // должен съедать уже честно применённые клики. Финальная покупка после
    // этого использует свежий CAS-snapshot.
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? baselineExpected.data : undefined,
      mode === 'supabase' ? baselineExpected.energy : undefined
    );
    atomicExpected = captureAtomicExpected(record);

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

    record.team.push(npc.key);

    if (npc.unlocksGreyMissions) {
      record.stats.missionRefreshSalt = (record.stats.missionRefreshSalt ?? 0) + 1;
      const nextOffer = computeOfferWindow(
        user.tgId,
        true,
        deriveStats(record).level,
        record.stats.missionRefreshSalt,
        offerLocationId(record.stats, deriveStats(record).level)
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
    await commitPurchaseAtomic(record, mode, atomicExpected, 'team', {
      itemKey: npc.key,
    });
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
    // syncTimeAndRules может выдать оффлайн-Data или восстановить Energy.
    // Сохраняем баланс, который реально прочитали из БД, для CAS перед
    // атомарным стартом — иначе RPC увидит уже изменённый, но ещё не записанный
    // в players баланс и корректно отклонит обычный запуск.
    const loadedDataBeforeSync = record.data;
    const loadedEnergyBeforeSync = record.energy;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // v3.3: «хвост» ещё не отправленных кликов приезжает вместе с действием.
    // Фиксируем его сразу, чтобы неудачная покупка не съела клики игрока.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) {
      // applyPendingClicks атомарно фиксирует только счётчик кликов; перед
      // продолжением сохраняем также его Data/Energy и синхронизацию времени.
      await savePlayerCore(
        record,
        mode,
        undefined,
        mode === 'supabase' ? loadedDataBeforeSync : undefined,
        mode === 'supabase' ? loadedEnergyBeforeSync : undefined
      );
    }

    // Claim/skip должен начинаться с сохранённого snapshot: offline Data,
    // Energy regen, referral и achievements не должны затереться атомарной RPC.
    if (mode === 'supabase' && (action === 'claim' || action === 'skip') && appliedClicks === 0) {
      await savePlayerCore(record, mode, undefined, loadedDataBeforeSync, loadedEnergyBeforeSync);
    }
    const claimExpected = {
      data: record.data,
      energy: record.energy,
      crypto: record.crypto,
      chips: record.chips,
      xp: record.xp,
      rep: record.rep,
      heat: record.heat,
      totalMissions: record.totalMissions,
    };

    const derived = deriveStats(record);

    if (action === 'refresh') {
      // Auto-refresh обновляет текущую витрину по 15-минутному окну, но не
      // должен давать бесплатный ручной reroll. Cooldown живёт в stats и
      // поэтому одинаков на всех Vercel-инстансах.
      const lastManualRefreshMs = new Date(record.stats.lastMissionRefreshAt ?? '').getTime();
      const refreshWaitMs = Number.isFinite(lastManualRefreshMs)
        ? Math.max(0, MISSION_REFRESH_COOLDOWN_MS - (Date.now() - lastManualRefreshMs))
        : 0;
      if (refreshWaitMs > 0) {
        throw new Error(`Скан уже свежий. Следующее обновление через ~${Math.ceil(refreshWaitMs / 60_000)} мин.`);
      }
      record.stats.lastMissionRefreshAt = new Date().toISOString();
      record.stats.missionRefreshSalt = (record.stats.missionRefreshSalt ?? 0) + 1;
      const nextOffer = computeOfferWindow(
        user.tgId,
        derived.unlockedGreyMissions,
        derived.level,
        record.stats.missionRefreshSalt,
        offerLocationId(record.stats, derived.level)
      );
      record.availableMissionKeys = nextOffer.keys;
      record.missionsRefreshedAt = new Date().toISOString();
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    if (action === 'start') {
      if (mode === 'supabase' && appliedClicks === 0) {
        // Оффлайн-доход и реген Energy уже изменили record после init.
        // Сначала фиксируем этот snapshot с CAS, затем RPC списывает взнос
        // и создаёт миссию относительно уже сохранённого баланса.
        await savePlayerCore(record, mode, undefined, loadedDataBeforeSync, loadedEnergyBeforeSync);
      }
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
      // v5.5, анти-чит: контракт из ещё не открытой локации нельзя запустить,
      // даже если клиент подделал missionKey и обошёл витрину.
      if (!isLocationMissionStartable(cfg, derived.level)) {
        throw new Error(describeLockedLocation(cfg));
      }
      if (record.activeMissions.some((m) => m.missionKey === cfg.key)) {
        throw new Error('Эта цель уже взламывается в данный момент');
      }

      // Шанс успеха фиксируется НА СТАРТЕ и хранится в БД: подкрутить задним числом нельзя.
      // Он зависит от силы железа (hackPower), запаса уровня, опыта по этому классу целей и Heat.
      // v6.5: место работы входит в шанс и в деньги — см. shared/locations.ts.
      const where = locationEconomy(record.stats);
      const odds = getHackOdds({
        mission: cfg,
        level: derived.level,
        hackPower: derived.hackPower,
        heat: record.heat,
        tierSuccesses: record.stats.hackSuccessByType[cfg.targetType] ?? 0,
        tierFails: record.stats.hackFailByType[cfg.targetType] ?? 0,
        successMultiplier: where.mods.success,
      });
      let successChance = Math.round(odds.chance * 1000) / 1000;

      // «Эксплойт-инъекция»: +15% к шансу ЭТОГО контракта. Тратится здесь, в
      // момент запуска: предмет «висит» до первого контракта, но не может
      // копиться — флаг живёт в stats и после запуска сбрасывается.
      let exploitInjectionUsed = false;
      if (record.stats.exploitInjectionReady) {
        record.stats.exploitInjectionReady = false;
        if (await consumeItemFromPlayer(record, mode, EXPLOIT_INJECTION_ITEM_KEY)) {
          exploitInjectionUsed = true;
          successChance =
            Math.round(Math.min(0.96, odds.chance + EXPLOIT_INJECTION_BONUS) * 1000) / 1000;
        }
      }

      // Денежная награда за успешный взлом. Растёт по уровню игрока, но решает всё-таки успех.
      const whiteHatBonus = derived.alignment === 'white_hat' && cfg.targetType === 'bad' ? 2 : 1;
      const reward = Math.min(
        MAX_SAFE_DATA_BALANCE,
        Math.max(
          0,
          Math.round(
            cfg.baseDataReward *
              getMissionRewardScale(derived.level) *
              whiteHatBonus *
              derived.prestigeMultiplier *
              (1 + derived.missionRewardBonusPct) *
              where.mods.data
          )
        )
      );
      const repDelta = cfg.repDelta * (whiteHatBonus > 1 && cfg.repDelta > 0 ? 2 : 1);
      // Heat тоже место-зависимый: корп-квартал замечает тебя в 1.5 раза быстрее.
      // v6.8: ротационный ивент может менять Heat (например, «Тихая неделя»).
      const eventMods = getEventModifiers(Date.now());
      const heatDelta = Math.round(
        cfg.heatDelta * derived.heatMultiplier * where.mods.heat * eventMods.heatMult
      );
      // v5.7 (GAMEPLAY_V3): getMissionEntryCost сам отдаёт цену по ТИРУ
      // (CPU Charge) при включённом флаге и прежнюю «по секундам» — при выключенном.
      // Data-взнос не меняется ни в одном режиме.
      const entryCost = getMissionEntryCost(cfg, reward);
      if (record.energy < entryCost.energy) {
        throw new Error(
          isGameplayV3Enabled()
            ? `Недостаточно CPU Charge: контракт тира ${cfg.tier ?? 1} требует ${entryCost.energy} ⚡ (сейчас ${record.energy}). Заряд копится сам (+1 за 2 с), тап тоже тратит 1 заряд.`
            : `Недостаточно Energy для запуска: нужно ${entryCost.energy} ⚡ (сейчас ${record.energy}).`
        );
      }
      if (record.data < entryCost.data) {
        throw new Error(
          `Недостаточно Data для запуска: нужен взнос ${entryCost.data.toLocaleString('ru-RU')} Data.`
        );
      }
      // Взнос списывается в момент запуска и не возвращается при провале:
      // игрок платит за подготовку, а не только за удачный результат.
      // Для Supabase эти значения используются как CAS-снимок внутри одной
      // транзакции: параллельный старт не может потратить один баланс дважды.
      const expectedDataBeforeStart = record.data;
      const expectedEnergyBeforeStart = record.energy;
      record.energy -= entryCost.energy;
      record.data -= entryCost.data;
      // «Талисман удачи» на Базе повышает шанс редкого дропа Crypto
      // v6.8: «Ночной рынок» поднимает шанс Crypto именно на серых (не на всех).
      const baseDropChance =
        (cfg.cryptoDropChance ?? (cfg.targetType === 'grey' ? 0.35 : 0)) *
        (cfg.targetType === 'grey' ? eventMods.greyCryptoMult : 1);
      const cryptoReward =
        Math.random() < Math.min(0.9, baseDropChance + derived.cryptoDropBonusPct) ? 1 : 0;
      const xpReward = getMissionXpAward(cfg.xpReward ?? 10, cfg.tier ?? 1, derived.level);

      const nowMs = Date.now();
      const startedAt = new Date(nowMs).toISOString();
      const finishAt = new Date(nowMs + cfg.durationSec * 1000).toISOString();

      let instanceId: string = crypto.randomUUID();

      if (mode === 'supabase') {
        const sb = getSupabaseAdmin();
        if (!sb) {
          throw new Error('Supabase недоступен: контракт не запущен и баланс не изменён');
        }

        // PostgreSQL RPC атомарно обновляет баланс и вставляет active-миссию.
        // Если UPDATE не прошёл CAS или INSERT завершился ошибкой, вся
        // транзакция откатывается — списанного взноса без миссии не останется.
        const { data: startedMissionId, error } = await sb.rpc('start_mission_atomic', {
          p_player_id: record.id,
          p_expected_data: expectedDataBeforeStart,
          p_expected_energy: expectedEnergyBeforeStart,
          p_data_cost: entryCost.data,
          p_energy_cost: entryCost.energy,
          p_energy_updated: record.energyUpdated,
          p_mission_key: cfg.key,
          p_target_type: cfg.targetType,
          p_target_name: cfg.targetName,
          p_started_at: startedAt,
          p_finish_at: finishAt,
          p_reward: reward,
          p_rep_delta: repDelta,
          p_heat_delta: heatDelta,
          p_crypto_reward: cryptoReward,
          p_xp_reward: xpReward,
          p_success_chance: successChance,
        });
        if (error) {
          if (error.message.includes('MISSION_START_CONFLICT')) {
            throw new Error('Баланс или активные данные изменились в другой сессии — обновите экран');
          }
          throw new Error(`Ошибка атомарного запуска: ${error.message}`);
        }
        const returnedMissionId = Array.isArray(startedMissionId)
          ? startedMissionId[0]
          : startedMissionId;
        if (!returnedMissionId) {
          throw new Error('Supabase не вернул созданную миссию — запуск отменён');
        }
        instanceId = String(returnedMissionId);
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
        entryEnergyCost: entryCost.energy,
        entryDataCost: entryCost.data,
        successChance,
        outcome: 'partial',
      });
      incrementDailyTaskProgress(record, 'mission_start', 1);
      incrementContractProgress(record, 'cpu', entryCost.energy);
      incrementDailyGoalProgress(record, 'cpu', entryCost.energy);
      incrementSeasonEventProgress(record, 'mission_start', 1);

      if (exploitInjectionUsed) {
        alerts.push({
          id: crypto.randomUUID(),
          type: 'success',
          title: '💉 Эксплойт-инъекция применена',
          message: `Шанс успеха повышен на ${Math.round(EXPLOIT_INJECTION_BONUS * 100)}% — сейчас ${Math.round(successChance * 100)}%. Предмет списан при запуске.`,
        });
      }

      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: `🛰️ Взлом ${cfg.targetName} запущен`,
        message:
          `Взнос: −${entryCost.data.toLocaleString('ru-RU')} Data · −${entryCost.energy} ${isGameplayV3Enabled() ? 'CPU Charge' : 'Energy'}. ` +
          `Шанс успеха ${Math.round(successChance * 100)}% · ` +
          `до ${xpReward.toLocaleString('ru-RU')} XP · ` +
          `чистыми при успехе +${Math.max(0, reward - entryCost.data).toLocaleString('ru-RU')} Data. ` +
          `Готовность: ${describeOdds(successChance)}.`,
      });

      if (mode === 'supabase') {
        // RPC уже списал обе валюты. CAS на финальном сохранении не даёт
        // параллельному запросу перезаписать более новый баланс старым снимком.
        try {
          await savePlayerCore(record, mode, undefined, record.data, record.energy);
        } catch (persistError) {
          // RPC уже зафиксировал пару «взнос + active-миссия». Если вторичная
          // синхронизация stats/pets столкнулась с параллельным запросом,
          // отдаём свежий серверный snapshot вместо ложного «не запустилось».
          try {
            const fresh = await loadPlayerRecord(user);
            alerts.push({
              id: crypto.randomUUID(),
              type: 'warning',
              title: '🛰️ Контракт запущен, экран обновлён',
              message: 'Баланс или прогресс изменился в другой сессии — показана актуальная миссия.',
            });
            return buildResponse(fresh.record, fresh.mode, alerts, 0, 0, appliedClicks);
          } catch {
            throw persistError;
          }
        }
      } else {
        await savePlayerCore(record, mode);
      }
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

    if (action === 'skip') {
      record.crypto -= 1;
    }

    record.activeMissions.splice(idx, 1);

    const levelBefore = deriveStats(record).level;
    const dataGain = Math.max(
      0,
      Math.min(MAX_SAFE_DATA_BALANCE, Math.round(safeDataBalance(mission.reward) * outcomeMult.data))
    );
    const repGain = Math.round(mission.repDelta * outcomeMult.rep);
    const heatGain = Math.round(mission.heatDelta * outcomeMult.heat);
    const rawXpGain = Math.round((mission.xpReward || 0) * outcomeMult.xp);
    // XP продолжает начисляться на любом уровне; мягкий штраф тира
    // замедляет, но не закрывает карьерную прогрессию.
    const xpGain = mission.xpReward > 0 ? Math.max(1, rawXpGain) : 0;
    const cryptoGain = outcome === 'success' ? mission.cryptoReward : 0;

    record.data += dataGain;
    record.rep = Math.max(0, record.rep + repGain);
    record.heat = Math.max(0, record.heat + heatGain);
    record.crypto += cryptoGain;
    record.xp += xpGain;
    record.totalMissions += 1;
    record.stats.totalXpEarned += xpGain;
    incrementDailyTaskProgress(record, 'mission_complete', 1);
    incrementContractProgress(record, 'mission_complete', 1);
    incrementContractProgress(record, 'heat', heatGain);
    // Цели дня: контракт засчитывается только чистым успехом, Data — по факту.
    if (outcome === 'success') incrementDailyGoalProgress(record, 'contracts', 1);
    incrementDailyGoalProgress(record, 'data', dataGain);
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
      // v6.11: тир берём из конфига контракта (в активной миссии он не хранится,
      // чтобы старые сейвы не зависели от нового поля). Провал и частичный
      // результат счётчик не двигают — «успешный взлом» значит именно success.
      const tierCfg = MISSIONS_CONFIG.find((m) => m.key === mission.missionKey);
      if (tierCfg) {
        const tierKey = String(tierCfg.tier);
        record.stats.hacksByTier[tierKey] = (record.stats.hacksByTier[tierKey] ?? 0) + 1;
      }
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

    // «Протокол-Феникс»: провал контракта возвращает 50% входа (Data и CPU).
    // Предмет сгорает автоматически; нет предмета — ничего не происходит и
    // никакого утешительного бонуса не появляется.
    if (outcome === 'fail') {
      const phoenixCfg = getConsumableItem(PHOENIX_PROTOCOL_ITEM_KEY);
      const refundPct =
        phoenixCfg && phoenixCfg.effect.kind === 'phoenix' ? phoenixCfg.effect.refundPct : PHOENIX_REFUND_PCT;
      if (
        refundPct > 0 &&
        getItemQty(record, PHOENIX_PROTOCOL_ITEM_KEY) > 0 &&
        (await consumeItemFromPlayer(record, mode, PHOENIX_PROTOCOL_ITEM_KEY))
      ) {
        const refundData = Math.floor(Math.max(0, mission.entryDataCost ?? 0) * refundPct);
        const refundEnergy = Math.floor(Math.max(0, mission.entryEnergyCost ?? 0) * refundPct);
        record.data = safeDataBalance(record.data + refundData);
        const energyCap = deriveStats(record).maxEnergy;
        record.energy = Math.min(energyCap, Math.max(0, record.energy + refundEnergy));
        alerts.push({
          id: crypto.randomUUID(),
          type: 'success',
          title: '🐦 Протокол-Феникс сработал',
          message: `Провал оплачен не до конца: возвращено +${refundData.toLocaleString('ru-RU')} Data и +${refundEnergy} CPU Charge (${Math.round(refundPct * 100)}% входа). Предмет сгорел.`,
        });
      }
    }

    // «Инвентарь оживает»: 8% на предмет за успешный контракт. Провал и
    // частичный результат дропа не дают — награда только за чистый успех.
    if (outcome === 'success') {
      await rollAndGrantLoot(record, mode, alerts, 'mission');
    }

    await syncTimeAndRules(record, mode, alerts);

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (!sb) throw new Error('Supabase недоступен: награда не подтверждена');
      const { error: claimError } = await sb.rpc('claim_mission_atomic', {
        p_player_id: record.id,
        p_mission_id: mission.id,
        p_expected_data: claimExpected.data,
        p_expected_energy: claimExpected.energy,
        p_expected_crypto: claimExpected.crypto,
        p_expected_chips: claimExpected.chips,
        p_expected_xp: claimExpected.xp,
        p_expected_rep: claimExpected.rep,
        p_expected_heat: claimExpected.heat,
        p_expected_total_missions: claimExpected.totalMissions,
        p_outcome: outcome,
        p_data: record.data,
        p_energy: record.energy,
        p_energy_updated: record.energyUpdated,
        p_crypto: record.crypto,
        p_chips: record.chips,
        p_xp: record.xp,
        p_rep: record.rep,
        p_heat: record.heat,
        p_total_missions: record.totalMissions,
        p_stats: record.stats,
        p_last_passive_claim: record.lastPassiveClaim,
      });
      if (claimError) {
        if (claimError.message.includes('MISSION_CLAIM_ALREADY_PROCESSED')) {
          throw new Error('Награда за эту миссию уже была получена');
        }
        if (claimError.message.includes('MISSION_CLAIM_CONFLICT')) {
          throw new Error('Баланс изменился в другой сессии — обновите экран');
        }
        throw new Error(`Ошибка атомарного получения награды: ${claimError.message}`);
      }
      try {
        // RPC уже зафиксировала reward и mission status. Этот CAS сохраняет
        // вторичные поля snapshot (rank, daily state, passive timestamp).
        await savePlayerCore(record, mode, undefined, record.data, record.energy);
      } catch {
        const fresh = await loadPlayerRecord(user);
        alerts.push({
          id: crypto.randomUUID(),
          type: 'warning',
          title: '📦 Награда сохранена, экран обновлён',
          message: 'Контракт завершён в другой сессии — показан актуальный серверный баланс.',
        });
        return buildResponse(fresh.record, fresh.mode, alerts, 0, 0, appliedClicks);
      }
    } else {
      await savePlayerCore(record, mode);
    }
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

    // v6.6: ЕДИНЫЙ ДЕНЬ. Бонус выдаётся один раз в игровые сутки (00:00 МСК) —
    // тем же ключом, что копилка, леденец, поручения и контракты. Раньше здесь
    // был таймер «20 часов от прошлого клайма», и день игрока начинался трижды.
    const todayKey = getGameDayKey(nowMs);
    const lastClaimKey = getGameDayKeyFromIso(record.lastDailyClaim);
    if (lastClaimKey === todayKey) {
      const bounds = getGameDayBoundsMs(todayKey);
      const hoursLeft = Math.max(1, Math.ceil((bounds.end - nowMs) / 3_600_000));
      throw new Error(
        `Ежедневный бонус уже получен сегодня! Следующий — после 00:00 МСК (через ~${hoursLeft} ч).`
      );
    }
    // Пропуск целого дня — стрик обрывается. Разница считается по тем же
    // игровым суткам, поэтому «вчера 23:59 → сегодня 00:01» — это ровно +1 день.
    if (lastClaimKey && diffGameDayKeys(lastClaimKey, todayKey) > 1) {
      record.dailyStreak = 0;
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
    // v5.6: UTC-дата клайма и длина стрика — только серверное время.
    recordDailyClaim(record, nowMs);

    const cryptoBonus = 3 + record.dailyStreak * 2;
    const dataBonus =
      150 *
      record.dailyStreak *
      getPrestigeMultiplier(record.prestigeCount) *
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

/** Ошибки RPC claim_daily_goal → человеческий текст для клиента. */
function describeDailyGoalClaimError(message: string): string {
  if (message.includes('DAILY_GOAL_ALREADY_CLAIMED')) return 'Награда за эту цель уже получена';
  if (message.includes('DAILY_GOAL_NOT_READY')) return 'Цель ещё не выполнена';
  if (message.includes('DAILY_GOAL_DAY_CHANGED')) return 'Доска целей обновилась — обнови экран';
  if (message.includes('DAILY_GOAL_NO_BOARD')) return 'Доска целей ещё не создана — обнови экран';
  if (message.includes('DAILY_GOAL_INDEX')) return 'Такой цели нет на сегодняшней доске';
  if (message.includes('DAILY_GOAL_VERSION')) return 'Доска целей устарела — обнови экран';
  if (message.includes('GRANT_ITEM_INVALID_SOURCE')) return 'Предмет не выдан: источник не разрешён (нужна миграция 023)';
  return `Цели дня: ${message}`;
}

/**
 * v1.6: сбор награды за цель дня.
 *
 * Атомарность держит RPC `claim_daily_goal` (миграция 023): в одной транзакции
 * проверяются дата, готовность и отметка claimed, начисляются Chips/Crypto и —
 * если это третья цель — выдаётся предмет через `grant_item(source='daily')`.
 * Строка игрока берётся `FOR UPDATE`, поэтому два параллельных claim
 * сериализуются и второй видит уже проставленную отметку.
 *
 * Порядок важен: обычное сохранение (sync, хвост кликов, свежая доска) идёт
 * ДО RPC, а после успешного RPC запись больше не делается — иначе полный
 * снимок stats из памяти мог бы откатить отметку claimed, уже лежащую в БД.
 */
export async function handleDailyGoalAction(
  user: VerifiedTelegramUser,
  goalIndex: number,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    await savePlayerCore(record, mode);

    const dayKey = getUtcDayKey(Date.now());
    const state = ensureDailyGoals(record, dayKey);
    if (!Number.isInteger(goalIndex) || goalIndex < 0 || goalIndex >= state.goals.length) {
      throw new Error('Такой цели нет на сегодняшней доске');
    }
    const goal = state.goals[goalIndex];
    if (goal.claimed) throw new Error('Награда за эту цель уже получена');
    if (goal.progress < goal.target) {
      throw new Error(`Цель ещё не выполнена: ${goal.progress}/${goal.target}`);
    }

    const chips = getDailyGoalChips(goal.key);
    const definition = getDailyGoalDefinition(goal.key);
    // Полный сбор = все остальные цели уже забраны. Предмет роллится ДО RPC,
    // чтобы выдача и отметка прошли одной транзакцией (или не прошли вовсе).
    const fullCollect = state.goals.every((other, index) => index === goalIndex || other.claimed);
    const item = fullCollect ? rollDailyFullSetItem() : null;
    const nowIso = new Date().toISOString();

    const pushAlerts = (grantedItemKey: string | null): void => {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: 'Цель дня закрыта',
        message: `«${definition?.title ?? goal.key}» · +${chips} Чипов и +${DAILY_GOAL_CRYPTO_REWARD} Crypto.`,
      });
      if (grantedItemKey) alerts.push(buildItemDropAlert(grantedItemKey, 'daily'));
    };

    if (mode === 'memory-fallback') {
      // Локальный режим: тот же контракт в одном процессе под withPlayerLock.
      goal.claimed = true;
      record.chips = Math.max(0, Math.floor(safeNonNeg(record.chips, 0)) + chips);
      record.crypto = Math.max(0, Math.floor(safeNonNeg(record.crypto, 0)) + DAILY_GOAL_CRYPTO_REWARD);
      let grantedKey: string | null = null;
      if (item) {
        await grantItemToPlayer(record, mode, item.key, 'daily', 'full_collect');
        record.stats.hasNewItems = true;
        grantedKey = item.key;
      }
      pushAlerts(grantedKey);
      await savePlayerCore(record, mode);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Supabase недоступен: сбор не подтверждён');
    const { data, error } = await sb.rpc('claim_daily_goal', {
      p_player_id: record.id,
      p_goal_index: goalIndex,
      p_chips: chips,
      p_crypto: DAILY_GOAL_CRYPTO_REWARD,
      p_item_key: item ? item.key : null,
      p_day: dayKey,
    });
    if (error) throw new Error(describeDailyGoalClaimError(error.message));

    const payload = (Array.isArray(data) ? data[0] : data) as
      | {
          chips?: number;
          crypto?: number;
          goals?: unknown;
          item_key?: string | null;
          item_qty?: number | null;
        }
      | null
      | undefined;
    if (!payload) throw new Error('Цели дня: RPC не вернул состояние доски');

    // Балансы и доска берутся из БД, а не из памяти: RPC — источник истины.
    record.chips = Math.max(0, Math.floor(safeNonNeg(payload.chips, record.chips)));
    record.crypto = Math.max(0, Math.floor(safeNonNeg(payload.crypto, record.crypto)));
    const claimedBoard = normalizeDailyGoalsState({
      version: 1,
      date: dayKey,
      goals: payload.goals,
    });
    if (claimedBoard) record.stats.dailyGoals = claimedBoard;
    else goal.claimed = true;

    let grantedKey: string | null = null;
    const grantedQty = Math.floor(safeNonNeg(payload.item_qty, 0));
    if (payload.item_key && grantedQty > 0) {
      const grantedItemKey = String(payload.item_key);
      const previous = record.items?.[grantedItemKey];
      record.items = record.items ?? {};
      record.items[grantedItemKey] = {
        key: grantedItemKey,
        qty: grantedQty,
        firstAcquiredAt: previous?.firstAcquiredAt ?? nowIso,
        updatedAt: nowIso,
      };
      record.stats.hasNewItems = true;
      grantedKey = grantedItemKey;
    }

    pushAlerts(grantedKey);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/**
 * v6.1: забор награды за контракт.
 *
 * Награда считается на сервере из конфига, клиент присылает только id. Набор
 * контрактов на сутки проверяется заново (ensureContracts), поэтому старый id
 * из вчерашнего состояния не даст награду.
 */
export async function handleContractAction(
  user: VerifiedTelegramUser,
  contractId: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    // Пачка тапов может сама закрыть контракт — принимаем её до проверки кнопки.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const state = ensureContracts(record, getGameDayKey(Date.now()));
    const contract = getContractDefinition(contractId);
    if (!contract || !state.ids.includes(contract.key)) {
      throw new Error('Этого контракта нет в сегодняшнем наборе');
    }
    if (state.claimed.includes(contract.key)) {
      throw new Error('Награда за этот контракт уже получена');
    }
    const progress = state.progress[contract.key] ?? 0;
    if (progress < contract.target) {
      throw new Error(`Контракт ещё не закрыт: ${progress}/${contract.target}`);
    }

    const dayKey = getGameDayKey(Date.now());
    const expectedData = record.data;
    const reward = contract.reward;
    if (reward.data) record.data += reward.data;
    if (reward.crypto) record.crypto += reward.crypto;
    let chipsGranted = 0;
    if (reward.chips) chipsGranted = grantChips(record, reward.chips, dayKey).granted;
    state.claimed.push(contract.key);

    const parts: string[] = [];
    if (reward.data) parts.push(`+${reward.data.toLocaleString('ru-RU')} Data`);
    if (reward.crypto) parts.push(`+${reward.crypto} Crypto`);
    if (chipsGranted > 0) parts.push(`+${chipsGranted} Chips`);
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `${contract.icon} Контракт закрыт`,
      message:
        parts.length > 0
          ? `«${contract.title}» выполнен. ${parts.join(' · ')}.`
          : `«${contract.title}» выполнен. Награда: ${describeContractReward(reward)}.`,
    });

    await savePlayerCore(record, mode, undefined, expectedData);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/**
 * v6.3: активация сезонного леденца.
 *
 * Одна кнопка, одно правило: раз в игровые сутки и только если сейчас нет
 * активного окна. Буст не копится — он просто открывает ровно час ×2 Data,
 * поэтому здесь нет ни счётчика зарядов, ни покупок.
 */
export async function handleLollipopAction(
  user: VerifiedTelegramUser,
  action: 'activate',
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    if (action !== 'activate') throw new Error('Неизвестное действие леденца');
    if (!isSeasonActive) throw new Error('Сезон леденца уже закрыт');

    const nowMs = Date.now();
    const state = record.stats.lollipop ?? { activeUntil: null, lastActivatedDayKey: null };

    if (isLollipopActive(state, nowMs)) {
      throw new Error('Леденец уже работает — Data ×2 идёт прямо сейчас');
    }
    if (!canActivateLollipop(state, nowMs)) {
      const leftMin = Math.ceil(lollipopCooldownMs(state, nowMs) / 60_000);
      throw new Error(`Сегодня леденец уже был — следующий через ${leftMin} мин.`);
    }

    record.stats.lollipop = {
      activeUntil: new Date(nowMs + LOLLIPOP_BOOST_MS).toISOString(),
      lastActivatedDayKey: getGameDayKey(nowMs),
    };

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: '🍭 Леденец активирован: ×2 Data на час',
      message:
        'Час удвоенной добычи: тапы и закрытые взломы приносят вдвое больше Data. Дальше леденец снова будет доступен только завтра.',
    });

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/**
 * v6.8 — СЮЖЕТ: забрать награду за шаг главы.
 *
 * Клиент присылает только id шага. Всё остальное проверяет сервер:
 *   • шаг существует и его глава открыта по уровню;
 *   • требование шага выполнено по фактам записи (клиент не может «прислать»
 *     прогресс: тапы, контракты и серые взломы считаются здесь же);
 *   • награда выдаётся ровно один раз — id шага попадает в stats.storyClaimed;
 *   • награда за главу выдаётся вместе с её последним шагом и тоже один раз.
 *
 * Data-награда пересчитывается из pricing.config (часы дохода), поэтому
 * ребаланс цен не превращает старые главы в мешки с деньгами.
 */
export async function handleStoryClaim(
  user: VerifiedTelegramUser,
  stepId: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const found = findStoryStep(stepId);
    if (!found) throw new Error('Такого шага в истории нет');
    const { arc, step } = found;

    const facts = storyFactsFromRecord(record);
    if (facts.level < arc.requiredLevel) {
      throw new Error(`Глава «${arc.title}» откроется на ${arc.requiredLevel} уровне`);
    }

    const claimed = record.stats.storyClaimed ?? (record.stats.storyClaimed = []);
    if (claimed.includes(step.id)) {
      throw new Error('Награда за этот шаг уже получена');
    }
    if (!isStoryStepMet(step, facts)) {
      throw new Error(
        `Шаг ещё не выполнен: ${step.requirement.label} (${facts[step.requirement.key]}/${step.requirement.value})`
      );
    }

    const paid = record.stats.storyChaptersPaid ?? (record.stats.storyChaptersPaid = []);
    const dataGain = storyDataReward(step.reward, arc.requiredLevel);
    record.data = Math.min(MAX_SAFE_DATA_BALANCE, record.data + dataGain);
    const cryptoGain = Math.max(0, Math.floor(step.reward.crypto ?? 0));
    record.crypto += cryptoGain;
    // Чипы за сюжет не упираются в дневной кап: это одноразовая награда за главу,
    // а не поток за контракты (кап существует, чтобы ограничить именно поток).
    const chipsGain = Math.max(0, Math.floor(step.reward.chips ?? 0));
    record.chips += chipsGain;
    claimed.push(step.id);

    const rewardParts: string[] = [];
    if (dataGain > 0) rewardParts.push(`+${dataGain.toLocaleString('ru-RU')} Data`);
    if (cryptoGain > 0) rewardParts.push(`+${cryptoGain} 💎 Crypto`);
    if (chipsGain > 0) rewardParts.push(`+${chipsGain} ⚙️ Чипов`);
    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: step.title,
      message: rewardParts.length > 0 ? `Шаг закрыт. ${rewardParts.join(' · ')}.` : 'Шаг закрыт.',
    });

    // Последний шаг закрывает главу: бонус и строка «состояние мира».
    const arcDone = storyStepIds(arc).every((id) => claimed.includes(id));
    if (arcDone && !paid.includes(arc.id)) {
      paid.push(arc.id);
      const bonusData = storyDataReward(arc.reward, arc.requiredLevel);
      record.data = Math.min(MAX_SAFE_DATA_BALANCE, record.data + bonusData);
      const bonusCrypto = Math.max(0, Math.floor(arc.reward.crypto ?? 0));
      record.crypto += bonusCrypto;
      const bonusChips = Math.max(0, Math.floor(arc.reward.chips ?? 0));
      record.chips += bonusChips;
      const bonusParts: string[] = [];
      if (bonusData > 0) bonusParts.push(`+${bonusData.toLocaleString('ru-RU')} Data`);
      if (bonusCrypto > 0) bonusParts.push(`+${bonusCrypto} 💎`);
      if (bonusChips > 0) bonusParts.push(`+${bonusChips} ⚙️`);
      alerts.push({
        id: crypto.randomUUID(),
        type: 'achievement',
        title: `📖 Глава закрыта: ${arc.title}`,
        message:
          `${arc.flavor}` + (bonusParts.length > 0 ? ` Награда за главу: ${bonusParts.join(' · ')}.` : ''),
      });
    }

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/**
 * v6.2 — АКТИВНЫЙ ВЗЛОМ.
 *
 * Два действия:
 *   • start — списывает CPU Charge на вход и выдаёт сессию (id + seed + таймер);
 *   • finish — принимает итог сессии, пересчитывает награду по seed и закрывает
 *     сессию навсегда.
 *
 * Клиент не может «накрутить» ни раскладку (она из seed), ни число узлов
 * (сетка конечна), ни темп (не больше HACK_MAX_TAPS_PER_SEC), ни повтор
 * (finished ставится в той же транзакции, что и начисление).
 */
export async function handleHackAction(
  user: VerifiedTelegramUser,
  action: 'start' | 'finish',
  payload: {
    difficulty?: string;
    sessionId?: string;
    safeHits?: number;
    trapHits?: number;
  },
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const nowMs = Date.now();

    if (action === 'start') {
      const difficulty = getHackDifficulty(String(payload.difficulty ?? ''));
      if (!difficulty) throw new Error('Неизвестный уровень взлома');

      const blockedUntil = record.clickBlockedUntil
        ? new Date(record.clickBlockedUntil).getTime()
        : 0;
      if (blockedUntil > nowMs) {
        const left = Math.ceil((blockedUntil - nowMs) / 1000);
        throw new Error(
          `Терминал в блокировке киберпатруля — остынь ${left} сек. и попробуй снова`
        );
      }

      const current = record.stats.hackSession;
      if (current && !current.finished && nowMs < new Date(current.endsAt).getTime() + 5_000) {
        throw new Error('Взлом уже идёт — закончи текущую сессию');
      }

      if (record.energy < difficulty.cost) {
        throw new Error(
          `Недостаточно CPU Charge: нужно ${difficulty.cost} ⚡, есть ${Math.floor(record.energy)}`
        );
      }

      const expectedEnergy = record.energy;
      record.energy = Math.max(0, record.energy - difficulty.cost);
      record.energyUpdated = new Date(nowMs).toISOString();
      // Цели дня: вход в сессию взлома — такое же серверное списание CPU Charge.
      incrementDailyGoalProgress(record, 'cpu', difficulty.cost);
      record.stats.hackSession = {
        id: crypto.randomUUID(),
        difficulty: difficulty.key,
        seed: crypto.randomInt(1, 2 ** 31 - 1),
        startedAt: new Date(nowMs).toISOString(),
        endsAt: new Date(nowMs + HACK_SESSION_SECONDS * 1000).toISOString(),
        cost: difficulty.cost,
        finished: false,
      };

      alerts.push({
        id: crypto.randomUUID(),
        type: 'info',
        title: `🖥️ Взлом начат: ${difficulty.title.toLowerCase()} контур`,
        message: `${HACK_SESSION_SECONDS} сек · −${difficulty.cost} CPU Charge. Безопасный узел: +${difficulty.dataPerNode} Data, ловушка: +${difficulty.trapHeat} Heat.`,
      });

      await savePlayerCore(record, mode, undefined, undefined, expectedEnergy);
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    if (action !== 'finish') throw new Error('Неизвестное действие взлома');

    const session = record.stats.hackSession;
    if (!session || session.id !== String(payload.sessionId ?? '')) {
      throw new Error('Сессия взлома не найдена — обнови экран');
    }
    if (session.finished) {
      throw new Error('Результат этой сессии уже принят');
    }
    const difficulty = getHackDifficulty(session.difficulty);
    if (!difficulty) throw new Error('Неизвестный уровень взлома');

    const endsAtMs = new Date(session.endsAt).getTime();
    const startedAtMs = new Date(session.startedAt).getTime();
    if (nowMs > endsAtMs + HACK_FINISH_GRACE_SEC * 1000) {
      session.finished = true;
      await savePlayerCore(record, mode);
      throw new Error('Сессия истекла — награду не начислим');
    }

    // Темп: за прошедшее время человек физически не мог открыть больше узлов.
    const elapsedSec = Math.max(
      1,
      Math.min(HACK_SESSION_SECONDS, (Math.min(nowMs, endsAtMs) - startedAtMs) / 1000)
    );
    const allowedTaps = Math.ceil(elapsedSec * HACK_MAX_TAPS_PER_SEC);
    const nodes = countHackNodes(session.seed, difficulty);

    const safeHits = Math.max(0, Math.floor(Number(payload.safeHits) || 0));
    const trapHits = Math.max(0, Math.floor(Number(payload.trapHits) || 0));

    if (safeHits > nodes.safe || trapHits > nodes.traps) {
      throw new Error('Результат не сходится с сеткой — сессия отклонена');
    }
    if (safeHits + trapHits > allowedTaps) {
      throw new Error('Слишком много узлов за это время — результат отклонён');
    }

    // v6.3: тот же сезонный множитель, что и на тапах.
    // v6.5: и тот же множитель места — взлом из корп-квартала приносит больше, но шумит.
    const hackWhere = locationEconomy(record.stats);
    const hackLoot = hackDataReward(difficulty, safeHits) * lollipopMultiplier(record.stats.lollipop, nowMs);
    const dataGain = Math.round(hackLoot * hackWhere.mods.data);
    const heatGain = Math.round(hackHeatGain(difficulty, trapHits) * hackWhere.mods.heat);
    const expectedData = record.data;

    record.data = Math.min(MAX_SAFE_DATA_BALANCE, record.data + dataGain);
    record.heat = Math.max(0, record.heat + heatGain);
    session.finished = true;
    session.safeHits = safeHits;
    session.trapHits = trapHits;
    session.dataGained = dataGain;
    session.heatGained = heatGain;

    // Взлом — тоже Heat-событие: контракты с метрикой heat должны его видеть.
    incrementContractProgress(record, 'heat', heatGain);
    // Цели дня: взлом засчитывается только если узлы реально вскрыты, Data — по
    // подтверждённой сервером награде.
    if (safeHits > 0) incrementDailyGoalProgress(record, 'hacks', 1);
    incrementDailyGoalProgress(record, 'data', dataGain);

    if (dataGain > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `${difficulty.icon} Взлом закрыт: +${dataGain.toLocaleString('ru-RU')} Data`,
        message: `Узлов вскрыто: ${safeHits} из ${nodes.safe}. Ловушек: ${trapHits}${heatGain > 0 ? ` (+${heatGain} Heat)`: ''}.`,
      });
    }

    // «Инвентарь оживает»: ролл дропа ТОЛЬКО после успешного исхода и только на
    // сервере. easy 10% / medium 15% / hard 20%, внутри — 85/12/3 по редкости.
    // Тапы сюда не относятся: дропа с тапов не существует.
    if (safeHits > 0) {
      await rollAndGrantLoot(record, mode, alerts, 'hack', { difficulty: difficulty.key });
    }

    await savePlayerCore(record, mode, undefined, expectedData);
    // Пересчитываем правила после Heat: при перегреве срабатывает тот же
    // киберпатруль, что и на обычных действиях (штраф + блокировка терминала).
    await syncTimeAndRules(record, mode, alerts);
    if (alerts.length > 0) await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

/**
 * Ежедневный киберинцидент. Выбор одноразовый и серверный: клиент присылает
 * только ключ кнопки, а исход вычисляется здесь и сохраняется через Data-CAS.
 */
export async function handleDailyIncidentAction(
  user: VerifiedTelegramUser,
  choiceKey: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);

    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    if (appliedClicks > 0) await savePlayerCore(record, mode);

    const state = ensureDailyIncident(record.stats, record.tgId, getGameDayKey(Date.now()));
    if (state.choiceKey) {
      throw new Error('Сегодняшний киберинцидент уже закрыт');
    }

    const definition = getDailyIncidentDefinition(state.incidentKey);
    if (!definition || !definition.choices.some((choice) => choice.key === choiceKey)) {
      throw new Error('Этот выбор не относится к сегодняшнему инциденту');
    }

    const expectedData = record.data;
    const outcome = resolveDailyIncidentOutcome(
      record.tgId,
      state,
      deriveStats(record).level,
      choiceKey
    );
    const previousRep = record.rep;
    const previousHeat = record.heat;

    record.data = safeDataBalance(record.data + outcome.data);
    record.crypto += outcome.crypto;
    record.rep = Math.max(0, record.rep + outcome.rep);
    record.heat = Math.max(0, record.heat + outcome.heat);
    state.choiceKey = outcome.choiceKey;
    state.resolvedAt = new Date().toISOString();
    state.outcome = {
      data: outcome.data,
      crypto: outcome.crypto,
      rep: record.rep - previousRep,
      heat: record.heat - previousHeat,
      summary: outcome.summary,
    };

    alerts.push({
      id: crypto.randomUUID(),
      type: outcome.heat > 0 ? 'warning' : 'success',
      title: `📡 ${definition.title} закрыт`,
      message: outcome.summary,
    });

    // Data + Rep/Heat CAS защищают одноразовый выбор на разных serverless-инстансах.
    // Это сохраняет guard даже если Data уже упёрся в конечный cap.
    await savePlayerCore(record, mode, undefined, expectedData, undefined, previousRep, previousHeat);
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
    const frameKey =
      action === 'claim_mastery'
        ? ACTIVE_SEASON_EVENT.masteryFrameKey
        : ACTIVE_SEASON_EVENT.participationFrameKey;
    const frame = getProfileFrame(frameKey);

    if (action === 'claim_mastery') {
      if (state.masteryClaimed) throw new Error('Золотая рамка уже получена');
      if (state.completedDays.length !== SEASON_EVENT_DAY_COUNT) {
        throw new Error('Сначала закрой все 7 календарных дней Neon Relay');
      }
    } else {
      if (state.participationClaimed) throw new Error('Голубая рамка уже получена');
      if (state.completedDays.length < 1) {
        throw new Error('Сначала полностью закрой любой день: все 3 задания');
      }
    }

    // Награды выдаются автоматически в момент завершения дня. Этот endpoint
    // оставлен idempotency-сторожем для старых клиентов и QA: он не начисляет
    // ресурсы и не может повторно добавить рамку.
    grantSeasonEventRewards(record, state);
    if (
      (action === 'claim_mastery' && !state.masteryClaimed) ||
      (action === 'claim_participation' && !state.participationClaimed)
    ) {
      throw new Error('Награда сезонной операции не готова');
    }

    alerts.push({
      id: crypto.randomUUID(),
      type: 'success',
      title: `🖼️ Рамка «${frame.name}» уже в коллекции`,
      message: 'Косметическая награда постоянная и доступна для повторного применения в профиле.',
    });

    await savePlayerCore(record, mode);
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

export async function handleSkinAction(
  user: VerifiedTelegramUser,
  action:
    | 'buy_or_equip'
    | 'clear_lockdown'
    | 'set_theme'
    | 'set_backdrop'
    | 'profile_frame'
    | 'set_location',
  skinKey?: string,
  pendingClicks = 0
): Promise<ApiSyncResponse> {
  return withPlayerLock(user.tgId, async () => {
    const { record, mode } = await loadPlayerRecord(user);
    const baselineExpected = captureAtomicExpected(record);
    let atomicExpected = baselineExpected;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // Сохраняем синхронизацию и честно применённые клики до проверки цены.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? baselineExpected.data : undefined,
      mode === 'supabase' ? baselineExpected.energy : undefined
    );
    atomicExpected = captureAtomicExpected(record);

    if (action === 'profile_frame') {
      const frameKey = typeof skinKey === 'string' && skinKey.length > 0 ? skinKey : 'default';
      const frame = getProfileFrame(frameKey);
      if (frame.key !== frameKey) {
        throw new Error('Рамка профиля не найдена');
      }

      if (frame.key === 'default') {
        record.stats.equippedProfileFrame = undefined;
        alerts.push({
          id: crypto.randomUUID(),
          type: 'success',
          title: '🖼️ Рамка профиля снята',
          message: 'Профиль снова использует стандартный контур.',
        });
      } else {
        const unlocked = new Set(record.stats.unlockedProfileFrames ?? []);
        if (!unlocked.has(frame.key)) {
          if (frame.temporary) {
            throw new Error('Эта временная рамка выдаётся персонально и не продаётся');
          }
          if (frame.giftOnly) {
            throw new Error('Эта рамка выдаётся персонально и не продаётся');
          }
          if (frame.eventKey) {
            throw new Error('Эта рамка выдаётся только за успешное прохождение события');
          }
          const frameLevel = deriveStats(record).level;
          if ((frame.requiredLevel ?? 30) > frameLevel) {
            throw new Error(`Рамка «${frame.name}» открывается на ${frame.requiredLevel ?? 30} уровне`);
          }
          const price = frame.cryptoCost ?? 0;
          if (record.crypto < price) {
            throw new Error(`Недостаточно Crypto (нужно ${price} 💎)`);
          }
          record.crypto -= price;
          unlocked.add(frame.key);
          record.stats.unlockedProfileFrames = Array.from(unlocked);
          alerts.push({
            id: crypto.randomUUID(),
            type: 'success',
            title: `🖼️ Рамка «${frame.name}» куплена`,
            message: 'Рамка открыта навсегда и сразу надета в профиле.',
          });
        } else {
          alerts.push({
            id: crypto.randomUUID(),
            type: 'success',
            title: `🖼️ Рамка «${frame.name}» включена`,
            message: 'Рамка сохранена в профиле и видна в рейтинговой таблице.',
          });
        }
        record.stats.equippedProfileFrame = frame.key;
      }

      await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

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
      await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
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
      await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    // v4.1: выбор «вида из окна». Косметика без бонусов: ни Data, ни Crypto
    // не списываются; ключ валидируется по конфигу, чтобы в jsonb не попадал мусор.
    if (action === 'set_backdrop') {
      // Пустой ключ = вернуться к сцене по уровню. Это тоже косметика, поэтому
      // сброс не стоит ресурсов и не требует отдельного действия в API.
      if (!skinKey) {
        delete record.stats.deskBackdrop;
        alerts.push({
          id: crypto.randomUUID(),
          type: 'info',
          title: '🌆 Сцена по уровню',
          message: 'Вид из окна сброшен: стол снова растёт вместе с твоим уровнем.',
        });
        await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
        return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
      }
      if (!isBackdropKey(skinKey)) {
        throw new Error('Фон не найден');
      }
      const backdrop = BACKDROPS_CONFIG.find((b) => b.key === skinKey);
      if (!backdrop) {
        throw new Error('Фон не найден');
      }
      if (deriveStats(record).level < backdrop.requiredLevel) {
        throw new Error(`Фон откроется на Ур. ${backdrop.requiredLevel}`);
      }
      record.stats.deskBackdrop = backdrop.key;
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `${backdrop.glyph} Вид из окна: «${backdrop.name}»`,
        message: backdrop.tagline,
      });
      await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
      return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
    }

    // v5.5: переезд между локациями мира. Это не покупка: ни Data, ни Crypto не
    // списываются, но открытость локации проверяется на сервере по уровню.
    if (action === 'set_location') {
      // Флаг-гейт: при WORLD_V2=false мира нет и на сервере тоже — иначе старый
      // клиент (или curl) мог бы развести сейв по локациям, которых нет в UI.
      if (!isWorldV2Enabled()) {
        throw new Error('Мир пока недоступен');
      }
      const location = getLocation(skinKey);
      if (!location) {
        throw new Error('Локация не найдена');
      }
      const level = deriveStats(record).level;
      if (!isLocationUnlocked(location.id, level)) {
        throw new Error(`Локация «${location.name}» откроется на ${location.minLevel} уровне`);
      }
      record.stats.locationId = location.id;
      // Витрина пересобирается под новую локацию сразу: иначе игрок видел бы
      // контракты прошлого места до следующего 15-минутного окна.
      const nextOffer = computeOfferWindow(
        record.tgId,
        deriveStats(record).unlockedGreyMissions,
        level,
        record.stats.missionRefreshSalt,
        location.id
      );
      record.availableMissionKeys = nextOffer.keys;
      record.missionsRefreshedAt = new Date().toISOString();
      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `${location.glyph} Ты на месте: «${location.name}»`,
        message: location.flavor,
      });
      await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
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

    await commitPurchaseAtomic(record, mode, atomicExpected, 'player');
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

    // ВАЖНО: сбрасываются только карточки, команда, активные миссии и Data/Heat.
    // Питомцы, «База», Чипы, Тир, скины, Crypto и достижения — сохраняются навсегда.
    // Для Supabase все эти изменения и удаление owned rows проходят одной RPC.
    record.cards = {};
    record.team = [];
    record.activeMissions = [];
    record.data = 0;
    record.heat = 0;
    record.energy = BASE_MAX_ENERGY;
    record.energyUpdated = new Date().toISOString();
    record.prestigeCount = expectedPrestige + 1;

    if (!record.unlockedSkins.includes('prestige_omega')) {
      record.unlockedSkins.push('prestige_omega');
    }
    record.equippedSkin = 'prestige_omega';

    if (mode === 'supabase') {
      const sb = getSupabaseAdmin();
      if (!sb) throw new Error('Supabase недоступен: престиж не подтверждён');
      const { error } = await sb.rpc('global_prestige_atomic', {
        p_player_id: record.id,
        p_expected_prestige: expectedPrestige,
        p_new_prestige: record.prestigeCount,
        p_energy: record.energy,
        p_energy_updated: record.energyUpdated,
        p_unlocked_skins: record.unlockedSkins,
        p_equipped_skin: record.equippedSkin,
        p_stats: record.stats,
      });
      if (error) {
        if (error.message.includes('PRESTIGE_CONFLICT')) {
          throw new Error('Global Hack Престиж уже был выполнен!');
        }
        throw new Error(`Ошибка атомарного престижа: ${error.message}`);
      }
    }

    // v6.6: текст собирается из shared/prestige.config.ts — того же списка,
    // по которому сбрасывается запись. Сервер не может «забыть» упомянуть что-то.
    alerts.push({
      id: crypto.randomUUID(),
      type: 'achievement',
      title: `🌐 GLOBAL HACK #${record.prestigeCount} ВЫПОЛНЕН!`,
      message:
        `Сброшено: ${PRESTIGE_RESETS.join(', ')}. ` +
        `Сохранено: ${PRESTIGE_KEEPS.join(', ')}. ` +
        `Постоянный множитель дохода теперь ×${getPrestigeMultiplier(record.prestigeCount)}.`,
    });

    await syncTimeAndRules(record, mode, alerts);
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? 0 : undefined,
      mode === 'supabase' ? BASE_MAX_ENERGY : undefined
    );
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
    const baselineExpected = captureAtomicExpected(record);
    let atomicExpected = baselineExpected;
    const alerts: GameAlert[] = [];
    await syncTimeAndRules(record, mode, alerts);
    // Сохраняем синхронизацию и честно применённые клики до проверки цены.
    const appliedClicks = await applyPendingClicks(record, mode, pendingClicks, 20);
    await savePlayerCore(
      record,
      mode,
      undefined,
      mode === 'supabase' ? baselineExpected.data : undefined,
      mode === 'supabase' ? baselineExpected.energy : undefined
    );
    atomicExpected = captureAtomicExpected(record);

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

      alerts.push({
        id: crypto.randomUUID(),
        type: 'success',
        title: `${cfg.emoji} ${cfg.name} теперь с тобой!`,
        message: `${cfg.buffLabel}. Не забывай кормить — баф растёт от сытости и привязанности.`,
      });

      await syncTimeAndRules(record, mode, alerts);
      await commitPurchaseAtomic(record, mode, atomicExpected, 'pet_buy', {
        itemKey: cfg.key,
        lastFedAt: nowIso,
      });
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

    const today = getGameDayKey(nowMs);
    if (record.stats.lastPetFeedDay !== today) {
      const yesterday = getGameDayKey(nowMs - 86_400_000);
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
    await commitPurchaseAtomic(record, mode, atomicExpected, 'pet_feed', {
      itemKey: cfg.key,
      hunger: owned.hunger,
      lastFedAt: owned.lastFedAt,
      feedCount: owned.feedCount,
    });
    return buildResponse(record, mode, alerts, 0, 0, appliedClicks);
  });
}

const TRACK_TUTORIAL_TABS = new Set(['currencies', 'upgrades', 'hacks', 'team', 'endgame']);
const TRACK_APP_TABS = new Set(['/', '/upgrades', '/hacks', '/team', '/profile']);
const MAX_TRACK_EVENTS_PER_DAY = 200;
/**
 * Эти достижения могут использовать клиентские telemetry-сигналы для UX-бейджа,
 * но никогда не должны выдавать валюту: session/hour/idle/shop нельзя доказать
 * одним POST из браузера.
 */
const CLIENT_TELEMETRY_ACHIEVEMENTS = new Set([
  'tutorial_all_tabs',
  'tutorial_reread_10',
  'tabs_tourist',
  'night_owl',
  'early_bird',
  'coffee_break',
  'session_30m',
  'shop_freeze_30',
]);

/**
 * Клиентская телеметрия ограничена whitelist и дневным cap. Она может открыть
 * badge, но перечисленные выше события не дают Crypto/Chips/Data без серверного
 * подтверждения факта.
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
    const today = getGameDayKey(nowMs);
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
      case 'onboarding_done': {
        // v5.4: гейт первого сеанса пройден — оверлей больше не показываем.
        if (record.stats.onboardingV2Completed !== true) {
          record.stats.onboardingV2Completed = true;
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
      .select('id, tg_id, username, level, data, xp, rank, prestige_count, stats')
      .gt('tg_id', -10_000_000)
      .order(metric, { ascending: false })
      .order(metric === 'xp' ? 'data' : 'xp', { ascending: false })
      .limit(100);

    if (!error && data) {
      const entries: LeaderboardEntry[] = data.map((row) => {
        const rankIdx = Math.max(1, Math.min(RANK_TITLES.length, Number(row.rank ?? 1)));
        return {
          profileId: String(row.id),
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
        profileId: rec.id,
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
