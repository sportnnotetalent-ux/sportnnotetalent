/** My teams + pair teams (docs/security/breaks/pairs-and-my-teams.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairKey, pairsFromTeams, pairRecord, pairStats, myTeamsView } from '../src/core/pairs.ts';
import { teamRoute } from '../src/core/teamPage.ts';

test('PT4: exactly two different people', () => {
  assert.equal(pairKey(['b', 'a']), 'a|b');
  assert.equal(pairKey(['a']), null);
  assert.equal(pairKey(['a', 'a']), null);
  assert.equal(pairKey(['a', 'b', 'c']), null);
  assert.equal(pairKey(null), null);
  assert.equal(pairKey(['a', '']), null);
});

test('PT3: one pair across sports and duplicate rows', () => {
  const rows = [
    { id: 't1', sport: 'tennis' as const, roster: ['me', 'v'], adhoc: true },
    { id: 't2', sport: 'tennis' as const, roster: ['v', 'me'], adhoc: true },
    { id: 'b1', sport: 'badminton' as const, roster: ['me', 'v'], adhoc: true },
    { id: 'p1', sport: 'pool' as const, roster: ['me', 'k'], adhoc: true },
    { id: 'club', sport: 'football' as const, roster: ['me', 'v'], adhoc: false },
    { id: 'solo', sport: 'tennis' as const, roster: ['me'], adhoc: true },
  ];
  const ps = pairsFromTeams(rows, 'me');
  assert.deepEqual(ps.map((p) => [p.key, p.teamIds, p.sports]), [
    ['k|me', ['p1'], ['pool']],
    ['me|v', ['t1', 't2', 'b1'], ['tennis', 'badminton']],
  ]);
  assert.deepEqual(pairsFromTeams(rows, 'nobody'), []);
});

const m = (id: string, sport: string, home: string, away: string, status: string, winner?: 'home' | 'away' | 'draw', at = '2026-11-01') =>
  ({ id, sport, status, homeTeam: { id: home }, awayTeam: { id: away }, winner, startsAt: at });

test('PT5: finished games only, per sport and overall', () => {
  const ids = new Set(['t1', 'b1']);
  const r = pairRecord(ids, [
    m('1', 'tennis', 't1', 'x', 'completed', 'home', '2026-11-01'),
    m('2', 'tennis', 'y', 't1', 'completed', 'home', '2026-11-02'),
    m('3', 'badminton', 'b1', 'z', 'completed', 'home', '2026-11-03'),
    m('4', 'badminton', 'b1', 'z', 'live', undefined, '2026-11-05'),
    m('5', 'tennis', 'other', 'x', 'completed', 'home'),
    m('6', 'pool', 'b1', 'q', 'completed', 'draw', '2026-11-04'),
  ]);
  assert.deepEqual(r.overall, { played: 4, won: 2, drawn: 1, lost: 1, winPct: 50 });
  assert.deepEqual(r.bySport.map((s) => [s.sport, s.played, s.won, s.lost]), [['tennis', 2, 1, 1], ['badminton', 1, 1, 0], ['pool', 1, 0, 0]]);
  assert.deepEqual(r.matchIds, ['4', '6', '3', '2', '1']);
});

test('PT6: only the two players, only the pair\'s games', () => {
  const s = pairStats([
    { matchId: '1', playerId: 'me', sport: 'tennis', stats: { aces: 2, winners: 5 } },
    { matchId: '1', playerId: 'v', sport: 'tennis', stats: { aces: 1 } },
    { matchId: '1', playerId: 'x', sport: 'tennis', stats: { aces: 9 } },
    { matchId: '9', playerId: 'me', sport: 'tennis', stats: { aces: 7 } },
  ] as any, ['me', 'v'], new Set(['1']));
  assert.deepEqual(s, { tennis: { aces: 3, winners: 5 } });
});

test('PT1/PT2: my teams = on or played for; run separately; one-offs never teams', () => {
  const T = (id: string, o: Record<string, unknown> = {}) => ({ id, name: id, sport: 'football' as const, ...o });
  const v = myTeamsView({
    me: 'me',
    teams: [T('on', { roster: ['me'] }), T('played'), T('run'), T('member'), T('adhoc', { adhoc: true, roster: ['me', 'v'] }), T('clubrow', { clubId: 'c' })],
    playingIds: new Set(['on', 'member']), playedIds: new Set(['played']), managedIds: new Set(['run', 'on']),
  });
  assert.deepEqual(v.playFor.map((t) => t.id), ['member', 'on', 'played']);
  assert.deepEqual(v.run.map((t) => t.id), ['run']);
  assert.deepEqual(v.pairs.map((p) => p.key), ['me|v']);
});

test('PT7: a two-person one-off side opens the pair page', () => {
  assert.deepEqual(teamRoute({ id: 't', adhoc: true, roster: ['v', 'me'] } as any), { route: 'Pair', a: 'me', b: 'v' });
  assert.deepEqual(teamRoute({ id: 't', adhoc: true, roster: ['v', 'me', 'k'] } as any), { route: 'Team' });
  assert.deepEqual(teamRoute({ id: 't', adhoc: false, roster: ['v', 'me'] } as any), { route: 'Team' });
});

test('PT4b: a two-person side in a TEAM sport (a game-day football side) is not a pair', () => {
  const pairSport = (s: string) => s !== 'football';
  const rows = [
    { id: 'f', sport: 'football' as const, roster: ['me', 'd'], adhoc: true },
    { id: 't', sport: 'tennis' as const, roster: ['me', 'd'], adhoc: true },
  ];
  assert.deepEqual(pairsFromTeams(rows, 'me', pairSport).map((p) => p.teamIds), [['t']]);
  assert.deepEqual(teamRoute({ id: 'f', adhoc: true, roster: ['me', 'd'], sport: 'football' } as any, { pairSport }), { route: 'Team' });
  assert.deepEqual(teamRoute({ id: 't', adhoc: true, roster: ['me', 'd'], sport: 'tennis' } as any, { pairSport }), { route: 'Pair', a: 'd', b: 'me' });
  const v = myTeamsView({ me: 'me', teams: rows.map((r) => ({ ...r, name: r.id })), playingIds: new Set(), playedIds: new Set(), managedIds: new Set(), pairSport });
  assert.deepEqual(v.pairs.map((p) => p.teamIds), [['t']]);
});
