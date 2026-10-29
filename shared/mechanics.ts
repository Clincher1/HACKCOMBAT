import { getMaxCardLevel } from './cards.config';
import { CARDS_CONFIG, getCardLevelIncomeMultiplier, MAX_CARD_LEVEL } from './cards.config';
import { getLevelProgress } from './hack.config';
import { BASE_UPGRADES_CONFIG, getBaseUpgradeConfig } from './base.config';
import {
  getEffectiveHunger,
  getPetBuffMultiplier,
  getPetFeedCost,
  PETS_CONFIG,
} from './pets.config';
import { SKIN_CLICK_BONUS_CAP, SKINS_CONFIG } from './skins.config';
import { TEAM_CONFIG } from './team.config';
import type {
  AlignmentBranch,
  BaseUpgradeConfig,
  DerivedStats,
  PetConfig,
  PetState,
} from './types';

// v3.1: быстрый тап не должен задыхаться. Канон текущей модели — 1500 стартовой
// энергии и +1 за 2 сек; потолок с апгрейдами Базы прежний (MAX_ENERGY_CAP).
export const BASE_MAX_ENERGY = 1500;
export const MAX_ENERGY_CAP = 5000;
export const ENERGY_REGEN_SECONDS = 2; // 1 Energy / 2 сек

// «Фоновая копилка тапов»: пока игрок оффлайн, за него медленно тапают.
// Доход = тапы × сила клика, поэтому прокачка клика усиливает и оффлайн.
// v3.2: ставка снижена вдвое (6 тапов в минуту) — оффлайн не должен заменять игру.
export const OFFLINE_TAP_RATE_PER_SEC = 0.1;
export const OFFLINE_TAP_CAP_SECONDS = 8 * 3600;

// v3.2: пассив карточек в оффлайне платит половину — ресурсы нельзя получать «на халяву».
export const OFFLINE_PASSIVE_RATE_MULT = 0.5;

// v3.2: оффлайн копится только тем, кто в текущем игровом дне реально играл.
export const OFFLINE_REQUIRED_ACTIVE_SECONDS = 8 * 60; // 8 минут активной игры в день
/** Сутки считаем по Москве (UTC+3): смена дня = сброс счётчика активности. */
export const GAME_DAY_UTC_OFFSET_MINUTES = 180;
/** Разрыв между запросами, после которого сессия считается прерванной (клиент пингует раз в 30 с). */
export const ACTIVITY_HEARTBEAT_MAX_GAP_SEC = 45;

/** Ключ игрового дня 'YYYY-MM-DD' по Москве (UTC+3). */
export function getGameDayKey(nowMs: number = Date.now()): string {
  const shifted = new Date(nowMs + GAME_DAY_UTC_OFFSET_MINUTES * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Границы игровых суток (Москва) в миллисекундах: [start, end). */
export function getGameDayBoundsMs(dayKey: string): { start: number; end: number } {
  const start = Date.parse(`${dayKey}T00:00:00Z`) - GAME_DAY_UTC_OFFSET_MINUTES * 60_000;
  return { start, end: start + 86_400_000 };
}

export const HEAT_PENALTY_THRESHOLD = 100; // Heat > 100 -> штраф (раздел 2 и 5.4 ТЗ)
export const HEAT_RESET_AFTER_PENALTY = 50;
export const HEAT_PENALTY_DATA_LOSS_PCT = 0.1; // Потеря 10% Data
export const HEAT_LOCKDOWN_SECONDS = 60; // Блок кликов на 60 сек
export const PRESTIGE_REQUIRED_LEVEL = 50;
/**
 * Числовой safety-horizon для старых импортов. Это больше не игровой cap:
 * после первых пяти циклов Global Hack можно продолжать престиж бесконечно.
 */
export const MAX_PRESTIGE_COUNT = Number.MAX_SAFE_INTEGER;
export const PRESTIGE_DOUBLING_CYCLES = 5;
export const PRESTIGE_POST_CAP_BONUS = 0.1;
export const BASE_OFFLINE_CAP_SECONDS = 8 * 3600;

export function getSafePrestigeCount(prestigeCount: number): number {
  const raw = Number(prestigeCount);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_PRESTIGE_COUNT, Math.floor(raw)));
}

