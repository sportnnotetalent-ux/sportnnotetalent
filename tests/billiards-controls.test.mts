/**
 * English billiards scorer controls — the PURE half
 * (src/sports/billiards/controls.ts): the builders the buttons dispatch, what
 * the screen offers (`billiardsPanel`), the hazard / cannon warnings, the
 * quick-mode frame-score check. Same stamps as snooker: `side` (the striker)
 * on every shot, `payload.frame` on every action; a builder returns null when
 * the engine would refuse the tap.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/sports/billiards/engine.ts';
import * as S from '../src/sports/snooker/engine.ts';
import {
  strokeAction, missAction, safetyAction, foulAction, timeAction, breakOffAction, concedeAction, awardAction, frameScoreAction,
  billiardsPanel, limitWarnings, frameScoreCheck, comboValue, PART_LABEL, FOUL_KIND_LABEL,
} from '../src/sports/billiards/controls.ts';
import { endingOf, endingCopy } from '../src/sports/cue/ending.ts';

type St = B.BilliardsState;
const apply = (s: St, a: unknown): St => {
  assert.ok(a, 'the builder offered the tap');
  const n = B.reducer(s, a as never);
  assert.notEqual(n, s, `accepted: ${JSON.stringify(a)}`);
  return n;
};
const init = (c: Record<string, unknown> = {}) => B.createInitialState(c);

describe('builders', () => {
  test('stamps: side on shots, the frame on everything', () => {
    const s = init();
    assert.deepEqual(strokeAction(s, { potRed: true }), { type: 'SCORE', side: 'home', payload: { potRed: true, frame: 1 } });
    assert.deepEqual(strokeAction(s, { cannon: true, inOffRed: true }), { type: 'SCORE', side: 'home', payload: { inOffRed: true, cannon: true, frame: 1 } });
    assert.deepEqual(missAction(s), { type: 'MISS', side: 'home', payload: { frame: 1 } });
    assert.deepEqual(safetyAction(s), { type: 'SAFETY', side: 'home', payload: { frame: 1 } });
    assert.deepEqual(foulAction(s, 'push'), { type: 'FOUL', side: 'home', payload: { kind: 'push', frame: 1 } });
    assert.deepEqual(foulAction(s), { type: 'FOUL', side: 'home', payload: { frame: 1 } });
    assert.deepEqual(concedeAction(s, 'home'), { type: 'CONCEDE', side: 'home', payload: { side: 'home', frame: 1 } });
    assert.deepEqual(awardAction(s, 'away', 'time'), { type: 'AWARD_FRAME', side: 'away', payload: { side: 'away', frame: 1, reason: 'time' } });
    assert.deepEqual(breakOffAction(s, 'away'), { type: 'BREAK_OFF', side: 'away', payload: { side: 'away', frame: 1 } });
    assert.deepEqual(frameScoreAction(s, 150, 87), { type: 'FRAME_SCORE', payload: { home: 150, away: 87, frame: 1 } });
    assert.equal(timeAction(s), null); // a points game has no TIME
    const t = init({ format: 'timed' });
    assert.deepEqual(timeAction(t), { type: 'TIME', payload: { frame: 1 } });
  });

  test('refused taps are not offered; a double tap is refused by the engine', () => {
    let s = init();
    assert.equal(strokeAction(s, {}), null);
    assert.equal(strokeAction(s, { inOffRed: true, inOffWhite: true }), null); // one cue ball
    assert.equal(breakOffAction(s, 'home'), null);
    assert.equal(frameScoreAction(s, 100, 87), null); // nobody reached 150
    const miss = missAction(s)!;
    s = apply(s, miss);
    assert.equal(B.reducer(s, miss as never), s);
    const foul = foulAction(s)!;
    s = apply(s, foul);
    assert.equal(B.reducer(s, foul as never), s);
    assert.equal(comboValue({ potRed: true, cannon: true, potWhite: true, inOffRed: true }), 10);
    assert.equal(comboValue({ inOffRed: true, inOffWhite: true }), 0);
  });

  test('a tap stamped for the last frame is refused in the next', () => {
    let s = init({ target: 50, bestOf: 3 });
    const stale = concedeAction(s, 'away')!;
    s = apply(s, frameScoreAction(s, 50, 20));
    assert.equal(s.frame!.n, 2);
    assert.equal(B.reducer(s, stale as never), s);
    assert.equal(B.reducer(s, { type: 'SCORE', side: s.frame!.striker, payload: { potRed: true, frame: 1 } } as never), s);
  });
});

describe('the panel', () => {
  test('the four strokes, the target, the break', () => {
    let s = init({ target: 100, bestOf: 1 });
    let p = billiardsPanel(s)!;
    assert.deepEqual(p.strokes.map((x) => [x.key, x.label, x.pts]), [['potRed', 'Pot red', 3], ['inOffRed', 'In-off red', 3], ['cannon', 'Cannon', 2], ['potWhite', 'Pot white', 2]]);
    assert.ok(p.strokes.every((x) => x.action && x.foul === null));
    assert.equal(p.unit, 'game'); // a single game
    assert.deepEqual(p.toGo, { home: 100, away: 100 });
    assert.ok(p.toss && p.toss.away && !p.toss.home);
    assert.equal(p.frameScore, true);
    assert.equal(p.time, null);
    s = apply(s, p.strokes[0].action);
    s = apply(s, p.strokes[2].action);
    p = billiardsPanel(s)!;
    assert.equal(p.breakPts, 5);
    assert.deepEqual(p.toGo, { home: 95, away: 100 });
    assert.equal(p.toss, null);
    assert.equal(p.frameScore, false);
    assert.equal(billiardsPanel(init())!.unit, 'frame'); // best of 5
  });

  test('ten hazards: the warning, then the 16th hazard is marked as a foul', () => {
    let s = init({ hazardLimit: 15 });
    for (let i = 0; i < 9; i++) s = apply(s, strokeAction(s, { potRed: true }));
    assert.deepEqual(limitWarnings(billiardsPanel(s)!), []);
    s = apply(s, strokeAction(s, { potRed: true }));
    let w = limitWarnings(billiardsPanel(s)!);
    assert.equal(w.length, 1);
    assert.match(w[0], /10 hazards in a row.*5 more/);
    for (let i = 0; i < 5; i++) s = apply(s, strokeAction(s, { inOffRed: true }));
    const p = billiardsPanel(s)!;
    assert.match(limitWarnings(p)[0], /next hazard without a cannon is a foul/);
    assert.equal(p.strokes.find((x) => x.key === 'potRed')!.foul, 'hazards');
    assert.equal(p.strokes.find((x) => x.key === 'cannon')!.foul, null);
    // the engine turns the 16th hazard into the foul
    const t = apply(s, p.strokes[0].action);
    assert.equal(t.frame!.striker, 'away');
    assert.equal(t.frame!.score.away, 2);
    // a cannon with the hazard resets both runs
    const u = apply(s, strokeAction(s, { potRed: true, cannon: true }));
    assert.deepEqual(limitWarnings(billiardsPanel(u)!), []);
  });

  test('seventy cannons (limit 75)', () => {
    let s = init({ target: 1000 });
    for (let i = 0; i < 70; i++) s = apply(s, strokeAction(s, { cannon: true }));
    assert.match(limitWarnings(billiardsPanel(s)!)[0], /70 cannons in a row.*5 more/);
  });

  test('timed: TIME ends the game, or starts sudden death when level', () => {
    let s = init({ format: 'timed' });
    s = apply(s, strokeAction(s, { potRed: true }));
    const e = endingOf(B.reducer, s, timeAction(s)!)!;
    assert.equal(e.kind, 'match');
    assert.equal(e.winner, 'home');
    let t = init({ format: 'timed' });
    assert.equal(endingOf(B.reducer, t, timeAction(t)!), null); // level: sudden death
    t = apply(t, timeAction(t));
    const p = billiardsPanel(t)!;
    assert.equal(p.sudden, true);
    assert.equal(p.time, null);
    const d = init({ format: 'timed', timedTie: 'draw' });
    const de = endingOf(B.reducer, d, timeAction(d)!)!;
    assert.equal(de.winner, 'draw');
    assert.match(endingCopy(de, { home: 'Asha', away: 'Ravi' }, 'game').message, /draw/);
  });

  test('hostile and foreign states offer nothing and never throw', () => {
    for (const bad of [null, undefined, {}, 'x', { sport: 'billiards' }, S.createInitialState(), { ...init(), frame: { n: 1 } }]) {
      assert.equal(billiardsPanel(bad as never), null);
      assert.equal(strokeAction(bad as never, { potRed: true }), null);
      assert.equal(timeAction(bad as never), null);
    }
    let s = init({ bestOf: 1, target: 50 });
    s = apply(s, frameScoreAction(s, 50, 0));
    assert.equal(billiardsPanel(s), null);
  });
});

describe('quick mode: the frame-score check', () => {
  test('points: the winner reaches the target, the loser doesn\'t', () => {
    const s = init({ target: 150 });
    assert.deepEqual(frameScoreCheck(s, '150', '87'), { ok: true, home: 150, away: 87 });
    const over = frameScoreCheck(s, '163', '87');
    assert.equal(over.ok, true);
    assert.match((over as { warn: string }).warn, /recorded as 150/);
    assert.match((frameScoreCheck(s, '140', '87') as { error: string }).error, /reach 150/);
    assert.match((frameScoreCheck(s, '150', '150') as { error: string }).error, /Only the winner/);
    assert.equal(frameScoreCheck(s, 'x', '1').ok, false);
    assert.equal(frameScoreCheck(s, '100000', '1').ok, false);
  });
  test('timed: any score; level only when the organiser picked a draw', () => {
    assert.equal(frameScoreCheck(init({ format: 'timed' }), '80', '80').ok, false);
    assert.deepEqual(frameScoreCheck(init({ format: 'timed', timedTie: 'draw' }), '80', '80'), { ok: true, home: 80, away: 80 });
    assert.deepEqual(frameScoreCheck(init({ format: 'timed' }), '81', '80'), { ok: true, home: 81, away: 80 });
  });
  test('labels', () => {
    assert.equal(PART_LABEL.inOffWhite, 'In-off white');
    for (const k of B.FOUL_KINDS) assert.ok(FOUL_KIND_LABEL[k], k);
  });
});
