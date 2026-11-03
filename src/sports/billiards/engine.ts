/**
 * English billiards engine. Rules from the WPBSA Rules of the Game of English
 * Billiards, revised May 2022 ("S3 R4(d)" = Section 3, Rule 4(d)); IBSF World
 * Billiards plays under them. Formats: N-up frames, best of N (the IBSF short
 * format is 150-up), a single N-up game, a timed game. Design, sources and
 * the action vocabulary: docs/sports/SNOOKER_BILLIARDS_DESIGN.md.
 *
 * Shot by shot: a scoring stroke is any combination of pot red (3), pot white
 * (2), in-off red (3), in-off white (2) and cannon (2) (S3 R4). A VISIT is one
 * turn at the table (a break); it ends with a missed attempt, a safety, a foul
 * (2 points to the opponent, S3 R16(c)) or the frame's end. Quick mode records
 * a frame's final score in one FRAME_SCORE.
 *
 * PURE: never mutates, never throws on bad input (an action it can't apply
 * returns the same state object), deterministic on replay. Undo = the live
 * layer replaying the log without its last event. IDs only: the state holds
 * sides and numbers; payload fields are read one by one from a fixed list.
 */
import type { ScoreSummary } from '../types';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from '../scoreline.ts';

export type Side = 'home' | 'away';

/** S3 R4 — the parts of a scoring stroke and what each scores. */
export const PARTS = ['potRed', 'potWhite', 'inOffRed', 'inOffWhite', 'cannon'] as const;
export type Part = typeof PARTS[number];
const PART_VALUE: Record<Part, number> = { potRed: 3, potWhite: 2, inOffRed: 3, inOffWhite: 2, cannon: 2 };

export type VisitEnd = 'miss' | 'safety' | 'foul' | 'frame';
/** One turn at the table: the break (`pts`), its scoring strokes and their parts. */
export interface Visit { side: Side; pts: number; shots: number; potRed: number; potWhite: number; inOffRed: number; inOffWhite: number; cannon: number }
export interface VisitRecord extends Visit { end: VisitEnd }

/** Optional foul types (the S3 R15 list, grouped; `miss` = S3 R17). */
export const FOUL_KINDS = ['miss', 'coup', 'inHand', 'push', 'jump', 'touch', 'offTable', 'hazards', 'cannons', 'baulkLine', 'other'] as const;
export type FoulKind = typeof FOUL_KINDS[number];
export interface FoulRecord { by: Side; value: number; kind?: FoulKind }

export interface LiveFrame {
  n: number;
  breaker: Side;
  striker: Side;
  /** points as scored (a points game's winner is recorded at the target) */
  score: { home: number; away: number };
  visit: Visit;
  visits: VisitRecord[];
  fouls: FoulRecord[];
  /** consecutive strokes of hazards without a cannon / cannons without a hazard (S3 R10–R11) */
  hazardRun: number;
  cannonRun: number;
  /** strokes played in this frame */
  shots: number;
  /** timed game level at TIME: the next score or foul wins (`timedTie: 'sudden'`) */
  sudden?: true;
  /** cue batch 6 — consecutive strokes of this visit that potted the red (the
   *  red-to-centre hint); absent when 0. Position only, never a score. */
  redRun?: number;
}

export type FrameHow = 'target' | 'time' | 'sudden' | 'draw' | 'concede' | 'award' | 'quick';
export const AWARD_REASONS = ['conduct', 'time', 'other'] as const;
export type AwardReason = typeof AWARD_REASONS[number];

export interface FrameRecord {
  n: number;
  breaker: Side;
  /** the frame as recorded: a points game's winner at the target (S3 R5(d)) */
  score: [number, number];
  /** the points as scored, when they differ from `score` */
  raw?: [number, number];
  winner: Side | 'draw';
  how: FrameHow;
  quick?: true;
  visits?: VisitRecord[];
  fouls?: FoulRecord[];
  conceded?: Side;
  reason?: AwardReason;
}

