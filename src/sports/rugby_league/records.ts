/** Rugby league's per-match record candidates (SD-51 hook, set on the plugin
 *  by the registry through matchRecordHooks.ts). PURE: from the final state
 *  only. Highest team score, biggest win, most points in a match, the first
 *  try, try hat-tricks, each side's top 2 points scorers (penalty tries are
 *  the team's, never a player's). Types listed in matchRecords.ts. */
import { block, scoreItems, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import { minuteText, pointsOf, type LeagueState, type Side } from './engine.ts';

export function leagueMatchRecords(s: LeagueState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.events)) return null;
  const items: MatchRecordItem[] = scoreItems(s.home, s.away, { teamHigh: true, mostGoals: true, biggestWin: true });
  const tries = s.events.filter((e) => e.type === 'try');
  const first = [...tries].sort((a, b) => a.period - b.period || a.psec - b.psec)[0];
  if (first && (first.playerId || first.playerName)) {
    items.push({ type: 'fastestTry', value: first.sec, text: minuteText(s, first.period, first.psec), side: first.side, playerId: first.playerId, playerName: first.playerName });
  }
  const lines = new Map<string, { side: Side; id?: string; name?: string; tries: number; points: number }>();
  for (const e of s.events) {
    if (e.type === 'pentry' || (!e.playerId && !e.playerName)) continue;
    const pts = pointsOf(e);
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
    const top = [...lines.values()].filter((x) => x.side === side).sort((a, b) => b.points - a.points).slice(0, 2);
    for (const l of top) items.push({ type: 'playerPoints', value: l.points, text: `${l.points} pts`, side, playerId: l.id, playerName: l.name });
  }
  return block(items);
}
