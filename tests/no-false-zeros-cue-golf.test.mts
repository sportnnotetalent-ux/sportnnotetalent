/**
 * Wave 1 (docs/sport-expert/defaults-on/PLAN.md) — no false zeros in snooker,
 * carrom and golf: a stat counts as tracked only once at least one event of
 * that kind was captured in the match (snooker, carrom) or on the card (golf).
 * docs/security/breaks/no-false-zeros-cue-golf.md (NZG1–NZG11)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreAction } from '../src/sports/types.ts';
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import { snookerStatTotals, snookerLongRestCaptured } from '../src/sports/snooker/totals.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromStatTotals, CARROM_FOUL_KEYS, CARROM_QMISS_KEYS } from '../src/sports/carrom/totals.ts';
import { carromMatchStats } from '../src/sports/carrom/matchStats.ts';
import { standardPar72, roundStats, upAndDown, chipIn, penaltyStrokes, type GolfCard, type GolfTrackKey } from '../src/sports/golf/engine.ts';
import { snookerScript, SINGLES_CTX } from './cue-script.mts';

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];

// a seeded random (mulberry32) so the simulation is repeatable
let seed = 0x5eed2026;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = (n: number) => Math.floor(rand() * n);

/* ------------------------------- snooker -------------------------------- */
const LR_KEYS = ['longPots', 'longAttempts', 'restShots'];
const potRows = (s: S.SnookerState, frame?: number) => snookerMatchStats(s, frame).find((c) => c.id === 'potting')?.rows ?? [];

describe('NZG1/NZG2 · snooker long pots and rest shots: tracked means tagged', () => {
  test('NZG1 — switched on, nothing tagged: no career keys, no Stats rows', () => {
    const m = snookerScript({ reds: 15, trackLongRest: true });
    m.pot('red', 'black').miss().pot('red').safety();
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    for (const e of Object.values(t)) for (const k of LR_KEYS) assert.equal(e.stats[k], undefined, k);
    const rows = potRows(m.state);
    assert.ok(!rows.some((r) => r.key === 'longPots' || r.key === 'restShots'), 'no long / rest rows');
    assert.deepEqual(snookerLongRestCaptured(m.state), { long: false, rest: false });
  });
  test('NZG2 — a long tag but no rest tag: long keys for both players, no rest key', () => {
    const m = snookerScript({ reds: 15, trackLongRest: true });
    m.tap(SC.potAction(m.state, 'red', { long: true })!);
    m.pot('black').miss().pot('red').miss();
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    assert.equal(t.h1.stats.longPots, 1);
    assert.equal(t.h1.stats.longAttempts, 1);
    assert.equal(t.a1.stats.longAttempts, 0, 'the opponent: a real 0 once the match tags long pots');
    for (const e of Object.values(t)) assert.equal(e.stats.restShots, undefined);
    const rows = potRows(m.state);
    assert.ok(rows.some((r) => r.key === 'longPots'));
    assert.ok(!rows.some((r) => r.key === 'restShots'));
  });
  test('NZG2 — a rest tag but no long tag: rest key only', () => {
    const m = snookerScript({ reds: 15, trackLongRest: true });
    m.tap(SC.potAction(m.state, 'red', { rest: true })!);
    const t = snookerStatTotals(m.state, SINGLES_CTX as never);
    assert.equal(t.h1.stats.restShots, 1);
    assert.equal(t.a1.stats.restShots, 0);
    for (const e of Object.values(t)) { assert.equal(e.stats.longPots, undefined); assert.equal(e.stats.longAttempts, undefined); }
    const rows = potRows(m.state);
    assert.ok(rows.some((r) => r.key === 'restShots'));
    assert.ok(!rows.some((r) => r.key === 'longPots'));
  });
  test('a frame view follows the match: tagged in frame 1, the frame-2 view still has the rows', () => {
    const m = snookerScript({ reds: 6, bestOf: 3, trackLongRest: true });
    m.tap(SC.potAction(m.state, 'red', { long: true, rest: true })!);
    m.concede('away');
    m.pot('red');
    const f2 = m.state.frame?.n ?? 2;
    const rows = potRows(m.state, f2);
    assert.ok(rows.some((r) => r.key === 'longPots') && rows.some((r) => r.key === 'restShots'));
  });
});

