/**
 * Snooker scorer controls — the PURE half (src/sports/snooker/controls.ts):
 * the action builders the buttons dispatch, what the screen offers in each
 * state (`snookerPanel`), the quick-mode frame-score check and the copy.
 *
 * The builders are the integration contract with the engine
 * (docs/sports/SNOOKER_BILLIARDS_DESIGN.md §4): every shot carries `side` (the
 * striker) and every action carries `payload.frame` (the frame in play), so a
 * double tap, a stale tap after undo or a tap for another frame is refused by
 * the engine. A builder returns null when the engine would refuse the tap, so
 * the screen only ever offers taps that count.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';
import {
  potAction, missAction, safetyAction, foulAction, freeBallAction, playAgainAction, replaceAction, respotTurnAction,
  breakOffAction, concedeAction, awardAction, frameScoreAction, rerackAction, snookerPanel, frameScoreCheck,
  missWarning, BALL_LABEL, FOUL_KIND_LABEL,
} from '../src/sports/snooker/controls.ts';
import { endingOf, endingCopy } from '../src/sports/cue/ending.ts';

type St = S.SnookerState;
const apply = (s: St, a: unknown): St => {
  assert.ok(a, 'the builder offered the tap');
  const n = S.reducer(s, a as never);
  assert.notEqual(n, s, `accepted: ${JSON.stringify(a)}`);
  return n;
};
const init = (c: Record<string, unknown> = {}) => S.createInitialState(c);
/** pot a list of balls with the builders */
const pots = (s: St, balls: Array<S.Ball | 'free'>) => balls.reduce((x, b) => apply(x, potAction(x, b)), s);

describe('builders: side and frame stamps', () => {
  test('a shot carries the striker and the frame; a frame action the frame', () => {
    const s = init();
    assert.deepEqual(potAction(s, 'red'), { type: 'POT', side: 'home', payload: { ball: 'red', frame: 1 } });
    assert.deepEqual(missAction(s), { type: 'MISS', side: 'home', payload: { frame: 1 } });
    assert.deepEqual(safetyAction(s), { type: 'SAFETY', side: 'home', payload: { frame: 1 } });
    assert.deepEqual(foulAction(s, { value: 5, kind: 'inOff' }), { type: 'FOUL', side: 'home', payload: { value: 5, kind: 'inOff', frame: 1 } });
    assert.deepEqual(concedeAction(s, 'away'), { type: 'CONCEDE', side: 'away', payload: { side: 'away', frame: 1 } });
    assert.deepEqual(awardAction(s, 'home', 'conduct'), { type: 'AWARD_FRAME', side: 'home', payload: { side: 'home', frame: 1, reason: 'conduct' } });
    assert.deepEqual(frameScoreAction(s, 72, 40), { type: 'FRAME_SCORE', payload: { home: 72, away: 40, frame: 1 } });
    assert.deepEqual(rerackAction(s), { type: 'RERACK', payload: { frame: 1 } });
    assert.deepEqual(breakOffAction(s, 'away'), { type: 'BREAK_OFF', side: 'away', payload: { side: 'away', frame: 1 } });
    // the striker moves: the stamp follows
    const t = apply(s, missAction(s));
    assert.equal(potAction(t, 'red')!.side, 'away');
  });

  test('a builder returns null when the engine would refuse the tap', () => {
    const s = init();
    assert.equal(potAction(s, 'black'), null); // a red is on
    assert.equal(potAction(s, 'red', { reds: 16 }), null);
    assert.equal(potAction(s, 'free'), null); // no free ball
    assert.equal(freeBallAction(s), null); // no foul yet
    assert.equal(playAgainAction(s), null);
    assert.equal(replaceAction(s), null);
    assert.equal(respotTurnAction(s, 'away'), null);
    assert.equal(breakOffAction(s, 'home'), null); // already breaking (B-15)
    assert.equal(frameScoreAction(s, 50, 50), null); // level
    assert.equal(frameScoreAction(s, 1000, 0), null); // over the quick cap
    const t = apply(s, potAction(s, 'red'));
    assert.equal(potAction(t, 'red'), null);
    assert.equal(frameScoreAction(t, 70, 10), null); // the frame has started
    assert.equal(breakOffAction(t, 'away'), null);
  });

  test('a double tap is refused by the engine (the same action twice)', () => {
    let s = init();
    for (const a of [potAction(s, 'red')]) { s = apply(s, a); assert.equal(S.reducer(s, a as never), s); }
    const black = potAction(s, 'black')!;
    s = apply(s, black);
    assert.equal(S.reducer(s, black as never), s);
    const miss = missAction(s)!;
    s = apply(s, miss);
    assert.equal(S.reducer(s, miss as never), s, 'the turn passed: the old striker\'s miss is stale');
    const foul = foulAction(s, { value: 4 })!;
    s = apply(s, foul);
    assert.equal(S.reducer(s, foul as never), s);
    const pa = playAgainAction(s)!;
    s = apply(s, pa);
    assert.equal(S.reducer(s, pa as never), s);
  });

  test('a stale tap from the last frame is refused in the next one (the frame stamp)', () => {
    // frame 1: away breaks; home ends it with a foul on the last black → frame 2: home breaks
    let s = init({ reds: 6, bestOf: 3, firstBreak: 'away' });
    s = apply(s, frameScoreAction(s, 10, 40)); // frame 1 quick, away wins; frame 2 breaker = home
    assert.equal(s.frame!.n, 2);
    assert.equal(s.frame!.striker, 'home');
    const stale = { type: 'FOUL', side: 'home', payload: { value: 7, frame: 1 } };
    assert.equal(S.reducer(s, stale as never), s);
    const staleConcede = concedeAction(init({ reds: 6, bestOf: 3 }), 'home')!;
    assert.equal(S.reducer(s, staleConcede as never), s, 'frame 1\'s concession can\'t end frame 2');
  });

  test('multi-red, free ball, reds down, foul and a miss, penalty', () => {
    let s = init();
    s = apply(s, potAction(s, 'red', { reds: 3 }));
    assert.equal(s.frame!.score.home, 3);
    assert.equal(s.frame!.redsLeft, 12);
    s = apply(s, potAction(s, 'blue'));
    s = apply(s, foulAction(s, { value: 4, freeBall: true, reds: 1, miss: true }));
    assert.equal(s.frame!.redsLeft, 11);
    assert.equal(s.frame!.freeBall, true);
    // the fouled player takes the free ball as a red with a red
    const both = potAction(s, 'red', { free: true })!;
    assert.deepEqual(both.payload, { ball: 'red', free: true, frame: 1 });
    s = apply(s, both);
    assert.equal(s.frame!.score.away, 4 + 2);
    // a non-striker penalty: the other side named, points to the striker
    const pen = foulAction(s, { value: 5, byOther: true })!;
    assert.deepEqual(pen, { type: 'FOUL', side: 'home', payload: { value: 5, penalty: true, frame: 1 } });
    s = apply(s, pen);
    assert.equal(s.frame!.score.away, 11);
    assert.equal(s.frame!.striker, 'away');
  });
});

