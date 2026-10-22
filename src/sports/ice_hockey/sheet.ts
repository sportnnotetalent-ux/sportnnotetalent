/**
 * Deep wave — ice hockey's broadcast "Match stats" sheet (IIHF game summary /
 * NHL game summary + event summary). PURE, derived from the event log only,
 * so corrections and undo re-derive it and old matches show what they had.
 *
 *  - Goals by strength (even / power play / short-handed, empty-net and
 *    penalty-shot goals), shots on goal (and, when tracked, missed shots,
 *    shots blocked and shot attempts), shooting %.
 *  - Power play: goals / opportunities and %, penalty kill %, power-play time
 *    (playing time with more skaters by the penalties — the penalty box
 *    replay), short-handed goals.
 *  - Penalties: count, PIM, minors / majors / misconducts, and by infraction.
 *  - Goaltending: saves, save % (empty-net goals don't count against).
 *  - Faceoffs (and, round 2, by zone), hits, blocked shots, takeaways /
 *    giveaways — only when tracked.
 *  - Shots by period (the IIHF game sheet line) on the Overall view.
 * Rows exist only for what the match tracked (never a false 0).
 */
import {
  matchSec, mirrorZone, penaltyBox, penMinutes, periodLen, periodName, periodOffset, tallyTracked, teamFigures, totalPeriods, zonesTracked,
  FO_ZONES, FO_ZONE_LABEL, type FoZone, type IceEvent, type IceHockeyState, type PenKind, type Side, type TallyKind,
} from './engine.ts';
import { countRow, madeRow, rateRow, section, sheet, timeRow, type StatSheet } from '../compareSheet.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** The game's end on the clock (now / the final horn, or the last event). */
export const gameEndSec = (s: IceHockeyState, nowSec?: number): number =>
  Math.max(nowSec ?? matchSec(s), ...s.events.map((e) => e.sec), 0);

/** The window (game seconds) of a scope: the whole game or one period. */
function windowOf(s: IceHockeyState, scope: 'all' | number): [number, number] {
  if (scope === 'all') return [0, Infinity];
  const o = periodOffset(s, scope);
  return [o, o + periodLen(s, scope)];
}

/** Power-play time each side had (seconds): playing time with MORE skaters
 *  than the other side because of the penalties being served (5 on 4, 5 on 3,
 *  4 on 3 in overtime). Coincident penalties and an empty net don't count. */
export function powerPlayTime(s: IceHockeyState, scope: 'all' | number = 'all', nowSec?: number): { home: number; away: number } {
  const end = gameEndSec(s, nowSec);
  const box = penaltyBox(s, end);
  const iv = box.all.filter((p) => !p.coincident && p.start != null).map((p) => ({ side: p.side, from: p.start!, to: Math.min(end, p.end ?? end) }));
  const [w0, w1] = windowOf(s, scope);
  const cuts = [...new Set([w0, Math.min(w1, end), ...iv.flatMap((x) => [x.from, x.to])])]
    .filter((t) => t >= w0 && t <= Math.min(w1, end)).sort((a, b) => a - b);
  const out = { home: 0, away: 0 };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i], t1 = cuts[i + 1];
    if (t1 <= t0) continue;
    const mid = (t0 + t1) / 2;
    const n = (sd: Side) => iv.filter((x) => x.side === sd && x.from <= mid && mid < x.to).length;
    const h = n('home'), a = n('away');
    if (h < a) out.home += t1 - t0;
    else if (a < h) out.away += t1 - t0;
  }
  return out;
}

const inScope = (e: IceEvent, scope: 'all' | number) => scope === 'all' || e.period === scope;
const tallies = (s: IceHockeyState, side: Side, kind: TallyKind, scope: 'all' | number) =>
  s.events.filter((e) => e.type === 'tally' && e.tally === kind && e.side === side && inScope(e, scope)).length;

/** Round 2 — a side's faceoffs by zone from ITS OWN view (offensive = in the
 *  other team's end): draws won there and taken there. A draw the side lost
 *  counts in the mirror of the winner's zone. Faceoffs with no zone are left
 *  out (they still count in the overall FO %). */
