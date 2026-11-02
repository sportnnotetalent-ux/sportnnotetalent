/**
 * Deep wave (court-team) — netball at broadcast depth (World Netball /
 * Champion Data):
 *  - optional capture: centre pass receives, deflection outcome (gain / no
 *    gain), pick-ups, turnover types; the 2-point super shot (organiser rule);
 *    each stamped on its play, so old logs replay identically;
 *  - derived: centre passes / conversion BY QUARTER (= centreInfo), gains and
 *    gain-to-goal, offensive / defensive rebounds, shooting by position;
 *  - the commentary (quarter groups, newest first, running score, positions);
 *  - the team-stats panel; statTotals deep keys (SD-19 harness); box; career.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import {
  init, reducer, centreInfo, eventCredits, creditAttribution, superShotLive, goalPoints, isTurnoverType, NETBALL_LIVE_SETTINGS,
  type NetballState, type NetballEvent, type Side, type Pos,
} from '../src/sports/netball/engine.ts';
import { centreSplit, nbCoverage, nbDeepKeys, nbDeepTotals, nbTeamFigures, nbGameOrder, reboundKind, posAt } from '../src/sports/netball/deep.ts';
import { netballFeed } from '../src/sports/netball/commentary.ts';
import { netballPanel, nbPanelPeriods } from '../src/sports/netball/panel.ts';
import { netballTotals, DERIVED_KEYS } from '../src/sports/netball/totals.ts';
import { netballBox } from '../src/sports/netball/box.ts';
import { netballStats } from '../src/sports/netball/stats.ts';
import { describeEvent } from '../src/sports/netball/timeline.ts';
import { netballTickerFlash } from '../src/sports/netball/ticker.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { gameFlowFor } from '../src/sports/gameFlow.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { NameOf } from '../src/core/playerNames.ts';

const POS: Pos[] = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const HOME = ['hgs', 'hga', 'hwa', 'hc', 'hwd', 'hgd', 'hgk'];
const AWAY = ['ags', 'aga', 'awa', 'ac', 'awd', 'agd', 'agk'];
const nm = (id: string) => id.toUpperCase();
/** IDs-only scoring: the state keeps ids; the viewer's names come from a lookup */
const VIEWER: NameOf = (id, legacy) => (id ? nm(id) : (legacy ?? '').trim() || 'Player');
const NAMES = { home: 'Sharks', away: 'Kites' };
let u = 0;
/** An action as the controls dispatch it: live credits from eventCredits. */
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<NetballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', ...ev } as NetballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first), a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(POS.map((p, i) => [p, { id: (team === 'home' ? HOME : AWAY)[i], name: nm((team === 'home' ? HOME : AWAY)[i]) }])) } });
const shooter = (side: Side, pos: 'GS' | 'GA') => (side === 'home' ? HOME : AWAY)[pos === 'GS' ? 0 : 1];
const goal = (side: Side, sec: number, period: number, pos: 'GS' | 'GA' = 'GS', feeder?: string, extra: Record<string, unknown> = {}) =>
  A('GOAL', side, sec, period, { type: 'goal', playerId: shooter(side, pos), playerName: nm(shooter(side, pos)), secondId: feeder, secondName: feeder && nm(feeder) }, { pos, ...extra });
const miss = (side: Side, sec: number, period: number, pos: 'GS' | 'GA', rebound?: { side: Side; id: string }, extra: Record<string, unknown> = {}): ScoreAction[] => {
  const a = A('MISS', side, sec, period, { type: 'miss', playerId: shooter(side, pos), playerName: nm(shooter(side, pos)) }, { pos, ...extra });
  return rebound ? [a, A('STAT', rebound.side, sec, period, { type: 'stat', stat: 'rebound', playerId: rebound.id, playerName: nm(rebound.id) }, { kind: 'rebound', ref: a.payload!.uid })] : [a];
};
const stat = (side: Side, sec: number, period: number, kind: 'intercept' | 'deflection' | 'turnover' | 'pickup', who: string, extra: Record<string, unknown> = {}) =>
  A('STAT', side, sec, period, { type: 'stat', stat: kind, playerId: who, playerName: nm(who) }, { kind, ...(kind === 'pickup' ? { playerId: who, playerName: nm(who) } : {}), ...extra });
