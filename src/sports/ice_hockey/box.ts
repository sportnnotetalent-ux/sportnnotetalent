/**
 * SD-145 — ice hockey's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per period (or the
 * whole game), plus the goalies' SA / GA / MIN and +/- (Overall only, from
 * statTotals). Team figures feed the comparison (power plays, time-outs);
 * bench minors and anything logged without a player land on the "Team" row so
 * the totals equal the score.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { eventCredits, periodName, tallyTracked, teamFigures, totalPeriods, FLAG_KEYS, LIVE_KEYS, TALLY_KEYS, TRACK_FLAGS, type IceHockeyState, type Side } from './engine.ts';
import { iceHockeyTotals } from './totals.ts';
import { withNames, type NameOf } from '../invasion/names.ts';
import { withRosters } from '../racketNames.ts';

/** `nameOf` (IDs-only scoring): the viewer's names by player id. */
export interface IceHockeyBoxContext { homeRoster?: Player[]; awayRoster?: Player[]; nameOf?: NameOf }

const BASE_KEYS = ['goals', 'assists', 'points', 'shotsOnGoal', 'penaltyMinutes'] as const;
const TEAM_KEYS = ['goals', 'shotsOnGoal', 'penaltyMinutes'] as const;
/** keys a box row may carry: the live keys and the optional tallies */
const CREDIT_KEYS = new Set<string>([...LIVE_KEYS, ...TALLY_KEYS]);

export function iceHockeyBox(s0: IceHockeyState, ctx: IceHockeyBoxContext = {}): MatchBoxSource {
  // IDs-only scoring: rows key by id; names are the viewer's (else the squad's)
  const s = withNames(s0, withRosters(ctx.nameOf, ctx.homeRoster, ctx.awayRoster));
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  // deep wave: a tracked tally's keys read 0 on every row (an untracked one is absent: no column)
  const ROW_KEYS: string[] = [...BASE_KEYS, ...TRACK_FLAGS.filter((f) => tallyTracked(s, f)).flatMap((f) => FLAG_KEYS[f])];
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since ? 5000 : undefined,
    data: (scope) => {
      const totals = scope === 'all' ? iceHockeyTotals(s) : {};
      const side = (sd: Side): BoxSideInput => {
        const roster = (sd === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
        const rows = new Map<string, BoxRowInput>();
        const keyOf = (id?: string, name?: string) => id ?? (name ? `name:${name}` : '');
        const row = (id?: string, name?: string) => {
          const k = keyOf(id, name);
          if (!k) return undefined;
          let r = rows.get(k);
          if (!r) {
            const nm = name ?? roster.find((p) => p.id === id)?.fullName ?? 'Player';
            r = { name: nm, ...(id ? { playerId: id } : {}), stats: Object.fromEntries(ROW_KEYS.map((x) => [x, 0])) };
            rows.set(k, r);
          }
          return r;
        };
        for (const p of s.xi?.[sd]?.players ?? []) row(p.id, p.name)!.starter = true;
        for (const e of s.events) {
          if (scope !== 'all' && e.period !== scope) continue;
          const c = eventCredits(e, s.pimScale);
          for (const cr of [c.first, c.second, c.third]) {
            if (!cr || (cr.side ?? e.side) !== sd) continue;
            const r = row(cr.playerId, cr.playerName);
            if (!r) continue;
            for (const [k, v] of Object.entries(cr.stats)) if (CREDIT_KEYS.has(k)) r.stats[k] = (r.stats[k] ?? 0) + v;
          }
        }
        if (scope === 'all') {
          for (const [id, t] of Object.entries(totals)) {
            if (t.side !== sd) continue;
            const r = row(id);
            if (!r) continue;
            for (const k of ['shotsAgainst', 'goalsAgainst', 'gkMinutes', 'plusMinus'] as const) if (t.stats[k] !== undefined) r.stats[k] = t.stats[k];
            if (t.stats.shotsAgainst !== undefined) r.stats.saves ??= 0;
          }
        }
        const f = teamFigures(s, sd, scope);
        const sum = (k: string) => [...rows.values()].reduce((a, r) => a + (r.stats[k] ?? 0), 0);
        const teamStats: Record<string, number> = {};
        for (const k of TEAM_KEYS) {
          const left = f[k] - sum(k);
          if (left > 0) teamStats[k] = left;
        }
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamStats).length ? { team: { label: 'Team / bench', stats: teamStats } } : {}),
          teamStats: { timeouts: f.timeouts, ppChances: f.ppChances },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
