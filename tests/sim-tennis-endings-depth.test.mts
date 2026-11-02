/**
 * Quality mandate step 6 for tennis error direction, fault type and lost by
 * rule (docs/security/breaks/tennis-endings-depth.md): 1,000 random matches
 * with typed and untyped faults, double faults, every point ending (and
 * hostile ones), retyping and timeline corrections. Types stay with their
 * points, nothing invalid is stored, the Stats tab adds up, and a correction
 * replays to the same points.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, serveInfo, type TennisState } from '../src/sports/tennis/engine.ts';
import { FAULT_KINDS, isFaultKind } from '../src/sports/pointDetail.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { keyStats, tennisView } from '../src/sports/tennis/matchStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 401;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
const HOWS = ['winner', 'ue', 'fe', 'rule', 'sw', 'bogus', '__proto__'];
const DIRS = ['net', 'long', 'wide', 'out', 'fh', '__proto__', undefined];
const KINDS = [...FAULT_KINDS, 'side', null];
const pts = (s: TennisState) => s.events.filter((e) => e.kind === 'point' || e.kind === 'ace');
const cell = (s: TennisState, sec: string, key: string, side: Side) => Number(keyStats(tennisView(s)!).find((x) => x.id === sec)?.rows.find((r) => r.key === key)?.[side] ?? 0);

test('1,000 matches: fault types, error directions, lost by rule', () => {
  let typed = 0, dirs = 0, rules = 0, corrections = 0;
  for (let m = 0; m < 1000; m++) {
    let s = reducer(init({ setsToWin: 1, gamesPerSet: [4, 6][rnd(2)], pointDetail: true, serveDetail: true }), { type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away' } });
    for (let i = 0; i < 300 && !s.ended; i++) {
      const server = serveInfo(s).side as Side;
      const roll = rnd(12);
      const before = s;
      let a: ScoreAction;
      if (roll < 3) a = { type: 'FAULT', side: server, ...(rnd(2) ? { payload: { kind: pick(KINDS) } } : {}) };
      else if (roll === 3) a = { type: 'FAULT_TYPE', payload: { kind: pick(KINDS) } };
      else if (roll === 4) a = { type: 'POINT', side: opp(server), payload: { df: true } };
      else if (roll === 5) a = { type: 'ACE', side: server };
      else if (roll === 6) a = { type: 'POINT_DETAIL', payload: { pd: { how: pick(HOWS), ...(rnd(2) ? { wing: pick(['fh', 'bh']) } : {}), stroke: pick(DIRS) } } };
      else a = { type: 'POINT', side: rnd(2) ? 'home' : 'away' };
      s = reducer(s, a);
      if (a.type === 'FAULT_TYPE' && !isFaultKind(a.payload?.kind) && a.payload?.kind !== null) assert.equal(s, before, 'an unknown type changes nothing');
      if (a.type === 'FAULT' && s !== before && s.faultKind) typed++;
    }
    // what was stored is valid, and on the right points
    for (const e of pts(s)) {
      if (e.sf1) { assert.ok(isFaultKind(e.sf1)); assert.equal(e.serve, 2, 'a 1st-serve fault type only on a 2nd-serve point'); }
      if (e.sf2) { assert.ok(isFaultKind(e.sf2)); assert.ok(e.df, 'a 2nd serve\'s type only on a double fault'); }
      if (e.pd) {
        assert.ok(['winner', 'ue', 'fe', 'rule', 'sw'].includes(e.pd.how), e.pd.how);
        if (e.pd.stroke && ['net', 'long', 'wide'].includes(e.pd.stroke) && (e.pd.how === 'ue' || e.pd.how === 'fe')) dirs++;
        assert.notEqual(e.pd.stroke, '__proto__');
        if (e.pd.how === 'rule') rules++;
      }
    }
    // the Stats tab adds up: each side's serve faults by type
    if (pts(s).length) {
      for (const k of FAULT_KINDS) {
        const key = { net: 'fNet', long: 'fLong', wide: 'fWide', foot: 'fFoot' }[k];
        const total = cell(s, 'service', key, 'home') + cell(s, 'service', key, 'away');
        const want = pts(s).filter((e) => e.sf1 === k).length + pts(s).filter((e) => e.df && e.sf2 === k).length;
        assert.equal(total, want, `${k} faults`);
      }
    }
    // a correction replays the same points (score, detail, fault types)
    if (m % 4 === 0 && pts(s).length) {
      corrections++;
      const again = reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
      const sig = (x: TennisState) => JSON.stringify(pts(x).map((e) => [e.side, e.kind, e.df ? 1 : 0, e.serve, e.sf1, e.sf2, e.pd]));
      assert.equal(sig(again), sig(s));
      assert.deepEqual([again.sets, again.games, again.pts], [s.sets, s.games, s.pts]);
    }
  }
  assert.ok(typed > 1000 && dirs > 500 && rules > 100 && corrections === 250, `typed ${typed}, directions ${dirs}, rule ${rules}`);
});
