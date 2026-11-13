export const NEW_YEAR_CANDY_KEY = 'reward:new_year_candy';
export const NEW_YEAR_CANDY_MAX_USES = 3;
export const NEW_YEAR_CANDY_DURATION_MS = 60 * 60 * 1000;

export interface NewYearCandyState {
  usesRemaining: number;
  boostUntil: string | null;
}

/** The boost applies only to manual taps; passive income and offline taps stay unchanged. */
export function getManualTapMultiplier(candy: NewYearCandyState | undefined, nowMs: number): number {
  const until = candy?.boostUntil ? Date.parse(candy.boostUntil) : NaN;
  return Number.isFinite(until) && nowMs < until ? 2 : 1;
}
