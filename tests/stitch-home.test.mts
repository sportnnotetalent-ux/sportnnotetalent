/** Home, Stitch picks (docs/security/breaks/stitch-home.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekLine, heroSportChips, scheduleProgress, heroGreeting, heroFontSize, tournamentCards, sportsSummary } from '../src/core/homeHero.ts';

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
  assert.match(read('src/core/homeHero.ts'), /pct: scheduleProgress\(ms\)/, 'HM4 via the cards');
  assert.match(h, /matchOutbox\.isOnline\(\)/);
  // round 2 (HM8): three tiles, only Score a match in lime
  assert.equal((h.match(/<HomeTile /g) ?? []).length, 3);
  assert.equal((h.match(/<HomeTile [^>]*\blime\b/g) ?? []).length, 1);
  assert.match(h, /<HomeTile lime label="Score a match"/);
  assert.match(h, /heroGreeting\(/);
  assert.match(h, /tournamentCards\(/);
  const c = read('src/components/MatchCard.tsx');
  assert.match(c, /archetype === 'set-game-point'/);
});

test('HM9/HM10: one-line greeting with the first name, shrinking to fit', () => {
  assert.deepEqual(heroGreeting('Aarav Mehta'), { lead: 'Ready to ', accent: 'play, Aarav?' });
  assert.deepEqual(heroGreeting(''), { lead: 'Ready to ', accent: 'play?' });
  assert.deepEqual(heroGreeting(undefined), { lead: 'Ready to ', accent: 'play?' });
  assert.deepEqual(heroGreeting('Bartholomewsky Smith'), { lead: 'Ready to ', accent: 'play?' }, 'a very long name is left out');
  const long = heroFontSize('Ready to play, Aarav?', 343);
  assert.ok(long <= 44 && long >= 26);
  assert.ok(heroFontSize('Ready to play?', 343) >= long);
  assert.equal(heroFontSize('Ready to play?', 0), 44, 'before measuring: the full size');
  assert.equal(heroFontSize('Ready to play, Christopher?', 200), 26, 'never below the floor');
});

test('HM11/HM12: tournament cards — real counts, at most 10', () => {
  const t = (id: string, sports: string[]) => ({ id, name: id, sports, startDate: '2026-11-01', endDate: '2026-11-09' });
  const ms = [
    { tournamentId: 'a', status: 'completed', homeTeam: { id: 'x' }, awayTeam: { id: 'y' } },
    { tournamentId: 'a', status: 'scheduled', homeTeam: { id: 'x' }, awayTeam: { id: 'z' } },
    { tournamentId: 'a', status: 'cancelled', homeTeam: { id: 'y' }, awayTeam: { id: 'z' } },
  ];
  const cards = tournamentCards([t('a', ['football', 'cricket'])] as never, ms as never);
  assert.equal(cards[0].sports, 2);
  assert.equal(cards[0].teams, 3);
  assert.equal(cards[0].pct, 50);
  assert.equal(tournamentCards(Array.from({ length: 14 }, (_, i) => t(`t${i}`, ['football'])) as never, []).length, 10);
});

test('HM13/HM14: many sports fold into one row; four or fewer stay a grid', () => {
  const many = ['football', 'cricket', 'basketball', 'badminton', 'tennis', 'kabaddi'];
  assert.deepEqual(sportsSummary(many as never), { folded: true, names: ['football', 'cricket', 'basketball'], more: 3 });
  assert.deepEqual(sportsSummary(many.slice(0, 4) as never), { folded: false, names: many.slice(0, 4), more: 0 });
  assert.deepEqual(sportsSummary([] as never), { folded: false, names: [], more: 0 });
  const h = read('src/screens/HomeScreen.tsx');
  assert.match(h, /sportsSummary\(mySports\)/);
  assert.match(h, /Show less/);
});
