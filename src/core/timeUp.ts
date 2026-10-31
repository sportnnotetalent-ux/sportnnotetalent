/** MVP PD2 — who leads when a racket match stops on time (a court booking ran
 *  out). Pure. Sets (games in badminton / pickleball / squash / TT) first, then
 *  every game (point) played, finished and current; never the live "40" / "Ad".
 *  null = level, or nothing known. */
import type { LineScore } from '../sports/scoreline';

export function timeUpLeader(ls: LineScore | null | undefined): 'home' | 'away' | null {
  if (!ls) return null;
  if (ls.won.home !== ls.won.away) return ls.won.home > ls.won.away ? 'home' : 'away';
  const cells = ls.current ? [...ls.done, ls.current] : ls.done;
  const h = cells.reduce((n, c) => n + c.home, 0);
  const a = cells.reduce((n, c) => n + c.away, 0);
  return h === a ? null : h > a ? 'home' : 'away';
}
