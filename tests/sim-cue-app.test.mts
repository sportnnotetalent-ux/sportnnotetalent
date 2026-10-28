/**
 * Seeded simulation of the snooker and billiards PLUGINS (quality mandate
 * step 6; the engines have their own, tests/sim-snooker-billiards.test.mts).
 *
 * 640 simulated scorers, one match each: 160 snooker (15 / 10 reds), 160
 * six-red snooker, 160 billiards N-up, 160 billiards timed. A scorer taps what
 * the panel offers (the screen's buttons, the foul sheet, the after-foul
 * choice, quick frame scores, concessions, awards, re-racks, TIME), with
 * hostile taps mixed in: double taps, stale taps (an action built earlier),
 * taps stamped for the wrong frame, junk payloads with a child's name, and
 * undo storms (the live layer replays the log without its last 1–6 rows).
 * Some finished matches get a frame correction (A-01).
 *
 * Invariants:
 *  - nothing throws: panels, builders, endingOf, feeds, stats, sheets,
 *    records, Undo labels, boards, totals;
 *  - the confirm sheet asks exactly when a tap ends a frame;
 *  - every dispatched panel tap is accepted; the state = a replay of the log
 *    (deterministic), and survives a JSON round trip; no name reaches it;
 *  - no snooker break exceeds maxBreak(reds) (+8 with a free ball);
 *  - the statTotals contract (harness) on the final log and two undo prefixes;
 *  - once ended, the result agrees with the summary;
 *  - a frame correction keeps every later frame as played.
 * Prints one summary line.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import { contractErrors, liveSums, toRecords, amendRecord, replay as replayRecs, type TotalsSport } from './statTotalsHarness.mts';
import { SINGLES_CTX } from './cue-script.mts';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import * as BC from '../src/sports/billiards/controls.ts';
import { endingOf } from '../src/sports/cue/ending.ts';
import { frameCorrection } from '../src/sports/cue/corrections.ts';
import { snookerStatTotals } from '../src/sports/snooker/totals.ts';
import { billiardsStatTotals } from '../src/sports/billiards/totals.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';
import { billiardsFeed } from '../src/sports/billiards/feed.ts';
import { snookerMatchStats, frameSheet as snookerSheet, breakList as snookerBreaks } from '../src/sports/snooker/matchStats.ts';
import { billiardsMatchStats, frameSheet as billiardsSheet, breakList as billiardsBreaks } from '../src/sports/billiards/matchStats.ts';
import { snookerMatchRecords } from '../src/sports/snooker/records.ts';
import { billiardsMatchRecords } from '../src/sports/billiards/records.ts';
import { snookerUndoLabel } from '../src/sports/snooker/undo.ts';
import { billiardsUndoLabel } from '../src/sports/billiards/undo.ts';
import { lineKeys } from '../src/sports/statSchemas.ts';

type Side = 'home' | 'away';
const NAME = 'Asha Rao';
const NAMES = { home: 'Home', away: 'Away' };

function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, chance: (p: number) => next() < p, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
}
type R = ReturnType<typeof prng>;

interface Sport<St> {
  name: string;
  init: (c?: Record<string, unknown>) => St;
  reducer: (s: St, a: never) => St;
  totals: TotalsSport<St>['statTotals'];
  /** a valid tap from the panel, or null (nothing offered by this pick) */
  tap: (s: St, r: R, skill: number, quick: boolean) => ScoreAction | null;
  project: (s: St) => void;
  undo: (step: { type: string; prev: unknown; next: unknown }) => string | null;
  breaks: (s: St) => number;
  key: 'snooker' | 'billiards';
}

const stats = { taps: 0, hostile: 0, refused: 0, undos: 0, frames: 0, ended: 0, corrections: 0, maxBreak: 0, quick: 0 };
/** rule paths reached (from the final states) */
const paths = { respots: 0, centuries: 0, maximums: 0, missAwards: 0, reracks: 0, freeBalls: 0, limitFouls: 0, sudden: 0, draws: 0 };

/* ------------------------------------------------------------- snooker -- */

