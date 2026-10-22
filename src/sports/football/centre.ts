/**
 * Deep wave — football's match-centre box source: the SD-23 football source
 * (players, possession, the FIFA-style team totals) plus the depth team
 * figures (./depth.ts), scoped to the same half. PURE.
 */
import type { BoxScope, MatchBoxSource } from '../boxScore.ts';
import { footballBox, type BoxContext } from '../boxSources.ts';
import type { FootballState } from './engine.ts';
import { footballDepthTeamStats, footballDepthUntracked, footballPossession } from './depth.ts';

export function footballCentreSource(s: FootballState, ctx: BoxContext = {}): MatchBoxSource {
  const base = footballBox(s, ctx);
  return {
    ...base,
    data: (scope: BoxScope) => {
      const d = base.data(scope);
      // the same half scoping the base source uses (stored `half`)
      const scoped = scope === 'all' ? s : { ...s, stats: s.stats.filter((e) => e.half === scope), events: s.events.filter((e) => e.half === scope) };
      const depth = footballDepthTeamStats(scoped);
      const untracked = [...(d.untracked ?? []), ...footballDepthUntracked(s)];
      // possession only once the ball has changed hands (kick-off alone gives
      // one side 100% — a false figure when the bar was never used)
      const realPossession = !!footballPossession(s, ctx.now ?? Date.now());
      const team = (t: Record<string, number> | undefined, extra: Record<string, number>) => {
        const out = { ...t, ...extra };
        if (!realPossession) delete out.possession;
        return out;
      };
      return {
        ...d,
        home: { ...d.home, teamStats: team(d.home.teamStats, depth.home) },
        away: { ...d.away, teamStats: team(d.away.teamStats, depth.away) },
        ...(untracked.length ? { untracked } : {}),
      };
    },
  };
}
