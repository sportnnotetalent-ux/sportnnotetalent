/**
 * Matches tab (founder 2026-11-04): Home may show followed people's games, but
 * Matches shows the games I PLAY in. Games I only host, score or organise sit
 * in a second view, "Running", so I can still reach them. Each game is in one
 * view only (playing wins). A live game idle 12 h+ is not "Live"; it shows
 * under Completed as "Not finished" so its scorer can still end it.
 * Break-it: docs/security/breaks/matches-tab-playing.md. PURE.
 */
import type { Match } from './types';
import { isStaleLive } from './staleLive.ts';
import { splitOverdue } from './overdue.ts';

export type MatchesView = 'playing' | 'running';
export const normalView = (v: unknown): MatchesView => (v === 'running' ? 'running' : 'playing');

type Side = { id?: string; roster?: readonly string[] } | null | undefined;
type M = Pick<Match, 'id' | 'sport' | 'status' | 'startsAt' | 'updatedAt'> & { homeTeam?: Side; awayTeam?: Side };

const onSide = (s: Side, playingTeamIds: ReadonlySet<string>, me: string): boolean =>
  !!s && ((Array.isArray(s.roster) && s.roster.includes(me)) || (!!s.id && playingTeamIds.has(s.id)));

/** I'm on a side: its roster lists me, or it's a team I'm on (roster / team members). */
export function playsIn(m: M, playingTeamIds: ReadonlySet<string>, me: string | null | undefined): boolean {
  if (!me) return false;
  return onSide(m.homeTeam, playingTeamIds, me) || onSide(m.awayTeam, playingTeamIds, me);
}

export function matchesView<T extends M>(
  mine: readonly (T | null | undefined)[],
  o: { playingTeamIds: ReadonlySet<string>; playerId: string | null | undefined; view: MatchesView; sport: string; now: number },
) {
  const inSport = mine.filter((m): m is T => !!m && (o.sport === 'all' || m.sport === o.sport));
  const playing: T[] = [], running: T[] = [];
  for (const m of inSport) (playsIn(m, o.playingTeamIds, o.playerId) ? playing : running).push(m);
  const list = o.view === 'running' ? running : playing;
  const byStart = (a: T, b: T) => a.startsAt.localeCompare(b.startsAt);
  const isLive = (m: T) => m.status === 'live';
  const live = list.filter((m) => isLive(m) && !isStaleLive(m, o.now)).sort(byStart);
  const notFinished = list.filter((m) => isLive(m) && isStaleLive(m, o.now)).sort((a, b) => byStart(b, a));
  // Postponed / cancelled are still pre-match: they stay under Upcoming (badged).
  // A scheduled game 12 h+ past its start is overdue: listed apart, never dropped (OD2/OD7).
  const { upcoming, overdue } = splitOverdue(list.filter((m) => m.status === 'scheduled' || m.status === 'postponed' || m.status === 'cancelled').sort(byStart), o.now);
  const completed = list.filter((m) => m.status === 'completed').sort((a, b) => byStart(b, a));
  return {
    live, upcoming, overdue, completed, notFinished,
    counts: { playing: playing.length, running: running.length },
    tabCounts: { live: live.length, upcoming: upcoming.length + overdue.length, completed: completed.length + notFinished.length },
  };
}
