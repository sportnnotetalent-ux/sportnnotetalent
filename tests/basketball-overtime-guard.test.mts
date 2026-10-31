/**
 * MVP B1 — "Start Overtime" must not end a tied game early. With a game
 * clock, the reducer refuses START_OVERTIME while time is left in the period.
 * Gated: only a START_OVERTIME that carries `at` (sent by the fixed scorer
 * screen) is checked, so logs saved before the fix replay as they were.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import { init, reducer, type BasketballState } from '../src/sports/basketball/engine.ts';

type Side = 'home' | 'away';
const run = (s: BasketballState, ...acts: ScoreAction[]) => acts.reduce(reducer, s);
const pts = (side: Side, n: number): ScoreAction => ({ type: 'SCORE', side, payload: { points: n, quarter: 1, minute: 0 } });
const X3 = { regPeriods: 1, periodMinutes: 10, overtimeMinutes: 0, targetPoints: 21, winBy: 1, foulsForBonus: 6, foulsToFoulOut: 0, otFoulsCarry: true, techIsTeamFoul: true, timeouts: 1, gameClock: true, otTarget: 2, foulLadder: '3x3' };
const FIBA = { regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 4, overtimeMinutes: 5, timeoutRule: 'fiba', gameClock: true };
const T0 = 1_700_000_000_000;
const tip: ScoreAction = { type: 'KICKOFF', payload: { at: T0 } };
const ot = (at: number): ScoreAction => ({ type: 'START_OVERTIME', payload: { at } });

describe('3×3: overtime only once time is up', () => {
  test('2-2 with 6:00 left: START_OVERTIME is refused', () => {
    const s = run(init(X3), tip, pts('home', 2), pts('away', 2));
    const after = run(s, ot(T0 + 4 * 60_000));
    assert.equal(after.quarter, 1);
    // the next away 2-pointer does not end the game
    assert.equal(run(after, pts('away', 2)).ended, false);
  });

  test('0-0 at tip-off: refused', () => {
    assert.equal(run(init(X3), tip, ot(T0 + 1000)).quarter, 1);
  });

  test('level at 0:00 (clock ran out): overtime starts', () => {
    const s = run(init(X3), tip, pts('home', 2), pts('away', 2));
    assert.equal(run(s, ot(T0 + 10 * 60_000)).quarter, 2);
  });

  test('level at 0:00 after the clock was stopped there: overtime starts', () => {
    const s = run(init(X3), tip, pts('home', 2), pts('away', 2), { type: 'CLOCK', payload: { run: false, at: T0 + 10 * 60_000 } });
    assert.equal(run(s, ot(T0 + 11 * 60_000)).quarter, 2);
  });
});

describe('5×5: Q4 tie mid-quarter', () => {
  const toQ4 = () => run(init(FIBA), tip, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'KICKOFF', payload: { at: T0 } });
  test('refused with 5:00 left; the clock is not reset', () => {
    const s = toQ4();
    const after = run(s, ot(T0 + 5 * 60_000));
    assert.equal(after.quarter, 4);
    assert.deepEqual(after.gc, s.gc);
  });
  test('allowed at 0:00', () => {
    assert.equal(run(toQ4(), ot(T0 + 10 * 60_000)).quarter, 5);
  });
});

describe('no game clock / old logs', () => {
  test('no game clock: overtime when level at the end of Q4, as before', () => {
    const s = run(init({ regPeriods: 4 }), { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' });
    assert.equal(run(s, ot(T0)).quarter, 5);
  });
  test('an old START_OVERTIME (no `at`) replays as it was saved', () => {
    const s = run(init(X3), tip, pts('home', 2), pts('away', 2));
    assert.equal(run(s, { type: 'START_OVERTIME' }).quarter, 2);
  });
  test('3×3 overtime itself is untimed: a second OT is still allowed when level', () => {
    // OT1 (first to 2) can't end level by scoring, but the guard must not block it
    const s = run(init(X3), tip, ot(T0 + 10 * 60_000));
    assert.equal(s.quarter, 2);
    assert.equal(run(s, ot(T0 + 11 * 60_000)).quarter, 3);
  });
});
