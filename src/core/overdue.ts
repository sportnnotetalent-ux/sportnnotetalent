/** Overdue games (founder 2026-11-05, docs/security/breaks/overdue-games.md): a
 *  SCHEDULED game more than 12 hours past its start was never played, moved or
 *  cancelled. Forward-looking lists (Home's "Up next") leave it out; Matches
 *  lists it apart so its host can play, reschedule or cancel it. Same window as
 *  an idle live game (core/staleLive). Pure. */
export const OVERDUE_MS = 12 * 60 * 60 * 1000;

export function isOverdue(m: { status: string; startsAt?: string }, now: number = Date.now()): boolean {
  if (m.status !== 'scheduled' || !m.startsAt) return false;
  const t = Date.parse(m.startsAt);
  return Number.isFinite(t) && now - t > OVERDUE_MS;
}

/** Upcoming (order kept) and overdue (most recently missed first). */
export function splitOverdue<T extends { status: string; startsAt: string }>(list: readonly T[], now: number = Date.now()) {
  const upcoming: T[] = [], overdue: T[] = [];
  for (const m of list) (isOverdue(m, now) ? overdue : upcoming).push(m);
  overdue.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, overdue };
}

/** The line an overdue card shows. */
export const OVERDUE_NOTE = 'Date passed · not played yet — open it to play, reschedule or cancel';
