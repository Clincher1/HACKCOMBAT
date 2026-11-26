/**
 * HACKER KOMBAT — локации как миры (v6.5).
 *
 * До этой версии локация была декорацией: другой пул контрактов, другой акцент
 * HUD, другой градиент — но одинаковые числа. Теперь у места есть ЦЕНА:
 * где-то платят больше, где-то прощают Heat, где-то за жадность бьют по шансу.
 *
 * Правила файла:
 *  • здесь только данные и чистые функции — модуль импортируют и клиент, и сервер
 *    (сервер считает награды/Heat, клиент подписывает те же числа в панели);
 *  • один источник правды: подпись в UI строится из тех же множителей, что
 *    применяет gameEngine — расхождение ловится скриптом scripts/qa/locations.mjs;
 *  • градиент остаётся фолбэком: .webp — украшение, числа — в этом файле.
 */

import { HOME_LOCATION_ID, LOCATIONS, resolveLocationId, type LocationId } from './world.config';

/**
 * Локация, которая реально влияет на экономику. WORLD_V2 остаётся аварийным
 * выключателем: с ним игрок считается сидящим в Комнате (×1.0 Data), а не
 * «полу-включённым» миром с чужими множителями.
 */
export function economyLocationId(locationId: unknown, worldEnabled = true): LocationId {
  return worldEnabled ? resolveLocationId(locationId) : HOME_LOCATION_ID;
}

/** Что локация делает с экономикой. Все значения — множители, 1 = как раньше. */
export interface LocationModifiers {
  /** Data: миссии, взломы и ручные тапы (CPU/Energy не трогаем). */
  data: number;
  /** Шанс успеха контракта. Ниже 1 — место шумное, выше — своих прикрывают. */
  success: number;
  /** Heat за взлом и за провал. Выше 1 — за тобой смотрят внимательнее. */
  heat: number;
}

export interface LocationWorld {
  id: LocationId;
  /** Одна строка «зачем сюда идти» — лор без полотна текста. */
  tagline: string;
  /**
   * Готовый фон из public/assets/backdrops. `null` — локация живёт на градиенте
   * (bgClass из world.config). Картинка грузится только у активной локации.
   */
  backdrop: string | null;
  modifiers: LocationModifiers;
}

/** Путь к .webp-бэкдропу (файлы уже лежат в public/assets/backdrops). */
const BACKDROP_BASE = '/assets/backdrops';

/**
 * Шесть миров. Данные подобраны по правилу «жадный платит риском, осторожный —
 * доходом»: Комната — базовая точка (всё ×1.0), Улица почти не даёт Heat, но и
 * платит по минимуму; Тех-хаб и Корп-квартал дают до ×1.6 Data и ×1.5 Heat.
 */
export const LOCATION_WORLDS: Record<LocationId, LocationWorld> = {
  room: {
    id: 'room',
    tagline: 'Свой угол: тихо, дёшево и почти никто не смотрит на твой IP.',
    backdrop: `${BACKDROP_BASE}/backdrop-home-room.webp`,
    // Точка отсчёта: дом ничего не множит. Всё, что дальше, — уже выбор игрока.
    modifiers: { data: 1, success: 1, heat: 1 },
  },
  street: {
    id: 'street',
    tagline: 'Люди, кофе и открытый Wi-Fi: деньги мелкие, хвостов за тобой нет.',
    backdrop: `${BACKDROP_BASE}/backdrop-street-cafe.webp`,
    // Низкий доход, почти нет Heat: место, где отлёживается розыск.
    modifiers: { data: 1.05, success: 1, heat: 0.75 },
  },
  beach: {
    id: 'beach',
    tagline: 'Пляжный бар: расслабленные сети и такая же расслабленная охрана.',
    backdrop: `${BACKDROP_BASE}/backdrop-beach-day.webp`,
    modifiers: { data: 1.2, success: 0.95, heat: 0.85 },
  },
  cybercafe: {
    id: 'cybercafe',
    tagline: 'Свои за стойкой: подскажут, прикроют и дадут канал без логов.',
    backdrop: `${BACKDROP_BASE}/backdrop-motel-night.webp`,
    modifiers: { data: 1.25, success: 1.05, heat: 1 },
  },
  techhub: {
    id: 'techhub',
    tagline: 'Стеклянный офис: быстрые деньги и живые камеры за спиной.',
    backdrop: `${BACKDROP_BASE}/backdrop-promenade.webp`,
    modifiers: { data: 1.4, success: 1, heat: 1.3 },
  },
  corpquarter: {
    id: 'corpquarter',
    tagline: 'Квартал корпораций: самые жирные контракты и самый злой Heat.',
    backdrop: `${BACKDROP_BASE}/backdrop-rooftop-sunset.webp`,
    modifiers: { data: 1.6, success: 0.9, heat: 1.5 },
  },
};

/** Множители «как есть» для локации (неизвестный id → Комната). */
export function locationModifiers(locationId: unknown): LocationModifiers {
  const id = resolveLocationId(locationId);
  return LOCATION_WORLDS[id]?.modifiers ?? LOCATION_WORLDS[HOME_LOCATION_ID].modifiers;
}

/**
 * Множители, которые применяет экономика: с выключенным WORLD_V2 — Комната.
 * Одна функция на клиент и сервер, чтобы подпись в UI не могла разойтись с числами.
 */
export function economyModifiers(locationId: unknown, worldEnabled = true): LocationModifiers {
  return locationModifiers(economyLocationId(locationId, worldEnabled));
}

/** Мир локации целиком: лор, фон, множители. */
export function getLocationWorld(locationId: unknown): LocationWorld {
  const id = resolveLocationId(locationId);
  return LOCATION_WORLDS[id] ?? LOCATION_WORLDS[HOME_LOCATION_ID];
}

/** .webp-фон локации или null, если место живёт на градиенте. */
export function locationBackdropUrl(locationId: unknown): string | null {
  return getLocationWorld(locationId).backdrop;
}

/** Одна строка флавора для панели локации. */
export function locationTagline(locationId: unknown): string {
  return getLocationWorld(locationId).tagline;
}

/** Число в подписи: 1 → «1.0», 1.05 → «1.05», 1.4 → «1.4». */
function fmtMultiplier(value: number): string {
  const fixed = (Math.round(value * 100) / 100).toFixed(2);
  return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
}

/**
 * Честная подпись эффектов: те же числа, что применяет сервер.
 * Пример: «Доход ×1.4 · Риск Heat ×1.3».
 * Шанс показываем только когда он реально отличается от базового.
 */
export function locationEffectLabel(locationId: unknown): string {
  const mods = locationModifiers(locationId);
  const parts = [`Доход ×${fmtMultiplier(mods.data)}`];
  if (Math.abs(mods.success - 1) > 0.001) {
    parts.push(`Шанс ×${fmtMultiplier(mods.success)}`);
  }
  parts.push(`Риск Heat ×${fmtMultiplier(mods.heat)}`);
  return parts.join(' · ');
}

/** Все миры в порядке открытия (для полосы локаций). */
export function listLocationWorlds(): LocationWorld[] {
  return LOCATIONS.map((location) => getLocationWorld(location.id));
}

/** Есть ли у локации картинка-фон (для QA и ленивой загрузки). */
export function hasLocationBackdrop(locationId: unknown): boolean {
  return locationBackdropUrl(locationId) !== null;
}
