/**
 * Basketball scoring engine — the ground-ready capture set (go-live sport audit).
 * Free throws (made/miss/and-one), shooting-foul flow, foul types & team-foul
 * bonus, steals/blocks/turnovers, timeouts, on-court subs, and remove-reversal.
 * IDs-only scoring: plays are scored the way the controls send them
 * (basketball/actions.ts — the player by id) and checked by id.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, teamFoulsThisQuarter, inBonus, timeoutsUsed, onCourtIds, onCourtNames, isFouledOut, foulCount,
  type BasketballState,
} from '../src/sports/basketball/engine.ts';
import { ejectAction, foulAction, freeThrowAction, lineupAction, reboundAction, scoreAction, statAction, subAction, timeoutAction } from '../src/sports/basketball/actions.ts';
import type { FoulType } from '../src/sports/basketball/events.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const who = (id?: string) => (id ? { id } : undefined);
const scoreAct = (side: Side, points: number, id?: string): ScoreAction => scoreAction(side, points, who(id));
const ft = (side: Side, made: boolean, id?: string): ScoreAction => freeThrowAction(side, made, who(id));
const foul = (side: Side, id: string, foulType: FoulType = 'personal'): ScoreAction => foulAction(side, { id }, foulType);
/** a player, by side and id (foul-out / ejection are per side and id) */
const of = (side: Side, pid: string) => ({ side, pid });

describe('basketball — scoring & free throws', () => {
  test('field goals add 1/2/3', () => {
    const s = run(init(), scoreAct('home', 2), scoreAct('away', 3), scoreAct('home', 1));
    assert.equal(s.home, 3);
    assert.equal(s.away, 3);
  });

  test('made free throw scores 1, missed scores 0 but is logged', () => {
    const s = run(init(), ft('home', true, 'A'), ft('home', false, 'A'));
    assert.equal(s.home, 1);
    const fts = s.events.filter((e) => e.type === 'freethrow');
    assert.equal(fts.length, 2);
    assert.deepEqual(fts.map((e) => e.made), [true, false]);
    assert.deepEqual(fts.map((e) => e.pid), ['A', 'A']);
  });

  test('and-one: basket + one made free throw = 3', () => {
    const s = run(init(), scoreAct('home', 2, 'A'), ft('home', true, 'A'));
    assert.equal(s.home, 3);
  });

  test('shooting foul awards free throws to the other team', () => {
    // home fouls (shooting) → away shoots two, makes both
    const s = run(init(), foul('home', 'X', 'shooting'), ft('away', true, 'Y'), ft('away', true, 'Y'));
    assert.equal(s.away, 2);
    assert.equal(s.home, 0);
    assert.equal(s.events.find((e) => e.type === 'foul')?.foulType, 'shooting');
  });
});

describe('basketball — fouls & bonus', () => {
  test('technical fouls do not count toward the team-foul bonus', () => {
    const s = run(init(), foul('home', 'A'), foul('home', 'B'), foul('home', 'C', 'technical'));
    assert.equal(teamFoulsThisQuarter(s, 'home'), 2); // technical excluded
  });

  test('team reaches the bonus once the opponent hits the foul limit', () => {
    const base = init({ foulsForBonus: 2 });
    const s = run(base, foul('home', 'A'), foul('home', 'B'));
    assert.equal(inBonus(s, 'away'), true); // away shoots because home fouled twice
    assert.equal(inBonus(s, 'home'), false);
  });

  test('a fouled-out player cannot score further', () => {
    const s0 = run(init({ foulsToFoulOut: 2 }), foul('home', 'A'), foul('home', 'A'));
    assert.equal(isFouledOut(s0, undefined, of('home', 'A')), true);
    const s1 = run(s0, scoreAct('home', 2, 'A'));
    assert.equal(s1.home, 0); // blocked
  });
});

describe('basketball — stats, timeouts, subs', () => {
  test('steal / block / turnover are logged', () => {
    const s = run(init(), statAction('home', 'STEAL', { id: 'A' }), statAction('home', 'BLOCK', { id: 'B' }), statAction('away', 'TURNOVER', { id: 'C' }));
    assert.deepEqual(s.events.filter((e) => ['steal', 'block', 'turnover'].includes(e.type)).map((e) => e.pid), ['A', 'B', 'C']);
  });

  test('timeouts are counted per side', () => {
    const s = run(init(), timeoutAction('home'), timeoutAction('home'), timeoutAction('away'));
    assert.equal(timeoutsUsed(s, 'home'), 2);
    assert.equal(timeoutsUsed(s, 'away'), 1);
  });

  test('on-court list follows the starting five and substitutions (by id)', () => {
    const s = run(init(),
      lineupAction('home', ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id }))),
      subAction('home', { id: 'A' }, { id: 'F' }));
    assert.deepEqual(onCourtIds(s, 'home'), ['F', 'B', 'C', 'D', 'E']);
    assert.deepEqual(s.court, { home: ['A', 'B', 'C', 'D', 'E'] });
  });

  test('an older log: the five and the subs by name, replayed as they were', () => {
    const s = run(init(),
      { type: 'SET_LINEUP', payload: { home: ['A', 'B', 'C', 'D', 'E'] } },
      { type: 'SUB', side: 'home', payload: { offName: 'A', onName: 'F' } });
    assert.deepEqual(onCourtNames(s, 'home'), ['F', 'B', 'C', 'D', 'E']);
  });
});

