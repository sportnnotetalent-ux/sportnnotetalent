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

/** MVP B3 — what the scorer shows for a singles / doubles side instead of
 *  its short code: the player's name, or the pair's first names ("Ravi /
 *  Arjun"; "Ravi K / Ravi S" when the first names match). Undefined for 3+
 *  players or a blank name — the stored side name stays. */
export function entryDisplayName(names: string[]): string | undefined {
  const parts = names.map((n) => tidy(n));
  if (parts.length === 0 || parts.length > 2 || parts.some((n) => !n)) return undefined;
  if (parts.length === 1) return parts[0];
  const w = parts.map((n) => n.split(' '));
  const first = w.map((x) => x[0]);
  if (first[0].toLowerCase() !== first[1].toLowerCase()) return `${first[0]} / ${first[1]}`;
  const withInitial = (x: string[]) => (x.length > 1 ? `${x[0]} ${x[x.length - 1][0].toUpperCase()}` : x[0]);
  return `${withInitial(w[0])} / ${withInitial(w[1])}`;
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

/* ---- Auto-named entries show their players' CURRENT names (2026-11-03) ----
 * A singles / doubles entry's stored name never changes after it is made, so a
 * name taken from somewhere else ("Hrudhay Organizer" — the ACCOUNT name, used
 * while the player list hadn't loaded) or a later rename never reached the
 * cards. docs/security/breaks/entry-current-names.md;
 * tests/entry-current-names.test.mts.
 *
 * The rule — an entry is AUTO-NAMED (its name is just its people) when ALL hold:
 *  1. it is ad hoc (made by the singles / doubles picker or a quick game) —
 *     a real team is never relabelled;
 *  2. its sport is played by individuals ('individual' or 'both') — any team
 *     in a 'team' sport (e.g. "Hrudhay's 5s" in football) keeps its name;
 *  3. its roster is exactly 1 or 2 different player ids;
 *  4. its stored name has the entryName shape: exactly one "/"-separated part
 *     per roster player;
 *  5. each part belongs to its player (parts in roster order, or reversed for
 *     a pair): the part IS the player's current name, or its first word is the
 *     current first word ("Hrudhay Organizer" ↔ "Hrudhay"; "Hrudhay's 5s" is
 *     not "Hrudhay"). When the viewer sees the player masked ("M. R." — a child
 *     outside their circle), a part starting with the same letter counts, so a
 *     child's name the server's trigger missed is masked too, never revealed.
 * Then the name and short code read from the players' current names (as
 * players_view shows them to this viewer). Anything else keeps its name. */

const firstWord = (s: string) => tidy(s).toLowerCase().split(' ')[0] ?? '';
/** players_view shows a child to a stranger as initials ("M. R."). */
export const looksMaskedName = (s: string): boolean => /^([A-Za-z]\.\s*)+$/.test(tidy(s));

const initialsOf = (s: string) => tidy(s).split(' ').filter(Boolean).map((w) => `${w[0]}.`).join(' ').toLowerCase();
/** How well a stored name part fits a player's current name: 0 = not theirs,
 *  2 = the same name (or its masked initials), 1 = same first word / letter. */
function partFit(part: string, current: string): number {
  const p = tidy(part).toLowerCase();
  const c = tidy(current).toLowerCase();
  if (!p || !c) return 0;
  if (p === c) return 2;
  if (looksMaskedName(current)) return initialsOf(p) === c ? 2 : p[0] === c[0] ? 1 : 0;
  return firstWord(p) === firstWord(c) ? 1 : 0;
}

type AutoEntryTeam = {
  name?: string | null; adhoc?: boolean | null; roster?: readonly unknown[] | null;
  kind?: 'team' | 'individual' | 'both' | null;
};
const nameParts = (name: string | null | undefined) => (name ?? '').split('/').map(tidy);

/** Before any name is read: the roster ids an entry COULD be auto-named after
 *  (rules 1–4), or undefined. Cheap — decides which teams need a name read. */
export function autoEntryCandidate(t: AutoEntryTeam): string[] | undefined {
  if (t.adhoc !== true || (t.kind !== 'individual' && t.kind !== 'both')) return undefined;
  const ids = (Array.isArray(t.roster) ? t.roster : []).map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (ids.length < 1 || ids.length > 2 || ids.some((x) => !x) || new Set(ids).size !== ids.length) return undefined;
  const parts = nameParts(t.name);
  if (parts.length !== ids.length || parts.some((p) => !p)) return undefined;
  return ids;
}

/** The players an auto-named entry's name is rebuilt from (rule 5), in the
 *  order its stored name lists them; undefined keeps the stored name. */
export function autoEntryIds(t: AutoEntryTeam, nameOf: (id: string) => string | undefined): string[] | undefined {
  const ids = autoEntryCandidate(t);
  if (!ids) return undefined;
  const current = ids.map((id) => nameOf(id));
  if (current.some((n) => !n || !tidy(n))) return undefined;
  const parts = nameParts(t.name);
  // every part must fit its player; a pair takes the better-fitting order
  // (roster order on a tie — two partners sharing a first name)
  const score = (order: number[]) => {
    const s = order.map((k, i) => partFit(parts[i], current[k]!));
    return s.every((x) => x > 0) ? s.reduce((a, b) => a + b, 0) : 0;
  };
  const fwd = score(ids.map((_, i) => i));
  const rev = ids.length === 2 ? score([1, 0]) : 0;
  if (!fwd && !rev) return undefined;
  return rev > fwd ? [ids[1], ids[0]] : ids;
}

/** An entry's short code follows its players' current names only when the
 *  stored code is the one made from its stored name (a chosen code stays). */
export function shortCodeIsAuto(storedName: string, storedShort: string | null | undefined): boolean {
  if (!storedShort) return true;
  return storedShort.toUpperCase() === entryShortName(nameParts(storedName));
}

/** "Me" as an entrant: the name on my PLAYER profile (players_view) — never the
 *  account name, which can differ (an old sign-up name) and would stay on the
 *  entry for good. The account name only when the player has no name. */
export function meEntrantName(playerName: string | null | undefined, accountName: string | null | undefined): string | undefined {
  const p = tidy(playerName ?? '');
  if (p) return p;
  const a = tidy(accountName ?? '');
  return a || undefined;
}
