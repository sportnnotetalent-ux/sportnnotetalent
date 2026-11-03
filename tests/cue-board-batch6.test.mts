/**
 * Cue & board batch 6 (docs/security/breaks/cue-board-batch6.md), the P2 depth:
 *  - old logs replay identically in all five sports (fingerprints recorded on
 *    the code before the batch: tests/cueBoardBatch6Gen.mts);
 *  - pool: ball in hand, push-out choices, re-racks, not-called pots; the
 *    shot-clock extension (optional, one per player per rack);
 *  - snooker: the break's make-up, total clearances, long pots / rest;
 *  - billiards: the red-to-centre hint, foul kinds in careers;
 *  - carrom: a board or a game conceded / awarded, with a reason;
 *  - chess: arbiter events (illegal-move warning, draw offer), the second
 *    illegal move pre-selecting the loss, ½-0 / 0-½, a second period / delay.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import { allPrints } from './cueBoardBatch6Gen.mts';
import { matchRules, matchCaptures } from '../src/sports/matchRules.ts';
import * as M from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';
import { poolFeed } from '../src/sports/pool/feed.ts';
import { poolCompare } from '../src/sports/pool/compare.ts';
import { poolStatTotals, POOL_TOTAL_KEYS } from '../src/sports/pool/totals.ts';
import { poolStats as POOL_SCHEMA } from '../src/sports/pool/stats.ts';
import { poolUndoLabel } from '../src/sports/pool/undo.ts';
import { snookerScript, billiardsScript, SINGLES_CTX } from './cue-script.mts';
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import { SNOOKER_META } from '../src/sports/snooker/meta.ts';
import { snookerFeed, makeUpText } from '../src/sports/snooker/feed.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import { snookerStatTotals, SNOOKER_SHOT_KEYS } from '../src/sports/snooker/totals.ts';
import { snookerStats as SNOOKER_SCHEMA } from '../src/sports/snooker/stats.ts';
import * as B from '../src/sports/billiards/engine.ts';
import * as BC from '../src/sports/billiards/controls.ts';
import { billiardsStatTotals, BILLIARDS_SHOT_KEYS, BILLIARDS_FOUL_KEY } from '../src/sports/billiards/totals.ts';
import { billiardsStats as BILLIARDS_SCHEMA } from '../src/sports/billiards/stats.ts';
import * as CR from '../src/sports/carrom/engine.ts';
import { carromFeed } from '../src/sports/carrom/feed.ts';
import * as CH from '../src/sports/chess/engine.ts';
import { CHESS_META } from '../src/sports/chess/meta.ts';
import { chessResultCredit } from '../src/sports/chess/stats.ts';
import { chessFeed } from '../src/sports/chess/gameFeed.ts';

type PS = M.PoolMatch;
type Side = 'home' | 'away';
const NAMES = { home: 'Asha', away: 'Ravi' };

/* ------------------------------------------------------------------ */
describe('R1 — old logs replay identically (fingerprints from before the batch)', () => {
  // recorded on commit 26510a4 (the code before batch 6), 100 seeded old-style logs per sport
  const OLD_PRINTS = { pool: '188697532675f706', snooker: '7a6a62d639166462', billiards: 'c182b76bfe1ff806', carrom: 'f20bde68301386d8', chess: 'dc30d7a55c4505cc' };
  test('pool, snooker, billiards, carrom, chess: the same states, new derived keys aside', () => {
    assert.deepEqual(allPrints(100), OLD_PRINTS);
  });
});

/* ------------------------------------------------------------------ */
function poolGame(config: Record<string, unknown>) {
  let s = M.poolInit(config);
  const log: ScoreAction[] = [];
  const tap = (a: ScoreAction) => { const n = M.poolReducer(s, a); assert.notEqual(n, s, JSON.stringify(a)); log.push(a); s = n; };
  return { get s() { return s; }, log, tap };
}
const both = (s: PS, k: string) => (M.sideCounts(s, 'home')[k] ?? 0) + (M.sideCounts(s, 'away')[k] ?? 0);

