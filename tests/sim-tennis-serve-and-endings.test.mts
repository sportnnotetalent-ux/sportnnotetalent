/**
 * Quality mandate step 6 for the tennis Fault button
 * (docs/security/breaks/tennis-serve-and-endings.md): 1,000 random matches
 * (singles and doubles, every set format) with faults, aces, double faults,
 * time violations, penalty points and stray taps. A fault never moves the
 * score; every point after one is a 2nd-serve point and every other tracked
 * point a 1st-serve one (a double fault: 2nd); only the server can fault.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, serveInfo, type TennisState } from '../src/sports/tennis/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 307;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const points = (s: TennisState) => s.events.filter((e) => e.kind === 'point' || e.kind === 'ace');
const score = (s: TennisState) => JSON.stringify([s.pts, s.games, s.sets, s.setsWon, s.ended]);

test('1,000 matches with faults', () => {
  let faults = 0, second = 0, tvDf = 0;
  for (let m = 0; m < 1000; m++) {
    const config = { setsToWin: 1 + rnd(2), gamesPerSet: [4, 6][rnd(2)], playersPerSide: 1 + rnd(2), noAd: rnd(2) === 1, pointDetail: true, serveDetail: rnd(3) > 0 };
    let s = reducer(init(config), { type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away' } });
    for (let i = 0; i < 400 && !s.ended; i++) {
      const server = serveInfo(s).side as Side;
      const before = s;
      const n0 = points(s).length;
      const roll = rnd(20);
      let a: ScoreAction;
      if (roll < 4) a = { type: 'FAULT', side: server };
      else if (roll === 4) a = { type: 'FAULT', side: opp(server) };
      else if (roll === 5) a = { type: 'ACE', side: server };
      else if (roll === 6) a = { type: 'POINT', side: opp(server), payload: { df: true } };
      else if (roll === 7) a = { type: 'CONDUCT', side: rnd(3) ? server : opp(server), payload: { level: 'fault', track: 'time' } };
      else if (roll === 8 && rnd(4) === 0) a = { type: 'CONDUCT', side: rnd(2) ? 'home' : 'away', payload: { level: 'point' } };
      else a = { type: 'POINT', side: rnd(2) ? 'home' : 'away' };
      s = reducer(s, a);
      const scored = points(s).length > n0;

      if (a.type === 'FAULT') {
        if (a.side !== server || before.fault) assert.equal(s, before, 'only the server, once a point');
        else { faults++; assert.equal(score(s), score(before), 'a fault never moves the score'); assert.equal(s.fault, true); assert.equal(s.serveDetail, true); }
      }
      if (a.type === 'CONDUCT' && a.payload?.track === 'time') {
        if (a.side !== server) assert.equal(!!s.fault, !!before.fault, 'the receiver can\'t lose a serve');
        else if (before.fault) { tvDf++; assert.ok(scored, 'a time violation on the 2nd serve is a double fault'); assert.equal(points(s).at(-1)!.side, opp(server)); }
        else assert.equal(s.fault, true);
      }
      if (scored) {
        assert.equal(s.fault, undefined, 'every point clears the fault');
        const p = points(s)[n0];
        if (p.pen) continue;
        if (before.fault) { second++; assert.equal(p.serve, 2, 'after a fault: a 2nd-serve point'); }
        else if (before.serveDetail) assert.equal(p.serve, p.df ? 2 : 1);
        else assert.equal(p.serve, undefined, 'untracked stays untracked');
      }
      if (s.ended) assert.equal(s.fault, undefined);
    }
  }
  assert.ok(faults > 5000 && second > 3000 && tvDf > 50, `faults ${faults}, 2nd-serve points ${second}, time-violation double faults ${tvDf}`);
});
