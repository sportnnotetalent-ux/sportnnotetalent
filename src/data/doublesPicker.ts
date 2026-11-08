/** Schedule Match's side pickers for singles and doubles
 *  (docs/security/breaks/doubles-picker.md): doubles lists only real pairs
 *  (a roster of exactly two different people), singles only one-person
 *  entries; recent pairs are the ones this user played in or hosted.
 *
 *  PURE (no React Native) — tests/doubles-picker.test.mts. */

type Entry = { id: string; name: string; roster?: readonly string[] | null };

/** A real pair: exactly two different people on the roster. */
export const isPair = (t: Entry): boolean => {
  const r = t.roster ?? [];
  return r.length === 2 && !!r[0] && !!r[1] && r[0] !== r[1];
};

/** A one-person entry. An old entry with no roster counts unless its name
 *  reads as a pair ("A / B"). */
export const isSingle = (t: Entry): boolean => {
  const r = t.roster ?? [];
  if (r.length) return r.length === 1 && !!r[0];
  return !t.name.includes(' / ');
};

/** team-doubles-setup.md TD2: a doubles side is a TEAM — any squad of two or
 *  more different people (who plays is picked before scoring, core/teamPlay). */
export const isTeamSide = (t: Entry): boolean => {
  const r = (t.roster ?? []).filter(Boolean);
  return r.length >= 2 && new Set(r).size === r.length;
};

/** The entries a singles ('single') or doubles ('pair') side may pick. */
export function sidesForStructure<T extends Entry>(teams: readonly T[], structure: 'single' | 'pair'): T[] {
  return teams.filter(structure === 'pair' ? isTeamSide : isSingle);
}

/** One entry per person (singles) or per pair, in any order (founder
 *  2026-11-04: one player, several one-person entries pointing at him, listed
 *  three times). The first of the duplicates stays; a side already picked for
 *  this match (`keep`) always stays; an entry with no roster is left as it is. */
export function onePerEntrant<T extends Entry>(list: readonly T[], keep: readonly (string | null | undefined)[] = []): T[] {
  const keyOf = (t: T) => (t.roster && t.roster.length ? [...t.roster].sort().join('|') : null);
  const kept = new Set(keep.filter((x): x is string => !!x));
  const claimed = new Map<string, string>();
  for (const t of list) { const k = keyOf(t); if (k && kept.has(t.id)) claimed.set(k, t.id); }
  for (const t of list) { const k = keyOf(t); if (k && !claimed.has(k)) claimed.set(k, t.id); }
  return list.filter((t) => { const k = keyOf(t); return !k || claimed.get(k) === t.id; });
}

const queryOf = (q: string) => q.trim().toLowerCase();

/** Search kicks in at 3+ letters; a plain substring match (no regex). */
export function searchSides<T extends { name: string }>(list: readonly T[], query: string, max = 25): T[] {
  const q = queryOf(query);
  if (q.length < 3 || max <= 0) return [];
  return list.filter((t) => t.name.toLowerCase().includes(q)).slice(0, max);
}

export const searchPeople = <T extends { name: string }>(people: readonly T[], query: string, max = 25): T[] => searchSides(people, query, max);

interface MatchLike {
  sport: string;
  startsAt?: string;
  homeTeam?: { id: string } | null;
  awayTeam?: { id: string } | null;
  hostIds?: readonly string[] | null;
  scorerIds?: readonly string[] | null;
}

/** Up to `max` pairs this user recently played in (on the roster) or hosted /
 *  scored, in this sport, newest match first; then their other pairs. Only
 *  pairs in `pairs` (the pickable ones) — never a single, never `exclude`
 *  (the side already picked on the other side). */
export function recentPairs<T extends Entry>(opts: {
  matches: readonly MatchLike[];
  pairs: readonly T[];
  sport: string;
  me: string | null | undefined;
  exclude?: string | null;
  max?: number;
}): T[] {
  const { me, exclude, max = 6 } = opts;
  if (!me) return [];
  // team-doubles-setup TD2: any team side, as the picker lists
  const byId = new Map(opts.pairs.filter(isTeamSide).map((t) => [t.id, t] as const));
  const mine = (t: T) => (t.roster ?? []).includes(me);
  const out: T[] = [];
  const seen = new Set<string>();
  const add = (t: T | undefined) => {
    if (!t || seen.has(t.id) || t.id === exclude || out.length >= max) return;
    seen.add(t.id);
    out.push(t);
  };
  const time = (m: MatchLike) => { const n = Date.parse(m.startsAt ?? ''); return Number.isFinite(n) ? n : 0; };
  const ms = opts.matches.filter((m) => m.sport === opts.sport).slice().sort((a, b) => time(b) - time(a));
  for (const m of ms) {
    const hosted = !!m.hostIds?.includes(me) || !!m.scorerIds?.includes(me);
    for (const id of [m.homeTeam?.id, m.awayTeam?.id]) {
      const t = id ? byId.get(id) : undefined;
      if (t && (hosted || mine(t))) add(t);
    }
  }
  for (const t of byId.values()) if (mine(t)) add(t);
  return out;
}
