/**
 * Snooker engine: 15-red, 10-red and six-red frames, best of N. Rules from the
 * WPBSA Official Rules of the Games of Snooker and English Billiards, revised
 * May 2022 ("S3 R11(d)" = Section 3, Rule 11(d)); six reds = S3 R19. Design,
 * sources and the action vocabulary: docs/sports/SNOOKER_BILLIARDS_DESIGN.md.
 *
 * Shot by shot: the engine knows who is at the table (the striker) and which
 * ball is on, so a tap is just "pot the black". A VISIT is one turn at the
 * table; its points are the break (S2 R8). It ends with a missed pot, a safety,
 * a foul, or the frame's end. Quick mode records a frame's final score in one
 * FRAME_SCORE; a match may mix both, frame by frame.
 *
 * PURE: never mutates the state, never throws on bad input (an action it can't
 * apply returns the same state object), and the same log always replays to the
 * same state. Undo is the live layer replaying the log without its last event,
 * so there is no UNDO action. IDs only (docs/privacy/ids-only-scoring.md): the
 * state holds sides and numbers; payload fields are read one by one from a
 * fixed list and nothing else is copied.
 */
import type { ScoreSummary } from '../types';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from '../scoreline.ts';

export type Side = 'home' | 'away';
export type Colour = 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black';
export type Ball = 'red' | Colour;

/** S3 R1(a) — the colours in ascending order of value. */
export const COLOURS: readonly Colour[] = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
const VALUE = new Map<string, number>([['red', 1], ['yellow', 2], ['green', 3], ['brown', 4], ['blue', 5], ['pink', 6], ['black', 7]]);
/** A ball's value (S3 R1(a)); 0 for anything that isn't a ball. */
export const ballValue = (b: string): number => VALUE.get(b) ?? 0;

/** What is on: a red (S3 R3(g)); any colour after a red or a free ball taken
 *  as a red (R3(h)(i)); or, once the reds are gone, the colour on (R3(h)(iii)). */
export type On = 'red' | 'colour' | Colour;

export type VisitEnd = 'miss' | 'safety' | 'foul' | 'frame' | 'respot';
/** One turn at the table. `pts` = the break; `pots` = balls potted; `shots` =
 *  potting strokes; `fb` = a free ball was potted in it. */
export interface Visit { side: Side; pts: number; pots: number; shots: number; fb?: 1 }
export interface VisitRecord extends Visit { end: VisitEnd }

/** Optional foul types for the stats (the S3 R11 list, grouped). */
export const FOUL_KINDS = ['inOff', 'noContact', 'wrongBall', 'pottedWrong', 'push', 'jump', 'touch', 'offTable', 'other'] as const;
export type FoulKind = typeof FOUL_KINDS[number];

/** A foul or a non-striker penalty. `by` = the offender; the points go to the
 *  other side (S3 R1(d)). */
export interface FoulRecord {
  by: Side; value: number; kind?: FoulKind;
  /** called "foul and a miss" (S3 R14) */
  miss?: true;
  /** the referee called a free ball for the next player (S3 R12) */
  fb?: true;
  /** reds that went down in the foul stroke and stay off (S3 R3(i)) */
  reds?: number;
  /** a penalty by the non-striker (S3 R3(k), R11(e)–(g)): the turn goes on */
  penalty?: true;
}

/** The fouled player's options, open until the next stroke (S3 R10(h), R13, R14(b)). */
export interface PendingFoul { by: Side; miss: boolean; before: { redsLeft: number; on: On } }

/** Consecutive fouls-and-misses by one player with the balls replaced (S3 R14(d), R19). */
export interface MissRun { by: Side; count: number; replaced: boolean; warned: boolean }

export interface LiveFrame {
  n: number;
  breaker: Side;
  striker: Side;
  score: { home: number; away: number };
  redsLeft: number;
  on: On;
  /** the re-spotted black (S3 R4(b)) */
  respot?: true;
  /** strokes played on the re-spotted black (the lots can be recorded before the first) */
  respotShots?: number;
  visit: Visit;
  visits: VisitRecord[];
  fouls: FoulRecord[];
  /** the striker may take a free ball with this stroke (S3 R12) */
  freeBall?: true;
  pending?: PendingFoul;
  missRun?: MissRun;
  /** strokes the strikers have played in this frame */
  shots: number;
}

export type FrameHow = 'black' | 'foul' | 'respot' | 'concede' | 'award' | 'quick';
export const AWARD_REASONS = ['miss', 'conduct', 'time', 'other'] as const;
export type AwardReason = typeof AWARD_REASONS[number];

export interface FrameRecord {
  n: number;
  breaker: Side;
  score: [number, number];
  winner: Side;
  how: FrameHow;
  /** recorded in quick mode: score only (no visits / fouls) */
  quick?: true;
  visits?: VisitRecord[];
  fouls?: FoulRecord[];
  conceded?: Side;
  reason?: AwardReason;
}

