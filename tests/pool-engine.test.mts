/**
 * Pool (8-ball, 9-ball, 10-ball) — the scoring engine, written test-first
 * from docs/sports/POOL_DESIGN.md. Rule numbers are the WPA Rules of Play,
 * effective 2026-10-21 (4 = 8-Ball, 5 = 9-Ball, 6 = 10-Ball, 3 = Fouls), and
 * the WPA Playing Regulations (Reg 16, the three-ball break rule).
 *
 * Scoring is shot by shot (LAG, BREAK, POT, MISS, SAFETY, FOUL, PUSH, CHOOSE,
 * STALEMATE) with a quick mode (RACK = just the rack winner), mixable rack by
 * rack. Undo = replay the log without its newest event (src/data/eventLog.ts).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as pool from '../src/sports/pool/engine.ts';
import { poolStats } from '../src/sports/pool/stats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
type P = Record<string, unknown>;
const A = (type: string, side?: Side, payload?: P): ScoreAction =>
  ({ type, ...(side ? { side } : {}), ...(payload ? { payload } : {}) });
const LAG = (side: Side, breaks?: Side) => A('LAG', side, breaks ? { breaks } : undefined);
const BREAK = (payload: P = {}, side?: Side) => A('BREAK', side, payload);
const POT = (pots: number[], extra: P = {}, side?: Side) => A('POT', side, { pots, ...extra });
const MISS = (side?: Side) => A('MISS', side);
const SAFE = (pots?: number[], side?: Side) => A('SAFETY', side, pots ? { pots } : undefined);
const FOUL = (kind: string, extra: P = {}, side?: Side) => A('FOUL', side, { kind, ...extra });
const PUSH = (payload: P = {}, side?: Side) => A('PUSH', side, payload);
const CHOOSE = (choice: string, breaker?: Side) => A('CHOOSE', undefined, { choice, ...(breaker ? { breaker } : {}) });
const RACK = (side: Side, flags: P = {}) => A('RACK', side, flags);
const SHOTS = new Set(['POT', 'MISS', 'SAFETY', 'FOUL', 'PUSH']);
/** What the scorer's controls send with a tap: the number of the rack in play
 *  on a quick RACK (breaks #12), and on a shot the side at the table
 *  (breaks #13). Tests that check the raw reducer call it directly. */
function stamp(s: pool.PoolState, a: ScoreAction): ScoreAction {
  const r = s.rack;
  if (!r) return a;
  let out = a;
  if (a.type === 'RACK' && a.payload?.rack === undefined) out = { ...out, payload: { ...(out.payload ?? {}), rack: r.n } };
  if (SHOTS.has(a.type) && !a.side && r.shooter) out = { ...out, side: r.shooter };
  return out;
}
/** One tap through the controls. */
const step = (s: pool.PoolState, a: ScoreAction) => pool.reducer(s, stamp(s, a));
/** The log the controls would store for these taps. */
function stampLog(config: P, acts: ScoreAction[]): ScoreAction[] {
  let s = pool.createInitialState(config);
  return acts.map((a) => { const b = stamp(s, a); s = pool.reducer(s, b); return b; });
}
const run = (config: P, ...acts: ScoreAction[]) => pool.replay(config, stampLog(config, acts));
const EIGHT = { game: 'eight' };
const NINE = { game: 'nine' };
const TEN = { game: 'ten' };
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('format: organiser options and defaults (POOL_DESIGN §6)', () => {
  test('defaults: 8-ball, race to 5, one race, alternate break; three-foul off at 8-ball, on at 9/10', () => {
    const s = pool.createInitialState();
    assert.equal(s.game, 'eight');
    assert.equal(s.raceTo, 5);
    assert.equal(s.setsToWin, 1);
    assert.equal(s.breakFormat, 'alternate');
    assert.equal(s.threeFoul, false, 'WPA 3.13: "Some games such as 8-Ball do not include this rule"');
    assert.equal(pool.createInitialState(NINE).threeFoul, true);
    assert.equal(pool.createInitialState(TEN).threeFoul, true);
    assert.equal(pool.createInitialState(NINE).threeBallRule, true, 'WPA 5.3(c) / Reg 16');
    assert.equal(pool.createInitialState(TEN).tenEarly, false, 'WPA 6.7 (2026): the 10 must be the last ball');
    assert.equal(s.ended, false);
    assert.equal(s.winner, null);
    assert.equal(s.v, 1);
  });

  test('the game option takes the common spellings', () => {
    for (const g of [9, '9', '9-ball', '9ball', 'nine']) assert.equal(pool.createInitialState({ game: g }).game, 'nine', String(g));
    for (const g of [10, '10', '10-ball', 'ten']) assert.equal(pool.createInitialState({ game: g }).game, 'ten', String(g));
    for (const g of [8, '8', '8-ball', 'eight', 'snooker', null, undefined]) assert.equal(pool.createInitialState({ game: g }).game, 'eight', String(g));
  });

  test('bad numbers fall back to the default or are clamped', () => {
    for (const v of [NaN, Infinity, -Infinity, 'abc', null, {}, []]) assert.equal(pool.createInitialState({ raceTo: v }).raceTo, 5, String(v));
    assert.equal(pool.createInitialState({ raceTo: -3 }).raceTo, 1);
    assert.equal(pool.createInitialState({ raceTo: 0 }).raceTo, 1);
    assert.equal(pool.createInitialState({ raceTo: 1000 }).raceTo, 99);
    assert.equal(pool.createInitialState({ raceTo: '7' }).raceTo, 7);
    assert.equal(pool.createInitialState({ raceTo: 7.9 }).raceTo, 7);
    assert.equal(pool.createInitialState({ setsToWin: 50 }).setsToWin, 9);
    assert.equal(pool.createInitialState({ breakFormat: 'whatever' }).breakFormat, 'alternate');
    assert.equal(pool.createInitialState({ breakFormat: 'winner' }).breakFormat, 'winner');
    assert.equal(pool.createInitialState({ ...NINE, threeFoul: false }).threeFoul, false);
    assert.equal(pool.createInitialState({ ...EIGHT, threeFoul: true }).threeFoul, true);
  });

  test('a rack starts full and waiting for its break; the breaker is unknown until the lag', () => {
    const s = pool.createInitialState(NINE);
    assert.deepEqual(s.rack!.table, range(1, 9));
    assert.equal(s.rack!.phase, 'break');
    assert.equal(s.rack!.breaker, null);
    assert.equal(s.rack!.n, 1);
    assert.deepEqual(pool.createInitialState(EIGHT).rack!.table, range(1, 15));
    assert.deepEqual(pool.createInitialState(TEN).rack!.table, range(1, 10));
  });
});

