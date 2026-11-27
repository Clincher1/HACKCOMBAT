/**
 * HACKER KOMBAT — движок сезонных ивентов (v6.8).
 *
 * Раньше «ивент» был особенным случаем: леденец жил в своём файле и своём
 * обработчике, а Neon Relay — в отдельном конфиге с зашитыми датами. Теперь есть
 * один реестр, где ивент = { окно, модификатор, витрина }, и два «жёлоба»:
 *
 *  • daily  — окно внутри игровых суток (леденец: час ×2 Data раз в день);
 *  • weekly — ротация по 7 дней: в любой момент активен РОВНО ОДИН ивент, окна
 *             стыкуются без зазоров, поэтому «конвейер» не останавливается.
 *
 * Правила файла:
 *  • модификаторы применяет только сервер (gameEngine), клиент их показывает;
 *  • окна считаются от абсолютной метки-якоря, а не от «первого входа игрока»,
 *    иначе у каждого был бы свой календарь ивентов;
 *  • анонс — за 12 часов до старта, ровно один раз на конкретное окно
 *    (ключ `${event}:${startIso}`), поэтому напоминание не спамит.
 */
import { LOLLIPOP_BOOST_MS, LOLLIPOP_MULTIPLIER } from './season.config';

export type EventLane = 'daily' | 'weekly';

/** Что ивент делает с экономикой. Всё — множители, 1 = как обычно. */
export interface EventModifiers {
  /** Множитель Data за ручные действия (леденец). */
  dataMult?: number;
  /** Множитель прироста Heat (0.5 — «тихая неделя»). */
  heatMult?: number;
  /** Множитель шанса Crypto-дропа с серых контрактов (1.25 — «ночной рынок»). */
  greyCryptoMult?: number;
}

export interface WeeklyWindow {
  type: 'weekly';
  /** Номер слота в ротации: 0, 1, 2… */
  slot: number;
}

export interface DailyWindow {
  type: 'daily';
  /** Сколько длится буст после активации. */
  boostMs: number;
  /** Сколько раз в игровые сутки можно активировать. */
  dailyLimit: number;
}

export interface SeasonalEvent {
  id: string;
  lane: EventLane;
  title: string;
  tagline: string;
  emoji: string;
  window: WeeklyWindow | DailyWindow;
  modifiers: EventModifiers;
  /** Одна строка витрины: что игроку делать/что он получает. */
  showcase: string;
  /** За сколько часов анонсировать старт (0 — не анонсировать). */
  announcementHours: number;
}

/** Ротация стартует в понедельник 30.11.2026, 00:00 МСК. */
export const WEEKLY_ANCHOR_ISO = '2026-11-30T00:00:00+03:00';
export const WEEKLY_CYCLE_DAYS = 7;
const WEEK_MS = WEEKLY_CYCLE_DAYS * 86_400_000;
export const EVENT_ANNOUNCEMENT_HOURS = 12;

/** Леденец — первый ивент этого движка (daily-жёлоб). */
export const LOLLIPOP_EVENT_ID = 'lollipop';

export const SEASONAL_EVENTS: SeasonalEvent[] = [
  {
    id: LOLLIPOP_EVENT_ID,
    lane: 'daily',
    title: 'Сезонный леденец',
    tagline: 'Час удвоенного Data — раз в игровые сутки',
    emoji: '🍭',
    window: { type: 'daily', boostMs: LOLLIPOP_BOOST_MS, dailyLimit: 1 },
    modifiers: { dataMult: LOLLIPOP_MULTIPLIER },
    showcase: 'Активируй и час получай ×2 Data со всех ручных действий.',
    announcementHours: 0,
  },
  {
    id: 'quiet-week',
    lane: 'weekly',
    title: 'Тихая неделя',
    tagline: 'Город смотрит в другую сторону',
    emoji: '🌫️',
    window: { type: 'weekly', slot: 0 },
    modifiers: { heatMult: 0.5 },
    showcase: 'Heat растёт вдвое медленнее во всех локациях — неделя для смелых рейдов.',
    announcementHours: EVENT_ANNOUNCEMENT_HOURS,
  },
  {
    id: 'night-market',
    lane: 'weekly',
    title: 'Ночной рынок',
    tagline: 'Серые заказы платят щедрее',
    emoji: '🌙',
    window: { type: 'weekly', slot: 1 },
    modifiers: { greyCryptoMult: 1.25 },
    showcase: 'Шанс Crypto с серых контрактов +25% — неделя тихой работы.',
    announcementHours: EVENT_ANNOUNCEMENT_HOURS,
  },
];

/** События, которые уже отработали. Храним окно, а не «мёртвый» флаг. */
export interface LegacyEvent {
  id: string;
  title: string;
  startIso: string;
  durationMs: number;
  status: 'archived';
  note: string;
}

export const LEGACY_EVENTS: LegacyEvent[] = [
  {
    id: 'neon-relay',
    title: 'Международный протокол · Neon Relay',
    startIso: '2026-10-27T09:00:00+03:00',
    durationMs: 7 * 86_400_000,
    status: 'archived',
    note: 'Отработал 27.10–03.11.2026. Рамки участия и мастера остаются у тех, кто успел.',
  },
];

export function getEvent(id: string): SeasonalEvent | null {
  return SEASONAL_EVENTS.find((event) => event.id === id) ?? null;
}

