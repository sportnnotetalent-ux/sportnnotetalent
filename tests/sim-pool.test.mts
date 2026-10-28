/**
 * Pool engine — seeded simulation (docs/engineering/quality-mandate.md, step 6).
 *
 * Per game (8-ball, 9-ball, 10-ball): 500 matches scored by a realistic
 * scorer (shot by shot, quick, or mixed rack by rack, with ~6% junk taps —
 * duplicates, stale racks, wrong sides, malformed balls, names), plus 200
 * matches of pure adversarial streams. Random formats: race 1–5, 1–3 sets,
 * every break format, the organiser rules on and off.
 *
 * Invariants checked after EVERY event:
 *   - the engine never throws; an ignored action returns the same state
 *     object, an accepted one moves `seq` by exactly 1;
 *   - nothing changes once the match has ended; the winner is decided once;
 *   - racks won never pass the race (a set closes exactly at it), sets won
 *     never pass the sets to win, racks recorded = racks in the score;
 *   - the table holds each ball at most once, inside the game's ball set,
 *     and within one rack a ball once down never comes back (only the 9 /
 *     10, or the 8 on a spot after the break, are spotted);
 *   - an 8-ball group, once assigned, never changes within the rack;
 *   - with the three-foul rule on, nobody stands on three fouls;
 *   - the tally agrees with the rack list.
 * And per match: replaying the log (also through JSON) gives the same state;
 * "undo" (a prefix replay) gives exactly the state the scorer saw, and redo
 * gives it back; no name ever reaches the state; the readers never throw.
 * Keep it under ~10 s.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as pool from '../src/sports/pool/engine.ts';
import { poolStats } from '../src/sports/pool/matchStats.ts';
import { TOP, MONEY, SOLIDS, STRIPES } from '../src/sports/pool/balls.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
type Game = 'eight' | 'nine' | 'ten';
const SIDES: Side[] = ['home', 'away'];
const NAME = 'Asha Rao';

/** mulberry32 — a small seeded PRNG (deterministic across runs). */
class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  f(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) { return Math.floor(this.f() * n); }
  chance(p: number) { return this.f() < p; }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  sample<T>(a: readonly T[], k: number): T[] {
    const c = [...a];
    const out: T[] = [];
    while (out.length < k && c.length) out.push(c.splice(this.int(c.length), 1)[0]);
    return out;
  }
}

// ------------------------------------------------- the realistic scorer --

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

