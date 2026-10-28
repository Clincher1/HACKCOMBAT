import type { MissionConfig, MissionTargetType } from './types';

// ============================================================================
// ВЗЛОМЫ v3: XP-прогрессия, тайминги, шанс успеха
// ----------------------------------------------------------------------------
// Главная идея ребаланса (ТЗ v3):
//   • уровень игрока больше НЕ покупается карточками — он зарабатывается взломами;
//   • взлом длится минутами, а не секундами, и может ПРОВАЛИТЬСЯ;
//   • шанс успеха честно зависит от подготовки: сила железа (hackPower),
//     запас уровня над требованием цели, опыт по этому классу целей и Heat.
// ============================================================================

/**
 * Сколько XP нужно, чтобы уйти с уровня `level` на следующий: 140 · level².
 * Практический темп задаёт не кривая, а доля уровня, которую даёт один контракт
 * (см. `getMissionXpAward`): 1–2 уровень ≈ 5 минут взломов, 10 ≈ 2 часа,
 * 20 ≈ 4–5 часов чистой игры, 40 ≈ 11 часов. Старая система выдавала 9 уровень за вечер.
 */
export const XP_CURVE_COEF = 140;
export const XP_CURVE_POWER = 2.0;

/**
 * Уровни не имеют игрового потолка. `MAX_PLAYER_LEVEL` оставлен как числовой
 * safety-horizon для старых импортов и защитных проверок, но он не означает
 * «MAX» для игрока: обычный XP-путь продолжает открывать новые уровни.
 */
export const MAX_PLAYER_LEVEL = Number.MAX_SAFE_INTEGER;
export const MAX_SAFE_XP = Number.MAX_SAFE_INTEGER;

// Сколько уровней можно точно вычислить в обычном JS Number до потери смысла
// XP. Это предел представления числа, а не игровой cap: до него больше 50 000
// уровней, а все реальные сейвы остаются в bigint/numeric диапазоне БД.
const NUMBER_SAFE_LEVEL_HORIZON = Math.max(
  1,
  Math.floor(Math.cbrt((MAX_SAFE_XP * 6) / (XP_CURVE_COEF * 2))) + 2
);

/**
 * Сколько XP нужно, чтобы уйти с уровня `level` на следующий: 140 · level².
 * Для очень больших входных значений возвращается конечное safety-значение,
 * чтобы Infinity никогда не попала в JSON, RPC или UI.
 */
export function getXpToNext(level: number): number {
  const rawLevel = Number(level);
  const safeLevel = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
  const raw = XP_CURVE_COEF * Math.pow(safeLevel, XP_CURVE_POWER);
  if (!Number.isFinite(raw) || raw >= MAX_SAFE_XP) return MAX_SAFE_XP;
  return Math.max(50, Math.min(MAX_SAFE_XP, Math.round(raw / 10) * 10));
}

/** Суммарный XP, необходимый для достижения уровня (для миграции старых сейвов). */
export function getTotalXpForLevel(level: number): number {
  const rawLevel = Number(level);
  const target = Number.isFinite(rawLevel)
    ? Math.max(1, Math.floor(rawLevel))
    : NUMBER_SAFE_LEVEL_HORIZON + 1;
  const n = target - 1;
  // Сумма 140 · l² для l = 1..target-1. Формула не ходит циклом по уровням,
  // поэтому переход к бесконечной прогрессии не делает init медленнее.
  const total = (XP_CURVE_COEF * n * (n + 1) * (2 * n + 1)) / 6;
  if (!Number.isFinite(total) || total >= MAX_SAFE_XP) return MAX_SAFE_XP;
  return Math.max(0, Math.floor(total));
}

/** Уровень + прогресс внутри уровня по суммарному опыту. */
export function getLevelProgress(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  totalXp: number;
} {
  const rawXp = Number(totalXp);
  const safeTotalXp = Number.isFinite(rawXp)
    ? Math.max(0, Math.min(MAX_SAFE_XP, Math.floor(rawXp)))
    : MAX_SAFE_XP;

  // Бинарный поиск по аналитической сумме: вычисление остаётся быстрым даже
  // для очень высокого игрока, в отличие от старого while до L200.
  let low = 1;
  let high = NUMBER_SAFE_LEVEL_HORIZON + 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (getTotalXpForLevel(middle) <= safeTotalXp) low = middle;
    else high = middle;
  }

  const reachedXp = getTotalXpForLevel(low);
  const xpIntoLevel = Math.max(0, Math.min(MAX_SAFE_XP, safeTotalXp - reachedXp));
  return {
    level: low,
    xpIntoLevel,
    xpToNext: getXpToNext(low),
    totalXp: safeTotalXp,
  };
}

