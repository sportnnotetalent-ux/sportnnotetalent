/** 600 simulated draws: 2–40 teams, 2–8 groups, random organiser choices
 *  (some for missing groups / unpicked teams / junk). Every team is in exactly
 *  one group; a valid choice is always honoured; every fixture stays inside
 *  its group; each group plays a full round robin. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignGroups, groupStage, groupsProblem } from '../src/data/fixtures.ts';

let seed = 6;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

test('600 draws', () => {
  for (let u = 0; u < 600; u++) {
    const n = 2 + rnd(39);
    const teams = Array.from({ length: n }, (_, i) => `u${u}t${i}`);
    const want = 2 + rnd(7);
    const chosen: Record<string, number> = {};
    for (const t of teams) if (rnd(2)) chosen[t] = rnd(10) === 0 ? 99 : rnd(want);
    if (rnd(3) === 0) chosen[`u${u}gone`] = 0;
    const gs = assignGroups(teams, want, chosen);
    const g = gs.length;
    const all = gs.flatMap((x) => x.teamIds);
    assert.equal(all.length, n);
    assert.equal(new Set(all).size, n);
    for (const t of teams) {
      const c = chosen[t];
      if (Number.isInteger(c) && c >= 0 && c < g) assert.ok(gs[c].teamIds.includes(t), 'a choice ignored');
    }
    if (groupsProblem(gs)) continue;
    const ps = groupStage(teams, want, false, chosen);
    const groupOf = new Map(gs.flatMap((x) => x.teamIds.map((id) => [id, x.name] as const)));
    for (const p of ps) {
      assert.equal(groupOf.get(p.homeId), p.group);
      assert.equal(groupOf.get(p.awayId), p.group);
    }
    assert.equal(ps.length, gs.reduce((a, x) => a + (x.teamIds.length * (x.teamIds.length - 1)) / 2, 0));
  }
});
