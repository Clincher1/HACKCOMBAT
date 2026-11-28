import type { DailyGoalDefinition, DailyGoalKind, DailyGoalsState } from './types';

/** Тип ключа цели реэкспортируется: конфиг — единственная точка входа для UI и API. */
export type { DailyGoalKind };

/**
 * «Цели дня» (v1.6) — серверная доска из трёх целей с ручным сбором награды.
 *
 * Это ОТДЕЛЬНАЯ параллельная система, а не переделка существующих:
 *   • контракты дня (shared/contracts.config.ts) — свои три цели;
 *   • ежедневные поручения (shared/dailyTasks.config.ts) — своя тройка за XP;
 *   • дневной бонус Crypto (players.daily_streak) — своя петля;
 *   • ежедневный инцидент — свой выбор.
 * Цели дня живут на UTC-сутках (в отличие от московских суток остальных
 * дневных механик) и не связаны со стриком: стрик про бонус, цели про возврат.
 *
 * Ключевые правила:
 *   1. Ровно три цели в день, выбор детерминированный — stableHash от
 *      (UTC-дата + tgId), как у ежедневного инцидента. Никакого Math.random
 *      от запроса: повторный init не пересобирает доску.
 *   2. Таргеты масштабируются по уровню тремя тирами (1–9 / 10–19 / 20+).
 *      На первом тире каждая цель достижима за ~15–20 минут активной игры.
 *   3. Прогресс считает только сервер из уже проверенных событий (тапы после
 *      античита, успешные взлома, успешные контракты, списание CPU Charge,
 *      заработанные Data, применение расходника). Клиент ничего не двигает.
 */

/** Сколько целей на доске. Больше трёх — шум, меньше — «нечего закрывать». */
export const DAILY_GOALS_PER_DAY = 3;

/** Версия формата stats.dailyGoals. Меняется только вместе с миграцией чтения. */
export const DAILY_GOALS_VERSION = 1;

/** Награда за цель: Chips 3–5 (по типу цели) + 1 Crypto. Без Data-бустов. */
export const DAILY_GOAL_CRYPTO_REWARD = 1;

export const DAILY_GOAL_CHIPS_MIN = 3;
export const DAILY_GOAL_CHIPS_MAX = 5;

/** Границы тиров: таргеты заданы массивом из трёх значений. */
export const DAILY_GOAL_TIERS = [
  { index: 0, minLevel: 1, maxLevel: 9, title: 'стажёр' },
  { index: 1, minLevel: 10, maxLevel: 19, title: 'оператор' },
  { index: 2, minLevel: 20, maxLevel: Number.POSITIVE_INFINITY, title: 'легенда' },
] as const;

/**
 * Таргеты по тирам: [1–9, 10–19, 20+].
 *
 * Как считались цифры первого тира (достижимость за ~15–20 минут):
 *   • taps 250 — 50 сек непрерывного тапа (античит пропускает ~6 тап/с) и 250
 *     CPU Charge из 1 500 стартовых;
 *   • cpu 180 — два контракта T1 (55 заряда) и два взлома easy (40): 190;
 *   • hacks 2 — сессия взлома идёт 30 секунд, заряд на easy 40;
 *   • contracts 2 — контракты тира 1 длятся 50–65 секунд;
 *   • data 900 — два взлома easy (~720 Data) плюс ~180 тапов при силе клика 1.0;
 *   • item_use 1 — один расходник из инвентаря (поэтому цель попадает в доску,
 *     только если расходник реально есть — см. selectDailyGoalKinds).
 * Дальше тиры умножают нагрузку, но не требуют новых действий.
 */
export const DAILY_GOAL_TARGETS: Record<DailyGoalKind, readonly [number, number, number]> = {
  taps: [250, 500, 900],
  hacks: [2, 3, 4],
  contracts: [2, 3, 4],
  cpu: [180, 420, 800],
  data: [900, 4_500, 12_000],
  item_use: [1, 1, 2],
};

/** Chips за цель: тяжелее цель — больше Чипов, но всегда внутри 3–5. */
export const DAILY_GOAL_CHIPS: Record<DailyGoalKind, number> = {
  taps: 3,
  contracts: 5,
  hacks: 4,
  cpu: 3,
  data: 4,
  item_use: 3,
};

/** Порядок пула фиксирован: он же используется как база детерминированной выборки. */
export const DAILY_GOAL_POOL: readonly DailyGoalKind[] = [
  'taps',
  'hacks',
  'contracts',
  'cpu',
  'data',
  'item_use',
];

export const DAILY_GOALS: Record<DailyGoalKind, DailyGoalDefinition> = {
  taps: {
    key: 'taps',
    title: 'Размять терминал',
    description: 'Сделай {target} тапов по консоли — прогресс считает сервер после античита.',
    shortTitle: 'тапы',
  },
  hacks: {
    key: 'hacks',
    title: 'Вскрыть контуры',
    description: 'Заверши {target} взлома с результатом: без вскрытых узлов сессия не считается.',
    shortTitle: 'взломы',
  },
  contracts: {
    key: 'contracts',
    title: 'Закрыть сделки',
    description: 'Доведи до успеха {target} контракта. Провал и частичный итог не считаются.',
    shortTitle: 'контракты',
  },
  cpu: {
    key: 'cpu',
    title: 'Сжечь заряд',
    description: 'Потрать {target} CPU Charge на запуск контрактов и взломов.',
    shortTitle: 'CPU',
  },
  data: {
    key: 'data',
    title: 'Поднять капитал',
    description: 'Заработай {target} Data суммарно за день — тапы, взломы и контракты в счёт.',
    shortTitle: 'Data',
  },
  item_use: {
    key: 'item_use',
    title: 'Пустить расходник в дело',
    description: 'Примени {target} расходник из инвентаря: дроп должен сработать.',
    shortTitle: 'расходник',
  },
};

