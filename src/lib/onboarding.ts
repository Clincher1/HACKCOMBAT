/**
 * HACKER KOMBAT — вью-модель онбординга первого сеанса (v5.4).
 *
 * Здесь только чистые функции без React: их проверяет scripts/qa/onboarding.mjs
 * и использует src/components/Onboarding.tsx. Прогресс шагов читается из тех же
 * счётчиков, которые меняют сами действия (тап/покупка/старт миссии), поэтому
 * аналитика (trackFunnel в GameContext) не дублируется.
 */

import { CARDS_CONFIG, getCardPrice, getMaxCardLevel } from '../../shared/cards.config';
import { isGameplayV3Enabled, isOnboardingV2Enabled, isWorldV2Enabled } from '../../shared/config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import {
  ONBOARDING_STEP_COUNT,
  STARTER_MISSION_MAX_SECONDS,
  isOnboardingGateActive,
  newPlayerSnapshot,
  type NewPlayerSnapshot,
} from '../../shared/onboarding.config';
import type { CardConfig, MissionConfig, PlayerState } from '../../shared/types';

export interface UpgradeSuggestion {
  card: CardConfig;
  price: number;
  affordable: boolean;
}

export interface OnboardingViewState {
  /** Показывать ли оверлей прямо сейчас. */
  visible: boolean;
  /** Текущий шаг 1..ONBOARDING_STEP_COUNT (3 — когда все шаги уже пройдены). */
  step: number;
  snapshot: NewPlayerSnapshot;
}

const EMPTY_SNAPSHOT: NewPlayerSnapshot = { totalCardLevels: 0, totalMissions: 0, totalClicks: 0 };

/**
 * Шаг 1 при геймплее v3 — не «тапнул», а «запустил первый контракт».
 *
 * Почему «или тап»: оверлей (src/components/Onboarding.tsx) при v3 показывает
 * кнопку первого контракта, но шаг остаётся совместимым с легаси-поведением и
 * закрывается любым из трёх признаков. Так гейт не может залипнуть ни на одном
 * из двух флагов, ни у игрока, который успел тапнуть до обновления.
 */
function isFirstStepCompleteUnderV3(player: PlayerState): boolean {
  return player.totalClicks >= 1 || player.totalMissions >= 1 || player.activeMissions.length > 0;
}

export function isStepComplete(player: PlayerState, step: number): boolean {
  if (step <= 1) {
    return isGameplayV3Enabled() && isWorldV2Enabled()
      ? isFirstStepCompleteUnderV3(player)
      : player.totalClicks >= 1;
  }
  if (step === 2) return player.derived.totalCardLevels >= 1;
  return player.totalMissions >= 1 || player.activeMissions.length > 0;
}

/** Первый непройденный шаг; если пройдены все — ONBOARDING_STEP_COUNT. */
export function currentOnboardingStep(player: PlayerState): number {
  for (let step = 1; step <= ONBOARDING_STEP_COUNT; step += 1) {
    if (!isStepComplete(player, step)) return step;
  }
  return ONBOARDING_STEP_COUNT;
}

export function onboardingViewState(player: PlayerState | null): OnboardingViewState {
  if (!player) return { visible: false, step: 1, snapshot: EMPTY_SNAPSHOT };

  const snapshot = newPlayerSnapshot(player);
  const step = currentOnboardingStep(player);
  const allStepsDone = isStepComplete(player, ONBOARDING_STEP_COUNT);
  const visible =
    isOnboardingV2Enabled() &&
    !allStepsDone &&
    isOnboardingGateActive(snapshot, player.stats.onboardingV2Completed === true);

  return { visible, step, snapshot };
}

/**
 * Единственная подсказка на экране «улучшение»: самая дешёвая ДОСТУПНАЯ карточка,
 * а если денег не хватает ни на одну — самая дешёвая вообще (с прогрессом до неё).
 * Никаких 48 карточек в первом сеансе — только один вариант.
 */
export function pickUpgradeSuggestion(player: PlayerState): UpgradeSuggestion | null {
  const maxLevel = Math.min(getMaxCardLevel(player.cardTier), player.derived.maxCardLevel);
  let cheapestAffordable: UpgradeSuggestion | null = null;
  let cheapest: UpgradeSuggestion | null = null;

  for (const card of CARDS_CONFIG) {
    if ((card.minLevel ?? 1) > player.derived.level) continue;
    if ((player.cards[card.key] ?? 0) >= maxLevel) continue;
    const price = getCardPrice(
      card,
      player.cards[card.key] ?? 0,
      player.derived.totalCardLevels,
      player.derived.cardPriceDiscountPct
    );
    const entry: UpgradeSuggestion = { card, price, affordable: player.data >= price };
    if (cheapest === null || price < cheapest.price) cheapest = entry;
    if (entry.affordable && (cheapestAffordable === null || price < cheapestAffordable.price)) {
      cheapestAffordable = entry;
    }
  }

  return cheapestAffordable ?? cheapest;
}

function isStarterMission(mission: MissionConfig, level: number): boolean {
  if ((mission.minLevel ?? 1) > level) return false;
  if (mission.durationSec > STARTER_MISSION_MAX_SECONDS) return false;
  // «Серые» цели требуют разблокировки — новичку их не предлагаем.
  return mission.targetType !== 'grey';
}

/**
 * Первый контракт: самый короткий из доступных сейчас (≤ 90 секунд).
 * Приоритет — текущая витрина availableMissionKeys, иначе общий конфиг.
 */
export function pickStarterMissionKey(player: PlayerState): string | null {
  const byKey = new Map(MISSIONS_CONFIG.map((mission) => [mission.key, mission]));

  const offers = player.availableMissionKeys
    .map((key) => byKey.get(key))
    .filter((mission): mission is MissionConfig => mission !== undefined)
    .filter((mission) => isStarterMission(mission, player.derived.level))
    .sort((a, b) => a.durationSec - b.durationSec);
  if (offers.length > 0) return offers[0].key;

  const fallback = MISSIONS_CONFIG.filter((mission) => isStarterMission(mission, player.derived.level)).sort(
    (a, b) => a.durationSec - b.durationSec
  );
  return fallback.length > 0 ? fallback[0].key : null;
}

/** Подпись к шагу 3 для CTA: «Контракт на 50 секунд». */
export function starterMissionDuration(player: PlayerState): number | null {
  const key = pickStarterMissionKey(player);
  if (!key) return null;
  return MISSIONS_CONFIG.find((mission) => mission.key === key)?.durationSec ?? null;
}
