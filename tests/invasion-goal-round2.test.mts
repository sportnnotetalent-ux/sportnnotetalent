/**
 * Deep wave round 2 (invasion-goal family) — the founder's answers, built:
 *  1. Football: "Goal ruled out" behind a "Deeper stats" toggle (off by
 *     default — school matches have no VAR); a match that already logged one
 *     still shows it (commentary, match centre).
 *  2. Handball: minutes with an empty goal (the 7th-court-player time) per
 *     team on the match centre and on the taken-off keeper's career — only
 *     when the empty goal was used (and the clock measured it).
 *  3. MVP weights for the new figures: football key passes / clearances,
 *     handball keeper saves by position (a bonus on top of the save).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as football from '../src/sports/football/engine.ts';
import { footballDepthTeamStats, ruledOutTracked } from '../src/sports/football/depth.ts';
import { footballFeed } from '../src/sports/football/feed.ts';
import { footballCentreSource } from '../src/sports/football/centre.ts';
import { footballStats, footballCentre } from '../src/sports/football/stats.ts';
import {
  init, reducer, eventCredits, creditAttribution, type HandballEvent, type HandballState, type Side,
} from '../src/sports/handball/engine.ts';
import {
  emptyGoalSpells, emptyGoalSecs, emptyGoalTimed, emptyGoalKeeperMinutes, egMinutes, playedWindows, handballDepthFigures, handballDerivedCredits,
} from '../src/sports/handball/depth.ts';
import { handballTotals, DERIVED_KEYS } from '../src/sports/handball/totals.ts';
import { handballBox } from '../src/sports/handball/box.ts';
import { handballStats, handballCentre, SAVE_BONUS } from '../src/sports/handball/stats.ts';
import { centreComparison } from '../src/sports/invasion/centre.ts';
import { validateSchema, statDefIn, aggregateValue } from '../src/sports/statSchema.ts';
import { STAT_WEIGHTS, matchRatings } from '../src/data/ratings.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Player, SportId, StatLine } from '../src/core/types.ts';

/* ------------------------- 1. football: goal ruled out ------------------------- */

describe('round 2 · football "Goal ruled out" behind a toggle', () => {
  const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce(football.reducer, football.init(config));
  const KICK: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1, ord: true } }];
  const noGoal = (side: Side, minute = 10): ScoreAction => ({ type: 'NO_GOAL', side, payload: { reason: 'offside', minute, half: 1 } });

  test('off by default: no `deep` key; the format key `trackRuledOut` switches it on', () => {
    assert.equal('deep' in football.init({}), false);
    assert.deepEqual(football.readDeepTrack({ trackRuledOut: true }), { ruledOut: true });
    assert.deepEqual(football.init({ trackRuledOut: true }).deep, { ruledOut: true });
    assert.equal(football.init({ trackRuledOut: false }).deep, undefined);
  });
  test('live settings: a "Deeper stats (optional)" toggle, default off, read from the state', () => {
    const LS = football.FOOTBALL_LIVE_SETTINGS;
    const f = LS.fields.find((x) => x.key === 'trackRuledOut')!;
    assert.deepEqual([f.label, f.type, f.default, f.group], ['Goals ruled out', 'toggle', false, 'Deeper stats (optional)']);
    assert.equal(LS.defaults?.trackRuledOut, false);
    assert.equal(LS.read(football.init({})).trackRuledOut, false);
    assert.equal(LS.read(football.init({ trackRuledOut: true })).trackRuledOut, true);
    assert.ok(football.DEEP_TRACK_FIELDS.some((x) => x.key === 'trackRuledOut'), 'also an organiser format option');
  });
  test('tracked = any goal ruled out logged (the toggle only offers the button)', () => {
    assert.equal(ruledOutTracked(football.init({})), false);
    // no-false-zeros NZI5: switched on with none logged is not tracked (was: true)
    assert.equal(ruledOutTracked(football.init({ trackRuledOut: true })), false);
    assert.equal(ruledOutTracked(run([...KICK, noGoal('away')])), true, 'an older match that logged one');
  });
  test('an older match (no toggle) that logged one replays identically and still shows it', () => {
    const s = run([...KICK, noGoal('away')]);
    assert.deepEqual(s.events.map((e) => [e.type, e.side, e.reason]), [['nogoal', 'away', 'offside']]);
    assert.equal(s.away, 0, 'the score never moved');
    const d = footballDepthTeamStats(s);
    assert.deepEqual([d.home.goalsRuledOut, d.away.goalsRuledOut], [0, 1]);
    assert.equal(footballFeed(s, { home: 'India', away: 'Japan' }).find((i) => i.id === `e${s.events[0].id}`)?.text, 'Goal ruled out for Japan — offside.');
    const attack = centreComparison(footballStats, footballCentreSource(s, { now: 2 }).data('all'), 'all', footballCentre.find((c) => c.id === 'attack')!);
    assert.deepEqual(attack.rows.filter((r) => r.key === 'goalsRuledOut').map((r) => [r.home, r.away]), [['0', '1']]);
  });
  test('none logged: no row, toggle on or off; one logged: 0 v 1', () => {
    // no-false-zeros NZI5: the toggle on with none logged no longer reads "0 v 0"
    const on = footballDepthTeamStats(run(KICK, { trackRuledOut: true }));
    assert.equal('goalsRuledOut' in on.home, false);
    assert.equal('goalsRuledOut' in on.away, false);
    const one = footballDepthTeamStats(run([...KICK, noGoal('away')], { trackRuledOut: true }));
    assert.deepEqual([one.home.goalsRuledOut, one.away.goalsRuledOut], [0, 1]);
    const off = footballDepthTeamStats(run(KICK));
    assert.equal('goalsRuledOut' in off.home, false);
    assert.equal('goalsRuledOut' in off.away, false);
  });
});

