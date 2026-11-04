/** Who is serving (score bar, docs/security/breaks/score-bar.md): nothing
 *  before the toss (SB3); doubles names the server from the BWF rotation. */
import { serve, type BadmintonState } from './engine.ts';
import { badmintonDoublesTurn } from '../doublesOrder.ts';
import type { InPlay } from '../../core/scoreBar.ts';

type Rosters = { home: readonly string[]; away: readonly string[] };

export function badmintonInPlay(s: BadmintonState | null | undefined, rosters: Rosters): InPlay | null {
  try {
    if (!s || typeof s !== 'object' || (s as { ended?: unknown }).ended || !s.current) return null;
    const noPlayYet = s.current.home === 0 && s.current.away === 0 && (s.games?.length ?? 0) === 0;
    if (noPlayYet && !s.serverPicked) return null;
    const side = serve(s).side;
    const roster = rosters[side] ?? [];
    const id = s.doubles
      ? badmintonDoublesTurn(s, { home: [...rosters.home], away: [...rosters.away] })?.server ?? null
      : roster[0] ?? null;
    return { side, playerId: id && roster.includes(id) ? id : null, verb: 'serving' };
  } catch { return null; }
}
