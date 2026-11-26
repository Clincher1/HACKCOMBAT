/**
 * «Взломы» (v6.2) — активная механика на реакцию.
 *
 * Один взлом = сессия 30 секунд на сетке узлов: безопасный узел даёт Data,
 * ловушка добавляет Heat. Никакой физики, никаких задержек — тап отвечает в
 * том же кадре, а сервер считает итог один раз в конце сессии.
 *
 * Ключевое правило: раскладка узлов детерминирована по seed, который выдаёт
 * сервер. Клиент рисует ту же сетку, которую сервер потом проверяет, поэтому
 * подменить «где ловушки» из консоли нельзя.
 */

export const HACK_SESSION_SECONDS = 30;
/** Потолок богатства жестов: больше 6 узлов в секунду человек не выбивает. */
export const HACK_MAX_TAPS_PER_SEC = 6;
/** Сколько секунд после конца сессии результат ещё принимается (лаг сети). */
export const HACK_FINISH_GRACE_SEC = 25;

export type HackDifficultyKey = 'easy' | 'medium' | 'hard';

export interface HackDifficulty {
  key: HackDifficultyKey;
  title: string;
  subtitle: string;
  icon: string;
  /** Стоимость входа в CPU Charge. */
  cost: number;
  cols: number;
  rows: number;
  /** Доля ловушек в сетке (0…1). */
  trapRatio: number;
  /** Data за один безопасный узел. */
  dataPerNode: number;
  /** Heat за одну ловушку. */
  trapHeat: number;
  riskLabel: string;
}

export const HACK_DIFFICULTIES: readonly HackDifficulty[] = [
  {
    key: 'easy',
    title: 'Лёгкий',
    subtitle: 'Мелкий посредник. Мало ловушек, скромная добыча.',
    icon: '🟢',
    cost: 40,
    cols: 4,
    rows: 4,
    trapRatio: 0.25,
    dataPerNode: 90,
    trapHeat: 5,
    riskLabel: '4×4 · 25% ловушек',
  },
  {
    key: 'medium',
    title: 'Средний',
    subtitle: 'Корпоративный узел. Больше Data, но и Heat растёт быстрее.',
    icon: '🟡',
    cost: 90,
    cols: 5,
    rows: 4,
    trapRatio: 0.3,
    dataPerNode: 200,
    trapHeat: 8,
    riskLabel: '5×4 · 30% ловушек',
  },
  {
    key: 'hard',
    title: 'Сложный',
    subtitle: 'Военный контур. Каждый узел — серьёзные деньги и серьёзный Heat.',
    icon: '🔴',
    cost: 150,
    cols: 6,
    rows: 4,
    trapRatio: 0.35,
    dataPerNode: 420,
    trapHeat: 12,
    riskLabel: '6×4 · 35% ловушек',
  },
];

export const HACK_DIFFICULTIES_BY_KEY: Record<string, HackDifficulty> = Object.fromEntries(
  HACK_DIFFICULTIES.map((difficulty) => [difficulty.key, difficulty])
);

export function getHackDifficulty(key: string): HackDifficulty | undefined {
  return HACK_DIFFICULTIES_BY_KEY[key];
}

export function hackNodeCount(difficulty: HackDifficulty): number {
  return difficulty.cols * difficulty.rows;
}

function hash32(input: number): number {
  let hash = input >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Ловушка это узел или нет. Одна и та же пара (seed, index) всегда даёт один
 * ответ — поэтому клиент и сервер видят одинаковую раскладку.
 */
export function isHackTrapNode(seed: number, index: number, difficulty: HackDifficulty): boolean {
  const roll = hash32((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0) % 1_000;
  return roll < Math.round(difficulty.trapRatio * 1_000);
}

/** Сколько безопасных узлов и ловушек в сетке — считает и клиент, и сервер. */
export function countHackNodes(
  seed: number,
  difficulty: HackDifficulty
): { total: number; traps: number; safe: number } {
  const total = hackNodeCount(difficulty);
  let traps = 0;
  for (let index = 0; index < total; index += 1) {
    if (isHackTrapNode(seed, index, difficulty)) traps += 1;
  }
  return { total, traps, safe: total - traps };
}

/** Сколько Data даёт сессия при таком числе безопасных узлов. */
export function hackDataReward(difficulty: HackDifficulty, safeHits: number): number {
  return Math.max(0, Math.floor(safeHits)) * difficulty.dataPerNode;
}

export function hackHeatGain(difficulty: HackDifficulty, trapHits: number): number {
  return Math.max(0, Math.floor(trapHits)) * difficulty.trapHeat;
}
