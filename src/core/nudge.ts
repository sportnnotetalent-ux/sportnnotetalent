/** Growth plan #7 — the gentle nudge: six days after a friendly's result, if
 *  the scorer hasn't scored another match, a local reminder on their phone.
 *  One at a time (a newer match replaces it); cancelled when they score again;
 *  its own id prefix, so the match-reminder scheduler never touches it. Pure. */
export const NUDGE_PREFIX = 'nudge:';
export const NUDGE_AFTER_MS = 6 * 24 * 3600 * 1000;
export const NUDGE_OFF_KEY = 'sn.nudge.off';

export function replayNudge(o: { matchId: string; home: string; away: string; now: number }) {
  return {
    id: `${NUDGE_PREFIX}replay`,
    fireAt: o.now + NUDGE_AFTER_MS,
    title: 'Another game this week?',
    body: `Play again: ${o.home} vs ${o.away}, set up in one tap.`,
    matchId: o.matchId,
  };
}
