/**
 * Audit C1 simulation (docs/security/breaks/cricket-end-result.md): 600 random
 * matches, each ended at a random point with a random END (plain, or `v: 2`
 * with a random — sometimes bad — payload). Invariants:
 *  - a plain END is exactly `{ ...before, ended: true }` (legacy replay);
 *  - a `v: 2` END changes the state only while the chase is alive, and then
 *    the result is never a margin "Won by N runs / wkts";
 *  - the derived standings / W-D-NR agree with the kind (NR never a win, a
 *    draw never a tie, an award a win for the side named);
 *  - the log without the END is the live chase again (undo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, outcome, endResult, chaseAlive, type CricketState } from '../src/sports/cricket/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { sideResults } from '../src/data/appearances.ts';
import { stateResult, savedWinner } from '../src/core/matchResult.ts';

let seed = 2026;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

const HOWS: Record<string, unknown>[] = [
  { v: 2, how: 'nr' }, { v: 2, how: 'draw' }, { v: 2, how: 'award', side: 'home' }, { v: 2, how: 'award', side: 'away' },
  { v: 2, how: 'nr', reason: 'Bad light' }, { v: 2, how: 'award', side: 'away', reason: 'x'.repeat(300) },
  { v: 2, how: 'award' }, { v: 2, how: 'tie' }, { v: 1, how: 'nr' }, { v: 2, how: 'award', side: 'nobody' },
];

function play(): { log: ScoreAction[]; s: CricketState } {
  const overs = [2, 5, 10, 20, 999][rnd(5)];
  const log: ScoreAction[] = [];
  let s = init({ overs, playersPerSide: 11 });
  const go = (a: ScoreAction) => { log.push(a); s = reducer(s, a); };
  const crease = (p: string) => {
    go({ type: 'SET_STRIKER', payload: { id: `${p}${s.seq}a`, v: 2 } });
    go({ type: 'SET_NONSTRIKER', payload: { id: `${p}${s.seq}b`, v: 2 } });
    go({ type: 'SET_BOWLER', payload: { id: `${p}bw`, v: 2 } });
  };
  crease('h');
  for (let i = rnd(40); i > 0 && !s.ended && s.innings === 1; i--) {
    go({ type: 'RUNS', side: s.battingSide, payload: { runs: [0, 1, 2, 4, 6][rnd(5)], strikerId: s.strikerId, bowlerId: s.bowlerId } } as ScoreAction);
  }
  if (rnd(6) > 0 && s.innings === 1) { go({ type: 'END_INNINGS' }); crease('a'); }
  for (let i = rnd(40); i > 0 && !s.ended && s.innings === 2; i--) {
    go({ type: 'RUNS', side: s.battingSide, payload: { runs: [0, 1, 2, 4][rnd(4)], strikerId: s.strikerId, bowlerId: s.bowlerId } } as ScoreAction);
  }
  return { log, s };
}

test('600 random early ends', () => {
  let asked = 0, legacy = 0, accepted = 0;
  for (let n = 0; n < 600; n++) {
    const { log, s } = play();
    if (rnd(4) === 0) {
      legacy++;
      const e = reducer(s, { type: 'END' });
      assert.deepEqual(e, { ...s, ended: true });
      assert.equal(endResult(e), undefined);
      continue;
    }
    asked++;
    const p = HOWS[rnd(HOWS.length)];
    const e = reducer(s, { type: 'END', payload: p });
    const r = endResult(e);
    if (!r) { assert.equal(e, s, `rejected END changes nothing (${JSON.stringify(p)})`); continue; }
    accepted++;
    assert.ok(!s.ended && !s.superOver && !s.pendingTie, 'only an undecided match takes a v:2 END');
    if (s.innings === 2) assert.equal(chaseAlive(s), true, 'innings 2: only a live chase');
    assert.equal(e.ended, true);
    assert.ok(!/^Won by/.test(outcome(e).text), outcome(e).text);
    if (r.kind === 'draw') assert.ok(s.oversLimit >= 100, 'a draw only in a timed game');
    if (r.reason) assert.ok(r.reason.length <= 120);
    const res = { winner: outcome(e).winner ?? ('draw' as const), home: e.scores.home.runs, away: e.scores.away.runs, ...r };
    const mr = stateResult(res)!;
    const winner = mr.winner ?? (mr.kind === 'draw' ? 'draw' : undefined);
    const sides = sideResults({ sport: 'cricket', status: 'completed', winner: winner ?? null, result: mr });
    if (r.kind === 'no_result') { assert.deepEqual(sides, { home: 'NR', away: 'NR' }); assert.equal(savedWinner(res), null); }
    if (r.kind === 'draw') assert.deepEqual(sides, { home: 'D', away: 'D' });
    if (r.kind === 'awarded') {
      assert.equal(r.winner, p.side);
      assert.equal(sides?.[r.winner!], 'W');
      assert.equal(savedWinner(res), p.side);
    }
    assert.equal(mr.countNrr, false);
    // Undo: the log without the END replays to the live state again.
    const replay = log.reduce(reducer, init({ overs: s.oversLimit, playersPerSide: 11 }));
    assert.equal(replay.ended, false);
    assert.equal(endResult(replay), undefined);
  }
  assert.ok(asked + legacy === 600 && accepted > 50, `asked ${asked}, accepted ${accepted}, legacy ${legacy}`);
});
