/**
 * Quality mandate step 6 for the padel Fault (docs/security/breaks/padel-fault.md):
 * 1,000 random padel matches (singles and doubles, every deuce rule, short sets
 * and match tiebreaks) with Faults — by the server and by the receiver — typed
 * and untyped (the mesh too, and hostile types), retyping, double faults, aces,
 * code violations and timeline corrections. A fault never moves the score,
 * every point after one is a 2nd-serve point, only the server can fault, the
 * types stay valid and on the right points, the Stats tab adds up, and a
 * correction replays identically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, serveInfo, type PadelState } from '../src/sports/padel/engine.ts';
import { PADEL_FAULT_KINDS, isFaultKind } from '../src/sports/pointDetail.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { keyStats, racketView } from '../src/sports/racketMatchStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 4101;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
const KINDS = [...PADEL_FAULT_KINDS, 'side', '__proto__', null];
const ROW = { net: 'fNet', long: 'fLong', wide: 'fWide', foot: 'fFoot', mesh: 'fMesh' } as const;
const pts = (s: PadelState) => s.events.filter((e) => e.kind === 'point');
const cell = (s: PadelState, key: string, side: Side) => Number(keyStats(racketView('padel', s)!).find((x) => x.id === 'serve')?.rows.find((r) => r.key === key)?.[side] ?? 0);
const sig = (x: PadelState) => JSON.stringify(pts(x).map((e) => [e.side, e.df ? 1 : 0, e.serve, e.sf1, e.sf2, e.pd]));

test('1,000 padel matches: the Fault is exact', () => {
  let faults = 0, secondServes = 0, refused = 0, typed = 0, corrections = 0;
  for (let m = 0; m < 1000; m++) {
    const cfg = {
      playersPerSide: rnd(2) ? 2 : 1, deuce: pick(['advantage', 'golden', 'star']), gamesPerSet: pick([4, 6]),
      setsToWin: pick([1, 2]), decider: pick(['set', 'match10']), pointDetail: true, ...(rnd(4) ? { serveDetail: true } : {}),
    };
    let s = reducer(init(cfg), { type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away' } });
    for (let i = 0; i < 400 && !s.ended; i++) {
      const server = serveInfo(s).side as Side;
      const roll = rnd(14);
      const before = s;
      let a: ScoreAction;
      if (roll < 3) a = { type: 'FAULT', side: server, ...(rnd(2) ? { payload: { kind: pick(KINDS) } } : {}) };
      else if (roll === 3) a = { type: 'FAULT', side: opp(server) };
      else if (roll === 4) a = { type: 'FAULT_TYPE', payload: { kind: pick(KINDS) } };
      else if (roll === 5) a = { type: 'POINT', side: opp(server), payload: { df: true } };
      else if (roll === 6) a = { type: 'POINT', side: server, payload: { pd: { how: 'ace' } } };
      else if (roll === 7) a = { type: 'CONDUCT', side: rnd(2) ? 'home' : 'away', payload: { level: pick(['warning', 'point']) } };
      else a = { type: 'POINT', side: rnd(2) ? 'home' : 'away' };
      s = reducer(s, a);
      if (a.type === 'FAULT') {
        // a fault never moves the score or adds to the timeline
        assert.deepEqual([s.pts, s.games, s.sets, s.events.length], [before.pts, before.games, before.sets, before.events.length]);
        if (a.side !== server || before.fault) { assert.equal(s, before, 'only the server, once per point'); refused++; }
        else { assert.equal(s.fault, true); assert.equal(s.serveDetail, true); faults++; if (s.faultKind) typed++; }
      }
      if (a.type === 'FAULT_TYPE' && !isFaultKind(a.payload?.kind, 'padel') && a.payload?.kind !== null) assert.equal(s, before, 'an unknown type changes nothing');
      // every point after a fault is a 2nd-serve point, and clears it
      const scored = s.events.length > before.events.length && pts(s).length > pts(before).length;
      if (scored) {
        assert.equal(s.fault, undefined, 'a point clears the fault');
        // (a penalty point is awarded, not served: it clears the fault, no serve on it)
        if (before.fault && a.type === 'POINT') {
          const p = pts(s).find((e) => !pts(before).includes(e))!;
          assert.equal(p.serve, 2, 'a point after a fault is a 2nd-serve point');
          assert.equal(p.sf1, before.faultKind);
          secondServes++;
        }
      }
    }
    // what was stored is valid, and on the right points
    for (const e of pts(s)) {
      if (e.sf1) { assert.ok(isFaultKind(e.sf1, 'padel')); assert.equal(e.serve, 2, 'a 1st-serve fault type only on a 2nd-serve point'); }
      if (e.sf2) { assert.ok(isFaultKind(e.sf2, 'padel')); assert.ok(e.df, "a 2nd serve's type only on a double fault"); }
    }
    // the Stats tab adds up: serve faults by type
    if (pts(s).length) {
      for (const k of PADEL_FAULT_KINDS) {
        const total = cell(s, ROW[k], 'home') + cell(s, ROW[k], 'away');
        assert.equal(total, pts(s).filter((e) => e.sf1 === k).length + pts(s).filter((e) => e.df && e.sf2 === k).length, `${k} faults`);
      }
    }
    // a correction replays identically (score, serve, types, a pending fault)
    if (m % 4 === 0 && pts(s).length) {
      corrections++;
      const again = reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
      assert.equal(sig(again), sig(s));
      assert.deepEqual([again.sets, again.games, again.pts, again.ended, again.fault, again.faultKind, again.serveDetail], [s.sets, s.games, s.pts, s.ended, s.fault, s.faultKind, s.serveDetail]);
    }
  }
  assert.ok(faults > 5000 && secondServes > 4000 && refused > 1000 && typed > 1000 && corrections === 250, `faults ${faults}, 2nd serves ${secondServes}, refused ${refused}, typed ${typed}`);
});

test('1,000 old padel logs (no Fault) replay identically', () => {
  for (let m = 0; m < 1000; m++) {
    const cfg = { playersPerSide: rnd(2) ? 2 : 1, deuce: pick(['advantage', 'golden', 'star']), setsToWin: pick([1, 2]), ...(rnd(2) ? { serveDetail: true } : {}) };
    const log: ScoreAction[] = [{ type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away' } }];
    for (let i = 0; i < 120; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const r = rnd(10);
      log.push(r === 0 ? { type: 'POINT', side, payload: { df: true } } : r === 1 ? { type: 'POINT', side, payload: { pd: { how: 'ace' } } } : { type: 'POINT', side });
    }
    const a = log.reduce(reducer, init(cfg));
    const b = log.reduce(reducer, init(cfg));
    assert.deepEqual(a, b);
    assert.equal(a.fault, undefined);
    assert.ok(pts(a).every((e) => e.sf1 === undefined && e.sf2 === undefined && (cfg.serveDetail ? e.serve === (e.df ? 2 : 1) : e.serve === undefined)));
  }
});