export function faceoffZones(s: IceHockeyState, side: Side, scope: 'all' | number = 'all'): Record<FoZone, { won: number; total: number }> {
  const out = { oz: { won: 0, total: 0 }, nz: { won: 0, total: 0 }, dz: { won: 0, total: 0 } };
  for (const e of s.events) {
    if (e.type !== 'tally' || e.tally !== 'faceoff' || !e.zone || !inScope(e, scope)) continue;
    const mine = e.side === side;
    const z = mine ? e.zone : mirrorZone(e.zone);
    out[z].total += 1;
    if (mine) out[z].won += 1;
  }
  return out;
}

/** Goals by kind for one side over a scope. */
export function goalsBy(s: IceHockeyState, side: Side, scope: 'all' | number = 'all') {
  const g = s.events.filter((e) => e.type === 'goal' && e.side === side && inScope(e, scope));
  return {
    all: g.length,
    ev: g.filter((e) => !e.ps && (e.strength ?? 'ev') === 'ev').length,
    pp: g.filter((e) => !e.ps && e.strength === 'pp').length,
    sh: g.filter((e) => !e.ps && e.strength === 'sh').length,
    en: g.filter((e) => e.en).length,
    ps: g.filter((e) => e.ps).length,
  };
}

/** Penalties by infraction (count per side), in the order first called. */
export function infractions(s: IceHockeyState, scope: 'all' | number = 'all'): { name: string; home: number; away: number }[] {
  const out: { name: string; home: number; away: number }[] = [];
  for (const e of s.events) {
    if (e.type !== 'pen' || !e.infraction || !inScope(e, scope)) continue;
    let r = out.find((x) => x.name === e.infraction);
    if (!r) { r = { name: e.infraction, home: 0, away: 0 }; out.push(r); }
    r[e.side] += 1;
  }
  return out;
}

const PEN_GROUP: { key: string; label: string; kinds: PenKind[] }[] = [
  { key: 'minors', label: 'Minors', kinds: ['minor', 'bench', 'double'] },
  { key: 'majors', label: 'Majors', kinds: ['major', 'majorGm'] },
  { key: 'misconducts', label: 'Misconducts', kinds: ['misconduct'] },
  { key: 'ejections', label: 'Game misconducts / match penalties', kinds: ['gm', 'match', 'majorGm'] },
];

