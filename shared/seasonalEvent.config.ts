import type { SeasonEventGoalDefinition } from './types';

const GAME_DAY_OFFSET_MINUTES = 180;

/**
 * Черновик первой операции. Дата запуска намеренно не задана: до отдельного
 * согласования названия, целей и окна запуска production не создаёт state и не
 * показывает кнопки наград. QA может включить только тестовый режим переменной
 * SEASON_EVENT_TEST_MODE=true.
 */
export const SEASON_EVENT_LAUNCH_AT_ISO: string | null = null;

export function isSeasonEventLive(nowMs: number = Date.now()): boolean {
  const testMode =
    typeof process !== 'undefined' && process.env?.SEASON_EVENT_TEST_MODE === 'true';
  if (testMode) return true;
  if (!SEASON_EVENT_LAUNCH_AT_ISO) return false;
  const launchMs = Date.parse(SEASON_EVENT_LAUNCH_AT_ISO);
  return Number.isFinite(launchMs) && nowMs >= launchMs;
}

export const ACTIVE_SEASON_EVENT = {
  key: 'neon-relay',
  title: 'Международный протокол · Neon Relay',
  subtitle: 'Соедини свой терминал с шумом мировой сети.',
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
      description: 'Сделай 1 000 тапов по терминалу за неделю.',
    },
    {
      key: 'event_starts_3',
      kind: 'mission_start',
      target: 3,
      icon: '🛰️',
      title: 'Открыть три туннеля',
      description: 'Запусти 3 контракта за неделю.',
    },
    {
      key: 'event_completes_3',
      kind: 'mission_complete',
      target: 3,
      icon: '🌐',
      title: 'Закрыть канал',
      description: 'Забери результаты 3 контрактов за неделю.',
    },
  ] satisfies readonly SeasonEventGoalDefinition[],
} as const;

export type SeasonEventGoal = (typeof ACTIVE_SEASON_EVENT.goals)[number];

export function getSeasonEventGoal(key: string): SeasonEventGoal | undefined {
  return ACTIVE_SEASON_EVENT.goals.find((goal) => goal.key === key);
}

/** Игровая неделя начинается в понедельник в 00:00 по Москве и длится 7 суток. */
export function getSeasonWeekWindow(nowMs: number = Date.now()): {
  weekKey: string;
  startMs: number;
  endMs: number;
} {
  const shifted = new Date(nowMs + GAME_DAY_OFFSET_MINUTES * 60_000);
  const dayOfWeek = shifted.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const mondayUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysFromMonday
  );
  const weekKey = new Date(mondayUtc).toISOString().slice(0, 10);
  const startMs = mondayUtc - GAME_DAY_OFFSET_MINUTES * 60_000;
  return { weekKey, startMs, endMs: startMs + 7 * 86_400_000 };
}
