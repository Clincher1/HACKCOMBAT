/**
 * HACKER KOMBAT — цены, привязанные к доходу (v6.6).
 *
 * Проблема, которую решает файл: доход игрока растёт ×1.14 за уровень (до L90),
 * а каталог карточек — фиксированный: 48 карточек × 60 уровней ≈ 2.9·10¹⁴ Data.
 * На L50 это ~10⁷ часов игры. Data переставал быть дефицитом, а покупки — целью.
 *
 * Решение: цена уровня выражается в ЧАСАХ ДОХОДА, а не в «попугаях» каталога.
 *
 *   цена = min(номинал из каталога, часы(уровень) × ожидаемый доход/час(уровень игрока))
 *
 * Следствия:
 *  • ранняя игра не меняется (номинал там и так дешевле часов);
 *  • в середине и конце цена покупки — это буквально «N часов фарма»;
 *  • рост цен каталога больше не обгоняет рост дохода.
 *
 * Модель дохода намеренно оптимистичная (лучший доступный контракт, весь CPU в
 * дело, без провалов) — как в аудите: цены не должны быть ниже реальности,
 * иначе игрок будет ждать дольше обещанного.
 */

import { CONTRACT_CPU_COST_BY_TIER } from './economy.config';
import { getMissionRewardScale } from './hack.config';
import { cpuRegenSecondsForLevel } from './mechanics';
import { MISSIONS_CONFIG } from './missions.config';

/** Слотов контракта по уровню (та же формула, что в deriveStats). */
export function missionSlotsForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  return safe >= 20 ? 3 : safe >= 10 ? 2 : 1;
}

/** Сколько CPU Charge восстанавливается за час на этом уровне. */
export function cpuPerHour(level: number): number {
  return 3600 / cpuRegenSecondsForLevel(level);
}

/** Контрактов в час по CPU на этом уровне (слоты — отдельный потолок). */
export function contractsPerHour(level: number, tier: number): number {
  const cost = CONTRACT_CPU_COST_BY_TIER[tier] ?? CONTRACT_CPU_COST_BY_TIER[1];
  return cpuPerHour(level) / cost;
}

/**
 * Ожидаемый доход Data/час на уровне — опорная точка для ВСЕХ цен.
 * Лучший доступный контракт × min(CPU-пропускная способность, слоты).
 * Модель оптимистичная (как в аудите): без провалов и простоев.
 */
export function expectedHourlyIncome(level: number): number {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  const scale = getMissionRewardScale(safe);
  const slots = missionSlotsForLevel(safe);
  let best = 0;
  for (const mission of MISSIONS_CONFIG) {
    if ((mission.minLevel ?? 1) > safe) continue;
    const byCpu = cpuPerHour(safe) / (CONTRACT_CPU_COST_BY_TIER[mission.tier ?? 1] ?? CONTRACT_CPU_COST_BY_TIER[1]);
    const bySlots = (slots * 3600) / Math.max(1, mission.durationSec ?? 60);
    const perHour = mission.baseDataReward * scale * Math.min(byCpu, bySlots);
    if (perHour > best) best = perHour;
  }
  return Math.max(1, Math.round(best));
}

/** Часы дохода за один уровень карточки: 0.25 ч → 8 ч на 60-м уровне. */
export const CARD_PRICE_HOURS_BASE = 0.25;
export const CARD_PRICE_HOURS_GROWTH = 1.05;
export const CARD_PRICE_HOURS_MAX = 8;

/** Часы дохода за уровень «Базы»: 2.5 ч → 24 ч на 15-м уровне. */
export const BASE_PRICE_HOURS_BASE = 2.5;
export const BASE_PRICE_HOURS_GROWTH = 1.12;
export const BASE_PRICE_HOURS_MAX = 24;

export function hoursForCardLevel(cardLevel: number): number {
  const safe = Math.max(0, Math.floor(Number(cardLevel) || 0));
  return Math.min(CARD_PRICE_HOURS_MAX, CARD_PRICE_HOURS_BASE * Math.pow(CARD_PRICE_HOURS_GROWTH, safe));
}

export function hoursForBaseLevel(baseLevel: number): number {
  const safe = Math.max(0, Math.floor(Number(baseLevel) || 0));
  return Math.min(BASE_PRICE_HOURS_MAX, BASE_PRICE_HOURS_BASE * Math.pow(BASE_PRICE_HOURS_GROWTH, safe));
}

/** Цена в Data за «столько-то часов дохода на уровне игрока». */
export function priceForHours(hours: number, playerLevel: number): number {
  return Math.max(1, Math.floor(hours * expectedHourlyIncome(playerLevel)));
}

/**
 * Итоговая цена: каталог даёт номинал, доход даёт потолок.
 * Без playerLevel (старые вызовы) возвращается номинал — поведение прежнее.
 */
export function anchorPrice(nominal: number, hours: number, playerLevel?: number): number {
  const base = Math.max(1, Math.floor(Number(nominal) || 1));
  if (!Number.isFinite(playerLevel) || (playerLevel ?? 0) <= 0) return base;
  return Math.min(base, priceForHours(hours, playerLevel as number));
}

/** Сколько часов дохода стоит эта цена — для подписи в UI. */
export function hoursForPrice(price: number, playerLevel: number): number {
  const income = expectedHourlyIncome(playerLevel);
  return Math.max(0, Math.round(((Number(price) || 0) / income) * 10) / 10);
}

/** Компактная подпись «≈ 2.4 ч дохода» для магазинов. */
export function priceHoursLabel(price: number, playerLevel: number): string {
  const hours = hoursForPrice(price, playerLevel);
  if (hours < 1) return '≈ ' + Math.max(1, Math.round(hours * 60)) + ' мин дохода';
  return '≈ ' + hours.toFixed(hours < 10 ? 1 : 0) + ' ч дохода';
}

/**
 * Ориентир Crypto-дохода активного игрока: ~11/сутки со стрика + ~9/сутки с
 * 35% дропа серых контрактов. Разовые 3 098 за достижения не считаем — они
 * приходят месяцами и не являются потоком.
 */
export const CRYPTO_DAILY_REFERENCE = 20;

export function cryptoDaysForPrice(cryptoCost: number): number {
  return Math.max(0, Math.round((Number(cryptoCost) || 0) / CRYPTO_DAILY_REFERENCE));
}

/** «≈ 3 нед» — подпись к цене косметики. */
export function cryptoDaysLabel(cryptoCost: number): string {
  const days = cryptoDaysForPrice(cryptoCost);
  if (days <= 1) return '≈ сутки';
  if (days < 14) return '≈ ' + days + ' дн';
  return '≈ ' + Math.round(days / 7) + ' нед';
}
