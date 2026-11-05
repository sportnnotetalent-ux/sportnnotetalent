/** Stat leaders as one vertical list with a stat picker (UI audit #48). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickedCategory } from '../src/core/leaderPick.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const cats = [{ key: 'goals' }, { key: 'shots' }];

test('the picked stat, else the first; a stat that disappears falls back', () => {
  assert.equal(pickedCategory(cats, null)!.key, 'goals');
  assert.equal(pickedCategory(cats, 'shots')!.key, 'shots');
  assert.equal(pickedCategory(cats, 'saves')!.key, 'goals', 'filter changed the list');
  assert.equal(pickedCategory([], 'x'), null);
});

test('no sideways rail, no "Swipe for more"', () => {
  const r = read('src/components/StatLeaderRail.tsx');
  assert.doesNotMatch(r, /horizontal/);
  assert.match(r, /<SelectChip key=\{c\.key\}/);
  for (const f of ['src/screens/TournamentProfileScreen.tsx', 'src/screens/SportHubScreen.tsx']) assert.doesNotMatch(read(f), /Swipe for more/, f);
});
