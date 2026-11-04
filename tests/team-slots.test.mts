/** Team slots — names (docs/security/breaks/team-slots.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotNames, groupFromSlotName } from '../src/core/slots.ts';

test('TS2: group slots are A1…A4, B1…B4; no groups → Team 1…', () => {
  assert.deepEqual(slotNames(8, 2), ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']);
  assert.deepEqual(slotNames(7, 2), ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3']);
  assert.deepEqual(slotNames(4), ['Team 1', 'Team 2', 'Team 3', 'Team 4']);
  assert.deepEqual(slotNames(5, 1), ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5']);
});

test('TS11: 2–128 slots', () => {
  assert.equal(slotNames(1).length, 2);
  assert.equal(slotNames(500).length, 128);
  assert.equal(slotNames(Number.NaN as any).length, 2);
});

test('TS2: a slot name tells its group (only for groups that exist)', () => {
  assert.equal(groupFromSlotName('A1', 2), 0);
  assert.equal(groupFromSlotName('B4', 2), 1);
  assert.equal(groupFromSlotName('C1', 2), undefined);
  assert.equal(groupFromSlotName('Team 1', 2), undefined);
  assert.equal(groupFromSlotName('Aces', 2), undefined);
});