export function getPrestigeMultiplier(prestigeCount: number): number {
  const safe = getSafePrestigeCount(prestigeCount);
  const doublingCycles = Math.min(PRESTIGE_DOUBLING_CYCLES, safe);
  const extraCycles = Math.max(0, safe - PRESTIGE_DOUBLING_CYCLES);
  // Первые пять циклов сохраняют привычную дугу ×2 → ×32. После неё бонус
  // продолжается мягко (+10% за цикл), чтобы игрок не упирался в стену и
  // экономика не улетала в Infinity.
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.pow(2, doublingCycles) * (1 + extraCycles * PRESTIGE_POST_CAP_BONUS)
  );
}

/** Следующий Global Hack открывается каждые 10 уровней: 50, 60, 70, 80, 90, 100… */
export function getPrestigeRequiredLevel(prestigeCount: number): number {
  const safe = getSafePrestigeCount(prestigeCount);
  return Math.min(Number.MAX_SAFE_INTEGER, PRESTIGE_REQUIRED_LEVEL + safe * 10);
}

// 12 канонических кибер-рангов; после них титулы продолжаются процедурно.
export const RANK_TITLES: { minLevel: number; minData: number; title: string }[] = [
  { minLevel: 1, minData: 0, title: 'Script Kiddie' },
  { minLevel: 5, minData: 2_500, title: 'Hacker' },
  { minLevel: 10, minData: 15_000, title: 'Netrunner' },
  { minLevel: 18, minData: 75_000, title: 'Cybercriminal' },
  { minLevel: 26, minData: 400_000, title: 'Shadow Broker' },
  { minLevel: 35, minData: 2_000_000, title: 'Darknet Legend' },
  { minLevel: 50, minData: 12_000_000, title: 'Phantom Architect' },
  { minLevel: 70, minData: 60_000_000, title: 'Cyber Overlord' },
  { minLevel: 85, minData: 300_000_000, title: 'Neon Sovereign' },
  { minLevel: 100, minData: 1_500_000_000, title: 'Singularity Ghost' },
  { minLevel: 125, minData: 8_000_000_000, title: 'Architect of Chaos' },
  { minLevel: 155, minData: 40_000_000_000, title: 'Zero-Point Entity' },
];

/**
 * Ранг — карьерный, а не текущий кошелёк. minData оставлен в конфиге для
 * исторического UI, но после prestige текущий Data обнуляется, поэтому rank
 * должен определяться только lifetime XP/уровнем и одинаково на всех путях.
 */
export function getRankForLevel(level: number): { rankIndex: number; rankTitle: string } {
  const rawLevel = Number(level);
  const safeLevel = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
  let rankIndex = 1;
  let rankTitle = RANK_TITLES[0].title;
  RANK_TITLES.forEach((rank, index) => {
    if (safeLevel >= rank.minLevel) {
      rankIndex = index + 1;
      rankTitle = rank.title;
    }
  });

  // После канонических 12 рангов каждые 25 уровней открывается новый
  // процедурный титул. Так бесконечный XP не превращается в бесконечный
  // уровень с одним и тем же званием.
  const lastRank = RANK_TITLES[RANK_TITLES.length - 1];
  const endlessStep = Math.floor(Math.max(0, safeLevel - lastRank.minLevel) / 25);
  if (endlessStep > 0) {
    const endlessTitles = [
      'Quantum Sovereign',
      'Entropy Weaver',
      'Chrono Hacker',
      'Void Architect',
      'Singularity Regent',
    ];
    const titleIndex = (endlessStep - 1) % endlessTitles.length;
    const titleCycle = Math.floor((endlessStep - 1) / endlessTitles.length) + 1;
    rankIndex = RANK_TITLES.length + endlessStep;
    rankTitle = `${endlessTitles[titleIndex]} ${titleCycle}`;
  }

  return { rankIndex, rankTitle };
}

