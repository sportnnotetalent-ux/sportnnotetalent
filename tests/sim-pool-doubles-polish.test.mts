/**
 * Quality mandate step 6 for the pool scotch-doubles polish
 * (docs/security/breaks/pool-doubles-polish.md): 1,000 random keys never repeat
 * a word; 1,000 pool matches started with one tap log the same first action
 * as the old second tap (the stamped LAG), and play on identically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxLegend } from '../src/sports/boxScore.ts';
import { lagAction } from '../src/sports/pool/controls.ts';
import { POOL_CORE } from '../src/sports/pool/core.ts';

let seed = 139;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const WORDS = ['Racks won', 'Pots', 'Misses', 'Fouls', 'Safeties', 'Balls pocketed', 'Points'];

test('1,000 keys', () => {
  for (let i = 0; i < 1000; i++) {
    const cols = Array.from({ length: 1 + rnd(6) }, () => { const label = WORDS[rnd(WORDS.length)]; return { label, abbr: rnd(2) ? label : label.slice(0, 3).toUpperCase() }; });
    for (const part of boxLegend(cols).split(' · ')) {
      const w = part.split(' ');
      for (let k = 1; k < w.length; k++) assert.ok(!(w.slice(0, k).join(' ') === w.slice(k).join(' ')), `repeated: ${part}`);
    }
  }
});

test('1,000 one-tap pool starts', () => {
  for (let i = 0; i < 1000; i++) {
    const game = ['eight', 'nine', 'ten'][rnd(3)];
    const s0 = POOL_CORE.createInitialState({ game, raceTo: 1 + rnd(7) } as never);
    const side = rnd(2) ? 'home' : 'away';
    const at = 1_000 + i;
    const oneTap = lagAction(s0 as never, side, { at });
    const twoTap = lagAction(s0 as never, side, { at });
    assert.deepEqual(oneTap, twoTap);
    assert.equal((oneTap.payload as { rack?: number }).rack, 1, 'stamped with rack 1');
    const s1 = POOL_CORE.reducer(s0 as never, oneTap);
    assert.notEqual(s1, s0);
  }
});
