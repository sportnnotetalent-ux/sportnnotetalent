/**
 * SD-51 — Kabaddi's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, scoreItems, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import { topN } from '../recordHelpers.ts';
import type { KabaddiState } from './engine.ts';
import { kabaddiTotals } from './totals.ts';

/** Kabaddi: team high, biggest win (regulation score; a shootout decides but
 *  isn't a margin), each side's top 2 raiders, Super 10s (10+ raid points) and
 *  High 5s (5+ tackle points), from the raid replay's absolute totals. */
export function kabaddiMatchRecords(s: KabaddiState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items = scoreItems(s.home, s.away, { teamHigh: true, biggestWin: true });
  let totals: ReturnType<typeof kabaddiTotals> = {};
  try { totals = kabaddiTotals(s); } catch { totals = {}; }
  // IDs-only scoring: the block is stored in the public `matches.state`, so a
  // record names its player by id; only an older log's stored name (legacy,
  // pre IDs-only) still rides along as `playerName` — never a new one.
  const names = new Map<string, string>();
  for (const r of s.raids ?? []) {
    if (r.raiderId && r.raider) names.set(r.raiderId, r.raider);
    if (r.tacklerId && r.tackler) names.set(r.tacklerId, r.tackler);
  }
  const rows = Object.entries(totals).map(([id, t]) => ({ id, side: t.side, rp: t.stats.raidPoints ?? 0, tp: t.stats.tacklePoints ?? 0 }));
  for (const side of ['home', 'away'] as Side[]) {
    for (const r of topN(rows.filter((x) => x.side === side && x.rp > 0).map((x) => ({ ...x, value: x.rp })), 2)) {
      items.push({ type: 'raidPoints', value: r.rp, text: `${r.rp} raid pts`, side, playerId: r.id, playerName: names.get(r.id) });
    }
  }
  for (const r of rows) {
    if (r.rp >= 10) items.push({ type: 'super10', value: r.rp, text: `${r.rp} raid pts`, side: r.side, playerId: r.id, playerName: names.get(r.id) });
    if (r.tp >= 5) items.push({ type: 'high5', value: r.tp, text: `${r.tp} tackle pts`, side: r.side, playerId: r.id, playerName: names.get(r.id) });
  }
  return block(items);
}
