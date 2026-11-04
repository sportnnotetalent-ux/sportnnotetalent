/** Who is serving, and match / set / game point, for the set sports
 *  (score bar, docs/security/breaks/score-bar.md). Same expressions as each
 *  sport's own board; defensive (SB1). */
import type { InPlay } from '../core/scoreBar.ts';
import { pointPressure, type Pressure } from './pointStatus.ts';
import type { ScoreAction } from './types';

type Side = 'home' | 'away';
type Rosters = { home: readonly string[]; away: readonly string[] };

/** The most important pressure first (match > set > game / break). */
const ORDER = ['MATCH POINT', 'SET POINT', 'BREAK POINT', 'GAME POINT'];
export function topPressure(p: readonly Pressure[]): Pressure | null {
  return [...p].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))[0] ?? null;
}

/** A serving sport: `serving` = the side serving now or null (before the toss / ended). */
export function servingInPlay<S extends { doubles?: boolean; ended?: boolean }>(
  s: S, rosters: Rosters, serving: (s: S) => Side | null, reducer?: (s: S, a: ScoreAction) => S, unit: 'set' | 'game' = 'set',
): InPlay | null {
  try {
    if (!s || typeof s !== 'object' || s.ended) return null;
    const side = serving(s);
    if (side !== 'home' && side !== 'away') return null;
    const roster = rosters[side] ?? [];
    const id = !s.doubles && roster.length === 1 ? roster[0] : null;
    let due: InPlay['due'] = null;
    if (reducer) {
      try {
        const top = topPressure(pointPressure(reducer as never, s as never, { unit, server: side }));
        if (top) due = { side: top.side, text: top.kind };
      } catch { /* no note */ }
    }
    return { side, playerId: id, verb: 'serving', due };
  } catch { return null; }
}