export interface BilliardsState {
  sport: 'billiards';
  format: 'points' | 'timed';
  /** points per frame (points format) */
  target: number;
  bestOf: number;
  framesToWin: number;
  foulPoints: number;
  /** 0 = no limit */
  hazardLimit: number;
  cannonLimit: number;
  timedTie: 'sudden' | 'draw';
  firstBreak: Side;
  /** the scorer tapped who won the toss (absent = game 1 broke off as set up) */
  tossed?: true;
  scoringMode: 'shot' | 'quick';
  frames: FrameRecord[];
  framesWon: { home: number; away: number };
  frame: LiveFrame | null;
  ended: boolean;
  winner: Side | 'draw' | null;
  seq: number;
}

export interface BilliardsAction { type: string; side?: Side; payload?: Record<string, unknown> }

// ------------------------------------------------------------ helpers --

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o: Record<string, unknown> | undefined, k: string): unknown =>
  (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const intIn = (v: unknown, min: number, max: number): number | undefined => {
  const n = num(v);
  // B-11 — `+ 0` stores -0 as 0, so a JSON round trip stays deep-equal
  return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n + 0 : undefined;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const emptyVisit = (side: Side): Visit => ({ side, pts: 0, shots: 0, potRed: 0, potWhite: 0, inOffRed: 0, inOffWhite: 0, cannon: 0 });

/** The highest frame score quick mode accepts. */
export const MAX_FRAME_SCORE = 99999;
/** B-04 — the most visits + fouls one frame keeps. Each record copies the
 *  frame's lists, so an unbounded frame made every replay quadratic; past
 *  the cap the turn can't pass (scoring strokes and TIME / CONCEDE / AWARD
 *  still work). */
export const MAX_FRAME_RECORDS = 5000;
const full = (fr: LiveFrame): boolean => fr.visits.length + fr.fouls.length >= MAX_FRAME_RECORDS;

function readBestOf(v: unknown, dflt: number): number {
  const n = num(v);
  if (n === undefined) return dflt;
  let b = clamp(Math.round(n), 1, 35);
  if (b % 2 === 0) b = b + 1 > 35 ? b - 1 : b + 1;
  return b;
}

const breakerFor = (s: Pick<BilliardsState, 'firstBreak'>, n: number): Side => (n % 2 === 1 ? s.firstBreak : other(s.firstBreak));

function newFrame(n: number, breaker: Side): LiveFrame {
  return { n, breaker, striker: breaker, score: { home: 0, away: 0 }, visit: emptyVisit(breaker), visits: [], fouls: [], hazardRun: 0, cannonRun: 0, shots: 0 };
}

/** B-05 / B-14 — the last net under "never throw": a hostile object (a
 *  getter or Proxy that throws) gives the fallback instead. */
function safe<T>(f: () => T, fallback: T): T {
  try { return f(); } catch { return fallback; }
}

export function createInitialState(config?: Record<string, unknown>): BilliardsState {
  const c = safe(() => (isObj(config) ? config : undefined), undefined);
  const read = (k: string): unknown => safe(() => own(c, k), undefined);
  const format = read('format') === 'timed' ? 'timed' : 'points';
  const t = num(read('target'));
  const target = t === undefined ? 150 : clamp(Math.round(t), 10, 5000);
  const bestOf = format === 'timed' ? 1 : readBestOf(read('bestOf'), 5);
  const fp = num(read('foulPoints'));
  const fb = read('firstBreak');
  const firstBreak: Side = isSide(fb) ? fb : 'home';
  return {
    sport: 'billiards', format, target, bestOf, framesToWin: (bestOf + 1) / 2,
    foulPoints: fp === undefined ? 2 : clamp(Math.round(fp), 1, 7),
    hazardLimit: intIn(read('hazardLimit'), 0, 999) ?? 15,
    cannonLimit: intIn(read('cannonLimit'), 0, 999) ?? 75,
    timedTie: read('timedTie') === 'draw' ? 'draw' : 'sudden',
    firstBreak,
    scoringMode: read('scoringMode') === 'quick' ? 'quick' : 'shot',
    frames: [], framesWon: { home: 0, away: 0 }, frame: newFrame(1, firstBreak), ended: false, winner: null, seq: 0,
  };
}
export const init = createInitialState;

/** The parts of a stroke from a payload: each true / 1 (yes) or false / 0 /
 *  absent (no). Anything else, no part, or both in-offs (one cue ball) = not
 *  a stroke (null). */
export function readStroke(p: Record<string, unknown> | undefined): Record<Part, 0 | 1> | null {
  if (!p) return null;
  const out = { potRed: 0, potWhite: 0, inOffRed: 0, inOffWhite: 0, cannon: 0 } as Record<Part, 0 | 1>;
  let any = false;
  for (const k of PARTS) {
    const v = own(p, k);
    if (v === true || v === 1) { out[k] = 1; any = true; } else if (!(v === undefined || v === false || v === 0)) return null;
  }
  if (!any || (out.inOffRed && out.inOffWhite)) return null;
  return out;
}

/** What a stroke scores (S3 R4); 0 when it isn't a valid stroke. */
export function strokeValue(p: Record<string, unknown>): number {
  return safe(() => {
    const parts = readStroke(isObj(p) ? p : undefined);
    return parts ? PARTS.reduce((t, k) => t + parts[k] * PART_VALUE[k], 0) : 0;
  }, 0);
}

/** Close the frame: record it, count it, start the next or end the match. */
function endFrame(s: BilliardsState, fr: LiveFrame, winner: Side | 'draw', how: FrameHow, extra: Partial<FrameRecord> = {}): BilliardsState {
  const visits = fr.visit.shots > 0 ? [...fr.visits, { ...fr.visit, end: 'frame' as const }] : fr.visits;
  const raw: [number, number] = [fr.score.home, fr.score.away];
  // S3 R5(d) — only the points required are counted
  const score: [number, number] = s.format === 'points' && winner !== 'draw' && how !== 'concede' && how !== 'award'
    ? [Math.min(raw[0], s.target), Math.min(raw[1], s.target)] : raw;
  const rec: FrameRecord = {
    n: fr.n, breaker: fr.breaker, score, ...(score[0] !== raw[0] || score[1] !== raw[1] ? { raw } : {}), winner, how,
    ...(how === 'quick' ? { quick: true as const } : { visits, fouls: fr.fouls }),
    ...extra,
  };
  const framesWon = winner === 'draw' ? s.framesWon : { ...s.framesWon, [winner]: s.framesWon[winner] + 1 };
  const ended = winner === 'draw' || framesWon[winner] >= s.framesToWin;
  return {
    ...s, frames: [...s.frames, rec], framesWon, ended, winner: ended ? winner : null,
    frame: ended ? null : newFrame(fr.n + 1, breakerFor(s, fr.n + 1)), seq: s.seq + 1,
  };
}

/** After points go on the board: a points game is won at the target; a
 *  timed game in sudden death by the first score or foul. */
function decided(s: BilliardsState, fr: LiveFrame, side: Side): BilliardsState {
  if (s.format === 'points' && fr.score[side] >= s.target) return endFrame(s, fr, side, 'target');
  if (fr.sudden) return endFrame(s, fr, side, 'sudden');
  return { ...s, frame: fr, seq: s.seq + 1 };
}

// ------------------------------------------------------------ reducer --

/** B-02 — the actions that end a frame; each must carry `payload.frame`. */
export const FRAME_ENDERS: ReadonlySet<string> = new Set(['CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE']);

const isScore = (v: unknown): v is { home: number; away: number } => isObj(v) && num(v.home) !== undefined && num(v.away) !== undefined;
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) !== undefined && num(v[1]) !== undefined;

/** B-05 / B-13 — the reducer only advances a state with this engine's shape
 *  (a truncated snapshot or the snooker engine's state is left as it is). */
function validFrame(fr: unknown): fr is LiveFrame {
  if (!isObj(fr) || !isObj(fr.visit)) return false;
  const v = fr.visit;
  return intIn(fr.n, 1, 99) !== undefined && isSide(fr.breaker) && isSide(fr.striker) && isScore(fr.score)
    && num(fr.hazardRun) !== undefined && num(fr.cannonRun) !== undefined && num(fr.shots) !== undefined
    && isSide(v.side) && ['pts', 'shots', ...PARTS].every((k) => num(v[k]) !== undefined)
    && Array.isArray(fr.visits) && Array.isArray(fr.fouls);
}
export function isBilliardsState(s: unknown): s is BilliardsState {
  if (!isObj(s) || s.sport !== 'billiards' || (s.format !== 'points' && s.format !== 'timed')) return false;
  if (intIn(s.framesToWin, 1, 18) === undefined || intIn(s.target, 10, 5000) === undefined || num(s.foulPoints) === undefined
    || num(s.hazardLimit) === undefined || num(s.cannonLimit) === undefined || !Array.isArray(s.frames) || !isScore(s.framesWon)
    || !isSide(s.firstBreak) || num(s.seq) === undefined) return false;
  return s.frame === null ? s.ended === true : s.ended === false && validFrame(s.frame);
}

export function reducer(s: BilliardsState, a: BilliardsAction): BilliardsState {
  // B-05 / B-14 — never throw: a hostile action or payload leaves the state as it is
  try {
    return isBilliardsState(s) ? reduce(s, a) : s;
  } catch {
    return s;
  }
}

function reduce(s: BilliardsState, a: BilliardsAction): BilliardsState {
  if (!isObj(a) || typeof a.type !== 'string') return s;
  const fr = s.frame;
  if (s.ended || !fr) return s;
  const p = isObj(a.payload) ? a.payload : undefined;
  // B-02 — an action stamped with a frame number applies to that frame only,
  // and the ones that end a frame must carry it
  const stampedFrame = own(p, 'frame');
  if (stampedFrame !== undefined && stampedFrame !== fr.n) return s;
  if (stampedFrame === undefined && FRAME_ENDERS.has(a.type)) return s;
  const striking = a.side === undefined || a.side === fr.striker;
  // B-16 — the side an action names: the payload's and the action's must
  // agree when both are given; a junk one refuses the action
  const named = (): Side | undefined => {
    const ps = own(p, 'side');
    if (ps !== undefined && a.side !== undefined && ps !== a.side) return undefined;
    const v = ps !== undefined ? ps : a.side;
    return isSide(v) ? v : undefined;
  };

  switch (a.type) {
    case 'SCORE': {
      if (!striking) return s;
      const parts = readStroke(p);
      if (!parts) return s;
      const hazard = parts.potRed || parts.potWhite || parts.inOffRed || parts.inOffWhite;
      const cannon = parts.cannon;
      let hazardRun = 0;
      let cannonRun = 0;
      if (hazard && !cannon) {
        // S3 R11, R15(k) — the 16th consecutive hazard is a foul
        if (s.hazardLimit > 0 && fr.hazardRun >= s.hazardLimit) return foul(s, fr, 'hazards');
        hazardRun = fr.hazardRun + 1;
      } else if (cannon && !hazard) {
        // S3 R10, R15(l) — the 76th consecutive cannon is a foul
        if (s.cannonLimit > 0 && fr.cannonRun >= s.cannonLimit) return foul(s, fr, 'cannons');
        cannonRun = fr.cannonRun + 1;
      }
      const pts = PARTS.reduce((t, k) => t + parts[k] * PART_VALUE[k], 0);
      const v = fr.visit;
      const visit: Visit = {
        ...v, pts: v.pts + pts, shots: v.shots + 1, potRed: v.potRed + parts.potRed, potWhite: v.potWhite + parts.potWhite,
        inOffRed: v.inOffRed + parts.inOffRed, inOffWhite: v.inOffWhite + parts.inOffWhite, cannon: v.cannon + parts.cannon,
      };
      const score = { ...fr.score, [fr.striker]: fr.score[fr.striker] + pts };
      const { redRun: run, ...rest } = fr;
      const redRun = parts.potRed ? (num(run) ?? 0) + 1 : 0;
      return decided(s, { ...rest, score, visit, hazardRun, cannonRun, shots: fr.shots + 1, ...(redRun ? { redRun } : {}) }, fr.striker);
    }
    case 'MISS':
    case 'SAFETY': {
      if (!striking || full(fr)) return s;
      const striker = other(fr.striker);
      const { redRun: _r, ...rest } = fr;
      return {
        ...s,
        frame: { ...rest, visits: [...fr.visits, { ...fr.visit, end: a.type === 'MISS' ? 'miss' : 'safety' }], striker, visit: emptyVisit(striker), hazardRun: 0, cannonRun: 0, shots: fr.shots + 1 },
        seq: s.seq + 1,
      };
    }
    case 'FOUL': {
      if (!striking) return s;
      const k = own(p, 'kind');
      return foul(s, fr, (FOUL_KINDS as readonly unknown[]).includes(k) ? (k as FoulKind) : undefined);
    }
    case 'TIME': {
      // S3 R5(a)–(c) — time called in a timed game
      if (s.format !== 'timed' || fr.sudden) return s;
      const { home, away } = fr.score;
      if (home !== away) return endFrame(s, fr, home > away ? 'home' : 'away', 'time');
      if (s.timedTie === 'draw') return endFrame(s, fr, 'draw', 'draw');
      return { ...s, frame: { ...fr, sudden: true }, seq: s.seq + 1 };
    }
    case 'BREAK_OFF': {
      const side = named();
      if (!side || fr.shots > 0) return s;
      // B-15 — naming the player already breaking changes nothing (frame 1:
      // once the toss is recorded; the first tap records it, even for them)
      if (side === fr.breaker && side === fr.striker && (fr.n !== 1 || (side === s.firstBreak && s.tossed === true))) return s;
      return { ...s, ...(fr.n === 1 ? { firstBreak: side, tossed: true as const } : {}), frame: { ...fr, breaker: side, striker: side, visit: emptyVisit(side) }, seq: s.seq + 1 };
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
      if (fr.shots > 0 || fr.score.home !== 0 || fr.score.away !== 0) return s;
      const home = intIn(own(p, 'home'), 0, MAX_FRAME_SCORE);
      const away = intIn(own(p, 'away'), 0, MAX_FRAME_SCORE);
      if (home === undefined || away === undefined) return s;
      if (s.format === 'points') {
        // the winner reached the target, the loser didn't (recorded at the target)
        const hi = Math.max(home, away);
        const lo = Math.min(home, away);
        if (hi < s.target || lo >= s.target) return s;
        const w: Side = home > away ? 'home' : 'away';
        const score = { home: w === 'home' ? s.target : home, away: w === 'away' ? s.target : away };
        return endFrame(s, { ...fr, score }, w, 'quick');
      }
      if (home === away) return s.timedTie === 'draw' ? endFrame(s, { ...fr, score: { home, away } }, 'draw', 'quick') : s;
      return endFrame(s, { ...fr, score: { home, away } }, home > away ? 'home' : 'away', 'quick');
    }
    default:
      return s;
  }
}

/** S3 R16(b)–(c) — the striker's foul: points before it count, none in it;
 *  `foulPoints` (2) to the opponent; the turn passes. */
function foul(s: BilliardsState, fr: LiveFrame, kind: FoulKind | undefined): BilliardsState {
  if (full(fr)) return s;
  const by = fr.striker;
  const opp = other(by);
  const score = { ...fr.score, [opp]: fr.score[opp] + s.foulPoints };
  const { redRun: _r, ...rest } = fr;
  const next: LiveFrame = {
    ...rest, score, visits: [...fr.visits, { ...fr.visit, end: 'foul' }], fouls: [...fr.fouls, { by, value: s.foulPoints, ...(kind ? { kind } : {}) }],
    striker: opp, visit: emptyVisit(opp), hazardRun: 0, cannonRun: 0, shots: fr.shots + 1,
  };
  return decided(s, next, opp);
}

/** Replay a log from a fresh state (tests, tools, corrections). */
export function replay(config: Record<string, unknown> | undefined, actions: ReadonlyArray<BilliardsAction>): BilliardsState {
  const s0 = createInitialState(config);
  return Array.isArray(actions) ? actions.reduce((s, a) => reducer(s, a), s0) : s0;
}

// ---------------------------------------------------- match projections --
// B-05 — the projections run on stored snapshots (public, maybe old or cut
// short): they read only well-formed parts, and never throw.

/** Completed frames whose score is a pair of numbers. */
const goodFrames = (s: BilliardsState): FrameRecord[] =>
  safe(() => (isObj(s) && Array.isArray(s.frames) ? s.frames.filter((f) => isObj(f) && isPair(f.score)) : []), []);
const wonOf = (s: BilliardsState): { home: number; away: number } =>
  safe(() => (isObj(s) && isScore(s.framesWon) ? { home: s.framesWon.home, away: s.framesWon.away } : { home: 0, away: 0 }), { home: 0, away: 0 });
/** The frame in play, when the state is this engine's. */
const liveFrame = (s: BilliardsState): LiveFrame | null => safe(() => (isBilliardsState(s) ? s.frame : null), null);

export const isComplete = (s: BilliardsState): boolean => safe(() => isObj(s) && s.ended === true, false);
export const winner = (s: BilliardsState): Side | 'draw' | null =>
  safe(() => (isObj(s) && s.ended === true && (isSide(s.winner) || s.winner === 'draw') ? s.winner : null), null);

/** B-07 — a single game decided on the table (not conceded or awarded):
 *  its points are the result; otherwise the frames won. */
const playedOutGame = (s: BilliardsState): FrameRecord | null => {
  const first = goodFrames(s)[0];
  return s.bestOf === 1 && first && first.how !== 'concede' && first.how !== 'award' ? first : null;
};

/** A single game played out reports its points to the standings (150–87); a
 *  best-of match, or a game conceded or awarded (B-07), its frames won. */
export function result(s: BilliardsState): { winner: Side | 'draw'; home: number; away: number } | null {
  const w = winner(s);
  if (!w) return null;
  const first = safe(() => playedOutGame(s), null);
  if (first) return { winner: w, home: first.score[0], away: first.score[1] };
  const won = wonOf(s);
  return { winner: w, home: won.home, away: won.away };
}

const frameScores = (s: BilliardsState): Array<[number, number]> => goodFrames(s).map((f) => [f.score[0], f.score[1]]);

export function scoreLine(s: BilliardsState, perspective?: Side): string {
  return safe(() => lineOf(frameScores(s), { perspective: perspective === 'away' ? 'away' : undefined }), '');
}

export const lineScore = (s: BilliardsState): LineScore | null => safe(() => {
  if (!isObj(s)) return null;
  const fr = liveFrame(s);
  return pointsLineScore('game', { games: frameScores(s), current: fr?.score, won: wonOf(s), ended: isComplete(s), toWin: intIn(s.framesToWin, 1, 18) ?? 1 });
}, null);

export function standingsUnits(s: BilliardsState): { points: { home: number; away: number } } | null {
  return safe(() => {
    if (!isObj(s) || !Array.isArray(s.frames)) return null;
    const fr = liveFrame(s);
    const points = frameScores(s).reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: fr?.score.home ?? 0, away: fr?.score.away ?? 0 });
    return { points };
  }, null);
}

