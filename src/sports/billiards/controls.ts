/**
 * English billiards scorer controls — the PURE half (the screen is
 * index.tsx): the builders the buttons dispatch, what the screen offers
 * (`billiardsPanel`), the TEN HAZARDS / SEVENTY CANNONS warnings and the
 * quick-mode frame-score check.
 *
 * As in snooker (controls.ts there): every action carries `payload.frame`,
 * every shot `side` (the striker), a builder returns null when the engine
 * would refuse the tap, no name ever goes into an action, and nothing here
 * throws on a hostile or foreign state.
 */
import type { ScoreAction } from '../types';
import {
  reducer, isBilliardsState, limits, MAX_FRAME_SCORE, PARTS,
  type AwardReason, type BilliardsState, type FoulKind, type LiveFrame, type Part, type Side,
} from './engine.ts';

type Act = ScoreAction;
type Live = BilliardsState & { frame: LiveFrame };
export type Parts = Partial<Record<Part, boolean>>;

function live(s: unknown): s is Live {
  try {
    return isBilliardsState(s) && !s.ended && !!s.frame;
  } catch {
    return false;
  }
}
function accept(s: Live, a: Act): Act | null {
  try {
    return reducer(s, a as never) === s ? null : a;
  } catch {
    return null;
  }
}
const shot = (s: unknown, type: string, payload: Record<string, unknown> = {}): Act | null =>
  (live(s) ? accept(s, { type, side: s.frame.striker, payload: { ...payload, frame: s.frame.n } }) : null);
const named = (s: unknown, type: string, side: Side, payload: Record<string, unknown> = {}): Act | null =>
  (live(s) ? accept(s, { type, side, payload: { side, frame: s.frame.n, ...payload } }) : null);
const framed = (s: unknown, type: string, payload: Record<string, unknown> = {}): Act | null =>
  (live(s) ? accept(s, { type, payload: { ...payload, frame: s.frame.n } }) : null);

const PART_VALUE: Record<Part, number> = { potRed: 3, potWhite: 2, inOffRed: 3, inOffWhite: 2, cannon: 2 };
/** What a combination scores (S3 R4); 0 when it isn't a stroke (nothing, or both in-offs). */
export function comboValue(parts: Parts): number {
  if (!parts || (parts.inOffRed && parts.inOffWhite)) return 0;
  return PARTS.reduce((t, k) => t + (parts[k] ? PART_VALUE[k] : 0), 0);
}

/* ------------------------------------------------------------- builders -- */

/** One scoring stroke: any combination of the five parts. */
export function strokeAction(s: BilliardsState, parts: Parts): Act | null {
  const on = PARTS.filter((k) => parts?.[k]);
  return on.length ? shot(s, 'SCORE', Object.fromEntries(on.map((k) => [k, true]))) : null;
}
export const missAction = (s: BilliardsState): Act | null => shot(s, 'MISS');
export const safetyAction = (s: BilliardsState): Act | null => shot(s, 'SAFETY');
/** A foul (the organiser's foul points, 2, to the opponent); `kind` is optional. */
export const foulAction = (s: BilliardsState, kind?: FoulKind): Act | null => shot(s, 'FOUL', kind ? { kind } : {});
/** Time called in a timed game. */
export const timeAction = (s: BilliardsState): Act | null => framed(s, 'TIME');
export const breakOffAction = (s: BilliardsState, side: Side): Act | null => named(s, 'BREAK_OFF', side);
export const concedeAction = (s: BilliardsState, side: Side): Act | null => named(s, 'CONCEDE', side);
export const awardAction = (s: BilliardsState, side: Side, reason?: AwardReason): Act | null => named(s, 'AWARD_FRAME', side, reason ? { reason } : {});
export const frameScoreAction = (s: BilliardsState, home: number, away: number): Act | null => framed(s, 'FRAME_SCORE', { home, away });

/* ---------------------------------------------------------------- panel -- */

