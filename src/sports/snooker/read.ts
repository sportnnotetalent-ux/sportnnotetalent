/**
 * Snooker — the frames as the display modules read them (feed, match stats,
 * records, box, undo). PURE; never throws.
 *
 * A stored snapshot is public and may be old, cut short or crafted, so only
 * well-formed records are read (as the engine's own projections do, break
 * list B-01 / B-05): a real side, finite numbers; a record with a side of
 * "__proto__" never indexes anything.
 *
 * `timeline` puts a frame's visits and fouls back in order. The engine keeps
 * them in two lists: every striker's foul also ends a visit (end 'foul'), in
 * the same order, so they pair up; a penalty by the player not at the table
 * (S3 R3(k)) ends no visit and is placed after the striker's foul before it
 * (its exact moment inside a visit isn't recorded).
 *
 * A-02 (app break list): a visit no replay can make — a break over the
 * maximum (147 / 107 / 75, +8 with a free ball) or a fraction — is a crafted
 * snapshot and is not read.
 */
import { isSnookerState, maxBreak, snookerStats, COLOURS, type Ball, type FoulKind, type MakeUp, type Side, type SnookerState, type VisitEnd } from './engine.ts';

/** `mk` — cue batch 6: the break's make-up (absent on an older visit).
 *  `lp` / `lm` / `rs` — polish PQ2/PQ4: long pots made / missed and rest
 *  shots tagged in the visit (whole numbers 1–999 only; absent = none). */
export interface RVisit { side: Side; pts: number; pots: number; shots: number; fb: boolean; end: VisitEnd | 'live'; mk?: MakeUp; tc?: true; lp?: number; lm?: number; rs?: number }

/** Polish PQ4 — a stored tag count: a whole number 1–999, else not read. */
const tagCount = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 999 ? v : undefined);

/** Cue batch 6 — the make-up order (a stored make-up is read through it:
 *  known balls, whole numbers 1–99 only). */
