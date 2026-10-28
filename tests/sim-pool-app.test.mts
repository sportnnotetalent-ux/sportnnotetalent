/**
 * Pool app plugin — seeded simulation (docs/engineering/quality-mandate.md,
 * step 6). 600 simulated scorers (200 per game: 8-, 9-, 10-ball), each scoring
 * one match through the controls' pure logic exactly as the screen does:
 * the panel decides what can be tapped, the builders make the action, the
 * confirm sheet is answered (yes, or now and then no), the tap guard filters,
 * and the action goes into the event log (useLiveMatch: optimistic apply +
 * log). Random formats: race 1–4, one race or best of 3, every break format,
 * the organiser rules on and off, singles / scotch doubles, rosters of 0–3.
 *
 * Hostile taps on top (they bypass the guard, as a second phone or an older
 * app would): double taps, stale taps built on an older state, junk (names in
 * payloads, bad ids, malformed balls, unknown types), and undo storms (pop
 * 1–6 events, re-derive by full replay, sometimes redo).
 *
 * Invariants: nothing ever throws; the incremental state always equals a full
 * replay of the log (and a replay through JSON); the statTotals contract
 * holds (tests/statTotalsHarness.mts: derived keys finite ≥ 0, nothing
 * credited live) and the record matches the state; scotch-doubles shots add
 * up to the side's; the result agrees with the summary; records stay within
 * the match's limits; the feed stays bounded; the undo label never prints
 * junk; no name ever reaches the log or the state. One summary line printed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/sports/pool/match.ts';
import * as C from '../src/sports/pool/controls.ts';
import { POOL_CORE } from '../src/sports/pool/core.ts';
import { poolFeed } from '../src/sports/pool/feed.ts';
import { poolCompare } from '../src/sports/pool/compare.ts';
import { SOLIDS, STRIPES } from '../src/sports/pool/balls.ts';
import { contractErrors, toRecords, liveSums, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { FoulKind } from '../src/sports/pool/engine.ts';

type Side = 'home' | 'away';
type S = M.PoolMatch;
const SIDES: Side[] = ['home', 'away'];
const NAMES = ['Asha Rao', 'Ravi Kumar', 'Meera Joshi', 'Kabir Singh', 'Diya Iyer', 'Rohan Nair'];

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
  sample<T>(a: readonly T[], k: number): T[] { const c = [...a]; const o: T[] = []; while (o.length < k && c.length) o.push(c.splice(this.int(c.length), 1)[0]); return o; }
}

const replayLog = (config: Record<string, unknown>, log: ScoreAction[]) =>
  log.reduce<S>((s, a) => POOL_CORE.reducer(s, a), POOL_CORE.createInitialState(config));

interface Tallies { matches: number; doubles: number; ended: number; taps: number; valid: number; declined: number; guarded: number; double: number; stale: number; junk: number; undos: number; racks: number; detail: number; quick: number; golden: number; bnr: number }

/** A valid tap for the panel, as the screen would build it. */
function scorerTap(rng: Rng, s: S, roster: Record<Side, string[]>, doubles: boolean): ScoreAction | null {
  const p = C.poolPanel(s);
  const pidFor = (sd: Side) => {
    if (doubles) { const pick = C.shooterPick(s, sd, roster[sd]); return rng.chance(0.9) ? pick.suggested : pick.ids[rng.int(Math.max(1, pick.ids.length))] ?? null; }
    return roster[sd].length === 1 ? roster[sd][0] : null;
  };
  const opts = (sd: Side | null) => ({ pid: sd ? pidFor(sd) : null, at: 1_700_000_000_000 + rng.int(1e9) });
  switch (p.kind) {
    case 'over': return null;
    case 'lag': return rng.chance(0.85) ? C.lagAction(s, rng.pick(SIDES), opts(null)) : C.rackAction(s, rng.pick(SIDES), {}, opts(null));
    case 'break': {
      const brk = p.breaker ?? rng.pick(SIDES);
      if (rng.chance(0.18)) {
        const w = rng.pick(SIDES);
        const f = rng.f();
        return C.rackAction(s, w, f < 0.15 ? { bnr: true, breaker: w } : f < 0.25 && s.game === 'nine' ? { golden: true, breaker: w } : f < 0.35 ? { runOut: true, breaker: w === 'home' ? 'away' : 'home' } : { breaker: p.breaker ?? brk }, opts(null));
      }
      const r = rng.f();
      const o = opts(brk);
      if (r < 0.06) return C.breakAction(s, { foul: rng.pick(C.BREAK_FOULS), pots: rng.sample(p.balls, rng.int(2)), side: brk }, o);
      if (r < 0.1) return C.breakAction(s, { illegal: true, side: brk }, o);
      if (r < 0.14 && p.shortRule) return C.breakAction(s, { short: true, pots: rng.sample(p.balls.filter((b) => b !== 9), rng.int(3)), side: brk }, o);
      if (r < 0.17 && s.game === 'nine') return C.breakAction(s, { pots: [9, ...rng.sample(p.balls.filter((b) => b !== 9), rng.int(2))], side: brk }, o);
      return C.breakAction(s, { pots: rng.sample(p.balls.filter((b) => b !== (s.game === 'eight' ? 8 : 99)), rng.int(4)), side: brk }, o);
    }
    case 'choice': {
      const opt = rng.pick(C.choiceOptions(s, (sd) => sd));
      return C.chooseAction(s, opt.choice, opt.breaker, opts(null));
    }
    case 'shot': {
      const sh = p.shooter;
      const o = opts(sh);
      const r = rng.f();
      if (r < 0.01) return C.stalemateAction(s, opts(null));
      if (r < 0.02) return C.rackAction(s, rng.pick(SIDES), {}, opts(null)); // an award
      if (r < 0.12) {
        const k: FoulKind = rng.pick(C.PLAY_FOULS);
        if (k === 'outOfTurn' && rng.chance(0.5)) return C.foulAction(s, k, { by: sh === 'home' ? 'away' : 'home' }, opts(sh === 'home' ? 'away' : 'home'));
        return C.foulAction(s, k, { balls: rng.chance(0.15) ? rng.sample(p.table, 1) : [] }, o);
      }
      if (r < 0.2) return C.safetyAction(s, rng.chance(0.08) ? rng.sample(p.table.filter((b) => b !== p.money), 1) : [], o);
      if (p.push && r < 0.26) return C.pushAction(s, rng.chance(0.2) ? { pots: rng.sample(p.table, 1) } : {}, o);
      if (r < 0.42) return C.missAction(s, o);
      // a pot: the shooter's group / the lowest balls / the money ball
      let pool = p.table.filter((b) => b !== p.money);
      if (s.game === 'eight' && p.solids) pool = pool.filter((b) => (p.solids === sh ? SOLIDS : STRIPES).includes(b));
      const pots = pool.length && rng.chance(0.9) ? rng.sample(pool, 1 + rng.int(2)) : [p.money];
      if (rng.chance(0.05) && !pots.includes(p.money)) pots.push(p.money);
      return C.potAction(s, pots, { called: !rng.chance(0.05), ...(p.tenCall && pots.includes(10) && rng.chance(0.5) ? { calledBall: 10 } : {}) }, o);
    }
  }
}

