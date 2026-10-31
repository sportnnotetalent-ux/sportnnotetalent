/**
 * Quality mandate step 6 for the "Time up" tiebreak option
 * (docs/security/breaks/mvp-time-up-rule.md): 500 padel / tennis / badminton
 * matches stopped at random, under both rules. Sets always decide first; when
 * level, "games" counts every game played and "set" only the set in play.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeUpLeader, type TimeUpRule } from '../src/core/timeUp.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { LineScore } from '../src/sports/scoreline.ts';

let seed = 83;
// the high bits: the low bit of this generator just alternates
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type E = { init: (c?: object) => unknown; reducer: (s: never, a: ScoreAction) => unknown; lineScore: (s: never) => LineScore | null };
const engines: E[] = [padel as unknown as E, tennis as unknown as E, badminton as unknown as E];
const sum = (cells: { home: number; away: number }[]) => cells.reduce((t, c) => ({ h: t.h + c.home, a: t.a + c.away }), { h: 0, a: 0 });
const pick = (t: { h: number; a: number }) => (t.h === t.a ? null : t.h > t.a ? 'home' : 'away');

test('500 matches stopped on time, under both rules', () => {
  let differ = 0;
  for (let i = 0; i < 500; i++) {
    const e = engines[i % 3];
    let s = e.init({});
    const n = 40 + rnd(400);
    for (let k = 0; k < n; k++) {
      const x = e.reducer(s as never, { type: 'POINT', side: rnd(2) ? 'home' : 'away' } as ScoreAction) as { ended?: boolean };
      if (x.ended) break;
      s = x;
    }
    const ls = e.lineScore(s as never)!;
    const by: Record<TimeUpRule, 'home' | 'away' | null> = { games: timeUpLeader(ls, 'games'), set: timeUpLeader(ls, 'set') };
    if (ls.won.home !== ls.won.away) {
      const w = ls.won.home > ls.won.away ? 'home' : 'away';
      assert.equal(by.games, w); assert.equal(by.set, w);
    } else {
      assert.equal(by.games, pick(sum(ls.current ? [...ls.done, ls.current] : ls.done)));
      assert.equal(by.set, pick(sum(ls.current ? [ls.current] : [])));
      if (by.games !== by.set) differ++;
    }
  }
  assert.ok(differ > 0, 'some matches come out differently under the two rules');
});
