/** Quality mandate step 6 (docs/security/breaks/stale-live-and-duplicate-entries.md): 1,000 random entry lists. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onePerEntrant } from '../src/data/doublesPicker.ts';

let seed = 907;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const P = ['a', 'b', 'c', 'd', 'e'];
test('1,000 random lists', () => {
  for (let i = 0; i < 1000; i++) {
    const list = Array.from({ length: rnd(15) }, (_, n) => {
      const r = rnd(4);
      const roster = r === 0 ? undefined : r === 1 ? [P[rnd(5)]] : [P[rnd(5)], P[rnd(5)]];
      return { id: `e${n}`, name: 'X', roster };
    });
    const keep = list.length && rnd(2) ? [list[rnd(list.length)].id] : [];
    const out = onePerEntrant(list, keep);
    const keyOf = (t: { roster?: string[] }) => (t.roster?.length ? [...t.roster].sort().join('|') : null);
    const keys = out.map(keyOf).filter(Boolean);
    assert.equal(new Set(keys).size, keys.length, 'each person / pair once');
    for (const k of new Set(list.map(keyOf).filter(Boolean))) assert.ok(keys.includes(k), 'nobody lost');
    for (const id of keep) assert.ok(out.some((t) => t.id === id), 'picked side stays');
    assert.equal(out.filter((t) => !keyOf(t)).length, list.filter((t) => !keyOf(t)).length, 'no-roster entries untouched');
  }
});
