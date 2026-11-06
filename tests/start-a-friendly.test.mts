/** Every signed-in account can start a friendly from Home
 *  (docs/security/breaks/start-a-friendly.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canStartFriendly, canScoreByRole } from '../src/core/roles.ts';

const ROLES = ['player', 'scorer', 'organizer', 'support', 'parent', 'coach', undefined] as const;

test('every role can start a friendly (founder: friendlies are never gated)', () => {
  for (const r of ROLES) assert.equal(canStartFriendly(r as never), true, String(r));
});

test('SF2: scoring someone else\'s match keeps its role check', () => {
  assert.equal(canScoreByRole('player'), false);
  assert.equal(canScoreByRole('scorer'), true);
});

test('SF5: Home uses the friendly helper for the tile and the menu, and never sends players to Matches instead', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'screens', 'HomeScreen.tsx'), 'utf8');
  const tile = src.slice(src.indexOf('label="Score a match"'), src.indexOf('label="Organize"'));
  assert.match(tile, /ScheduleMatch/);
  assert.doesNotMatch(tile, /screen: 'Matches'/, 'no silent detour to the Matches tab');
  assert.doesNotMatch(tile, /canScore\b/, 'the tile is not gated by the scoring role');
  const menu = src.slice(src.indexOf("'Start a friendly'") - 120, src.indexOf("'Start a friendly'"));
  assert.doesNotMatch(menu, /canScore \?/, 'the menu item is not gated by the scoring role');
  assert.match(src, /canStartFriendly/);
});

test('600 random accounts all reach the match set-up', () => {
  let seed = 611;
  const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
  let ok = 0;
  for (let i = 0; i < 600; i++) if (canStartFriendly(ROLES[rnd(ROLES.length)] as never)) ok++;
  assert.equal(ok, 600);
});