export const PART_LABEL: Record<Part, string> = { potRed: 'Pot red', potWhite: 'Pot white', inOffRed: 'In-off red', inOffWhite: 'In-off white', cannon: 'Cannon' };
export const FOUL_KIND_LABEL: Record<FoulKind, string> = {
  miss: 'Missed every ball', coup: 'Coup (cue ball potted without a hit)', inHand: 'Foul playing from hand', push: 'Push stroke', jump: 'Jump shot',
  touch: 'Touched a ball', offTable: 'Ball off the table', hazards: 'Too many hazards', cannons: 'Too many cannons', baulkLine: 'Didn\'t cross the baulk line', other: 'Other',
};
export const AWARD_REASON_LABEL: Record<AwardReason, string> = { conduct: 'Conduct', time: 'Time', other: 'Other' };
export const HOW_LABEL: Record<string, string> = {
  target: 'reached the target', time: 'at time', sudden: 'in sudden death', draw: 'a draw', concede: 'conceded', award: 'awarded', quick: 'score only',
};
/** The four big buttons, in the screen's order. */
const BIG: Part[] = ['potRed', 'inOffRed', 'cannon', 'potWhite'];

export interface StrokeTap {
  key: Part;
  label: string;
  pts: number;
  action: Act | null;
  /** the engine turns this stroke into a foul (the 16th hazard / 76th cannon) */
  foul: 'hazards' | 'cannons' | null;
}

export interface BilliardsPanel {
  frame: number;
  bestOf: number;
  /** what one is called: a best-of match has frames, a single game is a game */
  unit: 'frame' | 'game';
  format: 'points' | 'timed';
  target: number;
  sudden: boolean;
  striker: Side;
  breaker: Side;
  score: { home: number; away: number };
  framesWon: { home: number; away: number };
  breakPts: number;
  /** points each side still needs (points games) */
  toGo: { home: number; away: number } | null;
  strokes: StrokeTap[];
  miss: Act | null;
  safety: Act | null;
  foulPoints: number;
  limits: { hazards: number; cannons: number; hazardLimit: number; cannonLimit: number; tenHazards: boolean; seventyCannons: boolean };
  time: Act | null;
  toss: { home: Act | null; away: Act | null } | null;
  /** the scorer tapped who won the toss */
  tossed: boolean;
  frameScore: boolean;
  concede: { home: Act | null; away: Act | null };
}

/** Would this stroke be the foul stroke over a limit (S3 R10–R11, R15(k)–(l))? */
export function strokeFoul(s: BilliardsState, parts: Parts): 'hazards' | 'cannons' | null {
  if (!live(s)) return null;
  const hazard = !!(parts.potRed || parts.potWhite || parts.inOffRed || parts.inOffWhite);
  const cannon = !!parts.cannon;
  if (hazard && !cannon && s.hazardLimit > 0 && s.frame.hazardRun >= s.hazardLimit) return 'hazards';
  if (cannon && !hazard && s.cannonLimit > 0 && s.frame.cannonRun >= s.cannonLimit) return 'cannons';
  return null;
}

export function billiardsPanel(s: BilliardsState): BilliardsPanel | null {
  try {
    return live(s) ? panelOf(s) : null;
  } catch {
    return null;
  }
}

function panelOf(s: Live): BilliardsPanel {
  const fr = s.frame;
  const lim = limits(s);
  const fresh = fr.shots === 0;
  return {
    frame: fr.n, bestOf: s.bestOf, unit: s.bestOf > 1 ? 'frame' : 'game', format: s.format, target: s.target, sudden: !!fr.sudden,
    striker: fr.striker, breaker: fr.breaker, score: { ...fr.score }, framesWon: { ...s.framesWon },
    breakPts: fr.visit.pts,
    toGo: s.format === 'points' ? { home: Math.max(0, s.target - fr.score.home), away: Math.max(0, s.target - fr.score.away) } : null,
    strokes: BIG.map((key) => ({ key, label: PART_LABEL[key], pts: PART_VALUE[key], action: strokeAction(s, { [key]: true }), foul: strokeFoul(s, { [key]: true }) })),
    miss: missAction(s), safety: safetyAction(s), foulPoints: s.foulPoints,
    limits: { hazards: lim.hazards, cannons: lim.cannons, hazardLimit: s.hazardLimit, cannonLimit: s.cannonLimit, tenHazards: lim.tenHazards, seventyCannons: lim.seventyCannons },
    time: timeAction(s),
    toss: fresh ? { home: breakOffAction(s, 'home'), away: breakOffAction(s, 'away') } : null,
    tossed: s.tossed === true,
    frameScore: fresh && fr.score.home === 0 && fr.score.away === 0,
    concede: { home: concedeAction(s, 'home'), away: concedeAction(s, 'away') },
  };
}

