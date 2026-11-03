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
import { ballsAtFirstCut } from './timeline.ts';

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
 *  the organiser's choice, else the format's powerplay. 0 = none. With `inn`
 *  (batch 6, C11) the format's powerplay is the one that innings was played
 *  under — shortened by a rain cut (`powerplayBalls`). */
export function phasePPBalls(s: CricketState, inn?: 1 | 2): number {
  const r = rulesOf(s);
  if (r.phasePP !== undefined) return r.phasePP * s.ballsPerOver;
  if (inn !== undefined) return powerplayBalls(s, inn);
  if (s.hundred) return HUNDRED_PP_BALLS;
  return s.powerplayOvers > 0 ? s.powerplayOvers * s.ballsPerOver : 0;
}

// ─── Batch 6 (C11, R7) — the FIELDING powerplay of an innings ────────────────
// Display only (the live strip, the scoreboard tag, the stats' auto phase): it
// is derived from the state, never stored, so every log replays unchanged.

/** The scheduled innings length the format's powerplay was set for. */
const ppBase = (s: CricketState): number => s.inn1Overs ?? s.oversLimit;
/** The innings' length for its powerplay: as played (rain cuts included); an
 *  innings 1 that rain ENDED keeps its scheduled length (its powerplay was set
 *  before the stop). */
const ppLen = (s: CricketState, inn: 1 | 2): number => (inn === 1 && s.inn1Rain ? ppBase(s) : inningsOvers(s, inn));

/**
 * The powerplay of innings `inn` in legal balls (0 = none). The format's
 * `powerplayOvers` — The Hundred 25 balls — and, after a rain cut (`v: 2` DLS
 * maths only, so legacy rain logs show what they always showed), the ICC
 * reduced-overs table: the same share of the shorter innings, by balls in
 * T20-length cricket (30 %: 10 overs → 3, 13 → 3.5, 19 → 5.4) and in whole
 * overs in longer cricket (ODI 20 %: 30 overs → 6). Never longer than the innings.
 */
export function powerplayBalls(s: CricketState, inn: 1 | 2 = s.innings): number {
  if (s.hundred) return HUNDRED_PP_BALLS;
  const pp = s.powerplayOvers;
  if (!(pp > 0)) return 0;
  const bpo = s.ballsPerOver;
  const base = ppBase(s);
  const len = ppLen(s, inn);
  let balls = pp * bpo;
  if (s.dlsV === 2 && base > 0 && len < base) {
    const full = balls;
    balls = base > 20 ? Math.round((len * pp) / base) * bpo : Math.round((len * bpo * pp) / base);
    balls = Math.max(1, balls);
    // A cut can't take back powerplay balls already bowled under restrictions:
    // cut after the powerplay → it stays as played; mid-powerplay → it ends
    // no earlier than the cut.
    const side = inn === s.innings ? s.battingSide : (s.battingSide === 'home' ? 'away' : 'home');
    const at = ballsAtFirstCut(s, side, inn);
    if (at !== null) balls = Math.max(balls, Math.min(full, at));
  }
  return Math.max(0, Math.min(balls, len * bpo));
}

/** One fielding-restriction band: legal balls [from, to) and the most fielders
 *  allowed outside the 30-yard ring. */
export interface PowerplayBand { name: 'P1' | 'P2' | 'P3'; from: number; to: number; outside: number }

/**
 * The powerplay bands of innings `inn`. T20-length cricket (and The Hundred):
 * one (P1, 2 outside). Longer limited-overs cricket (over 20 overs, ICC ODI
 * conditions): P1 (2 outside), P2 (4) and P3, the last stretch as long as P1
 * (5) — 1–10 / 11–40 / 41–50 in an ODI, scaled with a rain cut. None for a
 * timeless game or a format without a powerplay.
 */
export function powerplayBands(s: CricketState, inn: 1 | 2 = s.innings): PowerplayBand[] {
  const p1 = powerplayBalls(s, inn);
  if (p1 <= 0) return [];
  const base = ppBase(s);
  const total = ppLen(s, inn) * s.ballsPerOver;
  const first: PowerplayBand = { name: 'P1', from: 0, to: p1, outside: 2 };
  if (s.hundred || base <= 20 || base >= 100) return [first];
  const p3From = Math.max(p1, total - p1);
  const out = [first];
  if (p3From > p1) out.push({ name: 'P2', from: p1, to: p3From, outside: 4 });
  if (total > p3From) out.push({ name: 'P3', from: p3From, to: total, outside: 5 });
  return out;
}

/** "overs 1–6" / "overs 11–40" / "the first 3.5 overs" / "balls 1–25". */
function bandSpan(s: CricketState, b: PowerplayBand): string {
  const bpo = s.ballsPerOver;
  if (s.hundred) return `balls ${b.from + 1}–${b.to}`;
  if (b.from % bpo === 0 && b.to % bpo === 0) return `overs ${b.from / bpo + 1}–${b.to / bpo}`;
  if (b.from === 0) return `the first ${Math.floor(b.to / bpo)}.${b.to % bpo} overs`;
  return `balls ${b.from + 1}–${b.to}`;
}

/** The band the NEXT ball is in, with the strip's text, or null (none / over). */
export function powerplayNow(s: CricketState): (PowerplayBand & { label: string }) | null {
  if (s.ended) return null;
  const bands = powerplayBands(s, s.innings);
  const balls = s.scores[s.battingSide].balls;
  const b = bands.find((x) => balls >= x.from && balls < x.to);
  if (!b) return null;
  const label = bands.length === 1
    ? `POWERPLAY · ${bandSpan(s, b)} — fielding restrictions in effect`
    : `POWERPLAY ${b.name.slice(1)} · ${bandSpan(s, b)} — max ${b.outside} fielders outside the ring`;
  return { ...b, label };
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
  const pp = Math.min(phasePPBalls(s, inn), total);
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