const snooker: Sport<S.SnookerState> = {
  name: 'snooker', key: 'snooker', init: S.createInitialState, reducer: S.reducer as never, totals: snookerStatTotals,
  tap(s, r, skill, quick) {
    const p = SC.snookerPanel(s);
    if (!p) return null;
    if (quick && p.frameScore && r.chance(0.8)) {
      stats.quick++;
      const w = r.int(30, 120), l = r.int(0, w - 1);
      return SC.frameScoreAction(s, r.chance(0.5) ? w : l, r.chance(0.5) ? l : w);
    }
    if (p.respotLots && r.chance(0.5)) return p.respotLots.home ?? p.respotLots.away;
    if (p.missWarn?.award && r.chance(0.5)) return p.missWarn.award;
    // a snooker the striker keeps failing to escape: replace, foul and a miss again (S3 R14)
    if (p.afterFoul?.miss && p.afterFoul.replace && r.chance(0.5)) return p.afterFoul.replace;
    if (p.missWarn && p.missWarn.by === p.striker && !p.afterFoul && r.chance(0.5)) return SC.foulAction(s, { value: p.foul.min, miss: true });
    if (p.afterFoul && r.chance(0.3)) return r.pick([p.afterFoul.playAgain, p.afterFoul.replace, p.afterFoul.freeBall]);
    if (p.toss && r.chance(0.1)) return p.toss.home ?? p.toss.away;
    const lit = p.balls.filter((b) => b.action);
    const x = r.next();
    if (x < skill && lit.length) {
      if (p.redMulti.length && r.chance(0.08)) return r.pick(p.redMulti).action;
      if (p.freeRed.length && r.chance(0.3)) return r.pick(p.freeRed).action;
      // a good player takes the black after a red
      const black = lit.find((b) => b.ball === 'black');
      return (black && r.chance(skill > 0.9 ? 0.99 : 0.6) ? black : r.pick(lit)).action;
    }
    if (x < skill + 0.12) return p.miss;
    if (x < skill + 0.2) return p.safety;
    if (x < skill + 0.26) {
      return SC.foulAction(s, {
        value: r.pick(p.foul.values), kind: r.chance(0.5) ? r.pick(S.FOUL_KINDS) : undefined, miss: r.chance(0.35),
        freeBall: p.foul.canFreeBall && r.chance(0.2), reds: p.foul.maxRedsDown && r.chance(0.1) ? r.int(1, Math.min(2, p.foul.maxRedsDown)) : 0,
        byOther: r.chance(0.04),
      });
    }
    if (x < skill + 0.262) return p.rerack;
    if (x < skill + 0.264) return p.concede[r.pick(['home', 'away'] as Side[])];
    if (x < skill + 0.2645) return SC.awardAction(s, r.pick(['home', 'away'] as Side[]), r.pick(['conduct', 'time', 'other'] as const));
    return p.miss;
  },
  project(s) {
    SC.snookerPanel(s); SC.snookerBoard(s);
    snookerFeed(s, NAMES); snookerMatchStats(s); snookerSheet(s); snookerBreaks(s, 20); snookerMatchRecords(s);
    S.summary(s); S.lineScore(s); S.scoreLine(s); S.standingsUnits(s);
  },
  undo: snookerUndoLabel,
  breaks(s) {
    const max = S.maxBreak(s.reds);
    let hi = 0;
    const visits = [...s.frames.flatMap((f) => f.visits ?? []), ...(s.frame ? [...s.frame.visits, s.frame.visit] : [])];
    for (const v of visits) {
      assert.ok(v.pts <= max + (v.fb ? 8 : 0), `break ${v.pts} over ${max}${v.fb ? '+8' : ''}`);
      hi = Math.max(hi, v.pts);
    }
    return hi;
  },
};

/* ----------------------------------------------------------- billiards -- */

