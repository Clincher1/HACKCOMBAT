/**
 * HACKER KOMBAT — правила «первого сеанса» (v5.4).
 *
 * Один источник правды и для клиента, и для сервера: иначе UI прячет Heat-штраф,
 * а сервер продолжает его начислять (или наоборот).
 *
 * Аудит: 228 из 235 игроков не сделали ни одного тапа. Значит, первые 60 секунд
 * игры не должны содержать ни одного решения, штрафа или таймера длиннее 90 секунд.
 */

import type { PlayerState } from './types';

/** «Новый игрок» — пока не куплено ни одной карточки, не начато ни одной миссии и мало тапов. */
export const ONBOARDING_NEW_PLAYER_CLICK_LIMIT = 5;

/** Уровень, на котором открываются остальные вкладки (locked-подсказка в UI). */
export const ONBOARDING_UNLOCK_LEVEL = 2;

/**
 * Сколько карточек можно купить, оставаясь в гейте. Новичок покупает ОДНУ
 * подсказанную карточку и должен дойти до третьего шага, а не вывалиться в
 * 48 карточек сразу; после второй покупки гейт снимается сам.
 */
export const ONBOARDING_MAX_CARDS_WHILE_GATED = 1;

/** Максимальная длительность первого контракта: новичок должен увидеть награду. */
export const STARTER_MISSION_MAX_SECONDS = 90;

/**
 * v5.7: подписи шагов для геймплея v3 (GAMEPLAY_V3 + мир). Шаг 1 больше не про
 * тап: игрок выходит на улицу и запускает первый контракт. События воронки при
 * этом НЕ меняются (`first_tap` остаётся флаг-зависимым, `first_move` не тронут).
 */
export const ONBOARDING_STEP_TITLES_V3 = ['Контракт', 'Улучшение', 'Ещё контракт'] as const;

/**
 * Текст шага под геймплей v3: без слов «тап» и «тапни».
 *
 * Шаг 1 — единственный экран, который новичок видит первым, поэтому формулировка
 * снимает обе неясности сразу: ЧТО делать (взять контракт) и ЧТО будет, если
 * закрыть приложение (миссия идёт по реальному времени, награда не сгорит).
 */
export function onboardingStepCopyV3(step: number, seconds: number | null): string {
  if (step <= 1) {
    return 'Выбери первый контракт. Миссия идёт в реальном времени — можно закрыть игру и вернуться позже.';
  }
  if (step === 2) return 'Купи самую дешёвую карточку — она усиливает контракты и открывает новые цели.';
  return seconds === null
    ? 'Запусти короткий контракт — награда придёт меньше чем через две минуты.'
    : `Запусти контракт на ${seconds} секунд — награда придёт почти сразу.`;
}

/** Три шага воронки первого сеанса. */
export const ONBOARDING_STEPS = ['first_tap', 'first_upgrade', 'first_mission_start'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

export interface NewPlayerSnapshot {
  totalCardLevels: number;
  totalMissions: number;
  totalClicks: number;
}

function safeCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

/** Снимок из «сырых» счётчиков: сервер и клиент передают их по-разному. */
export function newPlayerSnapshotFromCounters(
  counters: Pick<NewPlayerSnapshot, 'totalCardLevels' | 'totalMissions' | 'totalClicks'>
): NewPlayerSnapshot {
  return {
    totalCardLevels: safeCount(counters.totalCardLevels),
    totalMissions: safeCount(counters.totalMissions),
    totalClicks: safeCount(counters.totalClicks),
  };
}

/** Снимок счётчиков из PlayerState (клиент). */
export function newPlayerSnapshot(
  source: Pick<PlayerState, 'derived' | 'totalMissions' | 'totalClicks'>
): NewPlayerSnapshot {
  return newPlayerSnapshotFromCounters({
    totalCardLevels: source.derived?.totalCardLevels ?? 0,
    totalMissions: source.totalMissions,
    totalClicks: source.totalClicks,
  });
}

/** «Новый игрок» для показа онбординга. */
export function isNewPlayerSnapshot(snapshot: NewPlayerSnapshot): boolean {
  return (
    snapshot.totalCardLevels === 0 &&
    snapshot.totalMissions === 0 &&
    snapshot.totalClicks < ONBOARDING_NEW_PLAYER_CLICK_LIMIT
  );
}

/**
 * Активен ли гейт первого сеанса: оверлей и locked-вкладки.
 *
 * Шире, чем «новый игрок»: после первой карточки гейт ещё держится, иначе
 * третий шаг (первый контракт) был бы недостижим — игрока выбросило бы в
 * полный интерфейс ровно на середине знакомства.
 */
export function isOnboardingGateActive(snapshot: NewPlayerSnapshot, completed: boolean): boolean {
  if (completed) return false;
  if (snapshot.totalMissions > 0) return false;
  if (snapshot.totalCardLevels > ONBOARDING_MAX_CARDS_WHILE_GATED) return false;
  return true;
}

/**
 * Защита новичка от Киберпатруля. Строже, чем «новый игрок»: снимается ровно
 * в тот момент, когда появляется первая карточка или первая миссия — то есть
 * когда игрок уже понял правила и начал играть.
 */
export function isNewbieProtectionActive(snapshot: NewPlayerSnapshot): boolean {
  return snapshot.totalCardLevels === 0 && snapshot.totalMissions === 0;
}
