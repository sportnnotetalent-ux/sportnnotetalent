/**
 * Cricket — joining the ball log to the timeline (moved out of commentary.ts
 * in batch 6 so phases.ts can find where an innings' overs were cut without an
 * import cycle; commentary.ts re-exports `ballEventMatches`).
 *
 * Pure and JSX-free (node tests — note the `.ts` imports).
 */
import { oversStr, type BallRec, type CricketState } from './engine.ts';
import { recStamp } from './detail.ts';
import type { LiveEvent } from '../liveEvents';

const WICKET_WORDS = new Set(['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'RUN OUT', 'HIT WICKET', 'HIT TWICE', 'OBSTRUCTING']);
const isPenaltyLabel = (l: string) => /^Penalty — /.test(l) || /^\d+ penalty runs? to /.test(l);
const isAdjustLabel = (l: string) => /^Bonus -?\d+/.test(l) || /^\d+ deducted/.test(l);

/** Is timeline event `e` the entry the reducer wrote for ball-log record `r`?
 *  (Stamp + kind — a delivery's "12.4", a penalty's / retirement's "12.3"
 *  overs-completed stamp — mirroring the reducer's event for each action.) */
export function ballEventMatches(e: LiveEvent, r: BallRec, bpo: number): boolean {
  const l = String(e.label ?? '');
  if (r.cross) return isPenaltyLabel(l) || isAdjustLabel(l);
  if (r.adj !== undefined) return isAdjustLabel(l) && e.stamp === oversStr(r.lb6, bpo);
  if (r.sym === undefined) {
    if (r.out) {
      const ok = r.out.kind === 'retired' ? l === 'RETIRED HURT' || l === 'RETIRED'
        : r.out.kind === 'retiredout' ? l === 'RETIRED OUT' : r.out.kind === 'timedout' ? l === 'TIMED OUT' : false;
      return ok && e.stamp === oversStr(r.lb6, bpo);
    }
    return isPenaltyLabel(l) && e.stamp === oversStr(r.lb6, bpo);
  }
  if (r.out?.kind === 'mankad') return l === 'MANKAD' && e.stamp === oversStr(r.lb6, bpo);
  if (e.stamp !== recStamp(r, bpo)) return false;
  if (r.ext === 'wd') return /^Wide\b/.test(l);
  if (r.ext === 'nb') return /^No ball\b/.test(l);
  if (r.out && r.out.kind !== 'retired') return e.icon === '🎯' && WICKET_WORDS.has(l);
  if (r.bat === 0 && r.b + r.lb > 0) return /^(Bye|Leg bye)\b/.test(l);
  return e.icon === '🏏';
}

/** A timeline entry that shortened the innings being played: a rain cut or an
 *  agreed overs change. */
const isOversCut = (e: LiveEvent): boolean => /^Rain — overs cut to /.test(String(e.label ?? '')) || /^Overs changed to /.test(String(e.label ?? ''));

/**
 * Batch 6 (C11) — legal balls `side` had faced in its innings when its overs
 * were first cut or changed, or null (no such entry). Walks the log and the
 * timeline together, as the commentary does.
 */
export function ballsAtFirstCut(s: Pick<CricketState, 'log' | 'events' | 'ballsPerOver'>, side: 'home' | 'away', inn: 1 | 2): number | null {
  const log = s.log ?? [];
  const events = [...(s.events ?? [])].sort((a, b) => a.id - b.id);
  const bpo = s.ballsPerOver;
  let ei = 0;
  let balls = 0;
  const cutIn = (from: number, to: number): boolean => {
    for (let k = from; k < to; k++) if (events[k].side === side && isOversCut(events[k])) return true;
    return false;
  };
  for (const r of log) {
    let found = -1;
    for (let j = ei; j < events.length; j++) if (ballEventMatches(events[j], r, bpo)) { found = j; break; }
    if (found >= 0) {
      // a cut by this side's innings before this record — but only once its innings has begun
      if (r.inn >= inn && cutIn(ei, found)) return balls;
      ei = found + 1;
    }
    if (r.inn === inn && r.side === side && !r.cross) balls = r.lb6;
    if (r.inn > inn) return null;
  }
  return cutIn(ei, events.length) ? balls : null;
}
