/**
 * Snooker scorer controls — the PURE half (the screen is index.tsx): the
 * action builders the buttons dispatch, what the screen offers in each state
 * (`snookerPanel`), the quick-mode frame-score check and the words.
 *
 * Every builder:
 *  - stamps `payload.frame` (the frame in play) on EVERY action and `side`
 *    (the striker) on every shot (docs/sports/SNOOKER_BILLIARDS_DESIGN.md §4),
 *    so a double tap, a stale tap after undo or a tap meant for the last frame
 *    is refused by the engine (break list B-02 / B-03, app list A-01…);
 *  - returns null when the engine would refuse the tap (it is applied to the
 *    current state first: the reducer is pure), so the screen only offers
 *    taps that count;
 *  - never puts a name in an action (IDs-only scoring: sides and numbers).
 * Never throws: a hostile or foreign state offers nothing.
 */
import type { ScoreAction } from '../types';
import {
  reducer, isSnookerState, missStatus, pointsRemaining, snookersRequired, ballValue, maxBreak, COLOURS, MAX_FRAME_SCORE,
  type AwardReason, type Ball, type Colour, type FoulKind, type LiveFrame, type On, type Side, type SnookerState,
} from './engine.ts';

type Act = ScoreAction;
type Live = SnookerState & { frame: LiveFrame };
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** A state this engine can advance (not a snapshot from elsewhere), in play. */
function live(s: unknown): s is Live {
  try {
    return isSnookerState(s) && !s.ended && !!s.frame;
  } catch {
    return false;
  }
}
/** The action, when the engine accepts it now (else null). */
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

/* ------------------------------------------------------------- builders -- */

/** Pot `ball` (the striker's). `reds` = reds in one stroke (2, 3…); `free`
 *  with a red = the free ball (nominated as a red) went down too. */
export function potAction(s: SnookerState, ball: Ball | 'free', opts: { reds?: number; free?: boolean } & StrokeTags = {}): Act | null {
  return shot(s, 'POT', { ball, ...(opts.reds !== undefined && opts.reds !== 1 ? { reds: opts.reds } : {}), ...(opts.free ? { free: true } : {}), ...tags(opts) });
}
/** Cue batch 6 — optional tags on a pot or a missed pot (Stats to track:
 *  long pots and rest shots); sent only when set, so a plain tap is as before. */
export interface StrokeTags { long?: boolean; rest?: boolean }
const tags = (o: StrokeTags): Record<string, true> => ({ ...(o.long === true ? { long: true as const } : {}), ...(o.rest === true ? { rest: true as const } : {}) });
export const missAction = (s: SnookerState, opts: StrokeTags = {}): Act | null => shot(s, 'MISS', tags(opts));
export const safetyAction = (s: SnookerState): Act | null => shot(s, 'SAFETY');

export interface FoulInput {
  /** the penalty (clamped by the engine to [the minimum for the ball on, 7]) */
  value?: number;
  kind?: FoulKind;
  /** "foul and a miss" (S3 R14) */
  miss?: boolean;
  /** the referee called a free ball for the next player (S3 R12) */
  freeBall?: boolean;
  /** reds potted or forced off the table in the foul stroke (they stay off) */
  reds?: number;
  /** a penalty by the player NOT at the table (S3 R3(k)): points to the striker, the turn goes on */
  byOther?: boolean;
}

export function foulAction(s: SnookerState, f: FoulInput = {}): Act | null {
  if (!live(s)) return null;
  const value = f.value ?? minFoul(s.frame);
  const kind = f.kind ? { kind: f.kind } : {};
  if (f.byOther) return accept(s, { type: 'FOUL', side: other(s.frame.striker), payload: { value, ...kind, penalty: true, frame: s.frame.n } });
  return shot(s, 'FOUL', { value, ...kind, ...(f.miss ? { miss: true } : {}), ...(f.freeBall ? { freeBall: true } : {}), ...(f.reds ? { reds: f.reds } : {}) });
}
/** The fouled player's choices, straight after the foul. */
export const freeBallAction = (s: SnookerState): Act | null => shot(s, 'FREE_BALL');
export const playAgainAction = (s: SnookerState): Act | null => shot(s, 'PLAY_AGAIN');
export const replaceAction = (s: SnookerState): Act | null => shot(s, 'REPLACE');
/** The re-spotted black: who plays first (the lots). */
export const respotTurnAction = (s: SnookerState, side: Side): Act | null => named(s, 'RESPOT_TURN', side);
/** Who breaks off (frame 1: the toss; a later frame: only that frame, S3 R3(d)). */
export const breakOffAction = (s: SnookerState, side: Side): Act | null => named(s, 'BREAK_OFF', side);
/** `side` concedes the frame. */
export const concedeAction = (s: SnookerState, side: Side): Act | null => named(s, 'CONCEDE', side);
/** The referee awards the frame to `side`. */
export const awardAction = (s: SnookerState, side: Side, reason?: AwardReason): Act | null =>
  named(s, 'AWARD_FRAME', side, reason ? { reason } : {});
