/**
 * Rugby league — six-tackle set figures, derived from the set log
 * (`walkSets`, ./engine.ts). PURE, so corrections and undo re-derive them.
 *
 * Definitions (house, following the NRL / Champion Data convention — verify):
 *  - a SET is one run of possession on the tackle count: it starts when a
 *    side gets the ball (a possession tap, a handover, a fresh set) and ends
 *    with a kick, an error, a penalty, the 6th tackle, a six again, a score,
 *    or the end of the half;
 *  - COMPLETED: the set ends in a kick, a score, a kick at goal from a
 *    penalty, or a six again / penalty to the side with the ball (a fresh set
 *    starts; a penalty to the side with the ball is one too). INCOMPLETE: it ends in an error (knock-on, forward pass, into
 *    touch…), a penalty against the side with the ball, or being tackled on
 *    the last tackle (handover). A set still running at the end of a half, or
 *    when the ball changed hands without an ending being tapped, counts as a
 *    set but in neither column of the completion rate;
 *  - TACKLES PER SET: tackles in the side's finished sets ÷ those sets;
 *  - POSSESSION: the time each side had the ball (set start → set end) on
 *    the playing clock — stoppages don't count, the gap between a score and
 *    the next possession tap belongs to nobody.
 */
import { COMPLETE_ENDS, INCOMPLETE_ENDS, matchSec, walkSets, type LeagueSet, type LeagueState, type SetEnd, type Side } from './engine.ts';

export interface SetFigures {
  /** sets started (finished + the one running) */
  sets: number;
  /** finished sets that count for the completion rate */
  decided: number;
  completed: number;
  /** tackles in finished sets, and how many finished sets */
  tackles: number;
  finished: number;
  /** possession, playing seconds */
  time: number;
  /** finished sets by how they ended */
  ends: Record<SetEnd, number>;
}

const EMPTY_ENDS = (): Record<SetEnd, number> => ({ kick: 0, error: 0, penalty: 0, sixth: 0, restart: 0, penWon: 0, score: 0, goal: 0, other: 0, period: 0 });

/** A side's set figures over a scope ('all' or a period). `nowSec` = the live playing second. */
export function setFigures(s: LeagueState, side: Side, scope: 'all' | number = 'all', nowSec?: number): SetFigures {
  const { sets, open } = walkSets(s);
  const f: SetFigures = { sets: 0, decided: 0, completed: 0, tackles: 0, finished: 0, time: 0, ends: EMPTY_ENDS() };
  const inScope = (x: LeagueSet) => x.side === side && (scope === 'all' || x.period === scope);
  for (const x of sets) {
    if (!inScope(x)) continue;
    f.sets++;
    f.finished++;
    f.tackles += x.tackles;
    f.time += Math.max(0, (x.to ?? x.from) - x.from);
    if (x.end) {
      f.ends[x.end]++;
      if (COMPLETE_ENDS.includes(x.end)) { f.completed++; f.decided++; }
      else if (INCOMPLETE_ENDS.includes(x.end)) f.decided++;
    }
  }
  if (open && inScope(open)) {
    f.sets++;
    f.time += Math.max(0, (nowSec ?? matchSec(s)) - open.from);
  }
  return f;
}

/** Completion "28/35 (80%)" text; '–' when nothing decided yet. */
export function completionText(f: Pick<SetFigures, 'completed' | 'decided'>): string {
  return f.decided ? `${f.completed}/${f.decided} (${Math.round((f.completed / f.decided) * 100)}%)` : '–';
}

/** "Tackle 3 · Lions in possession" — the live line over the Tackle button. */
export function setLine(s: LeagueState, names: { home: string; away: string }): string | null {
  const { open } = walkSets(s);
  if (!open) return null;
  return `Tackle ${open.tackles} · ${names[open.side]} in possession`;
}
