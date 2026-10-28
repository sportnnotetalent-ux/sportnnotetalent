/**
 * English billiards engine (WPBSA Rules of the Game of English Billiards, May
 * 2022) — the spec as tests, written before the engine
 * (docs/sports/SNOOKER_BILLIARDS_DESIGN.md).
 *
 * A stroke scores pots, in-offs and cannons in any combination (S3 R4); a
 * visit (break) ends on a miss, a safety, a foul (2 points to the opponent,
 * S3 R16(c)) or the frame's end; the 16th consecutive hazard / 76th
 * consecutive cannon is a foul (S3 R10–R11, R15(k)–(l)). Formats: N-up frames
 * (the IBSF short format, 150-up best of N), a single N-up game, a timed game.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/sports/billiards/engine.ts';

type Side = 'home' | 'away';
type A = { type: string; side?: Side; payload?: Record<string, unknown> };
const sc = (p: Record<string, unknown>): A => ({ type: 'SCORE', payload: p });
const PR = sc({ potRed: true });
const PW = sc({ potWhite: true });
const IR = sc({ inOffRed: true });
const IW = sc({ inOffWhite: true });
const C = sc({ cannon: true });
const PRC = sc({ potRed: true, cannon: true });
const MISS: A = { type: 'MISS' };
const SAFE: A = { type: 'SAFETY' };
const FOUL = (kind?: string): A => ({ type: 'FOUL', payload: kind ? { kind } : {} });
const times = (n: number, a: A): A[] => Array.from({ length: n }, () => a);
/** B-02 — what the scorer's controls do: a frame-ending action carries the
 *  number of the frame it was tapped in. */
const ENDERS = new Set(['CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE']);
const stamp = (s: B.BilliardsState, a: A): A =>
  (ENDERS.has(a?.type) && s?.frame && a.payload?.frame === undefined ? { ...a, payload: { ...(a.payload ?? {}), frame: s.frame.n } } : a);
const ui = (s: B.BilliardsState, a: A) => B.reducer(s, stamp(s, a));
const run = (acts: A[], cfg: Record<string, unknown> = {}) => acts.reduce(ui, B.createInitialState(cfg));
const step = (s: B.BilliardsState, ...acts: A[]) => acts.reduce(ui, s);
const f = (s: B.BilliardsState) => s.frame!;
const LONG = { target: 1000, bestOf: 1 };

describe('billiards · format', () => {
  test('defaults: 150-up, best of 5 (IBSF short format), 2-point fouls, 15 hazards / 75 cannons', () => {
    const s = B.createInitialState();
    assert.equal(s.format, 'points');
    assert.equal(s.target, 150);
    assert.equal(s.bestOf, 5);
    assert.equal(s.framesToWin, 3);
    assert.equal(s.foulPoints, 2);
    assert.equal(s.hazardLimit, 15);
    assert.equal(s.cannonLimit, 75);
    assert.equal(s.timedTie, 'sudden');
    assert.equal(f(s).striker, 'home');
    assert.equal(f(s).n, 1);
    assert.equal(B.init, B.createInitialState);
  });

  test('timed is one game; bad options fall back', () => {
    assert.equal(B.createInitialState({ format: 'timed', bestOf: 5 }).bestOf, 1);
    assert.equal(B.createInitialState({ format: 'snooker' }).format, 'points');
    assert.equal(B.createInitialState({ target: 5 }).target, 10);
    assert.equal(B.createInitialState({ target: 1e9 }).target, 5000);
    assert.equal(B.createInitialState({ target: '150' }).target, 150);
    assert.equal(B.createInitialState({ target: 100 }).target, 100);
    assert.equal(B.createInitialState({ bestOf: 4 }).bestOf, 5);
    assert.equal(B.createInitialState({ foulPoints: 0 }).foulPoints, 1);
    assert.equal(B.createInitialState({ foulPoints: 99 }).foulPoints, 7);
    assert.equal(B.createInitialState({ hazardLimit: 0 }).hazardLimit, 0);
    assert.equal(B.createInitialState({ hazardLimit: -3 }).hazardLimit, 15);
    assert.equal(B.createInitialState({ timedTie: 'draw' }).timedTie, 'draw');
    assert.equal(B.createInitialState({ timedTie: 'coin' }).timedTie, 'sudden');
    assert.equal(B.createInitialState({ firstBreak: 'away' }).frame!.striker, 'away');
  });
});

