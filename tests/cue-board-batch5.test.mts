/**
 * Cue & board batch 5 (docs/security/breaks/cue-board-batch5.md):
 *  - per-game options: `hideWhen` may name several values (`unless`), so pool's
 *    9-ball / 10-ball options hide in an 8-ball match (Info, setup, Edit format);
 *  - pool: every foul kind its own Stats row + career key; commentary for the
 *    whole match; an awarded rack's reason; TPA;
 *  - snooker: foul kinds in Stats + careers; safety success;
 *  - billiards: the break make-up on the foul line and the visit in play;
 *  - chess: "How" pre-set (no extra tap), draws and losses by method.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { FormatField } from '../src/sports/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { isHidden, hideRuleHolds } from '../src/sports/formatPick.ts';
import { matchRules } from '../src/sports/matchRules.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import * as M from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import { POOL_CORE } from '../src/sports/pool/core.ts';
import { poolFeed, rackTag } from '../src/sports/pool/feed.ts';
import { poolCompare, poolTpa } from '../src/sports/pool/compare.ts';
import { poolStatTotals, POOL_TOTAL_KEYS } from '../src/sports/pool/totals.ts';
import { poolStats as POOL_SCHEMA } from '../src/sports/pool/stats.ts';
import { snookerScript, billiardsScript, SINGLES_CTX } from './cue-script.mts';
import * as S from '../src/sports/snooker/engine.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import { snookerStatTotals, SNOOKER_SHOT_KEYS } from '../src/sports/snooker/totals.ts';
import { snookerStats as SNOOKER_SCHEMA } from '../src/sports/snooker/stats.ts';
import { billiardsFeed } from '../src/sports/billiards/feed.ts';
import { chessResultCredit, chessStats as CHESS_SCHEMA, LOSS_METHOD_KEYS, DRAW_METHOD_KEYS } from '../src/sports/chess/stats.ts';
import { defaultMethod, howChoices, sentHow } from '../src/sports/chess/how.ts';

type PS = M.PoolMatch;
const NAMES = { home: 'Asha', away: 'Ravi' };
const field = (k: string) => POOL_META.formatFields!.find((f) => f.key === k)!;

/* ------------------------------------------------------------------ */
describe('H — per-game options (hideWhen with several values)', () => {
  test('H1 — 8-ball hides both the 9-ball and the 10-ball option; each shows in its own game', () => {
    const three = field('threeBallRule'), ten = field('tenEarly');
    for (const [game, t, e] of [['eight', true, true], ['nine', false, true], ['ten', true, false]] as const) {
      assert.equal(isHidden(three, { game }), t, `three-ball in ${game}`);
      assert.equal(isHidden(ten, { game }), e, `10 early in ${game}`);
      const keys = matchRules(POOL_META.formatFields!, { game }).map((r) => r.key);
      assert.equal(keys.includes('threeBallRule'), !t, `Info three-ball in ${game}`);
      assert.equal(keys.includes('tenEarly'), !e, `Info 10 early in ${game}`);
    }
  });
  test('H2 — every existing single-value rule still works in both readers', () => {
    const scotch = field('scotchTurns');
    assert.equal(isHidden(scotch, { playersPerSide: 1 }), true);
    assert.equal(isHidden(scotch, { playersPerSide: 2 }), false);
    assert.equal(hideRuleHolds({ key: 'x', value: 1 }, 1), true);
    assert.equal(hideRuleHolds({ key: 'x', value: 1 }, 2), false);
    const pf = PADEL_META.formatFields!.find((f) => f.hideWhen?.key === 'setsToWin')!; // (the pair type also hides, on playersPerSide)
    assert.equal(isHidden(pf, { [pf.hideWhen!.key]: 1 }), true);
    assert.equal(matchRules(PADEL_META.formatFields!, { setsToWin: 1 }).some((r) => r.key === pf.key), false);
    assert.equal(matchRules(PADEL_META.formatFields!, { setsToWin: 2 }).some((r) => r.key === pf.key), true);
  });
  test('H3 — no game key reads the standard (8-ball); an unknown or hostile game hides both; never throws', () => {
    const three = field('threeBallRule'), ten = field('tenEarly');
    // the editor passes the fields, so a missing value reads its default
    assert.equal(isHidden(three, {}, POOL_META.formatFields), true);
    assert.equal(isHidden(ten, {}, POOL_META.formatFields), true);
    assert.equal(matchRules(POOL_META.formatFields!, {}).some((r) => r.key === 'tenEarly'), false);
    for (const game of ['snooker', 9, true, '__proto__', null]) {
      assert.equal(isHidden(ten, { game } as never), true);
      assert.doesNotThrow(() => matchRules(POOL_META.formatFields!, { game } as never));
    }
    const rule: FormatField['hideWhen'] = { key: 'game', unless: ['ten'] };
    assert.equal(hideRuleHolds(rule!, 'ten'), false);
    assert.equal(hideRuleHolds({ key: 'g', unless: 'ten' } as never, 'ten'), true, 'a malformed unless never shows by mistake… it hides');
  });
});