function realistic(rng: Rng, s: pool.PoolState, quick: boolean): ScoreAction {
  const r = s.rack!;
  const n = r.n;
  if (r.pending) {
    const two = r.pending.kind === 'push' || r.pending.kind === 'wrongPot' || r.pending.kind === 'threeBall';
    const choice = rng.chance(0.6) ? 'play' : two ? 'pass' : 'rerack';
    return { type: 'CHOOSE', payload: { choice, rack: n, ...(choice === 'rerack' && rng.chance(0.3) ? { breaker: rng.pick(SIDES) } : {}) } };
  }
  if (r.phase === 'break' && quick) {
    const flags: Record<string, unknown> = {};
    if (rng.chance(0.2)) flags.bnr = true;
    if (rng.chance(0.1)) flags.golden = true;
    if (rng.chance(0.15)) flags.runOut = true;
    if (rng.chance(0.2)) flags.breaker = rng.pick(SIDES);
    return { type: 'RACK', side: rng.pick(SIDES), payload: { rack: n, ...flags } };
  }
  if (r.phase === 'break') {
    if (!s.firstBreaker && n === 1 && rng.chance(0.7)) return { type: 'LAG', side: rng.pick(SIDES), ...(rng.chance(0.3) ? { payload: { breaks: rng.pick(SIDES) } } : {}) };
    const side = r.breaker ?? rng.pick(SIDES);
    const pots = rng.chance(0.35) ? [] : rng.sample(r.table, 1 + rng.int(3));
    const payload: Record<string, unknown> = { pots, rack: n };
    if (rng.chance(0.12)) payload.foul = rng.pick(pool.FOUL_KINDS);
    if (!pots.length && rng.chance(0.15)) payload.illegal = true;
    if (rng.chance(0.08)) payload.short = true;
    if (rng.chance(0.04)) payload.off = rng.sample(r.table.filter((b) => !pots.includes(b)), 1);
    return { type: 'BREAK', side, payload };
  }
  const side = r.shooter!;
  const roll = rng.f();
  const base = { side, payload: { rack: n } as Record<string, unknown> };
  if (roll < 0.015) return { type: 'RACK', side: rng.pick(SIDES), payload: { rack: n } }; // an award
  if (roll < 0.02) return { type: 'STALEMATE', payload: { rack: n } };
  if (r.push && rng.chance(0.35)) {
    const payload: Record<string, unknown> = { rack: n };
    if (rng.chance(0.2)) payload.pots = rng.sample(r.table, 1);
    if (rng.chance(0.1)) payload.foul = 'scratch';
    return { type: 'PUSH', side, payload };
  }
  if (roll < 0.14) {
    const payload: Record<string, unknown> = { rack: n, kind: rng.pick([...pool.FOUL_KINDS, 'nonsense']) };
    if (rng.chance(0.15)) payload.pots = rng.sample(r.table, 1);
    else if (rng.chance(0.05)) payload.off = rng.sample(r.table, 1);
    return { type: 'FOUL', ...base, payload };
  }
  if (roll < 0.24) return { type: 'SAFETY', side, payload: { rack: n, ...(rng.chance(0.1) ? { pots: rng.sample(r.table, 1) } : {}) } };
  if (roll < 0.45) return { type: 'MISS', ...base };
  return { type: 'POT', side, payload: { rack: n, ...potChoice(rng, s, side) } };
}

/** A plausible pot for the game: own group / the 8 at 8-ball, the money ball now and then. */
function potChoice(rng: Rng, s: pool.PoolState, side: Side): Record<string, unknown> {
  const r = s.rack!;
  const t = r.table;
  const called = !rng.chance(0.06);
  if (s.game === 'eight') {
    const own = r.solids === null ? null : r.solids === side ? SOLIDS : STRIPES;
    const mine = t.filter((b) => b !== 8 && (!own || own.includes(b)));
    const cleared = own ? !t.some((b) => own.includes(b)) : !t.some((b) => SOLIDS.includes(b)) || !t.some((b) => STRIPES.includes(b));
    if ((cleared && rng.chance(0.85)) || !mine.length || rng.chance(0.02)) return { pots: [8], called };
    const pots = rng.sample(mine, 1 + rng.int(2));
    if (rng.chance(0.08)) pots.push(...rng.sample(t.filter((b) => b !== 8 && !pots.includes(b)), 1));
    return { pots, called };
  }
  const money = MONEY[s.game];
  if (t.length === 1) return { pots: [money], called };
  const rest = t.filter((b) => b !== money);
  const pots = rng.sample(rest, 1 + rng.int(2));
  if (rng.chance(s.game === 'nine' ? 0.12 : 0.05)) pots.push(money);
  return { pots, called, ...(s.game === 'ten' && pots.includes(10) && rng.chance(0.5) ? { calledBall: 10 } : {}) };
}

// ------------------------------------------------------ the adversary --

const TYPES = ['LAG', 'BREAK', 'POT', 'MISS', 'SAFETY', 'FOUL', 'PUSH', 'CHOOSE', 'RACK', 'STALEMATE', 'UNDO', 'STAT_ADJUST', 'NOPE', '__proto__', 'constructor', 'toString', ''];
const junkBalls = (rng: Rng): unknown => {
  if (rng.chance(0.15)) return rng.pick(['3', 3, null, {}, 'Asha Rao']);
  return Array.from({ length: rng.int(5) }, () => (rng.chance(0.85) ? rng.int(19) - 2 : rng.pick([NaN, Infinity, '4', null, 2.5, -0])));
};

