/**
 * Deep wave — carrom: optional "Stats to track" (fouls by type + dues, coins on
 * the break, missed Queen covers), the board-by-board commentary, the match
 * stats panel, the tracked statTotals keys and the career rows.
 *
 * Covers: old logs replay with no new keys (identical), SET_TRACK / format
 * flags, payload sanitising, corrections keep the detail + time stamp, the
 * commentary sentences / running score / newest-first order, the panel's rows
 * only when tracked (never a false 0), singles-only foul credit, the statTotals
 * contract with the tracked keys, and the career sections.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertContract, toRecords, replay, type TotalsSport } from './statTotalsHarness.mts';
import * as L from './racketLogs.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromStatTotals, creditedPlayers, carromTrackedRecord, CARROM_DERIVED_KEYS, CARROM_FOUL_KEYS, CARROM_BRK_KEYS, CARROM_QMISS_KEYS } from '../src/sports/carrom/totals.ts';
import { carromFeed, foulText } from '../src/sports/carrom/feed.ts';
import { carromMatchStats, carromGames } from '../src/sports/carrom/matchStats.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

type Side = 'home' | 'away';
interface B { side: Side; coins: number; queen?: boolean; slam?: carrom.Slam; det?: carrom.BoardDetail; at?: number; penalty?: boolean }
const SINGLES = { home: ['h1'], away: ['a1'] };
const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const NAME = (id: string) => id.toUpperCase();
const DERIVED = [...CARROM_DERIVED_KEYS, 'boardBreaks', 'boardBreaksWon', 'lostQueens', ...CARROM_FOUL_KEYS, ...CARROM_BRK_KEYS, ...CARROM_QMISS_KEYS];
const sp = (players = SINGLES, config: Record<string, unknown> = {}, ctx: StatTotalsContext | undefined = L.ctxOf(players)): TotalsSport<carrom.CarromState> => ({
  name: 'carrom', init: carrom.init, reducer: carrom.reducer, statTotals: carromStatTotals, partial: true, derived: DERIVED, ctx,
  config: { playersPerSide: players.home.length, ...config },
});

/** The actions the controls dispatch (index.tsx `record`), with optional detail. */
function play(list: B[], players = SINGLES, config: Record<string, unknown> = {}, pre: ScoreAction[] = []): ScoreAction[] {
  let s = carrom.init({ playersPerSide: players.home.length, ...config });
  const out: ScoreAction[] = [...pre];
  for (const a of pre) s = carrom.reducer(s, a);
  for (const b of list) {
    const queen = !!b.queen;
    const credit = b.penalty ? Math.min(carrom.PENALTY_POINTS, s.target - s.current[b.side]) : carrom.creditPoints(b.coins, queen, s.current[b.side], s);
    const attr = (id: string) => ({ playerId: id, playerName: NAME(id), stat: 'points', by: credit, ...(b.penalty ? {} : { extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } }) });
    const who = creditedPlayers(players[b.side].map((id) => ({ id })), s.perSide ?? 1);
    const a: ScoreAction = {
      type: 'BOARD', side: b.side,
      payload: b.penalty ? { coins: 0, queen: false, penalty: true, ...(b.at ? { at: b.at } : {}) }
        : { coins: b.coins, queen, ...(b.slam ? { slam: b.slam } : {}), ...(b.det ? { det: b.det } : {}), ...(b.at ? { at: b.at } : {}) },
      attribution: who[0] ? attr(who[0].id) : undefined,
      ...(who[1] ? { attribution2: attr(who[1].id) } : {}),
    };
    out.push(a);
    s = carrom.reducer(s, a);
  }
  return out;
}
const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce((s, a) => carrom.reducer(s, a), carrom.init(config));
const T0 = Date.UTC(2026, 9, 22, 9, 0, 0);