/** The referee's calls as lines for the screen (TEN HAZARDS / SEVENTY
 *  CANNONS come 5 strokes before the limit). */
export function limitWarnings(p: BilliardsPanel): string[] {
  const out: string[] = [];
  const l = p.limits;
  if (l.tenHazards) {
    const left = Math.max(0, l.hazardLimit - l.hazards);
    out.push(left > 0
      ? `${l.hazards} hazards in a row: ${left} more allowed, then a cannon is needed.`
      : `${l.hazards} hazards in a row: the next hazard without a cannon is a foul.`);
  }
  if (l.seventyCannons) {
    const left = Math.max(0, l.cannonLimit - l.cannons);
    out.push(left > 0
      ? `${l.cannons} cannons in a row: ${left} more allowed, then a hazard is needed.`
      : `${l.cannons} cannons in a row: the next cannon without a hazard is a foul.`);
  }
  return out;
}

/* ------------------------------------------------------------ quick mode -- */

export type FrameScoreCheck = { ok: true; home: number; away: number; warn?: string } | { ok: false; error: string };
const whole = (t: string): number | null => (/^\d{1,6}$/.test(t.trim()) ? Number(t.trim()) : null);

/** The quick-mode form's check, as the engine: a points game's winner reached
 *  the target and the loser didn't (a score past the target is recorded at
 *  it: the form says so); a timed game any score, level only when the
 *  organiser picked a draw. */
export function frameScoreCheck(s: BilliardsState, homeText: string, awayText: string): FrameScoreCheck {
  const home = whole(String(homeText ?? ''));
  const away = whole(String(awayText ?? ''));
  if (home === null || away === null) return { ok: false, error: 'Enter both scores as whole numbers.' };
  if (home > MAX_FRAME_SCORE || away > MAX_FRAME_SCORE) return { ok: false, error: `Scores go up to ${MAX_FRAME_SCORE}.` };
  if (!live(s)) return { ok: false, error: 'The match is over.' };
  const hi = Math.max(home, away);
  const lo = Math.min(home, away);
  if (s.format === 'points') {
    if (lo >= s.target) return { ok: false, error: `Only the winner reaches ${s.target}.` };
    if (hi < s.target) return { ok: false, error: `The winner must reach ${s.target}.` };
  } else if (home === away && s.timedTie !== 'draw') {
    return { ok: false, error: 'Level at time: the next score decided it. Enter the final score.' };
  }
  if (!frameScoreAction(s, home, away)) return { ok: false, error: 'This game has started: finish it shot by shot.' };
  return s.format === 'points' && hi > s.target
    ? { ok: true, home, away, warn: `${hi} is past the target: it is recorded as ${s.target}–${lo} (a game stops at ${s.target}).` }
    : { ok: true, home, away };
}

/* ----------------------------------------------------------- scoreboard -- */

export interface BoardText {
  status: string;
  bestOf: string;
  /** FRAMES for a best-of match; a single game keeps the board's own label */
  leadLabel?: string;
  alerts: Array<{ side: Side; text: string }>;
  cue: string | null;
}

/** The scoreboard's words (A-07: pure, never throws). */
export function billiardsBoard(s: BilliardsState): BoardText {
  try {
    const p = billiardsPanel(s);
    const frames = typeof s.bestOf === 'number' && s.bestOf > 1;
    const timed = s.format === 'timed';
    const game = timed ? 'timed' : `${typeof s.target === 'number' ? s.target : 150}-up`;
    const head = frames ? `Frame ${p?.frame ?? ''}`.trim() : timed ? 'Timed game' : 'Game';
    return {
      status: `${head}${p?.sudden ? ' · sudden death' : ''}`,
      bestOf: frames ? `best of ${s.bestOf} · ${game}` : game,
      ...(frames ? { leadLabel: 'FRAMES' } : {}),
      alerts: p ? [{ side: p.striker, text: p.breakPts > 0 ? `Break ${p.breakPts}` : 'At the table' }] : [],
      cue: p ? limitWarnings(p)[0] ?? null : null,
    };
  } catch {
    return { status: 'Game', bestOf: '', alerts: [], cue: null };
  }
}
