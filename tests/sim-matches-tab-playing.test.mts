/** 600 simulated users, each with a random mix of games they play, run, both,
 *  or only follow: every game sits in exactly one view, playing is exactly
 *  "on a side", and no idle live game is ever under Live. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesView } from '../src/core/myMatches.ts';
import { isStaleLive } from '../src/core/staleLive.ts';

let seed = 4242;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const NOW = Date.parse('2026-11-04T12:00:00Z');
const STATUSES = ['scheduled', 'live', 'completed', 'postponed', 'cancelled'];
const SPORTS = ['football', 'tennis', 'padel'];

test('600 users: one view per game, playing = on a side, no stale Live', () => {
  for (let u = 0; u < 600; u++) {
    const me = `p${u}`;
    const playingTeamIds = new Set<string>();
    const games: any[] = [];
    const truth = new Map<string, boolean>();
    const n = 1 + rnd(12);
    for (let i = 0; i < n; i++) {
      const id = `u${u}g${i}`;
      const how = rnd(5); // 0 roster, 1 member team, 2 host only, 3 host+roster, 4 club-admin team only
      const home: any = { id: `${id}h` }, away: any = { id: `${id}a`, roster: ['x'] };
      if (how === 0 || how === 3) (rnd(2) ? home : away).roster = [me, 'y'];
      if (how === 1) playingTeamIds.add(home.id);
      const status = STATUSES[rnd(5)];
      const ageH = rnd(48);
      games.push({
        id, sport: SPORTS[rnd(3)], status, startsAt: new Date(NOW + (rnd(200) - 100) * 3600e3).toISOString(),
        updatedAt: rnd(6) ? new Date(NOW - ageH * 3600e3).toISOString() : undefined,
        homeTeam: home, awayTeam: away, hostIds: how >= 2 ? [me] : [],
      });
      truth.set(id, how <= 1 || how === 3);
    }
    if (rnd(10) === 0) games.push(null);
    const sport = rnd(3) ? 'all' : SPORTS[rnd(3)];
    const p = matchesView(games, { playingTeamIds, playerId: me, view: 'playing', sport, now: NOW });
    const r = matchesView(games, { playingTeamIds, playerId: me, view: 'running', sport, now: NOW });
    const ids = (v: typeof p) => [...v.live, ...v.upcoming, ...v.completed, ...v.notFinished].map((g) => g.id);
    const pi = ids(p), ri = ids(r);
    const real = games.filter((g) => g && (sport === 'all' || g.sport === sport));
    assert.equal(new Set([...pi, ...ri]).size, pi.length + ri.length, 'a game in both views');
    assert.equal(pi.length + ri.length, real.length, 'a game lost');
    for (const id of pi) assert.equal(truth.get(id), true, `${id} in Playing but not on a side`);
    for (const id of ri) assert.equal(truth.get(id), false, `${id} in Running but plays`);
    assert.equal(p.counts.playing, pi.length);
    assert.equal(p.counts.running, ri.length);
    for (const v of [p, r]) {
      for (const g of v.live) assert.equal(isStaleLive(g, NOW), false);
      for (const g of v.notFinished) assert.equal(isStaleLive(g, NOW), true);
      assert.equal(v.tabCounts.completed, v.completed.length + v.notFinished.length);
    }
  }
});