/* -------------------------------- carrom -------------------------------- */
const CTX = { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } };
const ALL_ON = { trackFouls: true, trackBreak: true, trackQueenMiss: true };
type Taps = { fouls?: Record<Side, Partial<Record<carrom.FoulType, number>>>; dues?: Record<Side, number>; qMiss?: Record<Side, number> };
const NONE = (): Record<Side, number> => ({ home: 0, away: 0 });
/** one board the way the screen records it: the detail from `boardDetail` */
function board(s: carrom.CarromState, side: Side, coins: number, taps: Taps = {}): carrom.CarromState {
  const det = carrom.boardDetail(s, {
    doubles: false, breakerKnown: false, brk: null,
    fouls: taps.fouls ?? { home: {}, away: {} }, dues: taps.dues ?? NONE(), qMiss: taps.qMiss ?? NONE(), whoLog: { home: {}, away: {} },
  });
  return carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen: false, ...(det ? { det } : {}) }, attribution: { playerId: `${side[0]}1`, points: 1 } } as never);
}
const statsKeys = (s: carrom.CarromState) => Object.values(carromStatTotals(s, CTX as never)).map((e) => e.stats);
const rowKeys = (s: carrom.CarromState) => carromMatchStats(s).flatMap((c) => c.rows.map((r) => r.key));

describe('NZG3/NZG6 · carrom: the foul log and missed covers start with the first tap', () => {
  test('NZG3 — fouls on, nothing tapped: no foul log saved, nothing shown, nothing written', () => {
    let s = carrom.init(ALL_ON);
    s = board(s, 'home', 5); s = board(s, 'away', 3); s = board(s, 'home', 2);
    assert.ok(s.boards.every((b) => !b.det?.fouls), 'no all-zero foul log on a board');
    for (const st of statsKeys(s)) for (const k of CARROM_FOUL_KEYS) assert.equal(st[k], undefined, k);
    assert.ok(!rowKeys(s).includes('fouls') && !rowKeys(s).includes('dues'));
  });
  test('NZG3 — from the first tapped foul on, an untapped board is a real 0', () => {
    let s = carrom.init(ALL_ON);
    s = board(s, 'home', 5);
    s = board(s, 'away', 3, { fouls: { home: { thumb: 1 }, away: {} } });
    s = board(s, 'home', 2);
    assert.equal(s.boards[0].det?.fouls, undefined, 'the board before the first tap: not tracked');
    assert.ok(s.boards[1].det?.fouls && s.boards[2].det?.fouls, 'the tapped board and every board after it');
    const [h, a] = statsKeys(s);
    assert.equal(h.fouls, 1); assert.equal(h.foulBoards, 2);
    assert.equal(a.fouls, 0, 'the other side: a real 0');
    assert.ok(rowKeys(s).includes('fouls'));
  });
  test('NZG3 — a due alone starts the foul log', () => {
    let s = carrom.init(ALL_ON);
    s = board(s, 'home', 5, { dues: { home: 0, away: 1 } });
    assert.ok(s.boards[0].det?.fouls);
    assert.equal(statsKeys(s)[1].dues, 1);
  });
  test('NZG6 — missed covers: nothing tapped, nothing saved / shown / written', () => {
    let s = carrom.init(ALL_ON);
    s = board(s, 'home', 5); s = board(s, 'away', 3);
    assert.ok(s.boards.every((b) => !b.det?.qMiss));
    for (const st of statsKeys(s)) for (const k of CARROM_QMISS_KEYS) assert.equal(st[k], undefined, k);
    assert.ok(!rowKeys(s).includes('qmiss'));
  });
  test('NZG6 — the first missed cover starts it', () => {
    let s = carrom.init(ALL_ON);
    s = board(s, 'home', 5);
    s = board(s, 'away', 3, { qMiss: { home: 1, away: 0 } });
    s = board(s, 'home', 4);
    assert.equal(s.boards[0].det?.qMiss, undefined);
    assert.ok(s.boards[1].det?.qMiss && s.boards[2].det?.qMiss);
    const [h, a] = statsKeys(s);
    assert.equal(h.queenMisses, 1); assert.equal(h.qMissBoards, 2); assert.equal(a.queenMisses, 0);
    assert.ok(rowKeys(s).includes('qmiss'));
  });
  test('tracking off: the taps are not saved at all', () => {
    let s = carrom.init({});
    s = board(s, 'home', 5, { fouls: { home: { thumb: 1 }, away: {} }, qMiss: { home: 1, away: 0 } });
    assert.equal(s.boards[0].det, undefined);
  });
});

