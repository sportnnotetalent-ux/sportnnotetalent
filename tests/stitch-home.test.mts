/** Home, Stitch picks (docs/security/breaks/stitch-home.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekLine, heroSportChips, scheduleProgress } from '../src/core/homeHero.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-08T06:00:00Z');
const m = (id: string, hoursAhead: number, status = 'scheduled', tournamentId?: string) =>
  ({ id, status, startsAt: new Date(NOW + hoursAhead * 3.6e6).toISOString(), ...(tournamentId ? { tournamentId } : {}) });

test('HM2: this week = scheduled or live games in the next 7 days; active = tournaments with a live or coming game', () => {
  const feed = [m('a', 2, 'scheduled', 't1'), m('b', 0, 'live', 't2'), m('c', 24 * 8), m('d', 5, 'cancelled'), m('e', -30, 'completed', 't3'), m('f', 30, 'postponed')];
  assert.equal(weekLine(feed as never, NOW), '2 matches this week · 2 active tournaments');
  assert.equal(weekLine([m('a', 2)] as never, NOW), '1 match this week');
  assert.equal(weekLine([] as never, NOW), null);
});

test('HM3: at most three sport chips, then +N', () => {
  assert.deepEqual(heroSportChips(['football', 'badminton', 'cricket', 'tennis', 'chess']), { shown: ['football', 'badminton', 'cricket'], more: 2 });
  assert.deepEqual(heroSportChips(['football']), { shown: ['football'], more: 0 });
});

test('HM4: progress = completed / (fixtures − cancelled); none without fixtures', () => {
  assert.equal(scheduleProgress([{ status: 'completed' }, { status: 'completed' }, { status: 'scheduled' }, { status: 'cancelled' }] as never), 67);
  assert.equal(scheduleProgress([] as never), null);
  assert.equal(scheduleProgress([{ status: 'cancelled' }] as never), null);
});

test('HM1/HM5/HM6 wiring', () => {
  const h = read('src/screens/HomeScreen.tsx');
  assert.match(h, /weekLine\(/);
  assert.match(h, /heroSportChips\(/);
  assert.match(h, /scheduleProgress\(/);
  assert.match(h, /matchOutbox\.isOnline\(\)/);
  assert.equal((h.match(/<QuickTile /g) ?? []).length, 0, 'the three tiles are gone');
  assert.match(h, /variant="primary" label="Score a match"/);
  const c = read('src/components/MatchCard.tsx');
  assert.match(c, /archetype === 'set-game-point'/);
});