describe('billiards · scoring strokes (S3 R4)', () => {
  test('pot red 3, pot white 2, in-off red 3, in-off white 2, cannon 2', () => {
    assert.deepEqual([PR, PW, IR, IW, C].map((a) => f(run([a])).score.home), [3, 2, 3, 2, 2]);
    assert.equal(B.strokeValue({ potRed: true, cannon: true }), 5);
  });

  test('a combination scores every part: the most in one stroke is 10', () => {
    const s = run([sc({ cannon: true, potRed: true, potWhite: true, inOffRed: true })]);
    assert.equal(f(s).score.home, 10);
    assert.equal(f(run([sc({ potRed: 1, potWhite: 1 })])).score.home, 5, '1 means yes');
    assert.equal(f(run([sc({ potRed: true, potWhite: false })])).score.home, 3, 'false is no');
  });

  test('impossible or empty strokes are ignored', () => {
    const s0 = B.createInitialState();
    assert.equal(B.reducer(s0, sc({ inOffRed: true, inOffWhite: true })), s0, 'one cue ball, one in-off');
    assert.equal(B.reducer(s0, sc({})), s0);
    assert.equal(B.reducer(s0, sc({ potBlack: true })), s0);
    assert.equal(B.reducer(s0, { type: 'SCORE' }), s0);
    assert.equal(B.reducer(s0, sc({ potRed: 2 })), s0, 'one red ball');
  });

  test('a break goes on until a miss or a safety; the turn passes', () => {
    let s = run([PR, PR, C, MISS]);
    assert.deepEqual(f(s).score, { home: 8, away: 0 });
    assert.equal(f(s).striker, 'away');
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 8, 'miss']]);
    s = step(s, SAFE);
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 8, 'miss'], ['away', 0, 'safety']]);
    assert.equal(f(s).striker, 'home');
  });
});

describe('billiards · fouls (S3 R15–R17)', () => {
  test('two points to the opponent; points earlier in the break count; the turn passes', () => {
    const s = run([PR, IR, FOUL('push')]);
    assert.deepEqual(f(s).score, { home: 6, away: 2 });
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 6, 'foul']]);
    assert.deepEqual(f(s).fouls, [{ by: 'home', value: 2, kind: 'push' }]);
    assert.equal(f(s).striker, 'away');
  });

  test('a miss (no ball hit) is 2 too; the organiser may change the value', () => {
    assert.equal(f(run([FOUL('miss')])).score.away, 2);
    assert.equal(f(run([FOUL()], { foulPoints: 3 })).score.away, 3);
    assert.equal(f(run([FOUL('nonsense')])).fouls[0].kind, undefined, 'unknown kind dropped');
  });

  test('a FOUL naming the non-striker is ignored', () => {
    const s0 = B.createInitialState();
    assert.equal(B.reducer(s0, { type: 'FOUL', side: 'away' }), s0);
  });
});

