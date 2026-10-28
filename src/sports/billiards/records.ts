/**
 * English billiards' `matchRecords(state)` hook (SD-51): the record
 * candidates of one FINISHED match, from its final state only. PURE.
 * A side is one player, so every record is the side's (`who: 'team'`).
 *  - highBreak: each side's highest break of the match;
 *  - century: every break of 100+ (a double century is a century too);
 *  - biggestFrame: each frame's winning margin (a draw, or a frame conceded
 *    or awarded with the winner behind, has none).
 */
import { block, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import type { BilliardsState, Side } from './engine.ts';
import { readFrames } from './read.ts';

export function billiardsMatchRecords(s: BilliardsState): MatchRecordsBlock | null {
  try {
    if (!s || s.ended !== true) return null;
    const frames = readFrames(s).filter((f) => !f.live);
    const unit = s.bestOf > 1 ? 'frame' : 'game';
    const items: MatchRecordItem[] = [];
    for (const side of ['home', 'away'] as Side[]) {
      let best: { pts: number; n: number } | null = null;
      for (const f of frames) for (const v of f.visits) if (v.side === side && v.pts > 0 && (!best || v.pts > best.pts)) best = { pts: v.pts, n: f.n };
      if (best) items.push({ type: 'highBreak', value: best.pts, text: String(best.pts), side, note: `${unit} ${best.n}` });
    }
    for (const f of frames) for (const v of f.visits) if (v.pts >= 100) items.push({ type: 'century', value: v.pts, text: String(v.pts), side: v.side, note: `${unit} ${f.n}` });
    for (const f of frames) {
      if (f.winner !== 'home' && f.winner !== 'away') continue;
      const [h, a] = f.score;
      const ws = f.winner === 'home' ? h : a;
      const ls = f.winner === 'home' ? a : h;
      if (ws <= ls) continue;
      items.push({ type: 'biggestFrame', value: (ws - ls) * 1000 + ws, text: `${ws}–${ls}`, side: f.winner, note: `${unit} ${f.n}` });
    }
    return block(items);
  } catch {
    return null;
  }
}
