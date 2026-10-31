/**
 * Quality mandate step 6 for MVP P1 batch 4 (docs/security/breaks/mvp-p1-batch4.md):
 *  - 500 tennis matches on every preset, played point by point at random: each
 *    one ends, and the decider is what the preset says;
 *  - 1,000 random colour pairs: the scorer's two colours are always easy to
 *    tell apart, and distinct pairs are never changed;
 *  - 1,000 random team-name pairs: the two codes always differ;
 *  - 500 kabaddi halves of random one-step timeouts: never more than 2 a side,
 *    and the clock is paused after each one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { init as tInit, reducer as tReducer } from '../src/sports/tennis/engine.ts';
import { distinctSideColors, colorGap } from '../src/core/contrast.ts';
import { shortFrom, uniqueShort } from '../src/core/teamShort.ts';
import { init as kInit, reducer as kReducer, timeoutsUsed } from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 17;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)

test('500 tennis matches across every preset all finish', () => {
  const presets = TENNIS_META.formatFields!.find((f) => f.key === 'preset')!.options!.filter((o) => o.set);
  for (let i = 0; i < 500; i++) {
    const p = presets[i % presets.length];
    let s = tInit(p.set);
    let n = 0;
    while (!s.ended && n < 2000) { s = tReducer(s, { type: 'POINT', side: rnd(2) ? 'home' : 'away' } as ScoreAction); n++; }
    assert.equal(s.ended, true, `${p.value} did not finish`);
    const needed = Number(p.set!.setsToWin);
    assert.ok(s.setsWon.home === needed || s.setsWon.away === needed, `${p.value}: ${JSON.stringify(s.setsWon)}`);
  }
});

test('1,000 colour pairs: always distinguishable; distinct pairs untouched', () => {
  const hex = () => '#' + Array.from({ length: 3 }, () => rnd(256).toString(16).padStart(2, '0')).join('').toUpperCase();
  for (let i = 0; i < 1000; i++) {
    const h = hex();
    const a = rnd(3) === 0 ? h : hex();
    const [h2, a2] = distinctSideColors(h, a);
    assert.equal(h2, h);
    if (colorGap(h, a) >= 120) assert.equal(a2, a);
    else assert.ok(colorGap(h2, a2) > colorGap(h, a), `${h} ${a} → ${a2}`);
  }
});

test('1,000 team-name pairs: the two codes always differ', () => {
  const words = ['Kondapur', 'Kukatpally', 'FC', 'United', 'Kranti', 'Foundation', 'Stars', 'K', 'Club', 'Royal'];
  for (let i = 0; i < 1000; i++) {
    const name = () => Array.from({ length: 1 + rnd(3) }, () => words[rnd(words.length)]).join(' ');
    const first = shortFrom(name());
    const second = uniqueShort(name(), [first]);
    assert.notEqual(second, first);
    assert.ok(second.length >= 2 && second.length <= 4, second);
  }
});

test('500 kabaddi halves of one-step timeouts', () => {
  for (let g = 0; g < 500; g++) {
    let s = kReducer(kInit({}), { type: 'KICKOFF', payload: { at: 1_000 } } as ScoreAction);
    for (let i = 0; i < 8; i++) {
      const side = rnd(2) ? 'home' : 'away';
      const before = timeoutsUsed(s, side);
      s = kReducer(s, { type: 'TIMEOUT', side, payload: { pauseAt: 10_000 * (i + 1) } } as ScoreAction);
      assert.ok(timeoutsUsed(s, side) <= 2);
      if (timeoutsUsed(s, side) > before) assert.ok(s.pausedAt != null, 'a timeout pauses the clock');
      s = kReducer(s, { type: 'RESUME', payload: { at: 10_000 * (i + 1) + 5_000 } } as ScoreAction);
    }
  }
});
