/**
 * SD-51 — Pool's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (shaped like carrom/records.ts).
 * PURE (no React Native), read-only, tolerant of an old or hostile snapshot.
 *
 *   biggestWin    each race's winning margin ("7–2"; with sets: "set 2");
 *                 value = margin × 1000 + the winner's racks (a 7–2 beats a 5–0)
 *   breakAndRuns  break-and-runs by a side in the match (golden breaks included)
 *   runOuts       run-outs by a side in the match (won in one visit, not from the break)
 *   goldenBreak   each golden break (9-ball), with its rack
 *   rackRun       the longest run of racks won in a row (2 or more)
 * A singles side's player (the one id the log carried) names its records.
 */
import { block, type MatchRecordItem, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import { cnt } from './engine.ts';
import { isSide } from './balls.ts';
import { creditOf, perSideOf, type PoolMatch } from './match.ts';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function poolMatchRecords(s: PoolMatch): MatchRecordsBlock | null {
  if (!isObj(s) || s.ended !== true) return null;
  const items: MatchRecordItem[] = [];
  const cr = creditOf(s);
  const who = (side: Side) => (perSideOf(s) === 1 && cr.ids[side].length === 1 ? { playerId: cr.ids[side][0] } : {});
  const sets = (Array.isArray(s.sets) ? s.sets : []).filter((x): x is [number, number] => Array.isArray(x) && x.length === 2);
  const setsMode = cnt(s.setsToWin) > 1;
  sets.forEach(([h0, a0], i) => {
    const h = cnt(h0), a = cnt(a0);
    if (h === a) return;
    const w: Side = h > a ? 'home' : 'away';
    items.push({ type: 'biggestWin', value: Math.abs(h - a) * 1000 + Math.max(h, a), text: `${Math.max(h, a)}–${Math.min(h, a)}`, side: w, ...(setsMode ? { note: `set ${i + 1}` } : {}) });
  });
  const racks = (Array.isArray(s.racks) ? s.racks : []).filter((r) => isObj(r) && isSide(r.winner));
  for (const side of ['home', 'away'] as Side[]) {
    const mine = racks.filter((r) => r.winner === side);
    const bnr = mine.filter((r) => r.bnr === true).length;
    if (bnr) items.push({ type: 'breakAndRuns', value: bnr, text: plural(bnr, 'break-and-run'), side, ...who(side) });
  }
  for (const side of ['home', 'away'] as Side[]) {
    const ro = racks.filter((r) => r.winner === side && r.runOut === true).length;
    if (ro) items.push({ type: 'runOuts', value: ro, text: plural(ro, 'run-out'), side, ...who(side) });
  }
  if (s.game === 'nine') {
    for (const r of racks) {
      if (r.golden !== true) continue;
      items.push({ type: 'goldenBreak', value: 1, text: 'Golden break', side: r.winner, note: `rack ${cnt(r.n) || racks.indexOf(r) + 1}`, ...who(r.winner) });
    }
  }
  let best: { side: Side; n: number } | null = null;
  let run: { side: Side; n: number } | null = null;
  for (const r of racks) {
    run = run && run.side === r.winner ? { side: run.side, n: run.n + 1 } : { side: r.winner, n: 1 };
    if (!best || run.n > best.n) best = { ...run };
  }
  const top = best as { side: Side; n: number } | null;
  if (top && top.n >= 2) items.push({ type: 'rackRun', value: top.n, text: plural(top.n, 'rack'), side: top.side, ...who(top.side) });
  return block(items);
}