describe('the lag and the break order (WPA 1.2, 1.3)', () => {
  test('the lag winner breaks, or sends the opponent to break', () => {
    assert.equal(run(NINE, LAG('home')).rack!.breaker, 'home');
    assert.equal(run(NINE, LAG('home', 'away')).rack!.breaker, 'away');
    assert.equal(run(NINE, LAG('away')).firstBreaker, 'away');
    assert.equal(pool.nextBreaker(run(NINE, LAG('away'))), 'away');
  });

  test('a lag after the first break is ignored', () => {
    const s = run(NINE, LAG('home'), BREAK({ pots: [] }));
    assert.equal(pool.reducer(s, LAG('away')), s);
  });

  test('without a lag the first break needs its side; that fixes the first breaker', () => {
    const s0 = pool.createInitialState(NINE);
    assert.equal(pool.reducer(s0, BREAK({ pots: [] })), s0, 'unknown breaker, no side: ignored');
    const s = pool.reducer(s0, BREAK({ pots: [] }, 'away'));
    assert.equal(s.firstBreaker, 'away');
    assert.equal(s.rack!.shooter, 'home');
  });

  test('a break by the wrong side is ignored', () => {
    const s = run(NINE, LAG('home'));
    assert.equal(pool.reducer(s, BREAK({ pots: [] }, 'away')), s);
  });

  test('alternate break (default): the break alternates rack by rack', () => {
    let s = run({ ...NINE, raceTo: 5 }, LAG('home'));
    const breakers: Side[] = [];
    for (const w of ['home', 'home', 'away', 'home'] as Side[]) { breakers.push(s.rack!.breaker!); s = step(s, RACK(w)); }
    assert.deepEqual(breakers, ['home', 'away', 'home', 'away']);
  });

  test('winner breaks / loser breaks', () => {
    let s = run({ ...NINE, breakFormat: 'winner' }, LAG('home'), RACK('away'));
    assert.equal(s.rack!.breaker, 'away');
    s = step(s, RACK('home'));
    assert.equal(s.rack!.breaker, 'home');
    s = run({ ...NINE, breakFormat: 'loser' }, LAG('home'), RACK('away'));
    assert.equal(s.rack!.breaker, 'home');
    s = step(s, RACK('home'));
    assert.equal(s.rack!.breaker, 'away');
  });

  test('alternate break follows the schedule even when a rack was re-racked with the other breaker', () => {
    // 8-ball rack 1: home breaks illegally, away re-racks and breaks (4.3(d)(2)), away wins.
    const s = run(EIGHT, LAG('home'), BREAK({ illegal: true }), CHOOSE('rerack'), RACK('away'));
    assert.equal(s.racks[0].breaker, 'away', 'the rack as played was broken by away');
    assert.equal(s.rack!.n, 2);
    assert.equal(s.rack!.breaker, 'away', 'rack 2 is the scheduled away break');
  });
});

describe('8-ball (WPA section 4)', () => {
  const start = (...acts: ScoreAction[]) => run(EIGHT, LAG('home'), ...acts);

  test('4.3(c): a ball pocketed on a legal break — the breaker continues and the table stays open', () => {
    const s = start(BREAK({ pots: [1, 2] }));
    assert.equal(s.rack!.phase, 'play');
    assert.equal(s.rack!.shooter, 'home');
    assert.equal(s.rack!.solids, null, '4.4: groups are never decided on the break');
    assert.deepEqual(s.rack!.table, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  test('a dry legal break: the opponent plays from position', () => {
    const s = start(BREAK({ pots: [] }));
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, false);
    assert.equal(s.tally.home.dryBreaks, 1);
  });

  test('4.3(d): illegal break — not a foul; the incoming athlete accepts, re-racks and breaks, or lets the offender re-break', () => {
    const s = start(BREAK({ illegal: true }));
    assert.deepEqual(s.rack!.pending, { kind: 'illegalBreak', by: 'away' });
    assert.equal(s.tally.home.fouls, 0, 'an illegal 8-ball break is not a foul');
    assert.equal(s.tally.home.illegalBreaks, 1);
    const accept = pool.reducer(s, CHOOSE('play'));
    assert.equal(accept.rack!.shooter, 'away');
    assert.equal(accept.rack!.bih, false);
    assert.equal(accept.rack!.pending, null);
    const rerack = pool.reducer(s, CHOOSE('rerack'));
    assert.equal(rerack.rack!.phase, 'break');
    assert.equal(rerack.rack!.breaker, 'away', 'the chooser breaks by default');
    assert.deepEqual(rerack.rack!.table, range(1, 15));
    assert.equal(rerack.rack!.reracks, 1);
    assert.equal(pool.reducer(s, CHOOSE('rerack', 'home')).rack!.breaker, 'home', 'or the offender breaks again');
    assert.equal(pool.reducer(s, CHOOSE('pass')), s, '"pass" is not an option here');
  });

  test('while a choice is pending, shots are ignored', () => {
    const s = start(BREAK({ illegal: true }));
    for (const a of [POT([3]), MISS(), SAFE(), FOUL('scratch'), BREAK({ pots: [] })]) assert.equal(step(s, a), s, a.type);
  });

  test('4.3(e): the 8 on a legal break is not a win — the breaker spots it and continues, or re-breaks', () => {
    const s = start(BREAK({ pots: [8, 3] }));
    assert.equal(s.ended, false);
    assert.equal(s.racks.length, 0);
    assert.deepEqual(s.rack!.pending, { kind: 'eightBreak', by: 'home' });
    assert.equal(s.tally.home.eightOnBreak, 1);
    const spot = pool.reducer(s, CHOOSE('play'));
    assert.ok(spot.rack!.table.includes(8), 'the 8 is spotted (4.7)');
    assert.ok(!spot.rack!.table.includes(3));
    assert.equal(spot.rack!.shooter, 'home');
    assert.equal(spot.rack!.phase, 'play');
    const again = pool.reducer(s, CHOOSE('rerack'));
    assert.equal(again.rack!.breaker, 'home');
    assert.equal(again.rack!.phase, 'break');
    assert.equal(pool.reducer(s, CHOOSE('rerack', 'away')).rack!.breaker, 'home', 're-breaking is the breaker\'s own option');
  });

  test('4.3(f): the 8 pocketed on a break foul — the opponent spots it and shoots with ball in hand, or re-breaks', () => {
    const s = start(BREAK({ pots: [8], foul: 'scratch' }));
    assert.deepEqual(s.rack!.pending, { kind: 'eightFoul', by: 'away' });
    assert.equal(s.tally.home.breakFouls, 1);
    const spot = pool.reducer(s, CHOOSE('play'));
    assert.ok(spot.rack!.table.includes(8));
    assert.equal(spot.rack!.shooter, 'away');
    assert.equal(spot.rack!.bih, true);
    assert.equal(pool.reducer(s, CHOOSE('rerack')).rack!.breaker, 'away');
  });

  test('4.3(g): balls driven off the table on the break stay out, except the 8 (spotted); a foul', () => {
    const s = start(BREAK({ pots: [2], off: [8, 12] }));
    assert.ok(s.rack!.table.includes(8));
    assert.ok(!s.rack!.table.includes(12));
    assert.ok(!s.rack!.table.includes(2));
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, true);
    assert.equal(s.tally.home.foulsBy.offTable, 1);
    assert.equal(s.rack!.pending, null);
  });

  test('4.3(h): any other break foul — the opponent comes to the table with ball in hand', () => {
    const s = start(BREAK({ pots: [3], foul: 'scratch' }));
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, true);
    assert.ok(!s.rack!.table.includes(3), 'balls pocketed on the foul stay down');
    assert.equal(s.tally.home.foulsBy.scratch, 1);
  });

  test('4.4: the first legally pocketed called ball after the break decides the groups', () => {
    const s = start(BREAK({ pots: [1, 2] }), POT([11]));
    assert.equal(s.rack!.solids, 'away', 'home pocketed a stripe: home stripes, away solids');
    assert.equal(s.rack!.shooter, 'home');
  });

  test('4.4: balls of both groups on an open table — the called ball (or the first tapped) decides', () => {
    assert.equal(start(BREAK({ pots: [] }), POT([10, 3], { calledBall: 3 })).rack!.solids, 'away', 'away called the 3');
    assert.equal(start(BREAK({ pots: [] }), POT([10, 3])).rack!.solids, 'home', 'no called ball: the first tapped (10) — away stripes');
  });

  test('4.4: a called ball missed on an open table — the table stays open, play passes, the balls stay down', () => {
    const s = start(BREAK({ pots: [] }), POT([5], { called: false }));
    assert.equal(s.rack!.solids, null);
    assert.equal(s.rack!.shooter, 'home');
    assert.ok(!s.rack!.table.includes(5));
  });

  test('the groups are assigned once: a later pot of the other group does not change them', () => {
    const s = start(BREAK({ pots: [1] }), POT([2]), MISS(), POT([9]), POT([10, 3]));
    assert.equal(s.rack!.solids, 'home');
  });

  test('4.5: a pot with none of the shooter\'s group ends the inning; the balls stay down', () => {
    const s = start(BREAK({ pots: [1] }), POT([2]), POT([12]));
    assert.equal(s.rack!.shooter, 'away');
    assert.ok(!s.rack!.table.includes(12));
  });

  test('win: the group cleared, then the 8 in the called pocket', () => {
    const s = start(BREAK({ pots: [] }), POT(range(9, 15)), POT([8]));
    assert.equal(s.racks.length, 1);
    assert.equal(s.racks[0].winner, 'away');
    assert.equal(s.racks[0].how, 'money');
    assert.equal(s.current.away, 1);
    assert.equal(s.rack!.n, 2);
  });

  test('4.8(b): the 8 before the group is cleared loses the rack', () => {
    const s = start(BREAK({ pots: [1] }), POT([2]), POT([8]));
    assert.equal(s.racks[0].winner, 'away');
    assert.equal(s.racks[0].how, 'eightEarly');
  });

  test('4.8(b) / 4.6: the 8 on the same shot as the last ball of the group loses', () => {
    const s = start(BREAK({ pots: [1] }), POT([2, 3, 4, 5, 6]), POT([7, 8]));
    assert.equal(s.racks[0].winner, 'away');
    assert.equal(s.racks[0].how, 'eightEarly');
  });

  test('4.8(a): the 8 pocketed with a foul loses — even when the group is cleared', () => {
    const s = start(BREAK({ pots: [] }), POT(range(1, 7)), FOUL('scratch', { pots: [8] }));
    assert.equal(s.racks[0].winner, 'home');
    assert.equal(s.racks[0].how, 'eightFoul');
  });

  test('4.8(c): the 8 in an uncalled pocket loses', () => {
    const s = start(BREAK({ pots: [] }), POT(range(1, 7)), POT([8], { called: false }));
    assert.equal(s.racks[0].winner, 'home');
    assert.equal(s.racks[0].how, 'eightPocket');
  });

  test('4.8(d): the 8 off the table loses', () => {
    const s = start(BREAK({ pots: [] }), POT([1]), FOUL('offTable', { off: [8] }));
    assert.equal(s.racks[0].winner, 'home');
    assert.equal(s.racks[0].how, 'eightOff');
  });

  test('4.6 / 4.8: an 8 pocketed on a safety loses', () => {
    const s = start(BREAK({ pots: [] }), POT(range(1, 7)), SAFE([8]));
    assert.equal(s.racks[0].winner, 'home');
  });

  test('4.4: open table — the 8 wins when a group is already cleared; loses when none is', () => {
    // home breaks in all seven stripes; table open; home plays the 8 legally
    const win = start(BREAK({ pots: range(9, 15) }), POT([8]));
    assert.equal(win.racks[0].winner, 'home');
    assert.equal(win.racks[0].how, 'money');
    const lose = start(BREAK({ pots: [9] }), POT([8]));
    assert.equal(lose.racks[0].winner, 'away');
    assert.equal(lose.racks[0].how, 'eightEarly');
  });

  test('a safety: balls pocketed stay down and play passes (4.6)', () => {
    const s = start(BREAK({ pots: [1] }), POT([2]), SAFE([3, 12]));
    assert.equal(s.rack!.shooter, 'away');
    assert.ok(!s.rack!.table.includes(3) && !s.rack!.table.includes(12));
    assert.equal(s.tally.home.safeties, 1);
  });

  test('three fouls do not lose at 8-ball by default; an organiser can switch the rule on', () => {
    const acts = [LAG('home'), BREAK({ pots: [] }), FOUL('scratch'), SAFE(), FOUL('scratch'), SAFE(), FOUL('scratch')];
    assert.equal(pool.replay(EIGHT, stampLog(EIGHT, acts)).racks.length, 0);
    const on = pool.replay({ ...EIGHT, threeFoul: true }, stampLog({ ...EIGHT, threeFoul: true }, acts));
    assert.equal(on.racks[0].winner, 'home');
    assert.equal(on.racks[0].how, 'threeFoul');
  });

  test('a ball off the table during play stays out (4.7: only the 8 is ever spotted)', () => {
    const s = start(BREAK({ pots: [] }), FOUL('offTable', { off: [3] }));
    assert.ok(!s.rack!.table.includes(3));
  });

  test('balls not in the game, already down or tapped twice: the whole tap is ignored', () => {
    const s = start(BREAK({ pots: [1] }));
    for (const pots of [[16], [0], [-1], [1], [3, 3], [2.5], [NaN], [Infinity]]) assert.equal(step(s, POT(pots)), s, JSON.stringify(pots));
    assert.equal(step(s, POT([])), s, 'a pot of nothing is not a pot');
    assert.equal(step(s, FOUL('scratch', { pots: [2], off: [2] })), s, 'one ball both pocketed and off the table');
  });
});

