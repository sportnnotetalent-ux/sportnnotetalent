/**
 * Round 2 — carrom: the founder's answers to the deep wave's questions.
 *   1. "Line / hand" fouls split into the ICF / AICF terms: base line (r.130),
 *      arrow line (r.32 / r.130) and elbow crossing (r.37). Boards recorded
 *      before the split keep their "line / hand" count.
 *   2. ICF foul penalties in the score — an organiser option, on by default
 *      for new matches (format `foulScore`); a match without the flag (every
 *      older one) replays to exactly its old score. The rule implemented:
 *        • r.53 / r.55: a foul's penalty coin is placed back ON the board, so
 *          it is in the coins left the scorer counts; a due still owed when
 *          the board ends is written off — neither adds a point by itself;
 *        • r.102–109: a board lost "by 3" (the penalty board) is lost by 1 once
 *          the awarded side has 22 or more;
 *        • r.102–112: a board that ENDS on the loser's foul gives the winner
 *          +1 for the Striker pocketed (a Due) and +1 for an improper stroke
 *          (each "if demanded" — the scorer taps what was claimed);
 *        • r.55: a board is worth 12 at most.
 *   3. Doubles: a "who" chip per foul, so each partner's career carries their
 *      own fouls (on boards where every foul of the side has a who).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import * as L from './racketLogs.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromStatTotals, carromTrackedRecord, carromPlayerFouls, creditedPlayers, CARROM_DERIVED_KEYS, CARROM_FOUL_KEYS, CARROM_BRK_KEYS, CARROM_QMISS_KEYS } from '../src/sports/carrom/totals.ts';
import { carromFeed, foulText } from '../src/sports/carrom/feed.ts';
import { carromMatchStats } from '../src/sports/carrom/matchStats.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

type Side = 'home' | 'away';
interface B { side: Side; coins?: number; queen?: boolean; penalty?: boolean; det?: carrom.BoardDetail; endFoul?: carrom.EndFoul }
const SINGLES = { home: ['h1'], away: ['a1'] };
const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const DERIVED = [...CARROM_DERIVED_KEYS, 'boardBreaks', 'boardBreaksWon', 'lostQueens', ...CARROM_FOUL_KEYS, ...CARROM_BRK_KEYS, ...CARROM_QMISS_KEYS];
const sp = (players = SINGLES, config: Record<string, unknown> = {}, ctx: StatTotalsContext | undefined = L.ctxOf(players)): TotalsSport<carrom.CarromState> => ({
  name: 'carrom', init: carrom.init, reducer: carrom.reducer, statTotals: carromStatTotals, partial: true, derived: DERIVED, ctx,
  config: { playersPerSide: players.home.length, ...config },
});

/** The actions the controls dispatch (index.tsx `record`): the live credit is
 *  the board's value under the match's rules (`boardValue`), capped at 25. */
function play(list: B[], players = SINGLES, config: Record<string, unknown> = {}): ScoreAction[] {
  let s = carrom.init({ playersPerSide: players.home.length, ...config });
  const out: ScoreAction[] = [];
  for (const b of list) {
    const queen = !!b.queen;
    const value = carrom.boardValue(s, s.current[b.side], { coins: b.coins ?? 0, queen, penalty: b.penalty, endFoul: s.foulScore ? b.endFoul : undefined });
    const credit = Math.min(value, Math.max(0, s.target - s.current[b.side]));
    const attr = (id: string) => ({ playerId: id, playerName: id.toUpperCase(), stat: 'points', by: credit, ...(b.penalty ? {} : { extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } }) });
    const who = creditedPlayers(players[b.side].map((id) => ({ id })), s.perSide ?? 1);
    const a: ScoreAction = {
      type: 'BOARD', side: b.side,
      payload: { ...(b.penalty ? { coins: 0, queen: false, penalty: true } : { coins: b.coins ?? 0, queen, ...(b.det ? { det: b.det } : {}) }), ...(b.endFoul ? { endFoul: b.endFoul } : {}) },
      attribution: attr(who[0].id), ...(who[1] ? { attribution2: attr(who[1].id) } : {}),
    };
    out.push(a);
    s = carrom.reducer(s, a);
  }
  return out;
}
const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce((s, a) => carrom.reducer(s, a), carrom.init(config));
const ICF = { foulScore: true };