const cpr = (side: Side, sec: number, period: number, who: string, pos: Pos) => A('CPR', side, sec, period, {}, { playerId: who, playerName: nm(who), pos });
const penalty = (side: Side, sec: number, period: number, kind: 'contact' | 'obstruction', who: string) =>
  A('PENALTY', side, sec, period, { type: 'penalty', penalty: kind, playerId: who, playerName: nm(who) }, { penalty: kind });
const fullPeriod = (len = 900): ScoreAction[] => [{ type: 'SET_CLOCK', payload: { periodSec: len } }, { type: 'END_PERIOD', payload: { at: 0 } }];
const run = (actions: ScoreAction[], config?: Record<string, unknown>, from?: NetballState): NetballState => actions.reduce(reducer, from ?? init(config));

const DEEP = { trackCpr: true, trackGains: true, trackTurnovers: true, detail: true };
/** A tracked match: CPRs, a gain-deflection, a pick-up, typed turnovers, linked rebounds. */
const MATCH: ScoreAction[] = [
  xi('home'), xi('away'), { type: 'FIRST_CENTRE', side: 'home' },
  cpr('home', 2, 1, 'hwa', 'WA'),
  goal('home', 30, 1, 'GS', 'hwa'), // CP goal (home centre) 1-0
  cpr('away', 32, 1, 'awa', 'WA'),
  stat('home', 40, 1, 'intercept', 'hgd'),
  goal('home', 55, 1, 'GA', 'hc'), // from a gain 2-0
  cpr('home', 57, 1, 'hgd', 'GD'),
  stat('away', 60, 1, 'deflection', 'agk', { gain: true }),
  ...miss('away', 70, 1, 'GS', { side: 'home', id: 'hgk' }), // defensive rebound (home)
  stat('home', 80, 1, 'turnover', 'hc', { tt: 'footwork' }),
  stat('away', 85, 1, 'pickup', 'awd'),
  goal('away', 90, 1, 'GA', 'awa'), // from a gain (home's centre) 2-1
  ...fullPeriod(),
  stat('away', 920, 2, 'deflection', 'agd', { gain: false }),
  ...miss('home', 950, 2, 'GA', { side: 'home', id: 'hgs' }), // offensive rebound
  goal('home', 960, 2, 'GS'), // 3-1
  penalty('away', 970, 2, 'contact', 'agd'),
  stat('away', 980, 2, 'turnover', 'aga', { tt: 'badPass' }),
  stat('home', 985, 2, 'turnover', 'hwa'), // no type
];

/* --------------------------------- capture --------------------------------- */

