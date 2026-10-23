/**
 * SD-51 — helpers shared by the per-sport `matchRecords` hooks (perf F-15
 * split them out of matchRecordHooks.ts). PURE (no React Native).
 */
import { block, scoreItems, type MatchRecordsBlock, type Side } from './matchRecords.ts';

export const ordinal = (n: number): string => {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suf}`;
};

/** The best `n` of a list by value (desc). */
export const topN = <T extends { value: number }>(xs: T[], n: number): T[] => [...xs].sort((a, b) => b.value - a.value).slice(0, n);

export interface GoalLike { side: Side; playerId?: string; playerName?: string; at: number; atText: string }

export function goalRecords(home: number, away: number, goals: GoalLike[], hatTricks: boolean): MatchRecordsBlock | null {
  const items = scoreItems(home, away, { mostGoals: true, biggestWin: true });
  const first = [...goals].sort((a, b) => a.at - b.at)[0];
  if (first && (first.playerId || first.playerName)) {
    items.push({ type: 'fastestGoal', value: first.at, text: first.atText, side: first.side, playerId: first.playerId, playerName: first.playerName });
  }
  const by = new Map<string, { g: GoalLike; n: number }>();
  for (const g of goals) {
    if (!g.playerId && !g.playerName) continue;
    const k = `${g.side}|${g.playerId ?? `n:${g.playerName}`}`;
    const cur = by.get(k);
    if (cur) cur.n += 1; else by.set(k, { g, n: 1 });
  }
  const scorers = [...by.values()];
  if (hatTricks) {
    for (const { g, n } of scorers) if (n >= 3) items.push({ type: 'hatTrick', value: n, text: `${n} goals`, side: g.side, playerId: g.playerId, playerName: g.playerName });
  } else {
    for (const { g, n } of topN(scorers.map((x) => ({ ...x, value: x.n })), 3)) {
      items.push({ type: 'playerGoals', value: n, text: `${n} goal${n === 1 ? '' : 's'}`, side: g.side, playerId: g.playerId, playerName: g.playerName });
    }
  }
  return block(items);
}

export const clockMinute = (sec: number) => `${Math.floor(Math.max(0, sec) / 60) + 1}'`;