describe('round 2 · carrom foul types: base line / arrow line / elbow crossing', () => {
  test('the chips offer the split; a "line / hand" foul from an older board is still read', () => {
    assert.deepEqual(carrom.FOUL_CHIPS, ['striker', 'touch', 'base', 'arrow', 'elbow', 'thumb', 'other']);
    assert.ok(carrom.FOUL_TYPES.includes('line'));
    assert.deepEqual([carrom.FOUL_LABEL.base, carrom.FOUL_LABEL.arrow, carrom.FOUL_LABEL.elbow], ['Base line', 'Arrow line', 'Elbow crossing']);
    const det = carrom.readDetail({ fouls: { home: { base: 2, elbow: 1, line: 1 } }, split: true })!;
    assert.deepEqual(det.fouls, { home: { base: 2, elbow: 1, line: 1 } });
    assert.equal(det.split, true);
    assert.equal(carrom.readDetail({ brk: 2, split: true })?.split, undefined, 'the split flag only rides with a foul log');
    assert.equal(foulText(det, (s) => s), 'Fouls — home 4 (base line ×2, elbow crossing, line / hand)');
  });
  test('careers: split boards get base / arrow / elbow keys; older boards keep "line / hand" (no false 0s)', () => {
    const old = run(play([{ side: 'home', coins: 3, det: { fouls: { home: { line: 1 } } } }]));
    const r1 = carromTrackedRecord(old, 'home');
    assert.equal(r1.foulLine, 1);
    assert.equal('foulBase' in r1, false);
    const now = run(play([{ side: 'home', coins: 3, det: { fouls: { home: { base: 1, arrow: 2 } }, split: true } }]));
    const r2 = carromTrackedRecord(now, 'home');
    assert.deepEqual([r2.foulBase, r2.foulArrow, r2.foulElbow, r2.fouls], [1, 2, 0, 3]);
    assert.equal('foulLine' in r2, false);
    const mixed = run([...play([{ side: 'home', coins: 3, det: { fouls: { away: { line: 1 } } } }]), ...play([{ side: 'away', coins: 2, det: { fouls: { away: { elbow: 1 } }, split: true } }])]);
    const r3 = carromTrackedRecord(mixed, 'away');
    assert.deepEqual([r3.foulLine, r3.foulElbow, r3.foulBase, r3.fouls, r3.foulBoards], [1, 1, 0, 2, 2]);
  });
  test('the career rows and the match panel name the split', () => {
    const schema = statSchema('carrom')!;
    const line: StatLine = { id: 'l', matchId: 'm', playerId: 'p', sport: 'carrom', stats: { fouls: 3, foulBoards: 4, foulBase: 2, foulArrow: 0, foulElbow: 1, dues: 0, foulStriker: 0, foulTouch: 0, foulThumb: 0, foulOther: 0 }, won: false };
    const rows = careerSections(schema, [line]).find((x) => x.id === 'discipline')!.rows.map((r) => r.label);
    assert.ok(rows.includes('Base line') && rows.includes('Elbow crossing'));
    assert.equal(rows.includes('Arrow line'), false, 'a zero split type is hidden');
    const s = run(play([{ side: 'home', coins: 3, det: { fouls: { away: { arrow: 1 } }, split: true } }]));
    const fouls = carromMatchStats(s).find((c) => c.id === 'fouls')!.rows;
    assert.deepEqual(fouls.find((r) => r.key === 'foul-arrow')?.label, 'Arrow line');
  });
});

