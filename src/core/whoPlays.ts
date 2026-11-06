/**
 * "Who's playing" at match setup (reference-video C3): pick the starting
 * players for a side before the match exists. It's saved as that side's
 * matchday squad as soon as the match is created.
 * `ok(id)` = this player may play here: eligible, not picked for the other
 * side.
 */
export function togglePick(picked: readonly string[], id: string, cap: number, ok: (id: string) => boolean): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  if (!ok(id) || picked.length >= cap) return [...picked];
  return [...picked, id];
}

/** Last match's players, as many as are still in the team, allowed, and fit. */
export function copyLast(last: readonly string[], roster: readonly string[], cap: number, ok: (id: string) => boolean): string[] {
  const inTeam = new Set(roster);
  const out: string[] = [];
  for (const id of last) {
    if (out.length >= cap) break;
    if (inTeam.has(id) && ok(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