/** Базовый шанс успеха по типу цели «у готового» игрока. */
export const HACK_BASE_SUCCESS: Record<MissionTargetType, number> = {
  neutral: 0.9,
  bad: 0.88,
  good: 0.76,
  grey: 0.64,
};

export const HACK_MIN_CHANCE = 0.05;
export const HACK_MAX_CHANCE = 0.96;

export interface HackOddsInput {
  mission: MissionConfig;
  level: number;
  hackPower: number;
  heat: number;
  tierSuccesses: number;
  tierFails: number;
}

export interface HackOdds {
  chance: number; // 0.05..0.96
  gearFactor: number;
  levelFactor: number;
  experienceFactor: number;
  heatFactor: number;
  baseChance: number;
  gearRatio: number;
}

/**
 * Шанс успеха взлома.
 *
 * Логика «не прыгай на серьёзные цели без подготовки»:
 *  • gearFactor — сила железа против требования цели (главный множитель);
 *  • levelFactor — запас уровня над минимальным для контракта;
 *  • experienceFactor — сколько раз ты уже закрывал цели ЭТОГО класса
 *    (провалы штрафуют вдвое сильнее, чем успехи помогают);
 *  • heatFactor — с высоким розыском спокойно работать невозможно.
 */
export function getHackOdds(input: HackOddsInput): HackOdds {
  const { mission, level, hackPower, heat, tierSuccesses, tierFails } = input;
  const baseChance =
    mission.baseSuccess ?? HACK_BASE_SUCCESS[mission.targetType] ?? 0.8;
  const requiredPower = Math.max(1, mission.requiredPower ?? 10);
  const gearRatio = Math.max(0, hackPower) / requiredPower;

  const gearFactor = clamp(0.5 + 0.5 * gearRatio, 0.55, 1.25);
  const requiredLevel = Math.max(1, mission.minLevel ?? 1);
  const levelFactor = clamp(0.72 + 0.28 * (level / requiredLevel), 0.72, 1.12);
  const experienceFactor = clamp(
    1 + tierSuccesses * 0.02 - tierFails * 0.04,
    0.7,
    1.15
  );
  const heatFactor = clamp(1 - Math.max(0, heat) / 250, 0.72, 1);

  const chance = clamp(
    baseChance * gearFactor * levelFactor * experienceFactor * heatFactor,
    HACK_MIN_CHANCE,
    HACK_MAX_CHANCE
  );

  return {
    chance,
    gearFactor,
    levelFactor,
    experienceFactor,
    heatFactor,
    baseChance,
    gearRatio,
  };
}

/** Доля награды по исходу взлома. Провал не обнуляет игрока — даёт утешительный опыт. */
export const HACK_OUTCOME_REWARD: Record<
  'success' | 'partial' | 'fail',
  { data: number; xp: number; rep: number; heat: number; chips: number }
> = {
  success: { data: 1, xp: 1, rep: 1, heat: 1, chips: 1 },
  partial: { data: 0.45, xp: 0.55, rep: 0.5, heat: 0.5, chips: 0 },
  fail: { data: 0, xp: 0.15, rep: 0, heat: 1.5, chips: 0 },
};

/**
 * Ширина «частичного успеха» как доля от оставшегося риска (1 − chance).
 * chance 0.9 → 4.5% частичных и 5.5% провалов; chance 0.5 → 22.5% / 27.5%.
 */
export const HACK_PARTIAL_THRESHOLD = 0.45;

/** Бросок исхода взлома. chance хранится в миссии на момент старта — подкрутить нельзя. */
export function rollHackOutcome(chance: number, roll = Math.random()): 'success' | 'partial' | 'fail' {
  const safe = Math.max(HACK_MIN_CHANCE, Math.min(HACK_MAX_CHANCE, Number(chance) || 0));
  if (roll < safe) return 'success';
  if (roll < safe + (1 - safe) * HACK_PARTIAL_THRESHOLD) return 'partial';
  return 'fail';
}

/**
 * Сколько XP даёт один контракт.
 *
 * `xpReward` в конфиге — опыт на «референсном» уровне тира (1/3/7/12/18/26),
 * где цель впервые открывается. С ростом уровня награда растёт МЕДЛЕННО
 * (корень 0.15 от роста требования), поэтому каждый следующий уровень требует
 * больше забегов, чем предыдущий. Плюс штраф за «перерост» тира: фармить
 * тир I на 30 уровне бессмысленно — сеть уже не даёт за это денег и опыта.
 */
export const MISSION_TIER_REF_LEVEL: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 12,
  5: 18,
  6: 26,
};

/** Насколько опыт за контракт догоняет рост требования уровня (0.9 ≈ почти догоняет). */
export const XP_LEVEL_EXPONENT = 0.9;