describe('round 2 · carrom ICF foul penalties in the score (foulScore)', () => {
  test('the flag: only when the format says so (older matches have no key); the format default is on', () => {
    assert.equal(carrom.init(ICF).foulScore, true);
    assert.equal('foulScore' in carrom.init(), false);
    assert.equal('foulScore' in carrom.init({ foulScore: false }), false);
    const src = readFileSync(new URL('../src/sports/carrom/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /key: 'foulScore', label: 'ICF foul penalties in the score', type: 'toggle', default: true/);
  });
  test('boardValue: the old rule without the flag; ICF r.102–109 / r.102–112 / r.55 with it', () => {
    const off = carrom.init(), on = carrom.init(ICF);
    // a penalty board: 3 — with the flag, 1 once the awarded side has 22+
    assert.equal(carrom.boardValue(off, 23, { penalty: true }), 3);
    assert.equal(carrom.boardValue(on, 21, { penalty: true }), 3);
    assert.equal(carrom.boardValue(on, 22, { penalty: true }), 1);
    // the board-ending foul: +1 Striker, +1 improper stroke (flag only)
    assert.equal(carrom.boardValue(off, 0, { coins: 4, endFoul: { striker: true } }), 4);
    assert.equal(carrom.boardValue(on, 0, { coins: 4, endFoul: { striker: true } }), 5);
    assert.equal(carrom.boardValue(on, 0, { coins: 4, endFoul: { striker: true, improper: true } }), 6);
    assert.equal(carrom.boardValue(on, 23, { penalty: true, endFoul: { striker: true, improper: true } }), 3, 'r.108 improper at 22+: 1 + 2');
    // r.55: 12 at most (9 coins + the Queen + 2 → 12)
    assert.equal(carrom.boardValue(on, 0, { coins: 9, queen: true, endFoul: { striker: true, improper: true } }), carrom.MAX_BOARD_POINTS);
    // the coins left are as counted: fouls / dues logged on the board add nothing (r.53 / r.55)
    assert.equal(carrom.boardValue(on, 0, { coins: 2 }), carrom.boardPoints(2, false, 0, on));
  });
  test('an older log replays to exactly its old score; the flag changes nothing on plain boards', () => {
    const acts = L.CARROM_BOARDS.map(([side, coins, queen]) => ({ type: 'BOARD', side, payload: { coins, queen } }) as ScoreAction);
    assert.deepEqual(run(acts).games, [[25, 18], [12, 25], [25, 20]]);
    assert.deepEqual(run(acts, ICF).games, [[25, 18], [12, 25], [25, 20]]);
    // a stray endFoul on a match without the flag is ignored (and not kept)
    const stray = run([{ type: 'BOARD', side: 'home', payload: { coins: 3, queen: false, endFoul: { striker: true } } }]);
    assert.equal(stray.current.home, 3);
    assert.equal(stray.boards[0].endFoul, undefined);
  });
  test('a penalty board at 22+: 3 on an older match, 1 under the ICF rule', () => {
    // 12 + 10 = 22, then a penalty board to the side on 22
    const list: B[] = [{ side: 'home', coins: 9, queen: true }, { side: 'home', coins: 7, queen: true }, { side: 'home', penalty: true }];
    const old = run(play(list));
    assert.deepEqual(old.games, [[25, 0]], 'old rule: 22 + 3 → the game is won');
    assert.equal(old.boards[2].points, 3);
    const icf = run(play(list, SINGLES, ICF), ICF);
    assert.deepEqual(icf.games, [], 'ICF: 22 + 1 = 23 — the game goes on');
    assert.deepEqual(icf.current, { home: 23, away: 0 });
    assert.equal(icf.boards[2].points, 1);
  });
  test('the board-ending foul is kept on the board, survives a correction, and can close a game', () => {
    const s = run(play([{ side: 'home', coins: 9, queen: true }, { side: 'away', coins: 4, endFoul: { striker: true } }], SINGLES, ICF), ICF);
    assert.equal(s.boards[1].points, 5);
    assert.deepEqual(s.boards[1].endFoul, { striker: true });
    const again = carrom.replayBoards(s, carrom.boardInputs(s));
    assert.deepEqual(again.boards, s.boards);
    assert.deepEqual(again.current, s.current);
    // 24 + 1 coin closes the game only with the +1
    const near = run(play([{ side: 'home', coins: 9, queen: true }, { side: 'home', coins: 9, queen: true }], SINGLES, ICF), ICF);
    assert.equal(carrom.boardCloses(near, 'home', 0, false), null);
    assert.deepEqual(carrom.boardCloses(near, 'home', 0, false, false, { improper: true }), { kind: 'game', game: 1, winner: 'home' });
  });
  test('the statTotals contract holds with ICF scoring (live credit = the replay)', () => {
    const list: B[] = [
      { side: 'home', coins: 9, queen: true }, { side: 'away', coins: 5, endFoul: { striker: true, improper: true } },
      { side: 'home', coins: 9, queen: true }, { side: 'home', penalty: true, endFoul: { striker: true } },
    ];
    const t = assertContract(sp(SINGLES, ICF), toRecords(play(list, SINGLES, ICF)));
    assert.equal(t.h1.stats.points, 25);
    assert.equal(t.a1.stats.points, 7);
  });
  test('the commentary and the match panel say so', () => {
    const s = run(play([{ side: 'away', coins: 4, endFoul: { striker: true } }], SINGLES, ICF), ICF);
    const item = carromFeed(s, { home: 'Priya', away: 'Rahul' })[0].items[0];
    assert.match(item.text, /\+5/);
    assert.match(item.sub ?? '', /Ended on Priya's foul — striker pocketed \+1/);
    const row = carromMatchStats(s).flatMap((c) => c.rows).find((r) => r.key === 'endFoul')!;
    assert.deepEqual([row.home, row.away], ['0', '1']);
  });
});

describe('round 2 · carrom doubles: who fouled', () => {
  const who = (home: Record<string, carrom.PlayerFouls>): carrom.BoardDetail['who'] => ({ home });
  test('readDetail keeps the who chips (only with a foul log); whoFouls needs every foul and due attributed', () => {
    const det = carrom.readDetail({ fouls: { home: { striker: 1, base: 1 } }, dues: { home: 1 }, split: true, who: who({ h1: { fouls: { striker: 1 }, dues: 1 }, h2: { fouls: { base: 1 } }, bad: 'x' as never }) })!;
    assert.deepEqual(det.who, { home: { h1: { fouls: { striker: 1 }, dues: 1 }, h2: { fouls: { base: 1 } } } });
    assert.deepEqual(carrom.whoFouls(det, 'home'), det.who!.home);
    assert.deepEqual(carrom.whoFouls(det, 'away'), {}, 'no away fouls: trivially attributed');
    const partial = carrom.readDetail({ fouls: { home: { striker: 2 } }, who: who({ h1: { fouls: { striker: 1 } } }) })!;
    assert.equal(carrom.whoFouls(partial, 'home'), null, 'one striker foul has no who');
    assert.equal(carrom.whoFouls(carrom.readDetail({ fouls: { home: {} } }), 'home'), null, 'recorded without the who chips (older boards)');
  });
  test('careers: each partner gets their own fouls; an older doubles match still gets none', () => {
    const tracked: B[] = [
      { side: 'home', coins: 3, det: { fouls: { home: { striker: 1, elbow: 1 }, away: {} }, dues: { home: 0, away: 0 }, split: true, who: { home: { h1: { fouls: { striker: 1 } }, h2: { fouls: { elbow: 1 } } }, away: {} } } },
      // a foul with no who: the board is the pair's only (no partner credit)
      { side: 'away', coins: 2, det: { fouls: { home: { touch: 1 }, away: {} }, dues: { home: 0, away: 0 }, split: true, who: {} } },
      { side: 'home', coins: 4, det: { fouls: { home: {}, away: { base: 1 } }, dues: { home: 0, away: 1 }, split: true, who: { home: {}, away: { a2: { fouls: { base: 1 }, dues: 1 } } } } },
    ];
    const t = assertContract(sp(DOUBLES), toRecords(play(tracked, DOUBLES)));
    assert.deepEqual([t.h1.stats.fouls, t.h1.stats.foulStriker, t.h1.stats.foulBoards], [1, 1, 2]);
    assert.deepEqual([t.h2.stats.fouls, t.h2.stats.foulElbow, t.h2.stats.foulBoards], [1, 1, 2]);
    assert.deepEqual([t.a1.stats.fouls, t.a1.stats.dues, t.a1.stats.foulBoards], [0, 0, 3], 'a1 fouled on no board');
    assert.deepEqual([t.a2.stats.fouls, t.a2.stats.foulBase, t.a2.stats.dues, t.a2.stats.foulBoards], [1, 1, 1, 3]);
    assert.equal('foulLine' in t.h1.stats, false);
    // an older doubles log: fouls by side, no who → no foul keys (as before)
    const old = assertContract(sp(DOUBLES), toRecords(play([{ side: 'home', coins: 3, det: { fouls: { home: { line: 1 } } } }], DOUBLES)));
    assert.equal('fouls' in old.h1.stats, false);
    assert.deepEqual(carromPlayerFouls(run(play([{ side: 'home', coins: 3, det: { fouls: { home: { line: 1 } } } }], DOUBLES)), 'home', 'h1'), {});
  });
  test('every schema still validates', () => {
    for (const s of Object.values(STAT_SCHEMAS)) assert.deepEqual(validateSchema(s as never), [], s.sport);
  });
});
