/**
 * Rugby league's broadcast "Match stats" sheet (NRL / Super League match
 * centre style). PURE, derived from the event and set logs only, so
 * corrections and undo re-derive it. Overall or one half (golden point too).
 *
 *  - Scoring: points, tries (penalty / bonus-zone tries), conversions,
 *    penalty goals, field goals (2-pointers), goal kicking.
 *  - Sets & completions (six-tackle sets tracked): sets, completed sets
 *    (completion rate), tackles per set, possession on the playing clock, and
 *    how sets ended — definitions in ./sets.ts.
 *  - Attack / Defence (detail tracked): runs, line breaks, offloads; tackles,
 *    missed tackles, tackle success.
 *  - Discipline: errors and penalties conceded (tracked), sin bins, send-offs,
 *    sin-bin time served, on report.
 *  - Interchanges used; points by half.
 * Rows exist only for what the match tracked (D8 — never a false 0).
 */
import {
  matchSec, periodLong, playedOffset, teamFigures, totalPeriods, tracked, trackedDetails,
  type LeagueEvent, type LeagueState, type Side,
} from './engine.ts';
import { setFigures } from './sets.ts';
import { countRow, decRow, madeRow, section, shareRow, sheet, timeRow, type StatSheet } from '../compareSheet.ts';

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Sin-bin time served (playing seconds) by a side's players over a scope: each
 *  sin bin runs its minutes on the playing clock, cut short by the end of the
 *  match so far. */
export function sinBinTime(s: LeagueState, side: Side, scope: 'all' | number = 'all', nowSec?: number): number {
  const end = Math.max(nowSec ?? matchSec(s), 0);
  const w0 = scope === 'all' ? 0 : playedOffset(s, scope);
  const w1 = scope === 'all' || scope >= s.period ? Infinity : playedOffset(s, scope + 1);
  let t = 0;
  for (const e of s.events) {
    if (e.type !== 'sanction' || e.sanction !== 'sinBin' || e.side !== side || (!e.playerId && !e.playerName)) continue;
    const to = Math.min(e.sec + s.sinBinMinutes * 60, end, w1);
    const from = Math.max(e.sec, w0);
    if (to > from) t += to - from;
  }
  return t;
}

const count = (s: LeagueState, side: Side, scope: 'all' | number, f: (e: LeagueEvent) => boolean) =>
  s.events.filter((e) => e.side === side && (scope === 'all' || e.period === scope) && f(e)).length;