/** Верхняя граница «своего» уровня для тира — дальше начинается штраф за перерост. */
export const MISSION_TIER_MAX_LEVEL: Record<number, number> = {
  1: 3,
  2: 7,
  3: 12,
  4: 18,
  5: 26,
  6: 200,
};

export function getMissionXpAward(xpReward: number, tier: number, level: number): number {
  const rawLevel = Number(level);
  const safeLevel = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
  const safeReward = Math.max(1, Math.round(Number(xpReward) || 1));
  const ref = MISSION_TIER_REF_LEVEL[tier] ?? 1;
  const tierMax = MISSION_TIER_MAX_LEVEL[tier] ?? 200;
  const refNeed = getXpToNext(ref);
  const levelNeed = getXpToNext(safeLevel);
  if (!Number.isFinite(refNeed) || refNeed <= 0 || !Number.isFinite(levelNeed) || levelNeed <= 0) {
    return 1;
  }

  const ratio = Math.min(MAX_SAFE_XP / refNeed, levelNeed / refNeed);
  const over = Math.max(0, safeLevel - tierMax);
  // Старые тиры постепенно теряют эффективность, но никогда не обнуляют XP:
  // после L200 игрок продолжает двигаться, пока новые тиры добавляются сезонами.
  const overPenalty = Math.max(0.02, Math.pow(0.85, over));
  const scaled = safeReward * Math.pow(Math.max(1, ratio), XP_LEVEL_EXPONENT) * overPenalty;
  if (!Number.isFinite(scaled)) return 1;
  return Math.max(1, Math.min(MAX_SAFE_XP, Math.round(scaled)));
}

/**
 * Денежная награда растёт быстро до L90, а затем мягко продолжает расти.
 * Soft cap ограничивает только скорость и числовой масштаб награды — он не
 * закрывает уровни и не превращает эндгейм в экран «MAX».
 */
export const MISSION_REWARD_LEVEL_GROWTH = 1.14;
export const MISSION_REWARD_SOFT_CAP_LEVEL = 90;
export const MISSION_REWARD_POST_CAP_GROWTH = 1.02;

export function getMissionRewardScale(level: number): number {
  const rawLevel = Number(level);
  const safe = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
  const preCap = Math.min(safe, MISSION_REWARD_SOFT_CAP_LEVEL);
  const postCapLevels = Math.max(0, safe - MISSION_REWARD_SOFT_CAP_LEVEL);
  const logScale =
    (preCap - 1) * Math.log(MISSION_REWARD_LEVEL_GROWTH) +
    postCapLevels * Math.log(MISSION_REWARD_POST_CAP_GROWTH);
  // Soft-cap — это только темп роста, а не остановка уровней. После очень
  // больших чисел масштаб упирается в безопасное представление, но не
  // возвращает Infinity и не ломает баланс/JSON.
  return Math.max(1, Math.exp(Math.min(Math.log(MAX_SAFE_XP), logScale)));
}

/**
 * Взнос за запуск контракта.
 *
 * Data — это оборотный капитал оператора: тапами его нужно накопить, чтобы
 * запустить работу, а после завершения контракт возвращает награду. Energy
 * оплачивает подготовку и вычислительное время операции — ровно по секунде
 * таймера. Взнос не зависит от исхода и не возвращается: риск должен быть
 * понятен до нажатия кнопки, а не только после броска.
 */
export const MISSION_ENTRY_DATA_RATE = 0.12;
export const MISSION_ENTRY_MIN_DATA = 25;

export interface MissionEntryCost {
  energy: number;
  data: number;
}

export function getMissionEntryCost(
  mission: MissionConfig,
  estimatedReward: number
): MissionEntryCost {
  const safeReward = Math.max(0, Number(estimatedReward) || 0);
  return {
    // 1 Energy = 1 секунда подготовки. При длительном контракте Energy
    // продолжает восстанавливаться, поэтому фактический чистый расход ниже.
    energy: Math.max(10, Math.ceil(Math.max(0, Number(mission.durationSec) || 0))),
    data: Math.max(MISSION_ENTRY_MIN_DATA, Math.ceil(safeReward * MISSION_ENTRY_DATA_RATE)),
  };
}

/** Насколько «прыжок» на цель выше своей подготовки опасен — для UI-подсказок. */
export function describeReadiness(odds: HackOdds): {
  label: string;
  tone: 'good' | 'warn' | 'bad';
} {
  if (odds.chance >= 0.8) return { label: 'Полная готовность', tone: 'good' };
  if (odds.chance >= 0.55) return { label: 'Рискованно, но реально', tone: 'warn' };
  return { label: 'Не готов — будет провал', tone: 'bad' };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