/** Quick mode: the frame's final score. */
export const frameScoreAction = (s: SnookerState, home: number, away: number): Act | null => framed(s, 'FRAME_SCORE', { home, away });
/** Stalemate (S3 R17): the frame starts again. */
export const rerackAction = (s: SnookerState): Act | null => framed(s, 'RERACK');

/* ---------------------------------------------------------------- panel -- */

/** S3 R11: 4, or the value of the ball on when higher; the re-spotted black 7. */
function minFoul(fr: LiveFrame): number {
  if (fr.respot) return 7;
  return fr.on === 'red' || fr.on === 'colour' ? 4 : Math.max(4, ballValue(fr.on));
}

/** Batch 1 (cue-board audit #2) — the foul sheet's "ball involved" chips
 *  (the ball hit first, potted or forced off). */
export const FOUL_BALLS: readonly Ball[] = ['red', ...COLOURS];
/** S3 R11 — a foul is worth the highest of 4, the ball on (`min`, which is
 *  already max(4, ball on), 7 on the re-spotted black) and the ball involved.
 *  The payload still carries only `value`, so old fouls replay unchanged. */
export const foulValue = (min: number, involved?: Ball | null): number =>
  Math.min(7, Math.max(min, involved ? ballValue(involved) : 0));

export interface BallTap {
  ball: Ball | 'free';
  /** what it scores */
  value: number;
  label: string;
  /** null = not on now (shown dimmed) */
  action: Act | null;
}

export type MissLevel = 'count' | 'warned' | 'awardable' | 'ballInHand';
export interface MissWarn {
  /** the offender */
  by: Side;
  count: number;
  level: MissLevel;
  six: boolean;
  /** awardable: the referee's award to the fouled player */
  award: Act | null;
}

export interface SnookerPanel {
  frame: number;
  bestOf: number;
  reds: number;
  quick: boolean;
  striker: Side;
  breaker: Side;
  score: { home: number; away: number };
  framesWon: { home: number; away: number };
  /** the break in progress */
  breakPts: number;
  on: On;
  respot: boolean;
  redsLeft: number;
  remaining: number;
  snookers: { home: number; away: number };
  /** the balls, in order; the ones on carry an action */
  balls: BallTap[];
  /** several reds in one stroke (2, 3) */
  redMulti: Array<{ n: number; action: Act }>;
  /** the free ball (nominated as a red) and n reds in one stroke */
  freeRed: Array<{ n: number; action: Act }>;
  miss: Act | null;
  safety: Act | null;
  /** the foul sheet */
  foul: { min: number; values: number[]; maxRedsDown: number; canFreeBall: boolean };
  /** the fouled player's choices, until the next stroke */
  afterFoul: {
    /** the open foul's index in the frame's fouls (keys the banner) */
    at: number;
    by: Side; value: number; miss: boolean;
    playAgain: Act | null; replace: Act | null; replaceBlocked: boolean;
    freeBall: Act | null; freeBallGiven: boolean;
  } | null;
  missWarn: MissWarn | null;
  /** before the first stroke of the frame: who breaks off (null = already) */
  toss: { home: Act | null; away: Act | null } | null;
  /** the scorer tapped who won the toss */
  tossed: boolean;
  /** the re-spotted black before its first stroke: who plays (lots) */
  respotLots: { home: Act | null; away: Act | null } | null;
  /** the frame can still be entered as a score (quick) */
  frameScore: boolean;
  rerack: Act | null;
  concede: { home: Act | null; away: Act | null };
}

export const BALL_LABEL: Record<Ball | 'free', string> = {
  red: 'Red', yellow: 'Yellow', green: 'Green', brown: 'Brown', blue: 'Blue', pink: 'Pink', black: 'Black', free: 'Free ball',
};
/** Ball colours for the buttons (the ink is picked to read on them). */
export const BALL_COLOR: Record<Ball | 'free', string> = {
  red: '#C62828', yellow: '#F2C94C', green: '#1E8449', brown: '#8B5A2B', blue: '#2F80ED', pink: '#F48FB1', black: '#111111', free: '#9AA4B2',
};
export const FOUL_KIND_LABEL: Record<FoulKind, string> = {
  inOff: 'In-off (cue ball potted)', noContact: 'Missed every ball', wrongBall: 'Hit the wrong ball first', pottedWrong: 'Potted a ball not on',
  push: 'Push stroke', jump: 'Jump shot', touch: 'Touched a ball', offTable: 'Ball off the table', other: 'Other',
};
export const AWARD_REASON_LABEL: Record<AwardReason, string> = { miss: 'Foul and a miss (third failure)', conduct: 'Conduct', time: 'Time', other: 'Other' };
/** Words for how a frame ended (the frame sheet, the commentary). */
export const HOW_LABEL: Record<string, string> = {
  black: 'on the black', foul: 'on a foul', respot: 'on the re-spotted black', concede: 'conceded', award: 'awarded', quick: 'score only',
};

