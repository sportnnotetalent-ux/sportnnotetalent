/** Pick a tournament's players / pairs (docs/security/breaks/pick-tournament-players.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entryKey, entryClash } from '../src/core/entryPick.ts';

const P = (id: string, fullName = id) => ({ kind: 'person' as const, person: { id, fullName } });
const N = (name: string) => ({ kind: 'name' as const, name });

test('PP4: a pair is its two people, any order; names count too', () => {
  assert.equal(entryKey([P('b'), P('a')]), entryKey([P('a'), P('b')]));
  assert.notEqual(entryKey([P('a')]), entryKey([P('a'), P('b')]));
  assert.equal(entryKey([N(' Ravi  K ')]), entryKey([N('ravi k')]));
});

test('PP2/PP3/PP4: nobody in two entries', () => {
  const entries = [[P('a', 'Asha'), P('b', 'Bala')], [P('c', 'Chen')]];
  assert.equal(entryClash(entries, [P('a', 'Asha'), P('d')]), 'Asha is already in.');
  assert.equal(entryClash(entries, [P('c', 'Chen')]), 'Chen is already in.');
  assert.equal(entryClash(entries, [P('b'), P('a')]), 'That pair is already in.');
  assert.equal(entryClash(entries, [P('d'), P('e')]), null);
  assert.equal(entryClash([[N('Ravi')]], [N('ravi')]), 'Ravi is already in.');
});

test('PP1/PP6/PP7: Quick tournament uses the people picker for individual sports', () => {
  const quick = readFileSync(new URL('../src/screens/QuickTournamentScreen.tsx', import.meta.url), 'utf8');
  assert.match(quick, /EntrantPicker/);
  assert.match(quick, /sideForEntrants/);
  assert.match(quick, /playersPerSide/);
});