describe('NZG4 · carrom: old matches saved with all-zero logs read as not tracked', () => {
  const old = (det: carrom.BoardDetail) => [['home', 5], ['away', 3], ['home', 7]].reduce(
    (s, [side, coins]) => carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen: false, det }, attribution: { playerId: `${String(side)[0]}1`, points: 1 } } as never),
    carrom.init(ALL_ON));
  test('every board zero: no foul / missed-cover keys or rows', () => {
    const s = old({ fouls: { home: {}, away: {} }, dues: { home: 0, away: 0 }, qMiss: { home: 0, away: 0 } });
    assert.ok(s.boards.every((b) => b.det?.fouls && b.det?.qMiss), 'the old shape is kept as saved');
    for (const st of statsKeys(s)) for (const k of [...CARROM_FOUL_KEYS, ...CARROM_QMISS_KEYS]) assert.equal(st[k], undefined, k);
    const keys = rowKeys(s);
    for (const k of ['fouls', 'dues', 'qmiss']) assert.ok(!keys.includes(k), k);
  });
  test('an old match with a real foul reads exactly as before (every board counted)', () => {
    const s = old({ fouls: { home: { touch: 1 }, away: {} }, qMiss: { away: 2 } });
    const [h, a] = statsKeys(s);
    assert.equal(h.fouls, 3); assert.equal(h.foulBoards, 3); assert.equal(a.fouls, 0);
    assert.equal(a.queenMisses, 6); assert.equal(a.qMissBoards, 3);
  });
  test('doubles: a player\'s own foul keys follow the same rule', () => {
    const D = { players: { home: [{ id: 'h1', name: 'H1' }, { id: 'h2', name: 'H2' }], away: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }] } };
    let s = carrom.init({ ...ALL_ON, playersPerSide: 2 });
    for (const side of SIDES) s = carrom.reducer(s, { type: 'BOARD', side, payload: { coins: 4, queen: false, det: { fouls: { home: {}, away: {} }, dues: {}, who: { home: {}, away: {} } } } } as never);
    for (const e of Object.values(carromStatTotals(s, D as never))) for (const k of CARROM_FOUL_KEYS) assert.equal(e.stats[k], undefined, k);
  });
});

