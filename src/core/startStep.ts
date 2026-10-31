/** One-tap start (growth plan #2; docs/security/breaks/one-tap-start.md):
 *  "Start the match" asks the sport's own first question, so starting is one
 *  tap. Racket sports: who serves first (SET_FIRST_SERVER). Kabaddi: the clock
 *  starts (KICKOFF). Everything else keeps its own step (football's kick-off
 *  stamps the XIs; basketball's tip-off names the period). Pure. */
import type { SportId } from './types';
import type { ScoreAction } from '../sports/types';

export type StartStep = 'serve' | 'clock' | 'plain';
const SERVE: ReadonlySet<string> = new Set(['badminton', 'tennis', 'padel', 'pickleball', 'squash', 'tabletennis']);
const CLOCK: ReadonlySet<string> = new Set(['kabaddi']);

export const startStep = (sport: SportId): StartStep => (SERVE.has(sport) ? 'serve' : CLOCK.has(sport) ? 'clock' : 'plain');

/** Exactly what the sport's own second tap logged. */
export function startActions(step: StartStep, o: { side?: 'home' | 'away'; now: number }): ScoreAction[] {
  if (step === 'serve') return o.side ? [{ type: 'SET_FIRST_SERVER', payload: { side: o.side } } as ScoreAction] : [];
  if (step === 'clock') return [{ type: 'KICKOFF', payload: { at: o.now } } as ScoreAction];
  return [];
}
