/** Home, Stitch picks 12–16 (docs/security/breaks/stitch-home.md). Pure. */
import type { SportId } from './types';

type FeedMatch = { status: string; startsAt?: string; tournamentId?: string };
const WEEK = 7 * 24 * 3600_000;

/** HM2: "3 matches this week · 2 active tournaments" — or null when both are zero. */
export function weekLine(feed: readonly FeedMatch[], now: number): string | null {
  const coming = feed.filter((m) => {
    if (m.status === 'live') return true;
    if (m.status !== 'scheduled' || !m.startsAt) return false;
    const t = Date.parse(m.startsAt);
    return t >= now && t <= now + WEEK;
  });
  const active = new Set(feed.filter((m) => m.tournamentId && (m.status === 'live' || (m.status === 'scheduled' && m.startsAt && Date.parse(m.startsAt) >= now))).map((m) => m.tournamentId!));
  const parts: string[] = [];
  if (coming.length) parts.push(`${coming.length} match${coming.length === 1 ? '' : 'es'} this week`);
  if (active.size) parts.push(`${active.size} active tournament${active.size === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : null;
}

/** HM3: up to three sport chips in the hero, then "+N". */
export function heroSportChips(sports: readonly SportId[]): { shown: SportId[]; more: number } {
  return { shown: sports.slice(0, 3), more: Math.max(0, sports.length - 3) };
}

/** HM4: % of the fixtures played (cancelled ones don't count), or null without fixtures. */
export function scheduleProgress(matches: readonly { status: string }[]): number | null {
  const live = matches.filter((m) => m.status !== 'cancelled');
  if (!live.length) return null;
  return Math.round((live.filter((m) => m.status === 'completed').length / live.length) * 100);
}

/** HM9/HM10 (round 2): "Ready to play, Aarav?" on one line — the signed-in
 *  user's own first name; a very long one is left out. */
export function heroGreeting(fullName?: string | null): { lead: string; accent: string } {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  return { lead: 'Ready to ', accent: first && first.length <= 12 ? `play, ${first}?` : 'play?' };
}

/** HM9: the display size that keeps the greeting on one line in `width`
 *  points (the condensed italic face runs ~0.55 em a letter), 26–44. */
export function heroFontSize(text: string, width: number): number {
  if (width <= 0) return 44;
  return Math.max(26, Math.min(44, Math.floor(width / (text.length * 0.55))));
}

/** HM11/HM12 (round 2): the "Your tournaments" cards — real counts, at most 10. */
export function tournamentCards<T extends { id: string; sports: readonly string[] }>(
  tournaments: readonly T[],
  feed: readonly { tournamentId?: string; status: string; homeTeam: { id: string }; awayTeam: { id: string } }[],
): { tournament: T; sports: number; teams: number; pct: number | null }[] {
  return tournaments.slice(0, 10).map((t) => {
    const ms = feed.filter((m) => m.tournamentId === t.id);
    const teams = new Set(ms.filter((m) => m.status !== 'cancelled').flatMap((m) => [m.homeTeam.id, m.awayTeam.id]));
    return { tournament: t, sports: t.sports.length, teams: teams.size, pct: scheduleProgress(ms) };
  });
}

/** HM13/HM14 (round 3): more than 4 sports fold into one "Your sports" row —
 *  the first 3 names, then "+N more" — in the grid's own order. */
export function sportsSummary(sports: readonly SportId[]): { folded: boolean; names: SportId[]; more: number } {
  if (sports.length <= 4) return { folded: false, names: [...sports], more: 0 };
  return { folded: true, names: sports.slice(0, 3), more: sports.length - 3 };
}
