/**
 * Deep wave — chess: the optional move list (legal-move checked SAN / PGN with
 * clocks), the opening (ECO), the move-by-move commentary, the game stats
 * panel (by phase), the game-record statTotals keys and careers, and the team
 * match board-by-board summary.
 *
 * Real games replayed: Morphy v Duke Karl / Count Isouard, Paris 1858 (the
 * "Opera Game", 17.Rd8#); Scholar's and Fool's mates; FIDE Laws checks —
 * castling through check, a pinned piece, en passant, promotion,
 * disambiguation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import { parseFen, toFen, legalMoves, readMove, moveToSan, replayMoves, applyMove, boardEnd, START_FEN, material } from '../src/sports/chess/board.ts';
import { readPgn, readMoveList, clkSeconds, movetext } from '../src/sports/chess/pgn.ts';
import { detectOpening, ecoCode, OPENINGS } from '../src/sports/chess/openings.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { plies, chessGameStats, phasesOf, plyWords, tcSeconds } from '../src/sports/chess/gameStats.ts';
import { chessFeed } from '../src/sports/chess/gameFeed.ts';
import { chessStatTotals, chessSideFigures, CHESS_DEEP_KEYS } from '../src/sports/chess/totals.ts';
import { chessTieBoards, colourLine } from '../src/sports/chess/tieBoards.ts';
import { chessResultCredit } from '../src/sports/chess/stats.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

const OPERA = '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0';
const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);

describe('deep wave · chess board (FIDE Laws App. C)', () => {
  test('FEN round trip and 20 legal moves from the start', () => {
    const p = parseFen(START_FEN)!;
    assert.equal(toFen(p), START_FEN);
    assert.equal(legalMoves(p).length, 20);
  });
  test('the Opera Game replays to mate; SAN normalised (checks, captures, O-O-O)', () => {
    const r = readMoveList(OPERA);
    assert.equal(r.error, undefined);
    assert.equal(r.san.length, 33);
    assert.equal(r.san[20], 'Bxb5+');
    assert.equal(r.san[22], 'O-O-O');
    assert.equal(r.san[32], 'Rd8#');
    assert.equal(r.result, '1-0');
    assert.equal(boardEnd(parseFen(r.fen)!), 'checkmate');
  });
  test("Scholar's and Fool's mates", () => {
    assert.equal(replayMoves(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7']).san[6], 'Qxf7#');
    assert.equal(replayMoves(['f3', 'e5', 'g4', 'Qh4']).san[3], 'Qh4#');
  });
  test('legality: no castling through check, a pinned piece stays, a promotion must be named', () => {
    const p = parseFen('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1')!;
    assert.match((readMove(p, 'O-O') as { error: string }).error, /castling isn't legal/);
    assert.equal((readMove(p, 'O-O-O') as { move: { castle: string } }).move.castle, 'Q');
    const pin = parseFen('4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1')!;
    assert.ok('error' in readMove(pin, 'Nc3'));
    const promo = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1')!;
    assert.match((readMove(promo, 'a8') as { error: string }).error, /promotes to/);
    const q = readMove(promo, 'a8=Q');
    assert.ok('move' in q && q.move.promotion === 'Q');
    assert.equal(moveToSan(promo, (readMove(promo, 'a8Q') as { move: never }).move), 'a8=Q+');
  });
  test('en passant, coordinates, 0-0 and annotations are read', () => {
    const r = replayMoves(['e4', 'Nf6', 'e5', 'd5', 'exd6', 'g6', 'g1f3', 'Bg7', 'Bc4', '0-0', 'O-O!?']);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.san.slice(4), ['exd6', 'g6', 'Nf3', 'Bg7', 'Bc4', 'O-O', 'O-O']);
    const ep = r.moves[4];
    assert.equal(ep.enPassant, true);
  });
  test('disambiguation: Rad1 written, a bare Rd1 refused as ambiguous', () => {
    const p = parseFen('4k3/8/8/8/8/8/4K3/R6R w - - 0 1')!;
    assert.match((readMove(p, 'Rd1') as { error: string }).error, /more than one piece/);
    const m = (readMove(p, 'Rad1') as { move: never }).move;
    assert.equal(moveToSan(p, m), 'Rad1');
  });
  test('the first illegal move is named, the moves before it kept', () => {
    const r = replayMoves(['e4', 'e5', 'Ke3']);
    assert.equal(r.san.length, 2);
    assert.equal(r.error?.index, 2);
    assert.match(r.error!.reason, /not a legal move/);
  });
  test('material after a capture', () => {
    const p = applyMove(parseFen('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1')!, (readMove(parseFen('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1')!, 'Qxd5') as { move: never }).move);
    assert.deepEqual([material(p).w, material(p).b], [9, 0]);
  });
});

describe('deep wave · chess PGN', () => {
  const PGN = `[Event "School Open"]\n[White "Anand"]\n[Black "Carlsen"]\n[ECO "C60"]\n[Opening "Ruy Lopez"]\n\n1. e4 {[%clk 0:14:58]} 1... e5 {[%clk 0:14:55]} 2. Nf3 {[%clk 0:14:50]} (2. Bc4 Nf6) 2... Nc6 $1 {[%clk 0:14:40]} 3. Bb5 {[%clk 0:14:30]} ; a line comment\n3... a6 {[%clk 0:14:00]} 1/2-1/2`;
  test('tags, clocks per move, variations / NAGs / comments skipped, the result', () => {
    const r = readPgn(PGN);
    assert.equal(r.tags.White, 'Anand');
    assert.deepEqual(r.tokens, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    assert.deepEqual(r.clocks, [898, 895, 890, 880, 870, 840]);
    assert.equal(r.result, '1/2-1/2');
    assert.equal(clkSeconds('1:29:52'), 5392);
    assert.equal(clkSeconds('nope'), null);
  });
  test('movetext writes numbers back (a game starting with Black too)', () => {
    assert.equal(movetext(['e4', 'e5', 'Nf3']), '1. e4 e5 2. Nf3');
    assert.equal(movetext(['e5', 'Nf3'], 7, true), '7... e5 8. Nf3');
  });
});

describe('deep wave · chess openings (ECO)', () => {
  test('the longest matching line; checks ignored; nothing for an unknown start', () => {
    assert.deepEqual(detectOpening(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3']), { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', plies: 10 });
    assert.equal(detectOpening(['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+'])?.eco, 'E11');
    assert.equal(detectOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])?.name, 'Ruy Lopez');
    assert.equal(detectOpening(['a3']), null);
    assert.equal(ecoCode('b90'), 'B90');
    assert.equal(ecoCode('F12'), null);
  });
  test('every table line is a legal sequence', () => {
    for (const o of OPENINGS) assert.equal(replayMoves(o.moves.split(' ')).error, undefined, `${o.eco} ${o.name}`);
  });
});

describe('deep wave · chess engine: MOVES / OPENING / SET_TRACK', () => {
  const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce((s, a) => chess.reducer(s, a), chess.init(config));
  test('an old log (result only) has no new keys', () => {
    const s = run([{ type: 'RESULT', side: 'home', payload: { winner: 'home', method: 'resignation', moves: 41 } }]);
    for (const k of ['game', 'opening', 'track', 'resultAt']) assert.equal(k in s, false, k);
  });
  test('moves added one by one (illegal ones dropped), a clock after the last, take back', () => {
    let s = run([{ type: 'MOVES', payload: { add: ['e4'], at: T0 } }, { type: 'MOVES', payload: { add: ['e5', 'Nf3'], clk: 880, at: T0 + 5000 } }]);
    assert.deepEqual(s.game?.san, ['e4', 'e5', 'Nf3']);
    assert.deepEqual(s.game?.clk, [null, null, 880]);
    assert.deepEqual(s.game?.at, [T0, T0 + 5000, T0 + 5000]);
    s = chess.reducer(s, { type: 'MOVES', payload: { add: ['Ke3'] } });
    assert.equal(s.game?.san.length, 3, 'an illegal move changes nothing');
    s = chess.reducer(s, { type: 'MOVES', payload: { drop: 1 } });
    assert.deepEqual(s.game?.san, ['e4', 'e5']);
    assert.equal(s.game?.fen, replayMoves(['e4', 'e5']).fen);
    s = chess.reducer(s, { type: 'MOVES', payload: { drop: 5 } });
    assert.equal(s.game, undefined);
  });
  test('a pasted PGN replaces the moves (after the result too); its ECO tag names the opening; OPENING by hand wins', () => {
    let s = run([{ type: 'RESULT', side: 'home', payload: { winner: 'home', method: 'checkmate', at: T0 } }]);
    assert.equal(s.resultAt, T0);
    s = chess.reducer(s, { type: 'MOVES', payload: { pgn: '[ECO "C41"]\n' + OPERA } });
    assert.equal(s.game?.san.length, 33);
    assert.deepEqual(chess.openingOf(s), { eco: 'C41', name: 'Philidor Defense' });
    s = chess.reducer(s, { type: 'OPENING', payload: { eco: 'c42' } });
    assert.deepEqual(s.opening, { eco: 'C42', name: 'Petrov Defense', manual: true });
    s = chess.reducer(s, { type: 'MOVES', payload: { pgn: 'e4 e5' } });
    assert.equal(s.opening?.eco, 'C42', 'a manual opening survives a new paste');
    s = chess.reducer(s, { type: 'OPENING', payload: {} });
    assert.equal(chess.openingOf(s)?.eco, 'C20', 'cleared: read from the moves again');
  });
  test('Stats to track from the format, then SET_TRACK', () => {
    assert.deepEqual(chess.init({ trackMoves: true }).track, { moves: true });
    const s = chess.reducer(chess.init(), { type: 'SET_TRACK', payload: { trackMoves: true, trackClock: true } });
    assert.deepEqual(s.track, { moves: true, clock: true });
  });
  // Round 2 (founder): a knockout match keeps ONE list per game — moves typed
  // after game 1's result are the game in play's (game 2), not game 1's
  test('a knockout mini-match keeps one move list per game (round 2)', () => {
    const s = run([{ type: 'RESULT', payload: { winner: 'draw', method: 'agreement', ko: { games: 2 } } }, { type: 'MOVES', payload: { add: ['e4'] } }]);
    assert.deepEqual(s.game?.san, ['e4']);
    assert.equal(s.ko?.games[0].game, undefined);
  });
});

describe('deep wave · chess game stats + commentary', () => {
  const opera = (white: 'home' | 'away' = 'home') => {
    let s = chess.init({ white });
    s = chess.reducer(s, { type: 'MOVES', payload: { pgn: OPERA } });
    return chess.reducer(s, { type: 'RESULT', side: white, payload: { winner: white, method: 'checkmate', at: T0 } });
  };
  test('per side: captures, material won, checks, castling', () => {
    const cats = chessGameStats(opera());
    const row = (k: string) => cats.flatMap((c) => c.rows).find((r) => r.key === k)!;
    assert.deepEqual([row('captures').home, row('captures').away], ['6', '6']);
    assert.deepEqual([row('matWon').home, row('matWon').away], ['14', '24']);
    assert.deepEqual([row('checks').home, row('checks').away], ['4', '0']);
    assert.deepEqual([row('castle').home, row('castle').away], ['O-O-O (move 12)', '—']);
    assert.deepEqual([row('mat').home, row('mat').away], ['15', '25']);
    assert.ok(!cats.some((c) => c.id === 'clock'), 'no clocks recorded → no clock rows');
  });
  test('phases: the first 10 moves are the opening', () => {
    const s = opera();
    assert.deepEqual(phasesOf(s), ['opening', 'middlegame']);
    const op = chessGameStats(s, 'opening').flatMap((c) => c.rows).find((r) => r.key === 'moves')!;
    assert.deepEqual([op.home, op.away], ['10', '10']);
  });
  test('thinking time from the clocks + the increment', () => {
    let s = chess.init({ tcBase: 15, tcInc: 10 });
    s = chess.reducer(s, { type: 'MOVES', payload: { pgn: '1. e4 {[%clk 0:15:05]} e5 {[%clk 0:14:50]} 2. Nf3 {[%clk 0:14:40]} Nc6 {[%clk 0:14:55]}' } });
    const ps = plies(s.game, s.tcExact);
    assert.deepEqual(tcSeconds('15+10'), { base: 900, inc: 10 });
    assert.deepEqual(ps.map((x) => x.think), [5, 20, 35, 5]);
  });
  test('commentary: result on top, then moves newest first, in words, with material', () => {
    const feed = chessFeed(opera(), { home: 'Morphy', away: 'Allies' });
    assert.equal(feed[0].title, 'Result');
    assert.match(feed[0].items[0].text, /^1-0: Morphy beat Allies by Checkmate/);
    assert.equal(feed[0].items[0].at, T0);
    assert.equal(feed[1].title, 'Move 17');
    assert.equal(feed[1].items[0].text, '17. Rd8# — Morphy: rook to d8 — checkmate');
    const m16 = feed[2];
    assert.equal(m16.items[0].text, '16… Nxb8 — Allies: knight takes the queen on b8');
    assert.equal(m16.items[0].score, 'Black +10');
    assert.equal(feed[feed.length - 1].subtitle, 'C41 Philidor Defense');
  });
  test('words for castling, promotion, en passant', () => {
    const s = chess.reducer(chess.init(), { type: 'MOVES', payload: { pgn: 'e4 Nf6 e5 d5 exd6' } });
    assert.equal(plyWords(plies(s.game)[4]), 'pawn takes en passant on d6');
  });
  test('a result-only game: the result sentence, its length, the clocks', () => {
    const s = chess.reducer(chess.init(), { type: 'RESULT', side: 'away', payload: { winner: 'away', method: 'time', moves: 52, clock: { white: 0, black: 95 } } });
    const feed = chessFeed(s, { home: 'Asha', away: 'Ravi' });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].items[0].text, '0-1: Ravi beat Asha on time');
    assert.equal(feed[0].items[0].sub, '52 moves · ⏱ White 0:00 · Black 1:35');
  });
  test('a knockout mini-match: one item per game, by stage', () => {
    let s = chess.init({ koGames: 2 });
    s = chess.reducer(s, { type: 'RESULT', payload: { winner: 'draw', method: 'agreement', ko: { games: 2 } } });
    s = chess.reducer(s, { type: 'RESULT', side: 'home', payload: { winner: 'home', method: 'resignation' } });
    const feed = chessFeed(s, { home: 'Asha', away: 'Ravi' });
    assert.equal(feed[0].title, 'Mini-match');
    assert.match(feed[0].items[0].text, /^Game 2: 0-1: Asha beat Ravi/);
  });
});

describe('deep wave · chess statTotals + careers', () => {
  const ctx = { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } };
  const sp: TotalsSport<chess.ChessState> = { name: 'chess', init: chess.init, reducer: chess.reducer, statTotals: chessStatTotals, partial: true, derived: CHESS_DEEP_KEYS, ctx };
  const result = (winner: 'home' | 'away' | 'draw', method: string, moves?: number): ScoreAction => ({
    type: 'RESULT', side: winner === 'draw' ? undefined : winner, payload: { winner, method, ...(moves ? { moves } : {}) },
    attribution: chessResultCredit('home', { id: 'h1', fullName: 'H1' }, winner, method, false),
    attribution2: chessResultCredit('away', { id: 'a1', fullName: 'A1' }, winner, method, false),
  });
  test('the move list → each player\'s own figures; the contract holds on every prefix', () => {
    const acts: ScoreAction[] = [{ type: 'MOVES', payload: { pgn: OPERA } }, result('home', 'checkmate')];
    const t = assertContract(sp, toRecords(acts), { every: 1 });
    assert.deepEqual([t.h1.stats.lenMoves, t.h1.stats.mvGames, t.h1.stats.checksGiven, t.h1.stats.captures, t.h1.stats.matWon, t.h1.stats.castled], [17, 1, 4, 6, 14, 1]);
    assert.deepEqual([t.a1.stats.checksGiven, t.a1.stats.matWon, t.a1.stats.castled], [0, 24, 0]);
    assert.equal(t.h1.stats.games, undefined, 'the result credit is not owned (stays live)');
  });
  test('result only: the typed length; a forfeit / unfinished game writes nothing', () => {
    const t = chessStatTotals(chess.reducer(chess.init(), result('away', 'resignation', 41)), ctx);
    assert.deepEqual(t.h1.stats, { lenGames: 1, lenMoves: 41 });
    assert.deepEqual(chessStatTotals(chess.reducer(chess.init(), result('home', 'forfeit')), ctx), {});
    assert.deepEqual(chessSideFigures(chess.init(), 'home'), {});
    assert.deepEqual(chessStatTotals(chess.reducer(chess.init(), result('home', 'resignation')), ctx), {});
  });
  test('career: the game record shows once a game carries it', () => {
    const line = (id: string, stats: Record<string, number>): StatLine => ({ id, matchId: id, playerId: 'p', sport: 'chess', stats, won: true, result: 'W', opponent: 'X', date: '2026-10-01' } as StatLine);
    const plain = line('m1', { games: 1, wins: 1 });
    assert.equal(careerSections(statSchema('chess')!, [plain]).find((s) => s.id === 'game'), undefined);
    const secs = careerSections(statSchema('chess')!, [plain, line('m2', { games: 1, wins: 1, lenGames: 1, lenMoves: 17, mvGames: 1, checksGiven: 4, captures: 6, matWon: 14, castled: 1, promotions: 0 })]);
    const g = Object.fromEntries(secs.find((s) => s.id === 'game')!.rows.map((r) => [r.label, r.value]));
    assert.equal(g['Average game length (moves)'], '17.0');
    assert.equal(g['Castled %'], '100%');
    assert.equal(g['Checks per game'], '4.0');
    assert.equal(g.Promotions, undefined);
  });
  test('the schema is valid', () => assert.deepEqual(validateSchema(STAT_SCHEMAS.chess), []));
});

describe('deep wave · chess team match board by board', () => {
  const st = (white: 'home' | 'away', winner: 'home' | 'away' | 'draw', method: string, moves?: number) =>
    chess.reducer(chess.init({ white }), { type: 'RESULT', side: winner === 'draw' ? undefined : winner, payload: { winner, method, ...(moves ? { moves } : {}) } });
  test('rows written White first; each team\'s score with White / Black', () => {
    const rubbers = [
      { status: 'completed', state: st('home', 'home', 'resignation', 41) },
      { status: 'completed', state: st('away', 'draw', 'agreement') },
      { status: 'live', state: chess.init() },
      { status: 'completed', state: st('away', 'home', 'time') },
    ];
    const names = [['Anand', 'Carlsen'], ['Gukesh', 'Ding'], ['Pragg', 'Nepo'], ['Arjun', 'Fabi']];
    const r = chessTieBoards(rubbers, (i) => `Board ${i + 1}`, (i, side) => names[i][side === 'home' ? 0 : 1]);
    assert.equal(r.rows[0].text, 'Board 1: Anand (W) 1-0 Carlsen (B)');
    assert.equal(r.rows[0].sub, 'Resignation · 41 moves');
    assert.equal(r.rows[1].text, 'Board 2: Ding (W) ½-½ Gukesh (B)');
    assert.equal(r.rows[2].text, 'Board 3: Pragg v Nepo · in play');
    assert.equal(r.rows[3].text, 'Board 4: Fabi (W) 0-1 Arjun (B)');
    assert.equal(colourLine(r.a), '1/1 with White · 1½/2 with Black');
    assert.equal(colourLine(r.b), '½/2 with White · 0/1 with Black');
  });
});
