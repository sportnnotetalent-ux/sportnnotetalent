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
  return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const emptyVisit = (side: Side): Visit => ({ side, pts: 0, shots: 0, potRed: 0, potWhite: 0, inOffRed: 0, inOffWhite: 0, cannon: 0 });

/** The highest frame score quick mode accepts. */
export const MAX_FRAME_SCORE = 99999;

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

export function createInitialState(config?: Record<string, unknown>): BilliardsState {
  const c = isObj(config) ? config : undefined;
  const format = own(c, 'format') === 'timed' ? 'timed' : 'points';
  const t = num(own(c, 'target'));
  const target = t === undefined ? 150 : clamp(Math.round(t), 10, 5000);
  const bestOf = format === 'timed' ? 1 : readBestOf(own(c, 'bestOf'), 5);
  const fp = num(own(c, 'foulPoints'));
  const fb = own(c, 'firstBreak');
  const firstBreak: Side = isSide(fb) ? fb : 'home';
  return {
    sport: 'billiards', format, target, bestOf, framesToWin: (bestOf + 1) / 2,
    foulPoints: fp === undefined ? 2 : clamp(Math.round(fp), 1, 7),
    hazardLimit: intIn(own(c, 'hazardLimit'), 0, 999) ?? 15,
    cannonLimit: intIn(own(c, 'cannonLimit'), 0, 999) ?? 75,
    timedTie: own(c, 'timedTie') === 'draw' ? 'draw' : 'sudden',
    firstBreak,
    scoringMode: own(c, 'scoringMode') === 'quick' ? 'quick' : 'shot',
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
  const parts = readStroke(isObj(p) ? p : undefined);
  return parts ? PARTS.reduce((t, k) => t + parts[k] * PART_VALUE[k], 0) : 0;
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

export function reducer(s: BilliardsState, a: BilliardsAction): BilliardsState {
  if (!s || typeof s !== 'object' || !isObj(a) || typeof a.type !== 'string') return s;
  const fr = s.frame;
  if (s.ended || !fr) return s;
  const p = isObj(a.payload) ? a.payload : undefined;
  // B-02 — an action stamped with a frame number applies to that frame only,
  // and the ones that end a frame must carry it
  const stampedFrame = own(p, 'frame');
  if (stampedFrame !== undefined && stampedFrame !== fr.n) return s;
  if (stampedFrame === undefined && FRAME_ENDERS.has(a.type)) return s;
  const striking = a.side === undefined || a.side === fr.striker;
  const named = (): Side | undefined => {
    const v = own(p, 'side') ?? a.side;
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
      return decided(s, { ...fr, score, visit, hazardRun, cannonRun, shots: fr.shots + 1 }, fr.striker);
    }
    case 'MISS':
    case 'SAFETY': {
      if (!striking) return s;
      const striker = other(fr.striker);
      return {
        ...s,
        frame: { ...fr, visits: [...fr.visits, { ...fr.visit, end: a.type === 'MISS' ? 'miss' : 'safety' }], striker, visit: emptyVisit(striker), hazardRun: 0, cannonRun: 0, shots: fr.shots + 1 },
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
      return { ...s, ...(fr.n === 1 ? { firstBreak: side } : {}), frame: { ...fr, breaker: side, striker: side, visit: emptyVisit(side) }, seq: s.seq + 1 };
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
  const by = fr.striker;
  const opp = other(by);
  const score = { ...fr.score, [opp]: fr.score[opp] + s.foulPoints };
  const next: LiveFrame = {
    ...fr, score, visits: [...fr.visits, { ...fr.visit, end: 'foul' }], fouls: [...fr.fouls, { by, value: s.foulPoints, ...(kind ? { kind } : {}) }],
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

export const isComplete = (s: BilliardsState): boolean => !!s?.ended;
export const winner = (s: BilliardsState): Side | 'draw' | null => (s?.ended ? s.winner : null);

/** A single game reports its points to the standings (150–87); a best-of
 *  match its frames won (3–1). */
export function result(s: BilliardsState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!s?.ended || !s.winner) return null;
  if (s.bestOf === 1 && s.frames[0]) return { winner: s.winner, home: s.frames[0].score[0], away: s.frames[0].score[1] };
  return { winner: s.winner, home: s.framesWon.home, away: s.framesWon.away };
}

const frameScores = (s: BilliardsState): Array<[number, number]> => (Array.isArray(s?.frames) ? s.frames.map((f) => f.score) : []);

export function scoreLine(s: BilliardsState, perspective?: Side): string {
  return lineOf(frameScores(s), { perspective });
}

export const lineScore = (s: BilliardsState): LineScore | null =>
  pointsLineScore('game', s && { games: frameScores(s), current: s.frame?.score, won: s.framesWon, ended: s.ended, toWin: s.framesToWin });

export function standingsUnits(s: BilliardsState): { points: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.frames)) return null;
  const points = s.frames.reduce((t, f) => ({ home: t.home + f.score[0], away: t.away + f.score[1] }), { home: s.frame?.score.home ?? 0, away: s.frame?.score.away ?? 0 });
  return { points };
}

/** The consecutive-stroke counts and the referee's calls (TEN HAZARDS /
 *  SEVENTY CANNONS = 5 strokes before the limit). */
export function limits(s: BilliardsState): { hazards: number; cannons: number; tenHazards: boolean; seventyCannons: boolean } {
  const fr = s?.frame;
  const hazards = fr?.hazardRun ?? 0;
  const cannons = fr?.cannonRun ?? 0;
  return {
    hazards, cannons,
    tenHazards: s?.hazardLimit > 0 && hazards >= Math.max(1, s.hazardLimit - 5),
    seventyCannons: s?.cannonLimit > 0 && cannons >= Math.max(1, s.cannonLimit - 5),
  };
}

export function summary(s: BilliardsState): ScoreSummary {
  if (!s || !Array.isArray(s.frames)) return { homeScore: '0', awayScore: '0', statusLine: '' };
  if (s.ended || !s.frame) {
    if (s.bestOf === 1 && s.frames[0]) {
      const [h, a] = s.frames[0].score;
      return { homeScore: String(h), awayScore: String(a), statusLine: s.winner === 'draw' ? 'Match Over · Draw' : 'Match Over', detailLine: s.format === 'timed' ? 'Timed game' : `${s.target}-up` };
    }
    return finalSummary(s.framesWon, scoreLine(s));
  }
  const fr = s.frame;
  const line = scoreLine(s);
  const parts: string[] = [];
  if (s.bestOf > 1) parts.push(`Frames ${s.framesWon.home}–${s.framesWon.away}${line ? ` (${line})` : ''}`, `best of ${s.bestOf}`);
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
interface StatFrame { n: number; quick: boolean; live: boolean; score: [number, number]; visits: StatVisit[]; fouls: FoulRecord[] }
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
  const out: StatFrame[] = (s?.frames ?? []).map((f) => ({ n: f.n, quick: !!f.quick, live: false, score: f.score, visits: goodList(f.visits, goodVisit), fouls: goodList(f.fouls, goodFoul) }));
  const fr = s?.frame;
  if (fr) out.push({ n: fr.n, quick: false, live: true, score: [fr.score.home, fr.score.away], visits: goodList([...fr.visits, ...(fr.visit.shots > 0 ? [fr.visit] : [])], goodVisit), fouls: goodList(fr.fouls, goodFoul) });
  return out;
}

export function billiardsStats(s: BilliardsState): { home: BilliardsSideStats; away: BilliardsSideStats } {
  const out = { home: zeroStats(), away: zeroStats() };
  if (!s || !Array.isArray(s.frames)) return out;
  for (const f of framesForStats(s)) {
    const played = !f.live || (s.frame?.shots ?? 0) > 0;
    for (const side of ['home', 'away'] as const) {
      out[side].points += f.score[side === 'home' ? 0 : 1];
      if (!played) continue;
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
  for (const side of ['home', 'away'] as const) {
    const t = out[side];
    t.framesWon = s.framesWon?.[side] ?? 0;
    t.average = t.visits > 0 ? Math.round((t.scored / t.visits) * 10) / 10 : null;
  }
  return out;
}

export function breaks(s: BilliardsState, min = 1): Array<{ side: Side; frame: number; pts: number }> {
  const out: Array<{ side: Side; frame: number; pts: number }> = [];
  for (const f of framesForStats(s)) for (const v of f.visits) if (v.pts >= min && v.pts > 0) out.push({ side: v.side, frame: f.n, pts: v.pts });
  return out;
}
