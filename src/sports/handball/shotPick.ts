/**
 * Screen sweep (docs/security/breaks/screen-sweep-court.md H1–H3) — the
 * "From where?" grid on the Goal / Shot flows. A position and "Not sure" take
 * the same step forward (a goal → who scored, a shot → saved / missed /
 * blocked); "Not sure" logs `shotType: 'unknown'`, which the reducer stores as
 * `unsure: true` with no position. PURE.
 */
import { SHOT_LABEL, SHOT_TYPES, UNSURE_SHOT, type ShotType } from './engine.ts';

/** a position from the grid, or "Not sure" (no 9 m guess) */
export type ShotPick = ShotType | typeof UNSURE_SHOT;

/** the field positions offered on the grid (a 7 m has its own button) */
export const FIELD_TYPES: ShotType[] = SHOT_TYPES.filter((t) => t !== 'sevenM');

/** Screen sweep H3 — the grid's buttons: two a row (a third of a 375-px
 *  panel, ~95 px, is too narrow for "Breakthrough" plus the pill padding). */
export const GRID_BTN = { flexBasis: '45%', flexGrow: 1, paddingHorizontal: 8 } as const;

export const pickLabel = (t?: ShotPick): string => (t === UNSURE_SHOT ? 'position not sure' : SHOT_LABEL[t ?? 'nineM']);

/** The flow after a grid pick — the same step for a position and "Not sure". */
export function afterPosition<F extends { mode: 'goal' | 'shot'; step: string; shotType?: ShotPick }>(flow: F, t: ShotPick): F {
  return { ...flow, shotType: t, step: flow.mode === 'goal' ? 'scorer' : 'result' } as F;
}