describe('deep wave · carrom engine: tracking flags, detail, time stamps', () => {
  test('an old log replays with no new keys (identical state shape)', () => {
    const acts = play(L.CARROM_BOARDS.map(([side, coins, queen]) => ({ side, coins, queen })));
    const s = run(acts);
    assert.equal(s.track, undefined);
    assert.ok(s.boards.every((b) => b.det === undefined && b.at === undefined));
    assert.deepEqual(s.games, [[25, 18], [12, 25], [25, 20]]);
  });
  test('format flags → track; SET_TRACK changes it from the next board; all off removes it', () => {
    assert.deepEqual(carrom.init({ trackFouls: true }).track, { fouls: true });
    assert.equal(carrom.init({ trackFouls: false }).track, undefined);
    let s = carrom.init();
    s = carrom.reducer(s, { type: 'SET_TRACK', payload: { trackBreak: true, trackQueenMiss: true } });
    assert.deepEqual(s.track, { brk: true, qMiss: true });
    s = carrom.reducer(s, { type: 'SET_TRACK', payload: { trackBreak: false, trackQueenMiss: false } });
    assert.equal(s.track, undefined);
    assert.equal('track' in s, false);
  });
  test('the detail is sanitised: bad counts dropped, zero counts dropped, an empty foul log = tracked', () => {
    assert.deepEqual(carrom.readDetail({ fouls: { home: { striker: 2, touch: 0, bogus: 4 }, away: {} }, dues: { home: 1, away: -2 }, brk: 12, qMiss: { away: 1 } }),
      { fouls: { home: { striker: 2 } }, dues: { home: 1 }, brk: 9, qMiss: { away: 1 } });
    assert.deepEqual(carrom.readDetail({ fouls: {} }), { fouls: {} });
    assert.equal(carrom.readDetail({ junk: 1 }), undefined);
    assert.equal(carrom.readDetail(null), undefined);
  });
  test('BOARD stores the detail and the time; a correction (EDIT_LOG) keeps both', () => {
    const det: carrom.BoardDetail = { fouls: { away: { touch: 1 } }, brk: 2 };
    const s = run(play([{ side: 'home', coins: 4, queen: true, det, at: T0 }, { side: 'away', coins: 2, at: T0 + 60_000 }]));
    assert.deepEqual(s.boards[0].det, { fouls: { away: { touch: 1 } }, brk: 2 });
    assert.equal(s.boards[0].at, T0);
    const inputs = carrom.boardInputs(s);
    assert.deepEqual(inputs[0].det, det);
    const fixed = carrom.reducer(s, { type: 'EDIT_LOG', payload: { boards: inputs.map((b, i) => (i === 1 ? { ...b, coins: 3 } : b)) } });
    assert.deepEqual(fixed.boards[0].det, det);
    assert.equal(fixed.boards[1].at, T0 + 60_000);
    assert.equal(fixed.boards[1].coins, 3);
  });
});

describe('deep wave · carrom commentary', () => {
  const names = { home: 'Rahul', away: 'Priya' };
  test('board sentences, the running score, newest first, by game', () => {
    const s = run(play([
      { side: 'home', coins: 1, queen: true, at: T0 },
      { side: 'away', coins: 3, at: T0 + 1000 },
      { side: 'home', coins: 9, queen: true, slam: 'white', at: T0 + 2000 },
    ]), { gamesToWin: 1 });
    const feed = carromFeed(s, names);
    assert.equal(feed.length, 1);
    assert.equal(feed[0].title, 'Game 1');
    assert.match(feed[0].subtitle!, /in play · Rahul 16–3 Priya/);
    const [last, mid, first] = feed[0].items;
    assert.equal(first.text, 'Board 1 — Rahul clears with the Queen, +4 (1 coin left + Queen)');
    assert.equal(first.score, 'Rahul leads 4–0');
    assert.equal(first.at, T0);
    assert.equal(mid.text, 'Board 2 — Priya wins the board, +3 (3 coins left)');
    assert.equal(mid.score, 'Rahul leads 4–3');
    assert.match(last.text, /White slam!$/);
    assert.equal(last.big, true);
  });
  test('the game-winning board says so, and the match', () => {
    const s = run(play([{ side: 'home', coins: 9, queen: true }, { side: 'home', coins: 9, queen: true }, { side: 'home', coins: 1, queen: true }]), { gamesToWin: 1 });
    const top = carromFeed(s, names)[0].items[0];
    assert.equal(top.score, 'Rahul wins Game 1 25–0 and the match 1–0');
    assert.match(top.text, /no points at 22\+/);
  });
  test('penalty board, breaker, fouls, dues, missed covers in the detail line', () => {
    const pre: ScoreAction[] = [{ type: 'FIRST_BREAK', payload: { side: 'home' } }];
    const s = run(play([
      { side: 'away', coins: 5, det: { fouls: { home: { striker: 2, thumb: 1 } }, dues: { home: 1 }, brk: 1, qMiss: { home: 1 } } },
      { side: 'home', coins: 0, penalty: true },
    ], SINGLES, {}, pre));
    const [pen, b1] = carromFeed(s, names)[0].items;
    assert.match(pen.text, /penalty board: Priya penalised, \+3 to Rahul/);
    assert.equal(pen.icon, '⚠️');
    assert.equal(b1.sub, 'Rahul broke · 1 pocketed on the break · Fouls — Rahul 3 (striker pocketed ×2, thumbing) · Dues — Rahul 1 · Queen pocketed, cover missed — Rahul');
    assert.equal(foulText({ fouls: {} }, (sd) => sd), 'No fouls');
    assert.equal(foulText(undefined, (sd) => sd), '');
  });
});

