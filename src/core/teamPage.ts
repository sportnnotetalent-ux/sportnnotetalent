/**
 * One team page wherever it's opened (founder 2026-11-05,
 * docs/security/breaks/one-team-page.md). A club's sport row opens the club's
 * team page; its sports open the per-sport view inside it (never redirected
 * again). Discover leaves out one-off sides and shows a club once. PURE.
 */
import type { SportId } from './types';

type Row = { id: string; clubId?: string | null; adhoc?: boolean | null; sport?: SportId | string; roster?: readonly string[] | null };

export type TeamRoute = { route: 'ClubHome'; clubId: string; sport?: string } | { route: 'Team' };

/** Where a team row opens: its club's page, or the single-team page. */
export function teamRoute(row: Row | null | undefined, opts: { inClub?: boolean; pairSport?: (sport: string) => boolean } = {}): TeamRoute {
  if (!row) return { route: 'Team' };
  // team-pages.md PG1 (teams for doubles): a doubles side is a team — its own page,
  // or its club's page when it belongs to one (one team, any sport); no "Pair" page.
  if (!row.clubId || opts.inClub) return { route: 'Team' };
  return { route: 'ClubHome', clubId: row.clubId, ...(row.sport ? { sport: String(row.sport) } : {}) };
}

/** A squad: the picked roster, else the derived squad, else the club's members. */
export function squadIds(
  roster: readonly string[] | null | undefined,
  derived: readonly string[] | null | undefined,
  clubMembers: readonly string[] | null | undefined,
): string[] {
  for (const list of [roster, derived, clubMembers]) {
    if (list && list.length) return [...new Set(list)];
  }
  return [];
}

export interface DiscoverTeam { id: string; name: string; colorHex?: string; sports: SportId[]; teamIds: string[]; clubId?: string }

/** Discover's team list: no one-off sides, one entry per club (its sports merged). */
export function discoverTeams(
  summaries: readonly { id: string; name: string; colorHex?: string; sports: SportId[] }[],
  rows: readonly Row[],
): DiscoverTeam[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: DiscoverTeam[] = [];
  const clubs = new Map<string, DiscoverTeam>();
  for (const s of summaries) {
    const r = byId.get(s.id);
    if (r?.adhoc) continue;
    const clubId = r?.clubId ?? undefined;
    if (clubId) {
      const hit = clubs.get(clubId);
      if (hit) {
        for (const sp of s.sports) if (!hit.sports.includes(sp)) hit.sports.push(sp);
        if (!hit.teamIds.includes(s.id)) hit.teamIds.push(s.id);
        continue;
      }
      const t: DiscoverTeam = { id: s.id, name: s.name, colorHex: s.colorHex, sports: [...s.sports], teamIds: [s.id], clubId };
      clubs.set(clubId, t);
      out.push(t);
      continue;
    }
    out.push({ id: s.id, name: s.name, colorHex: s.colorHex, sports: [...s.sports], teamIds: [s.id], clubId: undefined });
  }
  return out;
}

/** Following a club = following all its sport rows. */
export function clubFollow(rowIds: readonly string[], isFollowing: (id: string) => boolean) {
  const ids = [...new Set(rowIds)];
  const following = ids.length > 0 && ids.every(isFollowing);
  return {
    following,
    toFollow: following ? [] : ids.filter((id) => !isFollowing(id)),
    toUnfollow: following ? ids : [],
  };
}

/** Team rows (with their sport) → one entry per club, others as they are. */
export function collapseClubs(rows: readonly { id: string; name: string; colorHex?: string; sport: SportId; clubId?: string | null }[]): DiscoverTeam[] {
  const out: DiscoverTeam[] = [];
  const clubs = new Map<string, DiscoverTeam>();
  for (const r of rows) {
    if (r.clubId) {
      const hit = clubs.get(r.clubId);
      if (hit) {
        if (!hit.sports.includes(r.sport)) hit.sports.push(r.sport);
        if (!hit.teamIds.includes(r.id)) hit.teamIds.push(r.id);
        continue;
      }
      const t: DiscoverTeam = { id: r.id, name: r.name, colorHex: r.colorHex, sports: [r.sport], teamIds: [r.id], clubId: r.clubId };
      clubs.set(r.clubId, t);
      out.push(t);
    } else {
      out.push({ id: r.id, name: r.name, colorHex: r.colorHex, sports: [r.sport], teamIds: [r.id] });
    }
  }
  return out;
}

/** DR1 (demo-recording-bugs.md): a squad in the team's own order — the order
 *  it was set up in, so a pair keeps "Meera / Arjun". Anyone not in `ids`
 *  keeps their place after; an id that couldn't be read is skipped. */
export function inRosterOrder<T extends { id: string }>(players: readonly T[], ids: readonly string[]): T[] {
  const at = new Map(ids.map((id, i) => [id, i] as const));
  return players
    .map((p, i) => ({ p, k: at.has(p.id) ? at.get(p.id)! : ids.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
}

/** PG2 / PG5: where an old "Pair" (a, b) link goes — the two players' club page
 *  (one team, any sport) when one of their teams has a club, else the team with
 *  the smallest id, so the choice never depends on read order; null = no team. */
export function pairTarget(teams: readonly { id: string; clubId?: string | null }[]): { route: 'ClubHome'; clubId: string } | { route: 'Team'; teamId: string } | null {
  if (!teams.length) return null;
  const clubs = teams.map((t) => t.clubId).filter((c): c is string => !!c).sort();
  if (clubs.length) return { route: 'ClubHome', clubId: clubs[0] };
  return { route: 'Team', teamId: [...teams].map((t) => t.id).sort()[0] };
}
