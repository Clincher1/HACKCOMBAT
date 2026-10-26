import type { DailyTaskDefinition, DailyTaskKind } from './types';

/** Количество маленьких поручений, которые оператор получает за игровой день. */
export const DAILY_TASKS_PER_DAY = 3;

/**
 * Пул ежедневных поручений.
 *
 * В первый релиз намеренно входят только действия, которые уже существуют в
 * игре: тап, запуск контракта и закрытие контракта. Никаких новых валют или
 * скрытых усилений здесь нет — награда всегда только XP.
 */
export const DAILY_TASK_POOLS: Record<DailyTaskKind, readonly DailyTaskDefinition[]> = {
  tap: [
    {
      key: 'tap_100',
      kind: 'tap',
      target: 100,
      rewardXp: 10,
      icon: '👆',
      title: 'Разогреть терминал',
      description: 'Сделай 100 тапов по консоли.',
    },
    {
      key: 'tap_500',
      kind: 'tap',
      target: 500,
      rewardXp: 20,
      icon: '⚡',
      title: 'Пробить ритм',
      description: 'Сделай 500 тапов по консоли.',
    },
    {
      key: 'tap_1000',
      kind: 'tap',
      target: 1_000,
      rewardXp: 30,
      icon: '🔥',
      title: 'Давить на газ',
      description: 'Сделай 1 000 тапов по консоли.',
    },
  ],
  mission_start: [
    {
      key: 'mission_start_1',
      kind: 'mission_start',
      target: 1,
      rewardXp: 10,
      icon: '🛰️',
      title: 'Выйти в сеть',
      description: 'Запусти 1 контракт.',
    },
    {
      key: 'mission_start_2',
      kind: 'mission_start',
      target: 2,
      rewardXp: 20,
      icon: '📡',
      title: 'Поднять волну',
      description: 'Запусти 2 контракта.',
    },
    {
      key: 'mission_start_3',
      kind: 'mission_start',
      target: 3,
      rewardXp: 30,
      icon: '🌐',
      title: 'Расширить периметр',
      description: 'Запусти 3 контракта.',
    },
  ],
  mission_complete: [
    {
      key: 'mission_complete_1',
      kind: 'mission_complete',
      target: 1,
      rewardXp: 10,
      icon: '✅',
      title: 'Закрыть хвост',
      description: 'Забери результат 1 контракта.',
    },
    {
      key: 'mission_complete_2',
      kind: 'mission_complete',
      target: 2,
      rewardXp: 20,
      icon: '🎯',
      title: 'Собрать результаты',
      description: 'Забери результаты 2 контрактов.',
    },
    {
      key: 'mission_complete_3',
      kind: 'mission_complete',
      target: 3,
      rewardXp: 30,
      icon: '🏁',
      title: 'Довести смену до конца',
      description: 'Забери результаты 3 контрактов.',
    },
  ],
};

export const DAILY_TASKS_BY_KEY: Record<string, DailyTaskDefinition> = Object.fromEntries(
  Object.values(DAILY_TASK_POOLS)
    .flat()
    .map((task) => [task.key, task])
);

const DAILY_TASK_KINDS: readonly DailyTaskKind[] = ['tap', 'mission_start', 'mission_complete'];

/**
 * Маленький детерминированный генератор: один игрок получает случайный на вид
 * вариант, но тот же набор на всех устройствах и serverless-инстансах в течение
 * игровых суток. Случайность не зависит от Math.random и не меняется от запросов.
 */
function stableHash(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Возвращает по одному поручению каждого из трёх выбранных типов. */
export function getDailyTaskDefinitions(tgId: number, dayKey: string): DailyTaskDefinition[] {
  return DAILY_TASK_KINDS.map((kind) => {
    const pool = DAILY_TASK_POOLS[kind];
    const index = stableHash(`${tgId}:${dayKey}:${kind}`) % pool.length;
    return pool[index];
  });
}

export function getDailyTaskDefinition(key: string): DailyTaskDefinition | undefined {
  return DAILY_TASKS_BY_KEY[key];
}
