/**
 * Seeded simulation of the snooker and English billiards engines (quality
 * mandate step 6: docs/security/breaks/snooker-billiards-engine.md).
 *
 * 500 matches per game type (15/10-red snooker, six-red snooker, billiards
 * N-up, billiards timed): a realistic scorer stream built from the live state
 * (what the controls would offer, with a per-match skill), with ~10%
 * adversarial input mixed in — stale and doubled taps, wrong sides and frame
 * numbers, junk numbers (NaN, ±Infinity, -0, huge, strings), "__proto__"
 * keys, a child's name smuggled into every field, unknown types.
 *
 * Invariants after every action: the engine never throws; a refused action
 * returns the same object, an accepted one adds exactly 1 to `seq`; scores
 * are non-negative integers; frames won match the records; the match ends
 * exactly when a side reaches the frames needed (or a timed draw). At every
 * frame end and every 40 actions: each frame's total = its breaks + the
 * penalty points received; a break never passes the maximum (147 / 107 / 75,
 * +8 with a free ball); billiards strokes score ≤ 10 and a live N-up frame
 * stays under the target; the state survives a JSON round trip; no name and
 * no prototype pollution. Per match: a full replay equals the state, and undo
 * (replaying a prefix) then redo returns the same states.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';

type Side = 'home' | 'away';
type Act = { type: string; side?: unknown; payload?: unknown; attribution?: unknown };
const NAME = 'Asha Rao';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** mulberry32 — a small seeded PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  };
}
type R = ReturnType<typeof prng>;

/** Junk values for any field. */
const JUNK: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, -1, 1e9, 0.5, '7', '', true, null, [], {}, NAME, '__proto__', 'constructor', 'toString'];
const junk = (r: R) => r.pick(JUNK);

/** Adversarial actions common to both engines. */
function adversarial(r: R, log: Act[], frameN: number, types: string[]): Act {
  switch (r.int(0, 9)) {
    case 0: return log.length ? log[log.length - 1] : { type: 'NOPE' }; // the double tap
    case 1: return log.length ? log[r.int(0, log.length - 1)] : { type: 'NOPE' }; // a stale, replayed tap
    case 2: return { type: r.pick(types), side: junk(r), payload: { side: junk(r), frame: junk(r) } };
    case 3: return { type: r.pick(types), payload: { frame: r.pick([frameN - 1, frameN + 1, String(frameN)]) } };
    case 4: return JSON.parse(`{"type":"${r.pick(types)}","payload":{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"frame":${frameN}}}`);
    case 5: return { type: r.pick(types), side: r.pick(['home', 'away']), payload: { name: NAME, playerName: NAME, note: NAME, kind: NAME, reason: NAME, ball: NAME, frame: frameN }, attribution: { playerId: 'p1', playerName: NAME, stat: 'x' } };
    case 6: return r.pick([null, undefined, 42, 'POT', [], { type: 7 }, { type: '' }, { type: 'UNDO' }, { type: 'STAT_ADJUST' }]) as Act;
    case 7: return { type: r.pick(types), payload: junk(r) };
    default: return { type: r.pick(types), payload: Object.fromEntries(['value', 'reds', 'home', 'away', 'ball', 'miss', 'freeBall', 'potRed', 'cannon', 'inOffRed', 'inOffWhite'].map((k) => [k, junk(r)])) };
  }
}

const SN_TYPES = ['POT', 'MISS', 'SAFETY', 'FOUL', 'FREE_BALL', 'PLAY_AGAIN', 'REPLACE', 'RESPOT_TURN', 'BREAK_OFF', 'CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE', 'RERACK'];
const BI_TYPES = ['SCORE', 'MISS', 'SAFETY', 'FOUL', 'TIME', 'BREAK_OFF', 'CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE'];

// ------------------------------------------------------------- snooker --