describe('9-ball (WPA section 5)', () => {
  const start = (...acts: ScoreAction[]) => run(NINE, LAG('home'), ...acts);

  test('5.5: the 9 on a legal break wins — a golden break (and a break-and-run)', () => {
    const s = start(BREAK({ pots: [9, 4] }));
    assert.equal(s.racks[0].winner, 'home');
    assert.equal(s.racks[0].how, 'golden');
    assert.equal(s.racks[0].golden, true);
    assert.equal(s.racks[0].bnr, true);
    assert.equal(s.tally.home.golden, 1);
    assert.equal(s.tally.home.bnr, 1);
  });

  test('5.6: the 9 pocketed on a break foul is spotted; the opponent has ball in hand and may not push out', () => {
    const s = start(BREAK({ pots: [9], foul: 'scratch' }));
    assert.equal(s.racks.length, 0);
    assert.ok(s.rack!.table.includes(9));
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, true);
    assert.equal(s.rack!.push, false, '5.4: a push-out only after a break with no foul');
    assert.equal(step(s, PUSH()), s);
  });

  test('5.3(b): nothing pocketed and fewer than four balls to a rail is a foul', () => {
    const s = start(BREAK({ illegal: true }));
    assert.equal(s.tally.home.fouls, 1);
    assert.equal(s.tally.home.foulsBy.illegalBreak, 1);
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, true);
    assert.equal(s.rack!.fouls.home, 1, 'a break foul counts toward three fouls');
  });

  test('5.4: push-out after a dry break — the other athlete chooses who shoots next', () => {
    const s = start(BREAK({ pots: [] }), PUSH());
    assert.deepEqual(s.rack!.pending, { kind: 'push', by: 'home' });
    assert.equal(s.tally.away.pushOuts, 1);
    const play = pool.reducer(s, CHOOSE('play'));
    assert.equal(play.rack!.shooter, 'home');
    assert.equal(play.rack!.push, false);
    assert.equal(play.rack!.inn.home, 2, 'the break inning + this one');
    const pass = pool.reducer(s, CHOOSE('pass'));
    assert.equal(pass.rack!.shooter, 'away');
    assert.equal(pass.rack!.inn.away, 1, '2.8: a passed push-out continues the inning');
    assert.equal(step(pass, PUSH()), pass, 'only one push-out');
    assert.equal(pool.reducer(s, CHOOSE('rerack')), s, 're-rack is not an option after a push-out');
  });

  test('5.4: after pocketing on the break the breaker may push out (the second shot of the rack)', () => {
    const s = start(BREAK({ pots: [3] }), PUSH());
    assert.deepEqual(s.rack!.pending, { kind: 'push', by: 'away' });
  });

  test('5.4: no push-out on the third shot', () => {
    const s = start(BREAK({ pots: [] }), MISS());
    assert.equal(step(s, PUSH()), s);
  });

  test('5.6: the 9 pocketed on a push-out is spotted; other balls stay down', () => {
    const s = start(BREAK({ pots: [] }), PUSH({ pots: [9, 5] }));
    assert.ok(s.rack!.table.includes(9));
    assert.ok(!s.rack!.table.includes(5));
    assert.equal(s.racks.length, 0, 'a push-out never wins (5.5)');
  });

  test('a foul on a push-out is a standard foul — no choice', () => {
    const s = start(BREAK({ pots: [] }), PUSH({ foul: 'scratch' }));
    assert.equal(s.rack!.pending, null);
    assert.equal(s.rack!.shooter, 'home');
    assert.equal(s.rack!.bih, true);
    assert.equal(s.tally.away.pushOuts, 1);
    assert.equal(s.tally.away.fouls, 1);
  });

  test('5.5: a ball legally pocketed keeps the shooter at the table; the 9 legally pocketed on any shot wins', () => {
    const s = start(BREAK({ pots: [1] }), POT([2]));
    assert.equal(s.rack!.shooter, 'home');
    const combo = step(s, POT([3, 9]));
    assert.equal(combo.racks[0].winner, 'home');
    assert.equal(combo.racks[0].how, 'money');
    assert.equal(combo.racks[0].bnr, true);
  });

  test('5.6: the 9 pocketed on a foul or driven off the table is spotted', () => {
    const a = start(BREAK({ pots: [1] }), FOUL('wrongBall', { pots: [9] }));
    assert.ok(a.rack!.table.includes(9));
    assert.equal(a.racks.length, 0);
    const b = start(BREAK({ pots: [1] }), FOUL('offTable', { off: [9, 4] }));
    assert.ok(b.rack!.table.includes(9));
    assert.ok(!b.rack!.table.includes(4), 'only the 9 is spotted');
  });

  test('9-ball has no safety call: a "safety" that pockets a ball keeps the shooter at the table', () => {
    const s = start(BREAK({ pots: [1] }), SAFE([2]));
    assert.equal(s.rack!.shooter, 'home');
    assert.equal(step(start(BREAK({ pots: [1] })), SAFE([9])).racks[0].winner, 'home');
  });

  test('3.13 / 5.8: three consecutive fouls lose the rack; the warning shows on two', () => {
    let s = start(BREAK({ pots: [] }), MISS(), FOUL('wrongBall'), SAFE(), FOUL('scratch'), SAFE());
    assert.equal(s.rack!.shooter, 'home');
    assert.equal(s.rack!.fouls.home, 2);
    assert.equal(pool.onTwoFouls(s), 'home');
    s = step(s, FOUL('noRail'));
    assert.equal(s.racks[0].winner, 'away');
    assert.equal(s.racks[0].how, 'threeFoul');
    assert.equal(s.tally.home.threeFoulLosses, 1);
  });

  test('3.13: a legal shot in between resets the count', () => {
    const s = start(BREAK({ pots: [] }), MISS(), FOUL('wrongBall'), SAFE(), MISS(), SAFE(), FOUL('scratch'), SAFE(), FOUL('scratch'));
    assert.equal(s.racks.length, 0);
    assert.equal(s.rack!.fouls.home, 2);
  });

  test('3.13: counted per player — the opponent\'s fouls neither count nor reset', () => {
    // home breaks dry; away fouls; home fouls; … alternating fouls
    const s = start(BREAK({ pots: [] }), FOUL('scratch'), FOUL('scratch'), FOUL('scratch'), FOUL('scratch'));
    assert.deepEqual(s.rack!.fouls, { home: 2, away: 2 });
    const t = step(s, FOUL('scratch'));
    assert.equal(t.racks[0].winner, 'home', 'away fouled three times');
  });

  test('3.13: the fouls must be in one rack', () => {
    const s = start(BREAK({ pots: [] }), MISS(), FOUL('scratch'), SAFE(), FOUL('scratch'), RACK('away'));
    assert.deepEqual(s.rack!.fouls, { home: 0, away: 0 });
  });

  test('Reg 16 three-ball rule: a short break — accept the table (no push-out) or hand it back (the breaker may push)', () => {
    const s = start(BREAK({ pots: [2], short: true }));
    assert.deepEqual(s.rack!.pending, { kind: 'threeBall', by: 'away' });
    const accept = pool.reducer(s, CHOOSE('play'));
    assert.equal(accept.rack!.shooter, 'away');
    assert.equal(accept.rack!.push, false, 'Reg 16(3)');
    const back = pool.reducer(s, CHOOSE('pass'));
    assert.equal(back.rack!.shooter, 'home');
    assert.equal(back.rack!.push, true, 'Reg 16(4)');
  });

  test('Reg 16(5): the 9 on a short break is spotted (no golden break)', () => {
    const s = start(BREAK({ pots: [9], short: true }));
    assert.equal(s.racks.length, 0);
    assert.ok(s.rack!.table.includes(9));
  });

  test('the three-ball rule switched off: "short" is ignored', () => {
    const s = run({ ...NINE, threeBallRule: false }, LAG('home'), BREAK({ pots: [2], short: true }));
    assert.equal(s.rack!.pending, null);
    assert.equal(s.rack!.shooter, 'home');
  });

  test('balls outside 1–9 are not in the game', () => {
    const s = start(BREAK({ pots: [] }));
    assert.equal(step(s, POT([10])), s);
    assert.equal(step(s, POT([15])), s);
  });
});