export function computeAlignment(rep: number, heat: number): AlignmentBranch {
  if (rep >= 10 && rep > heat * 2) {
    return 'white_hat';
  }
  if (heat >= 10 && heat > rep * 2) {
    return 'black_hat';
  }
  return 'neutral';
}

export function computeDeskStage(level: number): 1 | 5 | 10 | 15 | 20 | 25 | 30 {
  if (level >= 30) return 30;
  if (level >= 25) return 25;
  if (level >= 20) return 20;
  if (level >= 15) return 15;
  if (level >= 10) return 10;
  if (level >= 5) return 5;
  return 1;
}

export function getDeskStageInfo(stage: 1 | 5 | 10 | 15 | 20 | 25 | 30): {
  title: string;
  subtitle: string;
  sceneUrl: string;
  nextLevel: number | null;
} {
  switch (stage) {
    case 1:
      return {
        title: 'Ур. 1 — Подпольный Старт',
        subtitle: 'Один монитор, верная механика и ночной кофе',
        sceneUrl: '/assets/scenes/stage-01.webp',
        nextLevel: 5,
      };
    case 5:
      return {
        title: 'Ур. 5 — Двойной Неон',
        subtitle: 'Второй монитор + RGB неоновая подсветка стола',
        sceneUrl: '/assets/scenes/stage-05.webp',
        nextLevel: 10,
      };
    case 10:
      return {
        title: 'Ур. 10 — Локальный Кластер',
        subtitle: 'Собственная серверная стойка рядом со столом',
        sceneUrl: '/assets/scenes/stage-10.webp',
        nextLevel: 15,
      };
    case 15:
      return {
        title: 'Ур. 15 — Воздушный Перехват',
        subtitle: 'Дрон-разведчик с активным оптическим сканером',
        sceneUrl: '/assets/scenes/stage-15.webp',
        nextLevel: 20,
      };
    case 20:
      return {
        title: 'Ур. 20 — Кибер-Станция',
        subtitle: 'Три монитора + кресло геймера + 3 слота миссий',
        sceneUrl: '/assets/scenes/stage-20.webp',
        nextLevel: 25,
      };
    case 25:
      return {
        title: 'Ур. 25 — Серверный Бункер',
        subtitle: 'Полный переезд в подземный дата-центр',
        sceneUrl: '/assets/scenes/stage-25.webp',
        nextLevel: 30,
      };
    case 30:
      return {
        title: 'Ур. 30+ — Ядро Матрицы',
        subtitle: 'Летающие голограммы, дрон и цифровой дождь',
        sceneUrl: '/assets/scenes/stage-30.webp',
        nextLevel: 50,
      };
  }
}

/** Собранные бонусы «Базы» (10 пассивных апгрейдов). Значения зажаты в безопасные рамки. */
export interface BaseUpgradeTotals {
  energyRegenBonusPct: number;
  clickBonusPct: number;
  heatReductionPct: number;
  offlineCapBonusSec: number;
  autoClickPerSec: number;
  missionRewardBonusPct: number;
  passiveBonusPct: number;
  cardPriceDiscountPct: number;
  autoFeedEnabled: boolean;
  feedDiscountPct: number;
  cryptoDropBonusPct: number;
}

export const EMPTY_BASE_TOTALS: BaseUpgradeTotals = {
  energyRegenBonusPct: 0,
  clickBonusPct: 0,
  heatReductionPct: 0,
  offlineCapBonusSec: 0,
  autoClickPerSec: 0,
  missionRewardBonusPct: 0,
  passiveBonusPct: 0,
  cardPriceDiscountPct: 0,
  autoFeedEnabled: false,
  feedDiscountPct: 0,
  cryptoDropBonusPct: 0,
};

