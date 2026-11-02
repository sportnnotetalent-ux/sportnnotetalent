/**
 * Measured sports batch 5 (expert audit docs/sport-expert/measured.md, breaks
 * docs/security/breaks/measured-batch5.md) — small pure helpers the entry
 * screen and panels share:
 *
 *   withStatusChange   a status tap; WD after competing keeps what was done
 *                      (weightlifting, shooting) via `wdKeep`
 *   targetStatuses     shooting gets DNF
 *   penaltyInView /    result-changing entries (shooting −2, weightlifting
 *   juryOffered        jury reversal) never depend on a switch set before the
 *                      first result — the switch only puts them in view
 *   drawOfLots         athletics track: a tie at the qualifying line with no
 *                      lane for both (TR 21.3)
 *   crewFalseStart     rowing / canoe: first a warning, the second excludes
 *   trackRuleLine /    the rules in force on the results header
 *   precisionRuleNote
 *
 * Every new key is additive; a row without it reads as before. PURE.
 */
import type { DisciplineDef, EntryResult, LiftAttempt, PhaseFormat, ResultStatus } from './model.ts';
import type { Qualification } from './progression.ts';
import { ruleOf, type CompRules } from './competitionRules.ts';
import { archTeamOf } from './archeryDefs.ts';

/** Something was done that can stand after a withdrawal: a good lift, a series fired. */
function hasDone(def: DisciplineDef, r: EntryResult): boolean {
  if (def.capture === 'lifts') return Object.values(r.lifts ?? {}).some((l) => (l ?? []).some((a) => a?.good === true));
  if (def.sport === 'shooting') return (r.series ?? []).length > 0;
  return false;
}

/**
 * The row after a status tap (`status` undefined = cleared). WD on a lifter
 * with a good lift, or a shooter with a series fired, is marked `wdKeep`: what
 * was done stands. Any other change drops the marker.
 */
export function withStatusChange(def: DisciplineDef, r: EntryResult, status: ResultStatus | undefined): EntryResult {
  const { wdKeep: _k, ...rest } = r;
  const next: EntryResult = { ...rest, status };
  return status === 'WD' && hasDone(def, r) ? { ...next, wdKeep: true } : next;
}

/** The status chips of a target event: shooting adds DNF (couldn't finish, e.g. a gun failure past the allowance). */
export const targetStatuses = (def: Pick<DisciplineDef, 'sport'>): ResultStatus[] =>
  def.sport === 'shooting' ? ['DNS', 'DNF', 'DQ', 'WD'] : ['DNS', 'DQ', 'WD'];

/** A result-changing button sits in view when the meet switched it on or the row already holds one; otherwise it is behind the row's ⋯. */
export const penaltyInView = (switchOn: boolean, holds: boolean): boolean => switchOn || holds;

/** A jury reversal can be entered on any decided attempt (not a declined one), whatever `wlJury` says. */
export const juryOffered = (a: LiftAttempt | undefined | null): boolean => !!a && a.good !== undefined && !a.pass;

/**
 * Athletics track (TR 21.3): the athletes tied at the last qualifying spot who
 * must be separated by a draw of lots — only when more qualify than the next
 * round has lanes for (`capacity` = its heats × lanes). Empty otherwise: both go through.
 */
export function drawOfLots(q: Qualification, capacity: number): string[] {
  return Number.isFinite(capacity) && q.marks.size > capacity ? [...q.tieAtLine] : [];
}

/**
 * Rowing / canoe false start under the meet's rule (`crewFalseStart`, default
 * 'warn'): the crew's first false start is a warning (yellow card, `fsWarn`) and
 * changes nothing in the result; the second — or the first under 'zero' —
 * excludes the crew (FS, red card).
 */
export function crewFalseStart(r: EntryResult, rules: CompRules | null | undefined, sport: string): { step: 'warn' | 'out'; next: EntryResult } {
  const zero = ruleOf(rules, 'crewFalseStart') === 'zero';
  const warned = r.fsWarn === true;
  const { fsWarn: _w, ...rest } = r;
  if (!zero && !warned) return { step: 'warn', next: { ...rest, fsWarn: true } };
  const body = sport === 'canoe' ? 'ICF' : 'World Rowing';
  return {
    step: 'out',
    next: { ...rest, ...(warned ? { fsWarn: true } : {}), status: 'FS', ruleRef: zero ? `Excluded — false start (meet rule)` : `Excluded — second false start (${body})` },
  };
}

/** Athletics track header: "False starts: zero tolerance (TR 16.8) · wind limit +2.0 m/s for records · fully automatic timing" ('' elsewhere). */
export function trackRuleLine(def: DisciplineDef, f: Partial<Pick<PhaseFormat, 'rules' | 'handTimed' | 'combined'>>): string {
  if (def.sport !== 'athletics' || def.capture !== 'single' || def.unit !== 'time' || def.tie === 'road' || f.combined) return '';
  const fs = ruleOf(f.rules, 'falseStart') === 'one' ? 'False starts: one per race, the next disqualifies (meet rule)' : 'False starts: zero tolerance (TR 16.8)';
  const wind = def.wind === 'race' ? (ruleOf(f.rules, 'windLimit') === 'none' ? 'no wind rule' : 'wind limit +2.0 m/s for records') : '';
  const timing = f.handTimed === true ? 'hand-timed (h)' : 'fully automatic timing';
  return [fs, wind, timing].filter(Boolean).join(' · ');
}

/** What the precision headers add: penalties, lights, jury, team-arrow credit — and where the controls are ('' for other sports). */
export function precisionRuleNote(def: DisciplineDef, rules: CompRules | null | undefined): string {
  if (def.sport === 'shooting') return ruleOf(rules, 'shootPen') === true ? 'penalties: −2 button on each series' : 'a −2 penalty: ⋯ on the series';
  if (def.capture === 'lifts') {
    return [
      ruleOf(rules, 'wlLights') === true ? 'referees’ lights on every attempt' : 'one tap: good lift / no lift',
      ruleOf(rules, 'wlJury') === true ? 'jury reversals in view' : 'jury reversal: tap the attempt',
    ].join(' · ');
  }
  if (def.sport === 'archery') {
    const team = archTeamOf(def.key);
    return [
      team ? (ruleOf(rules, 'archTeamArrows') === true ? 'team arrows credited to each archer' : 'team arrows as one end') : '',
      'penalty (highest arrow off): tap the archer',
    ].filter(Boolean).join(' · ');
  }
  return '';
}
