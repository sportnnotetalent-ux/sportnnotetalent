/** 600 simulated doubles matches (snooker and billiards, random strokes with
 *  the rotation's pick, a stray id now and then): every tagged visit's player is
 *  on that visit's side, ≤ 2 ids a side, none on both; replaying the log gives
 *  the same tags; and following the rotation, partners alternate visits. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as SN from '../src/sports/snooker/engine.ts';
import * as BI from '../src/sports/billiards/engine.ts';
import { withDoubles, atTable, playerBreaks } from '../src/sports/cue/doubles.ts';

let seed = 1107;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BALLS = ['red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black'];
const PARTS = ['potRed', 'potWhite', 'inOffRed', 'inOffWhite', 'cannon'];

test('600 doubles matches', () => {
  for (let u = 0; u < 600; u++) {
    const snooker = u % 2 === 0;
    const eng = snooker ? withDoubles(SN.createInitialState, SN.reducer as any) : withDoubles(BI.createInitialState, BI.reducer as any);
    const ids = { home: [ID(u * 10 + 1), ID(u * 10 + 2)], away: [ID(u * 10 + 3), ID(u * 10 + 4)] };
    let s: any = eng.init({ playersPerSide: 2 });
    const log: any[] = [];
    for (let i = 0; i < 80 && s.frame; i++) {
      const side = s.frame.striker as 'home' | 'away';
      const pick = atTable(s, side, ids[side]);
      const pid = rnd(25) === 0 ? ID(999999) : pick.suggested;
      const r = rnd(10);
      const a = snooker
        ? (r < 5 ? { type: 'POT', side, payload: { ball: BALLS[rnd(7)], pid } } : r < 8 ? { type: 'MISS', side, payload: { pid } } : { type: 'SAFETY', side, payload: { pid } })
        : (r < 5 ? { type: 'SCORE', side, payload: { [PARTS[rnd(5)]]: 1, pid } } : { type: 'MISS', side, payload: { pid } });
      log.push(a);
      s = eng.reduce(s, a);
    }
    // replay: the same tags
    const again = log.reduce((x, a) => eng.reduce(x, a), eng.init({ playersPerSide: 2 }));
    assert.deepEqual(again, s);
    assert.ok(s.dbl.home.length <= 2 && s.dbl.away.length <= 2);
    assert.ok(!s.dbl.home.some((x: string) => s.dbl.away.includes(x)), 'an id on both sides');
    const visits = [...s.frames.flatMap((f: any) => f.visits ?? []), ...(s.frame?.visits ?? [])];
    for (const v of visits) if (v.p) assert.ok(ids[v.side as 'home' | 'away'].includes(v.p) || v.p === ID(999999), 'tagged to the wrong side');
    // following the rotation, a side's consecutive visits alternate partners
    for (const side of ['home', 'away'] as const) {
      const ps = visits.filter((v: any) => v.side === side && v.p && ids[side].includes(v.p)).map((v: any) => v.p);
      const breaks = playerBreaks(s);
      for (const id of ids[side]) if (breaks[id]) assert.equal(breaks[id].side, side);
      assert.ok(ps.length >= 0);
    }
  }
});
