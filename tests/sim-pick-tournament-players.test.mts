/** 600 simulated organisers adding random players / pairs (with repeats, swapped
 *  pairs and typed-name spellings): every accepted entry is new, and no person
 *  ends up in two entries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryClash, entryKey } from '../src/core/entryPick.ts';

let seed = 77;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Slot = { kind: 'person'; person: { id: string; fullName: string } } | { kind: 'name'; name: string };

test('600 organisers', () => {
  for (let u = 0; u < 600; u++) {
    const per = rnd(2) ? 2 : 1;
    const pool = 4 + rnd(16);
    const slot = (): Slot => (rnd(6) === 0 ? { kind: 'name', name: `${rnd(2) ? ' ' : ''}Typed ${rnd(4)}${rnd(2) ? '  ' : ''}` } : { kind: 'person', person: { id: `u${u}p${rnd(pool)}`, fullName: `P${rnd(pool)}` } });
    const entries: Slot[][] = [];
    for (let i = 0; i < 30; i++) {
      const e = Array.from({ length: per }, slot);
      if (per === 2 && entryKey([e[0]]) === entryKey([e[1]])) continue; // the picker never takes one person twice
      if (entryClash(entries, e) === null) entries.push(e);
    }
    const keys = entries.flatMap((e) => e.map((s) => entryKey([s])));
    assert.equal(new Set(keys).size, keys.length, 'a person in two entries');
    assert.equal(new Set(entries.map((e) => entryKey(e))).size, entries.length, 'an entry twice');
  }
});