export interface SnookerState {
  sport: 'snooker';
  reds: 6 | 10 | 15;
  bestOf: number;
  framesToWin: number;
  /** who broke frame 1 (the toss); the break-off alternates (S3 R3(b)) */
  firstBreak: Side;
  /** the organiser's preferred input (a UI hint; both kinds of action always work) */
  scoringMode: 'shot' | 'quick';
  frames: FrameRecord[];
  framesWon: { home: number; away: number };
  /** the frame in play; null once the match has ended */
  frame: LiveFrame | null;
  ended: boolean;
  winner: Side | null;
  /** actions applied */
  seq: number;
}

/** What the reducer reads from an action. Attribution is a side channel it ignores. */
export interface SnookerAction { type: string; side?: Side; payload?: Record<string, unknown> }

// ------------------------------------------------------------ helpers --

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** An own property only — never one inherited from Object.prototype. */
const own = (o: Record<string, unknown> | undefined, k: string): unknown =>
  (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
/** A finite number (strings, NaN and ±Infinity are not). */
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** An integer in [min, max], else undefined. */
const intIn = (v: unknown, min: number, max: number): number | undefined => {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const isColour = (v: unknown): v is Colour => typeof v === 'string' && (COLOURS as readonly string[]).includes(v);
const nextColour = (c: Colour): Colour | null => COLOURS[COLOURS.indexOf(c) + 1] ?? null;
const emptyVisit = (side: Side): Visit => ({ side, pts: 0, pots: 0, shots: 0 });

/** The most one visit can score: reds × (red + black) + the colours (147 / 107 / 75). */
export const maxBreak = (reds: number): number => reds * 8 + 27;
/** The highest score a frame record may hold in quick mode. */
export const MAX_FRAME_SCORE = 999;
/** B-04 — the most visits + fouls one frame keeps (a long professional
 *  frame has ~150). Each record copies the frame's lists, so an unbounded
 *  frame made every replay quadratic; past the cap the turn can't pass
 *  (pots and the frame-ending actions still work). */
export const MAX_FRAME_RECORDS = 5000;
const full = (fr: LiveFrame): boolean => fr.visits.length + fr.fouls.length >= MAX_FRAME_RECORDS;

function readBestOf(v: unknown, dflt: number): number {
  const n = num(v);
  if (n === undefined) return dflt;
  let b = clamp(Math.round(n), 1, 35);
  if (b % 2 === 0) b = b + 1 > 35 ? b - 1 : b + 1;
  return b;
}

const breakerFor = (s: Pick<SnookerState, 'firstBreak'>, n: number): Side => (n % 2 === 1 ? s.firstBreak : other(s.firstBreak));

function newFrame(n: number, breaker: Side, reds: number): LiveFrame {
  return { n, breaker, striker: breaker, score: { home: 0, away: 0 }, redsLeft: reds, on: 'red', visit: emptyVisit(breaker), visits: [], fouls: [], shots: 0 };
}

/** B-05 / B-14 — the last net under "never throw": a hostile object (a
 *  getter or Proxy that throws) gives the fallback instead. */
function safe<T>(f: () => T, fallback: T): T {
  try { return f(); } catch { return fallback; }
}

export function createInitialState(config?: Record<string, unknown>): SnookerState {
  const c = safe(() => (isObj(config) ? config : undefined), undefined);
  const read = (k: string): unknown => safe(() => own(c, k), undefined);
  const r = read('reds');
  const reds: 6 | 10 | 15 = r === 6 || r === 10 || r === 15 ? r : 15;
  const bestOf = readBestOf(read('bestOf'), reds === 6 ? 7 : 5);
  const fb = read('firstBreak');
  const firstBreak: Side = isSide(fb) ? fb : 'home';
  return {
    sport: 'snooker', reds, bestOf, framesToWin: (bestOf + 1) / 2, firstBreak,
    scoringMode: read('scoringMode') === 'quick' ? 'quick' : 'shot',
    frames: [], framesWon: { home: 0, away: 0 }, frame: newFrame(1, firstBreak, reds), ended: false, winner: null, seq: 0,
  };
}
export const init = createInitialState;

/** S3 R11: 4, or the value of the ball on when higher; the re-spotted black 7. */
function minFoul(fr: LiveFrame): number {
  if (fr.respot) return 7;
  return isColour(fr.on) ? Math.max(4, ballValue(fr.on)) : 4;
}

/** The ball on at the start of the next turn (S3 R3(g)–(h)): a red while reds
 *  remain; the yellow once they are gone (a colour after the last red has
 *  been played at); in the clearance, the same colour. */
function nextTurnOn(on: On, redsLeft: number): On {
  if (on === 'red' || on === 'colour') return redsLeft > 0 ? 'red' : 'yellow';
  return on;
}

/** A free ball needs another ball to nominate: not with only the black left. */
const freeBallPossible = (fr: Pick<LiveFrame, 'on' | 'respot'>): boolean => !fr.respot && fr.on !== 'black' && fr.on !== 'colour';

/** The frame as it stands after a stroke: the free ball, the open foul
 *  options and (unless the stroke continues it) the miss run are gone. */
function afterStroke(fr: LiveFrame): LiveFrame {
  const { freeBall: _f, pending: _p, missRun: _m, ...rest } = fr;
  return { ...rest, shots: fr.shots + 1 };
}

/** Close the frame: record it, count it, start the next one or end the match. */
function endFrame(s: SnookerState, fr: LiveFrame, winner: Side, how: FrameHow, extra: Partial<FrameRecord> = {}): SnookerState {
  const visits = fr.visit.shots > 0 ? [...fr.visits, { ...fr.visit, end: 'frame' as const }] : fr.visits;
  const rec: FrameRecord = {
    n: fr.n, breaker: fr.breaker, score: [fr.score.home, fr.score.away], winner, how,
    ...(how === 'quick' ? { quick: true as const } : { visits, fouls: fr.fouls }),
    ...extra,
  };
  const framesWon = { ...s.framesWon, [winner]: s.framesWon[winner] + 1 };
  const ended = framesWon[winner] >= s.framesToWin;
  return {
    ...s, frames: [...s.frames, rec], framesWon, ended, winner: ended ? winner : null,
    frame: ended ? null : newFrame(fr.n + 1, breakerFor(s, fr.n + 1), s.reds), seq: s.seq + 1,
  };
}

/** After the last black is potted or fouled (S3 R4(a)): the frame ends, or —
 *  scores level — the black is re-spotted and the other player plays first
 *  until the lots are recorded (RESPOT_TURN). */
function blackDecides(s: SnookerState, fr: LiveFrame, how: FrameHow, last: Side): SnookerState {
  const { home, away } = fr.score;
  if (home !== away) return endFrame(s, fr, home > away ? 'home' : 'away', how);
  const striker = other(last);
  return { ...s, frame: { ...fr, on: 'black', respot: true, respotShots: 0, striker, visit: emptyVisit(striker) }, seq: s.seq + 1 };
}

// ------------------------------------------------------------ reducer --

/** B-02 — the actions that end a frame; each must carry `payload.frame`. */
export const FRAME_ENDERS: ReadonlySet<string> = new Set(['CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE']);

const isScore = (v: unknown): v is { home: number; away: number } => isObj(v) && num(v.home) !== undefined && num(v.away) !== undefined;
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) !== undefined && num(v[1]) !== undefined;
const ON_VALUES: readonly unknown[] = ['red', 'colour', ...COLOURS];

/** B-05 / B-13 — the reducer only advances a state with this engine's shape
 *  (a truncated snapshot or the billiards engine's state is left as it is). */
function validFrame(fr: unknown, reds: number): fr is LiveFrame {
  if (!isObj(fr) || !isObj(fr.visit)) return false;
  const v = fr.visit;
  return intIn(fr.n, 1, 99) !== undefined && isSide(fr.breaker) && isSide(fr.striker) && isScore(fr.score)
    && intIn(fr.redsLeft, 0, reds) !== undefined && ON_VALUES.includes(fr.on) && num(fr.shots) !== undefined
    && isSide(v.side) && num(v.pts) !== undefined && num(v.pots) !== undefined && num(v.shots) !== undefined
    && Array.isArray(fr.visits) && Array.isArray(fr.fouls);
}
export function isSnookerState(s: unknown): s is SnookerState {
  if (!isObj(s) || s.sport !== 'snooker' || !(s.reds === 6 || s.reds === 10 || s.reds === 15)) return false;
  if (intIn(s.framesToWin, 1, 18) === undefined || !Array.isArray(s.frames) || !isScore(s.framesWon) || !isSide(s.firstBreak) || num(s.seq) === undefined) return false;
  return s.frame === null ? s.ended === true : s.ended === false && validFrame(s.frame, s.reds);
}

export function reducer(s: SnookerState, a: SnookerAction): SnookerState {
  // B-05 / B-14 — never throw: a hostile action or payload leaves the state as it is
  try {
    return isSnookerState(s) ? reduce(s, a) : s;
  } catch {
    return s;
  }
}

function reduce(s: SnookerState, a: SnookerAction): SnookerState {
  if (!isObj(a) || typeof a.type !== 'string') return s;
  const fr = s.frame;
  if (s.ended || !fr) return s;
  const p = isObj(a.payload) ? a.payload : undefined;
  // B-02 — an action stamped with a frame number applies to that frame only,
  // and the ones that end a frame must carry it: a repeated or late tap can
  // never end the next frame
  const stampedFrame = own(p, 'frame');
  if (stampedFrame !== undefined && stampedFrame !== fr.n) return s;
  if (stampedFrame === undefined && FRAME_ENDERS.has(a.type)) return s;
  // a shot belongs to the striker: a tap naming the other side is stale
  const striking = a.side === undefined || a.side === fr.striker;
  const named = (): Side | undefined => {
    const v = own(p, 'side') ?? a.side;
    return isSide(v) ? v : undefined;
  };

  switch (a.type) {
    case 'POT': return striking ? pot(s, fr, p) : s;
    case 'MISS':
    case 'SAFETY': return striking ? endVisit(s, fr, a.type === 'MISS' ? 'miss' : 'safety') : s;
    case 'FOUL': {
      if (a.side !== undefined && !isSide(a.side)) return s;
      // B-03 — a non-striker penalty (S3 R3(k)) says so and names the
      // non-striker; any other FOUL naming a side must name the striker (a
      // repeated tap arrives after the turn has passed: stale, ignored)
      if (own(p, 'penalty') === true) return a.side === other(fr.striker) ? foul(s, fr, a.side, p) : s;
      return striking ? foul(s, fr, fr.striker, p) : s;
    }
    case 'FREE_BALL': {
      if (!fr.pending || fr.freeBall || !freeBallPossible(fr)) return s;
      return { ...s, frame: { ...fr, freeBall: true, fouls: markLastFoul(fr.fouls, true) }, seq: s.seq + 1 };
    }
    case 'PLAY_AGAIN': {
      // S3 R10(h)(ii), R13 — from where the balls lie; the free ball is void (R12(f))
      // and so is a miss sequence (R14(d)(iii))
      if (!fr.pending) return s;
      const by = fr.pending.by;
      const { freeBall: _f, pending: _p, missRun: _m, ...rest } = fr;
      return { ...s, frame: { ...rest, striker: by, visit: emptyVisit(by), fouls: markLastFoul(fr.fouls, false) }, seq: s.seq + 1 };
    }
    case 'REPLACE': {
      // S3 R14(b) — every ball back, the same ball on as before the stroke
      if (!fr.pending?.miss) return s;
      const run = fr.missRun;
      if (s.reds === 6 && run && run.count >= 5) return s; // S3 R19(a)
      const by = fr.pending.by;
      const warnAt = s.reds === 6 ? 4 : 2;
      const { freeBall: _f, pending: _p, ...rest } = fr;
      const missRun = run ? { ...run, replaced: true, warned: run.warned || run.count >= warnAt } : undefined;
      return {
        ...s,
        frame: { ...rest, striker: by, visit: emptyVisit(by), redsLeft: fr.pending.before.redsLeft, on: fr.pending.before.on, fouls: markLastFoul(fr.fouls, false), ...(missRun ? { missRun } : {}) },
        seq: s.seq + 1,
      };
    }
    case 'RESPOT_TURN': {
      const side = named();
      if (!side || !fr.respot || (fr.respotShots ?? 0) > 0) return s;
      return { ...s, frame: { ...fr, striker: side, visit: emptyVisit(side) }, seq: s.seq + 1 };
    }
    case 'BREAK_OFF': {
      const side = named();
      if (!side || fr.shots > 0 || fr.fouls.length > 0 || fr.respot) return s;
      return {
        ...s, ...(fr.n === 1 ? { firstBreak: side } : {}),
        frame: { ...fr, breaker: side, striker: side, visit: emptyVisit(side) }, seq: s.seq + 1,
      };
    }
    case 'CONCEDE': {
      const side = named();
      return side ? endFrame(s, fr, other(side), 'concede', { conceded: side }) : s;
    }
    case 'AWARD_FRAME': {
      const side = named();
      if (!side) return s;
      const r = own(p, 'reason');
      const reason = (AWARD_REASONS as readonly unknown[]).includes(r) ? (r as AwardReason) : undefined;
      return endFrame(s, fr, side, 'award', reason ? { reason } : {});
    }
    case 'FRAME_SCORE': {
      if (fr.shots > 0 || fr.fouls.length > 0 || fr.respot || fr.score.home !== 0 || fr.score.away !== 0) return s;
      const home = intIn(own(p, 'home'), 0, MAX_FRAME_SCORE);
      const away = intIn(own(p, 'away'), 0, MAX_FRAME_SCORE);
      if (home === undefined || away === undefined || home === away) return s;
      return endFrame(s, { ...fr, score: { home, away } }, home > away ? 'home' : 'away', 'quick');
    }
    default:
      return s;
  }
}

/** Set (or clear) the free-ball mark on the latest foul. */
function markLastFoul(fouls: FoulRecord[], fb: boolean): FoulRecord[] {
  const last = fouls[fouls.length - 1];
  if (!last || !!last.fb === fb) return fouls;
  const { fb: _x, ...rest } = last;
  return [...fouls.slice(0, -1), fb ? { ...rest, fb: true } : rest];
}

function pot(s: SnookerState, fr: LiveFrame, p: Record<string, unknown> | undefined): SnookerState {
  const ball = own(p, 'ball');
  if (typeof ball !== 'string') return s;
  let pts: number;
  let pots = 1;
  let on: On;
  let redsLeft = fr.redsLeft;
  let fb = false;

  if (ball === 'free') {
    // S3 R12(a)(ii) — the nominated ball takes the value of the ball on and is re-spotted
    if (!fr.freeBall || !freeBallPossible(fr)) return s;
    fb = true;
    if (fr.on === 'red') { pts = 1; on = 'colour'; } else { pts = ballValue(fr.on); on = fr.on; }
  } else if (ball === 'red') {
    // S3 R3(g) — every red potted in the stroke scores; with the free ball as a red, each (R12(e))
    if (fr.on !== 'red' || fr.respot) return s;
    const raw = own(p, 'reds');
    const n = raw === undefined ? 1 : intIn(raw, 1, fr.redsLeft);
    if (n === undefined || n > fr.redsLeft) return s;
    fb = own(p, 'free') === true;
    if (fb && !fr.freeBall) return s;
    pts = n + (fb ? 1 : 0);
    pots = pts;
    redsLeft = fr.redsLeft - n;
    on = 'colour';
  } else if (isColour(ball)) {
    if (fr.on === 'colour') {
      // S3 R3(h)(i) — any colour after a red; it is re-spotted
      pts = ballValue(ball);
      on = fr.redsLeft > 0 ? 'red' : 'yellow';
    } else if (fr.on === ball) {
      // S3 R3(h)(iii) — the colour on, in ascending order; it stays down
      pts = ballValue(ball);
      on = nextColour(ball) ?? 'black';
    } else return s;
  } else return s;

  const score = { ...fr.score, [fr.striker]: fr.score[fr.striker] + pts };
  const visit: Visit = { ...fr.visit, pts: fr.visit.pts + pts, pots: fr.visit.pots + pots, shots: fr.visit.shots + 1, ...(fb ? { fb: 1 as const } : {}) };
  const next: LiveFrame = { ...afterStroke(fr), score, visit, redsLeft, on, ...(fr.respot ? { respotShots: (fr.respotShots ?? 0) + 1 } : {}) };

  // the last black (S3 R4(a)) or the re-spotted black (R4(b)(iv))
  if (ball === 'black' && fr.on === 'black') {
    if (fr.respot) return endFrame(s, next, fr.striker, 'respot');
    if (score.home === score.away) {
      return blackDecides(s, { ...next, visits: [...next.visits, { ...visit, end: 'respot' }], visit: emptyVisit(fr.striker) }, 'black', fr.striker);
    }
    return endFrame(s, next, score.home > score.away ? 'home' : 'away', 'black');
  }
  return { ...s, frame: next, seq: s.seq + 1 };
}

function endVisit(s: SnookerState, fr: LiveFrame, end: 'miss' | 'safety'): SnookerState {
  if (full(fr)) return s;
  const striker = other(fr.striker);
  return {
    ...s,
    frame: {
      ...afterStroke(fr), visits: [...fr.visits, { ...fr.visit, end }], striker, visit: emptyVisit(striker),
      on: nextTurnOn(fr.on, fr.redsLeft), ...(fr.respot ? { respotShots: (fr.respotShots ?? 0) + 1 } : {}),
    },
    seq: s.seq + 1,
  };
}

function foul(s: SnookerState, fr: LiveFrame, by: Side, p: Record<string, unknown> | undefined): SnookerState {
  if (full(fr)) return s;
  const min = minFoul(fr);
  const v = num(own(p, 'value'));
  const value = v === undefined ? min : clamp(Math.round(v), min, 7);
  const k = own(p, 'kind');
  const kind = (FOUL_KINDS as readonly unknown[]).includes(k) ? (k as FoulKind) : undefined;

  if (by !== fr.striker) {
    // S3 R3(k) — the non-striker's penalty: points to the striker, the turn goes on;
    // on the re-spotted black any infringement ends the frame (R4(b)(iv))
    const score = { ...fr.score, [fr.striker]: fr.score[fr.striker] + value };
    const next: LiveFrame = { ...fr, score, fouls: [...fr.fouls, { by, value, ...(kind ? { kind } : {}), penalty: true }] };
    if (fr.respot) return endFrame(s, next, fr.striker, 'foul');
    return { ...s, frame: next, seq: s.seq + 1 };
  }

  const opp = other(by);
  const redsDown = fr.redsLeft > 0 ? clamp(Math.round(num(own(p, 'reds')) ?? 0), 0, fr.redsLeft) : 0;
  const miss = own(p, 'miss') === true;
  const redsLeft = fr.redsLeft - redsDown;
  const on = nextTurnOn(fr.on, redsLeft);
  const fbGiven = own(p, 'freeBall') === true && freeBallPossible({ on, respot: fr.respot });
  const rec: FoulRecord = { by, value, ...(kind ? { kind } : {}), ...(miss ? { miss: true as const } : {}), ...(fbGiven ? { fb: true as const } : {}), ...(redsDown ? { reds: redsDown } : {}) };
  const score = { ...fr.score, [opp]: fr.score[opp] + value };
  const visits = [...fr.visits, { ...fr.visit, end: 'foul' as const }];
  const base: LiveFrame = { ...afterStroke(fr), score, visits, fouls: [...fr.fouls, rec], striker: opp, visit: emptyVisit(opp), redsLeft, on };

  // a foul on the last black or the re-spotted black (S3 R4(a), R4(b)(iv))
  if (fr.respot) return endFrame(s, base, score.home > score.away ? 'home' : 'away', 'foul');
  if (fr.on === 'black') return blackDecides(s, base, 'foul', by);

  // S3 R14(d) — a foul and a miss continues the offender's run only straight
  // after their balls were replaced
  const prev = fr.missRun;
  const missRun: MissRun | undefined = miss
    ? (prev && prev.by === by && prev.replaced ? { by, count: prev.count + 1, replaced: false, warned: prev.warned } : { by, count: 1, replaced: false, warned: false })
    : undefined;
  return {
    ...s,
    frame: { ...base, pending: { by, miss, before: { redsLeft: fr.redsLeft, on: fr.on } }, ...(fbGiven ? { freeBall: true as const } : {}), ...(missRun ? { missRun } : {}) },
    seq: s.seq + 1,
  };
}

/** Replay a log from a fresh state (tests, tools, corrections). */
export function replay(config: Record<string, unknown> | undefined, actions: ReadonlyArray<SnookerAction>): SnookerState {
  const s0 = createInitialState(config);
  return Array.isArray(actions) ? actions.reduce((s, a) => reducer(s, a), s0) : s0;
}

// ---------------------------------------------------- match projections --
// B-05 — the projections run on stored snapshots (public, maybe old or cut
// short): they read only well-formed parts, and never throw.

/** Completed frames whose score is a pair of numbers. */
const goodFrames = (s: SnookerState): FrameRecord[] =>
  safe(() => (isObj(s) && Array.isArray(s.frames) ? s.frames.filter((f) => isObj(f) && isPair(f.score)) : []), []);
const wonOf = (s: SnookerState): { home: number; away: number } =>
  safe(() => (isObj(s) && isScore(s.framesWon) ? { home: s.framesWon.home, away: s.framesWon.away } : { home: 0, away: 0 }), { home: 0, away: 0 });
/** The frame in play, when the state is this engine's. */
const liveFrame = (s: SnookerState): LiveFrame | null => safe(() => (isSnookerState(s) ? s.frame : null), null);

export const isComplete = (s: SnookerState): boolean => safe(() => isObj(s) && s.ended === true, false);
export const winner = (s: SnookerState): Side | null => safe(() => (isObj(s) && s.ended === true && isSide(s.winner) ? s.winner : null), null);

export function result(s: SnookerState): { winner: Side; home: number; away: number } | null {
  const w = winner(s);
  if (!w) return null;
  const won = wonOf(s);
  return { winner: w, home: won.home, away: won.away };
}

const frameScores = (s: SnookerState): Array<[number, number]> => goodFrames(s).map((f) => [f.score[0], f.score[1]]);

/** The completed frames, "72-35, 12-80". */
export function scoreLine(s: SnookerState, perspective?: Side): string {
  return safe(() => lineOf(frameScores(s), { perspective: perspective === 'away' ? 'away' : undefined }), '');
}

/** The line score: every frame + the one in play (unit 'game' until the
 *  shared LineScore type has a 'frame' unit). */
export const lineScore = (s: SnookerState): LineScore | null => safe(() => {
  if (!isObj(s)) return null;
  const fr = liveFrame(s);
  return pointsLineScore('game', { games: frameScores(s), current: fr?.score, won: wonOf(s), ended: isComplete(s), toWin: intIn(s.framesToWin, 1, 18) ?? 1 });
}, null);

/** Frame points won by each side over every frame (+ the one in play). */
export function standingsUnits(s: SnookerState): { points: { home: number; away: number } } | null {
  return safe(() => {
    if (!isObj(s) || !Array.isArray(s.frames)) return null;
    const fr = liveFrame(s);
    const points = frameScores(s).reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: fr?.score.home ?? 0, away: fr?.score.away ?? 0 });
    return { points };
  }, null);
}