/** What a scorer's controls would send next, from the live state. */
function snookerScorer(r: R, s: S.SnookerState, skill: number, quick: boolean, frameActs: number): Act {
  const fr = s.frame!;
  const n = fr.n;
  const side = r.chance(0.7) ? { side: fr.striker } : {};
  const stamp = (p: Record<string, unknown> = {}) => ({ ...p, frame: n });
  const noStroke = fr.shots === 0 && fr.fouls.length === 0;
  if (noStroke && quick && r.chance(0.6)) {
    const h = r.int(0, 140);
    let a = r.int(0, 140);
    if (a === h) a = h + 1;
    return { type: 'FRAME_SCORE', payload: stamp({ home: h, away: a }) };
  }
  if (noStroke && r.chance(0.05)) return { type: 'BREAK_OFF', side: r.pick(['home', 'away']) };
  if (fr.respot && (fr.respotShots ?? 0) === 0 && r.chance(0.3)) return { type: 'RESPOT_TURN', payload: { side: r.pick(['home', 'away']) } };
  const ms = S.missStatus(s);
  if (ms?.awardable && r.chance(0.5)) return { type: 'AWARD_FRAME', payload: stamp({ side: other(ms.by), reason: 'miss' }) };
  if (fr.pending) {
    if (fr.pending.miss && r.chance(0.5)) return { type: 'REPLACE' };
    if (r.chance(0.08)) return { type: 'PLAY_AGAIN' };
    if (!fr.freeBall && r.chance(0.05)) return { type: 'FREE_BALL' };
  }
  const trailing: Side = fr.score.home < fr.score.away ? 'home' : 'away';
  if ((S.snookersRequired(s, trailing) > 0 && r.chance(0.15)) || frameActs > 600) return { type: 'CONCEDE', payload: stamp({ side: trailing }) };
  if (r.chance(0.002)) return { type: 'RERACK', payload: stamp() };
  if (r.chance(0.01)) return { type: 'FOUL', side: other(fr.striker), payload: { value: r.int(4, 7), penalty: true } };
  const on = S.ballOn(s)!;
  if (r.chance(skill)) {
    if (on.allowed.includes('free') && r.chance(0.3)) return { type: 'POT', ...side, payload: { ball: 'free' } };
    const ball = on.allowed.length > 1 && on.allowed[0] !== 'red' ? r.pick(['black', 'black', 'pink', 'blue', ...on.allowed]) : on.allowed[0];
    if (ball === 'red') {
      const reds = r.chance(0.04) && on.redsLeft >= 2 ? 2 : 1;
      return { type: 'POT', ...side, payload: { ball, reds, ...(on.freeBall && r.chance(0.2) ? { free: true } : {}) } };
    }
    return { type: 'POT', ...side, payload: { ball } };
  }
  const roll = r.next();
  if (roll < 0.5) return { type: 'MISS', ...side };
  if (roll < 0.83) return { type: 'SAFETY', ...side };
  return {
    type: 'FOUL', ...side,
    payload: {
      value: r.int(4, 7), kind: r.pick([...S.FOUL_KINDS, undefined]),
      ...(r.chance(0.25) ? { miss: true } : {}), ...(r.chance(0.15) ? { freeBall: true } : {}),
      ...(fr.redsLeft > 0 && r.chance(0.08) ? { reds: r.int(1, Math.min(2, fr.redsLeft)) } : {}),
    },
  };
}

function checkSnookerFrame(fr: { score: [number, number]; visits?: S.VisitRecord[]; fouls?: S.FoulRecord[]; quick?: true; winner?: Side; how?: string; conceded?: Side }, reds: number, live: S.Visit | null, tag: string) {
  if (fr.quick) return;
  const visits: S.Visit[] = [...(fr.visits ?? []), ...(live && live.shots > 0 ? [live] : [])];
  for (const side of ['home', 'away'] as const) {
    const breaks = visits.filter((v) => v.side === side).reduce((t, v) => t + v.pts, 0) + (live && live.shots === 0 && live.side === side ? live.pts : 0);
    const received = (fr.fouls ?? []).filter((x) => x.by !== side).reduce((t, x) => t + x.value, 0);
    assert.equal(fr.score[side === 'home' ? 0 : 1], breaks + received, `${tag}: ${side} frame total = breaks + penalties`);
  }
  for (const v of visits) {
    assert.ok(Number.isInteger(v.pts) && v.pts >= 0, `${tag}: break is a whole number`);
    assert.ok(v.pts <= S.maxBreak(reds) + (v.fb ? 8 : 0), `${tag}: break ${v.pts} over the maximum (fb ${!!v.fb})`);
  }
  if (fr.winner && fr.how !== 'concede' && fr.how !== 'award') assert.ok(fr.score[fr.winner === 'home' ? 0 : 1] > fr.score[fr.winner === 'home' ? 1 : 0], `${tag}: the winner has more`);
  if (fr.how === 'concede') assert.equal(fr.winner, other(fr.conceded!));
}

