/**
 * SD-51 — Basketball's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, scoreItems, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import { topN } from '../recordHelpers.ts';
import type { BasketballState } from './engine.ts';
import { eventCredits } from './credits.ts';
import { shotsTracked } from './totals.ts';
import { hasPlayer, playId } from './names.ts';

/** Basketball: team high, biggest win, each side's top 2 scorers, 30-point
 *  games (40+ marked), triple-doubles (10+ in three of PTS / REB / AST / STL /
 *  BLK — only what the scorer logged). Players by id (IDs-only scoring: an
 *  older log's stored name rides along only where it had one). */
export function basketballMatchRecords(s: BasketballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items = scoreItems(s.home, s.away, { teamHigh: true, biggestWin: true });
  const halfCourt = s.targetPoints > 0;
  const tracked = shotsTracked(s);
  const lines = new Map<string, { side: Side; name?: string; id?: string; st: Record<string, number> }>();
  for (const e of s.events ?? []) {
    if (!hasPlayer(e)) continue;
    const c = eventCredits(e, halfCourt, tracked);
    if (!Object.keys(c).length) continue;
    const id = playId(s, e);
    const k = `${e.side}|${id ?? `n:${e.playerName}`}`;
    const l = lines.get(k) ?? { side: e.side, name: e.playerName, id, st: {} };
    for (const [key, v] of Object.entries(c)) l.st[key] = (l.st[key] ?? 0) + v;
    lines.set(k, l);
  }
  const all = [...lines.values()];
  for (const side of ['home', 'away'] as Side[]) {
    for (const l of topN(all.filter((x) => x.side === side && (x.st.points ?? 0) > 0).map((x) => ({ ...x, value: x.st.points ?? 0 })), 2)) {
      items.push({ type: 'playerHigh', value: l.value, text: `${l.value} pts`, side, playerId: l.id, playerName: l.name });
    }
  }
  const CATS: [string, string][] = [['points', 'pts'], ['rebounds', 'reb'], ['assists', 'ast'], ['steals', 'stl'], ['blocks', 'blk']];
  for (const l of all) {
    const pts = l.st.points ?? 0;
    if (pts >= 30) items.push({ type: 'bigGame', value: pts, text: `${pts} pts${pts >= 40 ? ' · 40+' : ''}`, side: l.side, playerId: l.id, playerName: l.name });
    const tens = CATS.filter(([k]) => (l.st[k] ?? 0) >= 10);
    if (tens.length >= 3) {
      items.push({ type: 'tripleDouble', value: pts, text: tens.map(([k, u]) => `${l.st[k]} ${u}`).join(' · '), side: l.side, playerId: l.id, playerName: l.name });
    }
  }
  return block(items);
}
