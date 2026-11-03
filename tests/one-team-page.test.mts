/** One team page wherever it's opened (docs/security/breaks/one-team-page.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamRoute, squadIds, discoverTeams, clubFollow } from '../src/core/teamPage.ts';

test('TP1/TP9: a club row opens the club page; others stay', () => {
  assert.deepEqual(teamRoute({ id: 't1', clubId: 'c1', sport: 'football' }), { route: 'ClubHome', clubId: 'c1', sport: 'football' });
  assert.deepEqual(teamRoute({ id: 't2' }), { route: 'Team' });
  assert.deepEqual(teamRoute(null), { route: 'Team' });
});

test('TP2: the sport view inside a club never redirects', () => {
  assert.deepEqual(teamRoute({ id: 't1', clubId: 'c1', sport: 'football' }, { inClub: true }), { route: 'Team' });
});

test('TP5: squad = picked roster, else derived, else club members', () => {
  assert.deepEqual(squadIds(['a'], ['b'], ['c']), ['a']);
  assert.deepEqual(squadIds([], ['b'], ['c']), ['b']);
  assert.deepEqual(squadIds(null, [], ['c', 'c', 'd']), ['c', 'd']);
  assert.deepEqual(squadIds(undefined, undefined, undefined), []);
});

test('TP6/TP7: one-offs left out; a club collapses to one entry', () => {
  const rows = [
    { id: 'f1', clubId: 'c', sport: 'football' as const },
    { id: 'c1', clubId: 'c', sport: 'cricket' as const },
    { id: 'adhoc', adhoc: true, sport: 'football' as const },
    { id: 'red', sport: 'football' as const },
  ];
  const sums = [
    { id: 'f1', name: 'Fnatic', sports: ['football' as const] },
    { id: 'c1', name: 'Fnatic', sports: ['cricket' as const] },
    { id: 'adhoc', name: 'Fnatic Team 1 Thursday', sports: ['football' as const] },
    { id: 'red', name: 'Red House', sports: ['football' as const] },
    { id: 'gone', name: 'Old row', sports: ['tennis' as const] },
  ];
  const out = discoverTeams(sums, rows);
  assert.deepEqual(out.map((t) => [t.id, t.sports, t.teamIds, t.clubId]), [
    ['f1', ['football', 'cricket'], ['f1', 'c1'], 'c'],
    ['red', ['football'], ['red'], undefined],
    ['gone', ['tennis'], ['gone'], undefined],
  ]);
});

test('TP4: club follow covers every row', () => {
  const f = (ids: string[]) => (id: string) => ids.includes(id);
  assert.deepEqual(clubFollow(['a', 'b'], f([])), { following: false, toFollow: ['a', 'b'], toUnfollow: [] });
  assert.deepEqual(clubFollow(['a', 'b'], f(['a'])), { following: false, toFollow: ['b'], toUnfollow: [] });
  assert.deepEqual(clubFollow(['a', 'b'], f(['a', 'b'])), { following: true, toFollow: [], toUnfollow: ['a', 'b'] });
  assert.deepEqual(clubFollow([], f([])), { following: false, toFollow: [], toUnfollow: [] });
});

test('TP8: followed rows collapse per club; one-offs you follow stay', async () => {
  const { collapseClubs } = await import('../src/core/teamPage.ts');
  const out = collapseClubs([
    { id: 'f', name: 'Fnatic', sport: 'football', clubId: 'c' },
    { id: 'x', name: 'Fnatic Team 1 Thursday', sport: 'football' },
    { id: 'k', name: 'Fnatic', sport: 'cricket', clubId: 'c' },
  ]);
  assert.deepEqual(out.map((t) => [t.id, t.sports, t.teamIds]), [['f', ['football', 'cricket'], ['f', 'k']], ['x', ['football'], ['x']]]);
});
