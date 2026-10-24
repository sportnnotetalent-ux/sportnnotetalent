/**
 * Rugby league's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per half (or the
 * whole match), plus MIN from the field tracker (Overall only). Points nobody
 * can be credited with (a penalty try, an unnamed score) land on the "Team"
 * row so the totals equal the score; so do unnamed errors / penalties. The
 * optional detail columns (TK MT CA LB OL ERR PC) are on every row only when
 * the match tracked them — the column stays hidden otherwise (D8). Team
 * figures: penalty tries, and — with six-tackle sets tracked — sets and
 * completed sets.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { eventCredits, periodName, teamFigures, totalPeriods, trackedDetailKeys, tracked, LIVE_KEYS, type LeagueState, type Side } from './engine.ts';
import { setFigures } from './sets.ts';
import { leagueTotals } from './totals.ts';
import { withNames, type NameOf } from '../invasion/names.ts';
import { withRosters } from '../racketNames.ts';

/** `nameOf` (IDs-only scoring): the viewer's names by player id. */
export interface LeagueBoxContext { homeRoster?: Player[]; awayRoster?: Player[]; nameOf?: NameOf }

const CORE_KEYS: string[] = [...LIVE_KEYS];

export function leagueBox(s0: LeagueState, ctx: LeagueBoxContext = {}): MatchBoxSource {
  // IDs-only scoring: rows key by id; names are the viewer's (else the squad's)
  const s = withNames(s0, withRosters(ctx.nameOf, ctx.homeRoster, ctx.awayRoster));
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  const detail = trackedDetailKeys(s);
  const ROW_KEYS = [...new Set([...CORE_KEYS, ...detail])];
  const setsOn = tracked(s, 'trackSets');
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since ? 5000 : undefined,
    data: (scope) => {
      const totals = scope === 'all' ? leagueTotals(s) : {};
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
        const want: Record<string, number> = {
          points: f.points, tries: f.tries, conversions: f.conversions, conversionAttempts: f.conversionAttempts, penGoals: f.penGoals, penGoalAttempts: f.penGoalAttempts,
          dropFieldGoals: f.fieldGoals, dropFieldGoalAttempts: f.fieldGoalAttempts, sinBins: f.sinBins, sendOffs: f.sendOffs,
        };
        for (const k of detail) want[k] = f.detail[k] ?? 0;
        const teamRow: Record<string, number> = {};
        for (const [k, v] of Object.entries(want)) {
          const left = v - sum(k);
          if (left > 0) teamRow[k] = left;
        }
        const sf = setsOn ? setFigures(s, sd, scope) : null;
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamRow).length ? { team: { label: f.penaltyTries ? 'Team (penalty tries)' : 'Team', stats: teamRow } } : {}),
          teamStats: {
            penaltyTries: f.penaltyTries,
            ...(sf ? { sets: sf.sets, completedSets: sf.completed } : {}),
          },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
