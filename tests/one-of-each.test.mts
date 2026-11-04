/** One of each (docs/security/breaks/one-of-each.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sportChips, hasMore, EVERYDAY_SPORTS } from '../src/core/sportPick.ts';
import { venueMatches } from '../src/core/venuePick.ts';
import { formatDayRange } from '../src/core/dates.ts';
import { cityLabel } from '../src/core/cityPick.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const KNOWN = ['football', 'cricket', 'basketball', 'kabaddi', 'badminton', 'tennis', 'pickleball', 'padel', 'pool', 'snooker', 'chess'];

test('sport picker: mine first, then selected, then everyday; More adds the rest', () => {
  const c = sportChips({ known: KNOWN, mine: ['pool', 'cricket'], selected: ['chess'], showAll: false });
  assert.deepEqual(c.slice(0, 3), ['pool', 'cricket', 'chess'], 'OE1');
  for (const s of EVERYDAY_SPORTS) assert.ok(c.includes(s));
  assert.ok(!c.includes('snooker'));
  assert.ok(hasMore(c, KNOWN));
  const all = sportChips({ known: KNOWN, mine: ['pool'], showAll: true });
  assert.equal(all.length, KNOWN.length);
  assert.equal(new Set(all).size, all.length, 'no repeats');
  assert.ok(!hasMore(all, KNOWN));
});
test('OE2/OE3: junk ids dropped; a club limits the list', () => {
  assert.ok(!sportChips({ known: KNOWN, mine: ['throwball', '__proto__' as any], showAll: false }).includes('throwball'));
  assert.deepEqual(sportChips({ known: KNOWN, limitTo: ['badminton', 'pool', 'curling'], showAll: false }), ['badminton', 'pool']);
});
test('OE6: venue search', () => {
  const known = ['Main Ground', 'main ground', 'Koramangala Indoor Stadium', 'Indoor Hall', 'Turf 7'];
  assert.deepEqual(venueMatches(known, ''), ['Main Ground', 'Koramangala Indoor Stadium', 'Indoor Hall', 'Turf 7']);
  assert.deepEqual(venueMatches(known, 'indoor'), ['Koramangala Indoor Stadium', 'Indoor Hall']);
  assert.deepEqual(venueMatches(known, 'Turf 7'), [], 'the exact name typed is not suggested');
  assert.equal(venueMatches(Array.from({ length: 20 }, (_, i) => `G${i}`), '').length, 6);
});
test('OE8: one date-range format', () => {
  assert.equal(formatDayRange('2026-10-29', '2026-11-12'), '29 Oct – 12 Nov');
  assert.equal(formatDayRange('2026-10-29', '2026-10-29'), '29 Oct');
  assert.equal(formatDayRange('2026-10-29', null), 'from 29 Oct');
  assert.equal(formatDayRange(null, '2026-11-12'), '12 Nov');
  assert.equal(formatDayRange(null, null), '');
});
test('city labels', () => {
  assert.equal(cityLabel({ name: 'Hyderabad', region: 'Telangana', country: 'IN' }), 'Hyderabad, Telangana, India');
  assert.equal(cityLabel({ name: 'Dubai', region: null, country: 'AE' }), 'Dubai, UAE');
});
test('wiring: one picker, one city field, one date format', () => {
  for (const f of ['QuickTournamentScreen', 'CreateTournamentScreen', 'SquadSessionScreen']) assert.match(read(`src/screens/${f}.tsx`), /<SportPicker /, f);
  assert.match(read('src/components/TournamentDetailsFields.tsx'), /<CityField /);
  assert.match(read('src/screens/CreateCommunityScreen.tsx'), /<CityField /);
  for (const f of ['TournamentProfileScreen', 'OrganizeScreen', 'HomeScreen', 'CalendarScreen', 'MyTournamentsScreen', 'OrganizationScreen']) {
    const s = read(`src/screens/${f}.tsx`);
    assert.doesNotMatch(s, /startDate\)?\}? → \{/, f);
  }
  assert.match(read('src/components/VenueField.tsx'), /venueMatches\(knownVenues, venue\)/);
});