describe('the panel: what the screen offers', () => {
  test('break-off: a red on, the toss, quick entry, 147 left', () => {
    const p = snookerPanel(init())!;
    assert.equal(p.frame, 1);
    assert.equal(p.striker, 'home');
    assert.equal(p.on, 'red');
    assert.deepEqual(p.balls.filter((b) => b.action).map((b) => b.ball), ['red']);
    assert.deepEqual(p.balls.map((b) => b.ball), ['red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black']);
    assert.deepEqual(p.redMulti.map((r) => r.n), [2, 3]);
    assert.deepEqual(p.foul.values, [4, 5, 6, 7]);
    assert.equal(p.foul.min, 4);
    assert.equal(p.foul.maxRedsDown, 15);
    assert.ok(p.toss);
    assert.equal(p.toss!.home, null); // already breaking
    assert.ok(p.toss!.away);
    assert.ok(p.frameScore);
    assert.equal(p.remaining, 147);
    assert.deepEqual(p.snookers, { home: 0, away: 0 });
    assert.equal(p.afterFoul, null);
    assert.equal(p.respotLots, null);
    assert.ok(p.miss && p.safety && p.rerack);
    assert.ok(p.concede.home && p.concede.away);
  });

  test('after a red: any colour; the clearance: only the colour on', () => {
    let s = init({ reds: 6 });
    s = apply(s, potAction(s, 'red'));
    let p = snookerPanel(s)!;
    assert.deepEqual(p.balls.filter((b) => b.action).map((b) => b.ball), ['yellow', 'green', 'brown', 'blue', 'pink', 'black']);
    assert.equal(p.redMulti.length, 0);
    assert.equal(p.breakPts, 1);
    assert.equal(p.toss, null);
    assert.equal(p.frameScore, false);
    // pot the remaining reds and blacks, then the clearance
    s = apply(s, potAction(s, 'black'));
    for (let i = 0; i < 5; i++) s = pots(s, ['red', 'black']);
    p = snookerPanel(s)!;
    assert.equal(p.on, 'yellow');
    assert.deepEqual(p.balls.map((b) => b.ball), ['yellow']);
    assert.equal(p.foul.min, 4);
    s = pots(s, ['yellow', 'green', 'brown', 'blue']);
    p = snookerPanel(s)!;
    assert.deepEqual(p.balls.map((b) => [b.ball, b.value]), [['pink', 6]]);
    assert.deepEqual(p.foul.values, [6, 7]);
    assert.equal(p.foul.maxRedsDown, 0);
    assert.equal(p.remaining, 13);
  });

  test('after a foul: the fouled player\'s options (play on, play again, free ball, replace on a miss)', () => {
    let s = init();
    s = apply(s, foulAction(s, { value: 4 }));
    let p = snookerPanel(s)!;
    assert.equal(p.striker, 'away');
    assert.ok(p.afterFoul);
    assert.equal(p.afterFoul!.by, 'home');
    assert.equal(p.afterFoul!.value, 4);
    assert.ok(p.afterFoul!.playAgain);
    assert.equal(p.afterFoul!.replace, null);
    assert.ok(p.afterFoul!.freeBall);
    // the free ball given: offered as a ball to pot
    s = apply(s, p.afterFoul!.freeBall);
    p = snookerPanel(s)!;
    assert.equal(p.afterFoul!.freeBall, null);
    assert.equal(p.afterFoul!.freeBallGiven, true);
    assert.deepEqual(p.balls.filter((b) => b.action).map((b) => b.ball), ['red', 'free']);
    assert.deepEqual(p.freeRed.map((r) => r.n), [1, 2, 3]);
    // a foul and a miss: replace is offered
    s = init();
    s = apply(s, foulAction(s, { value: 4, miss: true }));
    p = snookerPanel(s)!;
    assert.ok(p.afterFoul!.replace);
    assert.equal(p.afterFoul!.miss, true);
    assert.ok(p.missWarn);
    assert.equal(p.missWarn!.count, 1);
    assert.equal(p.missWarn!.level, 'count');
  });

  test('the miss sequence: warned, then awardable (15 reds)', () => {
    let s = init();
    for (let i = 0; i < 2; i++) {
      s = apply(s, foulAction(s, { value: 4, miss: true }));
      s = apply(s, replaceAction(s));
    }
    let p = snookerPanel(s)!;
    assert.equal(p.missWarn!.level, 'warned');
    s = apply(s, foulAction(s, { value: 4, miss: true }));
    p = snookerPanel(s)!;
    assert.equal(p.missWarn!.level, 'awardable');
    assert.deepEqual(p.missWarn!.award, { type: 'AWARD_FRAME', side: 'away', payload: { side: 'away', frame: 1, reason: 'miss' } });
    assert.match(missWarning(p.missWarn!, { home: 'Asha', away: 'Ravi' }), /award the frame to Ravi/i);
  });

  test('six reds: the fifth foul and a miss blocks replacing (ball in hand)', () => {
    let s = init({ reds: 6 });
    for (let i = 0; i < 4; i++) {
      s = apply(s, foulAction(s, { value: 4, miss: true }));
      s = apply(s, replaceAction(s));
    }
    s = apply(s, foulAction(s, { value: 4, miss: true }));
    const p = snookerPanel(s)!;
    assert.equal(p.afterFoul!.replace, null);
    assert.equal(p.afterFoul!.replaceBlocked, true);
    assert.equal(p.missWarn!.level, 'ballInHand');
    assert.match(missWarning(p.missWarn!, { home: 'Asha', away: 'Ravi' }), /anywhere/);
  });

  test('the re-spotted black: lots first, then only the black', () => {
    // 6 reds: home 24 (3 × red-black), away 23 + yellow..blue = 37, home pink + black = 37 → level
    let s = init({ reds: 6 });
    s = pots(s, ['red', 'black', 'red', 'black', 'red', 'black']);
    s = apply(s, missAction(s));
    s = pots(s, ['red', 'black', 'red', 'black', 'red', 'pink', 'yellow', 'green', 'brown', 'blue']);
    s = apply(s, missAction(s));
    s = pots(s, ['pink', 'black']);
    assert.deepEqual(s.frame!.score, { home: 37, away: 37 });
    const p = snookerPanel(s)!;
    assert.equal(p.respot, true);
    assert.equal(p.striker, 'away'); // the player who didn't pot the black, until the lots say
    assert.deepEqual(p.balls.map((b) => b.ball), ['black']);
    assert.deepEqual(p.foul.values, [7]);
    assert.equal(p.foul.maxRedsDown, 0);
    assert.equal(p.foul.canFreeBall, false);
    assert.ok(p.respotLots);
    assert.equal(p.respotLots!.away, null);
    const t = apply(s, p.respotLots!.home);
    assert.equal(t.frame!.striker, 'home');
    assert.equal(snookerPanel(t)!.respotLots!.home, null); // B-15: naming the player already to play is a no-op
    const done = apply(t, potAction(t, 'black'));
    assert.deepEqual([done.frames[0].winner, done.frames[0].how], ['home', 'respot']);
    assert.equal(snookerPanel(done)!.frame, 2);
    assert.equal(p.remaining, 7);
    assert.equal(p.frameScore, false);
  });

  test('the panel never throws on hostile or foreign states; no tap is offered', () => {
    for (const bad of [null, undefined, {}, [], 'x', 7, { sport: 'snooker' }, B.createInitialState(), { ...init(), frame: {} }]) {
      assert.equal(snookerPanel(bad as never), null);
      assert.equal(potAction(bad as never, 'red'), null);
      assert.equal(concedeAction(bad as never, 'home'), null);
      assert.equal(frameScoreAction(bad as never, 10, 3), null);
    }
    // a finished match offers nothing
    let s = init({ bestOf: 1 });
    s = apply(s, frameScoreAction(s, 80, 20));
    assert.equal(s.ended, true);
    assert.equal(snookerPanel(s), null);
    assert.equal(missAction(s), null);
  });
});

