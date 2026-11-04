/** Who is at the table (score bar, docs/security/breaks/score-bar.md) for the
 *  cue sports — the same rotation the controls use. Defensive (SB1). */
import { atTable, perSideOf } from './doubles.ts';
import { liveRack, shooterPick } from '../pool/controls.ts';
import type { InPlay } from '../../core/scoreBar.ts';

type Rosters = { home: readonly string[]; away: readonly string[] };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isSide = (v: unknown): v is 'home' | 'away' => v === 'home' || v === 'away';

/** The player for `side`: doubles → the rotation's pick; singles → the side's one player. Must be on the roster (SB2). */
function playerFor(roster: readonly string[], doubles: boolean, pick: () => string | null): string | null {
  const id = doubles ? pick() : roster[0] ?? null;
  return id && roster.includes(id) ? id : null;
}

/** Snooker and billiards: the frame's striker. */
export function cueInPlay(s: unknown, rosters: Rosters): InPlay | null {
  try {
    if (!isObj(s) || s.ended === true || !isObj(s.frame) || !isSide(s.frame.striker)) return null;
    const side = s.frame.striker;
    const roster = rosters[side] ?? [];
    const playerId = playerFor(roster, perSideOf(s) === 2, () => atTable(s, side, roster).suggested);
    return { side, playerId, verb: 'at the table' };
  } catch { return null; }
}

/** Pool: the rack's shooter (the breaker before the break). */
export function poolInPlay(s: unknown, rosters: Rosters): InPlay | null {
  try {
    const r = liveRack(s);
    const side = r?.phase === 'break' ? (r.breaker ?? r.shooter) : r?.shooter;
    if (!r || !isSide(side)) return null;
    const roster = rosters[side] ?? [];
    const playerId = playerFor(roster, perSideOf(s) === 2, () => shooterPick(s as never, side, roster).suggested);
    return { side, playerId, verb: r.phase === 'break' ? 'to break' : 'at the table' };
  } catch { return null; }
}
