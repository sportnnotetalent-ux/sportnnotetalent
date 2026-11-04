/** 600 simulated "fixtures first" tournaments: 2–128 slots, 0–8 groups. Every
 *  slot name is unique; group slots land in their own group on the fixtures
 *  screen's rule (name → group, then assignGroups); every game stays inside a
 *  group; each group plays a full round robin. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotNames, groupFromSlotName } from '../src/core/slots.ts';
import { assignGroups, groupStage } from '../src/data/fixtures.ts';

let seed = 1306;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

test('600 slot tournaments', () => {
  for (let u = 0; u < 600; u++) {
    const n = 2 + rnd(127), g = rnd(9);
    const names = slotNames(n, g);
    assert.equal(names.length, n);
    assert.equal(new Set(names).size, n, 'duplicate slot names');
    const groups = Math.min(g, Math.floor(n / 2));
    if (groups < 2) { assert.ok(names.every((x) => /^Team \d+$/.test(x))); continue; }
    const ids = names.map((_, i) => `s${i}`);
    const chosen: Record<string, number> = {};
    names.forEach((nm, i) => { const gi = groupFromSlotName(nm, groups); assert.notEqual(gi, undefined); chosen[ids[i]] = gi!; });
    const gs = assignGroups(ids, groups, chosen);
    gs.forEach((grp, gi) => grp.teamIds.forEach((id) => assert.equal(names[ids.indexOf(id)][0], String.fromCharCode(65 + gi))));
    const sizes = gs.map((x) => x.teamIds.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'uneven slot groups');
    const ps = groupStage(ids, groups, false, chosen);
    assert.equal(ps.length, sizes.reduce((a, s) => a + (s * (s - 1)) / 2, 0));
  }
});

test('600 mixed tournaments: added slots never clash and stay balanced', async () => {
  const { nextSlotNames } = await import('../src/core/slots.ts');
  for (let u = 0; u < 600; u++) {
    const g = rnd(5); // 0–4 groups
    let names: string[] = Array.from({ length: rnd(6) }, (_, i) => `Real ${u}-${i}`);
    for (let round = 0; round < 1 + rnd(4); round++) {
      const add = nextSlotNames(names, 1 + rnd(10), g);
      names = [...names, ...add];
      assert.equal(new Set(names).size, names.length, 'a duplicate slot name');
    }
    if (g >= 2) {
      const per = Array.from({ length: g }, (_, gi) => names.filter((x) => x[0] === String.fromCharCode(65 + gi) && /^[A-Z]\d+$/.test(x)).length);
      assert.ok(Math.max(...per) - Math.min(...per) <= 1, `unbalanced ${per}`);
    }
  }
});
