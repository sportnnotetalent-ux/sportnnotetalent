/**
 * Pool — the box score source (shared MatchBoxScore, columns from the stat
 * schema's `box`): one row per player with the match's figures — the same
 * numbers `statTotals` writes, so the box and the careers never disagree.
 * The per-player table is drawn in scotch doubles (who shot); in singles the
 * comparison panel already says it all. PURE.
 */
import type { MatchBoxSource, BoxRowInput } from '../boxScore.ts';
import type { Player } from '../../core/types';
import type { NameOf } from '../../core/playerNames';
import { whoName } from '../racketNames.ts';
import type { Side } from './balls.ts';
import { perSideOf, type PoolMatch } from './match.ts';
import { poolSideRecord, poolStatTotals } from './totals.ts';

export function poolBox(s: PoolMatch, ctx: { homeRoster?: Player[]; awayRoster?: Player[]; nameOf?: NameOf } = {}): MatchBoxSource {
  const doubles = perSideOf(s) === 2;
  const roster = (sd: Side) => (sd === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
  const pair = (sd: Side) => roster(sd).slice(0, doubles ? 2 : 1).map((p) => ({ id: p.id }));
  const totals = poolStatTotals(s, { players: { home: pair('home'), away: pair('away') } });
  const nameFor = (id: string, sd: Side) =>
    (ctx.nameOf ? whoName(ctx.nameOf, id) : undefined) ?? roster(sd).find((p) => p.id === id)?.fullName ?? 'Player';
  const side = (sd: Side) => {
    const rows: BoxRowInput[] = Object.entries(totals)
      .filter(([, t]) => t.side === sd)
      .map(([id, t]) => ({ name: nameFor(id, sd), playerId: id, stats: t.stats }));
    return { rows, teamStats: { racksWon: poolSideRecord(s, sd).racksWon } };
  };
  return {
    periods: [],
    players: doubles,
    emptyText: 'No racks yet.',
    data: () => ({ home: side('home'), away: side('away') }),
  };
}
