/**
 * Deep wave (volleyball-kabaddi) — the volleyball player box at FIVB VIS
 * depth: the shared box (boxSources.volleyballBox — points, attack, aces,
 * blocks, attempts / efficiency, serve errors, errors) plus, per set or the
 * match, serve attempts (toss + rotation known), receptions (graded + aced),
 * reception errors, digs and set assists — each column only on a match that
 * captured it (D8: a column shows when a row carries the key). PURE.
 *
 * Drawn through MatchBoxScore's `schema` view, so the sport's own `box`
 * (pinned by the shared tests) is unchanged.
 */
import type { Player } from '../../core/types';
import type { SportStatSchema } from '../statSchema.ts';
import type { BoxRowInput, BoxScope, MatchBoxSource } from '../boxScore.ts';
import { volleyballBox, type BoxContext } from '../boxSources.ts';
import { volleyballStats } from './stats.ts';
import type { VolleyballState } from './engine.ts';
import { acedTracked, assistTracked, detailTally, digTracked, receptionTracked } from './detail.ts';
import { rallyServers, serveTracked } from './rotation.ts';

type Side = 'home' | 'away';

/** The box columns of the deep view (FIVB VIS order: scoring, attack, serve,
 *  reception, defence, setting, errors). */
export const VOLLEYBALL_DEEP_BOX: SportStatSchema<'volleyball'> = {
  ...volleyballStats,
  box: [{
    columns: [
      { key: 'points', emphasis: true }, 'attackPoints', 'blocks', 'aces',
      'attackAttempts', 'attackEff', 'serveAttempts', 'serveErrors',
      'receptions', 'receptionPositivePct', 'receptionErrors', 'digs', 'setAssists', 'errors',
    ],
  }],
};

/** Per player ("side|name"): serve attempts in the scope — only when every
 *  served rally of the MATCH names its server (the totals' rule). */
function serves(s: VolleyballState, scope: BoxScope): Map<string, number> | null {
  if (!serveTracked(s)) return null;
  const all = rallyServers(s);
  if (!all.length || all.some((r) => !r.serverId || !r.side)) return null;
  const out = new Map<string, number>();
  for (const r of all) {
    if (scope !== 'all' && r.set !== scope) continue;
    const k = `${r.side}|${r.serverName ?? ''}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

const idIn = (name: string, roster: Player[]) => roster.find((p) => p.fullName === name)?.id;

/** The deep box source: the shared one + the deep-wave keys per row. */
export function volleyballDeepBox(s: VolleyballState, ctx: BoxContext = {}): MatchBoxSource {
  const base = volleyballBox(s, ctx);
  const recv = receptionTracked(s) || acedTracked(s);
  const aced = acedTracked(s);
  const dig = digTracked(s);
  const assist = assistTracked(s);
  return {
    ...base,
    data: (scope) => {
      const d = base.data(scope);
      const srv = serves(s, scope);
      if (!recv && !dig && !assist && !srv) return d;
      const tally = detailTally(s, scope);
      const side = (sd: Side) => {
        const roster = (sd === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
        const rows: BoxRowInput[] = d[sd].rows.map((r) => ({ ...r, stats: { ...r.stats } }));
        const rowOf = (name: string): BoxRowInput => {
          let r = rows.find((x) => x.name === name);
          if (!r) {
            const id = idIn(name, roster);
            r = { name, ...(id ? { playerId: id } : {}), stats: { points: 0, aces: 0, blocks: 0 } };
            rows.push(r);
          }
          return r;
        };
        const keys: string[] = [
          ...(recv ? ['receptions', 'receptionsPositive'] : []), ...(aced ? ['receptionErrors'] : []),
          ...(dig ? ['digs'] : []), ...(assist ? ['setAssists'] : []), ...(srv ? ['serveAttempts'] : []),
        ];
        for (const l of tally.values()) {
          if (l.side !== sd) continue;
          const r = rowOf(l.name);
          if (recv) { r.stats.receptions = l.receptions; r.stats.receptionsPositive = l.receptionsPositive; }
          if (aced) r.stats.receptionErrors = l.receptionErrors;
          if (dig) r.stats.digs = l.digs;
          if (assist) r.stats.setAssists = l.setAssists;
        }
        if (srv) for (const [k, v] of srv) if (k.startsWith(`${sd}|`) && k.length > sd.length + 1) rowOf(k.slice(sd.length + 1)).stats.serveAttempts = v;
        for (const r of rows) for (const k of keys) if (typeof r.stats[k] !== 'number') r.stats[k] = 0;
        return { ...d[sd], rows };
      };
      return { ...d, home: side('home'), away: side('away') };
    },
  };
}
