/**
 * Round 2 — chess: the founder's answers to the deep wave's questions.
 *   1. Mate / stalemate on the entered moves PRE-SELECTS the result (the
 *      arbiter still confirms): `boardResult`.
 *   2. An opening repertoire on the profile — the record by ECO family /
 *      opening, as White and as Black: `repertoireGames` / `repertoire`.
 *   3. A performance-rating (TPR) leader where ratings exist (min 5 rated
 *      games): `withChessPerformance` + the `tpr` formula stat.
 *   4. One move list per knockout game: the game in play's list moves into
 *      its KoGame with the result; a recorded game's list can be pasted
 *      (`koGame`); the feed / careers read each game's own list.
 * Old logs (a knockout match never had a list) replay identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match, Player, StatLine } from '../src/core/types.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { chessFeed } from '../src/sports/chess/gameFeed.ts';
import { chessStatTotals, chessKoFigures, chessSideFigures } from '../src/sports/chess/totals.ts';
import { repertoire, repertoireGames, openingFamily, recordText, halfText, type RepGame } from '../src/sports/chess/repertoire.ts';
import { tprOf } from '../src/sports/chess/stats.ts';
import { withChessPerformance, performance, dpFor } from '../src/data/chessRatings.ts';
import { categoryLeaders } from '../src/data/standings.ts';
import { minimumRows } from '../src/data/leaderMinimums.ts';
import { sideOf } from '../src/data/lineContext.ts';

const FOOLS = '1. f3 e5 2. g4 Qh4#';
const SCHOLARS = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#';
// Sam Loyd's ten-move stalemate (Black to move, no legal move, not in check)
const LOYD = '1. e3 a5 2. Qh5 Ra6 3. Qxa5 h5 4. h4 Rah6 5. Qxc7 f6 6. Qxd7+ Kf7 7. Qxb7 Qd3 8. Qxb8 Qh7 9. Qxc8 Kg6 10. Qe6';
const NAJDORF = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6';
const RUY = '1. e4 e5 2. Nf3 Nc6 3. Bb5';
const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);
const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce((s, a) => chess.reducer(s, a), chess.init(config));
const pgn = (text: string, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'MOVES', payload: { pgn: text, ...extra } });
const result = (winner: 'home' | 'away' | 'draw', method?: chess.ChessMethod, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'RESULT', payload: { winner, ...(method ? { method } : {}), ...extra } });

describe('round 2 · chess: mate / stalemate pre-selects the result', () => {
  test("Fool's mate: Black wins by checkmate; Scholar's: White", () => {
    assert.deepEqual(chess.boardResult(run([pgn(FOOLS)])), { pick: 'black', method: 'checkmate' });
    assert.deepEqual(chess.boardResult(run([pgn(SCHOLARS)])), { pick: 'white', method: 'checkmate' });
  });
  test("Loyd's stalemate: a draw by stalemate", () => {
    assert.deepEqual(chess.boardResult(run([pgn(LOYD)])), { pick: 'draw', method: 'stalemate' });
  });
  test('a game still on, no moves, or a move taken back → nothing pre-selected', () => {
    assert.equal(chess.boardResult(run([pgn(RUY)])), null);
    assert.equal(chess.boardResult(chess.init()), null);
    assert.equal(chess.boardResult(run([pgn(FOOLS), { type: 'MOVES', payload: { drop: 1 } }])), null);
  });
  test('the pick is by colour, so it holds whoever has White', () => {
    const s = run([pgn(SCHOLARS)], { white: 'away' });
    assert.equal(chess.boardResult(s)?.pick, 'white');
    // the controls send it White-first like any pick: away (White) wins
    assert.equal(chess.scoreFor(s.white, 'away', 'checkmate'), '1-0');
  });
});

describe('round 2 · chess: one move list per knockout game', () => {
  const ko = { games: 2 };
  test('the game in play keeps its list; recording its result moves the list into that game', () => {
    let s = chess.init();
    s = chess.reducer(s, pgn(RUY, { at: T0 }));
    s = chess.reducer(s, result('draw', 'agreement', { ko, at: T0 + 1 }));
    assert.equal(s.game, undefined, 'the next game starts with an empty list');
    assert.deepEqual(s.ko!.games[0].game?.san, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    assert.equal(s.ko!.games[0].white, 'home');
    // game 2 (colours alternate): typed move by move
    s = chess.reducer(s, { type: 'MOVES', payload: { add: ['d4', 'd5', 'c4'] } });
    assert.deepEqual(s.game?.san, ['d4', 'd5', 'c4']);
    s = chess.reducer(s, result('away', 'resignation', { at: T0 + 2 }));
    assert.equal(s.ended, true);
    assert.equal(s.game, undefined);
    assert.deepEqual(s.ko!.games[1].game?.san, ['d4', 'd5', 'c4']);
    assert.equal(s.ko!.games[1].white, 'away');
    // after the match: a typed move without a game number does nothing
    assert.equal(chess.reducer(s, { type: 'MOVES', payload: { add: ['e4'] } }), s);
  });
  test('a recorded game\'s list can be pasted / replaced / named afterwards (koGame)', () => {
    let s = run([result('draw', 'agreement', { ko }), result('home', 'checkmate')]);
    assert.equal(s.ko!.games[0].game, undefined);
    s = chess.reducer(s, pgn(NAJDORF, { koGame: 0 }));
    assert.equal(s.ko!.games[0].game?.san.length, 10);
    assert.equal(chess.openingOf({ game: s.ko!.games[0].game }).eco, 'B90');
    s = chess.reducer(s, { type: 'OPENING', payload: { eco: 'B92', koGame: 1 } });
    assert.deepEqual(s.ko!.games[1].opening, { eco: 'B92', manual: true });
    s = chess.reducer(s, { type: 'MOVES', payload: { drop: 10, koGame: 0 } });
    assert.equal('game' in s.ko!.games[0], false, 'all moves taken back: no list key');
    assert.equal(chess.reducer(s, pgn(RUY, { koGame: 7 })), s, 'no such game');
    assert.deepEqual(chess.points(s), { home: 1.5, away: 0.5 }, 'no score effect');
  });
  test('an older knockout log (no MOVES) replays with no new key', () => {
    const s = run([result('draw', 'agreement', { ko: { games: 2 }, moves: 30 }), result('draw', 'agreement'), result('home', 'time')]);
    for (const g of s.ko!.games) assert.deepEqual(Object.keys(g).sort(), ['method', 'phase', 'white', 'winner', ...(g.moves ? ['moves'] : [])].sort());
    assert.equal('game' in s, false);
    assert.deepEqual(chessStatTotals(s, { players: { home: [{ id: 'h' }], away: [{ id: 'a' }] } } as never), {}, 'still writes nothing');
    const feed = chessFeed(s, { home: 'Anand', away: 'Carlsen' });
    assert.deepEqual(feed.flatMap((g) => g.items.map((i) => [i.text, i.sub ?? ''])), [
      ['Game 3: 1-0: Anand beat Carlsen on time', ''],
      ['Game 2: ½-½: Carlsen drew with Anand (Draw agreed)', ''],
      ['Game 1: ½-½: Anand drew with Carlsen (Draw agreed)', '30 moves'],
    ]);
  });
  test('the feed: each game\'s moves under its result, the game in play on top', () => {
    let s = run([pgn(SCHOLARS, { at: T0 }), result('home', 'checkmate', { ko: { games: 2 }, at: T0 + 1 })]);
    s = chess.reducer(s, { type: 'MOVES', payload: { add: ['e4'], at: T0 + 2 } });
    const items = chessFeed(s, { home: 'Anand', away: 'Carlsen' }).flatMap((g) => g.items);
    assert.equal(items[0].text, '1. e4 — Carlsen: pawn to e4', 'game 2: Carlsen has White');
    assert.match(items[0].sub ?? '', /^Game 2/);
    assert.equal(items[1].text, 'Game 1: 1-0: Anand beat Carlsen by Checkmate');
    assert.equal(items[1].sub, "4 moves · C23 Bishop's Opening");
    assert.match(items[2].text, /^4\. Qxf7# — Anand/);
    assert.match(items[2].sub ?? '', /^Game 1/);
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'unique ids');
  });
  test('careers: each knockout game with a list counts (summed per side); games without one write nothing', () => {
    const s = run([pgn(SCHOLARS), result('home', 'checkmate', { ko: { games: 2 } }), result('draw', 'agreement', { moves: 40 })]);
    const home = chessKoFigures(s, 'home');
    const one: chess.ChessState = { ...chess.init(), game: s.ko!.games[0].game, winner: 'home', method: 'checkmate', ended: true };
    assert.deepEqual(home, chessSideFigures(one, 'home'), 'game 1 only (game 2 had a typed length, no list)');
    assert.equal(home.lenGames, 1);
    const totals = chessStatTotals(s, { players: { home: [{ id: 'h' }], away: [{ id: 'a' }] } } as never);
    assert.deepEqual(Object.keys(totals).sort(), ['a', 'h']);
    assert.equal(totals.h.stats.checksGiven, 1);
  });
});

describe('round 2 · chess opening repertoire', () => {
  test('a game: its opening, the player\'s colour and score; result-only and forfeits are left out', () => {
    const s = run([pgn(NAJDORF), result('away', 'resignation')]);
    assert.deepEqual(repertoireGames(s, 'home'), [{ colour: 'white', eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', score: 0 }]);
    assert.deepEqual(repertoireGames(s, 'away'), [{ colour: 'black', eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', score: 1 }]);
    assert.deepEqual(repertoireGames(run([result('home', 'resignation')]), 'home'), [], 'no opening: not guessed');
    assert.deepEqual(repertoireGames(run([pgn(RUY), result('home', 'forfeit')]), 'home'), [], 'a forfeit is no game');
    assert.deepEqual(repertoireGames(run([pgn(RUY)]), 'home'), [], 'still in play');
    // a typed ECO without moves counts
    const typed = run([{ type: 'OPENING', payload: { eco: 'A80' } }, result('draw', 'agreement')]);
    assert.deepEqual(repertoireGames(typed, 'away'), [{ colour: 'black', eco: 'A80', name: 'Dutch Defense', score: 0.5 }]);
  });
  test('a knockout match: one entry per game with an opening, each with its own colours', () => {
    const s = run([pgn(RUY), result('draw', 'agreement', { ko: { games: 2 } }), pgn(NAJDORF), result('home', 'checkmate')]);
    assert.deepEqual(repertoireGames(s, 'home'), [
      { colour: 'white', eco: 'C60', name: 'Ruy Lopez', score: 0.5 },
      { colour: 'black', eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', score: 1 },
    ]);
  });
  test('families: the name before the variation; an unnamed code → its ECO volume', () => {
    assert.equal(openingFamily('B90', 'Sicilian Defense: Najdorf Variation'), 'Sicilian Defense');
    assert.equal(openingFamily('C60', 'Ruy Lopez'), 'Ruy Lopez');
    assert.equal(openingFamily('B91', 'ECO B91'), 'B — Semi-open games');
  });
  test('the repertoire: per colour, most played first, with the openings inside and W-D-L / score %', () => {
    const G = (colour: 'white' | 'black', eco: string, name: string, score: number): RepGame => ({ colour, eco, name, score });
    const rep = repertoire([
      G('white', 'B90', 'Sicilian Defense: Najdorf Variation', 1),
      G('white', 'B30', 'Sicilian Defense: Old Sicilian', 0.5),
      G('white', 'B90', 'Sicilian Defense: Najdorf Variation', 0),
      G('white', 'C60', 'Ruy Lopez', 1),
      G('black', 'E70', "King's Indian Defense: Normal Variation", 0.5),
    ]);
    assert.equal(rep.games, 5);
    assert.deepEqual(rep.white.map((f) => [f.name, f.ecoRange, f.games, recordText(f), f.pct]), [
      ['Sicilian Defense', 'B30–B90', 3, '1W 1D 1L', 50],
      ['Ruy Lopez', 'C60', 1, '1W 0D 0L', 100],
    ]);
    assert.deepEqual(rep.white[0].lines.map((l) => [l.eco, l.games, halfText(l.score)]), [['B90', 2, '1'], ['B30', 1, '½']]);
    assert.deepEqual(rep.black.map((f) => [f.name, f.games, f.pct]), [["King's Indian Defense", 1, 50]]);
  });
  test('the profile finds the player\'s side from the match (sideOf), as its colour split does', () => {
    const m = { id: 'm1', sport: 'chess', homeTeam: { id: 't1', name: 'Anand', roster: ['p1'] }, awayTeam: { id: 't2', name: 'Carlsen', roster: ['p2'] }, state: run([pgn(RUY), result('home', 'resignation')]) } as unknown as Match;
    const l: StatLine = { id: 'l', matchId: 'm1', playerId: 'p2', sport: 'chess', stats: { games: 1, losses: 1 }, won: false };
    const side = sideOf(l, m)!;
    assert.equal(side, 'away');
    assert.deepEqual(repertoireGames(m.state as chess.ChessState, side), [{ colour: 'black', eco: 'C60', name: 'Ruy Lopez', score: 0 }]);
  });
});

describe('round 2 · chess performance rating (TPR) leader', () => {
  const P = (id: string, fullName: string, rapid?: number): Player => ({ id, fullName, sports: [], ...(rapid ? { sportDetails: { chess: { ratings: { rapid } } } } : {}) } as unknown as Player);
  const players = [P('a', 'Asha', 1500), P('b', 'Bala', 1700), P('c', 'Chen', 1900), P('d', 'Dia'), P('e', 'Esha', 1600)];
  let n = 0;
  const L = (pid: string, mid: string, s: Record<string, number>): StatLine => ({ id: `l${++n}`, matchId: mid, playerId: pid, sport: 'chess', stats: s, won: !!s.wins });
  // Asha: 5 games — beat Bala, Chen; drew Esha; lost to Chen; beat Dia (unrated: left out)
  const lines = [
    L('a', 'm1', { games: 1, wins: 1 }), L('b', 'm1', { games: 1, losses: 1 }),
    L('a', 'm2', { games: 1, wins: 1 }), L('c', 'm2', { games: 1, losses: 1 }),
    L('a', 'm3', { games: 1, draws: 1 }), L('e', 'm3', { games: 1, draws: 1 }),
    L('a', 'm4', { games: 1, losses: 1 }), L('c', 'm4', { games: 1, wins: 1 }),
    L('a', 'm5', { games: 1, wins: 1 }), L('d', 'm5', { games: 1, losses: 1 }),
    L('a', 'm6', { games: 1, wins: 1 }), L('b', 'm6', { games: 1, losses: 1 }),
    L('a', 'm7', { forfeitWins: 1 }), L('e', 'm7', { forfeitLosses: 1 }),
  ];
  test('the keys: rated opponents on the event\'s list only; forfeits and unrated opponents add nothing', () => {
    const got = withChessPerformance(lines, players, 'rapid');
    const asha = got.filter((l) => l.playerId === 'a');
    assert.deepEqual(asha.map((l) => l.stats.tprGames ?? null), [1, 1, 1, 1, null, 1, null]);
    assert.deepEqual(asha.map((l) => l.stats.tprOppSum ?? null), [1700, 1900, 1600, 1900, null, 1700, null]);
    assert.deepEqual(asha.map((l) => l.stats.tprPts ?? null), [1, 1, 0.5, 0, null, 1, null]);
    // a standard event: nobody has a standard rating → no keys at all
    assert.ok(withChessPerformance(lines, players, 'classical').every((l) => !('tprGames' in l.stats)));
    assert.equal(lines[0].stats.tprGames, undefined, 'the stored lines are not touched');
  });
  test('TPR = ARO + dp(p), the same figure as the crosstable (FIDE B.02 8.1a)', () => {
    // Asha over the 5 rated games: ARO (1700+1900+1600+1900+1700)/5 = 1760, p = 3.5/5 = 0.70 → dp 149
    assert.equal(tprOf(5, 8800, 3.5), 1760 + dpFor(0.7));
    assert.equal(tprOf(5, 8800, 3.5), performance([1700, 1900, 1600, 1900, 1700].map((r, i) => ({ oppRating: r, score: [1, 1, 0.5, 0, 1][i] }))).tpr);
    assert.equal(tprOf(0, 0, 0), undefined);
  });
  test('the leader: unofficial, needs 5 rated games (organiser can change), only where ratings exist', () => {
    const cats = categoryLeaders(withChessPerformance(lines, players, 'rapid'), players, 'chess');
    const tpr = cats.find((c) => c.key === 'tpr')!;
    assert.equal(tpr.label, 'Performance rating (TPR, unofficial)');
    assert.equal(tpr.qualifier, 'min 5 rated games');
    assert.deepEqual(tpr.leaders.map((l) => [l.name, l.display ?? String(l.value)]), [['Asha', String(1760 + 149)]], 'the others played fewer than 5 rated games');
    assert.equal(categoryLeaders(lines, players, 'chess').some((c) => c.key === 'tpr'), false, 'no ratings data on the lines: no category');
    const low = categoryLeaders(withChessPerformance(lines, players, 'rapid'), players, 'chess', { mins: { tpr: 2 } }).find((c) => c.key === 'tpr')!;
    // min 2: Chen 1 win + 1 loss v Asha (1500) → 1500; Bala 2 losses v Asha → 1500 − 800; Esha / Dia 1 game
    assert.deepEqual(low.leaders.map((l) => [l.name, l.value]), [['Asha', 1909], ['Chen', 1500], ['Bala', 700]]);
    assert.ok(minimumRows('chess').some((r) => r.key === 'tpr' && r.text === 'min 5 rated games'));
  });
});