export function computeBaseUpgradeTotals(
  levels: Record<string, number> | undefined
): BaseUpgradeTotals {
  const totals: BaseUpgradeTotals = { ...EMPTY_BASE_TOTALS };
  if (!levels) return totals;

  for (const cfg of BASE_UPGRADES_CONFIG) {
    const raw = Number(levels[cfg.key] ?? 0);
    const lvl = Number.isFinite(raw) ? Math.max(0, Math.min(cfg.maxLevel, Math.floor(raw))) : 0;
    if (lvl <= 0) continue;
    const effect = cfg.effectPerLevel * lvl;
    switch (cfg.key) {
      case 'coffee_machine':
        totals.energyRegenBonusPct = Math.min(0.5, effect);
        break;
      case 'standing_desk':
        totals.clickBonusPct = Math.min(0.25, effect);
        break;
      case 'vpn_router':
        totals.heatReductionPct = Math.min(0.4, effect);
        break;
      case 'ups_battery':
        totals.offlineCapBonusSec = Math.min(10 * 3600, effect);
        break;
      case 'auto_script':
        totals.autoClickPerSec = Math.min(2, effect);
        break;
      case 'analytics_desk':
        totals.missionRewardBonusPct = Math.min(0.3, effect);
        break;
      case 'storage_rack':
        totals.passiveBonusPct = Math.min(0.3, effect);
        break;
      case 'thermal_paste':
        totals.cardPriceDiscountPct = Math.min(0.25, effect);
        break;
      case 'auto_feeder':
        totals.autoFeedEnabled = true;
        totals.feedDiscountPct = Math.min(0.4, effect);
        break;
      case 'lucky_charm':
        totals.cryptoDropBonusPct = Math.min(0.2, effect);
        break;
      default:
        break;
    }
  }
  return totals;
}

export interface PetBuffSummary {
  passiveBonusPct: number;
  clickBonusPct: number;
  heatReductionPct: number;
  missionBonusPct: number;
}

/**
 * Бонусы питомцев. Питомец «работает» только когда сыт:
 *  • сытость ≥ 60 — 100% бафа
 *  • 30–60       — 50% бафа
 *  • < 30        — 0% (питомец спит, но НЕ умирает и НЕ теряется)
 * Привязанность (растёт от кормлений) добавляет до +27% к базовому бафу.
 */
export function computePetBuffs(
  pets: PetState[] | undefined,
  nowMs: number = Date.now()
): PetBuffSummary {
  const summary: PetBuffSummary = {
    passiveBonusPct: 0,
    clickBonusPct: 0,
    heatReductionPct: 0,
    missionBonusPct: 0,
  };
  if (!pets || pets.length === 0) return summary;

  const seen = new Set<string>();
  for (const owned of pets) {
    if (!owned || seen.has(owned.key)) continue;
    seen.add(owned.key);
    const cfg = PETS_CONFIG.find((p) => p.key === owned.key);
    if (!cfg) continue;

    const hunger = getEffectiveHunger(
      Number(owned.hunger) || 0,
      String(owned.lastFedAt ?? new Date(0).toISOString()),
      cfg.hungerDecayPerHour,
      nowMs
    );
    const multiplier = getPetBuffMultiplier(hunger, Number(owned.feedCount) || 0);
    if (multiplier <= 0) continue;

    const value = cfg.buffPct * multiplier;
    switch (cfg.buffType) {
      case 'passive':
        summary.passiveBonusPct += value;
        break;
      case 'click':
        summary.clickBonusPct += value;
        break;
      case 'heat':
        summary.heatReductionPct += value;
        break;
      case 'mission':
        summary.missionBonusPct += value;
        break;
      default:
        break;
    }
    if (cfg.missionBonusPct) {
      summary.missionBonusPct += cfg.missionBonusPct * multiplier;
    }
  }

  summary.passiveBonusPct = Math.min(0.3, summary.passiveBonusPct);
  summary.clickBonusPct = Math.min(0.3, summary.clickBonusPct);
  summary.heatReductionPct = Math.min(0.4, summary.heatReductionPct);
  summary.missionBonusPct = Math.min(0.3, summary.missionBonusPct);
  return summary;
}