/* ------------------------------------------------------------------ */
// pool: score through the controls (the event log)
function poolGame(config: Record<string, unknown>) {
  let s = POOL_CORE.createInitialState(config) as PS;
  const log: ScoreAction[] = [];
  const tap = (a: ScoreAction) => { const n = POOL_CORE.reducer(s, a) as PS; assert.notEqual(n, s, JSON.stringify(a)); log.push(a); s = n; };
  return { get s() { return s; }, log, tap };
}
const replay = (config: Record<string, unknown>, log: ScoreAction[]) =>
  log.reduce<PS>((s, a) => POOL_CORE.reducer(s, a) as PS, POOL_CORE.createInitialState(config) as PS);

const KIND_KEYS = ['foulScratch', 'foulWrongBall', 'foulNoRail', 'foulOffTable', 'foulTouch', 'foulDoubleHit', 'foulPush', 'foulJump', 'foulMoving',
  'foulNoFoot', 'foulPlacement', 'foulSlowPlay', 'foulOutOfTurn', 'foulIllegalBreak', 'foulOther'];

describe('P — pool foul kinds, commentary, award reason, TPA', () => {
  test('P1 — every foul kind gets its own key and its own Stats row', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    // a foul, then two misses (each player's foul run is broken: no three-foul loss)
    for (const k of ['jump', 'doubleHit', 'touched', 'pushShot', 'moving', 'noFoot'] as const) {
      g.tap(PC.foulAction(g.s, k)); g.tap(PC.missAction(g.s)); g.tap(PC.missAction(g.s));
    }
    const c = { ...M.sideCounts(g.s, 'home') }, d = { ...M.sideCounts(g.s, 'away') };
    const both = (k: string) => (c[k] ?? 0) + (d[k] ?? 0);
    for (const k of ['foulJump', 'foulDoubleHit', 'foulTouch', 'foulPush', 'foulMoving', 'foulNoFoot']) assert.equal(both(k), 1, k);
    assert.equal(both('foulOther'), 0, 'nothing lumped into other');
    const rows = poolCompare(g.s).find((x) => x.id === 'fouls')!.rows.map((r) => r.key);
    for (const k of ['foulJump', 'foulDoubleHit', 'foulTouch', 'foulPush', 'foulMoving', 'foulNoFoot']) assert.ok(rows.includes(k), k);
    assert.ok(!rows.includes('foulOther'), 'a zero row is left out');
  });
  test('P1 — careers: the new keys are declared, keyed, written on a shot-by-shot line', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    g.tap(PC.foulAction(g.s, 'jump'));
    const t = poolStatTotals(g.s, SINGLES_CTX as never);
    for (const k of KIND_KEYS) {
      assert.ok(POOL_TOTAL_KEYS.includes(k), `${k} written`);
      const def = POOL_SCHEMA.stats.find((x) => x.key === k);
      assert.ok(def && def.coverage === 'keyed', `${k} keyed`);
    }
    const all = { ...t.h1.stats, ...t.a1.stats };
    assert.equal((t.h1.stats.foulJump ?? 0) + (t.a1.stats.foulJump ?? 0), 1);
    assert.ok('foulJump' in all);
  });
  test('P2 — the kinds add up to the fouls, and the score is unchanged by the split', () => {
    const g = poolGame({ game: 'eight', raceTo: 2 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    for (const k of ['scratch', 'jump', 'other', 'slowPlay', 'placement', 'wrongBall'] as const) {
      g.tap(PC.foulAction(g.s, k)); g.tap(PC.missAction(g.s)); g.tap(PC.missAction(g.s));
    }
    for (const sd of ['home', 'away'] as const) {
      const c = M.sideCounts(g.s, sd);
      assert.equal(KIND_KEYS.reduce((t, k) => t + (c[k] ?? 0), 0), c.fouls ?? 0, sd);
    }
    assert.deepEqual(replay({ game: 'eight', raceTo: 2 }, g.log).current, g.s.current);
  });
  test('P3 — a stored credit with hostile foul keys reads clean', () => {
    const g = poolGame({ game: 'nine' });
    g.tap(PC.lagAction(g.s, 'home'));
    const bad = { ...g.s, cr: { ...g.s.cr, ss: [{ home: { foulJump: -5, foulTouch: 1e9 + 0.5, foulPush: '7', __proto__: 3, fouls: 2 }, away: {} }] } };
    const c = M.sideCounts(bad, 'home');
    assert.equal(c.foulJump, undefined);
    assert.equal(c.foulTouch, undefined);
    assert.equal(c.foulPush, undefined);
    assert.equal(c.fouls, 2);
  });
  test('P4 — the commentary keeps every rack’s shots (a race to 9 shows rack 1 shot by shot)', () => {
    const g = poolGame({ game: 'nine', raceTo: 9 });
    g.tap(PC.lagAction(g.s, 'home'));
    for (let i = 0; i < 8; i++) {
      g.tap(PC.breakAction(g.s, { pots: [] }));
      g.tap(PC.missAction(g.s));
      g.tap(PC.rackAction(g.s, i % 2 ? 'away' : 'home'));
    }
    const ns = new Set(M.feedOf(g.s).map((e) => e.n));
    for (let n = 1; n <= 8; n++) assert.ok(ns.has(n), `rack ${n} kept`);
    const groups = poolFeed(g.s, NAMES);
    const r1 = groups.find((x) => x.key === 'r1')!;
    assert.ok(r1.items.some((i) => /misses|breaks/.test(i.text)), 'rack 1 shot by shot');
    // the replay of the same log gives the same feed (nothing new is stored)
    assert.deepEqual(M.feedOf(replay({ game: 'nine', raceTo: 9 }, g.log)), M.feedOf(g.s));
  });
  test('P5 — the whole feed is capped (oldest racks dropped whole); a huge stored feed reads quickly', () => {
    let s = M.poolInit({ game: 'nine', raceTo: 99 });
    s = M.poolReducer(s, PC.lagAction(s, 'home'));
    for (let r = 0; r < 60; r++) {
      s = M.poolReducer(s, PC.breakAction(s, { pots: [] }));
      for (let i = 0; i < 40; i++) s = M.poolReducer(s, PC.safetyAction(s, []));
      s = M.poolReducer(s, PC.rackAction(s, r % 2 ? 'away' : 'home'));
    }
    const f = M.feedOf(s);
    assert.ok(f.length <= M.FEED_MAX, `${f.length} ≤ ${M.FEED_MAX}`);
    const ns = [...new Set(f.map((e) => e.n))].sort((a, b) => a - b);
    const first = ns[0];
    // the oldest rack kept is whole (its BREAK line is there)
    assert.ok(f.some((e) => e.n === first && e.t === 'BREAK'), 'oldest kept rack is whole');
    assert.ok(JSON.stringify(s).length < 200_000);
    const big = { ...s, feed: Array.from({ length: 200_000 }, () => ({ n: 1, t: 'MISS', s: 'home' })) } as PS;
    const t0 = performance.now();
    assert.ok(M.feedOf(big).length <= M.FEED_MAX);
    assert.ok(performance.now() - t0 < 200);
  });
  test('P6 — scotch doubles: an early golden break is credited to the breaker', () => {
    const cfg = { game: 'nine', raceTo: 7, playersPerSide: 2 };
    const g = poolGame(cfg);
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [9] }, { pid: 'h1' }));
    assert.equal(g.s.racks[0].golden, true);
    for (let i = 0; i < 5; i++) {
      g.tap(PC.breakAction(g.s, { pots: [] }, { pid: i % 2 ? 'h2' : 'a1' }));
      g.tap(PC.rackAction(g.s, 'away'));
    }
    const ctx = { players: { home: [{ id: 'h1' }, { id: 'h2' }], away: [{ id: 'a1' }, { id: 'a2' }] } };
    const t = poolStatTotals(g.s, ctx as never);
    assert.equal(t.h1.stats.goldenBreaks, 1);
    assert.equal(t.h2.stats.goldenBreaks, 0);
  });
  test('P7 / P8 — an awarded rack keeps an optional, whitelisted reason; quick racks and junk ignore it', () => {
    const g = poolGame({ game: 'eight', raceTo: 5 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    g.tap(PC.rackAction(g.s, 'away', { reason: 'conduct' }));
    assert.equal(g.s.racks[0].how, 'awarded');
    assert.equal(g.s.racks[0].reason, 'conduct');
    assert.equal(rackTag(g.s.racks[0], (sd) => NAMES[sd]), 'awarded: conduct');
    // a quick rack (no detail) ignores a reason
    g.tap(PC.rackAction(g.s, 'home', { reason: 'forfeit' }));
    assert.equal(g.s.racks[1].how, 'quick');
    assert.equal(g.s.racks[1].reason, undefined);
    // hostile reasons are ignored; the score is the same
    g.tap(PC.breakAction(g.s, { pots: [] }));
    const raw = { type: 'RACK', side: 'home', payload: { rack: g.s.rack!.n, reason: '<script>' } } as ScoreAction;
    g.tap(raw);
    assert.equal(g.s.racks[2].reason, undefined);
    for (const r of [{ reason: '__proto__' }, { reason: 5 }, { reason: { x: 1 } }]) {
      assert.equal(PC.rackAction(g.s, 'home', r as never).payload?.reason, undefined);
    }
    // the old RACK (no reason) replays to the same racks
    const old = g.log.map((a) => (a.type === 'RACK' ? { ...a, payload: Object.fromEntries(Object.entries(a.payload ?? {}).filter(([k]) => k !== 'reason')) } : a));
    const r = replay({ game: 'eight', raceTo: 5 }, old);
    assert.deepEqual(r.current, g.s.current);
    assert.deepEqual(r.racks.map((x) => x.how), g.s.racks.map((x) => x.how));
    // the commentary says why
    assert.ok(poolFeed(g.s, NAMES).some((x) => x.items.some((i) => /conduct/.test(i.text))));
  });
  test('P9 — TPA: (balls + safeties + breaks) ÷ (the same + misses + fouls); "–" with nothing', () => {
    assert.equal(poolTpa({}), null);
    assert.equal(poolTpa({ ballsPotted: 6, safetyShots: 2, breakShots: 2, missShots: 1, fouls: 1 }), 10 / 12);
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [1] }));
    g.tap(PC.missAction(g.s));
    // the break is one point (its balls are the break's, not "balls pocketed"); the miss an error
    const row = poolCompare(g.s).find((x) => x.id === 'table')!.rows.find((r) => r.key === 'tpa')!;
    assert.equal(row.home, '0.500');
    assert.equal(row.away, '–');
    const def = POOL_SCHEMA.stats.find((x) => x.key === 'tpa');
    assert.ok(def && def.source === 'derived');
  });
});