describe('basketball — corrections & game end', () => {
  test('removing a made free throw takes the point back off the board', () => {
    const s0 = run(init(), ft('home', true, 'A'));
    assert.equal(s0.home, 1);
    const id = s0.events.find((e) => e.type === 'freethrow')!.id;
    const s1 = reducer(s0, { type: 'REMOVE_EVENT', side: 'home', payload: { id } });
    assert.equal(s1.home, 0);
  });

  test('removing a missed free throw does not change the score', () => {
    const s0 = run(init(), scoreAct('home', 2), ft('home', false, 'A'));
    const id = s0.events.find((e) => e.type === 'freethrow')!.id;
    const s1 = reducer(s0, { type: 'REMOVE_EVENT', side: 'home', payload: { id } });
    assert.equal(s1.home, 2);
  });

  test('a first-to-N game ends on the clinching basket', () => {
    let s = init({ targetPoints: 11, winBy: 2, regPeriods: 1 });
    for (let i = 0; i < 5; i++) s = reducer(s, scoreAct('home', 2)); // 10
    assert.equal(s.ended, false);
    s = reducer(s, scoreAct('home', 2)); // 12, lead ≥ 2
    assert.equal(s.ended, true);
    assert.equal(s.home, 12);
  });
});

import { pointsOf } from '../src/sports/basketball/events.ts';

describe('basketball — a real-game-style sequence replayed play-by-play', () => {
  // Q1 (home tips off):
  //   H1 hits a 3 → 3-0 · A1 hits a 2 → 3-2 · shooting foul on H3, A1 makes both
  //   free throws → 3-4 · H2 defensive rebound · H1 assist · A2 steal · home timeout
  //   · H1 hits a 2 → 5-4 · end of Q1
  const g = run(init(),
    { type: 'KICKOFF', payload: { at: 1 } },
    scoreAct('home', 3, 'H1'),
    scoreAct('away', 2, 'A1'),
    foul('home', 'H3', 'shooting'),
    ft('away', true, 'A1'), ft('away', true, 'A1'),
    reboundAction('home', { id: 'H2' }, 'def'),
    statAction('home', 'ASSIST', { id: 'H1' }),
    statAction('away', 'STEAL', { id: 'A2' }),
    timeoutAction('home'),
    scoreAct('home', 2, 'H1'),
    { type: 'NEXT_QUARTER' },
  );

  const pts = (id: string) => g.events.filter((e) => e.pid === id).reduce((n, e) => n + pointsOf(e), 0);

  test('the line score is right and the game advanced to Q2', () => {
    assert.deepEqual([g.home, g.away], [5, 4]);
    assert.equal(g.quarter, 2);
  });

  test('box-score points per player include field goals AND free throws', () => {
    assert.equal(pts('H1'), 5); // a 3 and a 2
    assert.equal(pts('A1'), 4); // a 2 + two made free throws
  });

  test('non-scoring stats and the timeout are recorded', () => {
    assert.equal(g.events.filter((e) => e.type === 'rebound').length, 1);
    assert.equal(g.events.filter((e) => e.type === 'assist').length, 1);
    assert.equal(g.events.filter((e) => e.type === 'steal').length, 1);
    assert.equal(foulCount(g, undefined, of('home', 'H3')), 1);
    assert.equal(timeoutsUsed(g, 'home'), 1);
  });
})

import { isEjected, isPlayerOut } from '../src/sports/basketball/engine.ts';

describe('basketball — player ejection (Tier-1 gap fix)', () => {
  test('an ejected player is out for the game and cannot score, even under the foul limit', () => {
    let s = run(init(), foul('home', 'E'), ejectAction('home', { id: 'E' }));
    assert.equal(isEjected(s, undefined, of('home', 'E')), true);
    assert.equal(isPlayerOut(s, undefined, of('home', 'E')), true); // out, though only 1 personal foul
    s = run(s, scoreAct('home', 2, 'E'));
    assert.equal(s.home, 0); // blocked — ejected
  });

  test('removing the eject event reinstates the player', () => {
    let s = run(init(), ejectAction('away', { id: 'F' }));
    const id = s.events.find((e) => e.type === 'eject')!.id;
    s = reducer(s, { type: 'REMOVE_EVENT', side: 'away', payload: { id } });
    assert.equal(isEjected(s, undefined, of('away', 'F')), false);
  });
})
