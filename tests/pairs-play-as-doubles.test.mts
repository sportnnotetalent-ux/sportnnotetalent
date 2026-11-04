/** Two players a side score as doubles (docs/security/breaks/pairs-play-as-doubles.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { perSideFromRosters } from '../src/core/sideSize.ts';

test('PD1: both sides pairs, format singles → 2', () => {
  assert.equal(perSideFromRosters('both', 2, 2, 1), 2);
  assert.equal(perSideFromRosters('both', 2, 2, undefined), 2);
  assert.equal(perSideFromRosters('both', 2, 2, 2), null);
});

test('PD2: both sides one player, format doubles → 1', () => {
  assert.equal(perSideFromRosters('both', 1, 1, 2), 1);
  assert.equal(perSideFromRosters('both', 1, 1, 1), null);
});

test('PD3/PD5: uneven or empty sides, team or individual sports → no change', () => {
  assert.equal(perSideFromRosters('both', 2, 1, 1), null);
  assert.equal(perSideFromRosters('both', 0, 2, 1), null);
  assert.equal(perSideFromRosters('both', 3, 3, 1), null);
  assert.equal(perSideFromRosters('team', 2, 2, 1), null);
  assert.equal(perSideFromRosters('individual', 2, 2, 1), null);
  assert.equal(perSideFromRosters(undefined, 2, 2, 1), null);
});

test('PD1/PD4/PD6: the scoring screen applies it before the first shot and offers it after', () => {
  const src = readFileSync(new URL('../src/screens/LiveScoringScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /perSideFromRosters\(/);
  assert.match(src, /Score as doubles|score as doubles/);
});