/** Did the scorer tap who won the toss? (No: game 1 broke off as set up.) */
export const tossRecorded = (s: BilliardsState): boolean => isObj(s) && s.tossed === true;

/** The league table counts points (founder 2026-10-28): every frame's points
 *  (a match ended by hand: the frames so far, the one in play included; null
 *  on a bad snapshot). The table reads finished matches only, and the winner is
 *  still whoever won on frames. */
export function standingsScore(s: BilliardsState): { home: number; away: number } | null {
  return safe(() => (isObj(s) ? standingsUnits(s)?.points ?? null : null), null);
}

/** Cue batch 6 (audit row 15) — the scorer's hint: the red was potted twice
 *  running from the billiard spot, so it goes on the centre spot (WPBSA
 *  billiards; position only, no score). After a red pot the red is spotted
 *  on the billiard spot, so in a run of red pots the 2nd and 3rd come from
 *  the spot: the 3rd sends it to the centre spot, the 4th (from the centre)
 *  back to the billiard spot, and so on. Where the visit's first red came
 *  from isn't recorded, so the scorer still judges the first one. */
export function redToCentre(s: BilliardsState): boolean {
  return safe(() => {
    const run = num((liveFrame(s) as { redRun?: unknown } | null)?.redRun);
    return run !== undefined && Number.isInteger(run) && run >= 3 && run % 3 === 0;
  }, false);
}

