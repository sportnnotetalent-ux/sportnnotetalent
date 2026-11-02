/**
 * Quality mandate step 6 for scotch-doubles rotation
 * (docs/security/breaks/pool-scotch-rotation.md): 1,000 random scotch-doubles
 * matches (both rules, every game), the scorer taking the suggestion or
 * changing it at random. Who is suggested always follows the rules, and the
 * "what did the cue ball hit first?" question only ever comes up for a pot of
 * the other group alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/sports/pool/match.ts';
import * as C from '../src/sports/pool/controls.ts';
import { SOLIDS, STRIPES, other, type Side } from '../src/sports/pool/balls.ts';

let seed = 211;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const PAIR: Record<Side, string[]> = { home: ['h1', 'h2'], away: ['a1', 'a2'] };

test('1,000 scotch-doubles matches: the suggestion follows the rules', () => {
  let asked = 0, turnsKept = 0;
  for (let m = 0; m < 1000; m++) {
    const rule = rnd(2) ? 'turn' : 'shot';
    const game = ['eight', 'nine', 'ten'][rnd(3)];
    let s = M.poolInit({ game, raceTo: 1 + rnd(4), playersPerSide: 2, scotchTurns: rule });
    s = M.poolReducer(s, C.lagAction(s, rnd(2) ? 'home' : 'away'));
    const last: Record<Side, string | null> = { home: null, away: null };
    const lastBreak: Record<Side, string | null> = { home: null, away: null };
    const first: Record<Side, string | null> = { home: null, away: null };
    // after the previous action: who it was by, and whether that side kept the table
    let prev: { side: Side; pid: string; kept: boolean; n: number } | null = null;

    for (let step = 0; step < 200 && !s.ended; step++) {
      const r = s.rack!;
      if (r.pending) { s = M.poolReducer(s, C.chooseAction(s, 'play')); prev = null; continue; }
      const side: Side = r.phase === 'break' ? r.breaker! : r.shooter!;
      const pick = C.shooterPick(s, side, PAIR[side]);
      assert.ok(PAIR[side].includes(pick.suggested!), 'always one of the pair');
      if (r.phase === 'break') {
        if (lastBreak[side]) assert.notEqual(pick.suggested, lastBreak[side], 'breaks alternate');
        else assert.equal(pick.suggested, first[side] ?? PAIR[side][0], 'the first break: who played first');
      } else if (rule === 'shot') {
        if (last[side]) assert.notEqual(pick.suggested, last[side], 'world rules: every other shot');
      } else {
        const goesOn = !!prev && prev.side === side && prev.kept && prev.n === r.n && prev.pid === last[side];
        assert.equal(pick.keeps, goesOn, 'full turn: keeps exactly while the turn goes on');
        if (goesOn) { assert.equal(pick.suggested, last[side]); turnsKept++; }
        else if (last[side]) assert.notEqual(pick.suggested, last[side]);
      }
      const pid = rnd(10) === 0 ? PAIR[side].find((x) => x !== pick.suggested)! : pick.suggested!;
      const n0 = r.n;
      const before = s;
      let foul = false;
      if (r.phase === 'break') {
        const pots = r.table.filter((b) => b !== (game === 'eight' ? 8 : game === 'nine' ? 9 : 10) && rnd(5) === 0);
        s = M.poolReducer(s, C.breakAction(s, { pots, side }, { pid }));
      } else {
        const roll = rnd(10);
        const live = s.rack!.table.filter((b) => b !== (game === 'eight' ? 8 : game === 'nine' ? 9 : 10));
        const pots = live.filter(() => rnd(6) === 0).slice(0, 2);
        const q = C.otherGroupOnly(s, pots);
        if (q) {
          asked++;
          const theirs = r.solids === side ? STRIPES : SOLIDS;
          assert.equal(game, 'eight');
          assert.ok(pots.every((b) => theirs.includes(b)), 'only ever their group');
          assert.equal(q, theirs === SOLIDS ? 'solids' : 'stripes');
        } else if (game === 'eight' && r.solids && pots.length) {
          const theirs = r.solids === side ? STRIPES : SOLIDS;
          assert.ok(!pots.every((b) => theirs.includes(b)), 'never missed a pot of their group alone');
        }
        if (q && rnd(2)) { s = M.poolReducer(s, C.foulAction(s, 'wrongBall', { balls: pots }, { pid })); foul = true; }
        else if (roll < 4 && pots.length) s = M.poolReducer(s, C.potAction(s, pots, {}, { pid }));
        else if (roll < 7) s = M.poolReducer(s, C.missAction(s, { pid }));
        else if (roll < 8) s = M.poolReducer(s, C.safetyAction(s, [], { pid }));
        else if (roll < 9) { s = M.poolReducer(s, C.foulAction(s, 'scratch', {}, { pid })); foul = true; }
        else s = M.poolReducer(s, C.rackAction(s, rnd(2) ? 'home' : 'away'));
        if (q && foul && !s.ended && s.rack?.n === n0) {
          assert.equal(s.rack!.shooter, other(side), 'their ball first: the other side comes to the table');
          assert.equal(s.rack!.bih, true, 'with ball in hand');
        }
      }
      if (s === before) continue;
      const type = M.feedOf(s).at(-1)?.t;
      if (type === 'RACK') { prev = null; continue; }
      first[side] ??= pid;
      last[side] = pid;
      if (r.phase === 'break') lastBreak[side] = pid;
      const r1 = s.rack;
      prev = { side, pid, n: n0, kept: !foul && !!r1 && r1.n === n0 && r1.phase === 'play' && r1.shooter === side && !r1.pending && !r1.bih };
    }
  }
  assert.ok(asked > 50, `the wrong-ball question came up (${asked})`);
  assert.ok(turnsKept > 100, `full turns went on (${turnsKept})`);
});
