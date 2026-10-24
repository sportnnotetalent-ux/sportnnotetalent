/**
 * Cricket extras — wide+runs and byes-off-a-no-ball (sport coverage audit).
 * A wide/no-ball is never a legal ball (the over doesn't advance); the fixes let
 * a scorer capture the runs that are actually run off them, charged correctly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer } from '../src/sports/cricket/engine.ts';
import type { CricketState } from '../src/sports/cricket/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { withNames } from '../src/sports/cricket/names.ts';
import { makeNameOf } from '../src/core/playerNames.ts';

// IDs-only scoring (2026-10-24): actions as the scorer UI sends them — player
// ids only; names are asserted on the display copy (names.ts withNames).
const NM = makeNameOf(new Map([['s1', 'A'], ['s2', 'B'], ['s3', 'D'], ['b1', 'Bowler'], ['k1', 'Keeper One'], ['k2', 'Keeper Two'], ['x9', 'Sub']]));
const named = (s: CricketState) => withNames(s, NM);

// A fresh innings with a striker, non-striker and bowler set.
function opened(): CricketState {
  let s = init({ overs: 5, playersPerSide: 11 });
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: 's1', v: 2 } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 's2', v: 2 } });
  s = reducer(s, { type: 'SET_BOWLER', payload: { id: 'b1', v: 2 } });
  return s;
}
// Mimic the ball() wrapper: stamp the current striker/bowler onto the delivery.
const ext = (s: CricketState, payload: Record<string, unknown>): CricketState =>
  reducer(s, { type: 'EXTRA', payload: { ...payload, strikerId: s.strikerId, bowlerId: s.bowlerId } } as ScoreAction);
/** Any delivery, stamped with the live striker/bowler (as the on-screen ball() does). */
const ball = (s: CricketState, type: string, payload: Record<string, unknown> = {}): CricketState =>
  reducer(s, { type, side: s.battingSide, payload: { ...payload, strikerId: s.strikerId, bowlerId: s.bowlerId } } as ScoreAction);
const home = (s: CricketState) => s.scores.home;

describe('cricket — wides', () => {
  test('a plain wide is +1 extra and not a legal ball', () => {
    const s = ext(opened(), { kind: 'Wide' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).extras, 1);
    assert.equal(home(s).balls, 0); // over does not advance
    assert.equal(s.bowling.b1.runs, 1);
    assert.equal(s.bowling.b1.extras, 1);
  });

  test('wide + runs adds all of them as extras charged to the bowler', () => {
    const s = ext(opened(), { kind: 'Wide', runs: 2 }); // e.g. 2 byes run on the wide
    assert.equal(home(s).runs, 3);
    assert.equal(home(s).extras, 3);
    assert.equal(home(s).balls, 0);
    assert.equal(s.bowling.b1.runs, 3);
  });

  test('an odd number of runs on a wide rotates strike', () => {
    const s = ext(opened(), { kind: 'Wide', runs: 1 });
    assert.equal(s.strikerId, 's2'); // crossed once
  });
});

describe('cricket — no-balls', () => {
  test('a plain no-ball is +1, a free hit, and a ball faced', () => {
    const s = ext(opened(), { kind: 'No ball' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).extras, 1);
    assert.equal(s.freeHit, true);
    assert.equal(s.batting.s1.balls, 1);
    assert.equal(home(s).balls, 0); // still not a legal ball
  });

  test('no-ball + off-bat runs credit the striker, charge the bowler', () => {
    const s = ext(opened(), { kind: 'No ball', runs: 4 });
    assert.equal(home(s).runs, 5); // 1 penalty + 4 off the bat
    assert.equal(s.batting.s1.runs, 4);
    assert.equal(s.batting.s1.fours, 1);
    assert.equal(home(s).extras, 1); // only the penalty is an extra
    assert.equal(s.bowling.b1.runs, 5);
  });

  test('byes off a no-ball are team extras, not charged to the bowler or batter', () => {
    const s = ext(opened(), { kind: 'No ball', byes: 2 });
    assert.equal(home(s).runs, 3); // 1 penalty + 2 byes
    assert.equal(home(s).extras, 3); // penalty + byes
    assert.equal(s.batting.s1.runs, 0); // batter didn't hit it
    assert.equal(s.batting.s1.balls, 1); // but faced the ball
    assert.equal(s.bowling.b1.runs, 1); // bowler charged only the penalty
    assert.equal(s.freeHit, true);
  });
});