/* ------------------------------------------------------------------ */
describe('S — snooker foul kinds and safety success', () => {
  test('S1 — each foul kind has a Stats row (non-zero only) and a career key', () => {
    const m = snookerScript({ reds: 6, bestOf: 1 });
    m.foul({ kind: 'inOff' }).foul({ kind: 'push' }).foul({ kind: 'inOff' });
    const rows = snookerMatchStats(m.state).find((c) => c.id === 'fouls')!.rows;
    const inOff = rows.find((r) => r.key === 'foulInOff')!;
    assert.ok(inOff);
    assert.equal(Number(inOff.home) + Number(inOff.away), 2);
    assert.ok(rows.find((r) => r.key === 'foulPush'));
    assert.ok(!rows.find((r) => r.key === 'foulJump'), 'zero rows left out');
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    assert.equal((t.h1.stats.foulInOff ?? 0) + (t.a1.stats.foulInOff ?? 0), 2);
    assert.equal(t.h1.stats.foulJump, 0, 'tracked: 0, not missing');
    for (const k of ['foulInOff', 'foulNoContact', 'foulWrongBall', 'foulPottedWrong', 'foulPush', 'foulJump', 'foulTouch', 'foulOffTable', 'foulOther']) {
      assert.ok((SNOOKER_SHOT_KEYS as readonly string[]).includes(k), k);
      assert.equal(SNOOKER_SCHEMA.stats.find((x) => x.key === k)?.coverage, 'keyed', k);
    }
  });
  test('S2 — an unknown kind counts as a foul but reaches no kind key; quick matches write none', () => {
    const m = snookerScript({ reds: 6 });
    m.foul({ kind: 'push' });
    const f = m.state.frame!;
    const bad = { ...m.state, frame: { ...f, fouls: [...f.fouls, { by: 'home', value: 4, kind: 'constructor' }] } } as S.SnookerState;
    const t = snookerStatTotals(bad, SINGLES_CTX as never);
    const kinds = ['foulInOff', 'foulNoContact', 'foulWrongBall', 'foulPottedWrong', 'foulPush', 'foulJump', 'foulTouch', 'foulOffTable', 'foulOther'];
    const sum = (x: Record<string, number>) => kinds.reduce((a, k) => a + (x[k] ?? 0), 0);
    assert.equal(sum(t.h1.stats) + sum(t.a1.stats), 1);
    assert.equal(t.h1.stats.fouls + t.a1.stats.fouls, 2);
    const q = snookerScript({ reds: 6, bestOf: 3 });
    q.quick(60, 20);
    assert.equal(snookerStatTotals(q.state, SINGLES_CTX as never).h1.stats.foulPush, undefined);
  });
  test('S3 — safety success: judged on the opponent’s next visit, once it has ended', () => {
    const m = snookerScript({ reds: 6 });
    // home breaks off: a safety; away misses (0) → success
    m.safety().miss();
    // home safety; away pots a red then misses (1) → failure
    m.safety().pot('red').miss();
    // home safety; away fouls (0) → success
    m.safety().foul({});
    // home's safety; away's visit still in play → not judged
    m.safety();
    const st = S.snookerStats(m.state);
    assert.equal(st.home.safetiesJudged, 3);
    assert.equal(st.home.safetiesWon, 2);
    const row = snookerMatchStats(m.state).find((c) => c.id === 'potting')!.rows.find((r) => r.key === 'safetySuccess')!;
    assert.equal(row.home, '2/3 (67%)');
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    assert.equal(t.h1.stats.safetiesJudged, 3);
    assert.equal(t.h1.stats.safetiesWon, 2);
    assert.ok(SNOOKER_SCHEMA.stats.find((x) => x.key === 'safetySuccess'));
  });
  test('S4 — old logs replay to the same frames and scores', () => {
    const m = snookerScript({ reds: 6, bestOf: 3 });
    m.pot('red', 'black').safety().foul({ kind: 'wrongBall', value: 6 }).clearance();
    const again = m.actions.reduce((s, a) => S.reducer(s, a as never), S.createInitialState({ reds: 6, bestOf: 3 }));
    assert.deepEqual(again, m.state);
  });
});