describe('PL — pool: ball in hand, push-outs, re-racks, not-called pots, extensions', () => {
  test('PL1 — ball in hand goes to the side that came to the table with it', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    // away at the table; away fouls → home with ball in hand
    g.tap(PC.foulAction(g.s, 'scratch'));
    assert.equal(M.sideCounts(g.s, 'home').ballInHand, 1);
    assert.equal(M.sideCounts(g.s, 'away').ballInHand ?? 0, 0);
    g.tap(PC.missAction(g.s));
    g.tap(PC.foulAction(g.s, 'jump'));
    assert.equal(M.sideCounts(g.s, 'home').ballInHand, 2);
    const row = poolCompare(g.s).find((c) => c.id === 'table')!.rows.find((r) => r.key === 'ballInHand')!;
    assert.equal(row.home, '2');
  });
  test('PL1 — push-out choices: played from there, or handed back (the chooser’s)', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    g.tap(PC.pushAction(g.s, {})); // away pushes; home chooses
    g.tap(PC.chooseAction(g.s, 'play'));
    assert.equal(M.sideCounts(g.s, 'home').pushPlayed, 1);
    assert.equal(both(g.s, 'pushPassed'), 0);
    const h = poolGame({ game: 'ten', raceTo: 3 });
    h.tap(PC.lagAction(h.s, 'away'));
    h.tap(PC.breakAction(h.s, { pots: [] })); // home to shoot
    h.tap(PC.pushAction(h.s, {})); // home pushes; away chooses
    h.tap(PC.chooseAction(h.s, 'pass'));
    assert.equal(M.sideCounts(h.s, 'away').pushPassed, 1);
    const rows = poolCompare(h.s).find((c) => c.id === 'table')!.rows.map((r) => r.key);
    assert.ok(rows.includes('pushPassed'));
  });
  test('PL1 — re-racks on a side’s break and pots not called', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    g.tap(PC.stalemateAction(g.s));
    assert.equal(M.sideCounts(g.s, 'home').rerackBreaks, 1, 'the stalemate re-racks home’s break');
    g.tap(PC.breakAction(g.s, { pots: [] }));
    const table = PC.liveRack(g.s)!.table;
    g.tap(PC.potAction(g.s, [table[0]], { called: false }));
    assert.equal(M.sideCounts(g.s, 'away').notCalled, 1);
    const rows = poolCompare(g.s).find((c) => c.id === 'table')!.rows.map((r) => r.key);
    for (const k of ['rerackBreaks', 'notCalled']) assert.ok(rows.includes(k), k);
  });
  test('PL2 — the score, the fouls and every older key are unchanged; doubles get side keys on both partners, never a guess', () => {
    const cfg = { game: 'nine', raceTo: 2, playersPerSide: 2 };
    const g = poolGame(cfg);
    g.tap(PC.lagAction(g.s, 'home', { pid: 'h1' }));
    g.tap(PC.breakAction(g.s, { pots: [] }, { pid: 'h1' }));
    g.tap(PC.foulAction(g.s, 'scratch', {}, { pid: 'a1' }));
    const ctx = { players: { home: [{ id: 'h1' }, { id: 'h2' }], away: [{ id: 'a1' }, { id: 'a2' }] } };
    const t = poolStatTotals(g.s, ctx as never);
    assert.equal(t.h1.stats.ballInHand, 1);
    assert.equal(t.h2.stats.ballInHand, 1, 'a side figure, like racks won');
    for (const k of M.SIDE_KEYS) assert.ok(POOL_TOTAL_KEYS.includes(k), k);
    assert.ok(POOL_TOTAL_KEYS.includes('notCalled'));
    for (const k of [...M.SIDE_KEYS, 'notCalled']) assert.equal(POOL_SCHEMA.stats.find((x) => x.key === k)?.coverage, 'keyed', k);
  });
  test('PL3 — hostile stored values for the new keys read clean', () => {
    const g = poolGame({ game: 'nine' });
    g.tap(PC.lagAction(g.s, 'home'));
    const bad = { ...g.s, cr: { ...g.s.cr, ss: [{ home: { ballInHand: -5, pushPlayed: 1e9 + 0.5, notCalled: '7', extensions: 2, fouls: 2 }, away: {} }] } };
    const c = M.sideCounts(bad, 'home');
    assert.equal(c.ballInHand, undefined);
    assert.equal(c.pushPlayed, undefined);
    assert.equal(c.notCalled, undefined);
    assert.equal(c.extensions, 2);
  });
  test('PL4 — the shot-clock extension: tracked by the organiser, one per player per rack, on Stats and in the commentary', () => {
    const g = poolGame({ game: 'nine', raceTo: 3, trackShotClock: true });
    g.tap(PC.lagAction(g.s, 'home'));
    // not during the break
    assert.equal(M.poolReducer(g.s, PC.extensionAction(g.s)!), g.s);
    g.tap(PC.breakAction(g.s, { pots: [] }));
    assert.ok(PC.extensionReady(g.s));
    g.tap(PC.extensionAction(g.s)!);
    assert.equal(M.sideCounts(g.s, 'away').extensions, 1);
    assert.equal(PC.extensionReady(g.s), false, 'one per rack');
    assert.equal(M.poolReducer(g.s, PC.extensionAction(g.s)!), g.s, 'a repeated tap changes nothing');
    const score = { ...g.s.current };
    g.tap(PC.missAction(g.s));
    assert.ok(PC.extensionReady(g.s), 'home has its own');
    g.tap(PC.extensionAction(g.s)!);
    assert.deepEqual(g.s.current, score);
    const texts = poolFeed(g.s, NAMES).flatMap((x) => x.items.map((i) => i.text));
    assert.ok(texts.some((t) => /Ravi takes the shot-clock extension/.test(t)), texts.join('\n'));
    assert.equal(poolCompare(g.s).find((c) => c.id === 'table')!.rows.find((r) => r.key === 'extensions')!.home, '1');
    // undo names it
    const prev = M.poolReplay({ game: 'nine', raceTo: 3, trackShotClock: true }, g.log.slice(0, -1));
    assert.equal(poolUndoLabel({ type: 'EXTENSION', prev, next: g.s }), 'shot-clock extension');
  });
  test('PL5 — not tracked, a pending choice, the wrong side, a stale rack, junk: ignored', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    assert.equal(PC.extensionReady(g.s), false);
    assert.equal(M.poolReducer(g.s, { type: 'EXTENSION', side: 'away', payload: { rack: 1 } }), g.s, 'not tracked');
    const t = poolGame({ game: 'nine', raceTo: 3, trackShotClock: true });
    t.tap(PC.lagAction(t.s, 'home'));
    t.tap(PC.breakAction(t.s, { pots: [] }));
    for (const a of [
      { type: 'EXTENSION', side: 'home', payload: { rack: 1 } }, // not at the table
      { type: 'EXTENSION', side: 'away', payload: { rack: 2 } }, // another rack
      { type: 'EXTENSION', side: 'away', payload: {} }, // no rack stamp
      { type: 'EXTENSION', side: '__proto__', payload: { rack: 1 } },
      { type: 'EXTENSION', payload: { rack: 1 } },
    ]) assert.equal(M.poolReducer(t.s, a as ScoreAction), t.s, JSON.stringify(a));
    t.tap(PC.pushAction(t.s, {}));
    assert.equal(PC.extensionReady(t.s), false, 'a choice is waiting');
    // Info: the switch is a capture (Stats to track), off by default
    const cap = matchCaptures(undefined, null, POOL_META.formatFields!, {}).captures.find((c) => c.key === 'trackShotClock');
    assert.ok(cap && cap.on === false);
  });
});

