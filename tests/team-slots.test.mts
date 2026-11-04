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

test('TS13: new slot names continue after the existing ones', async () => {
  const { nextSlotNames } = await import('../src/core/slots.ts');
  assert.deepEqual(nextSlotNames(['Lions', 'Slot 1', 'Slot 2'], 3), ['Slot 3', 'Slot 4', 'Slot 5']);
  assert.deepEqual(nextSlotNames(['Lions'], 2), ['Slot 1', 'Slot 2']);
  assert.deepEqual(nextSlotNames(['Slot 7'], 1), ['Slot 8']);
});

test('TS15: group slots go to the group with the fewest', async () => {
  const { nextSlotNames } = await import('../src/core/slots.ts');
  assert.deepEqual(nextSlotNames(['A1', 'A2', 'B1'], 3, 2), ['B2', 'A3', 'B3']);
  assert.deepEqual(nextSlotNames([], 4, 2), ['A1', 'B1', 'A2', 'B2']);
  assert.deepEqual(nextSlotNames(['C9'], 1, 2), ['A1']); // C isn't a group here
});

test('TS12: "?" / TBC / TBD lines in a typed list are slots', async () => {
  const { splitTypedSlots } = await import('../src/core/slots.ts');
  const r = splitTypedSlots(['Lions', '?', 'Tigers', 'tbc', 'TBD', 'To be decided FC']);
  assert.deepEqual(r.teams, ['Lions', 'Tigers', 'To be decided FC']);
  assert.equal(r.slots, 3);
});

test('TS14: at least one, at most 128', async () => {
  const { nextSlotNames } = await import('../src/core/slots.ts');
  assert.equal(nextSlotNames([], 0).length, 1);
  assert.equal(nextSlotNames([], 999).length, 128);
});

test('TS12: repeated "?" lines are each a slot (counted before de-duplication)', async () => {
  const { splitTypedSlots } = await import('../src/core/slots.ts');
  assert.equal(splitTypedSlots('Lions\n?\n?\n?'.split('\n')).slots, 3);
  const src = (await import('node:fs')).readFileSync(new URL('../src/screens/QuickTournamentScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /splitTypedSlots\(list\.split/);
});