function remainingOf(fr: LiveFrame): number {
  if (fr.respot) return 7;
  if (fr.on === 'red') return fr.redsLeft * 8 + 27;
  if (fr.on === 'colour') return 7 + fr.redsLeft * 8 + 27;
  return COLOURS.slice(COLOURS.indexOf(fr.on)).reduce((t, c) => t + ballValue(c), 0);
}

/** Points left on the table (free balls aside). */
export function pointsRemaining(s: SnookerState): number {
  const fr = liveFrame(s);
  return fr ? safe(() => remainingOf(fr), 0) : 0;
}

/** How many snookers `side` needs to tie or win: the deficit beyond the points
 *  remaining, in penalties of the ball on (4, or the colour on's value). */
export function snookersRequired(s: SnookerState, side: Side): number {
  const fr = liveFrame(s);
  if (!fr || !isSide(side)) return 0;
  return safe(() => {
    const deficit = fr.score[other(side)] - fr.score[side];
    const left = remainingOf(fr);
    return deficit <= left ? 0 : Math.ceil((deficit - left) / minFoul(fr));
  }, 0);
}

/** What the scorer can tap now. */
export function ballOn(s: SnookerState): { on: On; redsLeft: number; freeBall: boolean; respot: boolean; allowed: Array<Ball | 'free'> } | null {
  const fr = liveFrame(s);
  if (!fr) return null;
  const free = fr.freeBall && freeBallPossible(fr) ? ['free' as const] : [];
  const allowed: Array<Ball | 'free'> = fr.respot ? ['black'] : fr.on === 'colour' ? [...COLOURS] : [fr.on, ...free];
  return { on: fr.respot ? 'black' : fr.on, redsLeft: fr.redsLeft, freeBall: !!fr.freeBall, respot: !!fr.respot, allowed };
}