describe('billiards · N-up games (S3 R5(d))', () => {
  test('first to reach the target wins; recorded at the target, the break keeps every point', () => {
    const s = run([PR, PR, PR, C], { target: 10, bestOf: 3 });
    assert.equal(s.frames.length, 1);
    assert.deepEqual(s.frames[0].score, [10, 0]);
    assert.deepEqual(s.frames[0].raw, [11, 0]);
    assert.equal(s.frames[0].winner, 'home');
    assert.equal(s.frames[0].how, 'target');
    assert.deepEqual(s.frames[0].visits!.map((v) => [v.side, v.pts, v.end]), [['home', 11, 'frame']]);
    assert.equal(B.billiardsStats(s).home.highestBreak, 11);
    assert.equal(B.billiardsStats(s).home.points, 10, 'only the points required count');
    assert.equal(f(s).n, 2);
    assert.equal(f(s).breaker, 'away');
  });

  test('foul points can take the opponent to the target', () => {
    const s = run([PR, PR, PR, MISS, FOUL()], { target: 10, bestOf: 3 });
    assert.deepEqual(s.frames[0].score, [10, 0]);
    assert.equal(s.frames[0].winner, 'home');
  });

  test('best of 3: two frames win the match; nothing more is accepted', () => {
    const s = run([PR, PR, PR, C, ...times(4, PR), ...times(4, PR)], { target: 10, bestOf: 3 });
    // frame 2 broken by away: 4 pot reds (12) → away; frame 3 broken by home → home
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'home');
    assert.deepEqual(s.framesWon, { home: 2, away: 1 });
    assert.deepEqual(B.result(s), { winner: 'home', home: 2, away: 1 });
    assert.equal(B.isComplete(s), true);
    assert.equal(B.scoreLine(s), '10-0, 0-10, 10-0');
    for (const a of [PR, MISS, FOUL(), { type: 'TIME' }, { type: 'CONCEDE', side: 'home' } as A]) assert.equal(B.reducer(s, a), s);
  });

  test('a single game reports its points to the standings', () => {
    const s = run([PR, MISS, ...times(4, PR)], { target: 10, bestOf: 1 });
    assert.deepEqual(B.result(s), { winner: 'away', home: 3, away: 10 });
  });
});

describe('billiards · consecutive hazards and cannons (S3 R10–R11, R15(k)–(l))', () => {
  test('the 16th consecutive hazard is a foul: no points, 2 to the opponent', () => {
    let s = run(times(15, PR), LONG);
    assert.deepEqual(B.limits(s), { hazards: 15, cannons: 0, tenHazards: true, seventyCannons: false });
    s = step(s, PR);
    assert.deepEqual(f(s).score, { home: 45, away: 2 });
    assert.deepEqual(f(s).visits.map((v) => [v.side, v.pts, v.end]), [['home', 45, 'foul']]);
    assert.deepEqual(f(s).fouls, [{ by: 'home', value: 2, kind: 'hazards' }]);
    assert.equal(f(s).striker, 'away');
  });

  test('a cannon, or a stroke of hazard and cannon together, starts the count again', () => {
    assert.equal(f(run([...times(15, PR), C, ...times(15, PR)], LONG)).score.home, 92);
    assert.equal(f(run([...times(15, PR), PRC, ...times(15, PR)], LONG)).score.home, 95);
    assert.deepEqual(B.limits(run([...times(15, PR), PRC], LONG)), { hazards: 0, cannons: 0, tenHazards: false, seventyCannons: false });
  });

  test('the 76th consecutive cannon is a foul', () => {
    let s = run(times(75, C), LONG);
    assert.equal(B.limits(s).seventyCannons, true);
    assert.equal(f(s).score.home, 150);
    s = step(s, C);
    assert.deepEqual(f(s).score, { home: 150, away: 2 });
    assert.equal(f(s).fouls[0].kind, 'cannons');
  });

  test('the counts belong to a break; 0 switches a limit off', () => {
    assert.equal(f(run([...times(10, PR), MISS, ...times(15, PR)], LONG)).score.away, 45);
    assert.equal(f(run(times(20, PR), { ...LONG, hazardLimit: 0 })).score.home, 60);
    assert.equal(B.limits(run(times(10, PR), LONG)).tenHazards, true);
    assert.equal(B.limits(run(times(9, PR), LONG)).tenHazards, false);
  });
});