/** Junk: what an older app, a bug or an attacker might store. */
function junkTap(rng: Rng, s: S): ScoreAction {
  const n = s.rack?.n ?? 1;
  const payload: Record<string, unknown> = { rack: rng.pick([n, n, n - 1, n + 1, 'x', null]) };
  if (rng.chance(0.5)) payload.pots = rng.pick([[1], [99], 'x', [NAMES[0]], [2.5], []]);
  if (rng.chance(0.3)) payload.pid = rng.pick([NAMES[1], 'p 1', '__proto__', 7, 'x'.repeat(80), 'ok-id']);
  if (rng.chance(0.3)) payload.name = rng.pick(NAMES);
  if (rng.chance(0.2)) payload.kind = rng.pick(['scratch', NAMES[2], 'constructor', true]);
  if (rng.chance(0.1)) payload.game = rng.pick(['eight', 'nine', 'ten', '__proto__']);
  return {
    type: rng.pick(['POT', 'MISS', 'FOUL', 'BREAK', 'RACK', 'LAG', 'CHOOSE', 'PUSH', 'SAFETY', 'STALEMATE', 'NOPE', 'AMEND', '__proto__']),
    ...(rng.chance(0.8) ? { side: rng.pick(['home', 'away', 'both', NAMES[3]] as unknown as Side[]) } : {}),
    payload,
  };
}

