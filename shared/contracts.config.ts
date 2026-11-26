/**
 * Контракты (v6.1) — «пассивные цели» между ивентами.
 *
 * Идея: у игрока уже есть тапы, CPU Charge и Heat, но между сезонными ивентами
 * эти действия ни к чему не ведут. Контракт превращает их в понятную цель с
 * быстрой наградой (Data / Crypto / Chips), не добавляя ни мини-игры, ни новой
 * валюты, ни отдельного экрана.
 *
 * Правила:
 *   • три контракта выдаются сервером на московские сутки (00:00 MSK);
 *   • одновременно активно не больше MAX_ACTIVE_CONTRACTS;
 *   • не взятые в работу контракты сгорают со сменой дня без штрафа;
 *   • прогресс растёт сам от базовых действий, отдельного действия нет;
 *   • определение контракта и текст награды живут только здесь.
 */

/** Сколько контрактов выдаётся за игровой день. */
export const CONTRACTS_PER_DAY = 3;

/** Потолок одновременно активных контрактов. */
export const MAX_ACTIVE_CONTRACTS = 5;

/** Источник прогресса: только то, что игрок и так делает. */
export type ContractMetric = 'tap' | 'cpu' | 'heat' | 'mission_complete';

export interface ContractReward {
  data?: number;
  crypto?: number;
  chips?: number;
}

export interface ContractDefinition {
  key: string;
  metric: ContractMetric;
  target: number;
  icon: string;
  title: string;
  description: string;
  reward: ContractReward;
}

/** Как читается прогресс в интерфейсе: «12/25 CPU Charge». */
export const CONTRACT_METRIC_LABEL: Record<ContractMetric, string> = {
  tap: 'тапов',
  cpu: 'CPU Charge',
  heat: 'Heat',
  mission_complete: 'контрактов',
};

export const CONTRACT_POOLS: Record<ContractMetric, readonly ContractDefinition[]> = {
  tap: [
    {
      key: 'tap_250',
      metric: 'tap',
      target: 250,
      icon: '👆',
      title: 'Разогнать поток',
      description: '250 тапов по консоли. Тапы уже идут — цель догонит сама.',
      reward: { data: 180 },
    },
    {
      key: 'tap_600',
      metric: 'tap',
      target: 600,
      icon: '⚡',
      title: 'Держать темп',
      description: '600 тапов по консоли за день.',
      reward: { data: 320 },
    },
  ],
  cpu: [
    {
      key: 'cpu_25',
      metric: 'cpu',
      target: 25,
      icon: '🔋',
      title: 'Зарядить процессор',
      description: 'Потрать 25 CPU Charge на запуск контрактов.',
      reward: { chips: 3 },
    },
    {
      key: 'cpu_60',
      metric: 'cpu',
      target: 60,
      icon: '🧠',
      title: 'Держать ядро горячим',
      description: 'Потрать 60 CPU Charge на запуск контрактов.',
      reward: { data: 220 },
    },
  ],
  heat: [
    {
      key: 'heat_40',
      metric: 'heat',
      target: 40,
      icon: '🔥',
      title: 'Поднять жар',
      description: 'Набери 40 Heat по итогам взломов.',
      reward: { crypto: 1 },
    },
    {
      key: 'heat_80',
      metric: 'heat',
      target: 80,
      icon: '🌡️',
      title: 'Выйти на пик',
      description: 'Набери 80 Heat по итогам взломов.',
      reward: { data: 400 },
    },
  ],
  mission_complete: [
    {
      key: 'mission_2',
      metric: 'mission_complete',
      target: 2,
      icon: '🗂️',
      title: 'Закрыть два хвоста',
      description: 'Доведи до конца 2 контракта.',
      reward: { chips: 5 },
    },
    {
      key: 'mission_3',
      metric: 'mission_complete',
      target: 3,
      icon: '🏁',
      title: 'Смена без простоев',
      description: 'Доведи до конца 3 контракта.',
      reward: { crypto: 2 },
    },
  ],
};

export const CONTRACTS_BY_KEY: Record<string, ContractDefinition> = Object.fromEntries(
  Object.values(CONTRACT_POOLS)
    .flat()
    .map((contract) => [contract.key, contract])
);

const CONTRACT_METRICS: readonly ContractMetric[] = ['tap', 'cpu', 'heat', 'mission_complete'];

/** Компактная подпись награды: «+180 Data», «+1 Crypto», «+3 Chips». */
export function describeContractReward(reward: ContractReward): string {
  const parts: string[] = [];
  if (reward.data) parts.push(`${reward.data.toLocaleString('ru-RU')} Data`);
  if (reward.crypto) parts.push(`${reward.crypto} Crypto`);
  if (reward.chips) parts.push(`${reward.chips} Chips`);
  return parts.length > 0 ? `+${parts.join(' · +')}` : 'Награда';
}

function stableHash(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Детерминированная выдача: один игрок получает один и тот же набор на всех
 * устройствах и serverless-инстансах в течение игровых суток.
 */
export function getDailyContracts(tgId: number, dayKey: string): ContractDefinition[] {
  // Метрики перемешиваем хэшем, чтобы набор покрывал разные действия, а не
  // три тап-контракта подряд. Метрик четыре, слотов три — повторов не будет.
  const metrics = [...CONTRACT_METRICS].sort(
    (a, b) =>
      stableHash(`${tgId}:${dayKey}:metric:${a}`) - stableHash(`${tgId}:${dayKey}:metric:${b}`)
  );
  return metrics.slice(0, CONTRACTS_PER_DAY).map((metric) => {
    const pool = CONTRACT_POOLS[metric];
    return pool[stableHash(`${tgId}:${dayKey}:${metric}`) % pool.length];
  });
}

export function getContractDefinition(key: string): ContractDefinition | undefined {
  return CONTRACTS_BY_KEY[key];
}