function adversarial(rng: Rng, s: pool.PoolState, log: ScoreAction[]): ScoreAction {
  if (log.length && rng.chance(0.25)) return structuredClone(rng.chance(0.5) ? log[log.length - 1] : rng.pick(log)); // a duplicate / replay
  const n = s.rack?.n ?? 1;
  const payload: Record<string, unknown> = {};
  const keys = ['pots', 'off', 'kind', 'foul', 'called', 'calledBall', 'rack', 'choice', 'breaker', 'breaks', 'illegal', 'short', 'bnr', 'golden', 'runOut', 'name', 'by'];
  for (const k of rng.sample(keys, rng.int(6))) {
    switch (k) {
      case 'pots': case 'off': payload[k] = junkBalls(rng); break;
      case 'rack': payload[k] = rng.pick([n, n, n - 1, n + 1, 0, -1, NaN, '1', null]); break;
      case 'kind': case 'foul': payload[k] = rng.pick([...pool.FOUL_KINDS, '__proto__', 'constructor', NAME, true, 1]); break;
      case 'choice': payload[k] = rng.pick(['play', 'pass', 'rerack', 'Asha', '']); break;
      case 'breaker': case 'breaks': payload[k] = rng.pick(['home', 'away', NAME, 'HOME']); break;
      case 'calledBall': payload[k] = rng.pick([1, 8, 9, 10, 0, 99, '2']); break;
      case 'name': case 'by': payload[k] = NAME; break;
      default: payload[k] = rng.pick([true, false, 'yes', 1]);
    }
  }
  const p = rng.chance(0.05) ? JSON.parse(`{"__proto__": {"pots": [1], "rack": ${n}}, "rack": ${n}}`) : rng.chance(0.05) ? rng.pick(['x', 7, null, [1, 2]]) : payload;
  return {
    type: rng.pick(TYPES),
    ...(rng.chance(0.85) ? { side: rng.pick(['home', 'away', 'home', 'away', 'HOME', 'both', null, undefined] as unknown as Side[]) } : {}),
    payload: p as Record<string, unknown>,
    ...(rng.chance(0.2) ? { attribution: { playerId: 'p1', stat: 'potted', playerName: NAME } } : {}),
  } as ScoreAction;
}

// ----------------------------------------------------------- invariants --

function checkState(s: pool.PoolState, where: string) {
  assert.equal(s.v, 1, where);
  assert.equal(s.rack === null, s.ended, `${where}: rack ⟺ live`);
  const won = [...s.sets.flatMap(([h, a]) => [h, a]), s.current.home, s.current.away].reduce((x, y) => x + y, 0);
  assert.equal(s.racks.length, won, `${where}: racks recorded = racks in the score`);
  for (const [h, a] of s.sets) assert.ok(Math.max(h, a) === s.raceTo && Math.min(h, a) < s.raceTo, `${where}: a set closes at the race`);
  assert.ok(s.current.home < s.raceTo && s.current.away < s.raceTo, `${where}: racks in play under the race`);
  assert.ok(s.setsWon.home <= s.setsToWin && s.setsWon.away <= s.setsToWin, `${where}: sets won`);
  const top = Math.max(s.setsWon.home, s.setsWon.away);
  assert.equal(s.ended, top === s.setsToWin, `${where}: ended ⟺ sets to win reached`);
  if (s.ended) assert.equal(s.setsWon[s.winner!], s.setsToWin, `${where}: the winner`);
  else assert.equal(s.winner, null);
  for (const sd of SIDES) {
    assert.equal(s.tally[sd].racks, s.racks.filter((x) => x.winner === sd).length, `${where}: tally racks`);
    for (const [k, v] of Object.entries(s.tally[sd])) if (k !== 'foulsBy') assert.ok(Number.isInteger(v) && (v as number) >= 0, `${where}: tally ${k}`);
  }
  assert.equal(s.tally.home.detailRacks, s.tally.away.detailRacks);
  const r = s.rack;
  if (!r) return;
  const top_ = TOP[s.game];
  for (let i = 0; i < r.table.length; i++) {
    assert.ok(Number.isInteger(r.table[i]) && r.table[i] >= 1 && r.table[i] <= top_, `${where}: ball in the game`);
    if (i) assert.ok(r.table[i] > r.table[i - 1], `${where}: each ball at most once, ascending`);
  }
  if (s.game !== 'eight') assert.ok(r.table.includes(MONEY[s.game]), `${where}: the money ball is on the table while the rack is live`);
  else if (!(r.pending && (r.pending.kind === 'eightBreak' || r.pending.kind === 'eightFoul'))) assert.ok(r.table.includes(8), `${where}: the 8 is on the table`);
  if (r.phase === 'play') assert.ok(r.shooter === 'home' || r.shooter === 'away', `${where}: a shooter`);
  if (r.pending) assert.ok(r.pending.by === 'home' || r.pending.by === 'away', `${where}: who chooses`);
  if (s.threeFoul) assert.ok(r.fouls.home <= 2 && r.fouls.away <= 2, `${where}: never on three fouls`);
}