describe('10-ball (WPA section 6)', () => {
  const start = (...acts: ScoreAction[]) => run(TEN, LAG('home'), ...acts);

  test('6.8: the 10 on the break is spotted — not a win; the breaker continues', () => {
    const s = start(BREAK({ pots: [10, 3] }));
    assert.equal(s.racks.length, 0);
    assert.ok(s.rack!.table.includes(10));
    assert.equal(s.rack!.shooter, 'home');
    const only = start(BREAK({ pots: [10] }));
    assert.ok(only.rack!.table.includes(10));
    assert.equal(only.rack!.shooter, 'home', 'a ball was pocketed on the break (POOL_DESIGN §7.5)');
  });

  test('6.7: the 10 legally pocketed on a called shot when it is the only ball wins', () => {
    const s = start(BREAK({ pots: range(1, 9) }), POT([10]));
    assert.equal(s.racks[0].winner, 'home');
    assert.equal(s.racks[0].how, 'money');
  });

  test('6.8: a 10 pocketed before it is the last ball is spotted — even when called (2026 edition)', () => {
    const s = start(BREAK({ pots: [1] }), POT([2, 10], { calledBall: 10 }));
    assert.equal(s.racks.length, 0);
    assert.ok(s.rack!.table.includes(10));
    assert.equal(s.rack!.shooter, 'home');
  });

  test('tenEarly (older practice): a called 10 pocketed early wins; an uncalled one is still spotted', () => {
    const cfg = { ...TEN, tenEarly: true };
    const s = pool.replay(cfg, stampLog(cfg, [LAG('home'), BREAK({ pots: [1] }), POT([2, 10], { calledBall: 10 })]));
    assert.equal(s.racks[0].winner, 'home');
    const t = pool.replay(cfg, stampLog(cfg, [LAG('home'), BREAK({ pots: [1] }), POT([2, 10], { calledBall: 2 })]));
    assert.equal(t.racks.length, 0);
    assert.ok(t.rack!.table.includes(10));
  });

  test('6.6: a wrongfully pocketed ball — the other athlete chooses who shoots', () => {
    const s = start(BREAK({ pots: [1] }), POT([5], { called: false }));
    assert.deepEqual(s.rack!.pending, { kind: 'wrongPot', by: 'away' });
    assert.ok(!s.rack!.table.includes(5), 'the ball stays down');
    const play = pool.reducer(s, CHOOSE('play'));
    assert.equal(play.rack!.shooter, 'away');
    assert.equal(play.rack!.bih, false, 'no foul: from position');
    const pass = pool.reducer(s, CHOOSE('pass'));
    assert.equal(pass.rack!.shooter, 'home');
    assert.equal(pass.rack!.inn.home, 1);
  });

  test('6.6 / 6.8: a wrongfully pocketed 10 is spotted', () => {
    const s = start(BREAK({ pots: range(1, 9) }), POT([10], { called: false }));
    assert.equal(s.racks.length, 0);
    assert.ok(s.rack!.table.includes(10));
  });

  test('6.5: no safety call — a "safety" that pockets a ball is a wrongfully pocketed ball', () => {
    const s = start(BREAK({ pots: [1] }), SAFE([4]));
    assert.deepEqual(s.rack!.pending, { kind: 'wrongPot', by: 'away' });
  });

  test('6.4: push-out as at 9-ball; 6.8: the 10 pocketed on a foul is spotted', () => {
    const s = start(BREAK({ pots: [] }), PUSH({ pots: [10] }));
    assert.deepEqual(s.rack!.pending, { kind: 'push', by: 'home' });
    assert.ok(s.rack!.table.includes(10));
    const f = start(BREAK({ pots: [1] }), FOUL('scratch', { pots: [10] }));
    assert.ok(f.rack!.table.includes(10));
  });

  test('6.10: three consecutive fouls lose the rack', () => {
    const s = start(BREAK({ pots: [] }), MISS(), FOUL('scratch'), MISS(), FOUL('scratch'), MISS(), FOUL('scratch'));
    assert.equal(s.racks[0].winner, 'away');
    assert.equal(s.racks[0].how, 'threeFoul');
  });

  test('balls outside 1–10 are not in the game', () => {
    const s = start(BREAK({ pots: [] }));
    assert.equal(step(s, POT([11])), s);
  });
});

