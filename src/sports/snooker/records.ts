/**
 * Snooker's `matchRecords(state)` hook (SD-51): the record candidates of one
 * FINISHED match, from its final state only. PURE (no React Native).
 *
 * A side is one player (an individual sport), so every record is the side's
 * (`who: 'team'` in matchRecords.ts) — the state holds no player id.
 *  - highBreak: each side's highest break of the match (one per side);
 *  - century: every break of 100+;
 *  - maximum: every maximum (147 / 107 / 75 by format, no free ball);
 *  - biggestFrame: each frame's winning margin, from the winner's side (a
 *    frame conceded or awarded with the winner behind has no margin).
 * Quick frames give a margin but no breaks.
 */
import { block, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import { maxBreak, type Side, type SnookerState } from './engine.ts';
import { readFrames } from './read.ts';

export function snookerMatchRecords(s: SnookerState): MatchRecordsBlock | null {
  try {
    if (!s || s.ended !== true) return null;
    const frames = readFrames(s).filter((f) => !f.live);
    const max = maxBreak(s.reds === 6 || s.reds === 10 ? s.reds : 15);
    const items: MatchRecordItem[] = [];
    for (const side of ['home', 'away'] as Side[]) {
      let best: { pts: number; n: number } | null = null;
      for (const f of frames) for (const v of f.visits) if (v.side === side && v.pts > 0 && (!best || v.pts > best.pts)) best = { pts: v.pts, n: f.n };
      if (best) items.push({ type: 'highBreak', value: best.pts, text: String(best.pts), side, note: `frame ${best.n}` });
    }
    for (const f of frames) {
      for (const v of f.visits) {
        if (v.pts >= 100) items.push({ type: 'century', value: v.pts, text: String(v.pts), side: v.side, note: `frame ${f.n}` });
        if (v.pts === max && !v.fb) items.push({ type: 'maximum', value: 1, text: `${max} maximum`, side: v.side, note: `frame ${f.n}` });
      }
    }
    for (const f of frames) {
      if (!f.winner) continue;
      const [h, a] = f.score;
      const ws = f.winner === 'home' ? h : a;
      const ls = f.winner === 'home' ? a : h;
      if (ws <= ls) continue;
      items.push({ type: 'biggestFrame', value: (ws - ls) * 1000 + ws, text: `${ws}–${ls}`, side: f.winner, note: `frame ${f.n}` });
    }
    // one list in a stable order: high breaks, centuries, maximums, frame margins
    const order = ['highBreak', 'century', 'maximum', 'biggestFrame'];
    return block(items.map((it, i) => ({ it, i })).sort((a, b) => order.indexOf(a.it.type) - order.indexOf(b.it.type) || a.i - b.i).map((x) => x.it));
  } catch {
    return null;
  }
}
