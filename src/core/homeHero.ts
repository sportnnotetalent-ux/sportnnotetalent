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