/* ------------------------ 2. handball: empty-goal minutes ------------------------ */

const nm = (id: string) => id.toUpperCase();
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<HandballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', ...ev } as HandballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: payload.uid ?? `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const who = (id: string) => ({ playerId: id, playerName: nm(id) });
const XI = (team: Side, gk: string | undefined, players: string[]): ScoreAction => ({ type: 'XI', payload: { team, ...(gk ? { gk: { id: gk, name: nm(gk) } } : {}), players: players.map((id) => ({ id, name: nm(id) })) } });
const goal = (side: Side, sec: number, id: string, period = 1) => A('GOAL', side, sec, period, { type: 'goal', shotType: 'nineM', ...who(id) }, { shotType: 'nineM' });
const empty = (side: Side, sec: number, on: boolean, period = 1) => A('EMPTY_GOAL', side, sec, period, {}, { on });
const endPeriod: ScoreAction = { type: 'END_PERIOD', payload: { at: 0 } };
const runH = (acts: ScoreAction[]) => acts.reduce(reducer, init({}));
const XIS = () => [XI('home', 'hgk', ['hgk', 'h1', 'h2']), XI('away', 'agk', ['agk', 'a1', 'a2'])];

/** Away empty their goal 400–450 (50 s) and again 1000–1090 (90 s); home never. */
function egMatch(): ScoreAction[] {
  u = 0;
  return [
    ...XIS(),
    goal('home', 60, 'h1'),
    empty('away', 400, true),
    goal('home', 420, 'h2'), // into the empty goal
    empty('away', 450, false),
    empty('away', 1000, true),
    empty('away', 1010, true), // a second tap while empty opens nothing new
    goal('away', 1050, 'a1'),
    empty('away', 1090, false),
    endPeriod,
    goal('away', 1900, 'a2', 2),
  ];
}