export const MAKE_UP_ORDER: ReadonlyArray<Ball | 'free'> = ['red', ...COLOURS, 'free'];
export function readMakeUp(v: unknown): MakeUp | undefined {
  if (!isObj(v)) return undefined;
  const out: MakeUp = {};
  for (const k of MAKE_UP_ORDER) {
    const n = Object.prototype.hasOwnProperty.call(v, k) ? v[k] : undefined;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}
export interface RFoul { by: Side; value: number; kind?: FoulKind; miss: boolean; fb: boolean; reds: number; penalty: boolean }
export interface RFrame {
  n: number;
  breaker: Side | null;
  /** home, away */
  score: [number, number];
  /** null while in play */
  winner: Side | null;
  how: string | null;
  quick: boolean;
  live: boolean;
  visits: RVisit[];
  fouls: RFoul[];
  conceded?: Side;
  reason?: string;
  reracks: number;
  respot: boolean;
}
export type Step = { kind: 'visit'; v: RVisit; foul?: RFoul; after: [number, number] } | { kind: 'penalty'; foul: RFoul; after: [number, number] };

const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nn = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const KINDS = new Set(['inOff', 'noContact', 'wrongBall', 'pottedWrong', 'push', 'jump', 'touch', 'offTable', 'other']);
const ENDS = new Set(['miss', 'safety', 'foul', 'frame', 'respot']);

function readVisit(v: unknown, max: number, live = false): RVisit | null {
  if (!isObj(v) || !isSide(v.side)) return null;
  const pts = nn(v.pts), pots = nn(v.pots), shots = nn(v.shots);
  if (pts === null || pots === null || shots === null) return null;
  if (!Number.isInteger(pts) || pts > max) return null;
  const end = live ? 'live' : typeof v.end === 'string' && ENDS.has(v.end) ? (v.end as VisitEnd) : 'miss';
  const mk = readMakeUp(v.mk);
  const lp = tagCount(v.lp), lm = tagCount(v.lm), rs = tagCount(v.rs);
  return {
    side: v.side, pts, pots, shots, fb: v.fb === 1 || v.fb === true, end, ...(mk ? { mk } : {}), ...(v.tc === 1 ? { tc: true as const } : {}),
    ...(lp ? { lp } : {}), ...(lm ? { lm } : {}), ...(rs ? { rs } : {}),
  };
}
function readFoul(x: unknown): RFoul | null {
  if (!isObj(x) || !isSide(x.by)) return null;
  const value = nn(x.value);
  if (value === null) return null;
  return {
    by: x.by, value, ...(typeof x.kind === 'string' && KINDS.has(x.kind) ? { kind: x.kind as FoulKind } : {}),
    miss: x.miss === true, fb: x.fb === true, reds: nn(x.reds) ?? 0, penalty: x.penalty === true,
  };
}
const list = <T,>(v: unknown, read: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(read).filter((x): x is T => x !== null) : []);

/** Every frame: the completed ones, then the one in play. */
export function readFrames(s: SnookerState): RFrame[] {
  try {
    if (!isObj(s) || !Array.isArray(s.frames)) return [];
    const max = maxBreak(s.reds === 6 || s.reds === 10 ? s.reds : 15) + 8;
    const out: RFrame[] = [];
    for (const f of s.frames as unknown[]) {
      if (!isObj(f) || !Array.isArray(f.score) || nn(f.score[0]) === null || nn(f.score[1]) === null || !isSide(f.winner)) continue;
      out.push({
        n: nn(f.n) ?? out.length + 1, breaker: isSide(f.breaker) ? f.breaker : null, score: [f.score[0] as number, f.score[1] as number],
        winner: f.winner, how: typeof f.how === 'string' ? f.how : null, quick: f.quick === true, live: false,
        visits: list(f.visits, (v) => readVisit(v, max)), fouls: list(f.fouls, readFoul),
        ...(isSide(f.conceded) ? { conceded: f.conceded } : {}), ...(typeof f.reason === 'string' ? { reason: f.reason } : {}),
        reracks: nn(f.reracks) ?? 0, respot: false,
      });
    }
    if (isSnookerState(s) && s.frame) {
      const fr = s.frame;
      const cur = fr.visit.shots > 0 ? readVisit(fr.visit, max, true) : null;
      out.push({
        n: fr.n, breaker: fr.breaker, score: [fr.score.home, fr.score.away], winner: null, how: null, quick: false, live: true,
        visits: [...list(fr.visits, (v) => readVisit(v, max)), ...(cur ? [cur] : [])], fouls: list(fr.fouls, readFoul),
        reracks: nn(fr.reracks) ?? 0, respot: !!fr.respot,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** A frame's visits and fouls in order, with the frame score after each. */
export function timeline(f: RFrame): Step[] {
  const strikerFouls = f.fouls.filter((x) => !x.penalty);
  // penalties keyed by how many striker fouls came before them
  const penaltiesAfter = new Map<number, RFoul[]>();
  let k = 0;
  for (const x of f.fouls) {
    if (!x.penalty) { k += 1; continue; }
    penaltiesAfter.set(k, [...(penaltiesAfter.get(k) ?? []), x]);
  }
  const score: [number, number] = [0, 0];
  const add = (side: Side, n: number) => { score[side === 'home' ? 0 : 1] += n; };
  const out: Step[] = [];
  const penalties = (at: number) => {
    for (const p of penaltiesAfter.get(at) ?? []) {
      add(p.by === 'home' ? 'away' : 'home', p.value);
      out.push({ kind: 'penalty', foul: p, after: [score[0], score[1]] });
    }
  };
  penalties(0);
  let used = 0;
  for (const v of f.visits) {
    add(v.side, v.pts);
    let foul: RFoul | undefined;
    if (v.end === 'foul') {
      foul = strikerFouls[used];
      used += 1;
      if (foul) add(foul.by === 'home' ? 'away' : 'home', foul.value);
    }
    out.push({ kind: 'visit', v, ...(foul ? { foul } : {}), after: [score[0], score[1]] });
    if (v.end === 'foul') penalties(used);
  }
  // penalties after the last striker's foul with no visit to hang on (none
  // left over in a well-formed frame)
  for (const [at] of penaltiesAfter) if (at > used) penalties(at);
  return out;
}

/** The engine's stats for one frame (match figures when `n` is absent). */
export function statsFor(s: SnookerState, n?: number): ReturnType<typeof snookerStats> {
  if (n == null) return snookerStats(s);
  try {
    if (!isObj(s) || !Array.isArray(s.frames)) return snookerStats(s);
    const rec = (s.frames as unknown[]).find((f) => isObj(f) && f.n === n) as SnookerState['frames'][number] | undefined;
    if (rec) {
      const won = { home: rec.winner === 'home' ? 1 : 0, away: rec.winner === 'away' ? 1 : 0 };
      return snookerStats({ ...s, frames: [rec], frame: null, framesWon: won });
    }
    if (isSnookerState(s) && s.frame && s.frame.n === n) return snookerStats({ ...s, frames: [], framesWon: { home: 0, away: 0 } });
  } catch {
    // fall through
  }
  return snookerStats({} as SnookerState);
}
