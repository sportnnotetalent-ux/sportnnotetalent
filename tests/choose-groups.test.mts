/** Choose each team's group (docs/security/breaks/choose-groups.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignGroups, groupStage, drawGroups, groupsProblem } from '../src/data/fixtures.ts';

const T = ['1a', '2a', '3a', '4a', '1b', '2b', '3b', '4b'];
const names = (gs: { name: string; teamIds: string[] }[]) => gs.map((g) => `${g.name}:${g.teamIds.join(',')}`);

test('CG2: default is the old alternate dealing (unchanged)', () => {
  assert.deepEqual(names(assignGroups(T, 2)), names(drawGroups(T, 2)));
  assert.deepEqual(names(assignGroups(T, 2)), ['A:1a,3a,1b,3b', 'B:2a,4a,2b,4b']);
});

test('CG1: Winter Shield — the organiser puts each team in its group', () => {
  const chosen = Object.fromEntries(T.map((t) => [t, t.endsWith('a') ? 0 : 1]));
  const gs = assignGroups(T, 2, chosen);
  assert.deepEqual(names(gs), ['A:1a,2a,3a,4a', 'B:1b,2b,3b,4b']);
  const ps = groupStage(T, 2, false, chosen);
  assert.equal(ps.length, 12);
  for (const p of ps) {
    const g = p.group === 'A' ? 'a' : 'b';
    assert.ok(p.homeId.endsWith(g) && p.awayId.endsWith(g), `${p.homeId} v ${p.awayId} in ${p.group}`);
  }
});

test('CG3/CG4: choices for a missing group or an unpicked team are ignored', () => {
  const gs = assignGroups(['x', 'y', 'z', 'w'], 2, { x: 3, gone: 0, y: -1, z: 1.5 as any });
  assert.deepEqual(names(gs), ['A:x,z', 'B:y,w']);
});

test('CG5/CG7: a group needs 2 teams; uneven groups are fine', () => {
  assert.equal(groupsProblem(assignGroups(T, 2, Object.fromEntries(T.map((t) => [t, 0])))), 'Group B needs at least 2 teams.');
  assert.equal(groupsProblem(assignGroups(T, 2, { '2b': 0 })), null); // 5 + 3
  assert.equal(groupStage(T, 2, false, { '2b': 0 }).length, 10 + 3);
});