function checkSnooker(s: S.SnookerState, tag: string, deep: boolean) {
  assert.ok(S.isSnookerState(s), `${tag}: shape`);
  const won = { home: 0, away: 0 };
  for (const fr of s.frames) won[fr.winner]++;
  assert.deepEqual(s.framesWon, won, `${tag}: frames won match the records`);
  assert.ok(s.frames.length <= s.bestOf, `${tag}: no more frames than best of`);
  const decided = won.home >= s.framesToWin || won.away >= s.framesToWin;
  assert.equal(s.ended, decided, `${tag}: ended iff a side reached ${s.framesToWin}`);
  assert.equal(s.ended, s.frame === null);
  if (s.ended) assert.equal(s.winner, won.home > won.away ? 'home' : 'away');
  const fr = s.frame;
  if (fr) {
    for (const v of [fr.score.home, fr.score.away]) assert.ok(Number.isInteger(v) && v >= 0, `${tag}: score ${v}`);
    assert.ok(fr.redsLeft >= 0 && fr.redsLeft <= s.reds);
    assert.ok(fr.visits.length + fr.fouls.length <= S.MAX_FRAME_RECORDS);
    if (fr.on === 'red') assert.ok(fr.redsLeft > 0, `${tag}: a red on with none left`);
    if (fr.freeBall) assert.notEqual(fr.on, 'black');
  }
  if (!deep) return;
  s.frames.forEach((x, i) => checkSnookerFrame(x, s.reds, null, `${tag} frame ${i + 1}`));
  if (fr) checkSnookerFrame({ score: [fr.score.home, fr.score.away], visits: fr.visits, fouls: fr.fouls }, s.reds, fr.visit, `${tag} live frame`);
  const json = JSON.stringify(s);
  assert.ok(!json.includes(NAME), `${tag}: a name in the state`);
  assert.deepStrictEqual(JSON.parse(json), s, `${tag}: JSON round trip`);
}

// ------------------------------------------------------------ billiards --

const STROKES: Array<Record<string, true>> = [
  { potRed: true }, { potRed: true }, { inOffRed: true }, { inOffRed: true }, { cannon: true }, { cannon: true }, { potWhite: true }, { inOffWhite: true },
  { potRed: true, cannon: true }, { inOffRed: true, cannon: true }, { potRed: true, inOffRed: true }, { cannon: true, potRed: true, potWhite: true, inOffRed: true },
];

function billiardsScorer(r: R, s: B.BilliardsState, skill: number, quick: boolean, frameActs: number, timeAt: number): Act {
  const fr = s.frame!;
  const n = fr.n;
  const side = r.chance(0.7) ? { side: fr.striker } : {};
  const stamp = (p: Record<string, unknown> = {}) => ({ ...p, frame: n });
  if (fr.shots === 0 && quick && r.chance(0.6)) {
    if (s.format === 'timed') return { type: 'FRAME_SCORE', payload: stamp({ home: r.int(0, 400), away: r.int(0, 400) }) };
    const lo = r.int(0, s.target - 1);
    return { type: 'FRAME_SCORE', payload: stamp(r.chance(0.5) ? { home: s.target, away: lo } : { home: lo, away: s.target + r.int(0, 5) }) };
  }
  if (fr.shots === 0 && r.chance(0.05)) return { type: 'BREAK_OFF', side: r.pick(['home', 'away']) };
  if (s.format === 'timed' && frameActs >= timeAt && !fr.sudden) return { type: 'TIME' };
  if (frameActs > 900 || r.chance(0.001)) return { type: 'CONCEDE', payload: stamp({ side: r.pick(['home', 'away']) }) };
  if (r.chance(skill)) return { type: 'SCORE', ...side, payload: r.pick(STROKES) };
  const roll = r.next();
  if (roll < 0.45) return { type: 'MISS', ...side };
  if (roll < 0.8) return { type: 'SAFETY', ...side };
  return { type: 'FOUL', ...side, payload: { kind: r.pick([...B.FOUL_KINDS, undefined]) } };
}

