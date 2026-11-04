/** Cricket on the score bar (docs/security/breaks/score-bar.md): the batting
 *  side, and the batter on strike when they're set. Defensive (SB1). */
import type { InPlay } from '../../core/scoreBar.ts';

export function cricketInPlay(s: unknown, rosters: { home: readonly string[]; away: readonly string[] }): InPlay | null {
  try {
    if (!s || typeof s !== 'object') return null;
    const c = s as { ended?: unknown; battingSide?: unknown; strikerId?: unknown };
    if (c.ended) return null;
    const side = c.battingSide;
    if (side !== 'home' && side !== 'away') return null;
    const id = typeof c.strikerId === 'string' && (rosters[side] ?? []).includes(c.strikerId) ? c.strikerId : null;
    return { side, playerId: id, verb: id ? 'on strike' : 'batting' };
  } catch { return null; }
}