describe('round 2 · handball empty-goal spells and minutes', () => {
  const s = runH(egMatch());
  test('spells read like goalEmpty: open on "Empty goal", closed on "keeper back"; the keeper taken off', () => {
    assert.deepEqual(emptyGoalSpells(s), [
      { side: 'away', from: 400, to: 450, keeper: { id: 'agk', name: 'AGK' } },
      { side: 'away', from: 1000, to: 1090, keeper: { id: 'agk', name: 'AGK' } },
    ]);
    assert.deepEqual([emptyGoalSecs(s, 'away'), emptyGoalSecs(s, 'home')], [140, 0]);
    assert.equal(emptyGoalSecs(s, 'away', 1), 140);
    assert.equal(emptyGoalSecs(s, 'away', 2), 0);
    assert.equal(emptyGoalTimed(s), true);
  });
  test('minutes to one decimal', () => {
    assert.deepEqual([egMinutes(140), egMinutes(50), egMinutes(20), egMinutes(0)], [2.3, 0.8, 0.3, 0]);
  });
  test('team figure on both sides once used (a true 0 for the side that never emptied it), per period too', () => {
    assert.deepEqual([handballDepthFigures(s, 'away').emptyGoalMinutes, handballDepthFigures(s, 'home').emptyGoalMinutes], [2.3, 0]);
    assert.deepEqual([handballDepthFigures(s, 'away', 1).emptyGoalMinutes, handballDepthFigures(s, 'away', 2).emptyGoalMinutes], [2.3, 0]);
  });
  test('career: only the keeper taken off carries it (derived, keyed — nobody else gets a 0)', () => {
    assert.deepEqual(emptyGoalKeeperMinutes(s), { agk: { side: 'away', minutes: 2.3 } });
    assert.equal(handballDerivedCredits(s).agk.stats.emptyGoalMinutes, 2.3);
    const t = handballTotals(s);
    assert.equal(t.agk.stats.emptyGoalMinutes, 2.3);
    for (const id of ['hgk', 'h1', 'h2', 'a1', 'a2']) assert.equal('emptyGoalMinutes' in (t[id]?.stats ?? {}), false, id);
    assert.ok((DERIVED_KEYS as readonly string[]).includes('emptyGoalMinutes'));
  });
  test('the SD-19 contract holds on every undo prefix', () => {
    const sp: TotalsSport<HandballState> = { name: 'handball', init, reducer, statTotals: handballTotals, partial: false, derived: DERIVED_KEYS };
    assertContract(sp, toRecords(egMatch()), { every: 1 });
  });
  test('never used (every older match): no team figure, no career key', () => {
    const plain = runH(egMatch().filter((a) => a.type !== 'EMPTY_GOAL'));
    assert.deepEqual(emptyGoalSpells(plain), []);
    assert.equal(emptyGoalTimed(plain), false);
    assert.equal('emptyGoalMinutes' in handballDepthFigures(plain, 'away'), false);
    assert.equal('emptyGoalMinutes' in handballTotals(plain).agk.stats, false);
  });
  test('used but never timed (no clock, every moment 0:00): no minutes rather than a false 0', () => {
    u = 0;
    const s0 = runH([...XIS(), empty('away', 0, true), goal('home', 0, 'h1'), empty('away', 0, false)]);
    assert.equal(emptyGoalTimed(s0), false);
    assert.equal('emptyGoalMinutes' in handballDepthFigures(s0, 'away'), false);
    assert.equal('emptyGoalMinutes' in handballTotals(s0).agk.stats, false);
    assert.equal(handballDepthFigures(s0, 'home').emptyGoalGoals, 1, 'the EG goal still counts');
  });
  test('a keeper set closes the spell; a spell left open runs to the end of play', () => {
    u = 0;
    const gk = runH([...XIS(), empty('home', 100, true), A('GK', 'home', 160, 1, {}, { id: 'hgk2', name: 'HGK2' }), empty('away', 1700, true), endPeriod, endPeriod]);
    assert.ok(gk.ended);
    assert.deepEqual(emptyGoalSpells(gk).map((x) => [x.side, x.from, x.to]), [['home', 100, 160], ['away', 1700, 3600]]);
    assert.deepEqual([emptyGoalSecs(gk, 'home'), emptyGoalSecs(gk, 'away'), emptyGoalSecs(gk, 'away', 2)], [60, 1900, 1800]);
  });
  test('a half ended early: a spell left open over the break counts playing time only', () => {
    u = 0;
    const s1 = runH([
      ...XIS(), empty('away', 1700, true),
      { type: 'SET_CLOCK', payload: { periodSec: 1750 } }, endPeriod, // H1 stopped at 29:10
      empty('away', 1830, false, 2), // 0:30 into H2
    ]);
    assert.deepEqual(playedWindows(s1), [[0, 1750], [1800, 1830]]);
    assert.equal(emptyGoalSecs(s1, 'away'), 80, '50 s before the break + 30 s after (not 130)');
    assert.equal(handballTotals(s1).agk.stats.emptyGoalMinutes, 1.3);
  });
  test('live: an empty goal right now counts up to `now` on the running clock', () => {
    u = 0;
    const live = runH([...XIS(), { type: 'CLOCK', payload: { run: true, at: 1000 } }, empty('away', 60, true)]);
    const now = 1000 + 120_000; // 2:00 on the clock
    assert.equal(emptyGoalSecs(live, 'away', 'all', now), 60);
    assert.equal(handballDepthFigures(live, 'away', 'all', now).emptyGoalMinutes, 1);
    assert.equal(handballBox(live, { now }).data('all').away.teamStats?.emptyGoalMinutes, 1);
  });
  test('no keeper set: the team figure still shows; no career line to write to', () => {
    u = 0;
    const nk = runH([XI('home', 'hgk', ['hgk', 'h1']), XI('away', undefined, ['a1', 'a2']), empty('away', 100, true), empty('away', 160, false)]);
    assert.equal(handballDepthFigures(nk, 'away').emptyGoalMinutes, 1);
    assert.deepEqual(emptyGoalKeeperMinutes(nk), {});
  });
  test('schema + match centre: declared, keyed, decimal; a Goalkeeping row only once used', () => {
    assert.deepEqual(validateSchema(handballStats), []);
    const d = statDefIn(handballStats, 'emptyGoalMinutes')!;
    assert.deepEqual([d.label, d.coverage, d.format?.unit, d.format?.dp], ['Minutes with an empty goal', 'keyed', 'decimal', 1]);
    const keeping = handballCentre.find((c) => c.id === 'keeping')!;
    const row = centreComparison(handballStats, handballBox(s).data('all'), 'all', keeping).rows.find((r) => r.key === 'emptyGoalMinutes');
    assert.deepEqual([row?.label, row?.home, row?.away], ['Minutes with an empty goal (7th court player)', '0.0', '2.3']);
    const plain = runH(egMatch().filter((a) => a.type !== 'EMPTY_GOAL'));
    assert.equal(centreComparison(handballStats, handballBox(plain).data('all'), 'all', keeping).rows.some((r) => r.key === 'emptyGoalMinutes'), false);
    // career: summed over the keeper's matches, one decimal; a line without the key is not tracked
    const line = (stats: Record<string, number>, id: string): StatLine => ({ id, matchId: id, playerId: 'agk', sport: 'handball', stats } as StatLine);
    assert.equal(aggregateValue(handballStats, d, [line({ emptyGoalMinutes: 0.8 }, 'm1'), line({ emptyGoalMinutes: 1.3 }, 'm2'), line({ saves: 3 }, 'm3')]).text, '2.1');
    const sec = handballStats.sections.find((x) => x.id === 'goalkeeping')!;
    assert.ok(sec.rows.some((r) => r.stat === 'emptyGoalMinutes' && r.hideZero));
  });
});

