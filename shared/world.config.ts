/**
 * HACKER KOMBAT — мир «День хакера» (v5.5, фаза 1).
 *
 * Зачем отдельный слой: до сих пор «место» в игре было косметикой
 * (shared/backdrops.config.ts — вид из окна). Здесь появляется игровое место:
 * у него свой пул контрактов, свой акцент HUD и свой фон. Экономика при этом
 * не меняется — награды по-прежнему считает gameEngine по missions.config.ts.
 *
 * Правила:
 *  • чистые функции без DOM и React: этот модуль импортируют и клиент, и сервер;
 *  • локация открывается по derived.level, а не по ресурсам — прогресс линейный;
 *  • если в локации нет ни одного контракта, отдаём пул «Улицы», чтобы игрок
 *    никогда не остался без работы (см. filterMissionsForLocation).
 */

import { MISSIONS_CONFIG } from './missions.config';
import type { MissionConfig } from './types';

/** Идентификаторы локаций. Расширение = правка этого типа + LOCATIONS. */
export type LocationId = 'room' | 'street' | 'beach' | 'cybercafe' | 'techhub' | 'corpquarter';

/** Во что локация превращает свой пул контрактов (для UI и аналитики). */
export type LocationMissionTag = 'hub' | 'scam' | 'social' | 'rep' | 'tech' | 'corp';

export interface WorldLocation {
  id: LocationId;
  name: string;
  /** Уровень, с которого локация открыта. У Комнаты — 0 (хаб доступен всегда). */
  minLevel: number;
  /** Акцент HUD в формате «r, g, b»: подставляется в --loc-accent-rgb. */
  accentRgb: string;
  /** CSS-класс фона из src/index.css (градиент, без картинок). */
  bgClass: string;
  /** Короткий глиф для карточек карты — без внешних ассетов. */
  glyph: string;
  /** Одна строка атмосферы под названием. */
  flavor: string;
  /** Какие типы контрактов здесь спавнятся — для карточки и QA. */
  missionTags: LocationMissionTag[];
}

/** Домашняя локация: хаб, открыт всегда. */
export const HOME_LOCATION_ID: LocationId = 'room';

/** Куда откатываемся, если в локации нет контрактов. */
export const WORLD_FALLBACK_LOCATION_ID: LocationId = 'street';

/**
 * Слои интерфейса. Вынесены в конфиг, чтобы QA проверял отношение, а не
 * угадывал классы: карта ниже онбординга и ниже навигации.
 */
export const WORLD_Z_INDEX = {
  /**
   * Базовый фон приложения (тёплая подложка + сетка темы). Отдельный fixed-слой
   * нужен, чтобы у корневого шелла не было собственного фона: иначе он красится
   * выше слоёв с отрицательным z-index и прячет фон локации (см. backdrop).
   */
  shell: -2,
  /**
   * Фон локации. ВАЖНО: отрицательный слой. `.loc-bg` — `position: fixed;
   * inset: 0; opacity: .9` с тёмным градиентом. С `z-index: 0` (как было в
   * v5.5–v5.6) он рисуется ПОВЕРХ обычного потока (CSS 2.1, приложение E:
   * позиционированные потомки с z-index:0 идут после in-flow контента), из-за
   * чего весь контент под HUD выглядел затемнённым, а HUD/навигация (z-30) —
   * нет. Отрицательное значение уводит фон под контент, не создавая stacking
   * context у <main> (иначе модалы внутри страниц с z-50…z-70 оказались бы под
   * навигацией).
   */
  backdrop: -1,
  map: 10,
  onboarding: 20,
  chrome: 30,
} as const;

export const LOCATIONS: WorldLocation[] = [
  {
    id: 'room',
    name: 'Комната',
    minLevel: 0,
    accentRgb: '255, 154, 90',
    bgClass: 'loc-bg-room',
    glyph: '🛋️',
    flavor: 'Свой стол, свой чай, свой терминал. Тут спокойно и почти безопасно.',
    missionTags: ['hub'],
  },
  {
    id: 'street',
    name: 'Улица',
    minLevel: 1,
    accentRgb: '96, 183, 216',
    bgClass: 'loc-bg-street',
    glyph: '🌆',
    flavor: 'Первый выход из дома: витрины, объявления, мелкое мошенничество.',
    missionTags: ['scam', 'social'],
  },
  {
    id: 'beach',
    name: 'Пляж',
    minLevel: 5,
    accentRgb: '255, 205, 122',
    bgClass: 'loc-bg-beach',
    glyph: '🏖️',
    flavor: 'Лежак, шум волн и ноутбук. Тут ловят «выгодные» схемы и разводят на эмоции.',
    missionTags: ['scam', 'social'],
  },
  {
    id: 'cybercafe',
    name: 'Интернет-кафе',
    minLevel: 10,
    accentRgb: '168, 217, 138',
    bgClass: 'loc-bg-cybercafe',
    glyph: '🕹️',
    flavor: 'Тесно, шумно, зато своя сеть и своя репутация. Здесь растёт Rep.',
    missionTags: ['rep', 'social'],
  },
  {
    id: 'techhub',
    name: 'Тех-хаб',
    minLevel: 20,
    accentRgb: '120, 220, 255',
    bgClass: 'loc-bg-techhub',
    glyph: '🛰️',
    flavor: 'Стекло, кофе и стартапы: облака, лаборатории, спутники и свои люди.',
    missionTags: ['tech', 'hub'],
  },
  {
    id: 'corpquarter',
    name: 'Корпоративный квартал',
    minLevel: 40,
    accentRgb: '216, 167, 196',
    bgClass: 'loc-bg-corpquarter',
    glyph: '🏙️',
    flavor: 'Башни без окон, деньги без лиц. Максимальные выплаты — максимальный Heat.',
    missionTags: ['corp', 'tech'],
  },
];