/* ------------------------------------------------------------------ */
describe('SN — snooker: break make-up, total clearance, long pots / rest', () => {
  test('SN1 — the visit keeps its make-up; the commentary says it', () => {
    const m = snookerScript({ reds: 6 });
    m.pot('red', 'black', 'red', 'pink', 'red', 'black').miss();
    const v = m.state.frame!.visits[0];
    assert.deepEqual(v.mk, { red: 3, black: 2, pink: 1 });
    assert.equal(makeUpText(v.mk), '3 reds, 1 pink, 2 blacks');
    const texts = snookerFeed(m.state, NAMES).flatMap((g) => g.items.map((i) => i.text));
    assert.ok(texts.includes('Asha — break of 23 (3 reds, 1 pink, 2 blacks), then missed a pot'), texts.join('\n'));
    // the visit in play too
    m.pot('red', 'black');
    const now = snookerFeed(m.state, NAMES).flatMap((g) => g.items.map((i) => i.text));
    assert.ok(now.includes('Ravi at the table — break of 8 so far (1 red, 1 black)'), now.join('\n'));
  });
  test('SN2 — a total clearance: every red and every colour in one visit', () => {
    const m = snookerScript({ reds: 6, bestOf: 3 });
    m.clearance();
    const f = m.state.frames[0];
    const v = f.visits![f.visits!.length - 1];
    assert.equal(v.tc, 1);
    assert.equal(S.snookerStats(m.state).home.totalClearances, 1);
    // a frame won without clearing from the first red is not one
    const n = snookerScript({ reds: 6, bestOf: 3 });
    n.pot('red', 'black').miss().clearance();
    assert.equal(S.snookerStats(n.state).away.totalClearances, 0);
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    assert.equal(t.h1.stats.totalClearances, 1);
    assert.ok((SNOOKER_SHOT_KEYS as readonly string[]).includes('totalClearances'));
    assert.equal(SNOOKER_SCHEMA.stats.find((x) => x.key === 'totalClearances')?.coverage, 'keyed');
    const row = snookerMatchStats(m.state).find((c) => c.id === 'breaks')!.rows.find((r) => r.key === 'totalClearances');
    assert.ok(row);
  });
  test('SN3 — the make-up adds up to the pots (a free ball counts as "free"); a hostile one reads clean', () => {
    const m = snookerScript({ reds: 15 });
    m.reds(2).pot('black').foul({ freeBall: true }).pot('free', 'black');
    const v = m.state.frame!.visit;
    assert.deepEqual(v.mk, { free: 1, black: 1 });
    const fr = m.state.frame!;
    const bad = { ...m.state, frame: { ...fr, visits: [{ ...fr.visits[0], mk: { red: -1, black: 'x', __proto__: 5, purple: 3, pink: 1.5 } }, ...fr.visits.slice(1)] } } as S.SnookerState;
    assert.equal(makeUpText((bad.frame!.visits[0] as { mk?: unknown }).mk as never), '');
    assert.doesNotThrow(() => snookerFeed(bad, NAMES));
  });
  test('SN4 — long pots and rest shots, only when tracked; on Stats, in careers, Info', () => {
    const m = snookerScript({ reds: 15, trackLongRest: true });
    m.tap(SC.potAction(m.state, 'red', { long: true })!);
    m.tap(SC.potAction(m.state, 'black', { rest: true })!);
    m.tap(SC.missAction(m.state, { long: true })!);
    m.tap(SC.potAction(m.state, 'red', { long: true, rest: true })!);
    const st = S.snookerStats(m.state);
    assert.equal(st.home.longPots, 1);
    assert.equal(st.home.longAttempts, 2);
    assert.equal(st.home.restShots, 1);
    assert.equal(st.away.longPots, 1);
    assert.equal(st.away.restShots, 1);
    const rows = snookerMatchStats(m.state).find((c) => c.id === 'potting')!.rows;
    assert.equal(rows.find((r) => r.key === 'longPots')!.home, '1/2 (50%)');
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    assert.equal(t.h1.stats.longPots, 1);
    assert.equal(t.h1.stats.longAttempts, 2);
    assert.equal(t.h1.stats.restShots, 1);
    // not tracked: no rows, no keys (never a false 0)
    const q = snookerScript({ reds: 15 });
    q.pot('red').miss();
    assert.equal(snookerStatTotals(q.state, SINGLES_CTX as never).h1.stats.longPots, undefined);
    assert.ok(!snookerMatchStats(q.state).find((c) => c.id === 'potting')!.rows.some((r) => r.key === 'longPots'));
    const cap = matchCaptures(undefined, null, SNOOKER_META.formatFields!, { trackLongRest: true }).captures.find((c) => c.key === 'trackLongRest');
    assert.ok(cap && cap.on);
  });
  test('SN5 — the flags are ignored untracked, as junk, or on a foul; the score is unchanged', () => {
    const plain = snookerScript({ reds: 15 });
    const raw = { type: 'POT', side: 'home', payload: { ball: 'red', long: true, rest: true, frame: 1 } } as ScoreAction;
    const n = S.reducer(plain.state, raw as never);
    assert.equal(n.frame!.visit.lp, undefined);
    assert.equal(n.frame!.score.home, 1);
    const tr = snookerScript({ reds: 15, trackLongRest: true });
    const junk = S.reducer(tr.state, { type: 'POT', side: 'home', payload: { ball: 'red', long: 'yes', rest: 1, frame: 1 } } as never);
    assert.equal(junk.frame!.visit.lp, undefined);
    assert.equal(junk.frame!.visit.rs, undefined);
    const f = S.reducer(tr.state, { type: 'FOUL', side: 'home', payload: { value: 4, long: true, frame: 1 } } as never);
    assert.equal(f.frame!.visits[0].lm, undefined);
  });
});