/** The foul-and-a-miss sequence (S3 R14(d), six reds R19): the warning, a
 *  frame the referee may now award (15 / 10 reds), cue ball anywhere (6 reds). */
export function missStatus(s: SnookerState): { by: Side; count: number; warned: boolean; awardable: boolean; ballInHand: boolean } | null {
  const r = liveFrame(s)?.missRun;
  if (!isObj(r) || !isSide(r.by) || num(r.count) === undefined) return null;
  const six = s.reds === 6;
  return {
    by: r.by, count: r.count, warned: r.warned === true,
    awardable: !six && r.warned === true && !r.replaced && r.count > 2,
    ballInHand: six && !r.replaced && r.count >= 5,
  };
}

const NO_SUMMARY: ScoreSummary = { homeScore: '0', awayScore: '0', statusLine: '' };

/** Scoreboard: live = this frame's points; once ended = frames won + the line. */
export function summary(s: SnookerState): ScoreSummary {
  return safe(() => {
    if (!isObj(s)) return NO_SUMMARY;
    if (isComplete(s)) return finalSummary(wonOf(s), scoreLine(s));
    const fr = liveFrame(s);
    if (!fr) return NO_SUMMARY;
    const won = wonOf(s);
    const line = scoreLine(s);
    const parts = [`Frames ${won.home}–${won.away}${line ? ` (${line})` : ''}`, `best of ${s.bestOf}`];
    if (fr.visit.pts > 0) parts.push(`break ${fr.visit.pts}`);
    parts.push(`${remainingOf(fr)} left`);
    if (snookersRequired(s, 'home') > 0 || snookersRequired(s, 'away') > 0) parts.push('snookers required');
    return {
      homeScore: String(fr.score.home),
      awayScore: String(fr.score.away),
      statusLine: `Frame ${fr.n}${fr.respot ? ' · re-spotted black' : ''}`,
      detailLine: parts.join(' · '),
    };
  }, NO_SUMMARY);
}