/** The consecutive-stroke counts and the referee's calls (TEN HAZARDS /
 *  SEVENTY CANNONS = 5 strokes before the limit). */
export function limits(s: BilliardsState): { hazards: number; cannons: number; tenHazards: boolean; seventyCannons: boolean } {
  const none = { hazards: 0, cannons: 0, tenHazards: false, seventyCannons: false };
  const fr = liveFrame(s);
  if (!fr) return none;
  return safe(() => ({
    hazards: fr.hazardRun, cannons: fr.cannonRun,
    tenHazards: s.hazardLimit > 0 && fr.hazardRun >= Math.max(1, s.hazardLimit - 5),
    seventyCannons: s.cannonLimit > 0 && fr.cannonRun >= Math.max(1, s.cannonLimit - 5),
  }), none);
}

const NO_SUMMARY: ScoreSummary = { homeScore: '0', awayScore: '0', statusLine: '' };

export function summary(s: BilliardsState): ScoreSummary {
  return safe(() => {
    if (!isObj(s)) return NO_SUMMARY;
    if (isComplete(s)) {
      const first = playedOutGame(s);
      if (first) {
        const [h, a] = first.score;
        return { homeScore: String(h), awayScore: String(a), statusLine: s.winner === 'draw' ? 'Match Over · Draw' : 'Match Over', detailLine: s.format === 'timed' ? 'Timed game' : `${s.target}-up` };
      }
      return finalSummary(wonOf(s), scoreLine(s));
    }
    const fr = liveFrame(s);
    if (!fr) return NO_SUMMARY;
    const won = wonOf(s);
    const line = scoreLine(s);
    const parts: string[] = [];
    if (s.bestOf > 1) parts.push(`Frames ${won.home}–${won.away}${line ? ` (${line})` : ''}`, `best of ${s.bestOf}`);
    parts.push(s.format === 'timed' ? 'timed' : `${s.target}-up`);
    if (fr.visit.pts > 0) parts.push(`break ${fr.visit.pts}`);
    const lim = limits(s);
    if (lim.tenHazards) parts.push(`${lim.hazards} hazards`);
    if (lim.seventyCannons) parts.push(`${lim.cannons} cannons`);
    const status = s.bestOf > 1 ? `Frame ${fr.n}` : s.format === 'timed' ? 'Timed game' : 'Game';
    return {
      homeScore: String(fr.score.home),
      awayScore: String(fr.score.away),
      statusLine: fr.sudden ? `${status} · sudden death` : status,
      detailLine: parts.join(' · '),
    };
  }, NO_SUMMARY);
}