describe('billiards · timed games (S3 R5(a)–(c))', () => {
  const T = { format: 'timed' };
  test('no target: TIME ends the game; the higher score wins', () => {
    let s = run(times(40, PRC), T);
    assert.equal(f(s).score.home, 200, 'past 150, still going');
    s = step(s, MISS, { type: 'TIME' });
    assert.equal(s.ended, true);
    assert.equal(s.frames[0].how, 'time');
    assert.deepEqual(B.result(s), { winner: 'home', home: 200, away: 0 });
    assert.equal(B.reducer(s, { type: 'TIME' }), s);
  });

  test('TIME during a break closes it as a break', () => {
    const s = run([PR, PR, { type: 'TIME' }], T);
    assert.deepEqual(s.frames[0].visits!.map((v) => [v.side, v.pts, v.end]), [['home', 6, 'frame']]);
  });

  test('level at TIME, sudden death (default): the next score or foul decides', () => {
    let s = run([{ type: 'TIME' }], T);
    assert.equal(s.ended, false);
    assert.equal(f(s).sudden, true);
    s = step(s, MISS, PW);
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'away');
    assert.equal(s.frames[0].how, 'sudden');
    const g = run([{ type: 'TIME' }, FOUL()], T);
    assert.equal(g.winner, 'away', 'the foul gives the opponent the game');
  });

  test('level at TIME with timedTie "draw": a drawn game', () => {
    const s = run([PR, MISS, PR, { type: 'TIME' }], { ...T, timedTie: 'draw' });
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'draw');
    assert.deepEqual(B.result(s), { winner: 'draw', home: 3, away: 3 });
    assert.equal(B.winner(s), 'draw');
  });

  test('TIME means nothing in an N-up game', () => {
    const s0 = B.createInitialState();
    assert.equal(B.reducer(s0, { type: 'TIME' }), s0);
  });
});

describe('billiards · concession, award, quick mode', () => {
  test('CONCEDE and AWARD_FRAME', () => {
    const s = run([PR, MISS, { type: 'CONCEDE', payload: { side: 'away' } }], { bestOf: 3 });
    assert.equal(s.frames[0].winner, 'home');
    assert.equal(s.frames[0].how, 'concede');
    assert.deepEqual(s.frames[0].score, [3, 0]);
    const t = run([{ type: 'AWARD_FRAME', payload: { side: 'away', reason: 'conduct' } }]);
    assert.equal(t.frames[0].winner, 'away');
    const s0 = B.createInitialState();
    assert.equal(B.reducer(s0, { type: 'CONCEDE' }), s0);
  });

  test('FRAME_SCORE: the winner reaches the target and is recorded at it', () => {
    const FS = (home: unknown, away: unknown): A => ({ type: 'FRAME_SCORE', payload: { home, away } });
    const s = run([FS(150, 87), FS(160, 20)]);
    assert.deepEqual(s.frames.map((x) => x.score), [[150, 87], [150, 20]]);
    assert.equal(s.frames[0].quick, true);
    const s0 = B.createInitialState();
    for (const [h, a] of [[149, 87], [150, 150], [150, 151], [-1, 150], ['150', 3], [150, 2.5], [1e6, 0]]) {
      assert.equal(ui(s0, FS(h, a)), s0, `${h}-${a}`);
    }
    assert.equal(ui(run([PR]), FS(150, 0)).frames.length, 0, 'not once a stroke is played');
    const timed = run([FS(310, 250)], { format: 'timed' });
    assert.equal(timed.winner, 'home');
    assert.equal(ui(B.createInitialState({ format: 'timed' }), FS(300, 300)).ended, false, 'level: sudden death has no quick result');
    assert.equal(run([FS(300, 300)], { format: 'timed', timedTie: 'draw' }).winner, 'draw');
  });
});

