import type { PetConfig } from './types';

// ============================================================================
// ПИТОМЦЫ-КОМПАНЬОНЫ (раздел «Команда» → вкладка «Питомцы»)
// ----------------------------------------------------------------------------
// 3 питомца покупаются один раз и НЕ сбрасываются Global Hack Престижем.
// Дают небольшой баф, который зависит от сытости: покормил — баф полный.
// ТЗ v3: питомцы не для первого дня — покупка требует 14/17/20 уровня и стоит дорого.
// Питомцы НЕ умирают и НЕ убегают (рейтинг 12+): максимум — баф засыпает,
// пока сытость не восстановится. Никакого наказания, только мотивация заглянуть.
// ============================================================================
export const PETS_CONFIG: PetConfig[] = [
  {
    key: 'hamster_byte',
    name: 'Хомяк «Байт»',
    species: 'Хомяк',
    emoji: '🐹',
    description:
      'Живёт в системном блоке и греется о кулер. Пока сыт — подъедает фоновые процессы и ускоряет пассивный доход.',
    quote: '«Он не грызёт провода. Почти.»',
    costCurrency: 'data',
    costAmount: 60_000,
    requiredLevel: 14,
    buffType: 'passive',
    buffPct: 0.03,
    buffLabel: '+3% к пассивному доходу Data/час',
    hungerDecayPerHour: 2.1, // ~48 часов от 100 до 0
    feedHunger: 45,
    feedCooldownHours: 4,
    feedBaseCost: 80,
  },
  {
    key: 'rat_glitch',
    name: 'Крыса «Глитч»',
    species: 'Крыса',
    emoji: '🐭',
    description:
      'Нашла себе дом в кабельном лотке и знает каждый тайный проход. Пока сыта — подсказывает идеальные тайминги тапа.',
    quote: '«Она была здесь до тебя. И останется после.»',
    costCurrency: 'crypto',
    costAmount: 120,
    requiredLevel: 17,
    buffType: 'click',
    buffPct: 0.04,
    buffLabel: '+4% к силе клика',
    hungerDecayPerHour: 2.4,
    feedHunger: 45,
    feedCooldownHours: 4,
    feedBaseCost: 150,
  },
  {
    key: 'guinea_pixel',
    name: 'Морская свинка «Пиксель»',
    species: 'Морская свинка',
    emoji: '🐷',
    description:
      'Самая спокойная в команде. Гасит нервы оператора, поэтому Heat растёт медленнее, а добыча с контрактов — вкуснее.',
    quote: '«Свинка не паникует. Свинка планирует.»',
    costCurrency: 'rep',
    costAmount: 450,
    requiredLevel: 20,
    buffType: 'heat',
    buffPct: 0.09,
    buffLabel: '−9% к приросту Heat и +4% к награде за контракты',
    missionBonusPct: 0.04,
    hungerDecayPerHour: 1.8,
    feedHunger: 45,
    feedCooldownHours: 5,
    feedBaseCost: 220,
  },
];

export const PET_AFFECTION_MAX = 10;
export const PET_FEEDINGS_PER_AFFECTION = 5; // 5 кормлений = +1 уровень привязанности
export const PET_AFFECTION_BONUS_PER_LEVEL = 0.03; // +3% к бафу за уровень привязанности
export const PET_HUNGRY_THRESHOLD = 30; // Ниже — баф выключен, питомец «засыпает»
export const PET_FULL_THRESHOLD = 60; // Выше — баф работает на 100%

export interface PetBuffTotals {
  passiveBonusPct: number;
  clickBonusPct: number;
  heatReductionPct: number;
  missionBonusPct: number;
}

export const EMPTY_PET_BUFFS: PetBuffTotals = {
  passiveBonusPct: 0,
  clickBonusPct: 0,
  heatReductionPct: 0,
  missionBonusPct: 0,
};

/**
 * Сытость питомца «прямо сейчас»: в БД хранится сытость на момент последнего кормления,
 * дальше она линейно убывает. Функция чистая — одинаковый результат на сервере и в UI.
 */
export function getEffectiveHunger(
  hungerAtFeed: number,
  lastFedAtIso: string,
  decayPerHour: number,
  nowMs: number = Date.now()
): number {
  const fedMs = new Date(lastFedAtIso).getTime();
  if (!Number.isFinite(fedMs)) return Math.max(0, Math.min(100, hungerAtFeed));
  const elapsedHours = Math.max(0, (nowMs - fedMs) / 3_600_000);
  const value = Number(hungerAtFeed) - elapsedHours * decayPerHour;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

/** Множитель бафа: 100% при сытости ≥ 60, 50% при 30–60, 0% ниже 30 (питомец спит). */
export function getPetBuffMultiplier(effectiveHunger: number, feedCount: number): number {
  const hungerFactor =
    effectiveHunger >= PET_FULL_THRESHOLD ? 1 : effectiveHunger >= PET_HUNGRY_THRESHOLD ? 0.5 : 0;
  const affection = getPetAffection(feedCount);
  return hungerFactor * (1 + (affection - 1) * PET_AFFECTION_BONUS_PER_LEVEL);
}

export function getPetAffection(feedCount: number): number {
  const safe = Math.max(0, Math.floor(Number(feedCount) || 0));
  return Math.min(
    PET_AFFECTION_MAX,
    1 + Math.floor(safe / PET_FEEDINGS_PER_AFFECTION)
  );
}

/** Цена корма: не меньше базовой и не меньше 30 минут текущего пассивного дохода. */
export function getPetFeedCost(config: PetConfig, dataPerHour: number, discountPct = 0): number {
  const scaled = Math.max(config.feedBaseCost, Math.round((dataPerHour || 0) * 0.5));
  const safeDiscount = Math.max(0, Math.min(0.5, Number(discountPct) || 0));
  return Math.max(1, Math.round(scaled * (1 - safeDiscount)));
}