describe('cricket — penalty runs & run-outs off an extra', () => {
  test('a 5-run penalty is added as extras, not a ball', () => {
    const s = reducer(opened(), { type: 'PENALTY', payload: { runs: 5 } });
    assert.equal(home(s).runs, 5);
    assert.equal(home(s).extras, 5);
    assert.equal(home(s).balls, 0);
  });

  test('run-out off a wide: +1 + completed runs as extras, a wicket, no over progress', () => {
    const s = ext(opened(), { kind: 'Wide', runout: true, runs: 1, batterOut: 'striker', fielderId: 'f1', newBatId: 's3' });
    assert.equal(home(s).runs, 2); // 1 wide + 1 completed
    assert.equal(home(s).extras, 2);
    assert.equal(home(s).wickets, 1);
    assert.equal(home(s).balls, 0); // NOT a legal ball
    assert.equal(s.batting.s1.out, true);
    assert.equal(s.bowling.b1.wickets, 0); // run-out — no bowler credit
  });

  test('run-out off a no-ball: +1, a free hit, the non-striker run out, no over progress', () => {
    const s = ext(opened(), { kind: 'No ball', runout: true, runs: 0, batterOut: 'nonstriker', fielderId: 'f1', newBatId: 's3' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).wickets, 1);
    assert.equal(home(s).balls, 0);
    assert.equal(s.freeHit, true);
    assert.equal(s.batting.s1.balls, 1); // striker still faced the no-ball
    assert.equal(s.batting.s2.out, true); // non-striker run out
  });
});

describe('cricket — a full over replayed ball-by-ball (scorecard reproduction)', () => {
  // A realistic mixed over off Bowler to A (non-striker B):
  //  1) FOUR (A)            → A 4, keeps strike
  //  2) single (A)          → A 5, strike to B
  //  3) WIDE                → +1 extra, no ball faced
  //  3) SIX (B)             → B 6, keeps strike
  //  4) bye 1               → +1 extra, B faces, strike to A
  //  5) WICKET bowled (A)   → A out, D comes in on strike
  //  6) two (D)             → D 2, over ends → strike rotates, bowler cleared
  const played = (() => {
    let s = opened();
    s = ball(s, 'RUNS', { runs: 4 });
    s = ball(s, 'RUNS', { runs: 1 });
    s = ball(s, 'EXTRA', { kind: 'Wide' });
    s = ball(s, 'RUNS', { runs: 6 });
    s = ball(s, 'BYES', { runs: 1 });
    s = ball(s, 'WICKET', { kind: 'bowled', newBatId: 's3' });
    s = ball(s, 'RUNS', { runs: 2 });
    return s;
  })();

  test('team total, extras and wickets are right (15/1, 2 extras)', () => {
    assert.equal(home(played).runs, 15); // 4+1 + wide1 + 6 + bye1 + 2
    assert.equal(home(played).extras, 2); // wide + bye
    assert.equal(home(played).wickets, 1);
    assert.equal(home(played).balls, 6); // exactly one over of legal balls
  });

  test('the over completed — bowler cleared, strike rotated', () => {
    assert.equal(played.bowlerId, undefined); // new bowler needed next over
    assert.equal(played.strikerId, 's2'); // strike rotated on the last ball of the over
    assert.equal(played.strikerName, undefined); // IDs-only: no name in the state…
    assert.equal(named(played).strikerName, 'B'); // …the display copy names B
  });

  test('batting card splits runs & balls correctly per batter', () => {
    assert.deepEqual([played.batting.s1.runs, played.batting.s1.balls, played.batting.s1.out], [5, 3, true]); // A
    assert.deepEqual([played.batting.s2.runs, played.batting.s2.balls], [6, 2]); // B
    assert.deepEqual([played.batting.s3.runs, played.batting.s3.balls], [2, 1]); // D
    assert.equal(played.batting.s1.fours, 1);
    assert.equal(played.batting.s2.sixes, 1);
  });

  test('bowling figures are right (byes not charged to the bowler)', () => {
    assert.equal(played.bowling.b1.runs, 14); // 4+1+6+2 off the bat + 1 wide; the bye is NOT charged
    assert.equal(played.bowling.b1.wickets, 1);
    assert.equal(played.bowling.b1.balls, 6);
  });
})