describe('billiards · score line, summary, statistics', () => {
  test('score line, line score, summary', () => {
    const s = run([{ type: 'FRAME_SCORE', payload: { home: 150, away: 87 } }, { type: 'FRAME_SCORE', payload: { home: 120, away: 150 } }, PR], { bestOf: 3 });
    assert.equal(B.scoreLine(s), '150-87, 120-150');
    assert.equal(B.scoreLine(s, 'away'), '87-150, 150-120');
    const ls = B.lineScore(s)!;
    assert.deepEqual(ls.won, { home: 1, away: 1 });
    assert.deepEqual(ls.current, { home: 3, away: 0 });
    const sum = B.summary(s);
    assert.equal(sum.homeScore, '3');
    assert.match(sum.statusLine, /Frame 3/);
    assert.match(sum.detailLine!, /150-up/);
    const done = step(s, MISS, { type: 'CONCEDE', side: 'home' });
    assert.equal(B.summary(done).statusLine, 'Match Over');
    assert.equal(B.summary(done).detailLine, '150-87, 120-150, 3-0');
    assert.deepEqual(B.standingsUnits(done), { points: { home: 273, away: 237 } });
  });

  test('breaks, hundreds, average per visit, strokes by kind', () => {
    const s = run([
      ...times(5, PR), MISS, // home 15
      C, C, IR, SAFE, // away 7
      FOUL('miss'), // home fouls → away +2
      PRC, PW, MISS, // away 7
      ...times(21, PRC), MISS, // home 105
    ], LONG);
    const { home, away } = B.billiardsStats(s);
    assert.deepEqual(home.breaks, [15, 105]);
    assert.equal(home.visits, 3);
    assert.equal(home.scored, 120);
    assert.equal(home.average, 40);
    assert.equal(home.highestBreak, 105);
    assert.equal(home.centuries, 1);
    assert.equal(home.fiftyPlus, 1);
    assert.equal(home.potRed, 26);
    assert.equal(home.cannons, 21);
    assert.equal(home.fouls, 1);
    assert.equal(home.penaltyConceded, 2);
    assert.equal(home.misses, 2);
    assert.equal(away.points, 16);
    assert.equal(away.scored, 14);
    assert.equal(away.penaltyReceived, 2);
    assert.equal(away.visits, 2);
    assert.equal(away.average, 7);
    assert.equal(away.cannons, 3);
    assert.equal(away.inOffRed, 1);
    assert.equal(away.potRed, 1);
    assert.equal(away.potWhite, 1);
    assert.equal(away.safeties, 1);
    assert.deepEqual(B.breaks(s, 100), [{ side: 'home', frame: 1, pts: 105 }]);
    assert.equal(B.billiardsStats(run(times(41, PRC), LONG)).home.doubleCenturies, 1);
  });
});

describe('billiards · malformed input and replay', () => {
  test('unknown, empty or broken actions are ignored', () => {
    const s0 = B.createInitialState();
    for (const a of [{ type: 'NOPE' }, {}, null, undefined, 7, { type: 'SCORE', payload: 'potRed' }, { type: 'SCORE', payload: [1] }]) {
      assert.equal(B.reducer(s0, a as never), s0, JSON.stringify(a));
    }
    assert.equal(B.reducer(s0, { type: 'SCORE', side: 'away', payload: { potRed: true } }), s0, 'not the striker');
  });

  test('replay is deterministic; replaying without the last event is undo; nothing is mutated', () => {
    const acts = [PR, C, MISS, FOUL(), PRC, SAFE, { type: 'CONCEDE', side: 'away' } as A, IR];
    assert.deepEqual(run(acts), run(acts));
    for (let i = 0; i < acts.length; i++) {
      const prefix = run(acts.slice(0, i));
      const snap = JSON.stringify(prefix);
      assert.deepEqual(ui(prefix, acts[i]), run(acts.slice(0, i + 1)));
      assert.equal(JSON.stringify(prefix), snap);
    }
  });
});