// ------------------------------------------------------------ statistics --

export interface SnookerSideStats {
  framesWon: number;
  /** frame points over every frame (quick frames included) */
  points: number;
  /** points from pots (shot-by-shot frames) */
  potted: number;
  penaltyReceived: number;
  penaltyConceded: number;
  fouls: number;
  foulsByKind: Partial<Record<FoulKind, number>>;
  /** "foul and a miss" calls against the side */
  missesCalled: number;
  /** free balls the side was given */
  freeBalls: number;
  visits: number;
  potStrokes: number;
  missedPots: number;
  safeties: number;
  /** potting strokes ÷ (potting strokes + missed pots); null = none attempted */
  potSuccess: number | null;
  /** every break of 1 or more, in the order made */
  breaks: number[];
  highestBreak: number;
  fiftyPlus: number;
  centuries: number;
  maximums: number;
  detailedFrames: number;
  quickFrames: number;
}

const zeroStats = (): SnookerSideStats => ({
  framesWon: 0, points: 0, potted: 0, penaltyReceived: 0, penaltyConceded: 0, fouls: 0, foulsByKind: {}, missesCalled: 0, freeBalls: 0,
  visits: 0, potStrokes: 0, missedPots: 0, safeties: 0, potSuccess: null, breaks: [], highestBreak: 0, fiftyPlus: 0, centuries: 0,
  maximums: 0, detailedFrames: 0, quickFrames: 0,
});

