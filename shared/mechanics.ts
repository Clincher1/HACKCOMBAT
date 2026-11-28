import { getMaxCardLevel } from './cards.config';
import { CARDS_CONFIG, getCardLevelIncomeMultiplier, MAX_CARD_LEVEL } from './cards.config';
import { getLevelProgress } from './hack.config';
import {
  deskStageNextLevel,
  deskStageTitle,
  getDeskStageConfig,
  getDeskStageForLevel,
  type DeskStage,
} from './desk-stages.config';
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
/**
 * v6.6: реген CPU ускоряется с уровнем.
 *
 * Было: ровно 1 заряд в 2 секунды на любом уровне — 1 800/ч. Взнос контракта
 * Т6 = 700, значит 2.6 контракта в час, а три слота (L20+) простаивали.
 * Стало: интервал 2 с на 1-м уровне и 1 с на 50-м (шаг −0.02 с за уровень),
 * то есть 1 800 → 3 600 зарядов/час. Ниже 1 с не опускаемся.
 */
export function cpuRegenSecondsForLevel(level: number): number {
  const safe = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return Math.max(1, 2 - safe * 0.02);
}
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

/**
 * v6.6: ЕДИНЫЙ игровой день.
 *
 * До этой версии в продукте жили два дня: стрик и Crypto-бонус считались по UTC
 * (сброс в 03:00 МСК), а копилка, леденец и поручения — по Москве (00:00 МСК).
 * Игрок видел два несогласованных сброса. Теперь всё считается ТОЛЬКО здесь:
 * `getGameDayKey` — единственный источник ключа дня для стрика, бонуса, копилки,
 * леденца, поручений, контрактов и инцидентов. Сброс — 00:00 МСК.
 */

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

/** Ключ дня по ISO-строке (кладём в него любой timestamp — результат стабилен). */
export function getGameDayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : getGameDayKey(ms);
}

/** Разница в календарных днях между двумя ключами (b − a). */
export function diffGameDayKeys(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00.000Z`);
  const b = Date.parse(`${toKey}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Один и тот же игровой день? (null/пустое = «дня не было»). */
export function isSameGameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && a === b;
}

