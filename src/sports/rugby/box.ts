/**
 * SD-143 — rugby's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per half (or the
 * whole match), plus MIN from the field tracker (Overall only). Points nobody
 * can be credited with (a penalty try, an unattributed score) land on the
 * "Team" row so the totals equal the score. Team figures feed the comparison:
 * penalty tries, lineouts and scrums on the team's own throw / feed. Deep
 * wave: the "Stats to track" player keys (PC, TC, OL; round 2: FKC) are on
 * every row only when the match tracked them (D8 — the column stays hidden
 * otherwise).
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import {
  detailStatsTracked, eventCredits, periodName, teamFigures, totalPeriods, trackedTallyKeys, LIVE_KEYS, type RugbyState, type Side,
} from './engine.ts';
import { rugbyTotals } from './totals.ts';
import { withNames, type NameOf } from '../invasion/names.ts';
import { withRosters } from '../racketNames.ts';

/** `nameOf` (IDs-only scoring): the viewer's names by player id. */
export interface RugbyBoxContext { homeRoster?: Player[]; awayRoster?: Player[]; nameOf?: NameOf }

const CORE_KEYS: string[] = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
const TEAM_KEYS = ['points', 'tries', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropGoals', 'dropGoalAttempts', 'yellowCards', 'redCards'] as const;

export function rugbyBox(s0: RugbyState, ctx: RugbyBoxContext = {}): MatchBoxSource {
  // IDs-only scoring: rows key by id; names are the viewer's (else the squad's)
  const s = withNames(s0, withRosters(ctx.nameOf, ctx.homeRoster, ctx.awayRoster));
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  // NZI11 (no false zeros): detail columns per kind, once one was recorded
  const detail = detailStatsTracked(s);
  // deep wave: a tracked toggle's keys read 0 on every row (an untracked one is absent: no column)
  const tallies = trackedTallyKeys(s);
  const ROW_KEYS = [...new Set([...CORE_KEYS, ...detail, ...tallies])];
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since ? 5000 : undefined,
    data: (scope) => {
      const totals = scope === 'all' ? rugbyTotals(s) : {};
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
        for (const e of s.events) if (e.side === sd && e.type === 'sub' && (e.secondId || e.secondName)) row(e.secondId, e.secondName);
        for (const e of s.events) {
          if (e.side !== sd || (scope !== 'all' && e.period !== scope)) continue;
          const c = eventCredits(e);
          for (const cr of [c.first, c.second]) {
            if (!cr) continue;
            const r = row(cr.playerId, cr.playerName);
            if (r) for (const [k, v] of Object.entries(cr.stats)) if (k in r.stats) r.stats[k] += v;
          }
        }
        if (scope === 'all') {
          for (const [id, t] of Object.entries(totals)) {
            if (t.side !== sd) continue;
            const r = row(id);
            if (r && t.stats.minutes !== undefined) r.stats.minutes = t.stats.minutes;
          }
        }
        const f = teamFigures(s, sd, scope);
        const sum = (k: string) => [...rows.values()].reduce((a, r) => a + (r.stats[k] ?? 0), 0);
        const want: Record<string, number> = Object.fromEntries(TEAM_KEYS.map((k) => [k, f[k]]));
        for (const k of detail) want[k] = f.detail[k] ?? 0;
        // deep wave: unnamed penalties / turnovers / offloads land on the Team row
        if (tallies.includes('penaltiesGivenAway')) want.penaltiesGivenAway = (f.detail.penaltiesGivenAway ?? 0) + f.tally.penalty;
        if (tallies.includes('turnoversConceded')) want.turnoversConceded = f.tally.turnover;
        if (tallies.includes('offloads')) want.offloads = f.tally.offload;
        // round 2: unnamed free kicks too, once the match credits free kicks to players
        if (tallies.includes('freeKicksConceded')) want.freeKicksConceded = f.tally.freeKick;
        const teamStats: Record<string, number> = {};
        for (const [k, v] of Object.entries(want)) {
          const left = v - sum(k);
          if (left > 0) teamStats[k] = left;
        }
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamStats).length ? { team: { label: f.penaltyTries ? 'Team (penalty tries)' : 'Team', stats: teamStats } } : {}),
          teamStats: {
            penaltyTries: f.penaltyTries,
            ...(detail || f.lineoutsWon + f.lineoutsLost + f.scrumsWon + f.scrumsLost > 0
              ? { lineoutsWon: f.lineoutsWon, lineoutsLost: f.lineoutsLost, scrumsWon: f.scrumsWon, scrumsLost: f.scrumsLost } : {}),
          },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