function checkBilliardsFrame(fr: B.FrameRecord | { score: [number, number]; visits: B.Visit[]; fouls: B.FoulRecord[] }, tag: string) {
  if ('quick' in fr && fr.quick) return;
  const raw = ('raw' in fr && fr.raw) || fr.score;
  const visits = fr.visits ?? [];
  for (const side of ['home', 'away'] as const) {
    const breaks = visits.filter((v) => v.side === side).reduce((t, v) => t + v.pts, 0);
    const received = (fr.fouls ?? []).filter((x) => x.by !== side).reduce((t, x) => t + x.value, 0);
    assert.equal(raw[side === 'home' ? 0 : 1], breaks + received, `${tag}: ${side} raw total = breaks + penalties`);
  }
  for (const v of visits) {
    assert.equal(v.pts, 3 * v.potRed + 2 * v.potWhite + 3 * v.inOffRed + 2 * v.inOffWhite + 2 * v.cannon, `${tag}: a break is its strokes`);
    assert.ok(v.pts <= 10 * v.shots, `${tag}: at most 10 a stroke`);
  }
}

function checkBilliards(s: B.BilliardsState, tag: string, deep: boolean) {
  assert.ok(B.isBilliardsState(s), `${tag}: shape`);
  const won = { home: 0, away: 0 };
  let draws = 0;
  for (const fr of s.frames) { if (fr.winner === 'draw') draws++; else won[fr.winner]++; }
  assert.deepEqual(s.framesWon, won, `${tag}: frames won match the records`);
  assert.ok(s.frames.length <= s.bestOf);
  const decided = won.home >= s.framesToWin || won.away >= s.framesToWin || draws > 0;
  assert.equal(s.ended, decided, `${tag}: ended iff decided`);
  assert.equal(s.ended, s.frame === null);
  if (draws) assert.equal(s.winner, 'draw');
  for (const fr of s.frames) {
    if (fr.how === 'target') {
      const w = fr.winner === 'home' ? 0 : 1;
      assert.equal(fr.score[w], s.target, `${tag}: an N-up frame is recorded at the target`);
      assert.ok(fr.score[1 - w] < s.target);
    }
  }
  const fr = s.frame;
  if (fr) {
    for (const v of [fr.score.home, fr.score.away]) assert.ok(Number.isInteger(v) && v >= 0, `${tag}: score ${v}`);
    if (s.format === 'points') assert.ok(fr.score.home < s.target && fr.score.away < s.target, `${tag}: a live frame under the target`);
    if (s.hazardLimit > 0) assert.ok(fr.hazardRun <= s.hazardLimit);
    if (s.cannonLimit > 0) assert.ok(fr.cannonRun <= s.cannonLimit);
    assert.ok(fr.visits.length + fr.fouls.length <= B.MAX_FRAME_RECORDS);
  }
  if (!deep) return;
  s.frames.forEach((x, i) => checkBilliardsFrame(x, `${tag} frame ${i + 1}`));
  if (fr) checkBilliardsFrame({ score: [fr.score.home, fr.score.away], visits: [...fr.visits, fr.visit], fouls: fr.fouls }, `${tag} live frame`);
  const json = JSON.stringify(s);
  assert.ok(!json.includes(NAME), `${tag}: a name in the state`);
  assert.deepStrictEqual(JSON.parse(json), s, `${tag}: JSON round trip`);
}

// -------------------------------------------------------------- driver --

interface Engine<St> {
  init: (c: Record<string, unknown>) => St;
  reducer: (s: St, a: never) => St;
  check: (s: St, tag: string, deep: boolean) => void;
  frameOf: (s: St) => { n: number } | null;
  seq: (s: St) => number;
  framesDone: (s: St) => number;
}

/** One match: realistic + adversarial actions, invariants on the way, then
 *  replay and undo / redo. Returns what happened, for the totals. */
