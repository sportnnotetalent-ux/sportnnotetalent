/**
 * Quality mandate step 6 for MVP P1 batch 3 (docs/security/breaks/mvp-p1-batch3.md):
 *  - 500 basketball games on the running clock with random fouls, baskets and
 *    time-outs: only a time-out ever stops it; 500 on the stoppable clock: a
 *    foul always stops it (unchanged);
 *  - 500 football squads with no lineup: the bench never offers the player
 *    going off, a player sent off, or (fixed subs) a withdrawn player;
 *  - 1,000 typed entries: only real names qualify for "add without a number".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, clockRunning, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, scoreAction } from '../src/sports/basketball/actions.ts';
import { benchFor } from '../src/sports/football/actions.ts';
import { nameOnlyOk } from '../src/core/contactQuery.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 13;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
const T0 = 1_700_000_000_000;

for (const mode of ['run', 'stop'] as const) {
  test(`500 basketball games, ${mode === 'run' ? 'running' : 'stoppable'} clock`, () => {
    for (let g = 0; g < 500; g++) {
      let s: BasketballState = reducer(init({ regPeriods: 4, periodMinutes: 10, gameClock: true, clockMode: mode }), { type: 'KICKOFF', payload: { at: T0 } });
      let t = T0;
      for (let i = 0; i < 25; i++) {
        t += 5_000 + rnd(20_000);
        const side = rnd(2) ? 'home' : 'away';
        const r = rnd(10);
        const kind = r < 4 ? 'foul' : r < 9 ? 'basket' : 'timeout';
        const a: ScoreAction = kind === 'foul' ? foulAction(side, undefined, 'personal') : kind === 'basket' ? scoreAction(side, 2) : { type: 'TIMEOUT', side, payload: {} };
        s = reducer(s, { ...a, payload: { ...a.payload, at: t, sec: Math.min(599, Math.floor((t - T0) / 1000)) } });
        const running = clockRunning(s);
        if (kind === 'timeout') assert.equal(running, false, 'a time-out stops it');
        else if (mode === 'stop' && kind === 'foul') assert.equal(running, false, 'stoppable: a foul stops it');
        else if (mode === 'run') assert.equal(running, true, `running clock stopped by a ${kind}`);
        if (!running) s = reducer(s, { type: 'CLOCK', payload: { run: true, at: t } }); // the scorer restarts it
      }
    }
  });
}

test('500 football squads with no lineup: the bench is always sound', () => {
  for (let g = 0; g < 500; g++) {
    const squad = Array.from({ length: 5 + rnd(10) }, (_, i) => ({ id: `p${i}` }));
    const off = squad[rnd(squad.length)].id;
    const sentOff = new Set(squad.filter(() => rnd(8) === 0).map((p) => p.id));
    const withdrawn = new Set(squad.filter(() => rnd(6) === 0).map((p) => p.id));
    const bench = benchFor({ squad, onIds: new Set(squad.map((p) => p.id)), hasLineup: false, offId: off, sentOff, withdrawn });
    for (const p of bench) {
      assert.notEqual(p.id, off);
      assert.ok(!sentOff.has(p.id) && !withdrawn.has(p.id));
    }
    assert.equal(bench.length, squad.filter((p) => p.id !== off && !sentOff.has(p.id) && !withdrawn.has(p.id)).length);
  }
});

test('1,000 typed entries: only names qualify for "without a number"', () => {
  const names = ['Ravi', 'Al', 'José Ángel', 'Meera K', 'Li'];
  const notNames = ['9876543210', '+91 98765 43210', 'ravi@x.in', 'a@', '7', '', ' ', '(044)'];
  for (let i = 0; i < 1000; i++) {
    const good = rnd(2) === 0;
    const q = good ? names[rnd(names.length)] : notNames[rnd(notNames.length)];
    assert.equal(nameOnlyOk(q), good, JSON.stringify(q));
  }
});
