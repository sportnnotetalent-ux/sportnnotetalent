/**
 * Pool — the `statTotals` contract (src/sports/types.ts, checked by
 * tests/statTotalsHarness.mts) for src/sports/pool/totals.ts.
 *
 * Pool's totals are DERIVED ONLY: the controls never credit a stat live
 * (no `attribution`), so every key the totals return is derived from the
 * replayed state — the side's record for every player of the side, and the
 * shot figures for whoever shot (singles: the side's one player; scotch
 * doubles: the player id each shot carried). Checked on clean logs and on
 * every prefix (undo): deterministic, every key finite and ≥ 0, nothing live
 * to disagree with, AMEND voids equal the clean log; plus the key coverage
 * rules (game-specific keys, quick racks never write shot figures, an
 * unattributed doubles side writes none) and hostile snapshots.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertContract, assertSameAsClean, amendRecord, toRecords, replay, liveSums, type TotalsSport } from './statTotalsHarness.mts';
import * as L from './racketLogs.mts';
import * as M from '../src/sports/pool/match.ts';
import * as C from '../src/sports/pool/controls.ts';
import { poolStatTotals, POOL_RECORD_KEYS, POOL_SHOT_KEYS } from '../src/sports/pool/totals.ts';
import { lineKeys } from '../src/sports/statSchemas.ts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';

type Side = 'home' | 'away';
type S = M.PoolMatch;
const SINGLES = { home: ['h1'], away: ['a1'] };
const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };

const sport = (config: Record<string, unknown>, players = SINGLES, ctx: StatTotalsContext | undefined = L.ctxOf(players)): TotalsSport<S> => ({
  name: `pool ${String(config.game)}${players.home.length > 1 ? ' doubles' : ''}`,
  init: M.poolInit, reducer: M.poolReducer, statTotals: poolStatTotals,
  config, ctx, derived: () => true, // every key is derived (nothing is credited live)
});

/** A seeded scorer that plays a whole match through the controls' builders. */
function scorer(config: Record<string, unknown>, players: { home: string[]; away: string[] }, seed: number, quickShare = 0): ScoreAction[] {
  let x = seed >>> 0;
  const rnd = () => { x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  let s = M.poolInit(config);
  const log: ScoreAction[] = [];
  const who = (side: Side) => {
    const ids = players[side];
    if (ids.length < 2) return { pid: ids[0] };
    return { pid: C.shooterPick(s, side, ids).suggested ?? undefined };
  };
  for (let i = 0; i < 2000 && !s.ended; i++) {
    const p = C.poolPanel(s);
    let a: ScoreAction;
    if (p.kind === 'lag') a = C.lagAction(s, pick(['home', 'away'] as const));
    else if (p.kind === 'break') {
      const quick = rnd() < quickShare;
      const breaker = p.breaker ?? pick(['home', 'away'] as const);
      if (quick) a = C.rackAction(s, pick(['home', 'away'] as const), rnd() < 0.2 ? { bnr: true, breaker } : {});
      else {
        const n = Math.floor(rnd() * 3);
        const pots = p.balls.filter(() => rnd() < n / p.balls.length);
        a = rnd() < 0.08 ? C.breakAction(s, { foul: 'scratch', side: breaker }, who(breaker)) : C.breakAction(s, { pots, side: breaker }, who(breaker));
      }
    } else if (p.kind === 'choice') {
      const o = pick(C.choiceOptions(s, (sd) => sd));
      a = C.chooseAction(s, o.choice, o.breaker);
    } else if (p.kind === 'shot') {
      const r = rnd();
      const me = who(p.shooter);
      const own = p.table.filter((b) => b !== p.money);
      if (r < 0.1) a = C.foulAction(s, pick(['scratch', 'wrongBall', 'noRail', 'other'] as const), {}, me);
      else if (r < 0.2) a = C.safetyAction(s, [], me);
      else if (r < 0.45) a = C.missAction(s, me);
      else if (p.push && r < 0.5) a = C.pushAction(s, {}, me);
      else a = C.potAction(s, own.length && rnd() < 0.85 ? [pick(own)] : [p.money], {}, me);
    } else break;
    const next = M.poolReducer(s, a);
    log.push(a);
    s = next;
  }
  return log;
}

describe('pool statTotals · the contract (clean logs + every undo prefix)', () => {
  const CASES: Array<[string, Record<string, unknown>, typeof SINGLES, number]> = [
    ['8-ball singles, detail', { game: 'eight', raceTo: 3 }, SINGLES, 0],
    ['9-ball singles, mixed', { game: 'nine', raceTo: 3 }, SINGLES, 0.4],
    ['10-ball singles, sets', { game: 'ten', raceTo: 2, setsToWin: 2 }, SINGLES, 0.2],
    ['9-ball scotch doubles', { game: 'nine', raceTo: 3, playersPerSide: 2 }, DOUBLES, 0.1],
    ['8-ball scotch doubles', { game: 'eight', raceTo: 2, playersPerSide: 2 }, DOUBLES, 0],
    ['quick only', { game: 'nine', raceTo: 4 }, SINGLES, 1],
  ];
  CASES.forEach(([label, config, players, quick], i) => {
    test(label, () => {
      const log = scorer(config, players, 101 + i, quick);
      assert.ok(log.length > 5);
      assert.ok(log.every((a) => !a.attribution && !a.attribution2), 'no live credit');
      const recs = toRecords(log);
      const sp = sport(config, players);
      const t = assertContract(sp, recs, { every: 1 });
      assert.deepEqual(liveSums(recs), {}, 'nothing is credited live');
      // every player of the match is on a line, with the record keys
      for (const id of [...players.home, ...players.away]) {
        assert.ok(t[id], `${label}: ${id} missing`);
        for (const k of ['racksWon', 'racksLost', 'racksBroken', 'racksWonOnBreak', 'breakAndRuns', 'runOuts']) assert.equal(typeof t[id].stats[k], 'number', `${id}.${k}`);
      }
      // the record: a side's racks won = the other side's racks lost = the state's
      const s = replay(sp, recs);
      const home = players.home[0], away = players.away[0];
      assert.equal(t[home].stats.racksWon, s.racks.filter((r) => r.winner === 'home').length);
      assert.equal(t[home].stats.racksWon, t[away].stats.racksLost);
      // every written key is declared on the schema
      const declared = lineKeys('pool');
      for (const e of Object.values(t)) for (const k of Object.keys(e.stats)) assert.ok(declared.has(k), `undeclared ${k}`);
    });
  });

  test('determinism: the same log through JSON gives the same totals', () => {
    const config = { game: 'nine', raceTo: 3, playersPerSide: 2 };
    const log = scorer(config, DOUBLES, 7, 0.2);
    const a = poolStatTotals(replay(sport(config, DOUBLES), toRecords(log)), L.ctxOf(DOUBLES));
    const b = poolStatTotals(replay(sport(config, DOUBLES), toRecords(JSON.parse(JSON.stringify(log)))), L.ctxOf(DOUBLES));
    assert.deepEqual(a, b);
  });

  test('AMEND (#05): voiding a shot gives the totals of the log without it', () => {
    const config = { game: 'nine', raceTo: 2 };
    const log = scorer(config, SINGLES, 31, 0);
    const recs = toRecords(log);
    const target = recs.find((r) => r.type === 'MISS') ?? recs[3];
    const corrected = [...recs, amendRecord(recs, [{ op: 'void', seq: target.seq }])];
    const clean = recs.filter((r) => r.seq !== target.seq);
    assertSameAsClean(sport(config), corrected, clean, 'void a shot');
  });
});

describe('pool statTotals · which keys a line gets', () => {
  const played = (config: Record<string, unknown>, quick: number, players = SINGLES) => {
    const sp = sport(config, players);
    return poolStatTotals(replay(sp, toRecords(scorer(config, players, 5, quick))), L.ctxOf(players));
  };
  test('game-specific keys: 8-ball (8 on the break, racks lost on the 8), 9-ball (golden breaks), 9/10 (push-outs)', () => {
    const e = played({ game: 'eight', raceTo: 2 }, 0).h1.stats;
    assert.ok('eightBreaks' in e && 'eightLosses' in e && !('goldenBreaks' in e) && !('pushOuts' in e));
    const n = played({ game: 'nine', raceTo: 2 }, 0).h1.stats;
    assert.ok('goldenBreaks' in n && 'pushOuts' in n && !('eightBreaks' in n) && !('eightLosses' in n));
    const t = played({ game: 'ten', raceTo: 2 }, 0).h1.stats;
    assert.ok(!('goldenBreaks' in t) && 'pushOuts' in t);
    assert.ok('threeFoulLosses' in n && !('threeFoulLosses' in e), 'three-foul losses only where the rule is on');
    assert.ok('threeFoulLosses' in played({ game: 'eight', raceTo: 2, threeFoul: true }, 0).h1.stats);
  });
  test('sets keys only in a sets match; shot keys only when a rack was scored shot by shot', () => {
    assert.ok(!('setsWon' in played({ game: 'nine', raceTo: 2 }, 0).h1.stats));
    assert.ok('setsWon' in played({ game: 'nine', raceTo: 2, setsToWin: 2 }, 0).h1.stats);
    const q = played({ game: 'nine', raceTo: 3 }, 1).h1.stats;
    for (const k of POOL_SHOT_KEYS) assert.ok(!(k in q), `quick only: ${k} is not tracked`);
    assert.ok(!('innings' in q) && !('detailRacks' in q));
    for (const k of POOL_RECORD_KEYS) assert.equal(typeof q[k], 'number', k);
  });
  test('singles with more than one rostered player: the record to each, the shots to the one the log credited', () => {
    const config = { game: 'nine', raceTo: 2 };
    const s = replay(sport(config), toRecords(scorer(config, SINGLES, 9, 0)));
    const t = poolStatTotals(s, { players: { home: [{ id: 'h1' }, { id: 'h9' }], away: [{ id: 'a1' }] } });
    assert.equal(typeof t.h9.stats.racksWon, 'number');
    assert.ok(!('shotsPlayed' in t.h9.stats) && 'shotsPlayed' in t.h1.stats);
    // with no player id in the log, nobody is guessed
    const bare = replay(sport(config), toRecords(scorer(config, { home: [], away: [] }, 9, 0)));
    const t2 = poolStatTotals(bare, { players: { home: [{ id: 'h1' }, { id: 'h9' }], away: [{ id: 'a1' }] } });
    assert.ok(!('shotsPlayed' in t2.h1.stats) && !('shotsPlayed' in t2.h9.stats));
    assert.ok('shotsPlayed' in t2.a1.stats, 'a side of one: its player');
  });
  test('no ctx: the players the log credited (doubles ids, singles ids) are used', () => {
    const config = { game: 'nine', raceTo: 2, playersPerSide: 2 };
    const s = replay(sport(config, DOUBLES), toRecords(scorer(config, DOUBLES, 11, 0)));
    const t = poolStatTotals(s);
    assert.deepEqual(Object.keys(t).sort(), ['a1', 'a2', 'h1', 'h2']);
    assert.deepEqual(poolStatTotals(M.poolInit()), {}, 'nobody known: no lines');
  });
  test('a doubles credit for someone outside the side\'s players: the side keeps its record, no shot keys', () => {
    const config = { game: 'nine', raceTo: 2, playersPerSide: 2 };
    const s = replay(sport(config, DOUBLES), toRecords(scorer(config, { home: ['h1', 'zz'], away: ['a1', 'a2'] }, 13, 0)));
    const t = poolStatTotals(s, L.ctxOf(DOUBLES));
    assert.equal(typeof t.h1.stats.racksWon, 'number');
    assert.ok(!('shotsPlayed' in t.h1.stats));
    // as in every sport: ctx players plus the ids the log credited (a resolved dispute maps them later)
    assert.equal(typeof t.zz.stats.racksWon, 'number');
    assert.ok(!('shotsPlayed' in t.zz.stats));
    assert.ok('shotsPlayed' in t.a1.stats);
  });
  test('hostile or old snapshots never throw and never give a negative or non-finite value', () => {
    const base = replay(sport({ game: 'nine', raceTo: 2 }), toRecords(scorer({ game: 'nine', raceTo: 2 }, SINGLES, 17, 0)));
    const bad: unknown[] = [
      null, undefined, 7, 'x', [], {},
      { ...base, cr: null }, { ...base, cr: 'x' }, { ...base, cr: { ss: [{ home: { shotsPlayed: -5, ballsPotted: 'x' } }], by: [{ id: 'h1', side: 'home', c: { fouls: Infinity } }], unk: { home: -1 }, ids: { home: ['h1', 7, 'a b'] } } },
      { ...base, racks: [{ winner: 'home', breaker: 'nope', how: 'money', bnr: 'yes' }, null, 5] },
      { ...base, tally: null }, { ...base, game: '__proto__' }, { ...base, perSide: 99 },
    ];
    for (const b of bad) {
      const t = poolStatTotals(b as S, L.ctxOf(SINGLES));
      for (const e of Object.values(t)) for (const [k, v] of Object.entries(e.stats)) assert.ok(Number.isFinite(v) && v >= 0, `${k} = ${v}`);
    }
  });
});