function checkMatch(config: Record<string, unknown>, s: S, log: ScoreAction[], roster: Record<Side, string[]>, doubles: boolean, where: string) {
  // the state is plain JSON and replays identically, also from the stored JSON log
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, `${where}: plain JSON`);
  assert.deepEqual(replayLog(config, log), s, `${where}: replay`);
  assert.deepEqual(replayLog(config, JSON.parse(JSON.stringify(log))), s, `${where}: replay from JSON`);
  // no name ever reaches the log or the state
  const blob = JSON.stringify(log) + JSON.stringify(s);
  for (const nm of NAMES) assert.ok(!JSON.stringify(s).includes(nm), `${where}: "${nm}" in the state`);
  for (const nm of NAMES) {
    // junk taps may carry a name in their payload (they are the attack); the controls' own taps never do
    const own = log.filter((a) => !(a as { junk?: true }).junk);
    assert.ok(!JSON.stringify(own).includes(nm), `${where}: "${nm}" in a tap the controls built`);
  }
  void blob;
  // statTotals contract (nothing credited live; every key derived, finite, ≥ 0)
  const ctx = { players: { home: roster.home.map((id) => ({ id })), away: roster.away.map((id) => ({ id })) } };
  const sp: TotalsSport<S> = { name: 'pool', init: M.poolInit, reducer: M.poolReducer, statTotals: POOL_CORE.statTotals!, config, ctx, derived: () => true };
  const t = POOL_CORE.statTotals!(s, ctx);
  const recs = toRecords(log.map(({ junk: _j, ...a }: ScoreAction & { junk?: true }) => a));
  assert.deepEqual(contractErrors(sp, t, liveSums(recs), `${where}: `), []);
  assert.deepEqual(POOL_CORE.statTotals!(replayLog(config, log), ctx), t, `${where}: totals deterministic`);
  for (const sd of SIDES) {
    const won = s.racks.filter((r) => r.winner === sd).length;
    for (const id of roster[sd]) {
      const line = t[id];
      if (!line) continue;
      assert.equal(line.stats.racksWon, won, `${where}: ${id} racks won`);
      assert.equal(line.stats.racksLost, s.racks.length - won, `${where}: ${id} racks lost`);
      assert.ok(line.stats.breakAndRuns <= won && line.stats.runOuts <= won, `${where}: bnr / run-outs within racks won`);
    }
    // scotch doubles: the partners' shots add up to the side's (when placed)
    if (doubles) {
      const lines = roster[sd].map((id) => t[id]).filter((l) => l && 'shotsPlayed' in l.stats);
      if (lines.length) {
        const side = M.sideCounts(s, sd);
        assert.equal(lines.reduce((x, l) => x + l.stats.shotsPlayed, 0), side.shotsPlayed ?? 0, `${where}: doubles shots add up`);
        assert.equal(lines.reduce((x, l) => x + l.stats.ballsPotted, 0), side.ballsPotted ?? 0, `${where}: doubles balls add up`);
      }
    }
  }
  // the result agrees with the summary
  const res = POOL_CORE.result!(s);
  const sum = POOL_CORE.summary(s);
  assert.equal(res !== null, s.ended, `${where}: result ⟺ ended`);
  if (res) {
    assert.deepEqual([sum.homeScore, sum.awayScore], [String(res.home), String(res.away)], `${where}: result = summary`);
    assert.ok(res[res.winner as Side] > res[res.winner === 'home' ? 'away' : 'home'], `${where}: the winner leads`);
  }
  // records within the match's limits
  const rec = POOL_CORE.matchRecords!(s);
  assert.equal(rec !== null || !s.ended || s.racks.length === 0, true);
  if (!s.ended) assert.equal(rec, null, `${where}: no records before the end`);
  for (const i of rec?.items ?? []) {
    assert.ok(Number.isFinite(i.value) && i.value > 0, `${where}: record value`);
    if (i.type === 'biggestWin') { assert.equal(i.value % 1000, s.raceTo); assert.ok(Math.floor(i.value / 1000) <= s.raceTo); }
    if (i.type === 'rackRun') assert.ok(i.value >= 2 && i.value <= s.racks.length);
    if (i.type === 'breakAndRuns' || i.type === 'runOuts') assert.ok(i.value <= s.racks.filter((r) => r.winner === i.side).length);
    if (i.type === 'goldenBreak') assert.equal(s.game, 'nine');
    if (i.playerId) assert.ok(roster[i.side as Side].includes(i.playerId) || M.creditOf(s).ids[i.side as Side].includes(i.playerId), `${where}: record names a player of the side`);
  }
  // the feed stays bounded
  const f = M.feedOf(s);
  assert.ok(f.length <= (M.FEED_RACKS + 1) * M.FEED_PER_RACK);
  const per = new Map<number, number>();
  for (const e of f) per.set(e.n, (per.get(e.n) ?? 0) + 1);
  for (const v of per.values()) assert.ok(v <= M.FEED_PER_RACK);
  // the screens' readers never print junk
  const out = JSON.stringify([poolFeed(s, { home: 'H', away: 'A' }, (id) => String(id)), poolCompare(s), C.poolPanel(s), C.breakLine(s, (x) => x), C.formatNote(s), C.bestOfLine(s)]);
  assert.ok(!/undefined|NaN|Infinity|\[object/.test(out), `${where}: reader output`);
}