describe('the match: race, sets, the end', () => {
  test('a race to 3: the first to 3 racks wins; nothing after the end changes the state', () => {
    const s = run({ ...NINE, raceTo: 3 }, LAG('home'), RACK('home'), RACK('away'), RACK('home'), RACK('home'));
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'home');
    assert.equal(pool.isComplete(s), true);
    assert.equal(pool.winner(s), 'home');
    assert.deepEqual(pool.result(s), { winner: 'home', home: 3, away: 1 });
    assert.equal(s.rack, null);
    assert.equal(pool.scoreLine(s), '3-1');
    assert.equal(pool.scoreLine(s, 'away'), '1-3');
    for (const a of [RACK('away'), BREAK({ pots: [] }, 'away'), LAG('away'), POT([1]), A('STALEMATE')]) assert.equal(pool.reducer(s, a), s, a.type);
    const sum = pool.summary(s);
    assert.equal(sum.homeScore, '3');
    assert.equal(sum.awayScore, '1');
    assert.equal(sum.statusLine, 'Match Over');
  });

  test('live summary: racks in the set, the rack in play, the race', () => {
    const s = run({ ...NINE, raceTo: 7 }, LAG('home'), RACK('home'), RACK('home'), RACK('away'));
    const sum = pool.summary(s);
    assert.equal(sum.homeScore, '2');
    assert.equal(sum.awayScore, '1');
    assert.match(sum.statusLine, /9-Ball/);
    assert.match(sum.statusLine, /Rack 4/);
    assert.match(sum.detailLine ?? '', /race to 7/);
    assert.equal(pool.scoreLine(s), '', 'no completed race yet');
    assert.equal(pool.result(s), null);
  });

  test('sets: race to 2, best of 3 sets', () => {
    const cfg = { ...EIGHT, raceTo: 2, setsToWin: 2 };
    let s = run(cfg, LAG('home'), RACK('home'), RACK('home'));
    assert.deepEqual(s.sets, [[2, 0]]);
    assert.deepEqual(s.setsWon, { home: 1, away: 0 });
    assert.deepEqual(s.current, { home: 0, away: 0 });
    assert.match(pool.summary(s).detailLine ?? '', /Sets 1–0/);
    s = [RACK('away'), RACK('home'), RACK('away'), RACK('home'), RACK('home')].reduce(step, s);
    assert.equal(s.ended, true);
    assert.deepEqual(s.sets, [[2, 0], [1, 2], [2, 0]]);
    assert.equal(pool.scoreLine(s), '2-0, 1-2, 2-0');
    assert.equal(pool.scoreLine(s, 'away'), '0-2, 2-1, 0-2');
    assert.deepEqual(pool.result(s), { winner: 'home', home: 2, away: 1 });
    const ls = pool.lineScore(s)!;
    assert.equal(ls.unit, 'set');
    assert.deepEqual(ls.won, { home: 2, away: 1 });
    assert.equal(ls.done.length, 3);
    assert.equal(ls.current, null);
    assert.equal(ls.toWin, 2);
  });

  test('line score of a race without sets: one column, the racks', () => {
    const live = run({ ...NINE, raceTo: 3 }, LAG('home'), RACK('home'));
    const ls = pool.lineScore(live)!;
    assert.deepEqual(ls.won, { home: 1, away: 0 });
    assert.deepEqual(ls.current, { home: 1, away: 0 });
    assert.equal(ls.toWin, 3);
    const done = pool.lineScore(run({ ...NINE, raceTo: 1 }, LAG('home'), RACK('away')))!;
    assert.equal(done.ended, true);
    assert.deepEqual(done.done, [{ home: 0, away: 1 }]);
  });

  test('the racks won never pass the race', () => {
    let s = run({ ...NINE, raceTo: 2, setsToWin: 3 }, LAG('home'));
    for (let i = 0; i < 40; i++) s = step(s, RACK(i % 3 ? 'home' : 'away'));
    for (const [h, a] of s.sets) assert.ok(Math.max(h, a) === 2 && Math.min(h, a) < 2);
    assert.ok(s.setsWon.home <= 3 && s.setsWon.away <= 3);
    assert.equal(s.racks.length, s.sets.reduce((n, [h, a]) => n + h + a, 0));
  });

  test('the readers tolerate a missing or foreign state', () => {
    for (const bad of [null, undefined, {}, { racks: 'x' }, 42] as unknown[]) {
      const st = bad as pool.PoolState;
      assert.equal(pool.isComplete(st), false);
      assert.equal(pool.result(st), null);
      assert.equal(pool.scoreLine(st), '');
      assert.doesNotThrow(() => pool.summary(st));
      assert.doesNotThrow(() => pool.lineScore(st));
      assert.doesNotThrow(() => poolStats(st));
    }
  });
});

