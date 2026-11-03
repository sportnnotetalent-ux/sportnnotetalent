/**
 * Deep wave — rugby union's broadcast "Match stats" sheet (World Rugby match
 * statistics / URC & Premiership Opta match centre / Rugby World Cup match
 * stats). PURE, derived from the event log only, so corrections and undo
 * re-derive it and old matches show what they had.
 *
 *  - Scoring: points, tries (penalty tries), conversions / penalty goals /
 *    drop goals made of attempted, goal-kicking %; points by half (Overall).
 *  - Attack: carries, line breaks (detail), offloads, 22 entries and points
 *    per 22 entry (house definition below).
 *  - Defence: tackles made / missed, tackle success %, turnovers won (detail).
 *  - Set piece: lineouts on the own throw and scrums on the own feed (won of
 *    total, %), steals (the other side's lost ones).
 *  - Possession & territory: time-weighted on the playing clock from the
 *    scorer's switches; round 2: "Ball dead" spells run neither clock, and
 *    the note then gives the ball-in-play time.
 *  - Discipline: penalties conceded (and by offence), free kicks, yellow / red
 *    cards, sin-bin time served.
 *  - Turnovers conceded (and by cause).
 * Rows exist only for what the match tracked (D8 — never a false 0).
 *
 * Points per 22 entry (house definition): the points a team scores after
 * entering the opposition 22, until the next 22 entry by either team or the
 * end of the period, divided by its entries. A try scored with no entry tapped
 * for that team since the last one counts as an entry (a try is always scored
 * inside the 22).
 */
import {
  ballTime, deadSpans, detailTracked, matchSec, penaltiesTracked, periodLong, playedOffset, pointsOf, tallyTracked, teamFigures, totalPeriods,
  CAUSE_LABEL, INFRINGEMENTS, INFRINGEMENT_LABEL, TURNOVER_CAUSES, minuteText,
  type RugbyEvent, type RugbyState, type Side,
} from './engine.ts';
import { countRow, decRow, madeRow, section, shareRow, sheet, timeRow, type StatSheet } from '../compareSheet.ts';
import { ruledOutTracked } from '../invasion/ruledOut.ts';
import { restartSection } from '../invasion/restarts.ts';

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const inScope = (e: RugbyEvent, scope: 'all' | number) => scope === 'all' || e.period === scope;
/** events in game order (a backfilled moment at its own time) */
const ordered = (s: RugbyState) => s.events.map((e, i) => ({ e, i })).sort((x, y) => x.e.period - y.e.period || x.e.sec - y.e.sec || x.i - y.i).map((x) => x.e);

/** 22 entries, the points scored from them and the entries that scored, per
 *  side over a scope (the house definition above). */
export function entryFigures(s: RugbyState, scope: 'all' | number = 'all'): Record<Side, { entries: number; points: number; scoring: number }> {
  type Open = { side: Side; period: number; points: number };
  const out = { home: { entries: 0, points: 0, scoring: 0 }, away: { entries: 0, points: 0, scoring: 0 } };
  const counts = (p: number) => scope === 'all' || p === scope;
  const entries: Open[] = [];
  /** the entry still running (none after a period ends) */
  let open: Open | undefined;
  let period = 0;
  for (const e of ordered(s)) {
    if (e.period !== period) { open = undefined; period = e.period; }
    const tapped = e.type === 'tally' && e.tally === 'entry';
    // a try is always scored inside the 22: no entry tapped for the side → it counts as one
    const implied = (e.type === 'try' || e.type === 'pentry') && open?.side !== e.side;
    if (tapped || implied) {
      open = { side: e.side, period: e.period, points: 0 };
      entries.push(open);
    }
    const pts = pointsOf(e);
    if (pts && open && open.side === e.side) open.points += pts;
  }
  for (const x of entries) {
    if (!counts(x.period)) continue;
    out[x.side].entries += 1;
    out[x.side].points += x.points;
    if (x.points > 0) out[x.side].scoring += 1;
  }
  return out;
}

/** Sin-bin time served (playing seconds) by a side's players over a scope:
 *  each yellow runs its minutes on the playing clock, cut short by a red to
 *  the same player or the end of the match so far. */
export function sinBinTime(s: RugbyState, side: Side, scope: 'all' | number = 'all', nowSec?: number): number {
  const end = Math.max(nowSec ?? matchSec(s), 0);
  const w0 = scope === 'all' ? 0 : playedOffset(s, scope);
  const w1 = scope === 'all' || scope >= s.period ? Infinity : playedOffset(s, scope + 1);
  const same = (a: RugbyEvent, b: RugbyEvent) => (a.playerId ? a.playerId === b.playerId : !!a.playerName && a.playerName === b.playerName);
  let t = 0;
  for (const y of s.events) {
    if (y.type !== 'card' || y.card !== 'yellow' || y.official || y.side !== side || (!y.playerId && !y.playerName)) continue;
    const red = s.events.find((r) => r.type === 'card' && r.card === 'red' && r.side === side && !r.official && r.sec >= y.sec && r !== y && same(y, r));
    const to = Math.min(y.sec + s.sinBinMinutes * 60, red ? red.sec : Infinity, end, w1);
    const from = Math.max(y.sec, w0);
    if (to > from) t += to - from;
  }
  return t;
}

