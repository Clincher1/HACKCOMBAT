import type {
  DailyTaskKind,
  SeasonEventScenario,
  SeasonEventTaskDefinition,
} from './types';

export const SEASON_EVENT_DAY_COUNT = 7;
export const SEASON_EVENT_TASKS_PER_DAY = 3;
const SEASON_EVENT_DAY_MS = 86_400_000;
const SEASON_EVENT_DURATION_MS = SEASON_EVENT_DAY_COUNT * SEASON_EVENT_DAY_MS;

/**
 * Первое событие запускается 27 октября 2026 в 09:00 по Москве и живёт ровно
 * 7 календарных суток — до 3 ноября 2026, 09:00 MSK. Сервер создаёт задачи
 * только для наступившего дня и никогда не пересобирает уже сохранённый набор.
 */
export const SEASON_EVENT_LAUNCH_AT_ISO = '2026-10-27T09:00:00+03:00';

function isTestMode(): boolean {
  return typeof process !== 'undefined' && process.env?.SEASON_EVENT_TEST_MODE === 'true';
}

export function isSeasonEventLive(nowMs: number = Date.now()): boolean {
  const launchMs = Date.parse(SEASON_EVENT_LAUNCH_AT_ISO);
  if (!Number.isFinite(launchMs)) return false;
  if (isTestMode()) return true;
  return nowMs >= launchMs && nowMs < launchMs + SEASON_EVENT_DURATION_MS;
}

export const ACTIVE_SEASON_EVENT = {
  key: 'neon-relay',
  title: 'Международный протокол · Neon Relay',
  subtitle: 'Семь календарных дней. Каждый день — три личных задания.',
  description:
    'Закрывай сегодняшнюю тройку, не меняя обычную экономику контрактов. Первый полный день открывает голубую рамку, все семь — золотую.',
  dayCount: SEASON_EVENT_DAY_COUNT,
  dailyTasksPerDay: SEASON_EVENT_TASKS_PER_DAY,
  participationFrameKey: 'frame_neon_relay',
  masteryFrameKey: 'frame_neon_relay_master',
  scenarios: [
    {
      day: 1,
      title: 'Поймать сигнал',
      description: 'Получить первый набор из трёх заданий и синхронизировать relay.',
      system: 'День 1 · старт',
    },
    {
      day: 2,
      title: 'Открыть туннель',
      description: 'Новый набор задач приходит только с новым календарным днём.',
      system: 'День 2 · новый набор',
    },
    {
      day: 3,
      title: 'Провести пакет',
      description: 'Закрыть сегодняшние три шага без reroll после перезагрузки.',
      system: 'День 3 · стабильность',
    },
    {
      day: 4,
      title: 'Усилить relay',
      description: 'Сложность тройки зафиксирована по уровню на момент её выдачи.',
      system: 'День 4 · масштабирование',
    },
    {
      day: 5,
      title: 'Сверить маршруты',
      description: 'Собрать ещё один дневной пакет и продолжить недельный маршрут.',
      system: 'День 5 · маршрут',
    },
    {
      day: 6,
      title: 'Закрыть периметр',
      description: 'Остался один полный день до мастерской награды.',
      system: 'День 6 · периметр',
    },
    {
      day: 7,
      title: 'Передать финальный пакет',
      description: 'Закрыть последнюю тройку и открыть золотую рамку мастера.',
      system: 'День 7 · финал',
    },
  ] satisfies readonly SeasonEventScenario[],
} as const;

export type SeasonEventScenarioDefinition = (typeof ACTIVE_SEASON_EVENT.scenarios)[number];

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

/**
 * Возвращает календарный номер активного дня. До старта — 0, после окна — 8.
 * В тестовом режиме ранний fake clock считается первым днём, чтобы QA мог
 * поднять игрока до старта и проверить инициализацию без специального обхода.
 */
export function getSeasonEventDayNumber(nowMs: number = Date.now()): number {
  const window = getSeasonEventWindow(nowMs);
  if (nowMs < window.startMs) return isTestMode() ? 1 : 0;
  if (nowMs >= window.endMs) return SEASON_EVENT_DAY_COUNT + 1;

  // «Новый день» совпадает с игровыми календарными сутками по Москве, а не с
  // плавающим 24-часовым интервалом от 09:00. Финальные часы 3 ноября всё ещё
  // относятся к дню 7, пока семидневное окно не закрылось в 09:00.
  const moscowOffsetMs = 180 * 60_000;
  const shiftedNow = new Date(nowMs + moscowOffsetMs);
  const shiftedStart = new Date(window.startMs + moscowOffsetMs);
  const currentDate = Date.UTC(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    shiftedNow.getUTCDate()
  );
  const startDate = Date.UTC(
    shiftedStart.getUTCFullYear(),
    shiftedStart.getUTCMonth(),
    shiftedStart.getUTCDate()
  );
  return Math.max(
    1,
    Math.min(SEASON_EVENT_DAY_COUNT, Math.floor((currentDate - startDate) / SEASON_EVENT_DAY_MS) + 1)
  );
}