/* ------------------------------------------------------------------ */
describe('B — billiards break make-up', () => {
  test('B1 — the foul line and the visit in play say what the break was made of', () => {
    const m = billiardsScript({ target: 200 });
    m.stroke({ potRed: true }, 3).stroke({ cannon: true }, 2).foul('push');
    m.stroke({ inOffRed: true }, 2);
    const g = billiardsFeed(m.state, NAMES, 'game');
    const texts = g.flatMap((x) => x.items.map((i) => i.text));
    assert.ok(texts.includes('Asha fouled (push stroke): 2 to Ravi after a break of 13 (3 red pots, 2 cannons)'), texts.join('\n'));
    assert.ok(texts.includes('Ravi at the table — break of 6 so far (2 in-offs from the red)'), texts.join('\n'));
  });
});

/* ------------------------------------------------------------------ */
describe('C — chess "How"', () => {
  test('C1 — draws and losses by method on the credit (new keys, declared, additive)', () => {
    const lose = chessResultCredit('away', { id: 'b' }, 'home', 'resignation', false)!;
    assert.deepEqual(lose.extra, { losses: 1, lossesResign: 1 });
    const win = chessResultCredit('home', { id: 'w' }, 'home', 'time', false)!;
    assert.deepEqual(win.extra, { wins: 1, winsTime: 1 });
    const draw = chessResultCredit('home', { id: 'w' }, 'draw', 'repetition', false)!;
    assert.deepEqual(draw.extra, { draws: 1, drawsRepetition: 1 });
    assert.deepEqual(chessResultCredit('home', { id: 'w' }, 'draw', 'adjudication', false)!.extra, { draws: 1, drawsOther: 1 });
    // no method / a hostile one: the outcome only (as before)
    assert.deepEqual(chessResultCredit('away', { id: 'b' }, 'home', undefined, false)!.extra, { losses: 1 });
    assert.deepEqual(chessResultCredit('away', { id: 'b' }, 'home', '__proto__', false)!.extra, { losses: 1 });
    for (const k of [...LOSS_METHOD_KEYS, ...DRAW_METHOD_KEYS]) assert.ok(CHESS_SCHEMA.stats.find((x) => x.key === k), k);
  });
  test('C2 — a sensible default, no extra tap: resignation / agreement, the board’s own result first', () => {
    assert.equal(defaultMethod('home'), 'resignation');
    assert.equal(defaultMethod('draw'), 'agreement');
    assert.equal(defaultMethod(null), null);
    assert.equal(defaultMethod('home', 'checkmate'), 'checkmate');
    assert.equal(defaultMethod('draw', 'stalemate'), 'stalemate');
    // the scorer's pick wins; "Not recorded" sends none; a double forfeit keeps its own
    assert.equal(sentHow({ winner: 'home', picked: 'time', none: false, dff: false }), 'time');
    assert.equal(sentHow({ winner: 'home', picked: null, none: false, dff: false }), 'resignation');
    assert.equal(sentHow({ winner: 'home', picked: null, none: true, dff: false }), undefined);
    assert.equal(sentHow({ winner: 'draw', picked: null, none: false, dff: true }), 'double-forfeit');
    assert.equal(sentHow({ winner: null, picked: null, none: false, dff: false }), undefined);
    // a pick that doesn't fit the result (a draw method on a win) falls back to the default
    assert.equal(sentHow({ winner: 'home', picked: 'agreement', none: false, dff: false }), 'resignation');
  });
  test('C2 — the common methods come first, the rest under More', () => {
    assert.deepEqual(howChoices('home').common, ['resignation', 'checkmate', 'time']);
    assert.ok(howChoices('home').more.includes('arbiter'));
    assert.deepEqual(howChoices('draw').common, ['agreement', 'repetition', 'stalemate']);
    assert.ok(howChoices('draw').more.includes('fifty-move'));
    assert.deepEqual(howChoices(null), { common: [], more: [] });
  });
});
