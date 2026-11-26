/**
 * HACKER KOMBAT — клиентские помощники мира (v5.5).
 *
 * Только тонкий слой над shared/world.config.ts: без React и без состояния.
 * Всё, что можно проверить тестом, живёт в shared-конфиге; здесь — доступ к
 * текущей локации игрока, фильтр витрины и один флаг-гейтованный шаг воронки.
 */

import { isWorldV2Enabled } from '../../shared/config';
import type { MissionConfig, PlayerProgressStats } from '../../shared/types';
import {
  filterMissionsForLocation,
  getLocation,
  getNextLockedLocation,
  getUnlockedLocations,
  HOME_LOCATION_ID,
  isLocationUnlocked,
  LOCATIONS,
  resolveLocationId,
  type WorldLocation,
} from '../../shared/world.config';
import { trackFunnel } from './analytics';

/** Комната — «запасная» локация: она в конфиге есть всегда. */
const HOME_LOCATION: WorldLocation = getLocation(HOME_LOCATION_ID) ?? LOCATIONS[0];

/** Включён ли мир сейчас (единая точка правды для компонентов). */
export function isWorldEnabled(): boolean {
  return isWorldV2Enabled();
}

/** Локация игрока. Пустое или неизвестное значение — это Комната, а не ошибка. */
export function readActiveLocation(stats: PlayerProgressStats | undefined): WorldLocation {
  return getLocation(resolveLocationId(stats?.locationId)) ?? HOME_LOCATION;
}

/** Открытые на этом уровне локации (для карты и подсказок). */
export function unlockedLocations(level: number): WorldLocation[] {
  return getUnlockedLocations(level);
}

/** Следующая локация к открытию — для строки «Откроется на N уровне» в шапке. */
export function nextLocationHint(level: number): WorldLocation | undefined {
  return getNextLockedLocation(level);
}

/** Можно ли переехать прямо сейчас (сервер всё равно проверит уровень). */
export function canTravelTo(locationId: unknown, level: number): boolean {
  return isLocationUnlocked(locationId, level);
}

/**
 * Витрина контрактов глазами локации: показываем её пул, а если он пуст —
 * «Улицу». Это тот же фильтр, что применяет сервер при сборке скана.
 */
export function missionsForLocation(
  missions: readonly MissionConfig[],
  locationId: unknown
): MissionConfig[] {
  return filterMissionsForLocation(missions, locationId);
}

/**
 * v5.5: шаг воронки first_move — «вышел в город».
 *
 * Заменяет первый тап как ключевую точку воронки, но только когда мир включён:
 * при WORLD_V2=false воронка остаётся прежней (first_tap из GameContext).
 * trackFunnel сам гарантирует «один раз за сессию», сервер — «один раз за
 * жизнь аккаунта» (uq_client_events_funnel_once из миграции 020).
 */
export function markFirstMoveOut(location: WorldLocation, level: number): void {
  if (!isWorldEnabled()) return;
  trackFunnel('first_move', { location: location.id, level });
}
