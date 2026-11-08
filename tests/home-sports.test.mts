/** Home: Your sports page, its icon, no tournament filter (docs/security/breaks/home-sports.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mostPlayedSport } from '../src/core/playedSports.ts';
import { sportTarget } from '../src/core/homeHero.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const side = (roster: string[] = []) => ({ roster });
const m = (sport: string, o: { home?: string[]; scorer?: string[]; host?: string[] } = {}) =>
  ({ sport, homeTeam: side(o.home), awayTeam: side(), scorerIds: o.scorer ?? [], hostIds: o.host ?? [] });

test('HS1: the fold shows the sport you have played most; none yet → null (generic)', () => {
  const feed = [m('football', { home: ['me'] }), m('badminton', { scorer: ['me'] }), m('badminton', { host: ['me'] }), m('cricket'), m('cricket'), m('cricket')];
  assert.equal(mostPlayedSport(['football', 'badminton', 'cricket'] as never, feed as never, 'me'), 'badminton', 'games you only follow never count');
  assert.equal(mostPlayedSport(['football', 'badminton'] as never, [m('badminton', { home: ['me'] }), m('football', { home: ['me'] })] as never, 'me'), 'football', 'a tie goes to the first listed');
  assert.equal(mostPlayedSport(['football'] as never, [] as never, 'me'), null);
  assert.equal(mostPlayedSport(['football'] as never, feed as never, null), null);
  assert.equal(mostPlayedSport([] as never, feed as never, 'me'), null);
  const h = read('src/screens/HomeScreen.tsx');
  assert.match(h, /mostPlayedSport\(/);
  assert.match(h, /🏅/);
});

test('HS2/HS4: the fold opens a Your sports page with a back arrow', () => {
  const h = read('src/screens/HomeScreen.tsx');
  assert.match(h, /navigate\('YourSports'\)/);
  assert.doesNotMatch(h, /Show less|sportsOpen/);
  const r = read('src/navigation/RootNavigator.tsx');
  assert.match(r, /name="YourSports"/);
  assert.match(r, /'YourSports'/, 'a stack screen (centred column on wide web)');
  assert.match(read('src/navigation/types.ts'), /YourSports: undefined;/);
  const y = read('src/screens/YourSportsScreen.tsx');
  assert.match(y, /yourSports\(/);
  assert.match(y, /sportTarget\(/);
  assert.match(y, /EmptyState/);
  assert.match(y, /loading \? \(\s*<LoadingState/, 'no empty-state flash while matches load');
  assert.match(y, /TryNewSport/);
});

test('HS3/HS6: one target for a sport, never a stranger’s tournament', () => {
  const mine = [{ id: 't1', name: 'Cup', sports: ['football'] }, { id: 't2', name: 'Shield', sports: ['badminton', 'football'] }];
  assert.deepEqual(sportTarget('badminton' as never, mine as never, 'p1'), { name: 'SportHub', params: { tournamentId: 't2', sport: 'badminton', tournamentName: 'Shield' } });
  assert.deepEqual(sportTarget('tennis' as never, mine as never, 'p1'), { name: 'SportProfile', params: { playerId: 'p1', sport: 'tennis' } });
  assert.deepEqual(sportTarget('tennis' as never, mine as never, null), { name: 'Tabs', params: { screen: 'Discover', params: { in: 'tournaments' } } });
  assert.match(read('src/screens/HomeScreen.tsx'), /sportTarget\(/);
});

test('HS5: no tournament filter on Home; every match shows', () => {
  const h = read('src/screens/HomeScreen.tsx');
  assert.doesNotMatch(h, /selectedId|Tournament switcher/);
  assert.doesNotMatch(h, /<Text style=\{st\.eyebrow\}>Tournament<\/Text>/);
});

test('600 users: the icon is always one of their sports, or none', () => {
  let seed = 5;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const SP = ['football', 'cricket', 'badminton', 'tennis', 'chess', 'kabaddi'];
  for (let u = 0; u < 600; u++) {
    const mine = SP.filter(() => rnd() < 0.5);
    const feed = Array.from({ length: Math.floor(rnd() * 30) }, () => m(SP[Math.floor(rnd() * SP.length)], rnd() < 0.5 ? { home: ['me'] } : {}));
    const top = mostPlayedSport(mine as never, feed as never, 'me');
    if (top === null) assert.ok(mine.every((s) => !feed.some((g) => g.sport === s && g.homeTeam.roster.includes('me'))) || !mine.length);
    else {
      assert.ok(mine.includes(top));
      const n = (s: string) => feed.filter((g) => g.sport === s && g.homeTeam.roster.includes('me')).length;
      assert.ok(mine.every((s) => n(s) <= n(top)), `${u}: ${top} is the most`);
    }
  }
});