/** Локальное время внутри игровых суток в МСК: 23:59 → '23:59'. Для QA и UI. */
export function gameDayClock(nowMs: number = Date.now()): string {
  const shifted = new Date(nowMs + GAME_DAY_UTC_OFFSET_MINUTES * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const HEAT_PENALTY_THRESHOLD = 100; // Heat > 100 -> штраф (раздел 2 и 5.4 ТЗ)
export const HEAT_RESET_AFTER_PENALTY = 50;
export const HEAT_PENALTY_DATA_LOSS_PCT = 0.1; // Потеря 10% Data
export const HEAT_LOCKDOWN_SECONDS = 60; // Блок кликов на 60 сек

// ============================================================================
// ТАП-ЦИКЛ (v6.4) — тап снова ядро геймплея
// ----------------------------------------------------------------------------
// Один тап = 1 CPU Charge и `clickPower` Data. Доход мгновенный (оптимистичный
// локальный стейт), а темп ограничен тем же коридором, что и во взломах:
// HACK_MAX_TAPS_PER_SEC = 6. Запас bucket'а равен одной клиентской пачке
// (CLICK_MAX_BATCH = 20), чтобы сетевой дребезг не «съедал» честные тапы, а
// скрипт не получал больше живого пальца. CPU Charge остаётся жёстким потолком:
// без заряда тап не проходит вообще.
// ============================================================================
export const TAP_MAX_PER_SEC = 6;
/** Паритет с HACK_MAX_TAPS_PER_SEC — проверяется в QA. */
export const TAP_BURST_CAPACITY = 20;
export const TAP_MAX_BATCH = 60;

export interface TapBudget {
  /** Сколько тапов ещё «в запасе» (0..TAP_BURST_CAPACITY). */
  tokens: number;
  /** Когда запас последний раз пересчитывался (ms epoch). */
  at: number;
}

/**
 * Серверный расчёт: сколько тапов из пачки принять прямо сейчас.
 *
 * Чистая функция (никакого состояния вне аргументов), поэтому её одинаково
 * используют API, QA и клиентская подсказка «тап готов». Возвращает и новый
 * запас, чтобы вызывающий сохранил его в stats jsonb (без новых таблиц).
 */
export function resolveTapAllowance(input: {
  requested: number;
  budget?: TapBudget | null;
  energy: number;
  nowMs: number;
  /**
   * Минимальный «человеческий» всплеск: хвост кликов, приложенный к покупке,
   * проходит даже при пустом запасе — иначе игрок, тапнувший 20 раз и сразу
   * купивший, получал бы ложное «Недостаточно Data».
   */
  minBurst?: number;
}): { allowed: number; tokens: number } {
  const requested = Math.max(
    0,
    Math.min(TAP_MAX_BATCH, Math.floor(Number(input.requested) || 0))
  );
  const energy = Math.max(0, Math.floor(Number(input.energy) || 0));
  const minBurst = Math.max(0, Math.min(requested, Math.floor(Number(input.minBurst) || 0)));
  const previous = input.budget;
  const previousTokens =
    previous && Number.isFinite(previous.tokens)
      ? Math.max(0, Math.min(TAP_BURST_CAPACITY, previous.tokens))
      : TAP_BURST_CAPACITY;
  const idleMs =
    previous && Number.isFinite(previous.at) ? Math.max(0, input.nowMs - previous.at) : 0;
  // Простой не копит «сверх лимита»: даже после суток паузы в запасе только capacity.
  const refilled = Math.min(
    TAP_BURST_CAPACITY,
    previousTokens + (idleMs / 1000) * TAP_MAX_PER_SEC
  );
  const fromBucket = Math.min(requested, Math.floor(refilled), energy);
  const allowed = Math.min(requested, energy, Math.max(fromBucket, minBurst));
  const spent = Math.min(fromBucket, allowed);
  return { allowed, tokens: Math.round(Math.max(0, refilled - spent) * 1000) / 1000 };
}
export const PRESTIGE_REQUIRED_LEVEL = 50;
/**
 * Числовой safety-horizon для старых импортов. Это больше не игровой cap:
 * после первых пяти циклов Global Hack можно продолжать престиж бесконечно.
 */
export const MAX_PRESTIGE_COUNT = Number.MAX_SAFE_INTEGER;
export const PRESTIGE_DOUBLING_CYCLES = 5;
export const PRESTIGE_POST_CAP_BONUS = 0.1;
/** Плоский бонус цикла: ×2 независимо от номера цикла (первые пять циклов). */
export const PRESTIGE_FLAT_MULTIPLIER = 2;
export const BASE_OFFLINE_CAP_SECONDS = 8 * 3600;

export function getSafePrestigeCount(prestigeCount: number): number {
  const raw = Number(prestigeCount);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_PRESTIGE_COUNT, Math.floor(raw)));
}

/**
 * v6.9: множитель престижа — ПЛОСКИЙ ×2, а не накопительный ×2^цикл.
 *
 * Почему (числа — в scripts/qa/economy.mjs, блок «престиж не врёт о цене»):
 * цены каталога привязаны к доходу через pricing.config и считаются от
 * expectedHourlyIncome(level) БЕЗ престижного множителя. Накопительная дуга
 * ×2 → ×32 означала бы, что на пятом цикле любая покупка стоит 1/32 заявленных
 * «часов дохода»: карточка, обещанная как «≈ 1.8 ч», закрывалась бы за 3 минуты,
 * а весь каталог (≈ 85 ч на один уровень всех карточек) — за 2.6 ч. Anchor
 * «цена = N часов фарма» перестаёт быть правдой, и Data обесценивается ровно
 * настолько, насколько вырос множитель.
 *
 * Плоский ×2 держит расхождение anchor'а постоянным (≤ 2×) на любом цикле,
 * а после пятого цикла рост продолжается мягко (+10% за цикл), чтобы игрок
 * не упирался в стену.
 */
