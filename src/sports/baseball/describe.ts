/**
 * Baseball's "Fielders?" describe card (docs/security/breaks/describe-us.md):
 * the out is recorded at the tap; its fielders ("6-3") are noted after
 * (`FIELDERS`, keyed to the play). The card closes once its play is gone
 * (Undo / Remove) or a newer play is logged — a tap or voice. PURE.
 */
import type { BaseballState } from './engine.ts';

/** DU3 / DU9: the fielded out is gone, or a newer play is on the board. An
 *  earned-run correction (`er`) is not a play. */
export function fieldersStale(s: Pick<BaseballState, 'events'>, ref: string): boolean {
  const i = s.events.findIndex((e) => e.id === ref);
  if (i < 0) return true;
  return s.events.slice(i + 1).some((e) => e.type !== 'er');
}
