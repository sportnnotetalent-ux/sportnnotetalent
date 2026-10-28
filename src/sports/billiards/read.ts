/**
 * English billiards — the frames as the display modules read them (feed,
 * match stats, records, box, undo). PURE; never throws. Only well-formed
 * records are read (a stored snapshot is public and may be old or crafted:
 * engine break list B-01 / B-05). Every billiards foul is the striker's and
 * ends a visit (end 'foul'), so `timeline` pairs them in order.
 */
import { billiardsStats, isBilliardsState, PARTS, type BilliardsState, type FoulKind, type Part, type Side, type VisitEnd } from './engine.ts';

export interface RVisit extends Record<Part, number> { side: Side; pts: number; shots: number; end: VisitEnd | 'live' }
export interface RFoul { by: Side; value: number; kind?: FoulKind }
export interface RFrame {
  n: number;
  breaker: Side | null;
  score: [number, number];
  /** the points as scored, when a points game's winner passed the target */
  raw?: [number, number];
  winner: Side | 'draw' | null;
  how: string | null;
  quick: boolean;
  live: boolean;
  sudden: boolean;
  visits: RVisit[];
  fouls: RFoul[];
  conceded?: Side;
  reason?: string;
}
export interface Step { v: RVisit; foul?: RFoul; after: [number, number] }

const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nn = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const KINDS = new Set(['miss', 'coup', 'inHand', 'push', 'jump', 'touch', 'offTable', 'hazards', 'cannons', 'baulkLine', 'other']);
const ENDS = new Set(['miss', 'safety', 'foul', 'frame']);
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && nn(v[0]) !== null && nn(v[1]) !== null ? [v[0] as number, v[1] as number] : null);

function readVisit(v: unknown, live = false): RVisit | null {
  if (!isObj(v) || !isSide(v.side)) return null;
  const pts = nn(v.pts), shots = nn(v.shots);
  if (pts === null || shots === null) return null;
  const parts = {} as Record<Part, number>;
  for (const k of PARTS) {
    const x = nn(v[k]);
    if (x === null) return null;
    parts[k] = x;
  }
  const end = live ? 'live' : typeof v.end === 'string' && ENDS.has(v.end) ? (v.end as VisitEnd) : 'miss';
  return { side: v.side, pts, shots, ...parts, end };
}
function readFoul(x: unknown): RFoul | null {
  if (!isObj(x) || !isSide(x.by)) return null;
  const value = nn(x.value);
  if (value === null) return null;
  return { by: x.by, value, ...(typeof x.kind === 'string' && KINDS.has(x.kind) ? { kind: x.kind as FoulKind } : {}) };
}
const list = <T,>(v: unknown, read: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(read).filter((x): x is T => x !== null) : []);

export function readFrames(s: BilliardsState): RFrame[] {
  try {
    if (!isObj(s) || !Array.isArray(s.frames)) return [];
    const out: RFrame[] = [];
    for (const f of s.frames as unknown[]) {
      const score = isObj(f) ? pair(f.score) : null;
      if (!isObj(f) || !score || !(isSide(f.winner) || f.winner === 'draw')) continue;
      const raw = pair(f.raw);
      out.push({
        n: nn(f.n) ?? out.length + 1, breaker: isSide(f.breaker) ? f.breaker : null, score, ...(raw ? { raw } : {}),
        winner: f.winner, how: typeof f.how === 'string' ? f.how : null, quick: f.quick === true, live: false, sudden: false,
        visits: list(f.visits, (v) => readVisit(v)), fouls: list(f.fouls, readFoul),
        ...(isSide(f.conceded) ? { conceded: f.conceded } : {}), ...(typeof f.reason === 'string' ? { reason: f.reason } : {}),
      });
    }
    if (isBilliardsState(s) && s.frame) {
      const fr = s.frame;
      const cur = fr.visit.shots > 0 ? readVisit(fr.visit, true) : null;
      out.push({
        n: fr.n, breaker: fr.breaker, score: [fr.score.home, fr.score.away], winner: null, how: null, quick: false, live: true, sudden: !!fr.sudden,
        visits: [...list(fr.visits, (v) => readVisit(v)), ...(cur ? [cur] : [])], fouls: list(fr.fouls, readFoul),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** A frame's visits in order, each with its foul (a visit ended by one) and
 *  the frame score after it (as scored: past the target, before the record
 *  stops it there). */
export function timeline(f: RFrame): Step[] {
  const score: [number, number] = [0, 0];
  let used = 0;
  return f.visits.map((v) => {
    score[v.side === 'home' ? 0 : 1] += v.pts;
    let foul: RFoul | undefined;
    if (v.end === 'foul') {
      foul = f.fouls[used];
      used += 1;
      if (foul) score[foul.by === 'home' ? 1 : 0] += foul.value;
    }
    return { v, ...(foul ? { foul } : {}), after: [score[0], score[1]] as [number, number] };
  });
}

/** The engine's stats for one frame (match figures when `n` is absent). */
export function statsFor(s: BilliardsState, n?: number): ReturnType<typeof billiardsStats> {
  if (n == null) return billiardsStats(s);
  try {
    if (!isObj(s) || !Array.isArray(s.frames)) return billiardsStats(s);
    const rec = (s.frames as unknown[]).find((f) => isObj(f) && f.n === n) as BilliardsState['frames'][number] | undefined;
    if (rec) {
      const won = { home: rec.winner === 'home' ? 1 : 0, away: rec.winner === 'away' ? 1 : 0 };
      return billiardsStats({ ...s, frames: [rec], frame: null, framesWon: won });
    }
    if (isBilliardsState(s) && s.frame && s.frame.n === n) return billiardsStats({ ...s, frames: [], framesWon: { home: 0, away: 0 } });
  } catch {
    // fall through
  }
  return billiardsStats({} as BilliardsState);
}
