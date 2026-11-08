/** Teams for doubles, phase 5 (docs/security/breaks/team-pages.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamRoute, pairTarget } from '../src/core/teamPage.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (f: string) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

test('PG1: a two-person team opens its team page (or club), never a Pair page', () => {
  assert.deepEqual(teamRoute({ id: 't', adhoc: true, sport: 'badminton', roster: ['a', 'b'] }, { pairSport: () => true }), { route: 'Team' });
  assert.deepEqual(teamRoute({ id: 't', adhoc: true, clubId: 'c', sport: 'badminton', roster: ['a', 'b'] }), { route: 'ClubHome', clubId: 'c', sport: 'badminton' });
});

test('PG2/PG5/PG6: old pair links go to the team — a club first', () => {
  assert.deepEqual(pairTarget([{ id: 't2', sport: 'tennis' }, { id: 't1', sport: 'badminton', clubId: 'c9' }]), { route: 'ClubHome', clubId: 'c9' });
  assert.deepEqual(pairTarget([{ id: 't2' }, { id: 't1' }]), { route: 'Team', teamId: 't1' });
  assert.equal(pairTarget([]), null);
});

test('PG3: the redirect looks up every team with both players', () => {
  const s = read('src/data/repos.ts');
  assert.match(s, /export async function getTeamsWithPlayers/);
  const fn = s.slice(s.indexOf('export async function getTeamsWithPlayers'), s.indexOf('export async function getTeamsWithPlayers') + 900);
  assert.doesNotMatch(fn, /\.eq\('adhoc', true\)|t\.adhoc &&/);
  const pair = read('src/screens/PairProfileScreen.tsx');
  assert.match(pair, /getTeamsWithPlayers\(/);
  assert.match(pair, /pairTarget\(/);
  assert.match(pair, /nav\.replace\(/);
  assert.match(pair, /No team found for these two players/);
});

test('PG4: no "Pairs" lists; they open team pages', () => {
  assert.doesNotMatch(code('src/components/PairsAndFollowing.tsx'), /title="Pairs"|nav\.navigate\('Pair'/);
  assert.doesNotMatch(code('src/screens/ClubsScreen.tsx'), />Your pairs<|nav\.navigate\('Pair'/);
  assert.doesNotMatch(code('src/components/MineCard.tsx'), /your pairs/);
  assert.doesNotMatch(code('src/screens/TeamProfileScreen.tsx'), /nav\.replace\('Pair'/);
});

test('600 lookups: a club always wins; the choice never depends on order', () => {
  let seed = 51;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const rows = Array.from({ length: Math.floor(rnd() * 5) }, (_, i) => ({ id: `t${u}-${Math.floor(rnd() * 99)}-${i}`, ...(rnd() < 0.2 ? { clubId: `c${u}` } : {}) }));
    const a = pairTarget(rows), b = pairTarget([...rows].reverse());
    assert.deepEqual(a, b, `${u}: order-independent`);
    if (!rows.length) assert.equal(a, null);
    else if (rows.some((r) => r.clubId)) assert.equal(a!.route, 'ClubHome');
  }
});

test('PG7: team managers can rename from the team page', () => {
  const s = read('src/screens/TeamProfileScreen.tsx');
  assert.match(s, /canManageSquad \? \(\s*<Button label="✎ Rename or edit team"[^>]*onPress=\{\(\) => nav\.navigate\('EditTeam', \{ teamId: team\.id \}\)\}/);
});