/** Every frame as stats read it: completed ones, then the one in play (its
 *  break in progress counted as a visit once it has a stroke). */
type StatVisit = Visit & { end?: VisitEnd };
interface StatFrame { n: number; quick: boolean; untouched: boolean; score: [number, number]; visits: StatVisit[]; fouls: FoulRecord[] }
/** B-01 — records from a stored (public) snapshot are read only when they
 *  are well formed: a real side and finite numbers. A side of "__proto__" or
 *  "constructor" can never index the stats objects; an unknown foul kind is
 *  dropped (the foul still counts). */
const goodVisit = (v: unknown): v is StatVisit =>
  isObj(v) && isSide(v.side) && num(v.pts) !== undefined && num(v.shots) !== undefined && num(v.pots) !== undefined;
const goodFoul = (x: unknown): x is FoulRecord => isObj(x) && isSide(x.by) && num(x.value) !== undefined;
const knownKind = (k: unknown): k is FoulKind => (FOUL_KINDS as readonly unknown[]).includes(k);
const goodList = <T,>(v: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(ok) : []);
function framesForStats(s: SnookerState): StatFrame[] {
  const out: StatFrame[] = goodFrames(s).map((f) => ({
    n: num(f.n) ?? 0, quick: f.quick === true, untouched: false, score: f.score, visits: goodList(f.visits, goodVisit), fouls: goodList(f.fouls, goodFoul),
  }));
  const fr = liveFrame(s);
  if (fr) {
    const touched = fr.shots > 0 || fr.fouls.length > 0 || fr.visit.shots > 0;
    out.push({
      n: fr.n, quick: false, untouched: !touched, score: [fr.score.home, fr.score.away],
      visits: goodList([...fr.visits, ...(fr.visit.shots > 0 ? [fr.visit] : [])], goodVisit), fouls: goodList(fr.fouls, goodFoul),
    });
  }
  return out;
}

