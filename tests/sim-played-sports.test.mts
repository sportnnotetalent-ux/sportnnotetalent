/** Quality mandate step 6 for Your sports (docs/security/breaks/your-sports.md): 1,000 random feeds. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yourSports } from '../src/core/playedSports.ts';

let seed = 811;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const SPORTS = ['pool', 'tennis', 'football', 'chess', 'carrom', 'badminton'];
const PEOPLE = ['me', 'a', 'b', 'c'];
const ids = () => Array.from({ length: rnd(3) }, () => PEOPLE[rnd(PEOPLE.length)]);

test('1,000 random feeds', () => {
  for (let i = 0; i < 1000; i++) {
    const declared = Array.from({ length: rnd(3) }, () => SPORTS[rnd(SPORTS.length)]);
    const feed = Array.from({ length: rnd(12) }, () => (rnd(15) === 0 ? null : {
      sport: SPORTS[rnd(SPORTS.length)], homeTeam: { roster: ids() }, awayTeam: { roster: ids() },
      ...(rnd(4) === 0 ? { scorerIds: ids() } : {}), ...(rnd(5) === 0 ? { hostIds: ids() } : {}),
    })) as never[];
    const me = rnd(10) === 0 ? null : 'me';
    const out = yourSports(declared, feed, me);
    assert.equal(new Set(out).size, out.length, 'each sport once');
    for (const d of new Set(declared)) assert.ok(out.includes(d as never), 'declared kept');
    const took = new Set((feed as Array<Record<string, any> | null>).filter((m) => m && me && [m.homeTeam.roster, m.awayTeam.roster, m.scorerIds ?? [], m.hostIds ?? []].some((r: string[]) => r.includes(me))).map((m) => m!.sport));
    for (const s of out) assert.ok(declared.includes(s) || took.has(s), `${s} only if declared or taken part`);
    for (const s of took) assert.ok(out.includes(s as never), `${s} played → listed`);
  }
});