export function getPrestigeMultiplier(prestigeCount: number): number {
  const safe = getSafePrestigeCount(prestigeCount);
  if (safe <= 0) return 1;
  const extraCycles = Math.max(0, safe - PRESTIGE_DOUBLING_CYCLES);
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    PRESTIGE_FLAT_MULTIPLIER * (1 + extraCycles * PRESTIGE_POST_CAP_BONUS)
  );
}

/** Следующий Global Hack открывается каждые 10 уровней: 50, 60, 70, 80, 90, 100… */
export function getPrestigeRequiredLevel(prestigeCount: number): number {
  const safe = getSafePrestigeCount(prestigeCount);
  return Math.min(Number.MAX_SAFE_INTEGER, PRESTIGE_REQUIRED_LEVEL + safe * 10);
}

// 12 «карьерных» титулов; после них титулы продолжаются процедурно.
export const RANK_TITLES: { minLevel: number; minData: number; title: string }[] = [
  { minLevel: 1, minData: 0, title: 'Первокурсник' },
  { minLevel: 5, minData: 2_500, title: 'Стажёр' },
  { minLevel: 10, minData: 15_000, title: 'Младший специалист' },
  { minLevel: 18, minData: 75_000, title: 'Пентестер' },
  { minLevel: 26, minData: 400_000, title: 'Специалист по безопасности' },
  { minLevel: 35, minData: 2_000_000, title: 'Старший инженер' },
  { minLevel: 50, minData: 12_000_000, title: 'Архитектор' },
  { minLevel: 70, minData: 60_000_000, title: 'Руководитель группы' },
  { minLevel: 85, minData: 300_000_000, title: 'Директор по рискам' },
  { minLevel: 100, minData: 1_500_000_000, title: 'Партнёр' },
  { minLevel: 125, minData: 8_000_000_000, title: 'Серый кардинал' },
  { minLevel: 155, minData: 40_000_000_000, title: 'Хранитель архива' },
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
      'Легенда рынка',
      'Наставник',
      'Советник',
      'Хранитель традиций',
      'Первый среди равных',
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

/**
 * Текущий этап стола по уровню игрока.
 *
 * v1.4: тело переехало в shared/desk-stages.config.ts — там же границы этапов
 * (1–4, 5–9, 10–14, 15–19, 20–24, 25–29, 30+), подписи «Этап N/7» и арты.
 * Здесь остался только публичный API, которым пользуются движок, коллекция и
 * сцена: сигнатуры не менялись, поэтому старые вызовы не тронуты.
 */
export function computeDeskStage(level: number): DeskStage {
  return getDeskStageForLevel(level);
}

/**
 * Подпись и арт этапа. `title` теперь «Этап 3/7 — Локальный Кластер»: слово
 * «уровень» осталось только игроку (R2 пакета «Правки прогона»).
 */
export function getDeskStageInfo(stage: DeskStage): {
  title: string;
  subtitle: string;
  sceneUrl: string;
  nextLevel: number | null;
} {
  const config = getDeskStageConfig(stage);
  return {
    title: deskStageTitle(config.stage),
    subtitle: config.subtitle,
    sceneUrl: config.sceneUrl,
    nextLevel: deskStageNextLevel(config.stage),
  };
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
      // v6.6: мидгейм-улучшения L34/L38 используют уже существующие эффекты.
      case 'neural_coprocessor':
        totals.missionRewardBonusPct = Math.min(0.3, totals.missionRewardBonusPct + effect);
        break;
      case 'quantum_cooler':
        totals.energyRegenBonusPct = Math.min(0.5, totals.energyRegenBonusPct + effect);
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
  // v6.6: скорость регена растёт с уровнем (см. cpuRegenSecondsForLevel).
  const regenSeconds = cpuRegenSecondsForLevel(level);
  const energyRegenPerSec = (1 / regenSeconds) * (1 + baseTotals.energyRegenBonusPct);

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
