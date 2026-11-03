/** 600 simulated players: random doubles rows (duplicates, several sports,
 *  singles, threes, placeholders) and games. Each pair appears once with every
 *  row of exactly those two; its record adds up and only counts its own
 *  finished games; stats only the two players' numbers from those games. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairKey, pairsFromTeams, pairRecord, pairStats } from '../src/core/pairs.ts';

let seed = 77;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const SPORTS = ['tennis', 'badminton', 'padel', 'pool'] as const;

test('600 players and their pairs', () => {
  for (let u = 0; u < 600; u++) {
    const me = `u${u}`;
    const people = [me, ...Array.from({ length: 5 }, (_, i) => `u${u}f${i}`)];
    const rows: { id: string; sport: (typeof SPORTS)[number]; roster: string[] | null; adhoc: boolean }[] = [];
    for (let i = 0; i < 4 + rnd(12); i++) {
      const kind = rnd(6);
      const pick = () => people[rnd(people.length)];
      const roster = kind === 0 ? [pick()] : kind === 1 ? [pick(), pick(), pick()] : kind === 2 ? null : [pick(), pick()];
      rows.push({ id: `u${u}r${i}`, sport: SPORTS[rnd(4)], roster, adhoc: rnd(8) !== 0 });
    }
    const pairs = pairsFromTeams(rows, me);
    assert.equal(new Set(pairs.map((p) => p.key)).size, pairs.length, 'a pair twice');
    for (const p of pairs) {
      assert.ok(p.a === me || p.b === me);
      assert.notEqual(p.a, p.b);
      const expect = rows.filter((r) => r.adhoc && pairKey(r.roster) === p.key).map((r) => r.id);
      assert.deepEqual([...p.teamIds].sort(), expect.sort(), 'rows lost or added');
    }
    // every adhoc 2-person row with me lands in a pair
    for (const r of rows) if (r.adhoc && pairKey(r.roster)?.split('|').includes(me)) assert.ok(pairs.some((p) => p.teamIds.includes(r.id)));

    const matches = Array.from({ length: 5 + rnd(20) }, (_, i) => {
      const home = rows[rnd(rows.length)].id, away = rows[rnd(rows.length)].id;
      const w = rnd(4);
      return { id: `u${u}m${i}`, sport: SPORTS[rnd(4)], status: rnd(4) ? 'completed' : 'live', homeTeam: { id: home }, awayTeam: { id: away },
        winner: (w === 0 ? 'home' : w === 1 ? 'away' : w === 2 ? 'draw' : undefined) as 'home' | 'away' | 'draw' | undefined, startsAt: `2026-10-${String(1 + rnd(28)).padStart(2, '0')}` };
    });
    for (const p of pairs) {
      const ids = new Set(p.teamIds);
      const r = pairRecord(ids, matches);
      const own = matches.filter((m) => ids.has(m.homeTeam.id) !== ids.has(m.awayTeam.id));
      assert.equal(r.matchIds.length, own.length);
      assert.equal(r.overall.played, own.filter((m) => m.status === 'completed').length);
      assert.equal(r.overall.played, r.overall.won + r.overall.drawn + r.overall.lost);
      assert.equal(r.bySport.reduce((n, s) => n + s.played, 0), r.overall.played);
      const done = new Set(own.filter((m) => m.status === 'completed').map((m) => m.id));
      const lines = matches.flatMap((m) => people.map((pid) => ({ matchId: m.id, playerId: pid, sport: m.sport, stats: { pts: 1 + rnd(3) } })));
      const st = pairStats(lines, [p.a, p.b], done);
      const total = Object.values(st).reduce((n, s) => n + (s.pts ?? 0), 0);
      const want = lines.filter((l) => done.has(l.matchId) && (l.playerId === p.a || l.playerId === p.b)).reduce((n, l) => n + l.stats.pts, 0);
      assert.equal(total, want);
    }
  }
});
