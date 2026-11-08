/**
 * One "describe the last play" card for American football
 * (docs/security/breaks/describe-us.md): the play is logged at the tap, then
 * the optional detail is attached after, under the pads — the intended
 * receiver of an incompletion (`TARGET`, onto the play itself), who broke
 * the pass up, who forced the fumble, who made the tackle (their own events,
 * as before). The card reads what was attached from the log and closes once a
 * newer play is logged. PURE.
 */
import type { ScoreAction } from '../types';
import { TRACKED, type AFEvent, type AFState, type PlayInput, type Side } from './engine.ts';

/** DU1: the intended receiver of an incompletion, attached after the play is
 *  on the board (`id` = the play's id; `null` clears it). `prev` = the
 *  receiver it replaces, whose target is taken back (DU13). */
export const targetAction = (side: Side, id: string, receiver: { id: string } | null, prev?: string): ScoreAction => ({
  type: 'TARGET', side, payload: { id, target: receiver ? receiver.id : null },
  ...(receiver ? { attribution: { playerId: receiver.id, stat: 'targets', by: 1, tracked: TRACKED } } : prev ? { attribution: { playerId: prev, stat: 'targets', by: -1 } } : {}),
  ...(receiver && prev ? { attribution2: { playerId: prev, stat: 'targets', by: -1 } } : {}),
});

/** What the card asks about a play just built (`a`), by the match's toggles:
 *  the incompletion's target / breakup, the fumble's forcer, the tackler
 *  (a loss = a tackle for loss with defensive detail on). Null = no card: a
 *  touchdown or safety (the score itself), a play wiped out by a penalty,
 *  nothing tracked. */
export type AfCard = { target: boolean; pd: boolean; ff: boolean; tackle: boolean; loss: boolean };
export function afCardFor(s: Pick<AFState, 'trackTargets' | 'trackDefence' | 'trackTackles'>, inp: PlayInput, a: ScoreAction): AfCard | null {
  if (a.type !== 'PLAY') return null;
  if (inp.pen && (inp.pen.enf === 'prev' || inp.pen.enf === 'off')) return null;
  const target = !!s.trackTargets && inp.play === 'inc' && !inp.p2;
  const pd = !!s.trackDefence && inp.play === 'inc';
  const ff = !!s.trackDefence && inp.play === 'fumble';
  const tackle = !!s.trackTackles && (inp.play === 'run' || inp.play === 'pass');
  const loss = tackle && !!s.trackDefence && (inp.yards ?? 0) < 0;
  return target || pd || ff || tackle ? { target, pd, ff, tackle, loss } : null;
}

/** The card's own detail events (logged after its play). */
const OWN = new Set<AFEvent['type']>(['pd', 'ff', 'tackle']);

/** DU3 / DU9: the play is gone (Undo / Remove), or a newer play is logged. */
export function afCardStale(s: Pick<AFState, 'events'>, ref: string): boolean {
  const i = s.events.findIndex((e) => e.id === ref);
  if (i < 0) return true;
  return s.events.slice(i + 1).some((e) => !OWN.has(e.type));
}

/** What the card has attached so far, from the log (one of each). */
export function afCardDetail(s: Pick<AFState, 'events'>, ref: string): { play?: AFEvent; target?: string; pd?: AFEvent; ff?: AFEvent; tackle?: AFEvent } {
  const i = s.events.findIndex((e) => e.id === ref);
  if (i < 0) return {};
  const play = s.events[i];
  const after = s.events.slice(i + 1);
  const first = (t: AFEvent['type']) => { for (const e of after) { if (!OWN.has(e.type)) return undefined; if (e.type === t) return e; } return undefined; };
  return {
    play,
    ...(play.type === 'play' && play.play === 'inc' && play.tgt && play.secondId ? { target: play.secondId } : {}),
    pd: first('pd'), ff: first('ff'), tackle: first('tackle'),
  };
}
