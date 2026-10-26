import type { SeasonEventGoalDefinition, SeasonEventScenario } from './types';

const SEASON_EVENT_DURATION_MS = 7 * 86_400_000;

/**
 * Первое событие запускается 27 октября 2026 в 09:00 по Москве и живёт ровно
 * 7 суток — до 3 ноября 2026, 09:00 MSK. После окончания новые claim-запросы
 * закрываются сервером; следующий запуск не создаётся автоматически.
 */
export const SEASON_EVENT_LAUNCH_AT_ISO = '2026-10-27T09:00:00+03:00';

export function isSeasonEventLive(nowMs: number = Date.now()): boolean {
  const testMode =
    typeof process !== 'undefined' && process.env?.SEASON_EVENT_TEST_MODE === 'true';
  const launchMs = Date.parse(SEASON_EVENT_LAUNCH_AT_ISO);
  if (!Number.isFinite(launchMs)) return false;
  if (testMode) return true;
  return nowMs >= launchMs && nowMs < launchMs + SEASON_EVENT_DURATION_MS;
}

export const ACTIVE_SEASON_EVENT = {
  key: 'neon-relay',
  title: 'Международный протокол · Neon Relay',
  subtitle: 'Это игровой ивент: соедини свой терминал с шумом мировой сети.',
  description: 'Семь дней, три личные цели и две профильные рамки. Никакой силы — только след в истории оператора.',
  participationFrameKey: 'frame_neon_relay',
  masteryFrameKey: 'frame_neon_relay_master',
  goals: [
    {
      key: 'event_taps_1000',
      kind: 'tap',
      target: 1_000,
      icon: '⚡',
      title: 'Разогнать канал',
      description: 'Сделай 1 000 тапов по терминалу за 7 дней.',
    },
    {
      key: 'event_starts_3',
      kind: 'mission_start',
      target: 3,
      icon: '🛰️',
      title: 'Открыть три туннеля',
      description: 'Запусти 3 контракта за время ивента.',
    },
    {
      key: 'event_completes_3',
      kind: 'mission_complete',
      target: 3,
      icon: '🌐',
      title: 'Закрыть канал',
      description: 'Забери результаты 3 контрактов за время ивента.',
    },
  ] satisfies readonly SeasonEventGoalDefinition[],
  /**
   * Сценарный маршрут использует только уже существующие действия игры.
   * Дни — это подсказки и драматургия, а не новый ежедневный reset или валюта.
   */
  scenarios: [
    {
      day: 1,
      title: 'Поймать сигнал',
      description: 'Войди в ритм операции и начни разгонять канал тапами.',
      system: 'Терминал и Energy',
    },
    {
      day: 2,
      title: 'Открыть туннель',
      description: 'Выбери доступный контракт и запусти первый маршрут.',
      system: 'Контракты · запуск',
    },
    {
      day: 3,
      title: 'Провести пакет',
      description: 'Доведи контракт до результата и забери награду за взлом.',
      system: 'Контракты · закрытие',
    },
    {
      day: 4,
      title: 'Усилить relay',
      description: 'Смешай быстрые тапы и новый запуск, чтобы не терять темп.',
      system: 'Тапы + контракт',
    },
    {
      day: 5,
      title: 'Сверить маршруты',
      description: 'Закрой следующий контракт и отправь ещё один туннель в работу.',
      system: 'Контракты · запуск/закрытие',
    },
    {
      day: 6,
      title: 'Закрыть периметр',
      description: 'Добей оставшиеся личные цели без изменения обычной экономики.',
      system: 'Цели ивента',
    },
    {
      day: 7,
      title: 'Передать финальный пакет',
      description: 'Закрой все три цели и забери редкую рамку мастера.',
      system: 'Все цели · косметическая награда',
    },
  ] satisfies readonly SeasonEventScenario[],
} as const;

export type SeasonEventGoal = (typeof ACTIVE_SEASON_EVENT.goals)[number];

export function getSeasonEventGoal(key: string): SeasonEventGoal | undefined {
  return ACTIVE_SEASON_EVENT.goals.find((goal) => goal.key === key);
}

/** Фиксированное окно первой операции: 27.10 09:00 MSK → 03.11 09:00 MSK. */
export function getSeasonEventWindow(nowMs: number = Date.now()): {
  weekKey: string;
  startMs: number;
  endMs: number;
} {
  const startMs = Date.parse(SEASON_EVENT_LAUNCH_AT_ISO);
  const safeStartMs = Number.isFinite(startMs) ? startMs : nowMs;
  return {
    weekKey: new Date(safeStartMs).toISOString().slice(0, 10),
    startMs: safeStartMs,
    endMs: safeStartMs + SEASON_EVENT_DURATION_MS,
  };
}