/** Кэш по id: конфиг статичный, поэтому Map создаётся один раз. */
const LOCATIONS_BY_ID = new Map<LocationId, WorldLocation>(LOCATIONS.map((loc) => [loc.id, loc]));

/** Локация по id или undefined (для валидации ввода с клиента). */
export function getLocation(id: unknown): WorldLocation | undefined {
  if (typeof id !== 'string') return undefined;
  return LOCATIONS_BY_ID.get(id as LocationId);
}

/** Известный id — как есть, неизвестный/пустой — Комната. Никогда не бросает. */
export function resolveLocationId(raw: unknown): LocationId {
  return getLocation(raw)?.id ?? HOME_LOCATION_ID;
}

/** Уровень нормализуется: NaN/отрицательные значения считаются первым уровнем. */
function normalizeLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(0, Math.floor(level));
}

/** Все локации, открытые на этом уровне, в порядке роста minLevel. */
export function getUnlockedLocations(level: number): WorldLocation[] {
  const safeLevel = normalizeLevel(level);
  return LOCATIONS.filter((loc) => loc.minLevel <= safeLevel).sort(
    (a, b) => a.minLevel - b.minLevel
  );
}

/** Открыта ли конкретная локация на этом уровне. */
export function isLocationUnlocked(id: unknown, level: number): boolean {
  const loc = getLocation(id);
  if (!loc) return false;
  return loc.minLevel <= normalizeLevel(level);
}

/** Следующая локация, которую откроет уровень, — для подсказки на карте. */
export function getNextLockedLocation(level: number): WorldLocation | undefined {
  const safeLevel = normalizeLevel(level);
  return LOCATIONS.filter((loc) => loc.minLevel > safeLevel).sort(
    (a, b) => a.minLevel - b.minLevel
  )[0];
}

/** Все контракты локации без учёта уровня игрока (для карточки «что тут бывает»). */
export function missionsAtLocation(id: unknown): MissionConfig[] {
  const target = resolveLocationId(id);
  return MISSIONS_CONFIG.filter((mission) => missionLocationId(mission) === target);
}

/**
 * Локация контракта. У старых записей в конфиге поля не было — считаем их
 * уличными: это самый широкий и самый безопасный пул первого уровня.
 */
export function missionLocationId(mission: MissionConfig): LocationId {
  return getLocation(mission.locationId)?.id ?? WORLD_FALLBACK_LOCATION_ID;
}

/**
 * Контракты, которые показываем в локации. Если локальный пул пуст, отдаём
 * «Улицу»; если пуст и он — исходный список, чтобы игрок не остался без цели.
 */
export function filterMissionsForLocation(
  missions: readonly MissionConfig[],
  id: unknown
): MissionConfig[] {
  const target = resolveLocationId(id);
  const local = missions.filter((mission) => missionLocationId(mission) === target);
  if (local.length > 0) return local;
  const fallback = missions.filter(
    (mission) => missionLocationId(mission) === WORLD_FALLBACK_LOCATION_ID
  );
  return fallback.length > 0 ? fallback : [...missions];
}

/**
 * Серверная проверка анти-чита: контракт локации нельзя запустить, пока её
 * уровень не достигнут. Клиент не может обойти это, отправив чужой missionKey.
 */
export function isLocationMissionStartable(
  mission: MissionConfig,
  level: number
): boolean {
  return isLocationUnlocked(missionLocationId(mission), level);
}

/** Человеческое объяснение отказа — одно и то же на клиенте и на сервере. */
export function describeLockedLocation(mission: MissionConfig): string {
  const loc = getLocation(missionLocationId(mission));
  if (!loc) return 'Локация контракта не найдена';
  return `Контракт из локации «${loc.name}» откроется на ${loc.minLevel} уровне`;
}

/** CSS-переменные акцента локации — применяются на :root в LocationBackdrop. */
export function locationAccentVars(loc: WorldLocation): {
  '--loc-accent': string;
  '--loc-accent-rgb': string;
} {
  return {
    '--loc-accent': `rgb(${loc.accentRgb})`,
    '--loc-accent-rgb': loc.accentRgb,
  };
}