/** Приводит сырое состояние питомца из БД к безопасному виду с расчётом «сейчас». */
export function normalizePetState(
  cfg: PetConfig,
  raw: { hunger?: unknown; lastFedAt?: unknown; feedCount?: unknown },
  nowMs: number = Date.now()
): PetState {
  const feedCount = Math.max(0, Math.floor(Number(raw.feedCount) || 0));
  const lastFedAtIso = (() => {
    const parsed = new Date(String(raw.lastFedAt ?? '')).getTime();
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(nowMs).toISOString();
  })();
  const hungerAtFeed = Math.max(0, Math.min(100, Number(raw.hunger) || 0));
  const effectiveHunger = getEffectiveHunger(
    hungerAtFeed,
    lastFedAtIso,
    cfg.hungerDecayPerHour,
    nowMs
  );
  const buffMultiplier = getPetBuffMultiplier(effectiveHunger, feedCount);
  const nextFeedMs = new Date(lastFedAtIso).getTime() + cfg.feedCooldownHours * 3_600_000;
  return {
    key: cfg.key,
    hunger: hungerAtFeed,
    lastFedAt: lastFedAtIso,
    feedCount,
    affection: Math.max(1, Math.min(10, 1 + Math.floor(feedCount / 5))),
    effectiveHunger,
    isHungry: effectiveHunger < 30,
    buffMultiplier,
    canFeedAt: new Date(Math.max(nowMs, nextFeedMs)).toISOString(),
  };
}

export function getPetFeedPrice(
  cfg: PetConfig,
  dataPerHour: number,
  feedDiscountPct = 0
): number {
  return getPetFeedCost(cfg, dataPerHour, feedDiscountPct);
}

