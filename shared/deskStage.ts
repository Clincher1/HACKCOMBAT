/** Desk art is cosmetic; stages unlock at these player levels. */
export const DESK_STAGES = [1, 5, 10, 15, 20, 25, 30] as const;
export type DeskStage = (typeof DESK_STAGES)[number];
export function isDeskStage(value: unknown): value is DeskStage {
  return typeof value === 'number' && DESK_STAGES.some((stage) => stage === value);
}
/** Ignore invalid or no-longer-unlocked saved values rather than leaking a future scene. */
export function resolveDeskStage(preference: unknown, unlocked: DeskStage): DeskStage {
  return isDeskStage(preference) && preference <= unlocked ? preference : unlocked;
}