/** The sheet for a scope ('all' or a period). `nowSec` = the live playing second. */
export function leagueSheet(s: LeagueState, scope: 'all' | number = 'all', nowSec?: number): StatSheet {
  const H = teamFigures(s, 'home', scope), A = teamFigures(s, 'away', scope);
  const det = trackedDetails(s);
  const has = (d: string) => (det as string[]).includes(d);
  const dt = (k: string) => ({ h: H.detail[k] ?? 0, a: A.detail[k] ?? 0 });
  const tk = dt('tackles'), mt = dt('missedTackles');
  const setsOn = tracked(s, 'trackSets');
  const SH = setsOn ? setFigures(s, 'home', scope, nowSec) : null;
  const SA = setsOn ? setFigures(s, 'away', scope, nowSec) : null;
  const ends = (k: keyof NonNullable<typeof SH>['ends'], label: string, lowerBetter = false) =>
    SH && SA && (SH.ends[k] || SA.ends[k]) && countRow(`end:${k}`, label, SH.ends[k], SA.ends[k], lowerBetter ? { lowerBetter: true } : undefined);
  const bin = { h: sinBinTime(s, 'home', scope, nowSec), a: sinBinTime(s, 'away', scope, nowSec) };
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const ptsIn = (sd: Side, p: number) => teamFigures(s, sd, p).points;
  const gps = s.plan.slice(0, n).filter((x) => x === 'gp').length;
  const halfLabel = (p: number) => (s.plan[p - 1] === 'gp'
    ? `Golden ${s.goldenTry ? 'try' : 'point'}${gps > 1 ? ` ${s.plan.slice(0, p).filter((x) => x === 'gp').length}` : ''}` : cap(periodLong(s, p)));
  const reports = { h: count(s, 'home', scope, (e) => e.type === 'sanction' && e.sanction === 'report'), a: count(s, 'away', scope, (e) => e.type === 'sanction' && e.sanction === 'report') };
  return sheet([
    section('scoring', 'Scoring', [
      countRow('points', 'Points', H.points, A.points),
      countRow('tries', 'Tries', H.tries, A.tries),
      (H.penaltyTries || A.penaltyTries) && countRow('penaltyTries', 'Penalty tries', H.penaltyTries, A.penaltyTries),
      (H.bonusTries || A.bonusTries) && countRow('bonusTries', 'Bonus-zone tries', H.bonusTries, A.bonusTries),
      madeRow('conversions', 'Conversions', H.conversions, H.conversionAttempts, A.conversions, A.conversionAttempts),
      madeRow('penGoals', 'Penalty goals', H.penGoals, H.penGoalAttempts, A.penGoals, A.penGoalAttempts),
      madeRow('fieldGoals', 'Field goals', H.fieldGoals, H.fieldGoalAttempts, A.fieldGoals, A.fieldGoalAttempts),
      (H.twoPointFieldGoals || A.twoPointFieldGoals) && countRow('twoPointFieldGoals', '2-point field goals', H.twoPointFieldGoals, A.twoPointFieldGoals),
      madeRow('goalKicking', 'Goal kicking', H.conversions + H.penGoals, H.conversionAttempts + H.penGoalAttempts, A.conversions + A.penGoals, A.conversionAttempts + A.penGoalAttempts),
    ]),
    SH && SA && section('sets', 'Sets & completions', [
      countRow('sets', 'Sets', SH.sets, SA.sets),
      madeRow('completion', 'Completed sets', SH.completed, SH.decided, SA.completed, SA.decided),
      (SH.finished || SA.finished) && decRow('tacklesPerSet', 'Tackles per set',
        SH.finished ? SH.tackles / SH.finished : undefined, SA.finished ? SA.tackles / SA.finished : undefined, 1),
      shareRow('possession', 'Possession', SH.time, SA.time),
      ends('error', 'Sets ended by an error', true),
      ends('penalty', 'Penalties against (with the ball)', true),
      ends('sixth', 'Handovers on the last tackle', true),
      ends('kick', 'Sets ended with a kick'),
      ends('restart', 'Six agains / penalties won'),
      ends('penWon', 'Penalties won (with the ball)'),
    ], 'A set is complete unless it ends in an error, a penalty against the side with the ball, or a handover on the last tackle. Possession: time on the playing clock.'),
    (has('run') || has('lineBreak') || has('offload')) && section('attack', 'Attack', [
      has('run') && countRow('carries', 'Runs', dt('carries').h, dt('carries').a),
      has('lineBreak') && countRow('lineBreaks', 'Line breaks', dt('lineBreaks').h, dt('lineBreaks').a),
      has('offload') && countRow('offloads', 'Offloads', dt('offloads').h, dt('offloads').a),
    ]),
    has('tackle') && section('defence', 'Defence', [
      countRow('tackles', 'Tackles made', tk.h, tk.a),
      countRow('missedTackles', 'Missed tackles', mt.h, mt.a, { lowerBetter: true }),
      madeRow('tackleSuccess', 'Tackle efficiency', tk.h, tk.h + mt.h, tk.a, tk.a + mt.a),
    ]),
    section('discipline', 'Discipline', [
      has('error') && countRow('errors', 'Errors', dt('handlingErrors').h, dt('handlingErrors').a, { lowerBetter: true }),
      has('penalty') && countRow('penaltiesConceded', 'Penalties conceded', dt('penaltiesGivenAway').h, dt('penaltiesGivenAway').a, { lowerBetter: true }),
      countRow('sinBins', 'Sin bins', H.sinBins, A.sinBins, { lowerBetter: true }),
      countRow('sendOffs', 'Send-offs', H.sendOffs, A.sendOffs, { lowerBetter: true }),
      timeRow('sinBin', 'Sin-bin time', bin.h, bin.a, { lowerBetter: true }),
      (reports.h || reports.a) && countRow('onReport', 'Placed on report', reports.h, reports.a, { lowerBetter: true }),
    ]),
    (H.interchanges || A.interchanges) && section('interchanges', 'Interchanges', [
      countRow('interchanges', s.maxInterchanges > 0 ? `Interchanges used (of ${s.maxInterchanges})` : 'Interchanges used', H.interchanges, A.interchanges, { plain: true }),
    ]),
    scope === 'all' && n >= 2 && section('byPeriod', 'Points by half',
      Array.from({ length: n }, (_, i) => countRow(`points${i + 1}`, halfLabel(i + 1), ptsIn('home', i + 1), ptsIn('away', i + 1)))),
  ]);
}