const DAY_TASK_COPY: ReadonlyArray<
  Readonly<Record<DailyTaskKind, { title: string; description: string; icon: string }>>
> = [
  {
    tap: { title: 'Поймать импульс', description: 'Сделай {target} тапов по терминалу.', icon: '⚡' },
    mission_start: { title: 'Открыть первый туннель', description: 'Запусти {target} контракт.', icon: '🛰️' },
    mission_complete: { title: 'Принять пакет', description: 'Забери результат {target} контракта.', icon: '📦' },
  },
  {
    tap: { title: 'Раскачать канал', description: 'Удерживай relay: {target} тапов по консоли.', icon: '📡' },
    mission_start: { title: 'Развернуть маршрут', description: 'Запусти {target} контракт(а).', icon: '🌐' },
    mission_complete: { title: 'Закрыть маршрут', description: 'Заверши {target} контракт(а).', icon: '✅' },
  },
  {
    tap: { title: 'Провести сигнал', description: 'Передай через терминал {target} импульсов.', icon: '🔋' },
    mission_start: { title: 'Поднять ретранслятор', description: 'Отправь в работу {target} контракт(а).', icon: '🚀' },
    mission_complete: { title: 'Сверить доставку', description: 'Забери {target} результата контрактов.', icon: '🎯' },
  },
  {
    tap: { title: 'Усилить частоту', description: 'Сделай {target} точных тапов по relay.', icon: '💠' },
    mission_start: { title: 'Пробить периметр', description: 'Запусти {target} контракт(а) периметра.', icon: '🛡️' },
    mission_complete: { title: 'Закрыть периметр', description: 'Забери {target} результата контрактов.', icon: '🔐' },
  },
  {
    tap: { title: 'Собрать шум сети', description: 'Накопи {target} импульсов на канале.', icon: '📶' },
    mission_start: { title: 'Сверить маршруты', description: 'Запусти {target} контракт(а) по маршруту.', icon: '🗺️' },
    mission_complete: { title: 'Подтвердить маршрут', description: 'Получи {target} результата контрактов.', icon: '🧭' },
  },
  {
    tap: { title: 'Удержать периметр', description: 'Дай relay {target} тапов энергии.', icon: '🔷' },
    mission_start: { title: 'Поднять защиту', description: 'Запусти {target} контракт(а) защиты.', icon: '🛰️' },
    mission_complete: { title: 'Снять защиту', description: 'Забери {target} результата контрактов.', icon: '☑️' },
  },
  {
    tap: { title: 'Передать финальный пакет', description: 'Сделай финальные {target} тапов.', icon: '🏁' },
    mission_start: { title: 'Запустить финальный relay', description: 'Запусти {target} финальный контракт(а).', icon: '🌟' },
    mission_complete: { title: 'Завершить Neon Relay', description: 'Забери {target} результата ивента.', icon: '🏆' },
  },
];

function safeEventLevel(level: number): number {
  const parsed = Number(level);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 1;
}

/**
 * Умеренная шкала: новичок получает 180 тапов и один контракт, высокий уровень
 * постепенно доходит до 1 200 тапов и трёх контрактов. Значения фиксируются в
 * SeasonEventDayState при генерации, поэтому прокачка после reload не reroll'ит
 * текущий день.
 */
export function getSeasonEventTaskTargets(level: number): {
  tap: number;
  contracts: number;
} {
  const safeLevel = safeEventLevel(level);
  return {
    tap: 180 + Math.min(1_020, (safeLevel - 1) * 12),
    contracts: Math.min(3, 1 + Math.floor((safeLevel - 1) / 12)),
  };
}

export function getSeasonEventDayTasks(
  day: number,
  dayKey: string,
  level: number
): SeasonEventTaskDefinition[] {
  const safeDay = Math.max(1, Math.min(SEASON_EVENT_DAY_COUNT, Math.floor(Number(day) || 1)));
  const copy = DAY_TASK_COPY[safeDay - 1];
  const targets = getSeasonEventTaskTargets(level);
  const targetByKind: Record<DailyTaskKind, number> = {
    tap: targets.tap,
    mission_start: targets.contracts,
    mission_complete: targets.contracts,
  };
  return (['tap', 'mission_start', 'mission_complete'] as const).map((kind) => {
    const target = targetByKind[kind];
    const text = copy[kind];
    return {
      key: `neon_relay_${dayKey}_day_${safeDay}_${kind}`,
      kind,
      target,
      icon: text.icon,
      title: text.title,
      description: text.description.replace('{target}', target.toLocaleString('ru-RU')),
    };
  });
}
