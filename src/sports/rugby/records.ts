/**
 * SD-51 — Rugby union's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, scoreItems, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import { topN } from '../recordHelpers.ts';
import { minuteText as rugbyMinute, pointsOf as rugbyPoints, type RugbyState } from './engine.ts';

/** SD-143 — rugby: team high, biggest win, most points in a match, the
 *  first try, try hat-tricks, and each side's top 2 points scorers (penalty
 *  tries are the team's, never a player's). */
export function rugbyMatchRecords(s: RugbyState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.events)) return null;
  const items = scoreItems(s.home, s.away, { teamHigh: true, mostGoals: true, biggestWin: true });
  const tries = s.events.filter((e) => e.type === 'try');
  const first = [...tries].sort((a, b) => a.period - b.period || a.psec - b.psec)[0];
  if (first && (first.playerId || first.playerName)) {
    items.push({ type: 'fastestTry', value: first.sec, text: rugbyMinute(s, first.period, first.psec), side: first.side, playerId: first.playerId, playerName: first.playerName });
  }
  const lines = new Map<string, { side: Side; id?: string; name?: string; tries: number; points: number }>();
  for (const e of s.events) {
    if (e.type === 'pentry' || (!e.playerId && !e.playerName) || e.official) continue;
    const pts = rugbyPoints(e);
    if (!pts) continue;
    const k = `${e.side}|${e.playerId ?? `n:${e.playerName}`}`;
    const l = lines.get(k) ?? { side: e.side, id: e.playerId, name: e.playerName, tries: 0, points: 0 };
    l.points += pts;
    if (e.type === 'try') l.tries += 1;
    lines.set(k, l);
  }
  for (const l of lines.values()) {
    if (l.tries >= 3) items.push({ type: 'tryHatTrick', value: l.tries, text: `${l.tries} tries`, side: l.side, playerId: l.id, playerName: l.name });
  }
  for (const side of ['home', 'away'] as Side[]) {
    for (const l of topN([...lines.values()].filter((x) => x.side === side).map((x) => ({ ...x, value: x.points })), 2)) {
      items.push({ type: 'playerPoints', value: l.points, text: `${l.points} pts`, side, playerId: l.id, playerName: l.name });
    }
  }
  return block(items);
}