function playMatch<St>(eng: Engine<St>, cfg: Record<string, unknown>, r: R, next: (s: St, frameActs: number) => Act, types: string[], tag: string) {
  let s = eng.init(cfg);
  const log: Act[] = [];
  const states: St[] = [s];
  let frameActs = 0;
  let accepted = 0;
  for (let i = 0; i < 4000 && eng.frameOf(s); i++) {
    const fn = eng.frameOf(s)!.n;
    const a = r.chance(0.1) ? adversarial(r, log, fn, types) : next(s, frameActs);
    let n: St;
    try {
      n = eng.reducer(s, a as never);
    } catch (e) {
      throw new Error(`${tag}: threw on ${JSON.stringify(a)}: ${(e as Error).message}`);
    }
    if (n === s) assert.equal(eng.seq(n), eng.seq(s));
    else { assert.equal(eng.seq(n), eng.seq(s) + 1, `${tag}: an accepted action is one seq`); accepted++; }
    const frameEnded = eng.framesDone(n) > eng.framesDone(s);
    frameActs = frameEnded ? 0 : frameActs + 1;
    log.push(a);
    states.push(n);
    s = n;
    eng.check(s, `${tag} #${i}`, frameEnded || i % 40 === 0);
  }
  eng.check(s, `${tag} end`, true);
  assert.equal(({} as Record<string, unknown>).polluted, undefined, `${tag}: Object.prototype polluted`);
  // replay is deterministic
  const replayed = log.reduce((st, a) => eng.reducer(st, a as never), eng.init(cfg));
  assert.deepStrictEqual(replayed, s, `${tag}: replay`);
  // undo (replay a prefix) then redo (apply the event again)
  for (let k = 0; k < 2 && log.length; k++) {
    const i = r.int(0, log.length - 1);
    const undone = log.slice(0, i).reduce((st, a) => eng.reducer(st, a as never), eng.init(cfg));
    assert.deepStrictEqual(undone, states[i], `${tag}: undo to ${i}`);
    assert.deepStrictEqual(eng.reducer(undone, log[i] as never), states[i + 1], `${tag}: redo ${i}`);
  }
  return { ended: eng.frameOf(s) === null, actions: log.length, accepted, frames: eng.framesDone(s), final: s };
}

const SNOOKER: Engine<S.SnookerState> = {
  init: S.createInitialState, reducer: S.reducer as never, check: checkSnooker,
  frameOf: (s) => s.frame, seq: (s) => s.seq, framesDone: (s) => s.frames.length,
};
const BILLIARDS: Engine<B.BilliardsState> = {
  init: B.createInitialState, reducer: B.reducer as never, check: checkBilliards,
  frameOf: (s) => s.frame, seq: (s) => s.seq, framesDone: (s) => s.frames.length,
};

const MATCHES = 500;

/** The rare paths a run reached (so a green run is known to have exercised them). */
type Tally = Record<string, number>;
const bump = (t: Tally, k: string, n = 1) => { t[k] = (t[k] ?? 0) + n; };

function tallySnooker(t: Tally, s: S.SnookerState) {
  for (const fr of s.frames) {
    bump(t, `how:${fr.how}`);
    if (fr.reason === 'miss') bump(t, 'award after misses');
    if (fr.reracks) bump(t, 're-racks', fr.reracks);
    for (const v of fr.visits ?? []) {
      if (v.fb) bump(t, 'free-ball breaks');
      if (v.end === 'respot') bump(t, 're-spotted blacks');
      if (v.pts >= 100) bump(t, 'centuries');
    }
    for (const x of fr.fouls ?? []) {
      if (x.miss) bump(t, 'foul and a miss');
      if (x.penalty) bump(t, 'non-striker penalties');
      if (x.reds) bump(t, 'reds down in a foul');
    }
  }
}

function tallyBilliards(t: Tally, s: B.BilliardsState) {
  for (const fr of s.frames) {
    bump(t, `how:${fr.how}`);
    for (const x of fr.fouls ?? []) if (x.kind === 'hazards' || x.kind === 'cannons') bump(t, `limit foul:${x.kind}`);
    for (const v of fr.visits ?? []) if (v.pts >= 100) bump(t, 'centuries');
  }
}