/* ------------------------------------------------------------------ */
describe('BI — billiards: red to the centre spot, foul kinds in careers', () => {
  test('BI1 — after the red goes in twice running from the billiard spot, the hint says centre spot', () => {
    const m = billiardsScript({ target: 300 });
    m.stroke({ potRed: true }, 2);
    assert.equal(B.redToCentre(m.state), false);
    m.stroke({ potRed: true });
    assert.equal(B.redToCentre(m.state), true, 'the 2nd and 3rd pots were from the spot');
    const p = BC.billiardsPanel(m.state)!;
    assert.ok(BC.limitWarnings(p).some((w) => /centre spot/.test(w)), BC.limitWarnings(p).join('\n'));
    m.stroke({ potRed: true });
    assert.equal(B.redToCentre(m.state), false, 'from the centre spot it goes back to the billiard spot');
    m.stroke({ potRed: true }, 2);
    assert.equal(B.redToCentre(m.state), true);
  });
  test('BI2 — a stroke without the red, or a new visit, resets it; the score is unchanged; a snapshot never throws', () => {
    const m = billiardsScript({ target: 300 });
    m.stroke({ potRed: true }, 2).stroke({ cannon: true }).stroke({ potRed: true });
    assert.equal(B.redToCentre(m.state), false);
    m.stroke({ potRed: true }, 2).miss();
    assert.equal(B.redToCentre(m.state), false);
    assert.equal(m.state.frame!.score.home, 3 * 5 + 2);
    assert.equal(B.redToCentre({ frame: { redRun: '3' } } as never), false);
    assert.equal(B.redToCentre(null as never), false);
  });
  test('BI3 — foul kinds reach careers as keyed keys', () => {
    const m = billiardsScript({ target: 200 });
    m.foul('push').foul('push').foul('coup');
    const t = billiardsStatTotals(m.state, SINGLES_CTX as never);
    const sum = (k: string) => (t.h1.stats[k] ?? 0) + (t.a1.stats[k] ?? 0);
    assert.equal(sum('foulPush'), 2);
    assert.equal(sum('foulCoup'), 1);
    assert.equal(t.h1.stats.foulJump, 0, 'tracked: 0, not missing');
    for (const k of B.FOUL_KINDS) {
      const key = BILLIARDS_FOUL_KEY[k];
      assert.ok((BILLIARDS_SHOT_KEYS as readonly string[]).includes(key), key);
      assert.equal(BILLIARDS_SCHEMA.stats.find((x) => x.key === key)?.coverage, 'keyed', key);
    }
  });
  test('BI4 — a quick game writes no kind keys; an unknown kind counts as a foul only', () => {
    const q = billiardsScript({ target: 100, bestOf: 3 });
    q.quick(100, 40);
    assert.equal(billiardsStatTotals(q.state, SINGLES_CTX as never).h1.stats.foulPush, undefined);
    const m = billiardsScript({ target: 200 });
    m.foul('push');
    const fr = m.state.frame!;
    const bad = { ...m.state, frame: { ...fr, fouls: [...fr.fouls, { by: 'home', value: 2, kind: 'constructor' }] } } as B.BilliardsState;
    const t = billiardsStatTotals(bad, SINGLES_CTX as never);
    const kinds = Object.values(BILLIARDS_FOUL_KEY).reduce((a, k) => a + (t.h1.stats[k] ?? 0) + (t.a1.stats[k] ?? 0), 0);
    assert.equal(kinds, 1);
    assert.equal(t.h1.stats.fouls + t.a1.stats.fouls, 2);
  });
});