describe('quick mode: RACK records the rack winner', () => {
  test('a rack with no detail: quick, with optional flags', () => {
    const s = run(NINE, LAG('home'), RACK('home', { bnr: true }));
    assert.equal(s.racks[0].mode, 'quick');
    assert.equal(s.racks[0].how, 'quick');
    assert.equal(s.racks[0].breaker, 'home');
    assert.equal(s.racks[0].bnr, true);
    assert.equal(s.tally.home.bnr, 1);
    assert.equal(s.tally.home.racks, 1);
    assert.equal(s.tally.home.detailRacks, 0);
    assert.equal(s.tally.home.quickRacks, 1);
  });

  test('flags are checked: a break-and-run or golden break belongs to the breaker; golden is 9-ball only', () => {
    assert.equal(run(NINE, LAG('home'), RACK('away', { bnr: true })).racks[0].bnr, undefined);
    assert.equal(run(NINE, LAG('home'), RACK('away', { golden: true })).racks[0].golden, undefined);
    assert.equal(run(EIGHT, LAG('home'), RACK('home', { golden: true })).racks[0].golden, undefined);
    const g = run(NINE, LAG('home'), RACK('home', { golden: true }));
    assert.equal(g.racks[0].golden, true);
    assert.equal(g.racks[0].bnr, true, 'a golden break is a break-and-run');
    const r = run(NINE, LAG('home'), RACK('away', { runOut: true }));
    assert.equal(r.racks[0].runOut, true);
    assert.equal(run(NINE, LAG('home'), RACK('home', { bnr: true, runOut: true })).racks[0].runOut, undefined);
  });

  test('no lag: the quick rack may name its breaker (which fixes the break order)', () => {
    const s = run(NINE, RACK('home', { breaker: 'away' }));
    assert.equal(s.racks[0].breaker, 'away');
    assert.equal(s.firstBreaker, 'away');
    assert.equal(s.rack!.breaker, 'home');
    const u = run(NINE, RACK('home'));
    assert.equal(u.racks[0].breaker, null, 'unknown');
    assert.equal(run(NINE, RACK('home', { golden: true })).racks[0].breaker, 'home', 'a golden break names its breaker');
  });

  test('mixed: quick, detailed and quick racks in one match', () => {
    const s = run({ ...NINE, raceTo: 3 }, LAG('home'), RACK('home'), BREAK({ pots: [1] }), POT([9]), RACK('home'));
    assert.deepEqual(s.racks.map((r) => r.mode), ['quick', 'detail', 'quick']);
    assert.equal(s.racks[1].winner, 'away');
    assert.deepEqual(s.current, { home: 2, away: 1 });
    assert.equal(s.tally.away.detailRacks, 1);
    assert.equal(s.tally.home.detailRacks, 1);
  });

  test('RACK on a rack with detail awards it (flags ignored)', () => {
    const s = run(NINE, LAG('home'), BREAK({ pots: [1] }), POT([2]), RACK('away', { runOut: true }));
    assert.equal(s.racks[0].mode, 'detail');
    assert.equal(s.racks[0].how, 'awarded');
    assert.equal(s.racks[0].winner, 'away');
    assert.equal(s.racks[0].runOut, undefined);
    assert.deepEqual(s.racks[0].innings, { home: 1, away: 0 });
  });

  test('RACK needs a side', () => {
    const s = run(NINE, LAG('home'));
    assert.equal(pool.reducer(s, A('RACK')), s);
    assert.equal(pool.reducer(s, A('RACK', 'HOME' as Side)), s);
  });
});

describe('stalemate and playing out of turn', () => {
  test('1.13 / 5.9: a stalemate replays the rack with the same breaker; the foul count restarts', () => {
    const s = run(NINE, LAG('home'), BREAK({ pots: [1] }), FOUL('scratch'), A('STALEMATE'));
    assert.equal(s.rack!.phase, 'break');
    assert.equal(s.rack!.breaker, 'home');
    assert.deepEqual(s.rack!.table, range(1, 9));
    assert.deepEqual(s.rack!.fouls, { home: 0, away: 0 });
    assert.equal(s.racks.length, 0);
    assert.equal(s.tally.home.fouls, 1, 'the foul happened');
    assert.equal(pool.reducer(run(NINE, LAG('home')), A('STALEMATE')).rack!.reracks, 0, 'nothing to replay before the break');
  });

  test('3.12: a foul by the athlete who played out of turn is charged to them; the other keeps the table with ball in hand', () => {
    const s = run(NINE, LAG('home'), BREAK({ pots: [] }), FOUL('outOfTurn', {}, 'home'));
    assert.equal(s.tally.home.foulsBy.outOfTurn, 1);
    assert.equal(s.rack!.fouls.home, 1);
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, true);
    assert.equal(s.rack!.inn.away, 1);
  });

  test('any other shot by the side not at the table is ignored', () => {
    const s = run(NINE, LAG('home'), BREAK({ pots: [] }));
    for (const a of [POT([1], {}, 'home'), MISS('home'), SAFE(undefined, 'home'), FOUL('scratch', {}, 'home'), PUSH({}, 'home')]) assert.equal(pool.reducer(s, a), s, a.type);
    assert.notEqual(pool.reducer(s, MISS('away')), s);
  });
});

describe('stats (POOL_DESIGN §5)', () => {
  test('break-and-run, run-out, innings per rack, balls on the break, balls pocketed', () => {
    const s = run({ ...NINE, raceTo: 5 }, LAG('home'),
      BREAK({ pots: [1, 2] }), POT([3]), POT([4, 9]), // rack 1: home break-and-run
      BREAK({ pots: [] }), POT([1]), POT([9]), // rack 2: away dry break, home runs out
      // rack 3: home breaks and misses; away pots the 1 and plays safe; home fouls; away wins in a 2nd visit
      BREAK({ pots: [5] }), MISS(), POT([1]), SAFE(), FOUL('scratch'), POT([9]));
    const st = poolStats(s);
    assert.equal(st.home.racks, 2);
    assert.equal(st.away.racks, 1);
    assert.equal(st.home.bnr, 1);
    assert.equal(st.home.runOuts, 1);
    assert.equal(st.away.runOuts, 0, 'away won rack 3 in a second visit');
    assert.equal(st.home.breaks, 2);
    assert.equal(st.home.breakPots, 3);
    assert.equal(st.away.dryBreaks, 1);
    assert.equal(st.home.potted, 5, 'rack 1: 3, 4, 9; rack 2: 1, 9');
    assert.equal(st.away.potted, 2);
    assert.equal(st.away.safeties, 1);
    assert.equal(st.home.fouls, 1);
    assert.equal(st.home.foulsBy.scratch, 1);
    assert.deepEqual(s.racks.map((r) => r.innings), [{ home: 1, away: 0 }, { home: 1, away: 1 }, { home: 2, away: 2 }]);
    assert.equal(st.home.innings, 4);
    assert.equal(st.home.detailRacks, 3);
    assert.equal(st.home.inningsPerRack, 1.33);
    assert.equal(st.away.inningsPerRack, 1);
    assert.equal(st.home.racksBroken, 2);
    assert.equal(st.home.racksWonOnBreak, 1);
    assert.equal(st.home.breakWinPct, 50);
  });

  test('fouls by kind; push-outs; an unknown kind is "other"', () => {
    const s = run(NINE, LAG('home'), BREAK({ pots: [] }), PUSH(), CHOOSE('play'), FOUL('jump'), FOUL('pushShot'), FOUL('nonsense'));
    const st = poolStats(s);
    assert.equal(st.away.pushOuts, 1);
    assert.equal(st.home.foulsBy.jump, 1);
    assert.equal(st.away.foulsBy.pushShot, 1);
    assert.equal(st.home.foulsBy.other, 1);
    assert.equal(st.home.fouls, 2);
  });

  test('8-ball: balls of the opponent\'s group are not credited; racks lost on the 8', () => {
    const s = run(EIGHT, LAG('home'), BREAK({ pots: [1] }), POT([2, 12]), POT([8]));
    const st = poolStats(s);
    assert.equal(st.home.potted, 1);
    assert.equal(st.home.eightLosses, 1);
    assert.equal(st.home.breakPots, 1);
  });

  test('stats of a match with sets: sets won', () => {
    const s = run({ ...NINE, raceTo: 1, setsToWin: 2 }, LAG('home'), RACK('home'), RACK('home'));
    assert.equal(poolStats(s).home.setsWon, 2);
  });
});