const billiards: Sport<B.BilliardsState> = {
  name: 'billiards', key: 'billiards', init: B.createInitialState, reducer: B.reducer as never, totals: billiardsStatTotals,
  tap(s, r, skill, quick) {
    const p = BC.billiardsPanel(s);
    if (!p) return null;
    if (quick && p.frameScore && r.chance(0.8)) {
      stats.quick++;
      if (p.format === 'points') { const lo = r.int(0, p.target - 1); return r.chance(0.5) ? BC.frameScoreAction(s, p.target, lo) : BC.frameScoreAction(s, lo, p.target); }
      return BC.frameScoreAction(s, r.int(0, 200), r.int(0, 200));
    }
    if (p.toss && r.chance(0.1)) return p.toss.home ?? p.toss.away;
    if (p.time && r.chance(0.004)) return p.time;
    // time called with the scores level: sudden death, or a draw
    if (p.time && p.score.home === p.score.away && p.score.home > 0 && r.chance(0.3)) return p.time;
    const x = r.next();
    if (x < skill) {
      if (r.chance(0.15)) {
        const parts: BC.Parts = {};
        for (const k of B.PARTS) if (r.chance(0.35)) parts[k] = true;
        return BC.strokeAction(s, parts);
      }
      return r.pick(p.strokes).action;
    }
    if (x < skill + 0.12) return p.miss;
    if (x < skill + 0.18) return p.safety;
    if (x < skill + 0.22) return BC.foulAction(s, r.chance(0.5) ? r.pick(B.FOUL_KINDS) : undefined);
    if (x < skill + 0.225) return p.concede[r.pick(['home', 'away'] as Side[])];
    if (x < skill + 0.227) return BC.awardAction(s, r.pick(['home', 'away'] as Side[]));
    return p.miss;
  },
  project(s) {
    BC.billiardsPanel(s); BC.billiardsBoard(s);
    const p = BC.billiardsPanel(s);
    if (p) BC.limitWarnings(p);
    billiardsFeed(s, NAMES, s.bestOf > 1 ? 'frame' : 'game'); billiardsMatchStats(s); billiardsSheet(s); billiardsBreaks(s, 25); billiardsMatchRecords(s);
    B.summary(s); B.lineScore(s); B.scoreLine(s); B.standingsUnits(s);
  },
  undo: billiardsUndoLabel,
  breaks(s) {
    let hi = 0;
    for (const f of s.frames) for (const v of f.visits ?? []) hi = Math.max(hi, v.pts);
    return hi;
  },
};

/* ----------------------------------------------------------- the match -- */

/** a hostile tap: double, stale, wrong frame, junk with a name */
function hostile<St extends { frame: { n: number } | null }>(r: R, log: ScoreAction[], older: ScoreAction[], s: St, types: string[]): ScoreAction {
  stats.hostile++;
  const n = s.frame?.n ?? 1;
  switch (r.int(0, 4)) {
    case 0: return log.length ? log[log.length - 1] : { type: 'MISS' }; // the double tap
    case 1: return older.length ? r.pick(older) : { type: 'SAFETY' }; // a stale tap (built from an earlier state)
    case 2: { // the right tap, the wrong frame
      const a = log.length ? log[log.length - 1] : { type: 'MISS', payload: {} };
      return { ...a, payload: { ...(a.payload ?? {}), frame: n + r.pick([-1, 1]) } };
    }
    case 3: return { type: r.pick(types), side: r.pick(['home', 'away'] as Side[]), payload: { frame: n, name: NAME, playerName: NAME, ball: NAME, kind: NAME, reason: NAME, value: '7', home: -1, away: 1e9 } };
    default: return { type: r.pick(types), payload: JSON.parse(`{"__proto__":{"polluted":1},"frame":${n}}`) };
  }
}

const ALLOWED_KEYS = new Set(['ball', 'reds', 'free', 'frame', 'value', 'kind', 'miss', 'freeBall', 'penalty', 'side', 'reason', 'home', 'away', ...B.PARTS]);

function playMatch<St extends { frame: { n: number } | null; frames: unknown[]; ended: boolean; seq: number }>(
  sp: Sport<St>, config: Record<string, unknown>, seed: number, types: string[],
) {
  const r = prng(seed);
  // most scorers watch club players; one in eight watches a pro (long breaks)
  const skill = r.chance(0.125) ? 0.97 : 0.45 + r.next() * 0.4;
  const quickMatch = r.chance(0.15);
  const replayAll = (log: ScoreAction[]) => log.reduce((x, a) => sp.reducer(x, a as never), sp.init(config));
  let s = sp.init(config);
  let log: ScoreAction[] = [];
  const older: ScoreAction[] = [];
  for (let i = 0; i < 1500 && !s.ended; i++) {
    stats.taps++;
    // an undo storm: the live layer drops the last rows and replays the log
    if (log.length && r.chance(0.02)) {
      const k = Math.min(log.length, r.int(1, 6));
      log = log.slice(0, log.length - k);
      s = replayAll(log);
      stats.undos += k;
      continue;
    }
    const isHostile = r.chance(0.12);
    const a = isHostile ? hostile(r, log, older, s, types) : sp.tap(s, r, skill, quickMatch || r.chance(0.03));
    if (!a) continue;
    if (!isHostile && r.chance(0.2)) older.push(a);
    const ends = endingOf(sp.reducer, s, a);
    const next = sp.reducer(s, a as never);
    assert.equal(!!ends, next.frames.length > s.frames.length, `${sp.name} #${seed}: the confirm sheet and the engine disagree`);
    if (next === s) {
      assert.ok(isHostile, `${sp.name} #${seed}: the panel offered a refused tap ${JSON.stringify(a)}`);
      stats.refused++;
      continue;
    }
    if (!isHostile) {
      for (const k of Object.keys(a.payload ?? {})) assert.ok(ALLOWED_KEYS.has(k), `${sp.name}: a builder sent "${k}"`);
      assert.ok(!('attribution' in a), 'no live credit');
    }
    // the Undo bar names the step
    sp.undo({ type: a.type, prev: s, next });
    log.push(a);
    s = next;
    if (i % 25 === 0) sp.project(s);
  }
  return { s, log, skill };
}

