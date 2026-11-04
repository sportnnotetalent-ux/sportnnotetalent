/** Football on the score bar (docs/security/breaks/score-bar.md): the side on
 *  the ball (when possession is tracked) and what's due on the clock — the
 *  same rule as the Added time card (UI audit #25). */
import type { InPlay } from '../../core/scoreBar.ts';
import { currentMinute, halfBase, HALF_NAME, type FootballState } from './engine.ts';

export function footballInPlay(s: FootballState | null | undefined): InPlay | null {
  try {
    if (!s || typeof s !== 'object' || (s as { ended?: unknown }).ended || (s as { gc?: unknown }).gc) return null;
    const base = halfBase(s);
    const min = currentMinute(s);
    const stop = s.stoppage?.[s.half] ?? 0;
    const name = HALF_NAME[s.half] ?? 'half';
    const text = stop === 0 && min >= base - 2 ? 'Added time due'
      : stop > 0 && min >= base + stop ? `Added time up — end the ${s.half === 1 || s.half === 3 ? name : 'match'}`
      : null;
    const side = s.possession?.side;
    if (side !== 'home' && side !== 'away') return text ? { side: 'home', verb: '', due: { text } } : null;
    return { side, verb: 'on the ball', due: text ? { text } : null };
  } catch { return null; }
}
