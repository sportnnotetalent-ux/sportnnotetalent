/**
 * Cricket round 2 — the innings PHASES (powerplay / middle / death) the Stats
 * tab, the commentary's "End of the powerplay" and the new-era career phase
 * economy all read. Organiser options with the standard defaults (Match rules /
 * format: `phasePP`, `phaseDeath` — rules.ts):
 *   - powerplay: the format's own (The Hundred 25 balls; none when the format
 *     has no powerplay) · custom N overs · none;
 *   - death: automatic (the last quarter of the innings — T20 16–20, T10 8–10 —
 *     or the last 10 overs from 40 overs up; The Hundred's last 25 balls) ·
 *     the last N overs · none.
 * The format's `powerplayOvers` still sets the FIELDING restrictions (the live
 * "POWERPLAY" strip); these options only split the stats. They describe the
 * whole match (the latest choice applies to every ball, unlike a playing rule).
 *
 * Pure and JSX-free (node tests — note the `.ts` imports).
 */
import { HUNDRED_PP_BALLS, type BallRec, type CricketState } from './engine.ts';
import { rulesOf } from './rules.ts';

export type Phase = 'pp' | 'middle' | 'death';
export type PhaseFilter = 'all' | Phase;
export const PHASES: Phase[] = ['pp', 'middle', 'death'];

/** An innings' length in overs as it was played (rain cuts included, best known). */
export function inningsOvers(s: CricketState, inn: 1 | 2): number {
  if (inn === 2 || s.innings === 1) return s.oversLimit;
  if (s.inn1Rain) return Math.ceil(s.inn1Rain.balls / s.ballsPerOver);
  if (s.r1Lost !== 0) return s.inn2Overs ?? s.oversLimit;
  return s.inn1Overs ?? s.oversLimit;
}

export interface PhasePlan {
  /** legal balls in the powerplay (0 = none) */
  pp: number;
  /** the death phase starts after this many legal balls (= total: no death phase) */
  deathFrom: number;
  /** legal balls in the innings */
  total: number;
  /** the phases this innings has, in order (a phase with no balls is left out) */
  phases: Phase[];
  /** "Powerplay · Overs 1–6" … */
  labels: Record<Phase, string>;
}

/** The powerplay PHASE length in legal balls (not the plan's: no length gate):
 *  the organiser's choice, else the format's powerplay. 0 = none. */
export function phasePPBalls(s: CricketState): number {
  const r = rulesOf(s);
  if (r.phasePP !== undefined) return r.phasePP * s.ballsPerOver;
  if (s.hundred) return HUNDRED_PP_BALLS;
  return s.powerplayOvers > 0 ? s.powerplayOvers * s.ballsPerOver : 0;
}

/**
 * Powerplay / middle / death for one innings (CricViz / Cricinfo phases, or
 * the organiser's). Null for a timeless / Test-style innings (100+ overs), one
 * too short to split (under 4 overs; 2 when the organiser chose phases), or
 * when neither a powerplay nor a death phase is left.
 */
export function phasePlan(s: CricketState, inn: 1 | 2): PhasePlan | null {
  const bpo = s.ballsPerOver;
  const r = rulesOf(s);
  const custom = r.phasePP !== undefined || r.phaseDeath !== undefined;
  const len = inningsOvers(s, inn);
  if (len >= 100 || len < (custom ? 2 : 4)) return null;
  const total = len * bpo;
  const pp = Math.min(phasePPBalls(s), total);
  const autoDeath = s.hundred ? 25 : (len >= 40 ? 10 : Math.max(1, Math.round(len / 4))) * bpo;
  const deathBalls = r.phaseDeath !== undefined ? r.phaseDeath * bpo : autoDeath;
  const deathFrom = deathBalls > 0 ? Math.max(pp, total - deathBalls) : total;
  const phases = PHASES.filter((p) => (p === 'pp' ? pp > 0 : p === 'middle' ? deathFrom > pp : deathFrom < total));
  if (!phases.includes('pp') && !phases.includes('death')) return null;
  const span = (a: number, b: number) => (s.hundred || a % bpo !== 0 || b % bpo !== 0
    ? `Balls ${a + 1}–${b}` : a / bpo + 1 === b / bpo ? `Over ${b / bpo}` : `Overs ${a / bpo + 1}–${b / bpo}`);
  return {
    pp, deathFrom, total, phases,
    labels: {
      pp: pp > 0 ? `Powerplay · ${span(0, pp)}` : 'Powerplay',
      middle: deathFrom > pp ? `Middle · ${span(pp, deathFrom)}` : 'Middle',
      death: deathFrom < total ? `Death · ${span(deathFrom, total)}` : 'Death',
    },
  };
}

/** The (1-based) legal ball a record belongs to: a wide / no-ball / penalty
 *  belongs to the ball being bowled. */
const ballNo = (r: BallRec) => (r.legal ? r.lb6 : r.lb6 + 1);
export function phaseOf(r: BallRec, plan: PhasePlan | null): Phase {
  if (!plan) return 'middle';
  const n = ballNo(r);
  if (n <= plan.pp) return 'pp';
  if (n > plan.deathFrom) return 'death';
  return 'middle';
}

/** "Powerplay" / "Middle" / "Death" */
export const PHASE_WORD: Record<Phase, string> = { pp: 'Powerplay', middle: 'Middle', death: 'Death' };
