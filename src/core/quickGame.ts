/**
 * Quick game (MVP, founder 2026-10-31): start a friendly in a few taps. The
 * sport is already picked, and a side left empty starts with a plain name.
 * Tests: tests/quick-game.test.mts.
 */

export type ParticipantMode = 'team' | 'individual' | 'pairs';

/** Where the last friendly's sport is remembered on this device. */
export const LAST_SPORT_KEY = 'sn.friendly.lastSport';

const NOUN: Record<ParticipantMode, string> = { team: 'Team', individual: 'Player', pairs: 'Pair' };

export const quickSideName = (mode: ParticipantMode, side: 'home' | 'away'): string => `${NOUN[mode]} ${side === 'home' ? 'A' : 'B'}`;
export const quickSideShort = (side: 'home' | 'away'): string => (side === 'home' ? 'A' : 'B');

/** The sport a new friendly opens with: the last one used here, else the
 *  first from the first-run questions; null leaves the picker empty. */
export function startSport(o: { last: string | null; mine: readonly string[]; known: readonly string[] }): string | null {
  if (o.last && o.known.includes(o.last)) return o.last;
  return o.mine.find((s) => o.known.includes(s)) ?? null;
}

/** MVP QG-01 — a side a quick game made and nobody touched since ("Team A",
 *  "Player B", "Pair A"…): kept out of the team pickers so they don't fill
 *  with copies. A renamed side or a real team is never hidden. */
export const isQuickPlaceholder = (t: { name: string; adhoc?: boolean }): boolean =>
  t.adhoc === true && /^(Team|Player|Pair) [AB]$/.test(t.name.trim());
