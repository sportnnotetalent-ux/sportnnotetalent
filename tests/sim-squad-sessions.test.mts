/** 600 simulated game days: random squads (2–30 players, 2–8 teams), random
 *  captains, picks in turn with "share the rest" at a random point, then
 *  10–40 games with random results under both rotations. Teams always split
 *  everyone exactly once, evenly; games are always valid; round robin stays
 *  fair; winner stays respects its cap; the table adds up. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  available, captainsDraw, cleanRules, nextGame, pickTurn, sessionTable, shareRest, teamRosters, type Pick, type SessionGame,
} from '../src/core/squadSession.ts';

let seed = 20261105;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const frac = () => rnd(1_000_000) / 1_000_000;

test('600 game days', () => {
  for (let day = 0; day < 600; day++) {
    const n = 2 + rnd(29);
    const players = Array.from({ length: n }, (_, i) => `d${day}p${i}`);
    const rules = cleanRules({
      teams: 2 + rnd(Math.min(7, n - 1)), rotation: rnd(2) ? 'winner_stays' : 'round_robin',
      pickOrder: rnd(2) ? 'snake' : 'straight', maxWins: 1 + rnd(4), drawRule: rnd(2) ? 'both_off' : 'longer_on_goes_off',
    });
    const captains = captainsDraw(players, rules.teams, frac);
    assert.equal(captains.length, rules.teams);
    // picks: each turn's captain takes a random available player; maybe share the rest early
    let picks: Pick[] = [];
    const stopAt = rnd(3) ? Infinity : rnd(n);
    while (available(players, captains, picks).length && picks.length < stopAt) {
      const left = available(players, captains, picks);
      picks.push({ captain: pickTurn(captains, picks.length, rules.pickOrder)!, player: left[rnd(left.length)] });
    }
    picks = [...picks, ...shareRest(players, captains, picks, rules.pickOrder)];
    const rosters = teamRosters(captains, picks);
    const all = rosters.flat();
    assert.equal(all.length, n, 'everyone on a team');
    assert.equal(new Set(all).size, n, 'nobody twice');
    const sizes = rosters.map((r) => r.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `uneven teams ${sizes}`);

    const games: SessionGame[] = [];
    const total = 10 + rnd(31);
    for (let g = 0; g < total; g++) {
      const x = nextGame(rules.teams, games, rules);
      assert.ok(x, 'a next game when none is open');
      assert.notEqual(x!.home, x!.away);
      assert.ok(x!.home >= 0 && x!.home < rules.teams && x!.away >= 0 && x!.away < rules.teams);
      games.push({ ...x!, status: 'live' });
      assert.equal(nextGame(rules.teams, games, rules), null, 'no next game while one is open');
      const r = rnd(3);
      games[games.length - 1] = { ...x!, status: 'completed', winner: r === 0 ? 'home' : r === 1 ? 'away' : 'draw' };
      if (rnd(15) === 0) games.push({ home: 0, away: 1, status: 'cancelled' }); // ignored either way
    }
    const played = games.filter((q) => q.status === 'completed');
    const counts = Array.from({ length: rules.teams }, (_, t) => played.filter((q) => q.home === t || q.away === t).length);
    if (rules.rotation === 'round_robin') {
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `unfair round robin ${counts}`);
    } else if (rules.teams > 2) {
      let streak = 0, holder = -1;
      for (const q of played) {
        const w = q.winner === 'home' ? q.home : q.winner === 'away' ? q.away : -1;
        if (w >= 0 && w === holder) streak++; else { holder = w; streak = w >= 0 ? 1 : 0; }
        assert.ok(streak <= rules.maxWins, 'winner stayed past the cap');
      }
      // after a capped winner, it sits out the next game
    }
    const table = sessionTable(rules.teams, games, rules.points);
    assert.equal(table.reduce((a, r) => a + r.played, 0), 2 * played.length);
    assert.equal(table.reduce((a, r) => a + r.won, 0), table.reduce((a, r) => a + r.lost, 0));
    for (const r of table) {
      assert.equal(r.played, r.won + r.drawn + r.lost);
      assert.equal(r.points, r.won * rules.points.win + r.drawn * rules.points.draw + r.lost * rules.points.loss);
    }
  }
});
