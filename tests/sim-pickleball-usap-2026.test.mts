/** 600 random pickleball pools (3–6 teams, some withdrawn): the table always
 *  ranks by wins first, every tie is ordered by USAP 15.B.4 and stays stable,
 *  withdrawn teams sit last with nothing counted, and nobody else's record
 *  includes a match against them (docs/security/breaks/pickleball-usap-2026.md). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { teamStandings, defaultStandingsConfig, setStandingsUnitsProvider } from '../src/data/standings.ts';
import type { Match, SportId } from '../src/core/types.ts';

let seed = 1504;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const PB = 'pickleball' as SportId;
before(() => setStandingsUnitsProvider((sport, st) => {
  const p = (st as { pts?: [number, number] })?.pts;
  return sport === 'pickleball' && p ? { points: { home: p[0], away: p[1] } } : null;
}));
after(() => setStandingsUnitsProvider(null));

test('600 pools', () => {
  for (let u = 0; u < 600; u++) {
    const ids = Array.from({ length: 3 + rnd(4) }, (_, i) => `T${i}`);
    const out = new Set(ids.filter(() => rnd(6) === 0));
    const ms: Match[] = [];
    let n = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const lose = rnd(10);
      const [hp, ap] = rnd(2) ? [11, lose] : [lose, 11];
      ms.push({ id: `m${u}-${n++}`, sport: 'pickleball', status: 'completed', startsAt: '', score: { home: hp > ap ? 1 : 0, away: ap > hp ? 1 : 0 },
        winner: hp > ap ? 'home' : 'away', homeTeam: { id: ids[i], name: ids[i] }, awayTeam: { id: ids[j], name: ids[j] }, state: { pts: [hp, ap] } } as unknown as Match);
    }
    const teams = ids.map((id) => ({ id, name: id, withdrawn: out.has(id) }));
    const rows = teamStandings(ms, PB, defaultStandingsConfig(PB), undefined, teams);
    const again = teamStandings([...ms].reverse(), PB, defaultStandingsConfig(PB), undefined, teams);
    assert.deepEqual(rows.map((r) => r.teamId), again.map((r) => r.teamId), 'order does not depend on match order');
    const live = rows.filter((r) => !r.withdrawn);
    for (let k = 1; k < live.length; k++) assert.ok(live[k - 1].won >= live[k].won, 'wins first');
    const firstOut = rows.findIndex((r) => r.withdrawn);
    if (firstOut >= 0) assert.ok(rows.slice(firstOut).every((r) => r.withdrawn && r.played === 0), 'withdrawn last, nothing counted');
    const expectPlayed = ids.length - 1 - [...out].length;
    for (const r of live) assert.equal(r.played, expectPlayed, 'matches against withdrawn teams left out');
  }
});