export function getDailyEvents(): SeasonalEvent[] {
  return SEASONAL_EVENTS.filter((event) => event.lane === 'daily');
}

export function getWeeklyEvents(): SeasonalEvent[] {
  return SEASONAL_EVENTS.filter((event) => event.lane === 'weekly');
}

export interface WeeklySlot {
  /** Порядковый номер недели от якоря (может быть отрицательным до старта). */
  index: number;
  /** Номер слота в ротации (0/1/…). */
  slot: number;
  startMs: number;
  endMs: number;
  event: SeasonalEvent;
}

function weeklyIndex(nowMs: number): number {
  const anchor = Date.parse(WEEKLY_ANCHOR_ISO);
  if (!Number.isFinite(anchor)) return 0;
  return Math.floor((nowMs - anchor) / WEEK_MS);
}

/** Текущее окно ротации: что играет сейчас и когда закончится. */
export function getWeeklySlot(nowMs: number = Date.now()): WeeklySlot {
  const rotation = getWeeklyEvents();
  const anchor = Date.parse(WEEKLY_ANCHOR_ISO);
  const index = weeklyIndex(nowMs);
  const startMs = anchor + index * WEEK_MS;
  const size = rotation.length || 1;
  const slot = ((index % size) + size) % size;
  return {
    index,
    slot,
    startMs,
    endMs: startMs + WEEK_MS,
    event: rotation[slot] ?? rotation[0],
  };
}

/** Активный ротационный ивент (в ротации он есть всегда). */
export function getActiveWeeklyEvent(nowMs: number = Date.now()): WeeklySlot | null {
  return getWeeklySlot(nowMs).event ? getWeeklySlot(nowMs) : null;
}

export interface UpcomingEvent {
  event: SeasonalEvent;
  startIso: string;
  startsAtMs: number;
  hoursLeft: number;
}

/** Следующее окно ротации (стартует, когда закончится текущее). */
export function getUpcomingWeeklyEvent(nowMs: number = Date.now()): UpcomingEvent {
  const current = getWeeklySlot(nowMs);
  const rotation = getWeeklyEvents();
  const size = rotation.length || 1;
  const nextSlot = (current.slot + 1) % size;
  const startsAtMs = current.endMs;
  return {
    event: rotation[nextSlot] ?? rotation[0],
    startIso: new Date(startsAtMs).toISOString(),
    startsAtMs,
    hoursLeft: Math.max(0, (startsAtMs - nowMs) / 3_600_000),
  };
}

/**
 * Пора ли анонсировать следующий ивент. Один анонс на конкретное окно:
 * ключ включает дату старта, поэтому следующая неделя анонсируется заново,
 * а повторные init в те же 12 часов молчат.
 */
export function getEventAnnouncement(
  nowMs: number = Date.now(),
  announced: Record<string, string> | undefined = undefined
): UpcomingEvent | null {
  const next = getUpcomingWeeklyEvent(nowMs);
  const hours = next.event.announcementHours ?? 0;
  if (hours <= 0 || next.hoursLeft > hours) return null;
  const key = `${next.event.id}:${next.startIso}`;
  if (announced && announced[key]) return null;
  return next;
}

/** Ключ анонса — тем же форматом пользуется сервер при записи. */
export function eventAnnouncementKey(next: UpcomingEvent): string {
  return `${next.event.id}:${next.startIso}`;
}

/**
 * Действующие модификаторы экономики «прямо сейчас».
 *
 * Складываются из ротации (один ивент) и daily-бустов, которые включаются не по
 * календарю, а действием игрока (леденец → season.config). Здесь считается
 * только календарная часть: её применяет сервер при старте контракта.
 */
export function getEventModifiers(nowMs: number = Date.now()): Required<EventModifiers> {
  const weekly = getWeeklySlot(nowMs).event;
  return {
    dataMult: weekly?.modifiers.dataMult ?? 1,
    heatMult: weekly?.modifiers.heatMult ?? 1,
    greyCryptoMult: weekly?.modifiers.greyCryptoMult ?? 1,
  };
}

/** Одна строка для UI/алертов: «Heat ×0.5». Пусто — ивент ничего не меняет. */
export function describeEventModifiers(mods: EventModifiers): string {
  const parts: string[] = [];
  if (mods.dataMult && mods.dataMult !== 1) parts.push(`Data ×${mods.dataMult}`);
  if (mods.heatMult && mods.heatMult !== 1) parts.push(`Heat ×${mods.heatMult}`);
  if (mods.greyCryptoMult && mods.greyCryptoMult !== 1) {
    parts.push(`Crypto с серых ×${mods.greyCryptoMult}`);
  }
  return parts.join(' · ');
}

/** Окно ивента человеческим языком: «до 07.12, 00:00 МСК». */
export function formatEventEnd(endMs: number): string {
  const date = new Date(endMs + 3 * 3_600_000);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}.${month}, ${hours}:${minutes} МСК`;
}

export function getLegacyEvent(id: string): LegacyEvent | null {
  return LEGACY_EVENTS.find((event) => event.id === id) ?? null;
}

/** Живо ли архивное окно (используется старым season-event, чтобы не дублировать даты). */
export function isLegacyEventLive(id: string, nowMs: number = Date.now()): boolean {
  const legacy = getLegacyEvent(id);
  if (!legacy) return false;
  const start = Date.parse(legacy.startIso);
  if (!Number.isFinite(start)) return false;
  return nowMs >= start && nowMs < start + legacy.durationMs;
}