describe('NZG5 · carrom fouls row wording', () => {
  test('the row says "tap each foul", not "none = no fouls"', () => {
    const tsx = src('src/sports/carrom/index.tsx');
    assert.ok(!/none = no fouls/.test(tsx));
    assert.match(tsx, /\(tap each foul\)/);
    assert.match(tsx, /boardDetail\(/, 'the screen builds the detail with the pure helper');
  });
});

describe('NZG11 · carrom: undo the board with the first foul', () => {
  test('the next board is judged again from the boards left', () => {
    let s = carrom.init(ALL_ON);
    s = board(s, 'home', 5, { fouls: { home: { thumb: 1 }, away: {} } });
    assert.ok(carrom.carromFoulsCaptured(s.boards));
    s = carrom.reducer(s, { type: 'EDIT_LOG', payload: { boards: [] } } as never);
    assert.equal(carrom.carromFoulsCaptured(s.boards), false);
    s = board(s, 'away', 3);
    assert.equal(s.boards[0].det?.fouls, undefined);
  });
});

/* --------------------------------- golf --------------------------------- */
const H = standardPar72();
const zeros = H.map(() => 0);
const card = (deltas: (number | null)[], extra: Partial<GolfCard> = {}): GolfCard =>
  ({ strokes: H.map((h, i) => (deltas[i] == null ? null : h.par + (deltas[i] as number))), ...extra });
const arr = <T,>(vals: Record<number, T>): (T | null)[] => H.map((_, i) => (i in vals ? vals[i] : null));
const PLAYED = H.map(() => 0);
const UD = ['udChances', 'upDowns', 'chipIns'];

describe('NZG7 · golf up and downs: written only once "Off green" was entered', () => {
  test('kept with upDown, never tapped: no up-and-down keys', () => {
    const s = roundStats(card(PLAYED, { track: ['putts', 'upDown'], putts: H.map(() => 2) }), H, zeros);
    for (const k of UD) assert.equal(k in s, false, k);
  });
  test('one Off-green entry: the keys, with real zeros elsewhere', () => {
    const s = roundStats(card(PLAYED, { track: ['putts', 'upDown'], putts: H.map(() => 2), offGreen: arr({ 2: 1 }) }), H, zeros);
    // 1 off green + 2 putts = 3 shots: a chance, not converted
    assert.deepEqual([s.udChances, s.upDowns, s.chipIns], [1, 0, 0]);
  });
});

describe('NZG8 · golf sand saves: written only once a bunker was tapped', () => {
  test('kept with bunker, never tapped: no sand keys', () => {
    const s = roundStats(card(PLAYED, { track: ['bunker'] }), H, zeros);
    assert.equal('sandSaves' in s, false);
    assert.equal('sandHoles' in s, false);
  });
  test('an SD-45 stats-row card without a bunker: no sand keys either', () => {
    const s = roundStats(card(PLAYED, { putts: H.map(() => 2) }), H, zeros);
    assert.equal('sandHoles' in s, false);
  });
  test('one bunker tapped: the keys as before', () => {
    const s = roundStats(card(PLAYED, { track: ['bunker'], bunker: arr({ 3: true }) }), H, zeros);
    assert.equal(s.sandHoles, 1);
    assert.equal(s.sandSaves, 1);
  });
});

describe('NZG9 · golf penalties: written only once a penalty stroke was entered', () => {
  test('a plain card (penalties not tracked): no penalties key', () => {
    assert.equal('penalties' in roundStats(card(PLAYED), H, zeros), false);
  });
  test('tracked, none entered: no penalties key', () => {
    assert.equal('penalties' in roundStats(card(PLAYED, { track: ['penalties'], penalties: H.map(() => null) }), H, zeros), false);
  });
  test('one entered: the sum, as before', () => {
    const s = roundStats(card(PLAYED, { track: ['penalties'], penalties: arr({ 4: 2 }) }), H, zeros);
    assert.equal(s.penalties, 2);
  });
});

/* ---------------------------- 600-user sim ------------------------------ */
describe('NZG10 · 600 users: no key for a kind with zero captures; captured figures unchanged', () => {
  test('200 snooker matches', () => {
    const seen = { tagged: 0, untagged: 0 };
    for (let m = 0; m < 200; m++) {
      const cfg = { reds: [15, 10, 6][rnd(3)], bestOf: 1 + 2 * rnd(2), trackLongRest: true };
      let s = S.createInitialState(cfg);
      const tap = (a: ScoreAction | null) => { if (!a) return; s = S.reducer(s, a as never); };
      const pLong = [0, 0.05, 0.3][rnd(3)], pRest = [0, 0.05, 0.3][rnd(3)];
      const tags = () => ({ ...(rand() < pLong ? { long: true } : {}), ...(rand() < pRest ? { rest: true } : {}) });
      for (let i = 0; i < 150 && s.frame && !s.ended; i++) {
        const p = SC.snookerPanel(s);
        if (!p) break;
        if (p.toss?.home) { tap(p.toss[SIDES[rnd(2)]]); continue; }
        if (p.respotLots?.home) { tap(p.respotLots[SIDES[rnd(2)]]); continue; }
        const pots = p.balls.filter((b) => b.action && b.ball !== 'free');
        const r = rnd(10);
        if (r < 7 && pots.length) tap(SC.potAction(s, pots[rnd(pots.length)].ball, tags()));
        else if (r < 9) tap(SC.missAction(s, tags()));
        else tap(p.safety);
      }
      const st = S.snookerStats(s);
      const long = st.home.longAttempts + st.away.longAttempts > 0;
      const rest = st.home.restShots + st.away.restShots > 0;
      if (long || rest) seen.tagged++; else seen.untagged++;
      const t = snookerStatTotals(s, SINGLES_CTX as never);
      const ids: Record<Side, string> = { home: 'h1', away: 'a1' };
      for (const sd of SIDES) {
        const rec = t[ids[sd]]?.stats;
        if (!rec || !('shotFrames' in rec)) continue;
        if (long) { assert.equal(rec.longPots, st[sd].longPots); assert.equal(rec.longAttempts, st[sd].longAttempts); }
        else { assert.equal(rec.longPots, undefined); assert.equal(rec.longAttempts, undefined); }
        if (rest) assert.equal(rec.restShots, st[sd].restShots); else assert.equal(rec.restShots, undefined);
      }
      const rows = potRows(s);
      assert.equal(rows.some((r) => r.key === 'longPots'), long && rows.length > 0);
      assert.equal(rows.some((r) => r.key === 'restShots'), rest && rows.length > 0);
    }
    assert.ok(seen.tagged > 50 && seen.untagged > 20, JSON.stringify(seen));
  });

  test('200 carrom matches', () => {
    const seen = { fouls: 0, noFouls: 0, qm: 0, noQm: 0 };
    for (let m = 0; m < 200; m++) {
      let s = carrom.init(ALL_ON);
      const pFoul = [0, 0.1, 0.5][rnd(3)], pQ = [0, 0.1, 0.4][rnd(3)];
      let foulsTapped = 0, duesTapped = 0, qTapped = 0, firstFoul = -1, firstQ = -1;
      const n = 3 + rnd(10);
      for (let b = 0; b < n && !s.ended; b++) {
        const taps: Taps = { fouls: { home: {}, away: {} }, dues: NONE(), qMiss: NONE() };
        if (rand() < pFoul) { const sd = SIDES[rnd(2)]; taps.fouls![sd] = { [carrom.FOUL_TYPES[rnd(carrom.FOUL_TYPES.length)]]: 1 + rnd(2) }; }
        if (rand() < pFoul / 2) taps.dues![SIDES[rnd(2)]] = 1;
        if (rand() < pQ) taps.qMiss![SIDES[rnd(2)]] = 1 + rnd(2);
        const fz = SIDES.reduce((t, sd) => t + Object.values(taps.fouls![sd]).reduce((x, y) => x + (y ?? 0), 0) + taps.dues![sd], 0);
        const qz = taps.qMiss!.home + taps.qMiss!.away;
        const before = s.boards.length;
        s = board(s, SIDES[rnd(2)], rnd(10), taps);
        if (s.boards.length === before) continue;
        if (fz && firstFoul < 0) firstFoul = before;
        if (qz && firstQ < 0) firstQ = before;
        foulsTapped += SIDES.reduce((t, sd) => t + Object.values(taps.fouls![sd]).reduce((x, y) => x + (y ?? 0), 0), 0);
        duesTapped += taps.dues!.home + taps.dues!.away;
        qTapped += qz;
      }
      const recs = statsKeys(s);
      const keys = rowKeys(s);
      if (foulsTapped + duesTapped === 0) {
        seen.noFouls++;
        for (const st of recs) for (const k of CARROM_FOUL_KEYS) assert.equal(st[k], undefined, `match ${m}: ${k}`);
        assert.ok(!keys.includes('fouls'), `match ${m}: fouls row`);
        assert.ok(s.boards.every((b) => !b.det?.fouls), `match ${m}: no saved foul log`);
      } else {
        seen.fouls++;
        assert.equal(recs.reduce((t, st) => t + (st.fouls ?? 0), 0), foulsTapped, `match ${m}: fouls unchanged`);
        assert.equal(recs.reduce((t, st) => t + (st.dues ?? 0), 0), duesTapped, `match ${m}: dues unchanged`);
        assert.equal(recs[0].foulBoards, s.boards.length - firstFoul, `match ${m}: tracked from the first tap`);
      }
      if (qTapped === 0) {
        seen.noQm++;
        for (const st of recs) for (const k of CARROM_QMISS_KEYS) assert.equal(st[k], undefined, `match ${m}: ${k}`);
        assert.ok(!keys.includes('qmiss'));
      } else {
        seen.qm++;
        assert.equal(recs.reduce((t, st) => t + (st.queenMisses ?? 0), 0), qTapped, `match ${m}: missed covers unchanged`);
        assert.equal(recs[0].qMissBoards, s.boards.length - firstQ);
      }
      // replay: the saved log rebuilds the same state
      const rep = carrom.reducer(carrom.init(ALL_ON), { type: 'EDIT_LOG', payload: { boards: s.boards.map((b) => ({ side: b.winner, coins: b.coins, queen: b.queen, ...(b.det ? { det: b.det } : {}) })) } } as never);
      assert.deepEqual(rep.boards.map((b) => b.det), s.boards.map((b) => b.det), `match ${m}: replay`);
    }
    assert.ok(seen.fouls > 50 && seen.noFouls > 20 && seen.qm > 50 && seen.noQm > 20, JSON.stringify(seen));
  });

  test('200 golf rounds', () => {
    const seen = { ud: 0, noUd: 0, sand: 0, noSand: 0, pen: 0, noPen: 0 };
    const KEYS: GolfTrackKey[] = ['putts', 'fairway', 'bunker', 'upDown', 'penalties', 'firstPutt'];
    for (let m = 0; m < 200; m++) {
      const track = KEYS.filter(() => rand() < 0.8);
      const thru = 1 + rnd(H.length);
      const p = [0, 0.05, 0.3][rnd(3)];
      const strokes = H.map((h, i) => (i < thru ? Math.max(1, h.par + rnd(4) - 1) : null));
      const putts = H.map((_, i) => (i < thru && track.includes('putts') && rand() < 0.9 ? rnd(4) : null));
      const offGreen = H.map((_, i) => (i < thru && track.includes('upDown') && rand() < p ? 1 + rnd(3) : null));
      const bunker = H.map((_, i) => (i < thru && track.includes('bunker') && rand() < p ? true : null));
      const penalties = H.map((_, i) => (i < thru && track.includes('penalties') && rand() < p ? 1 + rnd(2) : null));
      const c: GolfCard = { strokes, track, putts, offGreen, bunker, penalties };
      const s = roundStats(c, H, zeros);
      const where = `round ${m}`;
      // up and downs
      const udCaptured = track.includes('upDown') && offGreen.some((v) => typeof v === 'number');
      if (udCaptured) {
        seen.ud++;
        let ch = 0, ud = 0, ci = 0;
        H.forEach((_, i) => { if (typeof strokes[i] !== 'number') return; const u = upAndDown(offGreen[i], putts[i]); if (u != null) { ch++; if (u) ud++; } if (chipIn(offGreen[i], putts[i])) ci++; });
        assert.deepEqual([s.udChances, s.upDowns, s.chipIns], [ch, ud, ci], `${where}: up and downs unchanged`);
      } else { seen.noUd++; for (const k of UD) assert.equal(k in s, false, `${where}: ${k}`); }
      // sand
      const sandCaptured = track.includes('bunker') && bunker.some((v) => v === true);
      if (sandCaptured) {
        seen.sand++;
        let holes = 0, saves = 0;
        H.forEach((h, i) => { const st = strokes[i]; if (typeof st !== 'number' || bunker[i] !== true) return; holes++; const pp = putts[i]; if (typeof pp === 'number' ? pp <= 1 : st <= h.par) saves++; });
        assert.deepEqual([s.sandHoles, s.sandSaves], [holes, saves], `${where}: sand unchanged`);
      } else { seen.noSand++; assert.equal('sandHoles' in s, false, where); assert.equal('sandSaves' in s, false, where); }
      // penalties
      const penTotal = H.reduce((t, _, i) => t + (typeof penalties[i] === 'number' ? penaltyStrokes(penalties[i] as number, strokes[i]) : 0), 0);
      if (penalties.some((v) => typeof v === 'number' && v > 0)) { seen.pen++; assert.equal(s.penalties, penTotal, `${where}: penalties unchanged`); }
      else { seen.noPen++; assert.equal('penalties' in s, false, `${where}: penalties`); }
      for (const v of Object.values(s)) assert.ok(Number.isFinite(v), where);
    }
    assert.ok(Object.values(seen).every((v) => v > 15), JSON.stringify(seen));
  });
});