export function computeDerivedStats(params: {
  cards: Record<string, number>;
  team: string[];
  rep: number;
  heat: number;
  data: number;
  xp?: number;
  prestigeCount: number;
  /** v3.6.5: слот рабочего стола (историческое поле, сюда же попадают старые сейвы). */
  equippedSkin: string;
  /** v3.6.5: отдельный слот скина интерфейса. */
  equippedUi?: string;
  /** v3.6.5: отдельный слот аватара. */
  equippedAvatar?: string;
  pets?: PetState[];
  baseUpgrades?: Record<string, number>;
  cardTier?: number;
  nowMs?: number;
}): DerivedStats {
  const {
    cards,
    team,
    rep,
    heat,
    data,
    xp = 0,
    prestigeCount,
    equippedSkin,
    equippedUi,
    equippedAvatar,
    pets,
    baseUpgrades,
    cardTier = 1,
  } = params;
  const nowMs = params.nowMs ?? Date.now();

  const safeTier = Math.max(1, Math.min(4, Math.floor(Number(cardTier) || 1)));
  const maxCardLevel = getMaxCardLevel(safeTier);

  let totalCardLevels = 0;
  let baseDataPerHour = 0;
  let cardClickBonus = 0;
  let extraMaxEnergy = 0;

  for (const card of CARDS_CONFIG) {
    // Защита целостности данных: жёстко зажимаем уровень карточки в допустимые рамки 0..MAX_CARD_LEVEL
    const rawLvl = Number(cards[card.key] ?? 0);
    const lvl = Number.isFinite(rawLvl)
      ? Math.max(0, Math.min(MAX_CARD_LEVEL, Math.floor(rawLvl)))
      : 0;
    if (lvl <= 0) continue;
    totalCardLevels += lvl;
    // Доход модуля растёт геометрически: каждый следующий уровень весит +16%.
    // Так прокачка до 30–60 уровня остаётся осмысленной, хотя цена растёт ещё быстрее.
    const incomeMult = getCardLevelIncomeMultiplier(lvl);
    baseDataPerHour += card.dataPerHourPerLevel * incomeMult;
    cardClickBonus += (card.clickBonusPerLevel ?? 0) * incomeMult;
    extraMaxEnergy += (card.energyMaxPerLevel ?? 0) * lvl;
  }

  // УРОВЕНЬ = ОПЫТ. ТЗ v3: карточки дают доход, но не уровень — карьеру делают взломы.
  const levelProgress = getLevelProgress(xp);
  const level = levelProgress.level;
  // Оставлено для совместимости UI: доля пройденного пути до следующего уровня (0..1).
  const nextLevelProgress =
    levelProgress.xpToNext > 0
      ? Math.round((levelProgress.xpIntoLevel / levelProgress.xpToNext) * 100) / 100
      : 1;

  let teamPassiveBonusPct = 0;
  let teamClickBonusPct = 0;
  let autoClickPerSec = 0;
  let heatReductionPct = 0;
  let teamHackPower = 0;
  let unlockedGreyMissions = false;

  const uniqueTeam = Array.from(new Set(team));
  for (const npcKey of uniqueTeam) {
    const npc = TEAM_CONFIG.find((n) => n.key === npcKey);
    if (!npc) continue;
    teamPassiveBonusPct += npc.passiveBonusPct;
    teamClickBonusPct += npc.clickBonusPct;
    autoClickPerSec += npc.autoClickPerSec;
    heatReductionPct += npc.heatReductionPct;
    teamHackPower += npc.hackPower ?? 0;
    if (npc.unlocksGreyMissions) unlockedGreyMissions = true;
  }

  const baseTotals = computeBaseUpgradeTotals(baseUpgrades);
  const petBuffs = computePetBuffs(pets, nowMs);

  const alignment = computeAlignment(rep, heat);
  const whiteHatPassiveBonus = alignment === 'white_hat' ? 0.2 : 0;
  const blackHatClickBonus = alignment === 'black_hat' ? 0.5 : 0;

  // v3.6.5: три независимых слота (стол / интерфейс / аватар).
  // Бонус к тапу суммируется, но упирается в потолок одного скина — иначе
  // три косметики давали бы до +49% и ломали баланс, который считается
  // вокруг прежней планки 22% (Omega Singularity).
  const equippedKeys = [equippedSkin, equippedUi, equippedAvatar].filter(
    (k): k is string => typeof k === 'string' && k.length > 0
  );
  const equippedSkinConfigs = equippedKeys
    .map((k) => SKINS_CONFIG.find((s) => s.key === k))
    .filter((s): s is (typeof SKINS_CONFIG)[number] => Boolean(s));
  const skin = equippedSkinConfigs.find((s) => s.category === 'desk') ?? SKINS_CONFIG[0];
  const summedSkinBonus = equippedSkinConfigs.reduce((sum, s) => sum + (s.clickBonusPct || 0), 0);
  const skinClickBonusPct = Math.min(SKIN_CLICK_BONUS_CAP, summedSkinBonus);

  const safePrestige = getSafePrestigeCount(prestigeCount);
  const prestigeMultiplier = getPrestigeMultiplier(safePrestige);

  const clickMultiplier =
    (1 + cardClickBonus) *
    (1 +
      teamClickBonusPct +
      blackHatClickBonus +
      skinClickBonusPct +
      baseTotals.clickBonusPct +
      petBuffs.clickBonusPct) *
    prestigeMultiplier;

  const clickPower = Math.max(1, Math.round(clickMultiplier * 10) / 10);

  const totalAutoClickPerSec = Math.min(5, autoClickPerSec + baseTotals.autoClickPerSec);
  const botmasterHourlyContribution = totalAutoClickPerSec * clickPower * 3600;
  const dataPerHour = Math.round(
    baseDataPerHour *
      (1 +
        teamPassiveBonusPct +
        whiteHatPassiveBonus +
        baseTotals.passiveBonusPct +
        petBuffs.passiveBonusPct) *
      prestigeMultiplier +
      botmasterHourlyContribution
  );

  const maxEnergy = Math.min(MAX_ENERGY_CAP, BASE_MAX_ENERGY + extraMaxEnergy);
  const energyRegenPerSec = (1 / ENERGY_REGEN_SECONDS) * (1 + baseTotals.energyRegenBonusPct);

  const baseHeatMult = alignment === 'black_hat' ? 1.3 : 1.0;
  const totalHeatReduction = Math.min(
    0.7,
    heatReductionPct + baseTotals.heatReductionPct + petBuffs.heatReductionPct
  );
  const heatMultiplier = Math.max(0.25, baseHeatMult * (1 - totalHeatReduction));

  // Ранг — карьерный уровень и не демотится после prestige.
  const { rankIndex, rankTitle } = getRankForLevel(level);

  // Слоты миссий: 1 → 2 на 10 уровне → 3 на 20 уровне (теперь это награда за наигранные взломы).
  const missionSlots = level >= 20 ? 3 : level >= 10 ? 2 : 1;

  const baseLevelsTotal = Object.values(baseUpgrades ?? {}).reduce(
    (acc, lvl) => acc + Math.max(0, Math.floor(Number(lvl) || 0)),
    0
  );
  // «Сила железа»: сколько взломов игрок реально может потянуть. Используется в шансе успеха.
  const hackPower = Math.round(
    10 + totalCardLevels * 1.6 + teamHackPower + baseLevelsTotal * 3 + safePrestige * 40
  );

  return {
    level,
    totalCardLevels,
    xpIntoLevel: levelProgress.xpIntoLevel,
    xpToNext: levelProgress.xpToNext,
    totalXp: levelProgress.totalXp,
    hackPower,
    nextLevelProgress,
    rankIndex,
    rankTitle,
    alignment,
    maxEnergy,
    energyRegenPerSec,
    clickPower,
    dataPerHour,
    autoClickPerSec: totalAutoClickPerSec,
    heatMultiplier,
    missionRewardBonusPct: Math.min(0.5, baseTotals.missionRewardBonusPct + petBuffs.missionBonusPct),
    offlineCapSeconds: BASE_OFFLINE_CAP_SECONDS + baseTotals.offlineCapBonusSec,
    cardPriceDiscountPct: baseTotals.cardPriceDiscountPct,
    cryptoDropBonusPct: baseTotals.cryptoDropBonusPct,
    autoFeedEnabled: baseTotals.autoFeedEnabled,
    feedDiscountPct: baseTotals.feedDiscountPct,
    missionSlots,
    unlockedGreyMissions,
    deskStage: computeDeskStage(level),
    prestigeMultiplier,
    cardTier: safeTier,
    maxCardLevel,
  };
}