/* ------------------------------------------------------------------ */
describe('CA — carrom: a board or a game conceded / awarded', () => {
  const board = (s: CR.CarromState, side: Side, payload: Record<string, unknown>) => CR.reducer(s, { type: 'BOARD', side, payload });
  test('CA1 — an awarded board keeps its reason, scores as recorded, and the commentary says why', () => {
    let s = CR.init({});
    s = board(s, 'home', { coins: 5, queenBy: 'none', award: 'conduct' });
    assert.equal(s.boards[0].award, 'conduct');
    assert.equal(s.current.home, 5);
    const texts = carromFeed(s, NAMES).flatMap((g) => g.items.map((i) => i.text));
    assert.ok(texts.some((t) => /awarded: conduct/.test(t)), texts.join('\n'));
    // through a correction
    assert.equal(CR.replayBoards(s, CR.boardInputs(s)).boards[0].award, 'conduct');
  });
  test('CA2 — an awarded game: recorded at the target, the next game starts; the commentary says so', () => {
    let s = CR.init({ gamesToWin: 2 });
    s = board(s, 'away', { coins: 4, queenBy: 'none' });
    const a = CR.awardGameAction(s, 'home', 'forfeit');
    s = CR.reducer(s, a);
    assert.deepEqual(s.games, [[25, 4]]);
    assert.deepEqual(s.gamesWon, { home: 1, away: 0 });
    assert.deepEqual(s.current, { home: 0, away: 0 });
    assert.deepEqual(s.gameAwards, [{ game: 1, winner: 'home', boards: 1, reason: 'forfeit' }]);
    const texts = carromFeed(s, NAMES).flatMap((g) => g.items.map((i) => i.text));
    assert.ok(texts.some((t) => /Game 1 awarded to Asha \(forfeit\)/.test(t)), texts.join('\n'));
    // the same tap again can't end game 2
    assert.equal(CR.reducer(s, a), s);
  });
  test('CA3 — reasons whitelisted; no stamp, a stale game, a bad side, an ended match: ignored; a correction keeps the award', () => {
    let s = CR.init({ gamesToWin: 2 });
    s = board(s, 'home', { coins: 3, queenBy: 'none', award: '<script>' });
    assert.equal(s.boards[0].award, undefined);
    const p = board(s, 'away', { penalty: true, award: 'conduct' });
    assert.equal(p.boards[1].award, undefined, 'a penalty board is its own kind');
    for (const a of [
      { type: 'AWARD_GAME', side: 'home', payload: {} },
      { type: 'AWARD_GAME', side: 'home', payload: { game: 2 } },
      { type: 'AWARD_GAME', side: '__proto__', payload: { game: 1 } },
      { type: 'AWARD_GAME', side: 'home', payload: { game: '1' } },
    ]) assert.equal(CR.reducer(s, a as never), s, JSON.stringify(a));
    const r = CR.reducer(s, { type: 'AWARD_GAME', side: 'home', payload: { game: 1, reason: { x: 1 } } } as never);
    assert.deepEqual(r.gameAwards, [{ game: 1, winner: 'home', boards: 1 }]);
    // a correction of the boards keeps the awarded game
    const fixed = CR.replayBoards(r, CR.boardInputs(r));
    assert.deepEqual(fixed.games, r.games);
    assert.deepEqual(fixed.gameAwards, r.gameAwards);
    let e = CR.init({ gamesToWin: 1 });
    e = CR.reducer(e, CR.awardGameAction(e, 'away', 'conduct'));
    assert.equal(e.ended, true);
    assert.equal(CR.reducer(e, { type: 'BOARD', side: 'home', payload: { coins: 3 } }), e);
    assert.equal(CR.reducer(e, { type: 'AWARD_GAME', side: 'home', payload: { game: 2 } } as never), e);
  });
  test('CA4 — an awarded board may end with the Queen not covered, even under ICF', () => {
    const s = CR.init({ preset: 'icf' });
    assert.deepEqual(CR.queenChoices(s), ['winner', 'loser']);
    assert.deepEqual(CR.queenChoices(s, true), ['winner', 'loser', 'none']);
    assert.equal(CR.boardReady(s, { penalty: false, coins: 4, queenBy: 'none' }), false);
    assert.equal(CR.boardReady(s, { penalty: false, coins: 4, queenBy: 'none', award: true }), true);
  });
});