function checkStep(prev: pool.PoolState, next: pool.PoolState, where: string) {
  if (prev.ended) { assert.equal(next, prev, `${where}: nothing after the end`); return; }
  if (next === prev) return;
  assert.equal(next.seq, prev.seq + 1, `${where}: an accepted action moves seq by 1`);
  const a = prev.rack!, b = next.rack;
  if (b && a.n === b.n && a.reracks === b.reracks) {
    // within one rack: a ball once down never comes back, except the spotted ones
    const back = b.table.filter((x) => !a.table.includes(x));
    for (const x of back) assert.ok(x === MONEY[next.game], `${where}: ball ${x} came back`);
    if (a.solids !== null) assert.equal(b.solids, a.solids, `${where}: the group changed`);
  }
}

// ------------------------------------------------------------ the runs --

interface Run { matches: number; ended: number; events: number; accepted: number; racks: number; detail: number; quick: number; golden: number; bnr: number; threeFoul: number; eightLoss: number }

function randomConfig(rng: Rng, game: Game): Record<string, unknown> {
  return {
    game, raceTo: 1 + rng.int(5), setsToWin: rng.chance(0.7) ? 1 : 2 + rng.int(2),
    breakFormat: rng.pick(['alternate', 'alternate', 'winner', 'loser']),
    ...(rng.chance(0.2) ? { threeFoul: rng.chance(0.5) } : {}),
    ...(rng.chance(0.2) ? { threeBallRule: false } : {}),
    ...(rng.chance(0.3) ? { tenEarly: true } : {}),
  };
}