/** What the screen offers now; null when nothing can be scored (match over,
 *  or a state that isn't this engine's). */
export function snookerPanel(s: SnookerState): SnookerPanel | null {
  try {
    return live(s) ? panelOf(s) : null;
  } catch {
    return null;
  }
}

function panelOf(s: Live): SnookerPanel {
  const fr = s.frame;
  const respot = !!fr.respot;
  const on = respot ? 'black' : fr.on;
  const tap = (ball: Ball | 'free', value: number): BallTap => ({ ball, value, label: BALL_LABEL[ball], action: potAction(s, ball) });
  const freeOn = !!fr.freeBall && !respot && fr.on !== 'black' && fr.on !== 'colour';
  const freeValue = fr.on === 'red' ? 1 : ballValue(fr.on);
  let balls: BallTap[];
  if (respot) balls = [tap('black', 7)];
  else if (fr.on === 'red' || fr.on === 'colour') balls = [tap('red', 1), ...COLOURS.map((c) => tap(c, ballValue(c)))];
  else balls = [tap(fr.on as Colour, ballValue(fr.on))];
  if (freeOn) balls.push(tap('free', freeValue));

  const counts = (from: number, free: boolean) => [from, 2, 3].filter((n, i, a) => a.indexOf(n) === i && n <= fr.redsLeft)
    .map((n) => ({ n, action: potAction(s, 'red', { reds: n, ...(free ? { free: true } : {}) }) }))
    .filter((x): x is { n: number; action: Act } => !!x.action);
  const redMulti = fr.on === 'red' && !respot ? counts(2, false) : [];
  const freeRed = freeOn && fr.on === 'red' ? counts(1, true) : [];

  const min = minFoul(fr);
  const nextOn = fr.on === 'red' || fr.on === 'colour' ? (fr.redsLeft > 0 ? 'red' : 'yellow') : fr.on;
  const foul = {
    min,
    values: Array.from({ length: 8 - min }, (_, i) => min + i),
    maxRedsDown: respot ? 0 : fr.redsLeft,
    canFreeBall: !respot && nextOn !== 'black',
  };

  const pending = fr.pending;
  const run = fr.missRun;
  const afterFoul = pending ? {
    at: pending.at,
    by: pending.by,
    value: fr.fouls[pending.at]?.value ?? 4,
    miss: pending.miss,
    playAgain: playAgainAction(s),
    replace: replaceAction(s),
    replaceBlocked: pending.miss && s.reds === 6 && !!run && run.count >= 5,
    freeBall: freeBallAction(s),
    freeBallGiven: !!fr.freeBall,
  } : null;

  const ms = missStatus(s);
  const missWarn: MissWarn | null = ms ? {
    by: ms.by, count: ms.count, six: s.reds === 6,
    level: ms.ballInHand ? 'ballInHand' : ms.awardable ? 'awardable' : ms.warned ? 'warned' : 'count',
    award: ms.awardable ? awardAction(s, other(ms.by), 'miss') : null,
  } : null;

  const fresh = fr.shots === 0 && fr.fouls.length === 0 && !respot;
  return {
    frame: fr.n, bestOf: s.bestOf, reds: s.reds, quick: s.scoringMode === 'quick',
    striker: fr.striker, breaker: fr.breaker,
    score: { ...fr.score }, framesWon: { ...s.framesWon },
    breakPts: fr.visit.pts, on, respot, redsLeft: fr.redsLeft,
    remaining: pointsRemaining(s),
    snookers: { home: snookersRequired(s, 'home'), away: snookersRequired(s, 'away') },
    balls, redMulti, freeRed,
    miss: missAction(s), safety: safetyAction(s),
    foul, afterFoul, missWarn,
    toss: fresh ? { home: breakOffAction(s, 'home'), away: breakOffAction(s, 'away') } : null,
    tossed: s.tossed === true,
    respotLots: respot && (fr.respotShots ?? 0) === 0 ? { home: respotTurnAction(s, 'home'), away: respotTurnAction(s, 'away') } : null,
    frameScore: !!frameScoreAction(s, 1, 0),
    rerack: rerackAction(s),
    concede: { home: concedeAction(s, 'home'), away: concedeAction(s, 'away') },
  };
}