// ---------------------------------------------------------------------------
// Break list (docs/security/breaks/snooker-billiards-engine.md): each point's
// test was written first and failed before its fix.
describe('billiards · break list', () => {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

  test('B-01 a crafted stored state cannot pollute Object.prototype through the stats', () => {
    const s = clone(run([PR, MISS, { type: 'CONCEDE', side: 'away' }])) as B.BilliardsState;
    const fr = s.frames[0] as unknown as { visits: unknown[]; fouls: unknown[] };
    fr.visits.push(JSON.parse('{"side":"__proto__","pts":5,"shots":1,"potRed":1,"potWhite":0,"inOffRed":0,"inOffWhite":0,"cannon":0,"end":"miss"}'));
    fr.fouls.push(JSON.parse('{"by":"__proto__","value":2}'), { by: 'home', value: 2, kind: 'constructor' });
    const st = B.billiardsStats(s);
    const probe = {} as Record<string, unknown>;
    assert.equal(probe.visits, undefined);
    assert.equal(probe.scored, undefined);
    assert.equal(probe.potRed, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(st.home.foulsByKind, 'constructor'), false);
    assert.equal(st.home.visits, 1);
    assert.equal(st.home.fouls, 1);
    assert.deepEqual(B.breaks(s), [{ side: 'home', frame: 1, pts: 3 }]);
  });

  test('B-02 a frame-ending action carries its frame number; a repeat cannot end the next frame', () => {
    const s0 = B.createInitialState({ bestOf: 3 });
    const award = { type: 'AWARD_FRAME', payload: { side: 'home', frame: 1 } };
    const s = B.reducer(s0, award);
    assert.equal(s.frames.length, 1);
    assert.equal(B.reducer(s, award), s, 'the same tap again: frame 2 is in play');
    const fs = { type: 'FRAME_SCORE', payload: { home: 150, away: 30, frame: 1 } };
    const t = B.reducer(s0, fs);
    assert.equal(B.reducer(t, fs), t);
    const c = B.reducer(s0, { type: 'CONCEDE', payload: { side: 'away', frame: 1 } });
    assert.equal(B.reducer(c, { type: 'CONCEDE', payload: { side: 'away', frame: 1 } }), c);
    for (const a of [{ type: 'CONCEDE', side: 'away' }, { type: 'AWARD_FRAME', payload: { side: 'home' } }, { type: 'FRAME_SCORE', payload: { home: 150, away: 30 } }]) {
      assert.equal(B.reducer(s0, a as A), s0, a.type);
    }
    assert.equal(B.reducer(s0, sc({ potRed: true, frame: 2 })), s0);
    assert.notEqual(B.reducer(s0, sc({ potRed: true, frame: 1 })), s0);
  });

  test('B-04 a frame holds at most MAX_FRAME_RECORDS visits and fouls: 40,000 junk events replay fast', () => {
    const t0 = performance.now();
    const s = run(Array.from({ length: 40000 }, (_, i) => (i % 2 ? MISS : FOUL())), { format: 'timed' });
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `replayed in ${Math.round(ms)} ms`);
    assert.equal(f(s).visits.length + f(s).fouls.length, B.MAX_FRAME_RECORDS);
    assert.equal(B.reducer(s, MISS), s);
    assert.equal(B.reducer(s, FOUL()), s);
    const scored = B.reducer(s, PR);
    assert.notEqual(scored, s, 'scoring strokes still count');
    assert.equal(step(scored, { type: 'TIME' }).ended, true, 'and the game can still end');
  });

  test('B-05 / B-13 / B-14 truncated, foreign or hostile states and objects never throw and are never advanced', () => {
    const live = run([PR, C, MISS]);
    const done = run([{ type: 'CONCEDE', side: 'away' }], { bestOf: 1 });
    const hostile = new Proxy({}, { get() { throw new Error('boom'); }, has() { throw new Error('boom'); }, ownKeys() { throw new Error('boom'); } });
    const snooker = { sport: 'snooker', reds: 15, bestOf: 5, framesToWin: 3, firstBreak: 'home', frames: [], framesWon: { home: 0, away: 0 }, frame: { n: 1, breaker: 'home', striker: 'home', score: { home: 0, away: 0 }, redsLeft: 15, on: 'red', visit: { side: 'home', pts: 0, pots: 0, shots: 0 }, visits: [], fouls: [], shots: 0 }, ended: false, winner: null, seq: 0 };
    const bad: unknown[] = [
      undefined, null, {}, [], 42, 'x', hostile, snooker,
      { frames: [] }, { frames: [{}] }, { frames: [null] }, { frames: [{ score: null }] },
      { ...live, frame: {} }, { ...live, frame: { ...live.frame, score: null } }, { ...live, frame: { ...live.frame, visits: null } },
      { ...live, frame: { ...live.frame, striker: '__proto__' } }, { ...live, frames: null }, { ...live, framesWon: null },
      { ...done, framesWon: undefined }, { ...done, frames: [{ ...done.frames[0], score: 'x' }] }, { ...done, frames: [] },
    ];
    const acts: A[] = [PR, C, MISS, SAFE, FOUL(), { type: 'TIME' }, { type: 'BREAK_OFF', side: 'away' },
      { type: 'CONCEDE', payload: { side: 'away', frame: 1 } }, { type: 'AWARD_FRAME', payload: { side: 'home', frame: 1 } }, { type: 'FRAME_SCORE', payload: { home: 150, away: 3, frame: 1 } }];
    for (const st of bad) {
      const s = st as B.BilliardsState;
      const label = (() => { try { return String(JSON.stringify(st)).slice(0, 60); } catch { return 'a hostile Proxy'; } })();
      for (const a of acts) assert.equal(B.reducer(s, a), s, `${a.type} on ${label}`);
      for (const fn of [B.summary, B.scoreLine, B.lineScore, B.standingsUnits, B.result, B.winner, B.isComplete, B.limits, B.billiardsStats, B.breaks]) {
        assert.doesNotThrow(() => (fn as (x: unknown) => unknown)(s), `${fn.name} on ${label}`);
      }
    }
    assert.equal(B.reducer(live, hostile as never), live);
    assert.equal(B.reducer(live, { type: 'SCORE', get payload(): Record<string, unknown> { throw new Error('boom'); } }), live);
    assert.equal(B.reducer(live, { type: 'SCORE', payload: hostile as Record<string, unknown> }), live);
    assert.equal(B.createInitialState({ get target(): number { throw new Error('boom'); } }).target, 150);
    assert.equal(B.createInitialState(hostile as Record<string, unknown>).target, 150);
    assert.doesNotThrow(() => B.breaks(live, { valueOf() { throw new Error('boom'); } } as unknown as number));
    assert.equal(B.strokeValue(hostile as Record<string, unknown>), 0);
  });

  test('B-11 -0 is stored as 0 (a JSON round trip stays deep-equal)', () => {
    const s = run([{ type: 'FRAME_SCORE', payload: { home: -0, away: 150 } }]);
    assert.ok(Object.is(s.frames[0].score[0], 0));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
    const d = run([{ type: 'FRAME_SCORE', payload: { home: -0, away: 0 } }], { format: 'timed', timedTie: 'draw' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), d);
  });

  test('B-15 an action that changes nothing returns the same state', () => {
    const s0 = B.createInitialState();
    // the first tap records the toss (usability follow-up 2026-10-28); a repeat changes nothing
    const tossed = B.reducer(s0, { type: 'BREAK_OFF', side: 'home' });
    assert.equal(tossed.seq, 1);
    assert.equal(B.reducer(tossed, { type: 'BREAK_OFF', side: 'home' }), tossed);
  });

  test('B-16 a payload side that disagrees with the action side (or is junk) refuses the action', () => {
    const s0 = B.createInitialState();
    assert.equal(B.reducer(s0, { type: 'CONCEDE', side: 'home', payload: { side: 'away', frame: 1 } }), s0);
    assert.equal(B.reducer(s0, { type: 'AWARD_FRAME', side: 'home', payload: { side: 'Asha Rao', frame: 1 } }), s0);
    assert.equal(B.reducer(s0, { type: 'CONCEDE', payload: { side: 'away', frame: 1 } }).frames[0].conceded, 'away');
  });

  test('B-18 a frame ended with nothing recorded is neither a shot-by-shot nor a quick frame', () => {
    const s = run([{ type: 'AWARD_FRAME', payload: { side: 'home' } }, PR, MISS]);
    const st = B.billiardsStats(s);
    assert.equal(st.home.detailedFrames, 1, 'only frame 2 had strokes');
    assert.equal(st.home.quickFrames, 0);
  });

  test('B-07 a single game decided off the table reports frames won, never the loser ahead on points', () => {
    const c = run([PR, PR, MISS, { type: 'CONCEDE', side: 'home' }], { bestOf: 1 });
    assert.deepEqual(B.result(c), { winner: 'away', home: 0, away: 1 });
    assert.equal(B.summary(c).homeScore, '0');
    assert.equal(B.summary(c).awayScore, '1');
    assert.equal(B.summary(c).detailLine, '6-0', 'the points as they stood');
    const aw = run([{ type: 'AWARD_FRAME', payload: { side: 'home' } }], { bestOf: 1 });
    assert.deepEqual(B.result(aw), { winner: 'home', home: 1, away: 0 });
    // a game played out still reports its points
    assert.deepEqual(B.result(run([PR, MISS, ...times(4, PR)], { target: 10, bestOf: 1 })), { winner: 'away', home: 3, away: 10 });
  });
});