const GOAL_KINDS = new Set<string>(DAILY_GOAL_POOL);

export function isDailyGoalKind(value: unknown): value is DailyGoalKind {
  return typeof value === 'string' && GOAL_KINDS.has(value);
}

export function getDailyGoalDefinition(kind: string): DailyGoalDefinition | undefined {
  return isDailyGoalKind(kind) ? DAILY_GOALS[kind] : undefined;
}

/** Индекс тира по уровню игрока: 0 → 1–9, 1 → 10–19, 2 → 20+. */
export function dailyGoalTierIndex(level: number): 0 | 1 | 2 {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  if (safeLevel >= 20) return 2;
  if (safeLevel >= 10) return 1;
  return 0;
}

export function getDailyGoalTarget(kind: DailyGoalKind, level: number): number {
  const targets = DAILY_GOAL_TARGETS[kind];
  return targets[dailyGoalTierIndex(level)];
}

export function getDailyGoalChips(kind: DailyGoalKind): number {
  const chips = DAILY_GOAL_CHIPS[kind];
  return Math.max(DAILY_GOAL_CHIPS_MIN, Math.min(DAILY_GOAL_CHIPS_MAX, chips));
}

/** Подпись цели с уже подставленным таргетом — UI ничего не считает сам. */
export function describeDailyGoal(kind: DailyGoalKind, target: number): string {
  return DAILY_GOALS[kind].description.replace('{target}', String(target));
}

/** UTC-ключ дня: цели дня живут по UTC, а не по Москве. */
export function getUtcDayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** FNV-1a: одинаковый результат в браузере, Node и тестах без crypto API. */
function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** mulberry32 — быстрый детерминированный PRNG для сеяной перестановки. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Детерминированный выбор трёх целей.
 *
 * Один и тот же (tgId, UTC-дата, наличие расходника) всегда даёт один и тот же
 * набор в одном и том же порядке — сервер и клиент могут пересчитать его без
 * запроса, а QA ловит любую попытку вернуть Math.random.
 *
 * `hasConsumables=false` убирает item_use из пула: цель «примени расходник»
 * без расходника — это гарантированный FAIL на весь день, а не челлендж.
 */
export function selectDailyGoalKinds(
  tgId: number,
  dayKey: string,
  hasConsumables = true
): DailyGoalKind[] {
  const pool = DAILY_GOAL_POOL.filter((kind) => kind !== 'item_use' || hasConsumables);
  const random = mulberry32(stableHash(`hk-daily-goals:${Math.floor(tgId) || 0}:${dayKey}`));
  const shuffled = [...pool];
  // Fisher–Yates на сеяном PRNG: равномерно и без повторов.
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled.slice(0, DAILY_GOALS_PER_DAY);
}

/** Свежая доска на день: цели, таргеты по уровню, нулевой прогресс. */
export function buildDailyGoalsBoard(
  tgId: number,
  dayKey: string,
  level: number,
  hasConsumables = true
): DailyGoalsState {
  const kinds = selectDailyGoalKinds(tgId, dayKey, hasConsumables);
  return {
    version: DAILY_GOALS_VERSION,
    date: dayKey,
    goals: kinds.map((kind) => ({
      key: kind,
      target: getDailyGoalTarget(kind, level),
      progress: 0,
      claimed: false,
    })),
  };
}

/**
 * Нормализация jsonb-состояния. Всё, что не проходит по конфигу, отбрасывается:
 * неизвестный ключ не должен попасть в интерфейс или в награду.
 */
export function normalizeDailyGoalsState(raw: unknown): DailyGoalsState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  if (Number(src.version) !== DAILY_GOALS_VERSION) return undefined;
  const date = typeof src.date === 'string' ? src.date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  if (!Array.isArray(src.goals) || src.goals.length !== DAILY_GOALS_PER_DAY) return undefined;

  const seen = new Set<DailyGoalKind>();
  const goals = [] as DailyGoalsState['goals'];
  for (const entry of src.goals) {
    if (!entry || typeof entry !== 'object') return undefined;
    const goal = entry as Record<string, unknown>;
    if (!isDailyGoalKind(goal.key) || seen.has(goal.key)) return undefined;
    seen.add(goal.key);
    const target = Math.floor(Number(goal.target));
    const progress = Math.floor(Number(goal.progress));
    if (!Number.isFinite(target) || target <= 0) return undefined;
    goals.push({
      key: goal.key,
      target,
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(target, progress)) : 0,
      claimed: goal.claimed === true,
    });
  }
  return { version: DAILY_GOALS_VERSION, date, goals };
}

/** Есть ли на доске цель, готовую к сбору (точка на входе «Задания»). */
export function countClaimableDailyGoals(state: DailyGoalsState | undefined): number {
  if (!state) return 0;
  return state.goals.filter((goal) => !goal.claimed && goal.progress >= goal.target).length;
}

/** Сколько целей уже забрано — для подписи входа «Задания». */
export function countClaimedDailyGoals(state: DailyGoalsState | undefined): number {
  if (!state) return 0;
  return state.goals.filter((goal) => goal.claimed).length;
}