// ------------------------------------------------------------ statistics --

export interface BilliardsSideStats {
  framesWon: number;
  /** frame scores as recorded (a points game's winner at the target) */
  points: number;
  /** points from scoring strokes, every point of every break */
  scored: number;
  penaltyReceived: number;
  penaltyConceded: number;
  fouls: number;
  foulsByKind: Partial<Record<FoulKind, number>>;
  visits: number;
  shots: number;
  /** visits ended by a missed attempt */
  misses: number;
  safeties: number;
  breaks: number[];
  highestBreak: number;
  fiftyPlus: number;
  centuries: number;
  doubleCenturies: number;
  /** points from strokes per visit (the billiards "average"); null = no visit */
  average: number | null;
  potRed: number;
  potWhite: number;
  inOffRed: number;
  inOffWhite: number;
  cannons: number;
  detailedFrames: number;
  quickFrames: number;
}

const zeroStats = (): BilliardsSideStats => ({
  framesWon: 0, points: 0, scored: 0, penaltyReceived: 0, penaltyConceded: 0, fouls: 0, foulsByKind: {}, visits: 0, shots: 0, misses: 0, safeties: 0,
  breaks: [], highestBreak: 0, fiftyPlus: 0, centuries: 0, doubleCenturies: 0, average: null, potRed: 0, potWhite: 0, inOffRed: 0, inOffWhite: 0,
  cannons: 0, detailedFrames: 0, quickFrames: 0,
});

