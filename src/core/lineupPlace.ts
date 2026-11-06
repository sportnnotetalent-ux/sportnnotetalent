/** Shared by the matchday-squad screen and match setup's "Who's playing"
 *  (reference-video C3): place chosen starters into a side's pitch positions. */
import type { LineupSlot } from './types';

/** Merge a chosen set of starters into a side's positional slots without losing
 *  hand-placed positions: keep placed players who are still starting, drop those
 *  no longer starting, then fill the empty slots (in order) with the rest. */
export function reconcilePositions(
  starters: string[],
  existing: LineupSlot[],
  fresh: LineupSlot[],
  nameOf: (id: string) => string | undefined,
): LineupSlot[] {
  const base = existing.length ? existing : fresh;
  const slots = base.map((s) => ({ ...s }));
  for (const s of slots) {
    if (s.playerId && !starters.includes(s.playerId)) { s.playerId = undefined; s.playerName = undefined; }
  }
  const placed = new Set(slots.map((s) => s.playerId).filter(Boolean) as string[]);
  const queue = starters.filter((id) => !placed.has(id));
  let qi = 0;
  for (const s of slots) {
    if (!s.playerId && qi < queue.length) { const id = queue[qi++]; s.playerId = id; s.playerName = nameOf(id); }
  }
  return slots;
}