/** The sheet for a scope ('all' or a period). `nowSec` = the live game second. */
export function iceHockeySheet(s: IceHockeyState, scope: 'all' | number = 'all', nowSec?: number): StatSheet {
  const H = teamFigures(s, 'home', scope), A = teamFigures(s, 'away', scope);
  const gh = goalsBy(s, 'home', scope), ga = goalsBy(s, 'away', scope);
  const t = (k: TallyKind) => ({ h: tallies(s, 'home', k, scope), a: tallies(s, 'away', k, scope) });
  const attempts = tallyTracked(s, 'trackAttempts');
  const physical = tallyTracked(s, 'trackPhysical');
  const missed = t('missed'), blocks = t('block');
  const zones = zonesTracked(s);
  const zh = faceoffZones(s, 'home', scope), za = faceoffZones(s, 'away', scope);
  // goals against that count against a goalie (not into an empty net)
  const gaGk = (sd: Side) => s.events.filter((e) => e.type === 'goal' && e.side === other(sd) && !e.en && inScope(e, scope)).length;
  const pp = powerPlayTime(s, scope, nowSec);
  const pens = (sd: Side, kinds: PenKind[]) => s.events.filter((e) => e.type === 'pen' && e.side === sd && kinds.includes(e.pen ?? 'minor') && inScope(e, scope)).length;
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const sog = (sd: Side, p: number) => teamFigures(s, sd, p).shotsOnGoal;
  return sheet([
    section('goals', 'Goals', [
      countRow('goals', 'Goals', gh.all, ga.all),
      countRow('ev', 'Even strength', gh.ev, ga.ev),
      countRow('ppg', 'Power play', gh.pp, ga.pp),
      countRow('shg', 'Short-handed', gh.sh, ga.sh),
      (gh.en || ga.en) && countRow('eng', 'Empty net', gh.en, ga.en),
      (gh.ps || ga.ps) && countRow('psg', 'Penalty shot', gh.ps, ga.ps),
    ]),
    section('shots', 'Shots', [
      countRow('sog', 'Shots on goal', H.shotsOnGoal, A.shotsOnGoal),
      attempts && countRow('missed', 'Missed shots', missed.h, missed.a),
      // a side's shots the OTHER side blocked
      physical && countRow('blockedBy', 'Shots blocked', blocks.a, blocks.h),
      attempts && physical && countRow('attempts', 'Shot attempts', H.shotsOnGoal + missed.h + blocks.a, A.shotsOnGoal + missed.a + blocks.h),
      rateRow('shotPct', 'Shooting %', H.goals, H.shotsOnGoal, A.goals, A.shotsOnGoal, { dp: 1 }),
    ]),
    section('pp', 'Power play', [
      madeRow('ppConv', 'Power plays', H.ppGoals, H.ppChances, A.ppGoals, A.ppChances) ?? countRow('ppConv', 'Power plays', 0, 0),
      madeRow('pk', 'Penalty kill', A.ppChances - A.ppGoals, A.ppChances, H.ppChances - H.ppGoals, H.ppChances),
      timeRow('ppTime', 'Power-play time', pp.home, pp.away),
      countRow('shGoals', 'Short-handed goals', H.shGoals, A.shGoals),
    ]),
    section('pens', 'Penalties', [
      countRow('pens', 'Penalties', H.penalties, A.penalties, { lowerBetter: true }),
      countRow('pim', 'Penalty minutes', H.penaltyMinutes, A.penaltyMinutes, { lowerBetter: true }),
      ...PEN_GROUP.map((g) => { const h = pens('home', g.kinds), a = pens('away', g.kinds); return (h || a) && countRow(g.key, g.label, h, a, { lowerBetter: true }); }),
      ...infractions(s, scope).map((x) => countRow(`inf:${x.name}`, x.name, x.home, x.away, { lowerBetter: true })),
    ]),
    section('gk', 'Goaltending', [
      countRow('saves', 'Saves', H.saves, A.saves),
      rateRow('svPct', 'Save %', H.saves, H.saves + gaGk('home'), A.saves, A.saves + gaGk('away'), { dp: 1 }),
    ]),
    tallyTracked(s, 'trackFaceoffs') && section('fo', 'Faceoffs', [
      countRow('fow', 'Faceoffs won', t('faceoff').h, t('faceoff').a),
      rateRow('foPct', 'Faceoff %', t('faceoff').h, t('faceoff').h + t('faceoff').a, t('faceoff').a, t('faceoff').h + t('faceoff').a, { dp: 1 }),
      // round 2: won / taken and % in each zone, each team from its own end (zones tracked only)
      ...(zones ? FO_ZONES.map((z) => madeRow(`fo:${z}`, FO_ZONE_LABEL[z], zh[z].won, zh[z].total, za[z].won, za[z].total, { dp: 1 })) : []),
    ], zones ? 'Zones from each team’s own view: offensive = in the other team’s end.' : undefined),
    (physical || tallyTracked(s, 'trackPuck')) && section('phys', 'Hits & puck battles', [
      physical && countRow('hits', 'Hits', t('hit').h, t('hit').a),
      physical && countRow('blocks', 'Blocked shots', blocks.h, blocks.a),
      tallyTracked(s, 'trackPuck') && countRow('takeaways', 'Takeaways', t('takeaway').h, t('takeaway').a),
      tallyTracked(s, 'trackPuck') && countRow('giveaways', 'Giveaways', t('giveaway').h, t('giveaway').a, { lowerBetter: true }),
    ]),
    scope === 'all' && n >= 2 && section('byPeriod', 'Shots on goal by period',
      Array.from({ length: n }, (_, i) => countRow(`sog${i + 1}`, periodName(s, i + 1), sog('home', i + 1), sog('away', i + 1)))),
    section('other', 'Other', [countRow('timeouts', 'Time-outs used', H.timeouts, A.timeouts, { plain: true })]),
  ]);
}

/** PIM a side has served over the scope (for the commentary's period lines). */
export const pimOf = (s: IceHockeyState, side: Side, scope: 'all' | number = 'all'): number =>
  s.events.filter((e) => e.type === 'pen' && e.side === side && e.pen && inScope(e, scope)).reduce((a, e) => a + penMinutes(e.pen!, s.pimScale), 0);