function playMatch(rng: Rng, idx: number, game: 'eight' | 'nine' | 'ten', T: Tallies) {
  const doubles = rng.chance(0.4);
  const config: Record<string, unknown> = {
    game, raceTo: 1 + rng.int(4), setsToWin: rng.chance(0.3) ? 2 : 1, playersPerSide: doubles ? 2 : 1,
    breakFormat: rng.pick(['alternate', 'alternate', 'winner', 'loser']),
    ...(rng.chance(0.2) ? { threeFoul: rng.chance(0.5) } : {}), ...(rng.chance(0.15) ? { threeBallRule: false } : {}), ...(rng.chance(0.3) ? { tenEarly: true } : {}),
  };
  const size = doubles ? rng.pick([2, 2, 2, 3, 1, 0]) : rng.pick([1, 1, 1, 1, 0, 2]);
  const roster: Record<Side, string[]> = { home: Array.from({ length: size }, (_, i) => `p-h${idx}-${i}`), away: Array.from({ length: size }, (_, i) => `p-a${idx}-${i}`) };
  let s = POOL_CORE.createInitialState(config);
  const log: Array<ScoreAction & { junk?: true }> = [];
  const history: S[] = [s];
  const guard = C.makeTapGuard(M.poolReducer);
  const where = (k: number) => `${game} match ${idx} step ${k}`;
  const dispatch = (a: ScoreAction & { junk?: true }) => {
    const next = POOL_CORE.reducer(s, a);
    log.push(a);
    s = next;
    history.push(s);
  };
  let quiet = 0;
  for (let k = 0; k < 500 && quiet < 3; k++) {
    if (s.ended) quiet++;
    T.taps++;
    const r = rng.f();
    try {
      if (r < 0.04 && log.length) {
        // an undo storm: pop 1–6 events, re-derive by full replay (deriveLog), sometimes redo one
        const n = 1 + rng.int(6);
        const popped = log.splice(Math.max(0, log.length - n));
        history.splice(Math.max(1, history.length - popped.length));
        s = replayLog(config, log);
        history[history.length - 1] = s;
        T.undos++;
        if (popped.length && rng.chance(0.3)) dispatch(popped[0]);
      } else if (r < 0.08 && history.length > 3) {
        // a stale tap: built on a state a few steps back, sent without the guard (a second phone)
        const old = history[Math.max(0, history.length - 2 - rng.int(4))];
        const a = scorerTap(rng, old, roster, doubles);
        if (a) { dispatch(a); T.stale++; }
      } else if (r < 0.12) {
        dispatch({ ...junkTap(rng, s), junk: true });
        T.junk++;
      } else {
        const a = scorerTap(rng, s, roster, doubles);
        if (!a) continue;
        const q = C.confirmFor(s, a, (x) => x);
        if (q && rng.chance(0.08)) { T.declined++; continue; }
        if (!guard(s, a, { asked: s, now: k * 100 })) { T.guarded++; continue; }
        dispatch(a);
        T.valid++;
        // the guard stops a second tap on the same screen…
        if (rng.chance(0.06)) { assert.equal(guard(history[history.length - 2], a, { now: k * 100 + 50 }), false, `${where(k)}: double tap through the guard`); T.guarded++; }
        // … but a double tap from a second phone (no guard) lands in the log
        if (rng.chance(0.04)) { dispatch(a); T.double++; }
      }
      // the screen's readers never throw
      C.poolPanel(s); C.choiceOptions(s, (x) => x); C.breakLine(s, (x) => x);
      if (log.length >= 2) {
        const u = POOL_CORE.undoLabel!({ type: log[log.length - 1].type, prev: history[history.length - 2], next: s }, (id) => String(id));
        if (u !== null) assert.ok(!/undefined|null|NaN/.test(u), `${where(k)}: undo label "${u}"`);
      }
      if (k % 40 === 0) assert.deepEqual(replayLog(config, log), s, `${where(k)}: incremental = replay`);
    } catch (e) {
      throw new Error(`${where(k)}: ${(e as Error).message}\nconfig ${JSON.stringify(config)}`);
    }
  }
  checkMatch(config, s, log, roster, doubles, `${game} match ${idx}`);
  T.matches++; if (doubles) T.doubles++; if (s.ended) T.ended++;
  T.racks += s.racks.length;
  for (const r of s.racks) { if (r.mode === 'detail') T.detail++; else T.quick++; if (r.golden) T.golden++; if (r.bnr) T.bnr++; }
}

