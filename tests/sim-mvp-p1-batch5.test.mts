/**
 * Quality mandate step 6 for MVP P1 batch 5 (docs/security/breaks/mvp-p1-batch5.md):
 * 500 single-period football games (random length, goals, and a level
 * knockout sometimes going to extra time) and 500 two-half games: a single
 * period never has a "2nd half" minute, and ends from the period; two-half
 * games map minutes exactly as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, halfOfMinute, halfEndOf, footballComplete } from '../src/sports/football/engine.ts';
import { goalAction } from '../src/sports/football/actions.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 29;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };

test('500 single-period games', () => {
  for (let g = 0; g < 500; g++) {
    const hm = 10 + rnd(50), et = 3 + rnd(10);
    const ko = rnd(3) === 0;
    let s = init({ halfMinutes: hm, extraTimeMinutes: et, periods: 1, decider: ko ? 'extra_time' : 'none' });
    s = reducer(s, { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
    for (let i = 0; i < rnd(5); i++) s = reducer(s, goalAction(rnd(2) ? 'home' : 'away', { id: `p${i}` }, 'open'));
    for (let m = 0; m <= hm + et * 2; m++) assert.notEqual(halfOfMinute(m, s), 2, `minute ${m} called 2nd half`);
    assert.equal(halfEndOf(3, s), hm + et);
    s = reducer(s, { type: 'END', payload: { at: 2 } } as ScoreAction);
    if (ko && s.home === s.away) {
      const et1 = reducer(s, { type: 'START_EXTRA_TIME' } as ScoreAction);
      assert.equal(et1.half, 3, 'level knockout: extra time from the period');
    } else assert.equal(footballComplete(s), true);
  }
});

test('500 two-half games: minutes map as before', () => {
  for (let g = 0; g < 500; g++) {
    const hm = 10 + rnd(50), et = 3 + rnd(10);
    const s = init({ halfMinutes: hm, extraTimeMinutes: et });
    const m = rnd(2 * hm + 2 * et + 1);
    const want = m <= hm ? 1 : m <= 2 * hm ? 2 : m <= 2 * hm + et ? 3 : 4;
    assert.equal(halfOfMinute(m, s), want);
    assert.deepEqual([1, 2, 3, 4].map((h) => halfEndOf(h as 1, s)), [hm, 2 * hm, 2 * hm + et, 2 * hm + 2 * et]);
  }
});
