/**
 * Pairs are teams (founder 2026-11-05, docs/security/breaks/pairs-and-my-teams.md).
 * A pair is two people: every side whose roster is exactly them — in any sport,
 * duplicates included — is the same pair. Its record and stats count only the
 * games those two played together, like a player profile. Also: My teams lists
 * the teams I'm part of (on the squad, or played for); teams I only run sit
 * apart. PURE.
 */
import type { SportId } from './types';

/** The pair's key: its two different people, sorted — or null. */
export function pairKey(roster: readonly (string | null | undefined)[] | null | undefined): string | null {
  const ids = [...new Set((roster ?? []).filter((x): x is string => !!x))];
  if (ids.length !== 2 || (roster ?? []).length !== 2) return null;
  return ids.sort().join('|');
}

export interface PairTeam { key: string; a: string; b: string; teamIds: string[]; sports: SportId[] }

type Row = { id: string; sport: SportId; roster?: readonly string[] | null; adhoc?: boolean | null };

/** Sports played by individuals or pairs (not team sports) — the app passes the
 *  sport settings' check; a two-person football side is never a pair (PT4b). */
export type PairSport = (sport: string) => boolean;

/** Every pair among one-off sides (all of them, or those with `player`), one per key. */
export function pairsFromTeams(rows: readonly Row[], player?: string | null, pairSport: PairSport = () => true): PairTeam[] {
  const by = new Map<string, PairTeam>();
  for (const r of rows) {
    if (!r.adhoc || !pairSport(r.sport)) continue;
    const key = pairKey(r.roster);
    if (!key) continue;
    const [a, b] = key.split('|');
    if (player !== undefined && player !== a && player !== b) continue;
    const p = by.get(key) ?? { key, a, b, teamIds: [], sports: [] };
    if (!p.teamIds.includes(r.id)) p.teamIds.push(r.id);
    if (!p.sports.includes(r.sport)) p.sports.push(r.sport);
    by.set(key, p);
  }
  return [...by.values()].sort((x, y) => x.key.localeCompare(y.key));
}

export interface Record3 { played: number; won: number; drawn: number; lost: number }
type MatchLike = { id: string; sport: string; status: string; startsAt?: string; winner?: 'home' | 'away' | 'draw' | null; homeTeam?: { id?: string } | null; awayTeam?: { id?: string } | null };

const blank = (): Record3 => ({ played: 0, won: 0, drawn: 0, lost: 0 });
const pct = (r: Record3) => (r.played ? Math.round((r.won / r.played) * 100) : 0);

/** The pair's record from its games: finished ones count; every one is listed (newest first). */
export function pairRecord(teamIds: ReadonlySet<string>, matches: readonly (MatchLike | null | undefined)[]) {
  const overall = blank();
  const bySport = new Map<string, Record3>();
  const mine: MatchLike[] = [];
  for (const m of matches) {
    if (!m) continue;
    const home = !!m.homeTeam?.id && teamIds.has(m.homeTeam.id);
    const away = !!m.awayTeam?.id && teamIds.has(m.awayTeam.id);
    if (home === away) continue; // not theirs (or, impossibly, both sides)
    mine.push(m);
    if (m.status !== 'completed') continue;
    const s = bySport.get(m.sport) ?? blank();
    for (const r of [overall, s]) {
      r.played++;
      if (m.winner === 'draw' || !m.winner) r.drawn++;
      else if ((m.winner === 'home') === home) r.won++;
      else r.lost++;
    }
    bySport.set(m.sport, s);
  }
  const time = (m: MatchLike) => { const n = Date.parse(m.startsAt ?? ''); return Number.isFinite(n) ? n : 0; };
  return {
    overall: { ...overall, winPct: pct(overall) },
    bySport: [...bySport.entries()].map(([sport, r]) => ({ sport, ...r, winPct: pct(r) }))
      .sort((x, y) => y.played - x.played || y.won - x.won),
    matchIds: mine.sort((x, y) => time(y) - time(x)).map((m) => m.id),
  };
}

/** The two players' numbers from the pair's games, summed per sport. */
export function pairStats(
  lines: readonly { matchId: string; playerId: string; sport: string; stats: Record<string, number> }[],
  players: readonly [string, string] | readonly string[],
  matchIds: ReadonlySet<string>,
): Record<string, Record<string, number>> {
  const who = new Set(players);
  const out: Record<string, Record<string, number>> = {};
  for (const l of lines) {
    if (!who.has(l.playerId) || !matchIds.has(l.matchId)) continue;
    const s = (out[l.sport] ??= {});
    for (const [k, v] of Object.entries(l.stats ?? {})) if (typeof v === 'number' && Number.isFinite(v)) s[k] = (s[k] ?? 0) + v;
  }
  return out;
}

type TeamLike = Row & { name: string; clubId?: string | null };

/** My teams: single-sport teams I'm on or played for; ones I only run; my pairs. */
export function myTeamsView<T extends TeamLike>(o: {
  me: string | null | undefined;
  teams: readonly T[];
  playingIds: ReadonlySet<string>;
  playedIds: ReadonlySet<string>;
  managedIds: ReadonlySet<string>;
  pairSport?: PairSport;
}) {
  const plain = o.teams.filter((t) => !t.adhoc && !t.clubId);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const playFor = plain.filter((t) => o.playingIds.has(t.id) || o.playedIds.has(t.id)).sort(byName);
  const on = new Set(playFor.map((t) => t.id));
  const run = plain.filter((t) => !on.has(t.id) && o.managedIds.has(t.id)).sort(byName);
  return { playFor, run, pairs: o.me ? pairsFromTeams(o.teams, o.me, o.pairSport) : [] };
}