describe('cricket — concussion substitute (Tier-1 gap fix)', () => {
  test('a concussion sub removes the injured player and logs the replacement', () => {
    const s = reducer(opened(), { type: 'CONCUSSION_SUB', payload: { side: 'home', outId: 's2', inId: 'x9' } });
    assert.equal(s.unavailable.includes('s2'), true); // injured player out
    const ev = s.events.find((e) => e.label === 'CONCUSSION SUB');
    assert.equal(ev?.detail, '{@x9} replaces {@s2} (injury)'); // stored by id
    const shown = named(s).events.find((e) => e.label === 'CONCUSSION SUB');
    assert.ok(shown && /Sub replaces B/.test(shown.detail ?? ''));
  });
})

describe('cricket — toss decides who bats first (Tier-3 gap)', () => {
  test('default (no toss) has home batting first', () => {
    assert.equal(init({ overs: 5, playersPerSide: 11 }).battingSide, 'home');
  });

  test('winner electing to bat puts them in first', () => {
    const s = reducer(init({ overs: 5 }), { type: 'SET_TOSS', payload: { winner: 'away', decision: 'bat' } });
    assert.equal(s.battingSide, 'away');
    assert.deepEqual(s.toss, { winner: 'away', decision: 'bat' });
  });

  test('winner electing to bowl puts the other side in', () => {
    const s = reducer(init({ overs: 5 }), { type: 'SET_TOSS', payload: { winner: 'away', decision: 'bowl' } });
    assert.equal(s.battingSide, 'home'); // away bowls ⇒ home bats
  });

  test('the toss is locked once the first ball is bowled', () => {
    let s = opened(); // striker/bowler set, still 0 balls
    s = reducer(s, { type: 'SET_TOSS', payload: { winner: 'away', decision: 'bat' } });
    assert.equal(s.battingSide, 'away');
    s = ball(s, 'RUNS', { runs: 1 }); // play starts
    const after = reducer(s, { type: 'SET_TOSS', payload: { winner: 'home', decision: 'bat' } });
    assert.equal(after.battingSide, 'away'); // unchanged — toss is locked
  });
})

describe('cricket — change keeper mid-match (parity #13)', () => {
  test('no event when the keeper is set before ball 1', () => {
    let s = opened();
    const before = s.events.length;
    s = reducer(s, { type: 'SET_KEEPER', payload: { side: 'away', id: 'k1' } });
    assert.equal(s.keepers.away?.id, 'k1');
    assert.equal(s.events.length, before);
  });

  test('a change after a ball logs NEW KEEPER and a later stumping credits the new keeper', () => {
    let s = reducer(opened(), { type: 'SET_KEEPER', payload: { side: 'away', id: 'k1' } });
    s = ball(s, 'RUNS', { runs: 1 });
    s = reducer(s, { type: 'SET_KEEPER', payload: { side: 'away', id: 'k2' } });
    const last = s.events[s.events.length - 1];
    assert.equal(last.label, 'NEW KEEPER');
    assert.equal(last.icon, '🧤');
    assert.equal(last.detail, '{@k2} takes the gloves from {@k1}');
    assert.equal(named(s).events.at(-1)!.detail, 'Keeper Two takes the gloves from Keeper One');
    // same keeper again → no duplicate event
    const n = s.events.length;
    s = reducer(s, { type: 'SET_KEEPER', payload: { side: 'away', id: 'k2' } });
    assert.equal(s.events.length, n);
    s = ball(s, 'WICKET', { kind: 'stumped', newBatId: 's3' });
    const d = s.dismissals[s.dismissals.length - 1];
    assert.equal(d.kind, 'stumped');
    assert.equal(d.fielderId, 'k2');
    assert.equal(d.fielderName, undefined);
    assert.equal(named(s).dismissals.at(-1)!.fielderName, 'Keeper Two');
    assert.equal(named(s).batting.s2.dismissal, 'st Keeper Two b Bowler');
  });
});

describe('cricket — involvedPlayerIds (squad lock, parity #13)', () => {
  test('batters, bowler and the stumping keeper are involved; the bench is not', async () => {
    const { involvedPlayerIds } = await import('../src/sports/cricket/engine.ts');
    let s = reducer(opened(), { type: 'SET_KEEPER', payload: { side: 'away', id: 'k1' } });
    assert.deepEqual(involvedPlayerIds(s).sort(), ['b1', 's1', 's2']);
    s = ball(s, 'WICKET', { kind: 'stumped', newBatId: 's3' });
    const ids = involvedPlayerIds(s);
    for (const id of ['s1', 's2', 's3', 'b1', 'k1']) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes('s9'));
  });
});
