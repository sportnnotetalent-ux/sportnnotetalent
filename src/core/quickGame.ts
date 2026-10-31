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