function runSnooker(seed: number, sixRed: boolean) {
  const totals = { ended: 0, actions: 0, accepted: 0, frames: 0, tally: {} as Tally };
  for (let m = 0; m < MATCHES; m++) {
    const r = prng(seed + m);
    const reds = sixRed ? 6 : r.pick([15, 15, 15, 10]);
    const cfg = { reds, bestOf: r.pick([1, 1, 3, 3, 5]), firstBreak: r.pick(['home', 'away']) };
    const skill = 0.35 + r.next() * 0.6;
    const quick = r.chance(0.2);
    const out = playMatch(SNOOKER, cfg, r, (s, fa) => snookerScorer(r, s, skill, quick, fa), SN_TYPES, `snooker${reds} m${m}`);
    totals.ended += out.ended ? 1 : 0;
    totals.actions += out.actions;
    totals.accepted += out.accepted;
    totals.frames += out.frames;
    tallySnooker(totals.tally, out.final);
  }
  return totals;
}

function runBilliards(seed: number, timed: boolean) {
  const totals = { ended: 0, actions: 0, accepted: 0, frames: 0, tally: {} as Tally };
  for (let m = 0; m < MATCHES; m++) {
    const r = prng(seed + m);
    const cfg = timed
      ? { format: 'timed', timedTie: r.pick(['sudden', 'draw']), hazardLimit: r.pick([15, 3, 0]), cannonLimit: r.pick([75, 4, 0]) }
      : { target: r.pick([50, 100, 150]), bestOf: r.pick([1, 1, 3, 5]), hazardLimit: r.pick([15, 15, 3, 0]), cannonLimit: r.pick([75, 75, 4, 0]), firstBreak: r.pick(['home', 'away']) };
    const skill = 0.3 + r.next() * 0.55;
    const quick = r.chance(0.2);
    const timeAt = r.int(30, 400);
    const out = playMatch(BILLIARDS, cfg, r, (s, fa) => billiardsScorer(r, s, skill, quick, fa, timeAt), BI_TYPES, `billiards${timed ? '-timed' : ''} m${m}`);
    totals.ended += out.ended ? 1 : 0;
    totals.actions += out.actions;
    totals.accepted += out.accepted;
    totals.frames += out.frames;
    tallyBilliards(totals.tally, out.final);
  }
  return totals;
}

const report = (name: string, t: { ended: number; frames: number; actions: number; accepted: number; tally: Tally }) =>
  console.log(`  ${name}: ${MATCHES} matches, ${t.ended} finished, ${t.frames} frames, ${t.actions} actions (${t.accepted} accepted) · ${Object.entries(t.tally).map(([k, v]) => `${k} ${v}`).join(', ')}`);
const reached = (t: Tally, keys: string[]) => { for (const k of keys) assert.ok((t[k] ?? 0) > 0, `the run never reached: ${k}`); };

describe('simulation · snooker and English billiards (seeded)', () => {
  test(`snooker 15 / 10 reds: ${MATCHES} matches`, () => {
    const t = runSnooker(0x5eed01, false);
    report('snooker 15/10-red', t);
    assert.ok(t.ended >= MATCHES * 0.95, 'nearly every match finishes');
    reached(t.tally, ['how:black', 'how:foul', 'how:respot', 'how:concede', 'how:award', 'how:quick', 'award after misses', 're-racks', 'free-ball breaks', 're-spotted blacks', 'centuries', 'foul and a miss', 'non-striker penalties', 'reds down in a foul']);
  });

  test(`six-red snooker: ${MATCHES} matches`, () => {
    const t = runSnooker(0x5eed02, true);
    report('snooker 6-red', t);
    assert.ok(t.ended >= MATCHES * 0.95);
    reached(t.tally, ['how:black', 'how:respot', 'how:concede', 'how:quick', 'free-ball breaks', 'foul and a miss']);
  });

  test(`billiards N-up: ${MATCHES} matches`, () => {
    const t = runBilliards(0x5eed03, false);
    report('billiards N-up', t);
    assert.ok(t.ended >= MATCHES * 0.95);
    reached(t.tally, ['how:target', 'how:quick', 'how:concede', 'limit foul:hazards', 'limit foul:cannons', 'centuries']);
  });

  test(`billiards timed: ${MATCHES} matches`, () => {
    const t = runBilliards(0x5eed04, true);
    report('billiards timed', t);
    assert.ok(t.ended >= MATCHES * 0.95);
    reached(t.tally, ['how:time', 'how:sudden', 'how:draw', 'how:quick', 'limit foul:hazards']);
  });
});