type StatVisit = Visit & { end?: VisitEnd };
interface StatFrame { n: number; quick: boolean; untouched: boolean; score: [number, number]; visits: StatVisit[]; fouls: FoulRecord[] }
/** B-01 — records from a stored (public) snapshot are read only when they
 *  are well formed: a real side and finite numbers. A side of "__proto__" or
 *  "constructor" can never index the stats objects; an unknown foul kind is
 *  dropped (the foul still counts). */
const goodVisit = (v: unknown): v is StatVisit =>
  isObj(v) && isSide(v.side) && ['pts', 'shots', ...PARTS].every((k) => num(v[k]) !== undefined);
const goodFoul = (x: unknown): x is FoulRecord => isObj(x) && isSide(x.by) && num(x.value) !== undefined;
const knownKind = (k: unknown): k is FoulKind => (FOUL_KINDS as readonly unknown[]).includes(k);
const goodList = <T,>(v: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(ok) : []);
function framesForStats(s: BilliardsState): StatFrame[] {
  const out: StatFrame[] = goodFrames(s).map((f) => {
    const visits = goodList(f.visits, goodVisit);
    const fouls = goodList(f.fouls, goodFoul);
    // B-18 — a frame ended with nothing recorded (conceded / awarded before a
    // stroke) is "not tracked": neither shot-by-shot nor quick
    const untouched = f.quick !== true && visits.length === 0 && fouls.length === 0;
    return { n: num(f.n) ?? 0, quick: f.quick === true, untouched, score: f.score, visits, fouls };
  });
  const fr = liveFrame(s);
  if (fr) {
    out.push({
      n: fr.n, quick: false, untouched: !(fr.shots > 0), score: [fr.score.home, fr.score.away],
      visits: goodList([...fr.visits, ...(fr.visit.shots > 0 ? [fr.visit] : [])], goodVisit), fouls: goodList(fr.fouls, goodFoul),
    });
  }
  return out;
}

