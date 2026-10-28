/**
 * Cue sports — corrections a frame at a time (break list A-01). PURE.
 *
 * The generic correction list voids or replaces single rows. A cue-sport log
 * can't take that: every row is stamped with its frame and the ball on moves
 * with every pot, so voiding one row makes the replay refuse every row after
 * it (a finished match fell back to "in play"). Here a correction replaces a
 * whole completed frame by its final score instead: the frame's rows are
 * voided (except who broke off) and the row that ended it becomes
 * `FRAME_SCORE {home, away, frame}`. The frame still ends at the same row, so
 * every later frame replays as played (only who wins the match can change).
 * The frame's breaks go with it (a quick frame has none), which is the point
 * when the shot record was wrong.
 */
import type { MatchEventRecord } from '../../core/types';
import { AMEND_TYPE, replayLog, type AmendOp } from '../amend.ts';

type Side = 'home' | 'away';
export interface Engine<S> { createInitialState: (config?: Record<string, unknown>) => S; reducer: (s: S, a: never) => S }
interface FrameRec { n: number; score: [number, number]; winner: Side | 'draw'; quick?: boolean }
interface CueLike { frames: FrameRec[] }

export interface LogFrame {
  n: number;
  /** every row from the end of the frame before up to the one that ended it */
  rows: number[];
  /** the row that ended the frame */
  end: number;
  score: [number, number];
  winner: Side | 'draw';
  quick: boolean;
}

const toAction = (r: MatchEventRecord) => ({ type: r.type, side: r.side ?? undefined, payload: r.payload ?? undefined });
const framesOf = (s: unknown): FrameRec[] => {
  const f = (s as CueLike | null)?.frames;
  return Array.isArray(f) ? f : [];
};

/** The completed frames of an (effective) log, with the rows of each. */
export function logFrames<S>(eng: Engine<S>, config: Record<string, unknown> | undefined, log: MatchEventRecord[]): LogFrame[] {
  const out: LogFrame[] = [];
  try {
    let s = eng.createInitialState(config);
    let rows: number[] = [];
    for (const r of [...log].filter((x) => x && x.type !== AMEND_TYPE).sort((a, b) => a.seq - b.seq)) {
      rows.push(r.seq);
      const next = eng.reducer(s, toAction(r) as never);
      const before = framesOf(s).length;
      s = next;
      const fs = framesOf(next);
      if (fs.length > before) {
        const rec = fs[fs.length - 1];
        out.push({ n: rec.n, rows, end: r.seq, score: [rec.score[0], rec.score[1]], winner: rec.winner, quick: rec.quick === true });
        rows = [];
      }
    }
  } catch {
    // a hostile log gives what was read so far
  }
  return out;
}

/** Staged ops plus new ones (a later op on the same row wins). */
export function mergeOps(staged: AmendOp[], next: AmendOp[]): AmendOp[] {
  const seqs = new Set(next.map((o) => o.seq));
  return [...staged.filter((o) => !seqs.has(o.seq)), ...next];
}

const amendRow = (log: MatchEventRecord[], ops: AmendOp[]): MatchEventRecord => ({
  seq: Math.max(0, ...log.map((r) => r.seq)) + 1, type: AMEND_TYPE, side: null, payload: { ops, lines: [], byName: '', deltas: [] }, attribution: null,
});

/** The ops that set frame `n` to `home`–`away` (null: no such completed
 *  frame, or the engine won't record that score — level in snooker, the
 *  target rule in billiards). `staged` = ops already chosen in this session. */
export function frameCorrection<S>(
  eng: Engine<S>, config: Record<string, unknown> | undefined, log: MatchEventRecord[], n: number, home: number, away: number,
  staged: AmendOp[] = [], unit: 'frame' | 'game' = 'frame',
): { ops: AmendOp[]; line: string } | null {
  try {
    const f = logFrames(eng, config, log).find((x) => x.n === n);
    if (!f) return null;
    const keep = new Set(log.filter((r) => f.rows.includes(r.seq) && r.type === 'BREAK_OFF').map((r) => r.seq));
    const ops: AmendOp[] = [
      ...f.rows.filter((q) => q !== f.end && !keep.has(q)).map((seq) => ({ op: 'void' as const, seq })),
      { op: 'replace', seq: f.end, action: { type: 'FRAME_SCORE', payload: { home, away, frame: n } } },
    ];
    const all = mergeOps(staged, ops);
    // the engine must record frame n as that quick score
    const after = replayLog(eng as never, config, [...log, amendRow(log, all)]);
    const rec = framesOf(after).find((x) => x.n === n);
    if (!rec || rec.quick !== true) return null;
    const cap = unit === 'game' ? 'Game' : 'Frame';
    return { ops: all, line: `${cap} ${n}: ${rec.score[0]}–${rec.score[1]}, was ${f.score[0]}–${f.score[1]} (scored as a final score)` };
  } catch {
    return null;
  }
}