function playMatch(rng: Rng, game: Game, adversary: boolean, totals: Run) {
  const config = randomConfig(rng, game);
  const style = rng.pick(['detail', 'detail', 'quick', 'mixed'] as const);
  let s = pool.createInitialState(config);
  const log: ScoreAction[] = [];
  const states: pool.PoolState[] = [s];
  let decided = 0;
  let quickRack = style === 'quick';
  const cap = adversary ? 300 : 900;
  for (let i = 0; i < cap; i++) {
    if (s.ended && (adversary ? i > 280 : rng.chance(0.9))) break;
    if (s.rack?.phase === 'break' && style === 'mixed') quickRack = rng.chance(0.4);
    const junk = adversary || rng.chance(0.06);
    const a = s.ended || junk ? adversarial(rng, s, log) : realistic(rng, s, quickRack);
    let next: pool.PoolState;
    try { next = pool.reducer(s, a); } catch (e) { assert.fail(`${game}: the reducer threw on ${JSON.stringify(a)}: ${e}`); }
    checkStep(s, next, `${game} event ${i} ${a.type}`);
    if (next !== s) { checkState(next, `${game} event ${i} ${a.type}`); totals.accepted++; }
    if (!s.ended && next.ended) decided++;
    log.push(a);
    states.push(next);
    s = next;
  }
  // the winner is decided exactly once (when the match ended)
  assert.equal(decided, s.ended ? 1 : 0, `${game}: the winner decided once`);
  // replay is deterministic, also through JSON (the stored event log)
  assert.deepStrictEqual(pool.replay(config, log), s, `${game}: replay`);
  assert.deepStrictEqual(pool.replay(config, JSON.parse(JSON.stringify(log))), s, `${game}: replay from JSON`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s, `${game}: the state is plain JSON`);
  // undo = replay without the newest events: exactly the state the scorer saw; redo gives it back
  for (let j = 0; j < 3 && log.length; j++) {
    const k = 1 + rng.int(log.length);
    const undone = pool.replay(config, log.slice(0, k - 1));
    assert.deepStrictEqual(undone, states[k - 1], `${game}: undo to ${k - 1}`);
    assert.deepStrictEqual(pool.reducer(undone, log[k - 1]), states[k], `${game}: redo ${k}`);
  }
  // IDs only: nothing the adversary named reaches the state
  assert.ok(!JSON.stringify(s).includes('Asha'), `${game}: a name reached the state`);
  assert.ok(!JSON.stringify(s).includes('p1'), `${game}: a player id reached the state`);
  // the readers never throw and agree with the state
  const res = pool.result(s);
  assert.equal(res !== null, s.ended);
  assert.doesNotThrow(() => { pool.summary(s); pool.scoreLine(s); pool.lineScore(s); poolStats(s); });
  totals.matches++; totals.events += log.length; totals.racks += s.racks.length;
  if (s.ended) totals.ended++;
  for (const r of s.racks) {
    if (r.mode === 'detail') totals.detail++; else totals.quick++;
    if (r.golden) totals.golden++;
    if (r.bnr) totals.bnr++;
    if (r.how === 'threeFoul') totals.threeFoul++;
    if (r.how.startsWith('eight')) totals.eightLoss++;
  }
}

const empty = (): Run => ({ matches: 0, ended: 0, events: 0, accepted: 0, racks: 0, detail: 0, quick: 0, golden: 0, bnr: 0, threeFoul: 0, eightLoss: 0 });

describe('pool simulation (seeded)', () => {
  const games: Game[] = ['eight', 'nine', 'ten'];
  games.forEach((game, gi) => {
    test(`${game}-ball: 500 realistic matches (6% junk) + 200 adversarial streams hold every invariant`, (t) => {
      const rng = new Rng(0x9001 + gi * 7919);
      const totals = empty();
      for (let m = 0; m < 500; m++) playMatch(rng, game, false, totals);
      for (let m = 0; m < 200; m++) playMatch(rng, game, true, totals);
      assert.equal(totals.matches, 700);
      assert.ok(totals.ended >= 450, `most realistic matches finish (${totals.ended})`);
      assert.ok(totals.detail > 1000 && totals.quick > 300, 'both scoring modes were exercised');
      if (game === 'nine') assert.ok(totals.golden > 0, 'golden breaks happened');
      if (game !== 'eight') assert.ok(totals.threeFoul > 0, 'three-foul losses happened');
      if (game === 'eight') assert.ok(totals.eightLoss > 0, 'racks lost on the 8 happened');
      t.diagnostic(`${game}: ${JSON.stringify(totals)}`);
    });
  });

  test('a 10,000-event log replays fast and the same every time', () => {
    const rng = new Rng(42);
    let s = pool.createInitialState({ game: 'nine', raceTo: 99, setsToWin: 9 });
    const log: ScoreAction[] = [];
    while (log.length < 10_000 && !s.ended) {
      const a = realistic(rng, s, false);
      log.push(a);
      s = pool.reducer(s, a);
    }
    const t0 = performance.now();
    const again = pool.replay({ game: 'nine', raceTo: 99, setsToWin: 9 }, log);
    const ms = performance.now() - t0;
    assert.deepStrictEqual(again, s);
    assert.ok(ms < 1000, `replay took ${ms.toFixed(0)} ms`);
    assert.ok(JSON.stringify(s).length < 200_000, 'the state stays small');
  });
});