describe('deep wave · carrom match stats panel', () => {
  test('untracked match: scoring + Queen rows only (no foul / break rows, no false 0)', () => {
    const s = run(play(L.CARROM_BOARDS.map(([side, coins, queen]) => ({ side, coins, queen }))));
    const cats = carromMatchStats(s);
    assert.deepEqual(cats.map((c) => c.id), ['scoring', 'queen']);
    const pts = cats[0].rows.find((r) => r.key === 'points')!;
    assert.deepEqual([pts.home, pts.away], ['62', '63']);
    assert.ok(!cats[0].rows.some((r) => r.key === 'white'), 'no slam rows when no slam was recorded');
    assert.deepEqual(carromGames(s), [1, 2, 3]);
    const g1 = carromMatchStats(s, 1)[0].rows.find((r) => r.key === 'points')!;
    assert.deepEqual([g1.home, g1.away], ['25', '18']);
  });
  test('tracked fouls / break: rows with a coverage note when tracked on only some boards', () => {
    const pre: ScoreAction[] = [{ type: 'FIRST_BREAK', payload: { side: 'home' } }];
    const s = run(play([
      { side: 'home', coins: 4 },
      { side: 'away', coins: 2, det: { fouls: { home: { touch: 1 } }, dues: {}, brk: 2 } },
      { side: 'home', coins: 3, det: { fouls: {}, brk: 0 } },
    ], SINGLES, {}, pre));
    const cats = carromMatchStats(s);
    const fouls = cats.find((c) => c.id === 'fouls')!;
    const all = fouls.rows.find((r) => r.key === 'fouls')!;
    assert.deepEqual([all.home, all.away, all.note], ['1', '0', 'tracked on 2 of 3 boards']);
    assert.ok(fouls.rows.some((r) => r.key === 'foul-touch'));
    assert.ok(!fouls.rows.some((r) => r.key === 'foul-striker'));
    const brk = cats.find((c) => c.id === 'break')!;
    const won = brk.rows.find((r) => r.key === 'brokeWon')!;
    assert.deepEqual([won.home, won.away], ['2/2 (100%)', '1/1 (100%)']);
    const coins = brk.rows.find((r) => r.key === 'brk')!;
    // board 2 was broken by Priya (away), board 3 by Rahul (home)
    assert.deepEqual([coins.home, coins.away], ['0', '2']);
  });
});