function checkMatch<St extends { frames: unknown[]; ended: boolean; frame: unknown }>(sp: Sport<St>, config: Record<string, unknown>, s: St, log: ScoreAction[], seed: number, r: R) {
  // deterministic replay, JSON round trip, no name, no pollution
  const again = log.reduce((x, a) => sp.reducer(x, a as never), sp.init(config));
  assert.deepEqual(again, s, `${sp.name} #${seed}: replay differs`);
  const json = JSON.stringify(s);
  assert.deepEqual(JSON.parse(json), s);
  assert.ok(!json.includes(NAME), `${sp.name} #${seed}: a name reached the state`);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  sp.project(s);
  stats.maxBreak = Math.max(stats.maxBreak, sp.breaks(s));
  stats.frames += s.frames.length;
  for (const f of s.frames as Array<Record<string, unknown>>) {
    if (f.how === 'respot') paths.respots++;
    if (f.how === 'award' && f.reason === 'miss') paths.missAwards++;
    if (f.how === 'sudden') paths.sudden++;
    if (f.how === 'draw') paths.draws++;
    paths.reracks += typeof f.reracks === 'number' ? f.reracks : 0;
    for (const v of (f.visits ?? []) as Array<{ pts: number; fb?: number }>) {
      if (v.pts >= 100) paths.centuries++;
      if (sp.key === 'snooker' && v.pts === S.maxBreak((s as unknown as S.SnookerState).reds) && !v.fb) paths.maximums++;
    }
    for (const x of (f.fouls ?? []) as Array<{ fb?: boolean; kind?: string }>) {
      if (x.fb) paths.freeBalls++;
      if (x.kind === 'hazards' || x.kind === 'cannons') paths.limitFouls++;
    }
  }
  // the totals contract on the final log and two undo prefixes
  const tsp: TotalsSport<St> = { name: sp.name, init: sp.init, reducer: sp.reducer as never, statTotals: sp.totals, config, ctx: SINGLES_CTX, derived: () => true };
  const recs = toRecords(log);
  for (const n of [recs.length, r.int(0, recs.length), r.int(0, recs.length)]) {
    const pre = recs.slice(0, n);
    const t = sp.totals(replayRecs(tsp, pre), SINGLES_CTX);
    assert.deepEqual(contractErrors(tsp, t, liveSums(pre)), [], `${sp.name} #${seed}`);
    const keys = lineKeys(sp.key);
    for (const e of Object.values(t)) for (const k of Object.keys(e.stats)) assert.ok(keys.has(k), `${sp.name}: undeclared ${k}`);
  }
  assert.deepEqual(sp.totals(s, SINGLES_CTX), sp.totals(again, SINGLES_CTX));
  // ended: the result agrees with the summary
  if (s.ended) {
    stats.ended++;
    const res = (sp.key === 'snooker' ? S.result(s as never) : B.result(s as never))!;
    const sum = sp.key === 'snooker' ? S.summary(s as never) : B.summary(s as never);
    assert.ok(res, `${sp.name} #${seed}: ended without a result`);
    assert.equal(`${sum.homeScore}-${sum.awayScore}`, `${res.home}-${res.away}`, `${sp.name} #${seed}: summary vs result`);
    // a frame correction keeps every later frame as played
    if (s.frames.length >= 2 && r.chance(0.15)) {
      stats.corrections++;
      const frames = s.frames as Array<{ n: number; score: [number, number] }>;
      const n = r.int(1, frames.length - 1);
      const w = sp.key === 'snooker' ? r.int(40, 90) : Number((s as unknown as B.BilliardsState).target);
      const l = r.int(0, Math.max(0, (sp.key === 'snooker' ? w : w) - 1));
      const plan = frameCorrection({ createInitialState: sp.init, reducer: sp.reducer }, config, recs, n, w, l);
      if (plan) {
        const fixed = replayRecs(tsp, [...recs, amendRecord(recs, plan.ops)]) as unknown as { frames: Array<{ n: number; score: [number, number]; quick?: boolean }> };
        const rec = fixed.frames.find((f) => f.n === n)!;
        assert.equal(rec.quick, true);
        for (const f of fixed.frames) if (f.n > n) assert.deepEqual(f.score, frames.find((x) => x.n === f.n)!.score, `${sp.name} #${seed}: frame ${f.n} changed`);
        assert.deepEqual(contractErrors(tsp, sp.totals(fixed as never, SINGLES_CTX), liveSums([...recs, amendRecord(recs, plan.ops)])), []);
      }
    }
  }
}