describe('replay, undo and robustness', () => {
  const LOG: ScoreAction[] = stampLog(NINE, [LAG('home'), BREAK({ pots: [1] }), POT([2]), MISS(), FOUL('scratch'), POT([3, 4]), SAFE(), PUSH(),
    POT([5]), MISS(), POT([5]), POT([9]), BREAK({ pots: [] }), PUSH(), CHOOSE('pass'), POT([1, 2]), MISS(), FOUL('wrongBall', { pots: [9] }), RACK('home'), RACK('away')]);

  test('the same log always gives the same state, also through JSON (the stored event log)', () => {
    const a = pool.replay(NINE, LOG);
    const b = pool.replay(NINE, JSON.parse(JSON.stringify(LOG)));
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'the state is plain JSON');
  });

  test('undo = replay without the newest event; redo gives the same state — across rack boundaries too', () => {
    for (let i = 1; i <= LOG.length; i++) {
      const before = pool.replay(NINE, LOG.slice(0, i - 1));
      const after = pool.replay(NINE, LOG.slice(0, i));
      assert.deepEqual(pool.reducer(before, LOG[i - 1]), after, `event ${i}`);
    }
  });

  test('the reducer never mutates its input', () => {
    const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
    let s = deepFreeze(pool.createInitialState(NINE));
    for (const a of LOG) s = deepFreeze(pool.reducer(s, deepFreeze(structuredClone(a))));
    assert.ok(s.racks.length >= 1);
  });

  test('malformed and unknown actions are ignored (same state back)', () => {
    const s = pool.replay(NINE, [LAG('home'), BREAK({ pots: [1] })]);
    const bad: unknown[] = [null, undefined, 42, 'POT', {}, { type: 7 }, { type: 'UNDO' }, { type: 'STAT_ADJUST' }, { type: 'NOPE' },
      { type: 'POT', side: 'home', payload: 'x' }, { type: 'POT', side: 'home', payload: { pots: '3' } }, { type: 'POT', side: 'home', payload: { pots: ['3'] } },
      { type: 'POT', side: 'home', payload: { pots: [null] } }, { type: 'CHOOSE', payload: { choice: 'play' } }, { type: 'POT', side: 'both', payload: { pots: [2] } },
      { type: '__proto__' }, { type: 'constructor' }, { type: 'toString' }];
    for (const a of bad) assert.equal(pool.reducer(s, a as ScoreAction), s, JSON.stringify(a));
  });

  test('a foul kind named like an Object property is just "other"', () => {
    const s = pool.replay(NINE, stampLog(NINE, [LAG('home'), BREAK({ pots: [1] }), FOUL('constructor'), FOUL('__proto__'), FOUL('toString')]));
    assert.equal(s.tally.home.foulsBy.other, 2, 'home: "constructor" and "toString"');
    assert.equal(s.tally.away.foulsBy.other, 1);
    assert.equal(Object.getPrototypeOf(s.tally.home.foulsBy), Object.prototype);
    assert.equal(Object.keys(s.tally.home.foulsBy).includes('constructor'), false);
  });

  test('IDs only: names and other strings in a payload never reach the state', () => {
    const named: ScoreAction[] = [
      { type: 'LAG', side: 'home', payload: { breaks: 'home', name: 'Asha Rao' }, attribution: { playerId: 'p1', stat: 'lag', playerName: 'Asha Rao' } },
      { type: 'BREAK', payload: { pots: [1], by: 'Asha Rao', note: 'Asha Rao broke' } },
      { type: 'POT', payload: { pots: [2], shooter: 'Asha Rao', calledPocket: 'Asha Rao' }, attribution: { playerId: 'p1', stat: 'potted', playerName: 'Asha Rao' } },
      { type: 'FOUL', payload: { kind: 'Asha Rao' } },
      { type: 'RACK', side: 'away', payload: { breaker: 'Asha Rao', winnerName: 'Asha Rao' } },
    ];
    const s = pool.replay(NINE, stampLog(NINE, named));
    assert.equal(JSON.stringify(s).includes('Asha'), false);
    assert.equal(JSON.stringify(s).includes('p1'), false, 'no player ids either: sides only');
  });
});

