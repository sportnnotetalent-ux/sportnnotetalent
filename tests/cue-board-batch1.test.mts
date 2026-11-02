/**
 * Cue & board batch 1 (docs/security/breaks/cue-board-batch1.md):
 *  - carrom: the "Queen covered by" answer is required on a played-out board
 *    (ICF format: Winner / Loser only; other formats keep "Not covered");
 *  - snooker: a "ball involved" chip sets the foul value to
 *    max(4, the ball on, the ball involved) (WPBSA S3 R11); manual override stays.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sports/carrom/engine.ts';
import * as S from '../src/sports/snooker/engine.ts';
import { potAction, foulAction, snookerPanel, foulValue, FOUL_BALLS } from '../src/sports/snooker/controls.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';

describe('carrom: the Queen answer is required (Q1–Q7)', () => {
  const icf = C.init({ preset: 'icf', foulScore: true });
  const casual = C.init({ preset: 'casual29' });

  test('Q1 — coins alone do not make a played-out board ready', () => {
    assert.equal(C.boardReady(icf, { penalty: false, coins: 3, queenBy: null }), false);
    assert.equal(C.boardReady(casual, { penalty: false, coins: 3, queenBy: null }), false);
    assert.equal(C.boardReady(icf, { penalty: false, coins: null, queenBy: 'winner' }), false);
    assert.equal(C.boardReady(icf, { penalty: false, coins: 3, queenBy: 'winner' }), true);
    assert.equal(C.boardReady(icf, { penalty: false, coins: 0, queenBy: 'loser' }), true);
  });

  test('Q2 — the ICF format offers Winner / Loser only; Not covered is not ready', () => {
    assert.equal(icf.icf, true);
    assert.deepEqual(C.queenChoices(icf), ['winner', 'loser']);
    assert.equal(C.boardReady(icf, { penalty: false, coins: 3, queenBy: 'none' }), false);
  });

  test('Q3 — a penalty board needs no Queen answer', () => {
    assert.equal(C.boardReady(icf, { penalty: true, coins: null, queenBy: null }), true);
  });

  test('Q5 — casual, custom and older formats keep Not covered', () => {
    assert.deepEqual(C.queenChoices(casual), ['winner', 'loser', 'none']);
    assert.deepEqual(C.queenChoices(C.init({ preset: 'custom' })), ['winner', 'loser', 'none']);
    assert.deepEqual(C.queenChoices(C.init({})), ['winner', 'loser', 'none']);
    assert.equal(C.boardReady(casual, { penalty: false, coins: 2, queenBy: 'none' }), true);
  });

  test('Q4 / Q6 — old boards (no queenBy) replay exactly as before', () => {
    const old = [
      { type: 'BOARD', side: 'home', payload: { coins: 4, queen: true } },
      { type: 'BOARD', side: 'away', payload: { coins: 2, queen: false } },
      { type: 'BOARD', side: 'home', payload: { coins: 1 } },
    ];
    const s = old.reduce((x, a) => C.reducer(x, a as never), icf);
    assert.deepEqual(s.current, { home: 4 + 3 + 1, away: 2 });
    assert.deepEqual(s.boards.map((b) => b.queenBy), [undefined, undefined, undefined]);
    // the board editor replays them unchanged
    const again = C.reducer(s, { type: 'EDIT_LOG', payload: { boards: C.boardInputs(s) } } as never);
    assert.deepEqual(again.current, s.current);
  });

  test('Q7 — the answer scores as before: Winner +3 under 22, 0 at 22+; Loser / Not covered 0', () => {
    const b = (s: C.CarromState, side: C.Side, coins: number, queenBy: C.QueenBy) =>
      C.reducer(s, { type: 'BOARD', side, payload: { coins, queen: queenBy === 'winner', queenBy } } as never);
    let s = b(icf, 'home', 5, 'winner');
    assert.equal(s.current.home, 8);
    s = b(s, 'home', 5, 'loser');
    assert.equal(s.current.home, 13);
    s = b(casual, 'away', 3, 'none');
    assert.equal(s.current.away, 3);
  });
});

describe('snooker: the foul value follows the ball involved (S1–S5)', () => {
  const init = () => S.createInitialState({});

  test('S1 — wrong ball first on the pink while on a red is 6', () => {
    const s = init();
    const p = snookerPanel(s)!;
    assert.equal(p.foul.min, 4);
    assert.equal(foulValue(p.foul.min, 'pink'), 6);
    assert.equal(foulValue(p.foul.min, 'black'), 7);
    assert.equal(foulValue(p.foul.min, 'blue'), 5);
    assert.deepEqual([...FOUL_BALLS], ['red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black']);
  });

  test('S2 — the ball involved never lowers the minimum', () => {
    assert.equal(foulValue(4, 'red'), 4);
    assert.equal(foulValue(4, 'yellow'), 4);
    assert.equal(foulValue(6, 'yellow'), 6); // the pink on in the clearance
    assert.equal(foulValue(7, 'red'), 7); // the re-spotted black
    assert.equal(foulValue(5, null), 5);
    assert.equal(foulValue(5, undefined), 5);
  });

  test('S3 / S5 — the value set from the ball reaches the score and the commentary', () => {
    let s = init();
    const a = foulAction(s, { value: foulValue(snookerPanel(s)!.foul.min, 'pink'), kind: 'wrongBall' })!;
    assert.equal((a.payload as { value: number }).value, 6);
    s = S.reducer(s, a as never);
    assert.equal(s.frame!.score.away, 6);
    const text = JSON.stringify(snookerFeed(s, { home: 'H', away: 'A' }));
    assert.match(text, /6 to A/);
  });

  test('S4 — old fouls (value only) replay identically', () => {
    const s0 = init();
    const log = [
      potAction(s0, 'red'),
    ];
    let s = S.reducer(s0, log[0] as never);
    s = S.reducer(s, potAction(s, 'pink') as never);
    const f = { type: 'FOUL', side: 'home', payload: { value: 4, kind: 'wrongBall', frame: 1 } };
    const a1 = S.reducer(s, f as never);
    const a2 = S.reducer(s, f as never);
    assert.deepEqual(a1, a2);
    assert.equal(a1.frame!.score.away, 4);
  });
});
