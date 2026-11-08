/** teams.roster is jsonb: a "roster contains" filter must be sent as JSON
 *  (["id"]), not a Postgres array ({id}) — the array form errors on jsonb, the
 *  query returns nothing, and the Matches "Player" view was empty for everyone
 *  (founder 2026-11-06, Hrudhay: on 9 rosters, Player view empty). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rosterContains } from '../src/core/rosterFilter.ts';

test('RC1: the filter value is a JSON array', () => {
  assert.equal(rosterContains(['p1']), '["p1"]');
  assert.equal(rosterContains(['p1', 'p2']), '["p1","p2"]');
  assert.deepEqual(JSON.parse(rosterContains(['a"b'])), ['a"b'], 'quotes escaped');
});

test('RC2: no roster query sends a bare array to contains()', () => {
  const src = readFileSync(new URL('../src/data/repos.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /contains\('roster', \[/);
  assert.doesNotMatch(src, /contains\('roster', ids\)/);
  // team-pages.md PG3: + getTeamsWithPlayers (the same safe helper)
  assert.equal((src.match(/contains\('roster', rosterContains\(/g) ?? []).length, 3);
});