test('sim: 640 scorers on the snooker and billiards plugins', () => {
  const t0 = Date.now();
  const SN_TYPES = ['POT', 'MISS', 'SAFETY', 'FOUL', 'FREE_BALL', 'PLAY_AGAIN', 'REPLACE', 'RESPOT_TURN', 'BREAK_OFF', 'CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE', 'RERACK'];
  const BI_TYPES = ['SCORE', 'MISS', 'SAFETY', 'FOUL', 'TIME', 'BREAK_OFF', 'CONCEDE', 'AWARD_FRAME', 'FRAME_SCORE'];
  const runs: Array<[string, () => void]> = [];
  for (let i = 0; i < 160; i++) {
    const seed = 1000 + i;
    runs.push(['snooker', () => {
      const r = prng(seed * 7);
      const config = { reds: r.pick([15, 10]), bestOf: r.pick([1, 3]), firstBreak: r.pick(['home', 'away']) };
      const { s, log } = playMatch(snooker, config, seed, SN_TYPES);
      checkMatch(snooker, config, s, log, seed, r);
    }]);
    runs.push(['six-red', () => {
      const r = prng(seed * 11);
      const config = { reds: 6, bestOf: r.pick([1, 3, 5]) };
      const { s, log } = playMatch(snooker, config, seed + 5000, SN_TYPES);
      checkMatch(snooker, config, s, log, seed, r);
    }]);
    runs.push(['billiards', () => {
      const r = prng(seed * 13);
      const config = { target: r.pick([50, 100, 150]), bestOf: r.pick([1, 3]), hazardLimit: r.pick([15, 5]), cannonLimit: r.pick([75, 10]) };
      const { s, log } = playMatch(billiards, config, seed + 9000, BI_TYPES);
      checkMatch(billiards, config, s, log, seed, r);
    }]);
    runs.push(['timed', () => {
      const r = prng(seed * 17);
      const config = { format: 'timed', timedTie: r.pick(['sudden', 'draw']) };
      let { s, log } = playMatch(billiards, config, seed + 13000, BI_TYPES);
      // time is called at the end of the session
      for (let k = 0; k < 50 && !s.ended; k++) {
        const p = BC.billiardsPanel(s)!;
        const a = p.time ?? p.strokes[2].action!;
        log = [...log, a];
        s = B.reducer(s, a as never);
      }
      checkMatch(billiards, config, s, log, seed, r);
    }]);
  }
  for (const [, run] of runs) run();
  assert.ok(runs.length >= 500);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`sim-cue-app: ${runs.length} scorers/matches (160 snooker, 160 six-red, 160 billiards N-up, 160 billiards timed) · ${stats.taps} taps, ${stats.hostile} hostile (${stats.refused} refused), ${stats.undos} rows undone, ${stats.quick} quick frames · ${stats.frames} frames, ${stats.ended} matches finished, ${stats.corrections} frame corrections · highest break ${stats.maxBreak}; reached ${paths.centuries} centuries, ${paths.maximums} maximums, ${paths.respots} re-spotted blacks, ${paths.freeBalls} free balls, ${paths.missAwards} miss awards, ${paths.reracks} re-racks, ${paths.limitFouls} hazard / cannon fouls, ${paths.sudden} sudden deaths, ${paths.draws} timed draws · every invariant held · ${secs}s`);
});
