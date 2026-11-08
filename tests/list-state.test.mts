/** Lists that show the state (docs/security/breaks/list-state.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { distinctNames } from '../src/core/chipNames.ts';
import { overdueHint } from '../src/core/overdue.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

test('LS3: look-alike names get the detail that differs', () => {
  const m = distinctNames([
    { id: 'a', name: 'Football Cup · Nov 2026', hostName: 'Aarav', city: 'Pune' },
    { id: 'b', name: 'Football Cup · Nov 2026', hostName: 'Diya', city: 'Pune' },
    { id: 'c', name: 'Winter Shield' },
  ]);
  assert.equal(m.get('a'), 'Football Cup · Nov 2026 · Aarav');
  assert.equal(m.get('b'), 'Football Cup · Nov 2026 · Diya');
  assert.equal(m.get('c'), 'Winter Shield');
  const same = distinctNames([{ id: 'x', name: 'Cup', hostName: 'A' }, { id: 'y', name: 'cup', hostName: 'A', city: 'Goa' }]);
  assert.deepEqual([same.get('x'), same.get('y')], ['Cup (1)', 'cup (2)'], 'nothing differs for all → numbered');
  const byCity = distinctNames([{ id: 'x', name: 'Cup', hostName: 'A', city: 'Goa' }, { id: 'y', name: 'Cup', hostName: 'A', city: 'Pune' }]);
  assert.equal(byCity.get('y'), 'Cup · Pune');
});

test('LS5: the overdue line counts right', () => {
  assert.match(overdueHint(1), /^This game’s date has passed/);
  assert.match(overdueHint(3), /^These 3 games’ dates have passed/);
});

test('LS1/LS2: live cards show a score, walkovers don’t', () => {
  const c = read('src/components/MatchCard.tsx');
  assert.match(c, /const sc = match\.score \?\? \{ home: 0, away: 0 \};/);
  assert.match(c, /const showScore = \(live \|\| done\) && \(!!match\.score \|\| live\) && !walkover;/);
});

test('wiring: one overdue line, compact Home cards, folded sport filter', () => {
  const m = read('src/screens/MatchesScreen.tsx');
  assert.match(m, /overdueHint\(overdue\.length\)/);
  assert.doesNotMatch(m, /note=\{OVERDUE_NOTE\}/);
  assert.match(m, /Sport: \{filter === 'all'/);
  const h = read('src/screens/HomeScreen.tsx');
  assert.match(h, /<MatchCard key=\{m\.id\} match=\{m\} compact /);
  // the tournament chip row was removed (home-sports.md HS5); the cards open each tournament
  assert.match(h, /tournamentCards\(/);
});
