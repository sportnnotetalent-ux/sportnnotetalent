/** Pair names: both names, two lines, one consistent format on every scorecard
 *  (docs/security/breaks/pair-names.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sideLines, sideSpoken } from '../src/core/sideName.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('PN1/PN3: a pair is two lines; anything else one', () => {
  assert.deepEqual(sideLines('Aanya Verma / Divya Nair'), ['Aanya Verma /', 'Divya Nair']);
  assert.deepEqual(sideLines('Aanya / Divya'), ['Aanya /', 'Divya']);
  assert.deepEqual(sideLines('  Ravi K  /  Ravi S '), ['Ravi K /', 'Ravi S']);
  assert.deepEqual(sideLines('Red House'), ['Red House']);
  assert.deepEqual(sideLines('A / B / C'), ['A / B / C'], 'three stay one line');
  assert.deepEqual(sideLines('Aanya / '), ['Aanya /'], 'an empty half is not a pair');
  assert.deepEqual(sideLines(''), ['']);
});

test('PN4: the split never adds anything to a masked name', () => {
  assert.deepEqual(sideLines('Aanya V. / Divya N.'), ['Aanya V. /', 'Divya N.']);
});

test('PN5: one spoken label for a pair', () => {
  assert.equal(sideSpoken('Aanya Verma / Divya Nair'), 'Aanya Verma and Divya Nair');
  assert.equal(sideSpoken('Red House'), 'Red House');
});

const SCORECARDS = [
  'src/components/MatchCard.tsx', 'src/components/LiveScoreBar.tsx', 'src/components/Scoreboard.tsx',
  'src/components/MiniScore.tsx', 'src/components/MatchHeader.tsx', 'src/components/MatchSummary.tsx',
  'src/components/LineScoreboard.tsx', 'src/screens/FixtureMapScreen.tsx', 'src/screens/BracketScreen.tsx',
];

test('PN2: every scorecard shows side names through SideName', () => {
  for (const f of SCORECARDS) assert.match(read(f), /<SideName\b/, f);
});

test('PN2: the sizes live in one place', () => {
  const s = read('src/components/SideName.tsx');
  assert.match(s, /export const SIDE_TYPE/);
  // scorecards never pass their own font size to SideName
  for (const f of SCORECARDS) assert.doesNotMatch(read(f), /<SideName[^>]*fontSize/, f);
});
