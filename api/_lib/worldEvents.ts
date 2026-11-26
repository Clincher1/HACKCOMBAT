/**
 * HACKER KOMBAT — воронка мира «День хакера» (v5.5).
 *
 * Зачем отдельный модуль: api/_lib/clientEvents.ts — замороженный контракт
 * воронки v5.3 (он проверяется своим QA и не должен меняться под новые фичи).
 * Шаги мира добавляются здесь и подключаются в api/_routes/track.ts, а сама
 * запись по-прежнему идёт через insertClientEvent() в public.client_events.
 *
 * Дедупликация: первый шаг пишется один раз за жизнь аккаунта — уникальный
 * частичный индекс uq_client_events_funnel_once, который расширяет миграция
 * 020_first_move.sql (ALTER ... WHERE event IN (... 'first_move')).
 */

/** Шаги воронки, которые появились вместе с миром. */
export const WORLD_FUNNEL_EVENTS = ['first_move'] as const;

export type WorldFunnelEventName = (typeof WORLD_FUNNEL_EVENTS)[number];

const WORLD_FUNNEL_SET: ReadonlySet<string> = new Set<string>([...WORLD_FUNNEL_EVENTS]);

/** Является ли событие шагом воронки мира. */
export function isWorldFunnelEvent(event: string): boolean {
  return WORLD_FUNNEL_SET.has(event);
}

/**
 * Шаги воронки не режутся пятисекундным антифлудом: они и так пишутся один раз
 * за жизнь аккаунта. Список обязан совпадать с массивом v_funnel в SQL-функции
 * insert_client_event() — иначе первый же шаг после app_opened словит 'throttled'.
 */
export function isWorldFunnelStepUnthrottled(event: string): boolean {
  return isWorldFunnelEvent(event);
}