/* ----------------------------- 3. MVP weights ----------------------------- */

const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const L = (playerId: string, sport: SportId, stats: Record<string, number>): StatLine => ({ id: `m1-${playerId}`, matchId: 'm1', playerId, sport, stats } as StatLine);

describe('round 2 · MVP weights for the new figures', () => {
  test('football: key pass 1 (a sixth of an assist), clearance 0.5 (half a tackle); the golden weights unchanged and first', () => {
    const w = STAT_WEIGHTS.football;
    assert.deepEqual([w.keyPasses, w.clearances, w.assists, w.tackles, w.interceptions, w.attackingContributions], [1, 0.5, 6, 1, 1, 1]);
    assert.deepEqual(Object.keys(w).slice(-2), ['keyPasses', 'clearances'], 'appended — the original order still breaks ties');
  });
  test('football: a key-pass-only player is rated (and the rating line says why)', () => {
    const r = matchRatings([L('mf', 'football', { keyPasses: 3 }), L('cb', 'football', { clearances: 4, tackles: 1 })], 'football', [P('mf', 'Mira'), P('cb', 'Chen')], []);
    assert.deepEqual(r.players.map((p) => [p.id, p.points, p.detail]), [['mf', 3, '3 key passes'], ['cb', 3, '4 clearances · 1 tackle']]);
  });
  test('handball: a save by position earns a bonus on top of the save (9 m = baseline)', () => {
    assert.deepEqual(SAVE_BONUS, { sixM: 1, nineM: 0, wing: 0.5, breakthrough: 1, fastBreak: 1, sevenM: 1 });
    const w = STAT_WEIGHTS.handball;
    assert.deepEqual(
      [w.saves, w.sixMSaves, w.nineMSaves, w.wingSaves, w.breakthroughSaves, w.fastBreakSaves, w.sevenMSaves],
      [1.5, 1, undefined, 0.5, 1, 1, 1],
    );
    // 6 saves: 2 from 9 m, 1 from 6 m, 1 wing, 1 fast break, 1 7 m
    const keeper = { saves: 6, sevenMSaves: 1, nineMSaves: 2, sixMSaves: 1, wingSaves: 1, fastBreakSaves: 1, breakthroughSaves: 0 };
    const r = matchRatings([L('gk', 'handball', keeper), L('old', 'handball', { saves: 6 })], 'handball', [P('gk', 'Gita'), P('old', 'Olga')], []);
    assert.equal(r.players.find((p) => p.id === 'gk')!.points, 6 * 1.5 + 1 + 1 + 0.5 + 1);
    assert.equal(r.players.find((p) => p.id === 'old')!.points, 9, 'a line without position keys keeps its points');
  });
  test('hockey: unchanged — its only new keeper figure is shoot-out saves, which never count (as football)', () => {
    assert.equal(STAT_WEIGHTS.hockey.soSaves, undefined);
    assert.equal(STAT_WEIGHTS.football.shootoutSaves, undefined);
    assert.equal(STAT_WEIGHTS.handball.soSaves, undefined);
  });
});
