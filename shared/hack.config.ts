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
export const MAX_PLAYER_LEVEL = 200;

/**
 * На максимальном уровне нет следующего уровня. Возвращаем 0, а не Infinity:
 * значение попадает в UI, referrals и PostgreSQL RPC, поэтому бесконечность
 * никогда не должна пересекать границу игрового движка.
 */
export function getXpToNext(level: number): number {
  const safe = Math.max(1, Math.min(MAX_PLAYER_LEVEL, Math.floor(Number(level) || 1)));
  if (safe >= MAX_PLAYER_LEVEL) return 0;
  const raw = XP_CURVE_COEF * Math.pow(safe, XP_CURVE_POWER);
  return Math.max(50, Math.round(raw / 10) * 10);
}

/** Уровень + прогресс внутри уровня по суммарному опыту. Чистая функция — одинаковая на сервере и в UI. */
export function getLevelProgress(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  totalXp: number;
} {
  let xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  while (level < MAX_PLAYER_LEVEL) {
    const need = getXpToNext(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  const xpToNext = getXpToNext(level);
  return {
    level,
    xpIntoLevel: Math.floor(xp),
    xpToNext: Number.isFinite(xpToNext) ? xpToNext : 0,
    totalXp: Math.max(0, Math.floor(Number(totalXp) || 0)),
  };
}

/** Суммарный XP, необходимый для достижения уровня (для миграции старых сейвов). */
export function getTotalXpForLevel(level: number): number {
  const target = Math.max(1, Math.min(MAX_PLAYER_LEVEL, Math.floor(Number(level) || 1)));
  let total = 0;
  for (let l = 1; l < target; l += 1) total += getXpToNext(l);
  return total;
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
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  // L200 — карьерный cap. Контракт можно завершить ради Data/Rep, но XP и
  // referral не должны превращаться в Infinity и ломать bigint/integer в БД.
  if (safeLevel >= MAX_PLAYER_LEVEL) return 0;

  const safeReward = Math.max(1, Math.round(Number(xpReward) || 1));
  const ref = MISSION_TIER_REF_LEVEL[tier] ?? 1;
  const tierMax = MISSION_TIER_MAX_LEVEL[tier] ?? MAX_PLAYER_LEVEL;
  const refNeed = getXpToNext(ref);
  const levelNeed = getXpToNext(safeLevel);
  if (!Number.isFinite(refNeed) || refNeed <= 0 || !Number.isFinite(levelNeed) || levelNeed <= 0) return 0;

  const ratio = levelNeed / refNeed;
  const over = Math.max(0, safeLevel - tierMax);
  const overPenalty = Math.max(0.02, Math.pow(0.85, over));
  const award = Math.round(safeReward * Math.pow(ratio, XP_LEVEL_EXPONENT) * overPenalty);
  return Number.isFinite(award) ? Math.max(1, award) : 0;
}

/**
 * Денежная награда растёт быстро до L90, а затем мягко продолжает расти.
 * Старое 1.14^level разгоняло L200 до 2.1e11× и делало Data неточным для
 * JavaScript Number. Soft cap сохраняет смысл эндгейма, но оставляет reward
 * конечным даже при максимальном уровне и пяти престижах.
 */
export const MISSION_REWARD_LEVEL_GROWTH = 1.14;
export const MISSION_REWARD_SOFT_CAP_LEVEL = 90;
export const MISSION_REWARD_POST_CAP_GROWTH = 1.02;

export function getMissionRewardScale(level: number): number {
  const safe = Math.max(1, Math.min(MAX_PLAYER_LEVEL, Math.floor(Number(level) || 1)));
  const preCap = Math.min(safe, MISSION_REWARD_SOFT_CAP_LEVEL);
  const postCapLevels = Math.max(0, safe - MISSION_REWARD_SOFT_CAP_LEVEL);
  return (
    Math.pow(MISSION_REWARD_LEVEL_GROWTH, preCap - 1) *
    Math.pow(MISSION_REWARD_POST_CAP_GROWTH, postCapLevels)
  );
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
