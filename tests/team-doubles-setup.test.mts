/** Teams for doubles, phase 2 (docs/security/breaks/team-doubles-setup.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickSideName, placeholderRename, placeholderEntryIds, looksQuickPlaceholder } from '../src/core/quickGame.ts';
import { sidesForStructure } from '../src/data/doublesPicker.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('TD3: doubles stand-ins are "Team A / Team B"', () => {
  assert.equal(quickSideName('pairs', 'home'), 'Team A');
  assert.equal(quickSideName('pairs', 'away'), 'Team B');
  assert.equal(quickSideName('individual', 'home'), 'Player A');
});

test('TD4/TD6: a doubles "Team A" takes its two people’s names; a team-sport one keeps its name', () => {
  assert.deepEqual(placeholderRename({ name: 'Team A', adhoc: true }, ['Ravi Kumar', 'Asha Menon'], true)?.name, 'Ravi Kumar / Asha Menon');
  assert.equal(placeholderRename({ name: 'Team A', adhoc: true }, ['Ravi Kumar', 'Asha Menon']), null, 'team sport: unchanged');
  assert.equal(looksQuickPlaceholder('Team B', true), true);
  assert.equal(looksQuickPlaceholder('Team B'), false);
  assert.deepEqual(placeholderEntryIds({ name: 'Team B', adhoc: true, roster: ['p1', 'p2'] }, true), ['p1', 'p2']);
  assert.equal(placeholderEntryIds({ name: 'Team B', adhoc: true, roster: ['p1', 'p2'] }), undefined);
});

test('TD5: old "Pair A" sides still work', () => {
  assert.equal(placeholderRename({ name: 'Pair A', adhoc: true }, ['Ravi Kumar', 'Asha Menon'])?.name, 'Ravi Kumar / Asha Menon');
  assert.equal(looksQuickPlaceholder('Pair B'), true);
});

test('TD2: a doubles side can be any team of 2 or more different people', () => {
  const teams = [
    { id: 'a', name: 'Ravi / Asha', roster: ['p1', 'p2'] },
    { id: 'b', name: 'Smashers', roster: ['p1', 'p2', 'p3'] },
    { id: 'c', name: 'Solo', roster: ['p9'] },
    { id: 'd', name: 'Twice', roster: ['p4', 'p4'] },
  ];
  assert.deepEqual(sidesForStructure(teams, 'pair').map((t) => t.id), ['a', 'b']);
  assert.deepEqual(sidesForStructure(teams, 'single').map((t) => t.id), ['c']);
});

test('TD1: no user-visible "pair" wording on the setup screens', () => {
  const bad: [string, RegExp][] = [
    ['src/screens/ScheduleMatchScreen.tsx', /label="Pair [12]"|Pair A and Pair B|Search pairs or players|A doubles side is a pair|>Recent pairs<|>Your pairs</],
    ['src/screens/QuickTournamentScreen.tsx', /Doubles \(pairs\)|'＋ Add pair'|'Pairs'|players or pairs|'pairs' : 'players'|'pair' : 'player'/],
    ['src/screens/TournamentTeamsScreen.tsx', /'Could not add the pair'|'pair' : 'team'|Pick both partners/],
    ['src/screens/CreateTournamentScreen.tsx', /\(pairs\)/],
    ['src/components/EntrantPicker.tsx', /'＋ Create pair'/],
    ['src/screens/StandingsScreen.tsx', /'Pair' : 'Player'/],
  ];
  // what users see: code, not comments
  const code = (f: string) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const [f, re] of bad) assert.doesNotMatch(code(f), re, f);
});
