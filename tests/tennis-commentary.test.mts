/**
 * SD-158 — the tennis commentary model (src/sports/tennis/commentaryModel.ts):
 * blocks per game newest first (the game in play on top), "<winner> wins the
 * game" with the set's games score, "Point to <name>" rows with the match
 * time, a sentence from the point detail and the score after the point with
 * the SERVER's score first, conduct / timeout records inline, "<server> is
 * serving game N" last; tiebreaks; doubles names; and corrections re-derive.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import { pointInputs, correctionActions } from '../src/sports/rallyEdit.ts';
import { elapsed, gameScore, pointSentence, tennisCommentary, type CommentaryBlock, type CommentaryNames } from '../src/sports/tennis/commentaryModel.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const T0 = 1_760_000_000_000;
const MIN = 60_000;
const P = (side: Side, at?: number): ScoreAction => ({ type: 'POINT', side, ...(at ? { payload: { at } } : {}) });
const ACE = (side: Side): ScoreAction => ({ type: 'ACE', side });
const DF = (server: Side): ScoreAction => ({ type: 'POINT', side: opp(server), payload: { df: true } });
const D = (payload: Record<string, unknown>): ScoreAction => ({ type: 'POINT_DETAIL', payload });
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const run = (log: ScoreAction[], cfg: Record<string, unknown> = {}) => log.reduce(tennis.reducer, tennis.init(cfg));
const NAMES: CommentaryNames = { homeName: 'Alcaraz', awayName: 'Sinner', homeRoster: [{ id: 'h1', name: 'Carlos Alcaraz' }], awayRoster: [{ id: 'a1', name: 'Jannik Sinner' }] };
const pts = (b: CommentaryBlock) => b.rows.filter((r) => r.kind === 'point') as Array<Extract<CommentaryBlock['rows'][number], { kind: 'point' }>>;

describe('SD-158 · commentary helpers', () => {
  test('game score: the server first; deuce, advantage, no-ad', () => {
    assert.equal(gameScore({ home: 2, away: 1 }, 'home'), '30 - 15');
    assert.equal(gameScore({ home: 2, away: 1 }, 'away'), '15 - 30');
    assert.equal(gameScore({ home: 3, away: 3 }, 'home'), '40 - 40');
    assert.equal(gameScore({ home: 5, away: 4 }, 'home'), 'AD - 40');
    assert.equal(gameScore({ home: 5, away: 4 }, 'away'), '40 - AD');
    assert.equal(gameScore({ home: 0, away: 3 }, 'away'), '40 - 0');
    assert.equal(gameScore({ home: 3, away: 3 }, 'home', true), '40 - 40');
  });
  test('elapsed match time h:mm (none when unstamped)', () => {
    assert.equal(elapsed(T0 + 42 * MIN + 30_000, T0), '0:42');
    assert.equal(elapsed(T0 + 65 * MIN, T0), '1:05');
    assert.equal(elapsed(undefined, T0), undefined);
    assert.equal(elapsed(T0, undefined), undefined);
  });
  test('sentences from the detail; none without', () => {
    const who = { winner: 'Carlos Alcaraz', loser: 'Jannik Sinner', server: 'Carlos Alcaraz' };
    const s = (p: Record<string, unknown>) => pointSentence({ side: 'home', kind: 'point', ...p } as never, who);
    assert.equal(s({ pd: { how: 'fe', wing: 'bh' } }), 'Jannik Sinner loses the point with a Backhand Forced Error');
    assert.equal(s({ pd: { how: 'winner', wing: 'fh', shot: 'gs' } }), 'Carlos Alcaraz wins the point with a Forehand Winner');
    assert.equal(s({ pd: { how: 'winner', shot: 'overhead' } }), 'Carlos Alcaraz wins the point with an Overhead Winner');
    assert.equal(s({ pd: { how: 'ue', stroke: 'bh' } }), 'Jannik Sinner loses the point with a Backhand Unforced Error'); // legacy id
    assert.equal(s({ pd: { how: 'ue' } }), 'Jannik Sinner loses the point with an Unforced Error');
    assert.equal(s({ pd: { how: 'sw' } }), 'Carlos Alcaraz wins the point with a Service Winner');
    assert.equal(s({ kind: 'ace' }), 'Carlos Alcaraz wins the point with an Ace');
    assert.equal(s({ df: { playerName: 'J. Sinner' } }), 'J. Sinner double faults');
    assert.equal(s({ df: {} }), 'Carlos Alcaraz double faults');
    assert.equal(s({ pd: { how: 'fe', err: { playerName: 'Partner B' } } }), 'Partner B loses the point with a Forced Error');
    assert.equal(s({}), undefined);
  });
});

describe('SD-158 · commentary blocks', () => {
  test('nothing before the first point; the toss shows who serves game 1', () => {
    assert.deepEqual(tennisCommentary(tennis.init(), NAMES), []);
    const b = tennisCommentary(run([FS('away')]), NAMES);
    assert.equal(b.length, 1);
    assert.equal(b[0].title, 'Set 1 · Game 1');
    assert.deepEqual(b[0].rows, [{ kind: 'serving', side: 'away', name: 'Jannik Sinner', text: 'Jannik Sinner is serving game 1' }]);
  });
  // home holds to 15 (stamped one minute apart), then away serves 15-0, 15-15
  const LOG: ScoreAction[] = [
    FS('home'), { type: 'SET_DETAIL', payload: { pointDetail: true } },
    P('home', T0), D({ pd: { how: 'winner', wing: 'fh', shot: 'gs' } }),
    P('away', T0 + MIN), D({ pd: { how: 'fe', wing: 'bh' } }),
    P('home', T0 + 2 * MIN), P('home', T0 + 3 * MIN),
    { ...ACE('home'), payload: { at: T0 + 4 * MIN } },
    P('away', T0 + 6 * MIN), P('home', T0 + 7 * MIN),
  ];
  const blocks = tennisCommentary(run(LOG), NAMES);
  test('newest first; the game in play on top; a finished game opens with its winner and the set score', () => {
    assert.deepEqual(blocks.map((b) => [b.title, b.done]), [['Set 1 · Game 2', false], ['Set 1 · Game 1', true]]);
    const g1 = blocks[1];
    assert.deepEqual(g1.rows[0], { kind: 'game', side: 'home', name: 'Carlos Alcaraz', text: 'Carlos Alcaraz wins the game', score: '1-0' });
    assert.deepEqual(g1.rows.at(-1), { kind: 'serving', side: 'home', name: 'Carlos Alcaraz', text: 'Carlos Alcaraz is serving game 1', time: '0:00' });
    // SD-117c — the change-ends cue after the game (it was on the old point log too)
    assert.deepEqual(g1.rows[1], { kind: 'cue', text: '↔ Change ends · no rest after the first game' });
    assert.deepEqual(pts(g1).map((r) => [r.title, r.time, r.score, r.text ?? null]), [
      ['Point to Carlos Alcaraz', '0:04', 'Game', 'Carlos Alcaraz wins the point with an Ace'],
      ['Point to Carlos Alcaraz', '0:03', '40 - 15', null],
      ['Point to Carlos Alcaraz', '0:02', '30 - 15', null],
      ['Point to Jannik Sinner', '0:01', '15 - 15', 'Carlos Alcaraz loses the point with a Backhand Forced Error'],
      ['Point to Carlos Alcaraz', '0:00', '15 - 0', 'Carlos Alcaraz wins the point with a Forehand Winner'],
    ]);
  });
  test('the receiver’s points read with the server’s score first', () => {
    const g2 = blocks[0];
    assert.deepEqual(pts(g2).map((r) => r.score), ['15 - 15', '15 - 0']);
    assert.equal(g2.rows.at(-1)!.kind, 'serving');
    assert.equal((g2.rows.at(-1) as { text: string }).text, 'Jannik Sinner is serving game 2');
  });
  test('deuce and advantage, server first; unstamped points carry no time', () => {
    // home serves: 40-40, AD home, deuce, AD away (40 - AD), game away
    const b = tennisCommentary(run([FS('home'), P('home'), P('home'), P('home'), P('away'), P('away'), P('away'), P('home'), P('away'), P('away'), P('away')]), NAMES);
    const g1 = b.find((x) => x.game === 1)!;
    assert.deepEqual(pts(g1).map((r) => r.score).reverse(), ['15 - 0', '30 - 0', '40 - 0', '40 - 15', '40 - 30', '40 - 40', 'AD - 40', '40 - 40', '40 - AD', 'Game']);
    assert.ok(pts(g1).every((r) => r.time === undefined));
    assert.equal((g1.rows[0] as { text: string }).text, 'Jannik Sinner wins the game');
    assert.equal((g1.rows[0] as { score: string }).score, '0-1');
  });
  test('a tiebreak: its own block, points (server first) to the end, then "wins the tiebreak" and the set', () => {
    const s = run([FS('home'), ...L.tTiebreakSet(6, [...L.tbPts('home', 3), ...L.tbPts('away', 2), ...L.tbPts('home', 4)])]);
    const b = tennisCommentary(s, NAMES);
    const tb = b.find((x) => x.game === 0)!;
    assert.equal(tb.title, 'Set 1 · Tiebreak');
    assert.equal(b[0], b.find((x) => x.set === 2)); // set 2's first game is in play on top
    // home 3, away 2, home 4 → 7-2. Serves: home pt 1, away pts 2-3, home 4-5, away 6-7, home 8-9
    // — each score with that point's server first
    assert.deepEqual(pts(tb).map((r) => r.score).reverse(), ['1 - 0', '0 - 2', '0 - 3', '3 - 1', '3 - 2', '2 - 4', '2 - 5', '6 - 2', '7 - 2']);
    assert.deepEqual(tb.rows[0], { kind: 'game', side: 'home', name: 'Carlos Alcaraz', text: 'Carlos Alcaraz wins the tiebreak', score: '7-6', note: 'Game and set · Set 1' });
    assert.deepEqual(tb.rows.filter((r) => r.kind === 'cue').map((r) => (r as { text: string }).text), [
      '↔ Change ends · set break (120 s)', '↔ Change ends · tiebreak, every 6 points (no rest)',
    ]);
    assert.equal((tb.rows.at(-1) as { text: string }).text, 'Carlos Alcaraz serves first in the tiebreak');
  });
  test('the match point: "Game, set and match", no block in play after the end', () => {
    const s = run([FS('home'), ...L.tGame('home')], { setsToWin: 1, gamesPerSet: 1, setWinByTwo: false });
    assert.equal(s.ended, true);
    const b = tennisCommentary(s, NAMES);
    assert.equal(b.length, 1);
    assert.deepEqual((b[0].rows[0] as { note?: string }).note, 'Game, set and match');
  });
  test('a match tiebreak block', () => {
    const cfg = { setsToWin: 2, finalSetTiebreak: 10, noAd: true };
    const s = run([FS('home'), ...L.tSet(6, 4), ...L.tSet(4, 6), ...L.tbPts('home', 2)], cfg);
    assert.equal(tennisCommentary(s, NAMES)[0].title, 'Set 3 · Match tiebreak');
  });
});

describe('SD-158 · commentary with conduct, doubles, corrections', () => {
  test('timeouts and code violations appear where they happened; a penalty point reads its label', () => {
    const s = run([
      FS('home'), P('home'),
      { type: 'TIMEOUT', side: 'away', payload: { t: 'medical' } },
      { type: 'CONDUCT', side: 'away', payload: { level: 'warning', reason: 'Racket abuse' } },
      { type: 'CONDUCT', side: 'away', payload: { level: 'point', reason: 'Racket abuse' } },
    ]);
    const g = tennisCommentary(s, NAMES)[0];
    assert.deepEqual(g.rows.map((r) => (r.kind === 'point' ? [r.kind, r.score, r.text ?? null] : r.kind === 'mark' ? [r.kind, r.text] : [r.kind])), [
      ['point', '30 - 0', 'Code violation · point penalty · Racket abuse'],
      ['mark', 'Code violation · warning'],
      ['mark', 'Medical timeout'],
      ['point', '15 - 0', null],
      ['serving'],
    ]);
    assert.equal((g.rows[0] as { penalty?: boolean }).penalty, true);
  });
  test('doubles: the server by roster slot, the credited player, else the side', () => {
    const names: CommentaryNames = {
      homeName: 'Blue', awayName: 'Red',
      homeRoster: [{ id: 'h1', name: 'H One' }, { id: 'h2', name: 'H Two' }], awayRoster: [{ id: 'a1', name: 'A One' }, { id: 'a2', name: 'A Two' }],
    };
    const credit = (side: Side, id: string, name: string): ScoreAction => ({ type: 'POINT', side, attribution: { playerId: id, stat: 'points', playerName: name } });
    // games 1-3 (h1, a1, h2 serve), then a credited point in game 4 (a2 serves)
    const s = run([FS('home'), ...L.tGame('home'), ...L.tGame('away'), ...L.tGame('home'), credit('home', 'h2', 'H Two')], { playersPerSide: 2 });
    const b = tennisCommentary(s, names);
    assert.equal((b[0].rows.at(-1) as { text: string }).text, 'A Two is serving game 4');
    assert.equal(pts(b[0])[0].title, 'Point to H Two');
    assert.equal((b[1].rows[0] as { text: string }).text, 'Blue wins the game'); // a pair: the side's name
    assert.equal((b[1].rows.at(-1) as { text: string }).text, 'H Two is serving game 3');
    // no roster: the side's name
    const bare = tennisCommentary(s, { homeName: 'Blue', awayName: 'Red' });
    assert.equal((bare[0].rows.at(-1) as { text: string }).text, 'Red is serving game 4');
  });
  test('a correction re-derives the commentary exactly like the clean log', () => {
    const log: ScoreAction[] = [FS('home'), P('home'), P('away'), P('home'), P('home'), P('home'), P('away')];
    const s = run(log);
    const fixed = correctionActions(pointInputs(s.events), pointInputs(s.events).filter((_, i) => i !== 1), () => undefined).reduce(tennis.reducer, s);
    const clean = run([FS('home'), P('home'), P('home'), P('home'), P('home'), P('away')]);
    const strip = (bs: CommentaryBlock[]) => bs.map((b) => ({ ...b, rows: b.rows.map((r) => ('id' in r ? { ...r, id: 0 } : r)) }));
    assert.deepEqual(strip(tennisCommentary(fixed, NAMES)), strip(tennisCommentary(clean, NAMES)));
    // game 2: Sinner serves and wins the point
    assert.deepEqual(pts(tennisCommentary(fixed, NAMES)[0]).map((r) => [r.title, r.score]), [['Point to Jannik Sinner', '15 - 0']]);
  });
  test('extra detail rides on the point (2nd serve, speed, rally length, net)', () => {
    const s = run([FS('home'), { type: 'SET_DETAIL', payload: { serveDetail: true, netDetail: true, rallyDetail: true, speedDetail: true } },
      P('home'), D({ serve: 2, kmh: 158, rallyLen: '5-8', atNet: 'both' })]);
    assert.equal(pts(tennisCommentary(s, NAMES)[0])[0].meta, '2nd serve · 158 km/h · 5–8 shots · At the net: Carlos Alcaraz & Jannik Sinner');
  });
});
