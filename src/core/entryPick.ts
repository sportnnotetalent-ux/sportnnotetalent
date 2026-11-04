/** Pick a tournament's players / pairs (founder 2026-11-06,
 *  docs/security/breaks/pick-tournament-players.md): an entry is its people
 *  (one, or a pair in any order); nobody is in two entries. Pure. */
type Slot = { kind: 'person'; person: { id: string; fullName: string } } | { kind: 'name'; name: string };

const nameOf = (s: Slot) => (s.kind === 'person' ? s.person.fullName : s.name.trim().replace(/\s+/g, ' '));
const keyOf = (s: Slot) => (s.kind === 'person' ? `p:${s.person.id}` : `n:${s.name.trim().replace(/\s+/g, ' ').toLowerCase()}`);

/** The entry's identity: its people, sorted. */
export const entryKey = (slots: readonly Slot[]): string => slots.map(keyOf).sort().join('|');

/** Why these people can't be entered (already in, alone or in a pair), or null. */
export function entryClash(entries: readonly (readonly Slot[])[], slots: readonly Slot[]): string | null {
  const k = entryKey(slots);
  if (slots.length > 1 && entries.some((e) => entryKey(e) === k)) return 'That pair is already in.';
  // name them as they were entered
  const taken = new Map(entries.flatMap((e) => e.map((s) => [keyOf(s), nameOf(s)] as const)));
  const dup = slots.find((s) => taken.has(keyOf(s)));
  return dup ? `${taken.get(keyOf(dup))} is already in.` : null;
}
