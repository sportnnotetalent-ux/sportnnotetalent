/**
 * Deep wave (racket) — the commentary of badminton, table tennis, squash,
 * pickleball (blocks per game) and padel (per game of each set, as tennis
 * SD-158), src/sports/racketCommentaryModel.ts: newest first, the game in play
 * on top; "Point to X" (side-out: "Rally to X"), the match time, a sentence
 * from the point detail, the score called after the rally with the NEXT
 * server's score first (side-out doubles "4-2-1"; padel "30 - 15"), the serve
 * change as each sport says it, rally length / kitchen / 3rd shot, conduct /
 * timeouts / lets inline, interval and change-ends cues, the game rows, who
 * served first; and corrections re-derive.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs } from '../src/sports/rallyEngine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { racketCommentary, racketSentence, type CommentaryBlock, type CommentaryNames } from '../src/sports/racketCommentaryModel.ts';

type Side = 'home' | 'away';
const T0 = 1_760_000_000_000;
const MIN = 60_000;
const P = (side: Side, at?: number): ScoreAction => ({ type: 'POINT', side, ...(at ? { payload: { at } } : {}) });
const D = (payload: Record<string, unknown>): ScoreAction => ({ type: 'POINT_DETAIL', payload });
const FS = (side: Side, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side, ...extra } });
const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(reducer, s0);
const TT = makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQ = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 9, winBy: 1, gamesToWin: 3 } });
const PB = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const N = (home: string, away: string, hr?: string[], ar?: string[]): CommentaryNames => ({
  homeName: home, awayName: away,
  ...(hr ? { homeRoster: hr.map((name, i) => ({ id: `h${i + 1}`, name })) } : {}),
  ...(ar ? { awayRoster: ar.map((name, i) => ({ id: `a${i + 1}`, name })) } : {}),
});
type PointRow = Extract<CommentaryBlock['rows'][number], { kind: 'point' }>;
const pts = (b: CommentaryBlock) => b.rows.filter((r) => r.kind === 'point') as PointRow[];
const line = (r: CommentaryBlock['rows'][number]) => {
  switch (r.kind) {
    case 'point': return [r.title, r.time, r.text, r.meta, r.score].filter(Boolean).join(' | ');
    case 'game': return [r.text, r.score, r.note].filter(Boolean).join(' | ');
    case 'serving': return r.text;
    case 'mark': return [r.text, r.detail].filter(Boolean).join(' | ');
    case 'cue': return r.text;
  }
};

describe('deep wave · commentary sentences', () => {
  const who = { winner: 'Viktor Axelsen', loser: 'Lee Zii Jia', server: 'Viktor Axelsen' };
  const s = (sport: Parameters<typeof racketSentence>[0], p: Record<string, unknown>, unit?: 'point' | 'rally') =>
    racketSentence(sport, { side: 'home', kind: 'point', ...p } as never, who, unit);
  test('winners, forced / unforced errors with wing + the sport\'s shot, error and fault types', () => {
    assert.equal(s('badminton', { pd: { how: 'winner', wing: 'fh', shot: 'smash' } }), 'Viktor Axelsen wins the point with a Forehand Smash Winner');
    assert.equal(s('badminton', { pd: { how: 'ue', wing: 'bh', shot: 'netShot', stroke: 'net' } }), 'Lee Zii Jia loses the point with a Backhand Net Shot Unforced Error (into the net)');
    assert.equal(s('badminton', { pd: { how: 'winner', stroke: 'netKill' } }), 'Viktor Axelsen wins the point with a Net Kill Winner'); // SD-107 id
    assert.equal(s('tabletennis', { pd: { how: 'fe', wing: 'bh', shot: 'block' } }), 'Lee Zii Jia loses the point with a Backhand Block Forced Error');
    assert.equal(s('tabletennis', { pd: { how: 'winner', stroke: 'fh' } }), 'Viktor Axelsen wins the point with a Forehand Winner'); // SD-107 id
    assert.equal(s('tabletennis', { pd: { how: 'ace' } }), 'Viktor Axelsen wins the point with an Ace');
    assert.equal(s('badminton', { pd: { how: 'sf', stroke: 'high' } }), 'Lee Zii Jia loses the point with a Service Fault (above 1.15 m)');
    assert.equal(s('squash', { pd: { how: 'ue', stroke: 'tin', shot: 'drop' } }), 'Lee Zii Jia loses the point with a Drop Unforced Error (tin)');
    assert.equal(s('squash', { pd: { how: 'stroke' } }), 'Stroke to Viktor Axelsen');
    assert.equal(s('squash', { pd: { how: 'nolet' } }), 'No let to Lee Zii Jia — point to Viktor Axelsen');
    assert.equal(s('padel', { pd: { how: 'winner', wing: 'fh', shot: 'x3' } }), 'Viktor Axelsen wins the point with a Forehand Smash Out (Por Tres / Por Cuatro) Winner');
    assert.equal(s('padel', { df: { playerName: 'Ale Galán' } }), 'Ale Galán double faults');
    assert.equal(s('pickleball', { pd: { how: 'winner', shot: 'erne' } }, 'rally'), 'Viktor Axelsen wins the rally with an Erne Winner');
    assert.equal(s('pickleball', { pd: { how: 'ue', wing: 'fh', shot: 'dink', err: { playerName: 'Partner B' } } }), 'Partner B loses the point with a Forehand Dink Unforced Error');
    assert.equal(s('badminton', {}), undefined);
  });
});

describe('deep wave · badminton commentary', () => {
  const NB = N('Axelsen', 'Lee', ['Viktor Axelsen'], ['Lee Zii Jia']);
  test('nothing before the toss; the toss shows who serves first', () => {
    assert.deepEqual(racketCommentary('badminton', badminton.init({}), NB), []);
    const b = racketCommentary('badminton', run(badminton.reducer, badminton.init({}), [FS('away')]), NB);
    assert.deepEqual(b.map((x) => [x.title, x.rows.map(line)]), [['Game 1', ['Lee Zii Jia serves first']]]);
  });
  test('the umpire\'s call after each rally (next server first), "Service over", time, detail, rally length', () => {
    const s = run(badminton.reducer, badminton.init({}), [
      FS('home'), { type: 'SET_DETAIL', payload: { pointDetail: true, rallyDetail: true } },
      P('home', T0), D({ pd: { how: 'winner', wing: 'fh', shot: 'smash' }, rallyLen: '5-10' }),
      P('away', T0 + MIN), D({ pd: { how: 'ue', wing: 'bh', shot: 'netShot', stroke: 'net' } }),
      P('away', T0 + 2 * MIN),
    ]);
    const [g1] = racketCommentary('badminton', s, NB);
    assert.equal(g1.done, false);
    assert.deepEqual(g1.rows.map(line), [
      'Point to Lee Zii Jia | 0:02 | 2-1',
      'Point to Lee Zii Jia | 0:01 | Viktor Axelsen loses the point with a Backhand Net Shot Unforced Error (into the net) | Service over · Lee Zii Jia to serve | 1-1',
      'Point to Viktor Axelsen | 0:00 | Viktor Axelsen wins the point with a Forehand Smash Winner | 5–10 shots | 1-0',
      'Viktor Axelsen serves first',
    ]);
  });
  test('a full match: games newest first, the interval at 11, game rows with the match situation', () => {
    const s = run(badminton.reducer, badminton.init({}), [FS('home'), ...L.BADMINTON_LOG]);
    const b = racketCommentary('badminton', s, NB);
    assert.deepEqual(b.map((x) => x.title), ['Game 3', 'Game 2', 'Game 1']);
    assert.ok(b.every((x) => x.done));
    assert.deepEqual(line(b[2].rows[0]), 'Viktor Axelsen wins game 1 | 21-18 | Viktor Axelsen leads 1-0 in games');
    assert.deepEqual(line(b[1].rows[0]), 'Lee Zii Jia wins game 2 | 21-19 | Games level 1-1');
    assert.deepEqual(line(b[0].rows[0]), 'Viktor Axelsen wins game 3 | 21-15 | Game and match');
    assert.ok(b[2].rows.some((r) => r.kind === 'cue' && r.text === '⏸ Interval at 11 (60 s)'));
    // the deciding game changes ends at 11
    assert.ok(b[0].rows.some((r) => r.kind === 'cue' && /Change ends · interval at 11 in the deciding game/.test(r.text)));
    // between games: 120 s and ends
    assert.ok(b[2].rows.some((r) => r.kind === 'cue' && /120 s between games/.test(r.text)));
    // game 2 is served first by the game-1 winner
    assert.equal(line(b[1].rows.at(-1)!), 'Viktor Axelsen serves first');
    assert.equal(pts(b[2]).length, 39);
  });
  test('a correction re-derives every block (EDIT_LOG)', () => {
    const s = run(badminton.reducer, badminton.init({}), [FS('home'), P('home'), P('home'), P('away')]);
    const points = pointInputs(s.events);
    const fixed = badminton.reducer(s, { type: 'EDIT_LOG', payload: { points: [points[0], points[2]] } });
    assert.deepEqual(pts(racketCommentary('badminton', fixed, NB)[0]).map((r) => r.score), ['1-1', '1-0']);
  });
});

describe('deep wave · table tennis commentary', () => {
  test('change of service every 2 points, every point from 10-10; ends at 5 in the deciding game', () => {
    const NT = N('Ma Long', 'Harimoto', ['Ma Long'], ['Tomokazu Harimoto']);
    const s = run(TT.reducer, TT.init({}), [FS('away'), P('away'), P('home'), P('home')]);
    assert.deepEqual(pts(racketCommentary('tabletennis', s, NT)[0]).map((r) => `${r.meta ?? ''} ${r.score}`.trim()), [
      '2-1', 'Change of service · Ma Long to serve 1-1', '1-0',
    ]);
    const deuce = run(TT.reducer, TT.init({}), [FS('home'), ...L.rGame(10, 10), P('home')]);
    assert.equal(pts(racketCommentary('tabletennis', deuce, NT)[0])[0].meta, 'Change of service · Tomokazu Harimoto to serve');
    const decider = run(TT.reducer, TT.init({ gamesToWin: 2 }), [FS('home'), ...L.rMatch([11, 5], [5, 11]), P('home'), P('home'), P('home'), P('home'), P('home')]);
    const b = racketCommentary('tabletennis', decider, NT);
    assert.ok(b[0].rows.some((r) => r.kind === 'cue' && /5 in the deciding game/.test(r.text)), b[0].rows.map(line).join('\n'));
  });
  test('a timeout and a conduct warning appear where they happened', () => {
    const s = run(TT.reducer, TT.init({}), [FS('home'), P('home', T0), { type: 'TIMEOUT', side: 'away', payload: { t: 'timeout', at: T0 + MIN } }, { type: 'CONDUCT', side: 'home', payload: { level: 'warning', reason: 'Racket abuse', at: T0 + 2 * MIN } }, P('away', T0 + 3 * MIN)]);
    const rows = racketCommentary('tabletennis', s, N('A', 'B'))[0].rows;
    assert.deepEqual(rows.map((r) => r.kind), ['point', 'mark', 'mark', 'point', 'serving']);
    assert.equal((rows[2] as { text: string }).text, 'Timeout');
  });
});

describe('deep wave · squash commentary', () => {
  test('English scoring: hand-outs (Rally to X), the marker\'s call, lets with who appealed, decisions', () => {
    const s = run(SQ.reducer, SQ.init({ scoring: 'english' }), [
      FS('home'), P('home'), { type: 'LET', side: 'away' }, P('away'), P('away'),
      { type: 'POINT', side: 'home', payload: { pd: { how: 'stroke' } } }, { type: 'LET' }, P('home'),
    ]);
    const [g] = racketCommentary('squash', s, N('Ashour', 'Farag'));
    assert.deepEqual(g.rows.map(line), [
      'Point to Ashour | 2-1',
      'Let | rally replayed · no point',
      'Rally to Ashour | Stroke to Ashour | Hand-out · Ashour to serve | 1-1',
      'Point to Farag | 1-1',
      'Rally to Farag | Hand-out · Farag to serve | 0-1',
      'Let | Appeal by Farag · rally replayed',
      'Point to Ashour | 1-0',
      'Ashour serves first',
    ]);
  });
  test('PAR scoring: "Hand-out" when the receiver wins; 90 s between games', () => {
    const s = run(SQ.reducer, SQ.init({ pointsPerGame: 11 }), [FS('home'), P('away'), ...L.rGame(10, 10).slice(1), P('home'), P('home')]);
    const b = racketCommentary('squash', s, N('Ashour', 'Farag'));
    assert.equal(pts(b[b.length - 1]).at(-1)!.meta, 'Hand-out · Farag to serve');
    assert.ok(b[b.length - 1].rows.some((r) => r.kind === 'cue' && r.text === '⏸ Up to 90 s between games'));
  });
});

describe('deep wave · pickleball commentary', () => {
  test('side-out doubles: the 3-number call, second server, side out, kitchen line and 3rd shot', () => {
    const s = run(PB.reducer, PB.init({ scoring: 'sideout' }), [
      FS('home', { alt: true, pos: 2 }), { type: 'SET_DETAIL', payload: { netDetail: true, thirdDetail: true, rallyDetail: true } },
      P('home'), D({ third: 'drop', atNet: 'both', rallyLen: '9+' }),
      P('away'), D({ third: 'drive', rallyLen: '0-4' }),
      P('home'),
      P('home'), D({ third: 'drop', atNet: 'home' }),
    ]);
    const NP = N('Johns', 'Waters', ['Ben Johns', 'Collin Johns'], ['Anna Leigh Waters', 'Catherine Parenteau']);
    assert.deepEqual(racketCommentary('pickleball', s, NP)[0].rows.map(line), [
      'Rally to Johns | Side out · Johns to serve · At the kitchen line: Johns · 3rd-shot drop | 1-0-1',
      'Rally to Johns | Second server | 0-1-2',
      'Rally to Waters | Side out · Waters to serve · 0–4 shots · 3rd-shot drive | 0-1-1',
      'Point to Johns | 9+ shots · At the kitchen line: Johns & Waters · 3rd-shot drop | 1-0-2',
      'Ben Johns serves first',
    ]);
  });
  test('a side-out rally\'s marks survive a correction (EDIT_LOG)', () => {
    const s = run(PB.reducer, PB.init({ scoring: 'sideout' }), [FS('home'), { type: 'SET_DETAIL', payload: { thirdDetail: true } }, P('away'), D({ third: 'lob' })]);
    const r = PB.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.match(pts(racketCommentary('pickleball', r, N('A', 'B'))[0])[0].meta ?? '', /3rd-shot lob/);
  });
});

describe('deep wave · padel commentary', () => {
  const NP = N('Tapia', 'Coello', ['Agustín Tapia'], ['Arturo Coello']);
  test('per game of each set, the server\'s points first, golden point, break of serve, change ends', () => {
    const log: ScoreAction[] = [FS('home'), { type: 'SET_DETAIL', payload: { pointDetail: true, netDetail: true } }];
    for (const side of ['home', 'home', 'home', 'away', 'away', 'away'] as Side[]) log.push(P(side));
    log.push(P('away'), D({ pd: { how: 'winner', wing: 'fh', shot: 'x3' }, atNet: 'away' }));
    const s = run(padel.reducer, padel.init({ deuce: 'golden', playersPerSide: 1 }), log);
    const b = racketCommentary('padel', s, NP);
    assert.deepEqual(b.map((x) => x.title), ['Set 1 · Game 2', 'Set 1 · Game 1']);
    assert.deepEqual(b[0].rows.map(line), ['Arturo Coello is serving game 2']);
    assert.deepEqual(b[1].rows.map(line), [
      'Arturo Coello wins the game | 0-1 | Break of serve',
      '↔ Change ends · no rest after the first game',
      'Point to Arturo Coello | Arturo Coello wins the point with a Forehand Smash Out (Por Tres / Por Cuatro) Winner | Golden point · At the net: Arturo Coello | Game',
      'Point to Arturo Coello | 40 - 40',
      'Point to Arturo Coello | 40 - 30',
      'Point to Arturo Coello | 40 - 15',
      'Point to Agustín Tapia | 40 - 0',
      'Point to Agustín Tapia | 30 - 0',
      'Point to Agustín Tapia | 15 - 0',
      'Agustín Tapia is serving game 1',
    ]);
  });
  test('sets, the set tiebreak and the match end', () => {
    const s = run(padel.reducer, padel.init({ playersPerSide: 1 }), [FS('home'), ...L.PADEL_TWO_SETS]);
    const b = racketCommentary('padel', s, NP);
    assert.equal(b[0].title, 'Set 3 · Game 1');
    assert.equal(b[1].title, 'Set 2 · Tiebreak');
    // the set's games score in home-away order, as tennis
    assert.equal(line(b[1].rows[0]), 'Arturo Coello wins the tiebreak | 6-7 | Game and set · Set 2');
    // doubles (padel's default): the pair's name, the server by slot
    const dbl = racketCommentary('padel', run(padel.reducer, padel.init({}), [FS('home'), P('home')]), N('Tapia / Coello', 'Galán / Chingotto', ['Agustín Tapia', 'Arturo Coello'], ['Ale Galán', 'Fede Chingotto']));
    assert.deepEqual(dbl[0].rows.map(line), ['Point to Tapia / Coello | 15 - 0', 'Agustín Tapia is serving game 1']);
    assert.equal(line(b[1].rows.at(-1)!), 'Agustín Tapia serves first in the tiebreak');
    assert.equal(pts(b[1])[0].score, '5 - 7'); // the tiebreak's server first
    const last = b.find((x) => x.title === 'Set 1 · Game 10')!;
    assert.equal(line(last.rows[0]), 'Agustín Tapia wins the game | 6-4 | Game and set · Set 1');
  });
});
