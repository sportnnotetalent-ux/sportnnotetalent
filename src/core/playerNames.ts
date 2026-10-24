/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md, founder 2026-10-24).
 * Scoring data (match state, events) is public — logged out included — so it
 * keeps player IDs, never names. Names are looked up when they're shown, from
 * players the viewer loaded through the privacy-protected players_view: the
 * child's circle gets full names, everyone else initials, an open dispute "X".
 *
 * Pure (node tests load it). React screens get a NameOf from useMask()
 * (core/disputeMask.tsx); pure builders (feeds, box scores, tickers, records)
 * take one as an argument.
 */

/** A player's display name for this viewer. `legacyName` is the name an older
 *  log stored (before IDs-only) — used only when the id can't be resolved. */
export type NameOf = (id: string | null | undefined, legacyName?: string | null) => string;

export const FALLBACK_NAME = 'Player';
/** An open participation dispute hides the player as "X" (core/disputeMask). */
export const MASK = 'X';

/** What a name lookup can be built from: any players_view-backed Player. */
export interface NameSource { id: string; fullName: string }

/** id → name from the given lists; an earlier list wins (pass the match's own
 *  rosters before wider lists such as every player). */
export function peopleMap(...lists: readonly (readonly NameSource[] | null | undefined)[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const list of lists) {
    for (const p of list ?? []) {
      const name = (p.fullName ?? '').trim();
      if (p.id && name && !out.has(p.id)) out.set(p.id, name);
    }
  }
  return out;
}

/** The lookup: an open dispute masks (by id, or by the stored legacy name) →
 *  the viewer's name for the id → the legacy stored name → "Player". */
export function makeNameOf(
  people: ReadonlyMap<string, string>,
  mask?: { ids?: ReadonlySet<string>; names?: ReadonlySet<string> },
): NameOf {
  return (id, legacyName) => {
    if (id && mask?.ids?.has(id)) return MASK;
    const legacy = (legacyName ?? '').trim();
    if (legacy && mask?.names?.has(legacy)) return MASK;
    return (id && people.get(id)) || legacy || FALLBACK_NAME;
  };
}

/** No lookup available (no provider / a pure caller that wasn't given one):
 *  the stored name if there is one, else "Player". Same as before IDs-only. */
export const legacyNameOf: NameOf = (_id, legacyName) => (legacyName ?? '').trim() || FALLBACK_NAME;

/** "Meera Rao" → "M. R." — the same as the database's name_initials(), so a
 *  name masked on the server and one masked here read alike. */
export function nameInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => `${w[0]!.toUpperCase()}.`).join(' ') : FALLBACK_NAME;
}

/** The name for something that reaches people OUTSIDE the player's circle (a
 *  follower alert, a public card): an adult by name; a possible minor — under
 *  18, or no age known — by initials, as players_view shows them publicly. */
export function publicName(p: { fullName: string; age?: number }): string {
  return p.age !== undefined && p.age >= 18 ? p.fullName.trim() || FALLBACK_NAME : nameInitials(p.fullName);
}