/* ------------------------------------------------------------------ */
describe('CH — chess: arbiter events, ½-0, a second period', () => {
  test('CH1 — an illegal-move warning adds time to the opponent (2 min; blitz 1 min); a draw offer is kept', () => {
    let s = CH.init({ timeControl: 'rapid' });
    s = CH.reducer(s, CH.arbiterAction(s, 'illegal', 'home', 1000)!);
    s = CH.reducer(s, CH.arbiterAction(s, 'drawOffer', 'away')!);
    assert.deepEqual(s.events, [{ k: 'illegal', s: 'home', t: 120, at: 1000 }, { k: 'drawOffer', s: 'away' }]);
    let b = CH.init({ timeControl: 'blitz' });
    b = CH.reducer(b, CH.arbiterAction(b, 'illegal', 'away')!);
    assert.equal(b.events![0].t, 60);
    // the commentary lists them; points unchanged
    assert.deepEqual(CH.points(s), { home: 0, away: 0 });
    const texts = chessFeed(s, NAMES).flatMap((g) => g.items.map((i) => i.text));
    assert.ok(texts.some((t) => /Illegal move by Asha: 2 minutes added for Ravi/.test(t)), texts.join('\n'));
    assert.ok(texts.some((t) => /Ravi offered a draw/.test(t)), texts.join('\n'));
  });
  test('CH2 — the second illegal move by the same player pre-selects the loss', () => {
    let s = CH.init({});
    s = CH.reducer(s, CH.arbiterAction(s, 'illegal', 'home')!);
    assert.equal(CH.arbiterPreset(s), null);
    s = CH.reducer(s, CH.arbiterAction(s, 'illegal', 'away')!);
    assert.equal(CH.arbiterPreset(s), null);
    s = CH.reducer(s, CH.arbiterAction(s, 'illegal', 'home')!);
    assert.deepEqual(CH.arbiterPreset(s), { winner: 'away', method: 'illegal-move' });
  });
  test('CH3 — events are clean and bounded; none after the result; old RESULTs replay as before', () => {
    let s = CH.init({});
    for (const p of [{ kind: 'x', side: 'home' }, { kind: 'illegal', side: '__proto__' }, { kind: 'illegal' }, { kind: 'drawOffer', side: 'home', secs: -5 }]) {
      const n = CH.reducer(s, { type: 'ARBITER', payload: p } as never);
      if (p.kind === 'drawOffer') { assert.deepEqual(n.events, [{ k: 'drawOffer', s: 'home' }]); continue; }
      assert.equal(n, s, JSON.stringify(p));
    }
    for (let i = 0; i < 200; i++) s = CH.reducer(s, { type: 'ARBITER', payload: { kind: 'drawOffer', side: i % 2 ? 'home' : 'away' } } as never);
    assert.equal(s.events!.length, CH.MAX_EVENTS);
    const done = CH.reducer(s, { type: 'RESULT', payload: { winner: 'draw', method: 'agreement' } } as never);
    assert.equal(CH.reducer(done, { type: 'ARBITER', payload: { kind: 'drawOffer', side: 'home' } } as never), done);
    // secs: a whole number 0–600 is used
    const t = CH.reducer(CH.init({}), { type: 'ARBITER', payload: { kind: 'illegal', side: 'home', secs: 90 } } as never);
    assert.equal(t.events![0].t, 90);
  });
  test('CH4 — ½-0 and 0-½: the points, the result string and the credits agree', () => {
    let s = CH.init({ white: 'home' });
    s = CH.reducer(s, { type: 'RESULT', side: 'home', payload: { winner: 'home', method: 'arbiter', uneven: true } } as never);
    assert.equal(s.uneven, true);
    assert.deepEqual(CH.points(s), { home: 0.5, away: 0 });
    assert.equal(CH.resultString(s), '½-0');
    assert.equal(CH.scoreFor('away', 'home', 'arbiter', true), '0-½');
    assert.deepEqual(chessResultCredit('home', { id: 'w' }, 'home', 'arbiter', false, true)!.extra, { draws: 1, drawsOther: 1 });
    assert.deepEqual(chessResultCredit('away', { id: 'b' }, 'home', 'arbiter', false, true)!.extra, { losses: 1, lossesOther: 1 });
    assert.match(CH.resultSentence('home', 'home', 'Asha', 'Ravi', 'arbiter', true), /^½-0: /);
  });
  test('CH5 — an uneven score only with the arbiter / adjudication, never a draw or a knockout game', () => {
    const base = CH.init({});
    for (const p of [{ winner: 'home', method: 'resignation', uneven: true }, { winner: 'draw', method: 'arbiter', uneven: true }, { winner: 'home', uneven: true }]) {
      const n = CH.reducer(base, { type: 'RESULT', payload: p } as never);
      assert.equal(n.uneven, undefined, JSON.stringify(p));
    }
    const junk = CH.reducer(base, { type: 'RESULT', payload: { winner: 'home', method: 'adjudication', uneven: 'yes' } } as never);
    assert.equal(junk.uneven, undefined);
    assert.deepEqual(CH.points(junk), { home: 1, away: 0 });
    const ko = CH.reducer(CH.init({ koGames: 2 }), { type: 'RESULT', payload: { winner: 'home', method: 'arbiter', uneven: true, ko: { games: 2 } } } as never);
    assert.equal(ko.uneven, undefined);
    assert.equal(ko.ko!.games[0].uneven, undefined);
  });
  test('CH6 — a second time-control period and a delay: kept, shown on Info and the scoreboard', () => {
    const cfg = { timeControl: 'classical', tcBase: 90, tcInc: 30, tcMoves: 40, tcBase2: 30, tcDelay: 0 };
    const s = CH.init(cfg);
    assert.deepEqual(s.tc2, { moves: 40, base2: 30 });
    assert.equal(CH.timeControlText(s), '90+30 · +30 min after move 40');
    const d = CH.init({ tcBase: 5, tcDelay: 3 });
    assert.equal(CH.timeControlText(d), '5+0 · 3 s delay');
    assert.equal(CH.init({}).tc2, undefined, 'an older format: unchanged');
    const rules = matchRules(CHESS_META.formatFields!, cfg).map((r) => r.key);
    for (const k of ['tcMoves', 'tcBase2', 'tcDelay']) assert.ok(rules.includes(k), k);
    assert.ok(!matchRules(CHESS_META.formatFields!, {}).some((r) => r.key === 'tcBase2'), 'no second period: hidden');
    // hostile values clamp or drop
    assert.equal(CH.init({ tcMoves: -4, tcBase2: 'x', tcDelay: 1e9 }).tc2?.delay, 600);
  });
});