describe('deep wave · carrom statTotals (tracked keys)', () => {
  const tracked: B[] = [
    { side: 'home', coins: 4, det: { fouls: { home: { striker: 1 } }, dues: { home: 1 }, brk: 1, qMiss: { away: 1 } } },
    { side: 'away', coins: 2, det: { fouls: { away: { touch: 2 } }, brk: 0, qMiss: {} } },
    { side: 'home', coins: 9, queen: true },
  ];
  const pre: ScoreAction[] = [{ type: 'FIRST_BREAK', payload: { side: 'home' } }];
  test('singles: the player\'s own fouls / dues / covers / coins on the break; contract holds on every prefix', () => {
    const recs = toRecords(play(tracked, SINGLES, {}, pre));
    const t = assertContract(sp(SINGLES), recs, { every: 1 });
    assert.deepEqual(
      [t.h1.stats.fouls, t.h1.stats.foulStriker, t.h1.stats.dues, t.h1.stats.foulBoards, t.h1.stats.queenMisses, t.h1.stats.qMissBoards, t.h1.stats.brkPocketed, t.h1.stats.brkTracked],
      [1, 1, 1, 2, 0, 2, 1, 1]);
    assert.deepEqual([t.a1.stats.fouls, t.a1.stats.foulTouch, t.a1.stats.queenMisses, t.a1.stats.brkPocketed, t.a1.stats.brkTracked], [2, 2, 1, 0, 1]);
  });
  test('doubles: no foul / cover keys (which partner is unknown); break pockets only with a break order', () => {
    const recs = toRecords(play(tracked, DOUBLES, {}, pre));
    const t = assertContract(sp(DOUBLES), recs);
    assert.equal(t.h1.stats.fouls, undefined);
    assert.equal(t.h1.stats.brkPocketed, undefined);
    const order = { home: [{ id: 'h1' }, { id: 'h2' }], away: [{ id: 'a1' }, { id: 'a2' }] };
    const recs2 = toRecords(play(tracked, DOUBLES, {}, [{ type: 'FIRST_BREAK', payload: { side: 'home', order } }]));
    const t2 = assertContract(sp(DOUBLES), recs2);
    // board 1: h1 broke (1 pocketed); board 2: a1 broke (0); board 3: h2 broke (not recorded)
    assert.deepEqual([t2.h1.stats.brkPocketed, t2.h1.stats.brkTracked, t2.h2.stats.brkPocketed, t2.a1.stats.brkTracked], [1, 1, undefined, 1]);
  });
  test('an untracked match writes none of the tracked keys', () => {
    const recs = toRecords(play([{ side: 'home', coins: 3 }, { side: 'away', coins: 1 }]));
    const t = assertContract(sp(SINGLES), recs);
    for (const k of [...CARROM_FOUL_KEYS, ...CARROM_BRK_KEYS, ...CARROM_QMISS_KEYS]) assert.equal(t.h1.stats[k], undefined, k);
    assert.deepEqual(carromTrackedRecord(replay(sp(SINGLES), recs), 'home'), {});
  });
});

describe('deep wave · carrom career rows', () => {
  const line = (id: string, stats: Record<string, number>): StatLine =>
    ({ id: `l${id}`, matchId: id, playerId: 'p1', sport: 'carrom', stats, won: true, result: 'W', opponent: 'Blues', date: '2026-05-01' } as StatLine);
  const rows = (lines: StatLine[]) =>
    Object.fromEntries(careerSections(statSchema('carrom')!, lines).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));
  test('the break / fouls sections show only once a line tracked them, with the rates', () => {
    const plain = line('m1', { points: 25, boards: 3, queens: 1, gamesWon: 1, gamesLost: 0, boardsPlayed: 4 });
    assert.equal(rows([plain]).discipline, undefined);
    assert.equal(rows([plain]).break, undefined);
    const c = rows([plain, line('m2', { points: 20, boards: 2, queens: 0, gamesWon: 0, gamesLost: 1, boardsPlayed: 5, fouls: 3, foulStriker: 2, foulTouch: 1, foulLine: 0, foulThumb: 0, foulOther: 0, dues: 1, foulBoards: 5, brkPocketed: 4, brkTracked: 3, queenMisses: 1, qMissBoards: 5 })]);
    assert.equal(c.discipline.Fouls, '3');
    assert.equal(c.discipline['Fouls per board'], '0.60');
    assert.equal(c.discipline['Striker pocketed'], '2');
    assert.equal(c.discipline.Thumbing, undefined); // hideZero
    assert.equal(c.break['Coins per break'], '1.33');
  });
  test('the schema is still valid', () => assert.deepEqual(validateSchema(STAT_SCHEMAS.carrom), []));
});