const count = (s: RugbyState, side: Side, scope: 'all' | number, f: (e: RugbyEvent) => boolean) =>
  s.events.filter((e) => e.side === side && inScope(e, scope) && f(e)).length;

/** The possession / territory note: from the scorer's switches (and from when,
 *  if late); with "Ball dead" used, the ball-in-play time it measured. */
function ballNote(s: RugbyState, scope: 'all' | number, from: number | undefined, inPlay?: number): string {
  const start = scope === 'all' ? 0 : playedOffset(s, scope);
  let late = '';
  if (from !== undefined && from - start > 60) {
    let p = 1;
    while (p < s.period && playedOffset(s, p + 1) <= from) p++;
    late = ` (from ${minuteText(s, p, from - playedOffset(s, p))})`;
  }
  const bip = inPlay !== undefined ? ` Ball in play ${clock(inPlay)} — "Ball dead" spells left out.` : '';
  return `Time on the playing clock from the scorer's taps${late}.${bip}`;
}
/** "34:05" (minutes can pass 60). */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** The sheet for a scope ('all' or a period). `nowSec` = the live playing second. */
export function rugbySheet(s: RugbyState, scope: 'all' | number = 'all', nowSec?: number): StatSheet {
  const H = teamFigures(s, 'home', scope), A = teamFigures(s, 'away', scope);
  const detail = detailTracked(s);
  const sets = detail || s.events.some((e) => e.type === 'setpiece');
  const dt = (k: string) => ({ h: H.detail[k] ?? 0, a: A.detail[k] ?? 0 });
  const tk = dt('tackles'), mt = dt('missedTackles');
  const entriesOn = tallyTracked(s, 'trackEntries');
  const ent = entriesOn ? entryFigures(s, scope) : null;
  const possOn = tallyTracked(s, 'trackPossession');
  const poss = possOn ? ballTime(s, 'poss', scope, nowSec) : null;
  const terr = possOn ? ballTime(s, 'terr', scope, nowSec) : null;
  // round 2: with "Ball dead" used in the scope, the possession clock IS the ball-in-play time
  const w0 = scope === 'all' ? 0 : playedOffset(s, scope);
  const w1 = scope === 'all' || scope >= s.period ? Infinity : playedOffset(s, scope + 1);
  const deadUsed = possOn && deadSpans(s, Math.max(nowSec ?? matchSec(s), 0)).some(([a, b]) => b > w0 && a < w1);
  const inPlay = deadUsed && poss ? poss.home + poss.away : undefined;
  const pensOn = penaltiesTracked(s);
  const typesOn = tallyTracked(s, 'trackPenalties');
  const pens = (sd: Side) => (sd === 'home' ? H : A).tally.penalty + ((sd === 'home' ? H : A).detail.penaltiesGivenAway ?? 0);
  const tovOn = tallyTracked(s, 'trackTurnovers');
  const bin = { h: sinBinTime(s, 'home', scope, nowSec), a: sinBinTime(s, 'away', scope, nowSec) };
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const ptsIn = (sd: Side, p: number) => teamFigures(s, sd, p).points;
  return sheet([
    section('scoring', 'Scoring', [
      countRow('points', 'Points', H.points, A.points),
      countRow('tries', 'Tries', H.tries, A.tries),
      (H.penaltyTries || A.penaltyTries) && countRow('penaltyTries', 'Penalty tries', H.penaltyTries, A.penaltyTries),
      madeRow('conversions', 'Conversions', H.conversions, H.conversionAttempts, A.conversions, A.conversionAttempts),
      madeRow('penGoals', 'Penalty goals', H.penGoals, H.penGoalAttempts, A.penGoals, A.penGoalAttempts),
      madeRow('dropGoals', 'Drop goals', H.dropGoals, H.dropGoalAttempts, A.dropGoals, A.dropGoalAttempts),
      madeRow('goalKicking', 'Goal kicking', H.conversions + H.penGoals, H.conversionAttempts + H.penGoalAttempts, A.conversions + A.penGoals, A.conversionAttempts + A.penGoalAttempts),
      // invasion batch 6: only a match that tracked them (the toggle, or one logged)
      ruledOutTracked(s.trackRuledOut, s.events) && countRow('triesRuledOut', 'Tries ruled out', count(s, 'home', scope, (e) => e.type === 'ruledout'), count(s, 'away', scope, (e) => e.type === 'ruledout')),
    ]),
    // invasion batch 6: penalty options & 50:22 (only a match that tracked them)
    restartSection('rugby', s, scope),
    section('attack', 'Attack', [
      detail && countRow('carries', 'Carries', dt('carries').h, dt('carries').a),
      detail && countRow('lineBreaks', 'Line breaks', dt('lineBreaks').h, dt('lineBreaks').a),
      tallyTracked(s, 'trackOffloads') && countRow('offloads', 'Offloads', H.tally.offload, A.tally.offload),
      ent && countRow('entries', '22 entries', ent.home.entries, ent.away.entries),
      ent && (ent.home.entries || ent.away.entries) && decRow('pointsPerEntry', 'Points per 22 entry',
        ent.home.entries ? ent.home.points / ent.home.entries : undefined, ent.away.entries ? ent.away.points / ent.away.entries : undefined, 1),
      ent && (ent.home.entries || ent.away.entries) && countRow('scoringEntries', '22 entries with points', ent.home.scoring, ent.away.scoring),
    ], ent ? 'Points per 22 entry: points scored after entering the 22, until the next entry or the end of the half (a try with no entry tapped counts as one).' : undefined),
    detail && section('defence', 'Defence', [
      countRow('tackles', 'Tackles made', tk.h, tk.a),
      countRow('missedTackles', 'Missed tackles', mt.h, mt.a, { lowerBetter: true }),
      madeRow('tackleSuccess', 'Tackle success', tk.h, tk.h + mt.h, tk.a, tk.a + mt.a),
      countRow('turnoversWon', 'Turnovers won', dt('turnoversWon').h, dt('turnoversWon').a),
    ]),
    sets && section('setPiece', 'Set piece', [
      madeRow('lineouts', 'Lineouts won (own throw)', H.lineoutsWon, H.lineoutsWon + H.lineoutsLost, A.lineoutsWon, A.lineoutsWon + A.lineoutsLost),
      (H.lineoutsLost || A.lineoutsLost) && countRow('lineoutSteals', 'Lineout steals', A.lineoutsLost, H.lineoutsLost),
      madeRow('scrums', 'Scrums won (own feed)', H.scrumsWon, H.scrumsWon + H.scrumsLost, A.scrumsWon, A.scrumsWon + A.scrumsLost),
      (H.scrumsLost || A.scrumsLost) && countRow('scrumSteals', 'Scrums won against the feed', A.scrumsLost, H.scrumsLost),
    ]),
    possOn && section('possession', 'Possession & territory', [
      poss && shareRow('possession', 'Possession', poss.home, poss.away),
      terr && shareRow('territory', 'Territory', terr.home, terr.away),
    ], ballNote(s, scope, [poss?.from, terr?.from].filter((x): x is number => x !== undefined).sort((a, b) => a - b)[0], inPlay)),
    section('discipline', 'Discipline', [
      pensOn && countRow('penaltiesConceded', 'Penalties conceded', pens('home'), pens('away'), { lowerBetter: true }),
      typesOn && countRow('freeKicks', 'Free kicks conceded', H.tally.freeKick, A.tally.freeKick, { lowerBetter: true }),
      countRow('yellowCards', 'Yellow cards', H.yellowCards, A.yellowCards, { lowerBetter: true }),
      countRow('redCards', 'Red cards', H.redCards, A.redCards, { lowerBetter: true }),
      timeRow('sinBin', 'Sin-bin time', bin.h, bin.a, { lowerBetter: true }),
    ]),
    typesOn && section('offences', 'Penalties by offence', INFRINGEMENTS.map((k) => {
      const h = count(s, 'home', scope, (e) => e.type === 'tally' && e.tally === 'penalty' && e.infringement === k);
      const a = count(s, 'away', scope, (e) => e.type === 'tally' && e.tally === 'penalty' && e.infringement === k);
      return (h || a) && countRow(`offence:${k}`, INFRINGEMENT_LABEL[k], h, a, { lowerBetter: true });
    })),
    tovOn && section('turnovers', 'Turnovers conceded', [
      countRow('turnoversConceded', 'Turnovers conceded', H.tally.turnover, A.tally.turnover, { lowerBetter: true }),
      ...TURNOVER_CAUSES.map((k) => {
        const h = count(s, 'home', scope, (e) => e.type === 'tally' && e.tally === 'turnover' && e.cause === k);
        const a = count(s, 'away', scope, (e) => e.type === 'tally' && e.tally === 'turnover' && e.cause === k);
        return (h || a) && countRow(`cause:${k}`, CAUSE_LABEL[k], h, a, { lowerBetter: true });
      }),
    ]),
    scope === 'all' && n >= 2 && section('byPeriod', 'Points by half',
      Array.from({ length: n }, (_, i) => countRow(`points${i + 1}`, cap(periodLong(s, i + 1)), ptsIn('home', i + 1), ptsIn('away', i + 1)))),
  ]);
}