export function billiardsStats(s: BilliardsState): { home: BilliardsSideStats; away: BilliardsSideStats } {
  return safe(() => statsOf(s), { home: zeroStats(), away: zeroStats() });
}

function statsOf(s: BilliardsState): { home: BilliardsSideStats; away: BilliardsSideStats } {
  const out = { home: zeroStats(), away: zeroStats() };
  if (!isObj(s)) return out;
  for (const f of framesForStats(s)) {
    for (const side of ['home', 'away'] as const) {
      out[side].points += f.score[side === 'home' ? 0 : 1];
      if (f.untouched) continue;
      if (f.quick) out[side].quickFrames++; else out[side].detailedFrames++;
    }
    for (const v of f.visits) {
      const t = out[v.side];
      t.visits++;
      t.scored += v.pts;
      t.shots += v.shots;
      if (v.end === 'miss') t.misses++;
      if (v.end === 'safety') t.safeties++;
      if (v.pts > 0) t.breaks.push(v.pts);
      t.highestBreak = Math.max(t.highestBreak, v.pts);
      if (v.pts >= 50) t.fiftyPlus++;
      if (v.pts >= 100) t.centuries++;
      if (v.pts >= 200) t.doubleCenturies++;
      t.potRed += v.potRed; t.potWhite += v.potWhite; t.inOffRed += v.inOffRed; t.inOffWhite += v.inOffWhite; t.cannons += v.cannon;
    }
    for (const x of f.fouls) {
      const t = out[x.by];
      t.fouls++;
      t.penaltyConceded += x.value;
      out[other(x.by)].penaltyReceived += x.value;
      if (knownKind(x.kind)) t.foulsByKind[x.kind] = (t.foulsByKind[x.kind] ?? 0) + 1;
    }
  }
  const won = wonOf(s);
  for (const side of ['home', 'away'] as const) {
    const t = out[side];
    t.framesWon = won[side];
    t.average = t.visits > 0 ? Math.round((t.scored / t.visits) * 10) / 10 : null;
  }
  return out;
}

export function breaks(s: BilliardsState, min = 1): Array<{ side: Side; frame: number; pts: number }> {
  const m = num(min) ?? 1;
  return safe(() => {
    const out: Array<{ side: Side; frame: number; pts: number }> = [];
    for (const f of framesForStats(s)) for (const v of f.visits) if (v.pts >= m && v.pts > 0) out.push({ side: v.side, frame: f.n, pts: v.pts });
    return out;
  }, []);
}
