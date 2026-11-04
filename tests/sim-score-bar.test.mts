/** 600 random cue and badminton matches through the score bar's in-play
 *  (docs/security/breaks/score-bar.md): never throws; a named player is
 *  always on the in-play side's roster (SB2); the bar always has two rows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueInPlay, poolInPlay } from '../src/sports/cue/inPlay.ts';
import { badmintonInPlay } from '../src/sports/badminton/inPlay.ts';
import { scoreBarRows } from '../src/core/scoreBar.ts';
import * as SN from '../src/sports/snooker/engine.ts';
import * as BI from '../src/sports/billiards/engine.ts';
import * as BD from '../src/sports/badminton/engine.ts';
import * as M from '../src/sports/pool/match.ts';
import { withDoubles } from '../src/sports/cue/doubles.ts';

let seed = 511;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const id = (s: string, n: number) => `${s}${n}${s}${n}${s}${n}${s}${n}-0000-4000-8000-00000000000${n}`;
const sn = withDoubles(SN.createInitialState, SN.reducer as any);
const bi = withDoubles(BI.createInitialState, BI.reducer as any);
const SIDES = ['home', 'away'] as const;

test('600 matches: in-play is safe and names only the right side’s players', () => {
  for (let u = 0; u < 600; u++) {
    const dbl = rnd(2) === 0;
    const R = { home: dbl ? [id('a', 1), id('a', 2)] : [id('a', 1)], away: dbl ? [id('b', 3), id('b', 4)] : [id('b', 3)] };
    const kind = rnd(4);
    let s: any;
    let f: (x: any) => any;
    const pick = (side: 'home' | 'away') => R[side][rnd(R[side].length + 1)]; // sometimes undefined
    if (kind === 0 || kind === 1) {
      const eng = kind === 0 ? sn : bi;
      s = eng.init({ playersPerSide: dbl ? 2 : 1 });
      f = (x) => cueInPlay(x, R);
      for (let i = 0; i < rnd(40); i++) {
        const side = SIDES[rnd(2)];
        const t = ['POT', 'MISS', 'SAFETY', 'FOUL'][rnd(4)];
        s = eng.reduce(s, { type: t, side, payload: { ball: kind === 0 ? ['red', 'black', 'pink'][rnd(3)] : 'pot', pid: pick(side), points: 4 } });
      }
    } else if (kind === 2) {
      s = M.poolInit({ playersPerSide: dbl ? 2 : 1 });
      f = (x) => poolInPlay(x, R);
      for (let i = 0; i < rnd(40); i++) {
        const side = SIDES[rnd(2)];
        const t = ['LAG', 'BREAK', 'POT', 'MISS', 'SAFETY', 'FOUL'][rnd(6)];
        s = M.poolReducer(s, { type: t, side, payload: { balls: [1 + rnd(15)], pid: pick(side) } });
      }
    } else {
      s = BD.init({ doubles: dbl });
      f = (x) => badmintonInPlay(x, R);
      if (rnd(4)) s = BD.reducer(s, { type: 'SET_FIRST_SERVER', payload: { side: SIDES[rnd(2)] } } as any);
      for (let i = 0; i < rnd(60); i++) s = BD.reducer(s, { type: 'POINT', side: SIDES[rnd(2)], payload: {} } as any);
    }
    let p: any;
    assert.doesNotThrow(() => { p = f(s); });
    if (p) {
      assert.ok(SIDES.includes(p.side));
      if (p.playerId) assert.ok(R[p.side as 'home' | 'away'].includes(p.playerId), `SB2 ${kind}`);
    }
    const rows = scoreBarRows({ homeScore: '1', awayScore: '2' }, { home: 'H', away: 'A' }, p, () => 'X');
    assert.equal(rows.length, 2);
    assert.ok(rows.filter((r) => r.active).length <= 1);
  }
});