describe('netball deep · capture; old logs replay identically', () => {
  test('the switches are on the state only when the format carries them', () => {
    const s = init();
    assert.equal(['trackCpr', 'trackGains', 'trackTurnovers', 'superShot', 'ssMinutes'].some((k) => k in s), false);
    const d = init({ ...DEEP, superShot: true });
    assert.deepEqual([d.trackCpr, d.trackGains, d.trackTurnovers, d.superShot, d.ssMinutes], [true, true, true, true, 5]);
    assert.equal(init({ superShot: false }).superShot, undefined);
  });
  test('CPR, a deflection outcome, a pick-up and a turnover type ride on their plays; bad values are dropped', () => {
    const s = run(MATCH, DEEP);
    const evs = s.events;
    assert.deepEqual(evs.filter((e) => e.type === 'cpr').map((e) => [e.side, e.playerId, e.pos]), [['home', 'hwa', 'WA'], ['away', 'awa', 'WA'], ['home', 'hgd', 'GD']]);
    assert.deepEqual(evs.filter((e) => e.stat === 'deflection').map((e) => e.gain), [true, false]);
    assert.deepEqual(evs.filter((e) => e.stat === 'turnover').map((e) => e.tt), ['footwork', 'badPass', undefined]);
    assert.equal(evs.find((e) => e.stat === 'pickup')?.playerId, 'awd');
    const bad = run([A('STAT', 'home', 1, 1, {}, { kind: 'turnover', tt: 'moon' }), A('STAT', 'home', 2, 1, {}, { kind: 'intercept', gain: true }), A('CPR', 'home', 3, 1)]);
    assert.equal(bad.events.length, 2, 'a CPR needs a player');
    assert.equal('tt' in bad.events[0] || 'gain' in bad.events[1], false);
    assert.equal(isTurnoverType('held'), true);
  });
  test('a pick-up is never a live credit (statTotals only); the old four stats are unchanged', () => {
    assert.deepEqual(eventCredits({ type: 'stat', stat: 'pickup', playerId: 'x' } as NetballEvent), {});
    assert.deepEqual(eventCredits({ type: 'stat', stat: 'intercept', playerId: 'x' } as NetballEvent).first?.stats, { intercepts: 1 });
  });
  test('an old log (no new payloads) replays to the same events and score', () => {
    const old = run(MATCH.map((a) => {
      const { gain: _g, tt: _t, ...rest } = (a.payload ?? {}) as Record<string, unknown>;
      return a.type === 'CPR' || (a.type === 'STAT' && rest.kind === 'pickup') ? null : { ...a, payload: rest };
    }).filter((a): a is ScoreAction => !!a));
    assert.deepEqual([old.home, old.away], [3, 1]);
    assert.equal(old.events.some((e) => 'gain' in e || 'tt' in e || e.type === 'cpr' || 'points' in e), false);
  });
  test('super shots: 2 points only on a format that uses them; a removal takes both back; the window', () => {
    const ss = { superShot: true };
    let s = run([goal('home', 850, 1, 'GS', undefined, { points: 2 }), ...miss('home', 860, 1, 'GA', undefined, { ss: true })], ss);
    assert.deepEqual([s.home, s.events[0].points, s.events[1].ss], [2, 2, true]);
    s = reducer(s, { type: 'REMOVE_EVENT', payload: { id: s.events[0].id } });
    assert.equal(s.home, 0);
    const plain = run([goal('home', 850, 1, 'GS', undefined, { points: 2 }), ...miss('home', 860, 1, 'GA', undefined, { ss: true })]);
    assert.deepEqual([plain.home, 'points' in plain.events[0], 'ss' in plain.events[1]], [1, false, false]);
    const T = 1_700_000_000_000;
    const live = reducer(init(ss), { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(superShotLive(live, T + 9 * 60_000), false);
    assert.equal(superShotLive(live, T + 10 * 60_000), true, 'the last 5 minutes of the quarter');
    assert.equal(superShotLive(init({ superShot: true, ssMinutes: 0 })), true, '0 = the whole quarter');
    assert.equal(superShotLive(init()), false);
    assert.equal(goalPoints({ points: 2 }), 2); assert.equal(goalPoints({}), 1);
  });
});

/* ------------------------------ derived figures ------------------------------ */

describe('netball deep · derived figures', () => {
  const s = run(MATCH, DEEP);
  test('centre passes by quarter sum to centreInfo; each goal is a centre-pass goal or from a gain', () => {
    const sp = centreSplit(s);
    const ci = centreInfo(s);
    for (const side of ['home', 'away'] as const) {
      assert.equal(sp.periods.reduce((n, p) => n + p.taken[side], 0), ci.taken[side]);
      assert.equal(sp.periods.reduce((n, p) => n + p.cpGoals[side], 0), ci.cpGoals[side]);
      assert.equal(sp.periods.reduce((n, p) => n + p.gainGoals[side], 0), ci.gainGoals[side]);
    }
    const goals = s.events.filter((e) => e.type === 'goal');
    assert.deepEqual(goals.map((g) => sp.goalFrom.get(g.id)), ['cp', 'gain', 'gain', 'cp']);
  });
  test('coverage: CPR of centre passes, typed deflections / turnovers, linked rebounds', () => {
    const c = nbCoverage(s);
    assert.equal(c.cpr.logged, 3); assert.equal(c.cpr.of, centreSplit(s).passes.length);
    assert.deepEqual(c.deflections, { typed: 2, of: 2 });
    assert.deepEqual(c.turnovers, { typed: 2, of: 3 });
    assert.deepEqual(c.rebounds, { linked: 2, of: 2 });
    assert.equal(c.gains, true); assert.equal(c.feeds, true); assert.equal(c.superShot, false);
  });
  test('team figures: shooting by position, gains, rebounds off / def, turnover types', () => {
    const h = nbTeamFigures(s, 'home'), a = nbTeamFigures(s, 'away');
    assert.deepEqual([h.goals, h.attempts, h.byPos.GS.goals, h.byPos.GA.attempts], [3, 4, 2, 2]);
    assert.deepEqual([h.oreb, h.dreb, a.deflGain, a.deflNoGain, a.pickups], [1, 1, 1, 1, 1]);
    // home gains: intercept 1 + def rebound 1 + the away turnover 1 = 3; away: deflection-gain 1 + pick-up 1 + home turnovers 2 = 4
    assert.deepEqual([h.gains, a.gains], [3, 4]);
    assert.deepEqual([h.byType.footwork, a.byType.badPass], [1, 1]);
    assert.deepEqual([h.cpr, a.cpr], [2, 1]);
    const q2 = nbTeamFigures(s, 'home', 2);
    assert.deepEqual([q2.goals, q2.centrePasses, q2.cpGoals], [1, centreSplit(s).periods[1].taken.home, centreSplit(s).periods[1].cpGoals.home]);
  });
  test('rebound kind and positions at the moment', () => {
    const r = s.events.filter((e) => e.stat === 'rebound');
    assert.deepEqual(r.map((e) => reboundKind(s, e)), ['def', 'off']);
    assert.equal(posAt(s, 'home', { id: 'hgd' }, s.events.length), 'GD');
    assert.deepEqual(nbGameOrder(s).map((x) => x.i).slice(0, 4), [0, 1, 2, 3]);
  });
});

/* ------------------------------ totals / box / career ------------------------------ */

describe('netball deep · statTotals, box, career', () => {
  const SPORT: TotalsSport<NetballState> = { name: 'netball deep', init, reducer, statTotals: netballTotals, partial: false, derived: DERIVED_KEYS, config: DEEP };
  test('the contract holds on every undo prefix; deep keys by id, zero-filled', () => {
    const t = assertContract(SPORT, toRecords(MATCH), { every: 1 });
    assert.deepEqual([t.hwa.stats.centrePassReceives, t.hgd.stats.centrePassReceives, t.hgs.stats.centrePassReceives], [1, 1, 0]);
    assert.deepEqual([t.agk.stats.deflectionsGain, t.agk.stats.gains, t.agd.stats.deflectionsNoGain, t.awd.stats.pickups, t.awd.stats.gains], [1, 1, 1, 1, 1]);
    assert.deepEqual([t.hgd.stats.gains, t.hgk.stats.gains, t.hgs.stats.gains], [1, 1, 0], 'intercept, defensive rebound; an offensive rebound is no gain');
  });
  test('an untracked match owns no deep keys (never a false 0)', () => {
    const plain = run([xi('home'), goal('home', 30, 1), stat('away', 40, 1, 'deflection', 'agk')]);
    assert.deepEqual(nbDeepKeys(plain), []);
    assert.equal(Object.keys(netballTotals(plain).hgs.stats).some((k) => ['gains', 'centrePassReceives', 'pickups', 'superShots'].includes(k)), false);
  });
  test('super shots: per-player keys and the score', () => {
    const s = run([xi('home'), goal('home', 850, 1, 'GS', undefined, { points: 2 }), ...miss('home', 860, 1, 'GS', undefined, { ss: true }), goal('home', 870, 1, 'GA')], { superShot: true });
    const t = nbDeepTotals(s).lines;
    assert.deepEqual([t.hgs.stats.superShots, t.hgs.stats.superShotAttempts, s.home], [1, 2, 3]);
    assert.equal(netballTotals(s).hga.stats.superShots, 0);
    const flow = gameFlowFor('netball', s)!;
    assert.equal(flow.unit, 'points'); assert.equal(flow.biggestLead.home?.value, 3);
    assert.equal(netballTickerFlash(run([xi('home')], { superShot: true }), run([xi('home'), goal('home', 850, 1, 'GS', undefined, { points: 2 })], { superShot: true }), VIEWER)?.text, 'SUPER SHOT! HGS (GS)');
  });
  test('box: CPR / GN columns when tracked, after the old columns', () => {
    const t = buildBoxTable(netballStats, netballBox(s0()).data('all'), { scope: 'all' });
    const cols = t.columns.map((c) => c.abbr);
    assert.deepEqual(cols.slice(0, 11), ['Q', 'G', 'G/A', '%', 'GA', 'FD', 'INT', 'DEF', 'REB', 'TO', 'PEN']);
    assert.ok(cols.includes('CPR') && cols.includes('GN') && !cols.includes('SS'));
    const row = (name: string) => t.home.rows.find((r) => r.name === name)!.cells;
    assert.equal(row('HWA')[cols.indexOf('CPR')], '1');
    assert.equal(row('HGS')[cols.indexOf('CPR')], '0');
    const plain = buildBoxTable(netballStats, netballBox(run([xi('home'), goal('home', 30, 1)])).data('all'), { scope: 'all' });
    assert.ok(!plain.columns.some((c) => c.abbr === 'CPR' || c.abbr === 'GN'));
  });
  test('career: gains, CPR, super shot % over the games that tracked them', () => {
    const line = (id: string, stats: Record<string, number>): StatLine => ({ id, matchId: id, playerId: 'p', sport: 'netball', stats, won: true } as StatLine);
    const secs = careerSections(statSchema('netball')!, [
      line('m1', { goals: 20, attempts: 24, gains: 3, centrePassReceives: 6, superShots: 2, superShotAttempts: 4 }),
      line('m2', { goals: 10, attempts: 12, gains: 1 }),
      line('m3', { goals: 15, attempts: 18 }),
    ]);
    const row = (sec: string, key: string) => secs.find((x) => x.id === sec)?.rows.find((r) => r.key === key);
    assert.equal(row('defence', 'gains')?.value, '4');
    assert.deepEqual(row('defence', 'gains')?.coverage, { tracked: 2, total: 3 });
    assert.equal(row('attack', 'centrePassReceives')?.value, '6');
    assert.equal(row('shooting', 'superShotPct')?.value, '50%');
  });
  const s0 = () => run(MATCH, DEEP);
});

/* ------------------------------ commentary / panel ------------------------------ */

describe('netball deep · commentary and team stats', () => {
  const s = run(MATCH, DEEP);
  test('quarter groups newest first; the toss opens Q1; sentences with positions, feeds, rebounds, gains', () => {
    const feed = netballFeed(s, NAMES, VIEWER);
    assert.deepEqual(feed.map((g) => g.title), ['Q2', 'Q1']);
    assert.deepEqual(feed[1].score, { home: 2, away: 1 });
    const q1 = [...feed[1].rows].reverse().map((r) => r.text);
    assert.equal(q1[0], 'Sharks take the first centre pass');
    assert.equal(q1[1], 'Centre pass Sharks — received by HWA (WA)');
    assert.equal(q1[2], 'HGS (GS) scores — fed by HWA (WA)');
    assert.equal(q1[4], 'Intercept — HGD (GD)');
    assert.equal(q1[5], 'HGA (GA) scores — fed by HC (C) · from a gain');
    assert.ok(q1.includes('AGS (GS) misses — defensive rebound HGK (GK), Sharks'));
    assert.ok(q1.includes('Deflection — AGK (GK), gain'));
    assert.ok(q1.includes('Turnover — HC (C) (footwork)'));
    assert.ok(q1.includes('Pick-up — AWD (WD)'));
    assert.ok(!q1.some((t) => t.startsWith('Rebound')), 'linked rebounds read on the miss');
    const q2 = [...feed[0].rows].reverse().map((r) => r.text);
    assert.ok(q2.includes('HGA (GA) misses — offensive rebound HGS (GS)'));
    assert.ok(q2.includes('Contact penalty against AGD (GD)'));
    assert.equal(feed[0].rows.find((r) => r.scoring)?.score.home, 3);
  });
  test('a super shot, a lead change, sanctions and subs read plainly', () => {
    const g = run([xi('home'), xi('away'), goal('away', 10, 1), goal('home', 850, 1, 'GS', undefined, { points: 2 }),
      A('SANCTION', 'away', 860, 1, { type: 'sanction', sanction: 'suspension', playerId: 'agd', playerName: 'AGD' }, { sanction: 'suspension', minutes: 2 }),
      A('SUB', 'home', 870, 1, {}, { offId: 'hwa', offName: 'HWA', onId: 'h8', onName: 'H8' })], { superShot: true });
    const rows = [...netballFeed(g, NAMES, VIEWER)[0].rows].reverse();
    assert.equal(rows[1].text, 'HGS (GS) scores a super shot (2 points)');
    assert.equal(rows[1].tag, 'Sharks take the lead');
    assert.equal(rows[2].text, 'AGD (GD) suspended for 2 minutes — Kites play a player short');
    assert.equal(rows[3].text, 'H8 comes on for HWA');
  });
  test('panel: categories, centre-pass conversion, gains, CPR, turnover types; per quarter', () => {
    const d = netballPanel(s, 'all');
    assert.deepEqual(d.categories.map((c) => c.key), ['shooting', 'possession', 'defence', 'errors']);
    const row = (cat: string, key: string) => d.categories.find((c) => c.key === cat)!.rows.find((r) => r.key === key);
    assert.equal(row('shooting', 'shooting')!.home, '3-4 (75%)');
    assert.equal(row('shooting', 'pos:GS')!.home, '2-2 (100%)');
    assert.deepEqual([row('possession', 'gains')!.home, row('possession', 'gains')!.away], ['3', '4']);
    assert.equal(row('possession', 'cpr')!.home, '2');
    assert.ok(row('possession', 'cpConv'));
    assert.equal(row('errors', 'tt:footwork')!.home, '1');
    assert.equal(row('defence', 'rebounds')!.sub?.home, 'O 1 · D 1');
    assert.ok(d.notes.some((n) => /Turnover type logged for 2 of 3/.test(n)));
    assert.deepEqual(nbPanelPeriods(s).map((p) => p.label), ['Q1', 'Q2']);
    const q1 = netballPanel(s, 1);
    assert.equal(q1.categories[0].rows.find((r) => r.key === 'goals')!.home, '2');
  });
  test('an untracked match: no gains / CPR / turnover-type rows; no toss → a note, no centre-pass rows', () => {
    const g = run([xi('home'), goal('home', 30, 1), stat('away', 40, 1, 'deflection', 'agk')]);
    const d = netballPanel(g, 'all');
    const keys = d.categories.flatMap((c) => c.rows.map((r) => r.key));
    assert.ok(!keys.some((k) => ['gains', 'cpr', 'pickups', 'centrePasses', 'feeds'].includes(k) || k.startsWith('tt:')), keys.join(' '));
    assert.ok(d.notes.some((n) => /toss/.test(n)));
  });
  test('describeEvent / undo words for the new plays', () => {
    assert.equal(describeEvent({ id: 'x', type: 'cpr', sec: 0, period: 1, pos: 'WA', playerName: 'A' }).label, 'Centre pass received · WA');
    assert.equal(describeEvent({ id: 'x', type: 'goal', sec: 0, period: 1, pos: 'GS', points: 2 }).label, 'Super shot (2) · GS');
    assert.equal(describeEvent({ id: 'x', type: 'stat', stat: 'turnover', tt: 'held', sec: 0, period: 1 }).label, 'Turnover · held ball');
    assert.equal(describeEvent({ id: 'x', type: 'stat', stat: 'deflection', gain: false, sec: 0, period: 1 }).label, 'Deflection · no gain');
    assert.equal(describeEvent({ id: 'x', type: 'stat', stat: 'pickup', sec: 0, period: 1 }).label, 'Pick-up');
  });
});

/* ------------------------------ source guards ------------------------------ */

describe('netball deep · scorer UI guards', () => {
  const src = (readFileSync(new URL('../src/sports/netball/index.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/sports/netball/meta.ts', import.meta.url), 'utf8'));
  test('the "Stats to track" switches (off by default — round 2: CPR on, batch 3: feeds & rebounds on, the international standard); super shots are an organiser rule', () => {
    const keys = NETBALL_LIVE_SETTINGS.fields.filter((f) => f.group === 'Stats to track').map((f) => f.key);
    assert.deepEqual(keys, ['detail', 'trackCpr', 'trackGains', 'trackTurnovers']);
    assert.ok(NETBALL_LIVE_SETTINGS.fields.every((f) => f.type !== 'toggle' || f.default === false || f.key === 'stopClock' || f.key === 'trackCpr' || f.key === 'detail'));
    assert.match(src, /key: 'superShotRule', label: '2-point super shots', type: 'choice', default: 'off'/);
  });
  test('CPR is one tap on the centre strip; outcome / type steps follow the player; the views', () => {
    // IDs-only scoring: the receiver by id only
    assert.match(src, /fire\(\{ type: 'CPR', side: cp, payload: \{ playerId: p\.id, pos \} \}\)/);
    assert.match(src, /kind === 'deflection' && s\.trackGains\) \|\| \(kind === 'turnover' && s\.trackTurnovers\)/);
    assert.match(src, /<PlayFeed groups=\{netballFeed\(s/);
    assert.match(src, /<CategoryStatsPanel periods=\{nbPanelPeriods\(s\)\}/);
  });
});
