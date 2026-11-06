/**
 * Match setup, picking a team (docs/design/reference-video, C1): before you
 * type, show "Your teams" (teams you're on, in this sport) and "Played before"
 * (teams from your own matches in this sport: ones you played in, hosted or
 * scored), newest first. Only teams from your own games appear, never anyone
 * else's.
 */
interface SugTeam { id: string; name?: string; sport?: string; roster?: readonly string[] }
interface SugMatch {
  sport: string;
  startsAt?: string | null;
  homeTeam?: { id?: string; name?: string } | null;
  awayTeam?: { id?: string; name?: string } | null;
  hostIds?: readonly string[] | null;
  scorerIds?: readonly string[] | null;
}

export const SUGGEST_MAX = 6;

export function teamSuggestions<T extends SugTeam>(o: {
  teams: readonly T[];
  matches: readonly SugMatch[];
  sport: string;
  me: string | null | undefined;
  exclude?: string | null;
  max?: number;
}): { yours: T[]; before: T[] } {
  const { me, exclude, max = SUGGEST_MAX } = o;
  if (!me) return { yours: [], before: [] };
  const inSport = o.teams.filter((t) => !t.sport || t.sport === o.sport);
  const byId = new Map(inSport.map((t) => [t.id, t] as const));
  // A match can carry its own copy of a team under another id (the fixture
  // generator met the same): fall back to the same name in this sport.
  const byName = new Map(inSport.filter((t) => t.name).map((t) => [t.name!.trim().toLowerCase(), t] as const));
  const find = (side?: { id?: string; name?: string } | null) =>
    (side?.id ? byId.get(side.id) : undefined) ?? (side?.name ? byName.get(side.name.trim().toLowerCase()) : undefined);
  const isMine = (t: T | undefined) => !!t && (t.roster ?? []).includes(me);
  const yours = inSport.filter((t) => isMine(t) && t.id !== exclude).slice(0, max);
  const shown = new Set(yours.map((t) => t.id));
  const time = (m: SugMatch) => { const n = Date.parse(m.startsAt ?? ''); return Number.isFinite(n) ? n : 0; };
  const before: T[] = [];
  const ms = o.matches.filter((m) => m.sport === o.sport).sort((a, b) => time(b) - time(a));
  for (const m of ms) {
    if (before.length >= max) break;
    const h = find(m.homeTeam);
    const a = find(m.awayTeam);
    const ran = !!m.hostIds?.includes(me) || !!m.scorerIds?.includes(me);
    if (!ran && !isMine(h) && !isMine(a)) continue;
    for (const t of [h, a]) {
      if (!t || shown.has(t.id) || t.id === exclude || before.length >= max) continue;
      shown.add(t.id);
      before.push(t);
    }
  }
  return { yours, before };
}

/** The muted line under a suggested team: how many players, never a name. */
export function teamDetail(t: { roster?: readonly string[] }): string {
  const n = t.roster?.length ?? 0;
  return n ? `${n} player${n === 1 ? '' : 's'}` : '';
}
