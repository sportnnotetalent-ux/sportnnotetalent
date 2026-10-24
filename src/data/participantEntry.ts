/** Who's on an individual-sport side — a singles player or a doubles pair (also
 *  an Americano field, a golf group) — as REAL people: player ids, so the match
 *  is "mine" for each of them (getMyScope reads team rosters) and their results
 *  land on ONE profile. A typed name that links to no one is the last resort,
 *  kept apart and clearly marked.
 *
 *  Pure (no React Native) — tests/participant-entry.test.mts. */

/** A person picked for a spot (already on SportnNote, or just added and invited
 *  by their mobile number — a pending player they claim by signing up with it). */
export interface EntrantPerson { id: string; fullName: string }

/** One spot on a side: a picked person (linked), or — the last resort — just a
 *  typed name (a provisional player that isn't linked to anyone's account). */
export type EntrantSlot =
  | { kind: 'person'; person: EntrantPerson }
  | { kind: 'name'; name: string };

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

/** The name shown for a spot. */
export const slotName = (s: EntrantSlot): string => tidy(s.kind === 'person' ? s.person.fullName : s.name);
/** The player id of a linked spot (none for a name-only one). */
export const slotId = (s?: EntrantSlot | null): string | undefined => (s?.kind === 'person' ? s.person.id : undefined);
/** Is every spot a linked person? */
export const allLinked = (slots: (EntrantSlot | null | undefined)[]): boolean =>
  slots.length > 0 && slots.every((s) => s?.kind === 'person');

/** People already used on this side, so a picker never offers them twice. */
export const takenIds = (slots: (EntrantSlot | null | undefined)[]): string[] =>
  slots.map(slotId).filter((x): x is string => !!x);

/** The side's name: "Asha Rao" (singles) or "Asha Rao / Ben Lee" (a pair). */
export function entryName(names: string[]): string {
  return names.map(tidy).filter(Boolean).join(' / ');
}

/** entry_names (migration 20261024160000): an entry's stored name masks a
 *  child's full name, so the app rebuilds it from the entry's players as the
 *  viewer may see them (players_view). Undefined while any player is unknown —
 *  then the stored (masked) name stays. */
export function entryNameFromPlayers(ids: readonly string[], nameOf: (id: string) => string | undefined): string | undefined {
  if (!ids.length) return undefined;
  const names = ids.map((id) => nameOf(id));
  return names.every((n): n is string => !!n && !!n.trim()) ? entryName(names) : undefined;
}

/** A short code (2–4 characters) for the side: initials of a singles player
 *  ("Asha Rao" → "AR"), each partner's first initial + surname initial for a
 *  pair ("Asha Rao / Ben Lee" → "ARBL"), else the name's own letters. */
export function entryShortName(names: string[]): string {
  const parts = names.map(tidy).filter(Boolean);
  const initials = (n: string) => {
    const w = n.split(' ').filter(Boolean);
    return (w.length > 1 ? `${w[0][0]}${w[w.length - 1][0]}` : w[0]?.[0] ?? '').toUpperCase();
  };
  const code = parts.map(initials).join('').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (code.length >= 2) return code.slice(0, 4);
  const letters = parts.join('').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (letters || 'PL').slice(0, 4).padEnd(2, 'X');
}

/** The existing side whose roster is exactly these people (any order) — so
 *  picking the same player or pair again reuses their entry (one record of
 *  their results) instead of a duplicate team. */
export function findEntryFor<T extends { id: string; roster?: string[] | null }>(teams: T[], ids: string[]): T | undefined {
  const want = [...new Set(ids.filter(Boolean))].sort();
  if (!want.length || want.length !== ids.length) return undefined;
  return teams.find((t) => {
    const r = [...new Set(t.roster ?? [])].sort();
    return r.length === want.length && r.every((x, i) => x === want[i]);
  });
}

/** What still stops this side from being added, or null when it's ready. */
export function entrantProblem(slots: (EntrantSlot | null | undefined)[], count: number): string | null {
  const filled = slots.filter((s): s is EntrantSlot => !!s && !!slotName(s));
  if (filled.length < count) return count === 2 ? 'Pick both partners.' : 'Pick the player.';
  const ids = takenIds(filled);
  if (new Set(ids).size !== ids.length) return 'Pick two different players.';
  return null;
}