test('pool app: 600 seeded scorers (valid, double, stale, junk taps and undo storms) hold every invariant', () => {
  const T: Tallies = { matches: 0, doubles: 0, ended: 0, taps: 0, valid: 0, declined: 0, guarded: 0, double: 0, stale: 0, junk: 0, undos: 0, racks: 0, detail: 0, quick: 0, golden: 0, bnr: 0 };
  const t0 = performance.now();
  (['eight', 'nine', 'ten'] as const).forEach((game, gi) => {
    const rng = new Rng(0x5eed + gi * 104729);
    for (let i = 0; i < 200; i++) playMatch(rng, gi * 1000 + i, game, T);
  });
  const ms = performance.now() - t0;
  assert.equal(T.matches, 600);
  assert.ok(T.ended > 400, `most matches finish (${T.ended})`);
  assert.ok(T.doubles > 150 && T.detail > 1000 && T.quick > 150 && T.golden > 0 && T.bnr > 0, JSON.stringify(T));
  assert.ok(T.double > 50 && T.stale > 50 && T.junk > 100 && T.undos > 100 && T.guarded > 50, JSON.stringify(T));
  console.log(`[sim-pool-app] ${T.matches} scorers (${T.doubles} scotch doubles) · ${T.taps} taps: ${T.valid} valid, ${T.declined} declined at the confirm, ${T.guarded} double taps stopped by the guard, ${T.double} double taps from a second phone, ${T.stale} stale, ${T.junk} junk, ${T.undos} undo storms · ${T.ended} matches finished · ${T.racks} racks (${T.detail} shot by shot, ${T.quick} quick, ${T.bnr} break-and-runs, ${T.golden} golden) · every invariant held · ${(ms / 1000).toFixed(1)} s`);
});