describe('breaks (docs/security/breaks/pool-engine.md)', () => {
  const NINE_BROKEN = () => pool.replay(NINE, [LAG('home'), BREAK({ pots: [1] })]);
  const proto = Object.prototype as Record<string, unknown>;

  test('#5: payload, action and config fields are read as own properties only (no prototype chain, no pollution)', () => {
    const s = NINE_BROKEN();
    assert.equal(pool.reducer(s, { type: 'POT', side: 'home', payload: Object.create({ pots: [2] }) }), s, 'an inherited "pots"');
    const t10 = pool.replay(TEN, [LAG('home'), BREAK({ pots: [1] })]);
    const lit = Object.assign(Object.create({ called: false }), { pots: [2] });
    assert.equal(pool.reducer(t10, { type: 'POT', side: 'home', payload: lit }).rack!.pending, null, 'an inherited "called: false"');
    const action = Object.create({ type: 'RACK', side: 'away' });
    assert.equal(pool.reducer(s, action as ScoreAction), s, 'an inherited action type / side');
    try {
      proto.illegal = true; proto.raceTo = 1; proto.game = 'ten';
      const e = pool.replay(EIGHT, [LAG('home'), BREAK({})]);
      assert.equal(e.rack!.pending, null, 'Object.prototype.illegal');
      const f = pool.createInitialState({});
      assert.equal(f.raceTo, 5, 'Object.prototype.raceTo');
      assert.equal(f.game, 'eight', 'Object.prototype.game');
    } finally { delete proto.illegal; delete proto.raceTo; delete proto.game; }
  });

  test('#24: a corrupted or foreign state given to the reducer comes back unchanged — no throw', () => {
    const s = NINE_BROKEN();
    const r = s.rack!;
    const bad: unknown[] = [
      { ...s, tally: undefined }, { ...s, tally: { home: s.tally.home } }, { ...s, racks: null }, { ...s, sets: 'x' },
      { ...s, current: undefined }, { ...s, setsWon: null }, { ...s, game: 'snooker' }, { ...s, v: undefined },
      { ...s, rack: { ...r, table: 'x' } }, { ...s, rack: { ...r, fouls: undefined } }, { ...s, rack: { ...r, inn: null } },
      { ...s, tally: { ...s.tally, home: { ...s.tally.home, foulsBy: null } } }, [], 'state',
    ];
    const acts: ScoreAction[] = [POT([2]), FOUL('scratch'), MISS(), SAFE(), RACK('home'), A('STALEMATE'), PUSH(), BREAK({ pots: [] }, 'home')];
    for (const st of bad) for (const a of acts) {
      let out: unknown;
      assert.doesNotThrow(() => { out = pool.reducer(st as pool.PoolState, a); }, `${a.type} on ${JSON.stringify(st)?.slice(0, 50)}`);
      assert.equal(out, st);
    }
  });

  test('#6: a payload, action or config whose property access throws never makes the engine throw', () => {
    const s = NINE_BROKEN();
    const boom = () => { throw new Error('boom'); };
    const hostile: unknown[] = [
      { type: 'POT', side: 'home', payload: { get pots() { return boom(); } } },
      { type: 'POT', side: 'home', payload: { pots: new Proxy([2], { get: boom }) } },
      { type: 'POT', side: 'home', payload: new Proxy({}, { ownKeys: boom }) },
      { type: 'FOUL', side: 'home', payload: { kind: 'scratch', get off() { return boom(); } } },
      new Proxy({}, { get: boom, getOwnPropertyDescriptor: boom, has: boom }),
      { get type() { return boom(); } },
    ];
    for (const a of hostile) {
      let out: unknown;
      assert.doesNotThrow(() => { out = pool.reducer(s, a as ScoreAction); });
      assert.equal(out, s);
    }
    const cfgs: unknown[] = [
      { game: { toString: boom } }, { raceTo: { valueOf: boom } }, { get game() { return boom(); } },
      new Proxy({}, { ownKeys: boom }), { game: Symbol('x') },
    ];
    for (const c of cfgs) {
      let st: pool.PoolState | undefined;
      assert.doesNotThrow(() => { st = pool.createInitialState(c as Record<string, unknown>); });
      assert.equal(st!.v, 1);
      assert.ok(st!.rack);
    }
  });

  test('#9: a state value is never used as a raw object key ("__proto__" game → "Pool", not "[object Object]")', () => {
    const s = pool.createInitialState(NINE);
    for (const game of ['__proto__', 'constructor', 'toString', 'snooker']) {
      const line = pool.summary({ ...s, game } as unknown as pool.PoolState).statusLine;
      assert.equal(line, 'Pool · Rack 1', game);
    }
  });

  test('#25: the readers turn a hostile snapshot into clean numbers and text — never NaN, Infinity, "undefined" or a throw', () => {
    const hostile: unknown[] = [
      { sets: [], current: { home: NaN, away: Infinity }, game: '__proto__', racks: [], setsToWin: 1, raceTo: 'x' },
      { sets: [[1]], current: {}, ended: true, winner: 'home', setsToWin: 1 },
      { sets: ['a', null, [2, 'b']], current: { home: 1, away: 0 }, setsToWin: 3, setsWon: { home: NaN } },
      { sets: [[2, 1], [-1, 1e309]], current: { home: -1, away: 1.5 }, setsWon: { home: 'x', away: 2 }, ended: true, winner: 'away', setsToWin: 2 },
      { sets: [], current: { home: 0, away: 0 }, tally: { home: { racks: NaN, innings: 'x', detailRacks: Infinity, racksBroken: -2, foulsBy: { scratch: NaN, __proto__: 3, bogus: 2 } }, away: null } },
      { sets: {}, current: [], rack: 'x' },
    ];
    const dirty = /NaN|Infinity|undefined|null|\[object/;
    for (const h of hostile) {
      const st = h as pool.PoolState;
      const label = JSON.stringify(h).slice(0, 60);
      const sum = pool.summary(st);
      assert.match(sum.homeScore, /^\d+$/, label);
      assert.match(sum.awayScore, /^\d+$/, label);
      assert.doesNotMatch(`${sum.statusLine} ${sum.detailLine ?? ''}`, dirty, label);
      assert.match(pool.scoreLine(st), /^(\d+-\d+(, \d+-\d+)*)?$/, label);
      const ls = pool.lineScore(st);
      if (ls) for (const n of [ls.won.home, ls.won.away, ls.toWin, ...ls.done.flatMap((c) => [c.home, c.away]), ...(ls.current ? [ls.current.home, ls.current.away] : [])]) assert.ok(Number.isInteger(n) && n >= 0, `${label} lineScore ${n}`);
      const r = pool.result(st);
      if (r) assert.ok(Number.isInteger(r.home) && Number.isInteger(r.away) && r.home >= 0 && r.away >= 0, `${label} result`);
      const ps = poolStats(st);
      for (const sd of ['home', 'away'] as const) {
        for (const [k, v] of Object.entries(ps[sd])) {
          if (k === 'foulsBy') { for (const [fk, fv] of Object.entries(v as object)) { assert.ok(pool.FOUL_KINDS.includes(fk as pool.FoulKind), `${label} foul kind ${fk}`); assert.ok(Number.isInteger(fv) && fv >= 0); } continue; }
          if (v !== undefined) assert.ok(Number.isFinite(v) && (v as number) >= 0, `${label} ${sd}.${k}=${v}`);
        }
      }
    }
  });

  test('#10: an "illegal break" foul exists only on a break — during play it is recorded as "other"', () => {
    const s = step(NINE_BROKEN(), FOUL('illegalBreak'));
    assert.equal(s.tally.home.foulsBy.illegalBreak, undefined);
    assert.equal(s.tally.home.foulsBy.other, 1);
    const p = step(pool.replay(NINE, [LAG('home'), BREAK({ pots: [] })]), PUSH({ foul: 'illegalBreak' }));
    assert.equal(p.tally.away.foulsBy.illegalBreak, undefined, 'nor on a push-out');
    assert.equal(pool.replay(NINE, [LAG('home'), BREAK({ foul: 'illegalBreak' })]).tally.home.foulsBy.illegalBreak, 1, 'on the break it stays');
  });

  test('#12: a quick RACK names its rack; a duplicate (double tap, two phones) or any action for an earlier rack is ignored', () => {
    const s = pool.replay({ ...NINE, raceTo: 5 }, [LAG('home')]);
    assert.equal(pool.reducer(s, RACK('home')), s, 'no rack number: ignored');
    for (const bad of ['1', 0, -1, 1.5, NaN, null, Infinity]) assert.equal(pool.reducer(s, RACK('home', { rack: bad })), s, String(bad));
    const one = pool.reducer(s, RACK('home', { rack: 1 }));
    assert.equal(one.racks.length, 1);
    assert.equal(pool.reducer(one, RACK('home', { rack: 1 })), one, 'the duplicate of rack 1');
    const two = pool.reducer(one, BREAK({ pots: [] }, undefined));
    assert.equal(two.rack!.shooter, 'home', 'rack 2: away broke dry');
    assert.equal(pool.reducer(two, A('MISS', 'home', { rack: 1 })), two, 'a straggler from rack 1');
    assert.notEqual(pool.reducer(two, A('MISS', 'home', { rack: 2 })), two);
    // a correction voided a rack end: the later taps name a later rack and still apply
    assert.equal(pool.reducer(one, RACK('away', { rack: 3 })).racks.length, 2);
  });

  test('#13: a shot names the side at the table — a side-less shot is ignored, so a duplicate can never pass the turn twice', () => {
    const s = pool.replay(NINE, [LAG('home'), BREAK({ pots: [] })]);
    for (const a of [POT([1]), MISS(), SAFE(), FOUL('scratch'), PUSH()]) assert.equal(pool.reducer(s, a), s, `${a.type} with no side`);
    const once = pool.reducer(s, MISS('away'));
    assert.equal(once.rack!.shooter, 'home');
    assert.equal(pool.reducer(once, MISS('away')), once, 'the duplicate from a second phone');
    const f = pool.reducer(s, FOUL('scratch', {}, 'away'));
    assert.equal(pool.reducer(f, FOUL('scratch', {}, 'away')), f, 'a duplicated foul');
  });
});