/** The foul-and-a-miss line for the banner. */
export function missWarning(w: MissWarn, names: { home: string; away: string }): string {
  const by = w.by === 'home' ? names.home : names.away;
  const fouled = w.by === 'home' ? names.away : names.home;
  switch (w.level) {
    case 'ballInHand':
      return `${by}: ${w.count} fouls and a miss in a row. ${fouled} may place the cue ball anywhere; the balls can't be replaced again (six-red rule).`;
    case 'awardable':
      return `${by}: foul and a miss number ${w.count}, after the warning. The referee may award the frame to ${fouled}.`;
    case 'warned':
      return w.six
        ? `${by} has been warned: after a fifth foul and a miss the balls can't be replaced again.`
        : `${by} has been warned: one more foul and a miss from the replaced balls can lose the frame.`;
    default:
      return `Foul and a miss number ${w.count} by ${by}.`;
  }
}

/** The points and snookers line ("62 left · Ravi needs 1 snooker"). */
export function situationLine(p: SnookerPanel, names: { home: string; away: string }): string {
  const parts = [`${p.remaining} point${p.remaining === 1 ? '' : 's'} left on the table`];
  for (const side of ['home', 'away'] as const) {
    const n = p.snookers[side];
    if (n > 0) parts.push(`${side === 'home' ? names.home : names.away} needs ${n} snooker${n === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

/* ------------------------------------------------------------ quick mode -- */

export type FrameScoreCheck = { ok: true; home: number; away: number; warn?: string } | { ok: false; error: string };

const whole = (t: string): number | null => (/^\d{1,4}$/.test(t.trim()) ? Number(t.trim()) : null);

/** The quick-mode form's check: whole numbers 0–999 and not level (as the
 *  engine), plus a "check it" warning past what a frame scores without fouls
 *  (147 / 107 / 75): possible with penalty points, so it asks, never blocks. */
export function frameScoreCheck(s: SnookerState, homeText: string, awayText: string): FrameScoreCheck {
  const home = whole(String(homeText ?? ''));
  const away = whole(String(awayText ?? ''));
  if (home === null || away === null) return { ok: false, error: 'Enter both scores as whole numbers.' };
  if (home > MAX_FRAME_SCORE || away > MAX_FRAME_SCORE) return { ok: false, error: `Scores go up to ${MAX_FRAME_SCORE}.` };
  if (home === away) return { ok: false, error: 'A frame can\'t end level. Enter the final score after the re-spotted black.' };
  if (!live(s) || !frameScoreAction(s, home, away)) return { ok: false, error: 'This frame has started: finish it shot by shot.' };
  const max = maxBreak(s.reds);
  const hi = Math.max(home, away);
  return hi > max
    ? { ok: true, home, away, warn: `${hi} is more than ${max}, the most a ${s.reds}-red frame scores without fouls. Check the score.` }
    : { ok: true, home, away };
}

/* ----------------------------------------------------------- scoreboard -- */

export interface BoardText {
  status: string;
  bestOf: string;
  /** one chip per side at most: the break / "needs N snookers" */
  alerts: Array<{ side: Side; text: string }>;
  cue: string | null;
}

/** The scoreboard's words (A-07: a pure function that never throws, so a
 *  hostile state object can't crash the board). */
export function snookerBoard(s: SnookerState): BoardText {
  try {
    const p = snookerPanel(s);
    const bestOf = typeof s.bestOf === 'number' ? s.bestOf : 1;
    const reds = s.reds === 6 || s.reds === 10 || s.reds === 15 ? s.reds : null;
    const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
    const alerts: BoardText['alerts'] = [];
    if (p) {
      const needs = (sd: Side) => (p.snookers[sd] > 0 ? `needs ${plural(p.snookers[sd], 'snooker')}` : '');
      alerts.push({ side: p.striker, text: [p.breakPts > 0 ? `Break ${p.breakPts}` : 'At the table', needs(p.striker)].filter(Boolean).join(' · ') });
      const o = other(p.striker);
      if (needs(o)) alerts.push({ side: o, text: `N${needs(o).slice(1)}` });
    }
    return {
      status: p ? `Frame ${p.frame}${p.respot ? ' · re-spotted black' : ''}` : 'Frame',
      bestOf: `${bestOf > 1 ? `best of ${bestOf}` : 'one frame'}${reds ? ` · ${reds} reds` : ''}`,
      alerts,
      cue: p ? `${plural(p.remaining, 'point')} left on the table` : null,
    };
  } catch {
    return { status: 'Frame', bestOf: '', alerts: [], cue: null };
  }
}