export function snookerStats(s: SnookerState): { home: SnookerSideStats; away: SnookerSideStats } {
  return safe(() => statsOf(s), { home: zeroStats(), away: zeroStats() });
}

function statsOf(s: SnookerState): { home: SnookerSideStats; away: SnookerSideStats } {
  const out = { home: zeroStats(), away: zeroStats() };
  if (!isObj(s)) return out;
  const max = maxBreak(s.reds === 6 || s.reds === 10 ? s.reds : 15);
  for (const f of framesForStats(s)) {
    for (const side of ['home', 'away'] as const) {
      const t = out[side];
      t.points += f.score[side === 'home' ? 0 : 1];
      if (f.untouched) continue;
      if (f.quick) t.quickFrames++; else t.detailedFrames++;
    }
    for (const v of f.visits) {
      const t = out[v.side];
      t.visits++;
      t.potted += v.pts;
      t.potStrokes += v.shots;
      if (v.end === 'miss') t.missedPots++;
      if (v.end === 'safety') t.safeties++;
      if (v.pts > 0) t.breaks.push(v.pts);
      t.highestBreak = Math.max(t.highestBreak, v.pts);
      if (v.pts >= 50) t.fiftyPlus++;
      if (v.pts >= 100) t.centuries++;
      if (v.pts === max && !v.fb) t.maximums++;
    }
    for (const x of f.fouls) {
      const t = out[x.by];
      const o = out[other(x.by)];
      t.fouls++;
      t.penaltyConceded += x.value;
      o.penaltyReceived += x.value;
      if (x.miss) t.missesCalled++;
      if (x.fb) o.freeBalls++;
      if (knownKind(x.kind)) t.foulsByKind[x.kind] = (t.foulsByKind[x.kind] ?? 0) + 1;
    }
  }
  const won = wonOf(s);
  for (const side of ['home', 'away'] as const) {
    const t = out[side];
    t.framesWon = won[side];
    const tries = t.potStrokes + t.missedPots;
    t.potSuccess = tries > 0 ? t.potStrokes / tries : null;
  }
  return out;
}

/** Every break of at least `min` (default 1): side, frame number, points. */
export function breaks(s: SnookerState, min = 1): Array<{ side: Side; frame: number; pts: number }> {
  const m = num(min) ?? 1;
  return safe(() => {
    const out: Array<{ side: Side; frame: number; pts: number }> = [];
    for (const f of framesForStats(s)) for (const v of f.visits) if (v.pts >= m && v.pts > 0) out.push({ side: v.side, frame: f.n, pts: v.pts });
    return out;
  }, []);
}
