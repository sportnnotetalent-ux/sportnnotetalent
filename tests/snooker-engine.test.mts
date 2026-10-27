/**
 * Snooker engine (WPBSA Official Rules, May 2022; six-red = S3 R19) — the
 * spec as tests, written before the engine (docs/sports/SNOOKER_BILLIARDS_DESIGN.md).
 *
 * Shot by shot: POT / MISS / SAFETY / FOUL by the striker the engine tracks;
 * the fouled player's options (FREE_BALL, PLAY_AGAIN, REPLACE); frame ends on
 * the final black, a foul on it, the re-spotted black, CONCEDE, AWARD_FRAME;
 * quick mode records a frame's score in one FRAME_SCORE. Undo = replaying the
 * log without its last event (useLiveMatch), so the reducer is pure.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sports/snooker/engine.ts';

type Side = 'home' | 'away';
type A = { type: string; side?: Side; payload?: Record<string, unknown> };
const pot = (ball: string, extra: Record<string, unknown> = {}): A => ({ type: 'POT', payload: { ball, ...extra } });
const MISS: A = { type: 'MISS' };
const SAFE: A = { type: 'SAFETY' };
const foul = (value: unknown, extra: Record<string, unknown> = {}): A => ({ type: 'FOUL', payload: { value, ...extra } });
const run = (acts: A[], cfg: Record<string, unknown> = {}) => S.replay(cfg, acts);
const step = (s: S.SnookerState, ...acts: A[]) => acts.reduce((st, a) => S.reducer(st, a), s);
const pairs = (n: number, colour = 'black'): A[] => Array.from({ length: n }, () => [pot('red'), pot(colour)]).flat();
const COLOURS = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
const clearance = (from = 'yellow'): A[] => COLOURS.slice(COLOURS.indexOf(from)).map((c) => pot(c));
const f = (s: S.SnookerState) => s.frame!;

describe('snooker · format', () => {
  test('defaults: 15 reds, best of 5, home breaks frame 1, a red is on', () => {
    const s = S.createInitialState();
    assert.equal(s.reds, 15);
    assert.equal(s.bestOf, 5);
    assert.equal(s.framesToWin, 3);
    assert.equal(s.firstBreak, 'home');
    assert.equal(f(s).n, 1);
    assert.equal(f(s).breaker, 'home');
    assert.equal(f(s).striker, 'home');
    assert.equal(f(s).redsLeft, 15);
    assert.equal(f(s).on, 'red');
    assert.deepEqual(f(s).score, { home: 0, away: 0 });
    assert.equal(s.ended, false);
    assert.equal(S.init, S.createInitialState);
  });

  test('six reds: 6 reds on the table, best of 7 by default; ten reds allowed', () => {
    const six = S.createInitialState({ reds: 6 });
    assert.equal(six.reds, 6);
    assert.equal(f(six).redsLeft, 6);
    assert.equal(six.bestOf, 7);
    assert.equal(six.framesToWin, 4);
    const ten = S.createInitialState({ reds: 10 });
    assert.equal(ten.reds, 10);
    assert.equal(ten.bestOf, 5);
  });

  test('bad options fall back: reds not 6/10/15 → 15; best of rounds up to odd, 1..35', () => {
    assert.equal(S.createInitialState({ reds: 7 }).reds, 15);
    assert.equal(S.createInitialState({ reds: '6' }).reds, 15);
    assert.equal(S.createInitialState({ reds: Number.NaN }).reds, 15);
    assert.equal(S.createInitialState({ bestOf: 4 }).bestOf, 5);
    assert.equal(S.createInitialState({ bestOf: 1 }).framesToWin, 1);
    assert.equal(S.createInitialState({ bestOf: 1000 }).bestOf, 35);
    assert.equal(S.createInitialState({ bestOf: 0 }).bestOf, 1);
    assert.equal(S.createInitialState({ bestOf: Number.NaN }).bestOf, 5);
    assert.equal(S.createInitialState({ bestOf: 'seven' }).bestOf, 5);
    assert.equal(S.createInitialState({ firstBreak: 'away' }).frame!.striker, 'away');
    assert.equal(S.createInitialState({ firstBreak: 'nobody' }).frame!.striker, 'home');
  });

  test('maximum break: 147 / 107 / 75', () => {
    assert.equal(S.maxBreak(15), 147);
    assert.equal(S.maxBreak(10), 107);
    assert.equal(S.maxBreak(6), 75);
  });
});

describe('snooker · pots and the ball on (S3 R3(g)–(h))', () => {
  test('a red, then a colour of the striker\'s choice (re-spotted), then a red again', () => {
    let s = run([pot('red')]);
    assert.equal(f(s).score.home, 1);
    assert.equal(f(s).on, 'colour');
    assert.equal(f(s).redsLeft, 14);
    s = step(s, pot('black'));
    assert.equal(f(s).score.home, 8);
    assert.equal(f(s).on, 'red');
    s = step(s, pot('red'), pot('pink'));
    assert.equal(f(s).score.home, 15);
    assert.equal(f(s).visit.pts, 15);
    assert.equal(f(s).striker, 'home');
  });

  test('every ball value: yellow 2 … black 7', () => {
    const vals = COLOURS.map((c) => f(run([pot('red'), pot(c)])).score.home - 1);
    assert.deepEqual(vals, [2, 3, 4, 5, 6, 7]);
  });

  test('several reds in one stroke each score (S3 R3(g))', () => {
    const s = run([pot('red', { reds: 3 })]);
    assert.equal(f(s).score.home, 3);
    assert.equal(f(s).redsLeft, 12);
    assert.equal(f(s).on, 'colour');
  });

  test('impossible pots are ignored (same state back)', () => {
    const s0 = S.createInitialState();
    assert.equal(S.reducer(s0, pot('black')), s0, 'a colour while a red is on');
    const s1 = run([pot('red')]);
    assert.equal(S.reducer(s1, pot('red')), s1, 'a red while a colour is on');
    const s2 = run([pot('red'), pot('black')]);
    assert.equal(S.reducer(s2, pot('pink')), s2, 'a colour after a colour while reds remain');
    assert.equal(S.reducer(s0, pot('red', { reds: 16 })), s0, 'more reds than are on the table');
    assert.equal(S.reducer(s0, pot('red', { reds: 0 })), s0);
    assert.equal(S.reducer(s0, pot('red', { reds: 1.5 })), s0);
    assert.equal(S.reducer(s0, pot('purple')), s0, 'an unknown ball');
    assert.equal(S.reducer(s0, { type: 'POT' }), s0, 'no ball');
  });

  test('after the last red a colour, then the colours in order (S3 R3(h)(iii))', () => {
    let s = run([...pairs(14), pot('red')]);
    assert.equal(f(s).redsLeft, 0);
    assert.equal(f(s).on, 'colour');
    s = step(s, pot('blue'));
    assert.equal(f(s).on, 'yellow');
    const before = s;
    assert.equal(S.reducer(s, pot('black')), before, 'out of order');
    assert.equal(S.reducer(s, pot('red')), before, 'no reds left');
    s = step(s, pot('yellow'));
    assert.equal(f(s).on, 'green');
    s = step(s, pot('green'), pot('brown'), pot('blue'), pot('pink'));
    assert.equal(f(s).on, 'black');
  });

  test('a missed colour after the last red: the next player is on the yellow', () => {
    const s = run([...pairs(14), pot('red'), MISS]);
    assert.equal(f(s).striker, 'away');
    assert.equal(f(s).on, 'yellow');
  });

  test('MISS and SAFETY end the visit and pass the turn; the next turn starts on a red', () => {
    let s = run([pot('red'), pot('black'), pot('red'), MISS]);
    assert.equal(f(s).striker, 'away');
    assert.equal(f(s).on, 'red');
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 9, 'miss']]);
    s = step(s, SAFE);
    assert.equal(f(s).striker, 'home');
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 9, 'miss'], ['away', 0, 'safety']]);
    // a missed colour after a red: the next player is on a red
    s = step(s, pot('red'), MISS);
    assert.equal(f(s).on, 'red');
  });

  test('a 147: the final black ends the frame; the next frame is broken by the other player', () => {
    const s = run([...pairs(15), ...clearance()]);
    assert.equal(s.frames.length, 1);
    const fr = s.frames[0];
    assert.deepEqual(fr.score, [147, 0]);
    assert.equal(fr.winner, 'home');
    assert.equal(fr.how, 'black');
    assert.deepEqual(fr.visits!.map((v) => [v.side, v.pts, v.end]), [['home', 147, 'frame']]);
    assert.deepEqual(s.framesWon, { home: 1, away: 0 });
    assert.equal(f(s).n, 2);
    assert.equal(f(s).breaker, 'away');
    assert.equal(f(s).striker, 'away');
    assert.equal(f(s).redsLeft, 15);
    assert.equal(S.snookerStats(s).home.maximums, 1);
  });

  test('six reds: a 75 is the maximum', () => {
    const s = run([...pairs(6), ...clearance()], { reds: 6 });
    assert.deepEqual(s.frames[0].score, [75, 0]);
    assert.equal(S.snookerStats(s).home.maximums, 1);
    assert.equal(S.snookerStats(s).home.highestBreak, 75);
  });
});

describe('snooker · fouls (S3 R10–R11)', () => {
  test('a foul gives the opponent the penalty, ends the break (its points count), passes the turn', () => {
    const s = run([pot('red'), pot('black'), foul(4)]);
    assert.deepEqual(f(s).score, { home: 8, away: 4 });
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 8, 'foul']]);
    assert.deepEqual(f(s).fouls, [{ by: 'home', value: 4 }]);
    assert.equal(f(s).striker, 'away');
    assert.equal(f(s).on, 'red');
  });

  test('the value is clamped to [minimum for the ball on, 7]', () => {
    assert.equal(f(run([foul(2)])).score.away, 4, 'below 4 → 4');
    assert.equal(f(run([foul(9)])).score.away, 7, 'above 7 → 7');
    assert.equal(f(run([foul(undefined)])).score.away, 4, 'missing → the minimum');
    assert.equal(f(run([foul(Number.NaN)])).score.away, 4);
    assert.equal(f(run([foul('7')])).score.away, 4, 'a string is not a number');
    assert.equal(f(run([foul(5.6)])).score.away, 6, 'rounded');
    // in the clearance the ball on sets the minimum (S3 R11(a)-(b): value of the ball on)
    const onPink = [...pairs(15), pot('yellow'), pot('green'), pot('brown'), pot('blue')];
    assert.equal(f(run([...onPink, foul(4)])).score.away, 6);
    assert.equal(f(run([...onPink, foul(5)])).score.away, 6);
    assert.equal(f(run([...onPink, foul(7)])).score.away, 7);
    const onYellow = pairs(15);
    assert.equal(f(run([...onYellow, foul(4)])).score.away, 4, 'yellow: still 4');
  });

  test('a foul on the colour after a red may be worth up to 7; the next player is on a red', () => {
    const s = run([pot('red'), foul(7)]);
    assert.equal(f(s).score.away, 7);
    assert.equal(f(s).on, 'red');
    assert.equal(f(s).striker, 'away');
  });

  test('reds that go down in a foul stay off the table (S3 R3(i))', () => {
    const s = run([foul(4, { reds: 2 })]);
    assert.equal(f(s).redsLeft, 13);
    assert.equal(f(s).fouls[0].reds, 2);
    assert.equal(f(run([foul(4, { reds: 99 })])).redsLeft, 0, 'clamped to the reds on the table');
  });

  test('the last red down in a foul: the next player is on the yellow', () => {
    const s = run([...pairs(14), foul(4, { reds: 1 })]);
    assert.equal(f(s).redsLeft, 0);
    assert.equal(f(s).on, 'yellow');
    const t = run([...pairs(14), pot('red'), foul(4)]);
    assert.equal(f(t).on, 'yellow', 'a foul on the colour after the last red');
  });

  test('a penalty by the non-striker (S3 R3(k)): points to the striker, the turn goes on', () => {
    let s = run([pot('red'), { type: 'FOUL', side: 'away', payload: { value: 4 } }]);
    assert.deepEqual(f(s).score, { home: 5, away: 0 });
    assert.equal(f(s).striker, 'home');
    assert.equal(f(s).on, 'colour', 'the striker\'s turn is unaffected');
    assert.deepEqual(f(s).fouls, [{ by: 'away', value: 4, penalty: true }]);
    s = step(s, pot('black'));
    assert.equal(f(s).visit.pts, 8, 'penalty points are not part of the break');
    assert.equal(f(s).score.home, 12);
  });

  test('a foul on the final black ends the frame — the offender wins if still ahead (S3 R4(a))', () => {
    const s = run([...pairs(15), ...clearance().slice(0, 5), SAFE, MISS, foul(7)]);
    assert.equal(s.frames.length, 1);
    assert.deepEqual(s.frames[0].score, [140, 7]);
    assert.equal(s.frames[0].winner, 'home');
    assert.equal(s.frames[0].how, 'foul');
  });
});

describe('snooker · free ball (S3 R12)', () => {
  test('called with the foul: the free ball counts as a red, then a colour', () => {
    let s = run([foul(4, { freeBall: true })]);
    assert.equal(f(s).freeBall, true);
    s = step(s, pot('free'));
    assert.equal(f(s).score.away, 5);
    assert.equal(f(s).redsLeft, 15, 'the free ball is re-spotted');
    assert.equal(f(s).on, 'colour');
    s = step(s, pot('black'));
    assert.equal(f(s).score.away, 12);
    assert.equal(f(s).visit.fb, 1);
    assert.equal(f(s).fouls[0].fb, true);
  });

  test('FREE_BALL right after the foul does the same; it is refused at any other time', () => {
    const s = run([foul(4), { type: 'FREE_BALL' }]);
    assert.equal(f(s).freeBall, true);
    const s0 = S.createInitialState();
    assert.equal(S.reducer(s0, { type: 'FREE_BALL' }), s0, 'no foul');
    const s1 = run([foul(4), pot('red')]);
    assert.equal(S.reducer(s1, { type: 'FREE_BALL' }), s1, 'a stroke since the foul');
    assert.equal(S.reducer(s0, pot('free')), s0, 'no free ball to pot');
    const s2 = run([foul(4, { freeBall: true }), pot('red')]);
    assert.equal(f(s2).freeBall, undefined, 'only the first stroke of the turn');
    assert.equal(S.reducer(s2, pot('free')), s2);
  });

  test('free ball and red(s) in one stroke: each scores (S3 R12(e))', () => {
    const s = run([foul(4, { freeBall: true }), pot('red', { free: true })]);
    assert.equal(f(s).score.away, 4 + 2);
    assert.equal(f(s).redsLeft, 14);
    assert.equal(f(s).on, 'colour');
    const s0 = S.createInitialState();
    assert.equal(S.reducer(s0, pot('red', { free: true })), s0, 'free:true needs a free ball');
  });

  test('in the clearance the free ball takes the colour on\'s value; that colour stays on', () => {
    let s = run([...pairs(15), pot('yellow'), foul(4, { freeBall: true })]);
    assert.equal(f(s).on, 'green');
    s = step(s, pot('free'));
    assert.equal(f(s).score.away, 4 + 3);
    assert.equal(f(s).on, 'green');
    s = step(s, pot('green'));
    assert.equal(f(s).score.away, 4 + 3 + 3);
    assert.equal(f(s).on, 'brown');
  });

  test('no free ball when only the black is left (nothing to nominate)', () => {
    const s = run([...pairs(15), ...clearance().slice(0, 5), SAFE, foul(7, { freeBall: true })]);
    // the foul on the final black ended the frame (away fouled, home 140 + 7)
    assert.equal(s.frames.length, 1);
    const t = run([...pairs(15), ...clearance().slice(0, 5), SAFE]);
    assert.equal(S.reducer(t, pot('free')), t);
  });

  test('a total clearance with a free ball: 155, the only way past 147', () => {
    const s = run([foul(4, { freeBall: true }), pot('free'), pot('black'), ...pairs(15), ...clearance()]);
    assert.deepEqual(s.frames[0].score, [0, 4 + 155], 'the 4-point foul + a 155 break');
    assert.equal(S.snookerStats(s).away.highestBreak, 155);
    assert.equal(S.snookerStats(s).away.maximums, 0, 'a 155 is not a 147 maximum');
  });

  test('play again voids the free ball (S3 R12(f))', () => {
    const s = run([foul(4, { freeBall: true }), { type: 'PLAY_AGAIN' }]);
    assert.equal(f(s).striker, 'home');
    assert.equal(f(s).freeBall, undefined);
  });
});

describe('snooker · play again and foul and a miss (S3 R13–R14, R19)', () => {
  test('PLAY_AGAIN: the offender plays again from where the balls lie; only straight after the foul', () => {
    let s = run([pot('red'), foul(5), { type: 'PLAY_AGAIN' }]);
    assert.equal(f(s).striker, 'home');
    assert.equal(f(s).on, 'red', 'a new turn: a red is on');
    assert.equal(S.reducer(s, { type: 'PLAY_AGAIN' }), s, 'once');
    s = step(s, pot('red'));
    assert.equal(S.reducer(s, { type: 'PLAY_AGAIN' }), s, 'after a stroke');
    const s0 = S.createInitialState();
    assert.equal(S.reducer(s0, { type: 'PLAY_AGAIN' }), s0, 'no foul');
  });

  test('REPLACE needs a foul and a miss; it puts back the reds and the ball on', () => {
    const plain = run([foul(4)]);
    assert.equal(S.reducer(plain, { type: 'REPLACE' }), plain, 'not a miss');
    let s = run([pot('red'), foul(7, { miss: true, reds: 1 })]);
    assert.equal(f(s).redsLeft, 13);
    s = step(s, { type: 'REPLACE' });
    assert.equal(f(s).striker, 'home');
    assert.equal(f(s).redsLeft, 14, 'the red down in the foul is replaced');
    assert.equal(f(s).on, 'colour', 'the same ball on as before the stroke: a colour');
    s = step(s, pot('black'));
    assert.deepEqual(f(s).score, { home: 8, away: 7 });
  });

  test('15 reds: warned after the second miss, the third makes the frame awardable', () => {
    const miss = foul(4, { miss: true });
    const R: A = { type: 'REPLACE' };
    let s = run([miss, R]);
    assert.deepEqual(S.missStatus(s), { by: 'home', count: 1, warned: false, awardable: false, ballInHand: false });
    s = step(s, miss, R);
    assert.deepEqual(S.missStatus(s), { by: 'home', count: 2, warned: true, awardable: false, ballInHand: false });
    s = step(s, miss);
    assert.deepEqual(S.missStatus(s), { by: 'home', count: 3, warned: true, awardable: true, ballInHand: false });
    s = step(s, { type: 'AWARD_FRAME', payload: { side: 'away', reason: 'miss' } });
    assert.equal(s.frames[0].winner, 'away');
    assert.equal(s.frames[0].how, 'award');
    assert.equal(s.frames[0].reason, 'miss');
    assert.deepEqual(s.frames[0].score, [0, 12]);
  });

  test('the miss run ends when the fouled player plays on or asks for play from the position left', () => {
    const miss = foul(4, { miss: true });
    let s = run([miss, { type: 'REPLACE' }, miss, SAFE]);
    assert.equal(S.missStatus(s), null);
    s = run([miss, { type: 'REPLACE' }, miss, { type: 'PLAY_AGAIN' }]);
    assert.equal(S.missStatus(s), null);
    s = step(s, miss);
    assert.equal(S.missStatus(s)!.count, 1, 'a new sequence');
  });

  test('six reds: warned after the fourth miss; no replacing after the fifth (S3 R19(a)–(b))', () => {
    const miss = foul(4, { miss: true });
    const R: A = { type: 'REPLACE' };
    let s = run([miss, R, miss, R, miss, R], { reds: 6 });
    assert.equal(S.missStatus(s)!.warned, false);
    s = step(s, miss, R);
    assert.deepEqual(S.missStatus(s), { by: 'home', count: 4, warned: true, awardable: false, ballInHand: false });
    s = step(s, miss);
    assert.deepEqual(S.missStatus(s), { by: 'home', count: 5, warned: true, awardable: false, ballInHand: true });
    assert.equal(S.reducer(s, R), s, 'no sixth replacement');
    assert.equal(f(s).score.away, 20);
  });
});

describe('snooker · re-spotted black (S3 R4(b))', () => {
  // home 5 (away's foul) + 8×(red, black) = 69; away 7×(red, black) + yellow to pink = 76; on the black
  const level = [SAFE, foul(5), ...pairs(8), MISS, ...pairs(7), ...clearance().slice(0, 5), MISS];

  test('the final black potted to level the scores: the black is re-spotted', () => {
    let s = run([...level, pot('black')]);
    assert.deepEqual(f(s).score, { home: 76, away: 76 });
    assert.equal(f(s).respot, true);
    assert.equal(f(s).on, 'black');
    assert.equal(f(s).striker, 'away', 'by default the player who did not pot the black');
    assert.equal(s.frames.length, 0);
    s = step(s, { type: 'RESPOT_TURN', payload: { side: 'home' } });
    assert.equal(f(s).striker, 'home', 'the lots');
    s = step(s, MISS);
    assert.equal(f(s).striker, 'away');
    assert.equal(S.reducer(s, { type: 'RESPOT_TURN', payload: { side: 'home' } }), s, 'only before the first stroke');
    s = step(s, pot('black'));
    assert.equal(s.frames.length, 1);
    assert.deepEqual(s.frames[0].score, [76, 83]);
    assert.equal(s.frames[0].winner, 'away');
    assert.equal(s.frames[0].how, 'respot');
  });

  test('a foul on the re-spotted black ends it: 7 to the opponent', () => {
    const s = run([...level, pot('black'), foul(4)]);
    assert.deepEqual(s.frames[0].score, [83, 76]);
    assert.equal(s.frames[0].winner, 'home');
  });

  test('a foul on the final black that levels the scores also re-spots it', () => {
    const acts = [SAFE, foul(7), SAFE, foul(7), SAFE, foul(5), ...pairs(8), MISS, ...pairs(7), ...clearance().slice(0, 5), MISS, foul(7)];
    const s = run(acts);
    assert.deepEqual(f(s).score, { home: 83, away: 83 });
    assert.equal(f(s).respot, true);
    assert.equal(f(s).striker, 'away', 'the player who did not foul');
  });
});

describe('snooker · concession and award (S4 R2, S3 R14(d))', () => {
  test('the side behind concedes', () => {
    const s = run([pot('red'), pot('black'), MISS, { type: 'CONCEDE', payload: { side: 'away' } }]);
    assert.equal(s.frames[0].winner, 'home');
    assert.equal(s.frames[0].how, 'concede');
    assert.equal(s.frames[0].conceded, 'away');
    assert.deepEqual(s.frames[0].score, [8, 0]);
  });

  test('a concession stands at any score — level or ahead, the opponent wins the frame', () => {
    const level = run([{ type: 'CONCEDE', side: 'home' }]);
    assert.equal(level.frames[0].winner, 'away');
    const ahead = run([pot('red'), pot('black'), MISS, { type: 'CONCEDE', payload: { side: 'home' } }]);
    assert.equal(ahead.frames[0].winner, 'away');
    assert.deepEqual(ahead.frames[0].score, [8, 0]);
  });

  test('conceding while the opponent is in a break keeps that break', () => {
    const s = run([pot('red'), pot('black'), pot('red'), pot('pink'), { type: 'CONCEDE', payload: { side: 'away' } }]);
    assert.deepEqual(s.frames[0].visits!.map((v) => [v.side, v.pts, v.end]), [['home', 15, 'frame']]);
  });

  test('AWARD_FRAME and CONCEDE need a side', () => {
    const s0 = S.createInitialState();
    assert.equal(S.reducer(s0, { type: 'CONCEDE' }), s0);
    assert.equal(S.reducer(s0, { type: 'AWARD_FRAME', payload: { side: 'x' } }), s0);
    const s = S.reducer(s0, { type: 'AWARD_FRAME', payload: { side: 'home', reason: 'conduct' } });
    assert.equal(s.frames[0].winner, 'home');
    assert.equal(s.frames[0].reason, 'conduct');
  });
});

describe('snooker · the match', () => {
  const frameTo = (side: Side): A => ({ type: 'CONCEDE', payload: { side: side === 'home' ? 'away' : 'home' } });

  test('best of 3: two frames win; then every action is ignored', () => {
    const s = run([frameTo('home'), frameTo('away'), frameTo('home')], { bestOf: 3 });
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'home');
    assert.equal(S.isComplete(s), true);
    assert.equal(S.winner(s), 'home');
    assert.deepEqual(S.result(s), { winner: 'home', home: 2, away: 1 });
    assert.equal(s.frame, null);
    for (const a of [pot('red'), MISS, foul(4), frameTo('away'), { type: 'FRAME_SCORE', payload: { home: 1, away: 50 } }, { type: 'BREAK_OFF', side: 'away' }]) {
      assert.equal(S.reducer(s, a), s);
    }
    assert.equal(S.result(S.createInitialState()), null);
  });

  test('the break-off alternates frame by frame (S3 R3(b)); the toss can be recorded before the first stroke', () => {
    let s = run([{ type: 'BREAK_OFF', payload: { side: 'away' } }]);
    assert.equal(s.firstBreak, 'away');
    assert.equal(f(s).striker, 'away');
    s = step(s, pot('red'));
    assert.equal(S.reducer(s, { type: 'BREAK_OFF', payload: { side: 'home' } }), s, 'not after a stroke');
    s = step(s, frameTo('home'));
    assert.equal(f(s).breaker, 'home', 'frame 2: the other player');
    // frame 2 broken by the wrong player: only that frame (S3 R3(d))
    s = step(s, { type: 'BREAK_OFF', side: 'away' }, frameTo('home'));
    assert.equal(f(s).n, 3);
    assert.equal(f(s).breaker, 'away', 'frame 3 resumes the right order');
  });

  test('score line, line score and summary', () => {
    const s = run([{ type: 'FRAME_SCORE', payload: { home: 72, away: 35 } }, { type: 'FRAME_SCORE', payload: { home: 12, away: 80 } }, pot('red')], { bestOf: 3 });
    assert.equal(S.scoreLine(s), '72-35, 12-80');
    assert.equal(S.scoreLine(s, 'away'), '35-72, 80-12');
    const ls = S.lineScore(s)!;
    assert.deepEqual(ls.done, [{ home: 72, away: 35 }, { home: 12, away: 80 }]);
    assert.deepEqual(ls.current, { home: 1, away: 0 }, 'frame 3 is broken by home');
    assert.deepEqual(ls.won, { home: 1, away: 1 });
    assert.equal(ls.toWin, 2);
    assert.equal(ls.ended, false);
    const sum = S.summary(s);
    assert.equal(sum.homeScore, '1');
    assert.equal(sum.awayScore, '0');
    assert.match(sum.statusLine, /Frame 3/);
    assert.match(sum.detailLine!, /1–1/);
    const done = step(s, MISS, { type: 'CONCEDE', side: 'home' });
    const fin = S.summary(done);
    assert.equal(fin.statusLine, 'Match Over');
    assert.equal(fin.homeScore, '1');
    assert.equal(fin.awayScore, '2');
    assert.equal(fin.detailLine, '72-35, 12-80, 1-0');
    assert.deepEqual(S.standingsUnits(done), { points: { home: 85, away: 115 } });
  });
});

describe('snooker · quick mode and mixed frames', () => {
  const FS = (home: unknown, away: unknown): A => ({ type: 'FRAME_SCORE', payload: { home, away } });

  test('FRAME_SCORE records a frame in one action', () => {
    const s = run([FS(72, 35)]);
    assert.deepEqual(s.frames[0].score, [72, 35]);
    assert.equal(s.frames[0].winner, 'home');
    assert.equal(s.frames[0].how, 'quick');
    assert.equal(s.frames[0].quick, true);
    assert.equal(s.frames[0].visits, undefined);
    assert.equal(f(s).n, 2);
  });

  test('a level, negative, fractional, non-number or absurd score is refused', () => {
    const s0 = S.createInitialState();
    for (const [h, a] of [[50, 50], [-1, 50], [50.5, 3], ['72', 35], [null, 3], [Number.POSITIVE_INFINITY, 0], [100000, 0]]) {
      assert.equal(S.reducer(s0, FS(h, a)), s0, `${h}-${a}`);
    }
  });

  test('only on a frame with no stroke yet', () => {
    const s = run([pot('red')]);
    assert.equal(S.reducer(s, FS(72, 35)), s);
  });

  test('a match may mix quick and shot-by-shot frames; breaks come only from shot-by-shot frames', () => {
    const s = run([FS(72, 35), ...pairs(15), ...clearance(), FS(10, 80)], { bestOf: 3 });
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'away');
    assert.equal(S.scoreLine(s), '72-35, 0-147, 10-80');
    const st = S.snookerStats(s);
    assert.equal(st.away.highestBreak, 147);
    assert.equal(st.home.highestBreak, 0);
    assert.deepEqual(st.home.breaks, []);
    assert.equal(st.home.points, 82);
    assert.equal(st.away.points, 262);
    assert.equal(st.home.quickFrames, 2);
    assert.equal(st.home.detailedFrames, 1);
  });
});

describe('snooker · points remaining and snookers required', () => {
  test('points remaining through a frame', () => {
    assert.equal(S.pointsRemaining(S.createInitialState()), 147);
    assert.equal(S.pointsRemaining(S.createInitialState({ reds: 6 })), 75);
    assert.equal(S.pointsRemaining(run([pot('red')])), 7 + 14 * 8 + 27);
    assert.equal(S.pointsRemaining(run([pot('red'), pot('black')])), 14 * 8 + 27);
    assert.equal(S.pointsRemaining(run([...pairs(15), pot('yellow')])), 25);
    assert.equal(S.pointsRemaining(run([SAFE, foul(5), ...pairs(8), MISS, ...pairs(7), ...clearance().slice(0, 5), MISS, pot('black')])), 7);
  });

  test('snookers required: the deficit beyond the points left, in penalties of the ball on', () => {
    // home 8×(red, black); away 7×(red, black) and yellow to blue: only pink + black left
    const s = run([...pairs(8), MISS, ...pairs(7), pot('yellow'), pot('green'), pot('brown'), pot('blue'), MISS]);
    assert.deepEqual(f(s).score, { home: 64, away: 70 });
    assert.equal(S.pointsRemaining(s), 13);
    assert.equal(S.snookersRequired(s, 'home'), 0);
    assert.equal(S.snookersRequired(s, 'away'), 0);
    const t = step(s, pot('pink'), MISS);
    // home 70 v away 70, black left
    assert.equal(S.snookersRequired(t, 'home'), 0);
    const u = run([...pairs(10), pot('red'), pot('pink'), pot('red'), pot('pink'), pot('red'), pot('pink'), pot('red'), pot('pink'), pot('red'), pot('pink'), pot('yellow'), pot('green'), pot('brown'), MISS]);
    // home 80 + 35 + 9 = 124, away 0 with blue, pink, black (18) left
    assert.equal(f(u).score.home, 124);
    assert.equal(S.pointsRemaining(u), 18);
    assert.equal(S.snookersRequired(u, 'away'), Math.ceil((124 - 18) / 5));
    assert.equal(S.snookersRequired(u, 'home'), 0);
  });

  test('ballOn describes what the scorer can tap', () => {
    assert.deepEqual(S.ballOn(S.createInitialState()), { on: 'red', redsLeft: 15, freeBall: false, respot: false, allowed: ['red'] });
    assert.deepEqual(S.ballOn(run([pot('red')]))!.allowed, COLOURS);
    assert.deepEqual(S.ballOn(run([foul(4, { freeBall: true })]))!.allowed, ['red', 'free']);
    assert.deepEqual(S.ballOn(run(pairs(15)))!.allowed, ['yellow']);
  });
});

describe('snooker · statistics', () => {
  test('per side: points, breaks, fouls, safeties, misses, pot success', () => {
    const s = run([
      ...pairs(7), MISS, // home 56
      SAFE, // away
      pot('red'), pot('pink'), MISS, // home 63
      foul(4, { miss: true, kind: 'noContact' }), // away fouls → home 67
      SAFE, // home plays on
      pot('red'), pot('black'), SAFE, // away 8
      { type: 'CONCEDE', payload: { side: 'away' } },
    ]);
    const { home, away } = S.snookerStats(s);
    assert.equal(home.framesWon, 1);
    assert.equal(home.points, 67);
    assert.equal(home.potted, 63);
    assert.equal(home.penaltyReceived, 4);
    assert.deepEqual(home.breaks, [56, 7]);
    assert.equal(home.highestBreak, 56);
    assert.equal(home.fiftyPlus, 1);
    assert.equal(home.centuries, 0);
    assert.equal(home.visits, 3);
    assert.equal(home.potStrokes, 16);
    assert.equal(home.missedPots, 2);
    assert.equal(home.potSuccess, 16 / 18);
    assert.equal(home.safeties, 1);
    assert.equal(home.fouls, 0);
    assert.equal(away.points, 8);
    assert.deepEqual(away.breaks, [8]);
    assert.equal(away.visits, 3);
    assert.equal(away.safeties, 2);
    assert.equal(away.fouls, 1);
    assert.equal(away.missesCalled, 1);
    assert.equal(away.penaltyConceded, 4);
    assert.deepEqual(away.foulsByKind, { noContact: 1 });
    assert.equal(away.potSuccess, 1);
    assert.deepEqual(S.breaks(s, 50), [{ side: 'home', frame: 1, pts: 56 }]);
  });

  test('a century and the free balls awarded', () => {
    const s = run([foul(4, { freeBall: true }), pot('free'), pot('black'), ...pairs(12), MISS]);
    const st = S.snookerStats(s);
    assert.equal(st.away.highestBreak, 104);
    assert.equal(st.away.centuries, 1);
    assert.equal(st.away.fiftyPlus, 1);
    assert.equal(st.away.freeBalls, 1);
    assert.equal(st.home.potSuccess, null, 'no pot attempted');
  });

  test('a break in progress counts toward the highest break', () => {
    const s = run(pairs(7));
    assert.equal(S.snookerStats(s).home.highestBreak, 56);
  });
});

describe('snooker · malformed input and replay', () => {
  test('unknown, empty or broken actions are ignored (same state back)', () => {
    const s0 = S.createInitialState();
    for (const a of [{ type: 'NOPE' }, { type: '' }, {}, null, undefined, 42, 'POT', { type: 'POT', payload: 'red' }, { type: 'POT', payload: ['red'] }, { type: 'POT', payload: null }]) {
      assert.equal(S.reducer(s0, a as never), s0, JSON.stringify(a));
    }
  });

  test('a shot action naming the wrong side is ignored', () => {
    const s0 = S.createInitialState();
    assert.equal(S.reducer(s0, { type: 'POT', side: 'away', payload: { ball: 'red' } }), s0);
    assert.equal(S.reducer(s0, { type: 'MISS', side: 'away' }), s0);
    assert.notEqual(S.reducer(s0, { type: 'POT', side: 'home', payload: { ball: 'red' } }), s0);
  });

  test('never mutates the state it is given', () => {
    const s = run([pot('red'), pot('black'), foul(4, { freeBall: true })]);
    const before = JSON.stringify(s);
    step(s, pot('free'), pot('black'), MISS, { type: 'CONCEDE', side: 'home' });
    assert.equal(JSON.stringify(s), before);
  });

  test('replay is deterministic; replaying without the last event is undo', () => {
    const acts = [pot('red'), pot('black'), MISS, foul(4, { freeBall: true }), pot('free'), pot('pink'), SAFE, { type: 'CONCEDE', side: 'away' }, pot('red')];
    assert.deepEqual(run(acts), run(acts));
    for (let i = 0; i <= acts.length; i++) {
      const prefix = run(acts.slice(0, i));
      assert.deepEqual(i < acts.length ? S.reducer(prefix, acts[i]) : prefix, run(acts.slice(0, i + 1)));
    }
  });
});
