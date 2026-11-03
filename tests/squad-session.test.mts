/** Squad sessions — the pure rules (docs/security/breaks/squad-sessions.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, cleanRules, pickTurn, available, teamRosters, shareRest,
  nextGame, sessionTable, captainsDraw, type SessionGame,
} from '../src/core/squadSession.ts';

const P = Array.from({ length: 15 }, (_, i) => `p${i + 1}`);

test('SS7: rules are cleaned to safe ranges', () => {
  assert.deepEqual(cleanRules(undefined), DEFAULT_RULES);
  const r = cleanRules({ teams: 50, rotation: 'chaos', pickOrder: 'x', points: { win: -2, draw: 99, loss: 'a' }, maxWins: 0, drawRule: 'nope' } as any);
  assert.equal(r.teams, 8);
  assert.equal(r.rotation, 'round_robin');
  assert.equal(r.pickOrder, 'snake');
  assert.deepEqual(r.points, { win: 0, draw: 10, loss: 0 });
  assert.equal(r.maxWins, 1);
  assert.equal(r.drawRule, 'longer_on_goes_off');
  assert.equal(cleanRules({ teams: 1 }).teams, 2);
  assert.equal(cleanRules({ teams: 3.7 }).teams, 3);
});

test('SS2: snake order 1,2,3,3,2,1 and straight 1,2,3,1,2,3', () => {
  const caps = ['a', 'b', 'c'];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => pickTurn(caps, n, 'snake')), ['a', 'b', 'c', 'c', 'b', 'a', 'a']);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => pickTurn(caps, n, 'straight')), ['a', 'b', 'c', 'a', 'b', 'c']);
  assert.equal(pickTurn([], 0, 'snake'), null);
});

test('SS3: available = present, not a captain, not yet picked', () => {
  const caps = ['p1', 'p2', 'p3'];
  const picks = [{ captain: 'p1', player: 'p4' }];
  const a = available(P, caps, picks);
  assert.equal(a.includes('p1'), false);
  assert.equal(a.includes('p4'), false);
  assert.equal(a.length, 11);
});

test('teams: captain first, then their picks in order', () => {
  const caps = ['p1', 'p2'];
  const picks = [{ captain: 'p1', player: 'p5' }, { captain: 'p2', player: 'p6' }, { captain: 'p2', player: 'p7' }];
  assert.deepEqual(teamRosters(caps, picks), [['p1', 'p5'], ['p2', 'p6', 'p7']]);
});

test('share the rest: follows the pick order until nobody is left', () => {
  const caps = ['p1', 'p2', 'p3'];
  const picks = [{ captain: 'p1', player: 'p4' }];
  const rest = shareRest(P, caps, picks, 'snake');
  const all = teamRosters(caps, [...picks, ...rest]);
  assert.equal(all.flat().length, 15);
  assert.equal(new Set(all.flat()).size, 15);
  assert.deepEqual(all.map((t) => t.length), [5, 5, 5]);
  assert.equal(rest[0].captain, 'p2');
});

test('random captains: the right number, all present, no repeats', () => {
  let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = captainsDraw(P, 3, rnd);
  assert.equal(c.length, 3);
  assert.equal(new Set(c).size, 3);
  for (const x of c) assert.ok(P.includes(x));
  assert.deepEqual(captainsDraw(['a'], 3, rnd), ['a']);
});

const done = (home: number, away: number, winner: 'home' | 'away' | 'draw'): SessionGame => ({ home, away, status: 'completed', winner });

test('SS11: round robin with 3 teams goes 1v2, 2v3, 3v1, then repeats', () => {
  const r = cleanRules({ teams: 3 });
  const games: SessionGame[] = [];
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const g = nextGame(3, games, r)!;
    seen.push(`${g.home + 1}v${g.away + 1}`);
    games.push(done(g.home, g.away, i % 2 ? 'home' : 'away'));
  }
  assert.deepEqual(seen, ['1v2', '2v3', '3v1', '1v2', '2v3', '3v1']);
});

test('SS8: no next game while one is open', () => {
  const r = cleanRules({ teams: 3 });
  assert.equal(nextGame(3, [{ home: 0, away: 1, status: 'live' }], r), null);
  assert.equal(nextGame(3, [{ home: 0, away: 1, status: 'scheduled' }], r), null);
});

test('SS12: winner stays, capped; a draw sends the team on longer off', () => {
  const r = cleanRules({ teams: 3, rotation: 'winner_stays', maxWins: 2 });
  const g1 = nextGame(3, [], r)!;
  assert.deepEqual([g1.home, g1.away], [0, 1]);
  // team 1 (index 0) wins → stays, team 3 comes on
  const g2 = nextGame(3, [done(0, 1, 'home')], r)!;
  assert.deepEqual([g2.home, g2.away], [0, 2]);
  // index 0 wins again → 2 in a row = cap → it goes off; the two others play
  const g3 = nextGame(3, [done(0, 1, 'home'), done(0, 2, 'home')], r)!;
  assert.deepEqual([g3.home, g3.away].sort(), [1, 2]);
  // a draw: index 0 has been on for two games, index 2 for one → 0 goes off
  const g4 = nextGame(3, [done(0, 1, 'home'), done(0, 2, 'draw')], r)!;
  assert.deepEqual([g4.home, g4.away], [2, 1]);
});

test('session table: points from the rules, sorted by points then wins', () => {
  const r = cleanRules({ teams: 3 });
  const t = sessionTable(3, [done(0, 1, 'home'), done(1, 2, 'draw'), done(2, 0, 'home'), { home: 0, away: 1, status: 'live' }], r.points);
  assert.deepEqual(t.map((x) => [x.team, x.played, x.won, x.drawn, x.lost, x.points]), [
    [2, 2, 1, 1, 0, 4], [0, 2, 1, 0, 1, 3], [1, 2, 0, 1, 1, 1],
  ]);
});

test('two teams: always 1v2, alternating nothing odd', () => {
  const r = cleanRules({ teams: 2 });
  const g = nextGame(2, [done(0, 1, 'home'), done(0, 1, 'away')], r)!;
  assert.deepEqual([g.home, g.away].sort(), [0, 1]);
});

test('matches → games by team index; strangers and nulls skipped', async () => {
  const { asSessionGames, sittingOut } = await import('../src/core/squadSession.ts');
  const g = asSessionGames(['a', 'b', 'c'], [
    { homeTeam: { id: 'b' }, awayTeam: { id: 'c' }, status: 'completed', winner: 'away' },
    { homeTeam: { id: 'x' }, awayTeam: { id: 'c' }, status: 'live' },
    null,
  ]);
  assert.deepEqual(g, [{ home: 1, away: 2, status: 'completed', winner: 'away' }]);
  assert.deepEqual(sittingOut(4, { home: 0, away: 2 }), [1, 3]);
});

test('SS18: pick on own phones by default; "shared" is the only other value', () => {
  assert.equal(cleanRules({}).pickOn, 'own');
  assert.equal(cleanRules({ pickOn: 'shared' } as any).pickOn, 'shared');
  assert.equal(cleanRules({ pickOn: 'anyone' } as any).pickOn, 'own');
});