describe('quick mode: the frame-score check', () => {
  test('whole numbers 0–999, not level; a score past a frame\'s usual maximum asks to check', () => {
    const s = init({ reds: 6 });
    assert.equal(frameScoreCheck(s, '', '').ok, false);
    assert.equal(frameScoreCheck(s, '50', '50').ok, false);
    assert.match(frameScoreCheck(s, '50', '50').error!, /level/);
    assert.equal(frameScoreCheck(s, '7.5', '3').ok, false);
    assert.equal(frameScoreCheck(s, '-1', '3').ok, false);
    assert.equal(frameScoreCheck(s, '1000', '3').ok, false);
    assert.deepEqual(frameScoreCheck(s, '60', '12'), { ok: true, home: 60, away: 12 });
    const big = frameScoreCheck(s, '90', '12');
    assert.equal(big.ok, true);
    assert.match(big.warn!, /75/); // a 6-red frame: 75 without fouls
    assert.equal(frameScoreCheck(init(), '140', '0').warn, undefined);
    assert.match(frameScoreCheck(init(), '160', '0').warn!, /147/);
  });
});

describe('ending a frame or the match asks first', () => {
  test('endingOf: the last black, a concession, a quick frame, the match', () => {
    let s = init({ reds: 6, bestOf: 3 });
    assert.equal(endingOf(S.reducer, s, potAction(s, 'red')!), null);
    const conc = endingOf(S.reducer, s, concedeAction(s, 'away')!)!;
    assert.deepEqual([conc.kind, conc.frame, conc.winner, conc.how], ['frame', 1, 'home', 'concede']);
    s = apply(s, frameScoreAction(s, 70, 20));
    const fin = endingOf(S.reducer, s, frameScoreAction(s, 40, 30)!)!;
    assert.equal(fin.kind, 'match');
    assert.deepEqual(fin.frames, { home: 2, away: 0 });
    const copy = endingCopy(fin, { home: 'Asha', away: 'Ravi' }, 'frame');
    assert.equal(copy.tone, 'danger');
    assert.match(copy.title, /end the match/i);
    assert.match(copy.message, /Asha wins frame 2, 40–30, and the match 2–0/);
    const fc = endingCopy(conc, { home: 'Asha', away: 'Ravi' }, 'frame');
    assert.equal(fc.tone, 'caution');
    assert.match(fc.message, /Ravi concedes/);
    // a refused action never "ends" anything
    assert.equal(endingOf(S.reducer, s, { type: 'NOPE' }), null);
    assert.equal(endingOf(S.reducer, null as never, { type: 'MISS' }), null);
  });

  test('labels are plain words', () => {
    assert.equal(BALL_LABEL.black, 'Black');
    assert.equal(BALL_LABEL.free, 'Free ball');
    for (const k of S.FOUL_KINDS) assert.ok(FOUL_KIND_LABEL[k] && !/\b(he|she)\b/i.test(FOUL_KIND_LABEL[k]), k);
  });
});
