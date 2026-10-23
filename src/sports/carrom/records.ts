/**
 * SD-51 — Carrom's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, type MatchRecordItem, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import type { CarromState } from './engine.ts';

/**
 * SD-137a — carrom: each game's winning margin ("25–3", game 2; margin, then
 * the winner's points), the longest run of boards won in a row by one side
 * (penalty boards break a run and never count as won), and every slam (white
 * / black, the game and board). The board winner's credited player(s) name
 * the run / slam when the scorer picked them.
 */
export function carromMatchRecords(s: CarromState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items: MatchRecordItem[] = [];
  (s.games ?? []).forEach(([h, a], i) => {
    if (h === a) return;
    const w: Side = h > a ? 'home' : 'away';
    items.push({ type: 'biggestWin', value: Math.abs(h - a) * 1000 + Math.max(h, a), text: w === 'home' ? `${h}–${a}` : `${a}–${h}`, side: w, note: `game ${i + 1}` });
  });
  const who = (i: number) => {
    const c = s.boardBy?.[i]?.[0];
    return c ? { ...(c.id ? { playerId: c.id } : {}), ...(c.name ? { playerName: c.name } : {}) } : {};
  };
  let best: { side: Side; n: number; at: number } | null = null;
  let run: { side: Side; n: number; at: number } | null = null;
  (s.boards ?? []).forEach((b, i) => {
    if (b.penalty) { run = null; return; }
    run = run && run.side === b.winner ? { ...run, n: run.n + 1 } : { side: b.winner, n: 1, at: i };
    if (!best || run.n > best.n) best = { ...run };
    if (b.slam) items.push({ type: 'slam', value: 1, text: `${b.slam === 'white' ? 'White' : 'Black'} slam`, side: b.winner, note: `game ${b.game}`, ...who(i) });
  });
  const top = best as { side: Side; n: number; at: number } | null;
  if (top && top.n >= 2) items.push({ type: 'boardRun', value: top.n, text: `${top.n} boards`, side: top.side });
  return block(items);
}
