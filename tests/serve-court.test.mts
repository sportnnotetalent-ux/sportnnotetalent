/** Doubles serve diagram (2026-10-22): who serves from which half to whom,
 *  derived from the score — tennis, badminton, pickleball. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import { setServeCourt, badmintonServeCourt, pickleballServeCourt, type ServeCourtView, type CourtRole } from '../src/sports/serveCourt.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const R = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const P = (side: 'home' | 'away'): ScoreAction => ({ type: 'POINT', side });
const run = <S,>(red: (s: S, a: ScoreAction) => S, s0: S, acts: ScoreAction[]) => acts.reduce(red, s0);
const who = (v: ServeCourtView | null, role: CourtRole) => v?.players.find((p) => p.role === role);
const tc = (s: tennis.TennisState) => setServeCourt('tennis', s, R, tennis.inTiebreak(s));

describe('tennis doubles', () => {
  test('nothing in singles, nothing before the toss', () => {
    assert.equal(tc(run(tennis.reducer, tennis.init(), [{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }])), null);
    assert.equal(tc(tennis.init({ playersPerSide: 2 })), null);
  });

  test('server in the deuce court at 0-0, ad court at 15-0; receiver diagonal', () => {
    let s = run(tennis.reducer, tennis.init({ playersPerSide: 2 }), [{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }]);
    let v = tc(s);
    assert.deepEqual([v?.serverSide, v?.half], ['home', 'right']);
    assert.deepEqual([who(v, 'server')?.playerId, who(v, 'serverPartner')?.half], ['h1', 'left']);
    // receiving order not picked yet → receiver not named
    assert.equal(v?.receiverKnown, false);
    assert.equal(who(v, 'receiver')?.playerId, undefined);
    // away picks a2 for the deuce court
    s = tennis.reducer(s, { type: 'SET_SERVE_ORDER', payload: { recvSide: 'away', recvSlot: 1 } });
    v = tc(s);
    assert.deepEqual([who(v, 'receiver')?.playerId, who(v, 'receiver')?.half, who(v, 'receiverPartner')?.playerId], ['a2', 'right', 'a1']);
    s = tennis.reducer(s, P('home')); // 15-0 → ad court
    v = tc(s);
    assert.equal(v?.half, 'left');
    assert.equal(who(v, 'receiver')?.playerId, 'a1');
  });

  test('the receiving pick is display only: the score is unchanged', () => {
    const base = run(tennis.reducer, tennis.init({ playersPerSide: 2 }), [{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }, P('home'), P('away')]);
    const picked = tennis.reducer(base, { type: 'SET_SERVE_ORDER', payload: { recvSide: 'away', recvSlot: 0 } });
    assert.deepEqual([picked.pts, picked.games, picked.events.length], [base.pts, base.games, base.events.length]);
  });

  test('game 2: the other pair serves, from the deuce court', () => {
    const s = run(tennis.reducer, tennis.init({ playersPerSide: 2 }), [{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }, P('home'), P('home'), P('home'), P('home')]);
    const v = tc(s);
    assert.deepEqual([v?.serverSide, v?.half, who(v, 'server')?.playerId], ['away', 'right', 'a1']);
  });
});

describe('badminton doubles (BWF Law 11)', () => {
  test('server switches courts on winning a rally; receiver stays', () => {
    let s = run(badminton.reducer, badminton.init({ playersPerSide: 2 }), [{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }]);
    let v = badmintonServeCourt(s, R);
    assert.deepEqual([v?.serverSide, v?.half, who(v, 'server')?.playerId, who(v, 'receiver')?.playerId], ['home', 'right', 'h1', 'a1']);
    s = badminton.reducer(s, P('home')); // 1-0: h1 serves again, now from the left
    v = badmintonServeCourt(s, R);
    assert.deepEqual([v?.half, who(v, 'server')?.playerId, who(v, 'receiver')?.playerId], ['left', 'h1', 'a2']);
  });
  test('nothing in singles', () => {
    assert.equal(badmintonServeCourt(badminton.init({}), R), null);
  });
});

describe('pickleball doubles (side-out)', () => {
  const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
  const CFG = { scoring: 'sideout', playersPerSide: 2, pointsPerGame: 11, winBy: 2, gamesToWin: 3 };
  test('start: the starter serves from the right to the right-court receiver, called 0-0-2', () => {
    const s = run(PICKLE.reducer, PICKLE.init(CFG), [{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }]);
    const v = pickleballServeCourt(s, R);
    assert.deepEqual([v?.serverSide, v?.half, v?.call, who(v, 'server')?.playerId, who(v, 'receiver')?.playerId], ['home', 'right', '0-0-2', 'h1', 'a1']);
  });
});
