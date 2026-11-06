/** Reference-video C9 (grounds with game counts) and C10 (one Schedule entry)
 *  — docs/security/breaks/grounds-and-schedule.md. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { venueCounts, rankVenues, venueLabel } from '../src/core/venueCounts.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('GS1: counts per ground, case and spaces ignored, blanks skipped', () => {
  const c = venueCounts([{ venueName: 'Chinnaswamy' }, { venueName: ' chinnaswamy ' }, { venueName: 'KSLTA' }, { venueName: '' }, { venueName: null }, {}]);
  assert.deepEqual(c, { chinnaswamy: 2, kslta: 1 });
});

test('GS2: busiest first, ties keep their order; labels say "1 game" / "N games"', () => {
  const c = { a: 1, b: 5, c: 1 };
  assert.deepEqual(rankVenues(['A', 'B', 'C', 'D'], c), ['B', 'A', 'C', 'D']);
  assert.equal(venueLabel('B', c), 'B · 5 games');
  assert.equal(venueLabel('A', c), 'A · 1 game');
  assert.equal(venueLabel('D', c), 'D', 'never used: just the name');
  assert.equal(venueLabel('X'), 'X');
});

test('GS3: the grounds field shows the counts and the busiest grounds first (create and edit)', () => {
  const f = read('src/components/TournamentDetailsFields.tsx');
  assert.match(f, /venueCounts\?: Record<string, number>/);
  assert.match(f, /rankVenues\(/);
  assert.match(f, /venueLabel\(v, venueCounts\)/);
  for (const s of ['src/screens/CreateTournamentScreen.tsx', 'src/screens/EditTournamentScreen.tsx']) assert.match(read(s), /venueCounts=\{/, s);
});

test('GS4: Manage has ONE "Schedule matches" entry with three choices, automatic first and lime', () => {
  const s = read('src/screens/TournamentProfileScreen.tsx');
  assert.match(s, /title="Schedule matches"/);
  assert.doesNotMatch(s, /<HubRow icon="📅" title="Schedule a match"/);
  const sheet = s.slice(s.indexOf('<Sheet'), s.indexOf('</Sheet>'));
  assert.match(sheet, /variant="primary"[^>]*Automatically|Automatically[^>]*variant="primary"/s);
  for (const t of ['GenerateFixtures', 'ScheduleMatch', 'ImportSchedule']) assert.match(sheet, new RegExp(t));
});