export function syncEnergy(
  storedEnergy: number,
  energyUpdatedIso: string,
  maxEnergy: number,
  nowMs: number = Date.now(),
  regenPerSec: number = 1 / ENERGY_REGEN_SECONDS
): { energy: number; updatedAtIso: string } {
  // На максимуме энергия не накапливает невидимую долю следующей единицы.
  // Иначе расход вскоре после синхронизации мог восстановиться раньше срока.
  if (storedEnergy >= maxEnergy) {
    return { energy: maxEnergy, updatedAtIso: new Date(nowMs).toISOString() };
  }
  const safeRegen = Math.max(0.05, Number(regenPerSec) || 1 / ENERGY_REGEN_SECONDS);
  const regenStepMs = 1000 / safeRegen;
  const lastMs = new Date(energyUpdatedIso).getTime();
  if (Number.isNaN(lastMs) || nowMs <= lastMs) {
    return {
      energy: Math.min(maxEnergy, Math.max(0, storedEnergy)),
      updatedAtIso: new Date(nowMs).toISOString(),
    };
  }
  const elapsedMs = nowMs - lastMs;
  const gained = Math.floor(elapsedMs / regenStepMs);
  if (gained <= 0) {
    return {
      energy: Math.min(maxEnergy, Math.max(0, storedEnergy)),
      updatedAtIso: energyUpdatedIso,
    };
  }
  const nextEnergy = Math.min(maxEnergy, Math.max(0, storedEnergy + gained));
  const remainderMs = elapsedMs % regenStepMs;
  const newUpdatedMs = nextEnergy >= maxEnergy ? nowMs : nowMs - remainderMs;
  return {
    energy: nextEnergy,
    updatedAtIso: new Date(newUpdatedMs).toISOString(),
  };
}

export { BASE_UPGRADES_CONFIG, getBaseUpgradeConfig };
export type { BaseUpgradeConfig };
