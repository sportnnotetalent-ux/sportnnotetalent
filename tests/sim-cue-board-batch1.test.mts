/**
 * Cue & board batch 1 — simulation (quality mandate step 6): 600 random carrom
 * boards and 600 random snooker fouls through the new pure rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sports/carrom/engine.ts';
import * as S from '../src/sports/snooker/engine.ts';
import { foulAction, snookerPanel, foulValue, FOUL_BALLS } from '../src/sports/snooker/controls.ts';

let seed = 20261102;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const SIDES: C.Side[] = ['home', 'away'];
const QB: Array<C.QueenBy | null> = ['winner', 'loser', 'none', null];

test('800 carrom boards: never ready without a Queen answer; ICF never takes "none"; scores follow the answer', () => {
  for (let m = 0; m < 40; m++) {
    const icf = rnd(2) === 0;
    let s = C.init({ preset: icf ? 'icf' : 'casual29', foulScore: rnd(2) === 0 });
    for (let i = 0; i < 20 && !s.ended; i++) {
      const penalty = rnd(10) === 0;
      const coins = rnd(11) === 10 ? null : rnd(10);
      const queenBy = QB[rnd(4)];
      const ready = C.boardReady(s, { penalty, coins, queenBy });
      const expect = penalty || (coins != null && queenBy != null && !(icf && queenBy === 'none'));
      assert.equal(ready, expect, JSON.stringify({ icf, penalty, coins, queenBy }));
      if (!ready) continue;
      const side = SIDES[rnd(2)];
      const before = s.current[side];
      const queen = queenBy === 'winner';
      const want = C.boardValue(s, before, { coins: coins ?? 0, queen, penalty });
      s = C.reducer(s, { type: 'BOARD', side, payload: penalty ? { coins: 0, queen: false, penalty: true } : { coins, queen, queenBy } } as never);
      const b = s.boards[s.boards.length - 1];
      assert.equal(b.points, want);
      if (!penalty) assert.equal(b.queen, queen);
    }
    // the board editor replays the list to the same score
    const again = C.reducer(s, { type: 'EDIT_LOG', payload: { boards: C.boardInputs(s) } } as never);
    assert.deepEqual(again.current, s.current);
    assert.deepEqual(again.gamesWon, s.gamesWon);
  }
});

test('600 snooker fouls: the value is max(min, ball involved), within [min, 7], and scores exactly that', () => {
  let n = 0;
  while (n < 600) {
    let s = S.createInitialState({ reds: [15, 10, 6][rnd(3)] });
    for (let i = 0; i < 40 && s.frame && !s.ended; i++) {
      const p = snookerPanel(s);
      if (!p) break;
      const roll = rnd(3);
      if (roll === 0) {
        const pot = p.balls.find((b) => b.action && b.ball !== 'free');
        if (pot) { s = S.reducer(s, pot.action as never); continue; }
      }
      if (roll === 1 && p.miss) { s = S.reducer(s, p.miss as never); continue; }
      const ball = rnd(8) === 7 ? null : FOUL_BALLS[rnd(FOUL_BALLS.length)];
      const v = foulValue(p.foul.min, ball);
      assert.ok(v >= p.foul.min && v <= 7);
      assert.equal(v, Math.max(p.foul.min, ball ? S.ballValue(ball) : 0));
      assert.ok(p.foul.values.includes(v), 'the value is one of the chips');
      const a = foulAction(s, { value: v, kind: 'wrongBall' });
      if (!a) break;
      const fr = s.frame!;
      const victim = fr.striker === 'home' ? 'away' : 'home';
      const before = fr.score[victim];
      const next = S.reducer(s, a as never);
      // the same log replays identically
      assert.deepEqual(S.reducer(s, a as never), next);
      const f = next.frame && next.frame.n === fr.n ? next.frame.fouls[next.frame.fouls.length - 1] : null;
      if (f) { assert.equal(f.value, v); assert.equal(next.frame!.score[victim], before + v); }
      s = next;
      n++;
    }
  }
  assert.ok(n >= 600);
});
