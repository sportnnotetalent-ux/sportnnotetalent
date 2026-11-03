/**
 * Racket batch 5 — padel time-violation fault, conduct / timeouts in Stats,
 * the leftovers of docs/sport-expert/racket.md
 * (docs/security/breaks/racket-batch5.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import { conductAction } from '../src/sports/racketActions.ts';
import { TIME_SPORTS, conductRows, isMark, timeRule } from '../src/sports/conduct.ts';
import { isTimeFault } from '../src/sports/serveFault.ts';
import { keyStats, racketView } from '../src/sports/racketMatchStats.ts';
import { keyStats as tennisKeyStats, tennisView } from '../src/sports/tennis/matchStats.ts';
import {
  DETAIL_HOWS, RACKET_SHOTS, STROKES, applyPointDetail, detailKeys, errTypeOf, howDef, pdText,
} from '../src/sports/pointDetail.ts';
import { errorTypeRows } from '../src/sports/racketMatchStats.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { statDefIn } from '../src/sports/statSchema.ts';
import { racketSentence } from '../src/sports/racketCommentaryModel.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const run = <S,>(r: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(r, s0);
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const D = (pd: unknown): ScoreAction => ({ type: 'POINT_DETAIL', payload: { pd } });
const C = (side: Side, level: string, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'CONDUCT', side, payload: { level, ...extra } });
/** a time violation as the Quick options send it (conductAction) */
const TV = (side: Side, level: 'warning' | 'fault' | 'point'): ScoreAction => conductAction(side, { level, track: 'time' }, undefined, 1);
const TMO = (side: Side, t: string): ScoreAction => ({ type: 'TIMEOUT', side, payload: { t } });
const defaultsFor = (fields: { key: string; default: unknown }[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));
const NEWPADEL = () => run(padel.reducer, padel.init(defaultsFor(PADEL_META.formatFields ?? [])), [FS('home')]);
const lastPoint = (s: { events: LiveEvent[] }) => [...s.events].reverse().find((e) => e.kind === 'point')!;
const TT = makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQ = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PB = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const R1 = { home: ['h1'], away: ['a1'] };

// ------------------------------------------------------------- RB1–RB4 --

describe('RB1 / RB3: a padel time violation costs the serve (as tennis TF4)', () => {
  test('the Quick options send it marked as a loss of serve (additive key)', () => {
    assert.equal(TV('home', 'fault').payload?.los, true);
    assert.equal(TV('home', 'warning').payload?.los, undefined);
    assert.equal(TV('home', 'point').payload?.los, undefined);
    assert.equal(conductAction('home', { level: 'fault' }).payload?.los, undefined, 'code track: never');
    assert.equal(isTimeFault(TV('home', 'fault')), true);
    assert.equal(isTimeFault(C('home', 'fault')), false);
  });
  test('on the 1st serve: a fault (2nd serve next), the record stays on the timeline', () => {
    const s = padel.reducer(NEWPADEL(), TV('home', 'fault'));
    assert.equal(s.fault, true);
    assert.equal(s.serveDetail, true);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
    assert.ok(s.events.some((e) => e.kind === 'conduct' && e.pen?.track === 'time'));
    assert.equal(lastPoint(padel.reducer(s, P('home'))) .serve, 2);
  });
  test('on the 2nd serve: a double fault, the point to the receiver (the pending type kept)', () => {
    const s = run(padel.reducer, NEWPADEL(), [{ type: 'FAULT', side: 'home', payload: { kind: 'mesh' } }, TV('home', 'fault')]);
    assert.deepEqual(s.pts, { home: 0, away: 1 });
    assert.equal(s.fault, undefined);
    const p = lastPoint(s);
    assert.ok(p.df);
    assert.equal(p.serve, 2);
    assert.equal(p.sf1, 'mesh');
    assert.equal(p.side, 'away');
  });
  test('the receiver, before the toss, after the end: a record only', () => {
    const r = padel.reducer(NEWPADEL(), TV('away', 'fault'));
    assert.equal(r.fault, undefined);
    assert.deepEqual(r.pts, { home: 0, away: 0 });
    const pre = padel.reducer(padel.init({ playersPerSide: 2 }), TV('home', 'fault'));
    assert.equal(pre.fault, undefined);
  });
  test('a time warning is not a fault; a time point penalty scores as before', () => {
    const w = padel.reducer(NEWPADEL(), TV('home', 'warning'));
    assert.equal(w.fault, undefined);
    const p = padel.reducer(NEWPADEL(), TV('home', 'point'));
    assert.deepEqual(p.pts, { home: 0, away: 1 });
  });
  test('Undo (the previous state) and a correction keep it exact', () => {
    const s0 = NEWPADEL();
    const s1 = padel.reducer(s0, TV('home', 'fault'));
    assert.equal(undoLabel({ type: 'CONDUCT', prev: s0, next: s1 }, { home: 'A', away: 'B' }).toLowerCase().includes('time violation'), true);
    const s2 = run(padel.reducer, s1, [P('home'), P('away')]);
    const again = padel.reducer(s2, { type: 'EDIT_LOG', payload: { points: pointInputs(s2.events) } });
    assert.deepEqual([again.pts, again.games], [s2.pts, s2.games]);
    assert.equal(lastPoint(again).serve, lastPoint(s2).serve);
  });
  test('tennis still does it, through the same shared code', () => {
    const t = run(tennis.reducer, tennis.init(), [FS('home'), TV('home', 'fault')]);
    assert.equal(t.fault, true);
    const t2 = tennis.reducer(t, TV('home', 'fault'));
    assert.deepEqual(t2.pts, { home: 0, away: 1 });
    assert.ok(lastPoint(t2).df);
    // tennis needs no mark (its older logs scored it so from TF4)
    const t3 = run(tennis.reducer, tennis.init(), [FS('home'), C('home', 'fault', { track: 'time' })]);
    assert.equal(t3.fault, true);
    for (const f of ['src/sports/tennis/engine.ts', 'src/sports/padel/engine.ts']) assert.match(read(f), /lossOfServe\(/, f);
  });
});

describe('RB2: old padel logs replay identically', () => {
  test('a padel time "fault" without the mark is a record only (the pinned behaviour)', () => {
    const s = padel.reducer(NEWPADEL(), C('home', 'fault', { track: 'time' }));
    assert.equal(s.fault, undefined);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
  });
  test('a real log replays to the same state', () => {
    const a = run(padel.reducer, padel.init({ playersPerSide: 2 }), L.PADEL_TWO_SETS);
    const b = run(padel.reducer, padel.init({ playersPerSide: 2 }), L.PADEL_TWO_SETS);
    assert.deepEqual(a, b);
    assert.ok(a.events.every((e) => !e.df));
  });
});

describe('RB1 / RB4: the screen', () => {
  const q = read('src/sports/RacketQuickOptions.tsx');
  test('padel has the Time violation tile, with its rule', () => {
    assert.deepEqual([...TIME_SPORTS], ['tennis', 'padel']);
    assert.match(q, /TIME_SPORTS\.includes\(sport\)/);
    assert.match(timeRule('padel'), /FIP/);
    assert.match(timeRule('tennis'), /ITF/);
    assert.match(read('src/sports/padel/index.tsx'), /makeRacketQuickOptions\('padel', \{ serverOf:/);
  });
  test('the effect text no longer asks for a second double fault', () => {
    assert.doesNotMatch(q, /record the double fault too/);
    assert.match(q, /double fault/i);
  });
});

// ------------------------------------------------------------- RB5–RB6 --

const conductSec = (secs: Array<{ id: string; rows: Array<{ key: string; home: string; away: string; label: string }> }>) => secs.find((x) => x.id === 'conduct');

describe('RB5: conduct and timeouts reach the Stats tab', () => {
  test('table tennis: cards, penalty points (a 2-point card counted twice), timeouts', () => {
    const s = run(TT.reducer, TT.init({}), [FS('home'), P('home'), C('home', 'warning'), C('home', 'point2'), TMO('away', 'timeout'), P('away')]);
    const sec = conductSec(keyStats(racketView('tabletennis', s, R1)!));
    assert.ok(sec, 'a Conduct & timeouts section');
    const r = Object.fromEntries(sec!.rows.map((x) => [x.key, x]));
    assert.deepEqual([r.cv.home, r.cv.away], ['2', '0']);
    assert.deepEqual([r.warn.home, r.warn.away], ['1', '0']);
    assert.deepEqual([r.penPts.home, r.penPts.away], ['2', '0'], 'points conceded by the offender');
    assert.deepEqual([r.tmo.home, r.tmo.away], ['0', '1']);
  });
  test('padel: a game penalty concedes every point of the game, one violation', () => {
    const s = run(padel.reducer, NEWPADEL(), [P('home'), C('away', 'game'), TV('home', 'warning')]);
    const r = Object.fromEntries(conductSec(keyStats(racketView('padel', s, R1)!))!.rows.map((x) => [x.key, x]));
    assert.equal(r.cv.away, '1');
    assert.equal(r.penPts.away, '3', '15-0 → game: three penalty points');
    assert.equal(r.tv.home, '1');
  });
  test('badminton and pickleball and squash have the section too', () => {
    const b = run(badminton.reducer, badminton.init({}), [FS('home'), P('home'), C('away', 'point')]);
    assert.ok(conductSec(keyStats(racketView('badminton', b, R1)!)));
    const p = run(PB.reducer, PB.init({ playersPerSide: 1 }), [FS('home'), P('home'), TMO('home', 'medical')]);
    assert.equal(conductSec(keyStats(racketView('pickleball', p, R1)!))!.rows.find((x) => x.key === 'med')!.home, '1');
    const q = run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), C('home', 'warning')]);
    assert.ok(conductSec(keyStats(racketView('squash', q, R1)!)));
  });
  test('tennis too: code / time violations and toilet breaks', () => {
    const t = run(tennis.reducer, tennis.init(), [FS('home'), P('home'), C('away', 'warning'), TMO('home', 'toilet'), TV('home', 'warning')]);
    const sec = conductSec(tennisKeyStats(tennisView(t, R1)!));
    assert.ok(sec);
    const r = Object.fromEntries(sec!.rows.map((x) => [x.key, x]));
    assert.equal(r.cv.away, '1');
    assert.equal(r.tv.home, '1');
    assert.equal(r.toilet.home, '1');
  });
  test('per game / set scope', () => {
    const s = run(TT.reducer, TT.init({}), [FS('home'), ...L.rGame(11, 0), C('away', 'warning')]);
    const v = racketView('tabletennis', s, R1)!;
    assert.equal(conductSec(keyStats(v, 1)), undefined, 'game 1 had none');
  });
});

describe('RB6: exact, and never a false 0', () => {
  test('a match with no conduct, timeout or let has no section', () => {
    const s = run(TT.reducer, TT.init({}), L.TT_LOG);
    assert.equal(conductSec(keyStats(racketView('tabletennis', s, R1)!)), undefined);
    const t = run(tennis.reducer, tennis.init(), L.TENNIS_BO3);
    assert.equal(conductSec(tennisKeyStats(tennisView(t, R1)!)), undefined);
  });
  test('only the rows recorded', () => {
    const s = run(TT.reducer, TT.init({}), [FS('home'), P('home'), TMO('home', 'timeout')]);
    assert.deepEqual(conductSec(keyStats(racketView('tabletennis', s, R1)!))!.rows.map((r) => r.key), ['tmo']);
  });
  test('hostile marks are ignored', () => {
    const ev = [
      { id: 1, stamp: 'G1', icon: '', label: '', kind: 'conduct', pen: { level: 'warning', by: 'nobody' } },
      { id: 2, stamp: 'G1', icon: '', label: '', kind: 'timeout', tmo: '__proto__', side: 'home' },
      { id: 3, stamp: 'G1', icon: '', label: '', kind: 'timeout', tmo: 'timeout', side: 'nobody' },
      { id: 4, stamp: 'G1', icon: '', label: '', kind: 'conduct', pen: null },
    ] as unknown as LiveEvent[];
    assert.deepEqual(conductRows('tabletennis', ev), []);
    assert.deepEqual(conductRows('tabletennis', null as unknown as LiveEvent[]), []);
  });
});

// ------------------------------------------------------------- RB7–RB10 --

describe('RB7: pickleball Ace', () => {
  test('a how for the server, credited to the winner; declared in the schema', () => {
    const d = howDef('pickleball', 'ace');
    assert.ok(d);
    assert.equal(d!.serve, 'server');
    assert.ok(detailKeys('pickleball').includes('aces'));
    assert.ok(statDefIn(STAT_SCHEMAS.pickleball as never, 'aces'));
  });
  test('the Stats tab counts it', () => {
    const s = run(PB.reducer, PB.init({ playersPerSide: 1, pointDetail: true }), [FS('home'), P('home'), D({ how: 'ace' })]);
    const r = keyStats(racketView('pickleball', s, R1)!).find((x) => x.id === 'serve')!.rows.find((x) => x.key === 'aces');
    assert.deepEqual([r!.home, r!.away], ['1', '0']);
  });
});

describe('RB8: a Serve shot for squash / pickleball winners', () => {
  test('offered and declared', () => {
    for (const sp of ['squash', 'pickleball'] as const) {
      assert.ok(RACKET_SHOTS[sp].some((x) => x.id === 'serve'), sp);
      assert.ok(statDefIn(STAT_SCHEMAS[sp] as never, 'winnersServe'), sp);
    }
  });
  test('table tennis keeps its Ace (no Serve shot); tennis lists unchanged', () => {
    assert.ok(DETAIL_HOWS.tabletennis.some((h) => h.how === 'ace'));
    assert.equal(DETAIL_HOWS.tennis.length, 5);
  });
});

describe('RB9: fault-type labels', () => {
  test('badminton: a serve fault offers "Missed / balk / delay"; the old "fault" still reads and counts', () => {
    const sf = howDef('badminton', 'sf')!;
    assert.ok(sf.offer!.includes('balk'));
    assert.ok(!sf.offer!.includes('fault'));
    assert.ok(sf.strokes!.includes('fault'), 'an old log still reads');
    assert.equal(STROKES.balk.label, 'Missed / balk / delay');
    assert.equal(errTypeOf('badminton', { how: 'sf', stroke: 'fault' }), 'fault');
    assert.equal(pdText({ how: 'sf', stroke: 'balk' }, true, 'badminton'), 'Service fault (missed / balk / delay)');
    // the unforced error "fault" is unchanged (C8)
    assert.deepEqual(howDef('badminton', 'ue')!.strokes, ['net', 'out', 'fault', 'long', 'wide']); // racket-batch6 R6-1
    assert.ok(statDefIn(STAT_SCHEMAS.badminton as never, 'sfBalk'));
  });
  test('squash: below the service line / short line / side wall first; old "short" kept', () => {
    const sf = howDef('squash', 'sf')!;
    for (const k of ['low', 'shortLine', 'sideWall', 'foot', 'out']) assert.ok(sf.offer!.includes(k), k);
    assert.ok(!sf.offer!.includes('short'));
    assert.ok(sf.strokes!.includes('short'));
    for (const k of ['sfLow', 'sfShortLine', 'sfSideWall', 'sfShort']) assert.ok(statDefIn(STAT_SCHEMAS.squash as never, k), k);
  });
  test('pickleball: Illegal serve', () => {
    assert.ok(howDef('pickleball', 'sf')!.strokes!.includes('illegal'));
    assert.ok(statDefIn(STAT_SCHEMAS.pickleball as never, 'sfIllegal'));
  });
  test('an old squash "short" still reaches the Stats tab row', () => {
    const s = run(SQ.reducer, SQ.init({ pointDetail: true }), [FS('home'), P('away'), D({ how: 'sf', stroke: 'short' })]);
    const rows = errorTypeRows(racketView('squash', s, R1)!);
    assert.ok(rows.some((r) => r.key === 'sf-short' && r.home === '1'));
  });
  test('the chips read the offer (old type shown only on its own point)', () => {
    assert.match(read('src/sports/PointDetailRow.tsx'), /offer \?\? sel\.strokes/);
    assert.match(read('src/sports/RallyPointEditor.tsx'), /offer/);
  });
});

describe('RB10: receiver faults go to Lost by rule', () => {
  test('badminton and pickleball name them', () => {
    assert.match(howDef('badminton', 'rule')!.hint!, /receiver/);
    assert.match(howDef('pickleball', 'rule')!.hint!, /receiver/);
  });
});

// ------------------------------------------------------------ RB12–RB16 --

describe('RB12: table tennis edge / net cord; lets in table tennis and badminton', () => {
  test('Edge / net cord is a table tennis winner shot (winnersEdge declared)', () => {
    assert.ok(RACKET_SHOTS.tabletennis.some((x) => x.id === 'edge'));
    assert.ok(statDefIn(STAT_SCHEMAS.tabletennis as never, 'winnersEdge'));
    const ev = applyPointDetail([{ id: 1, stamp: 'G1', icon: '', label: '', kind: 'point', side: 'home' }], { pd: { how: 'winner', shot: 'edge' } }, 'tabletennis')!;
    assert.equal(ev[0].pd?.shot, 'edge');
    assert.match(pdText(ev[0].pd, true, 'tabletennis'), /Edge/);
  });
  test('a Let marker in table tennis and badminton (no score); still none in pickleball', () => {
    const t = run(TT.reducer, TT.init({}), [FS('home'), P('home'), { type: 'LET' }]);
    assert.equal(t.events.at(-1)!.kind, 'let');
    assert.deepEqual(t.current, { home: 1, away: 0 });
    const b = run(badminton.reducer, badminton.init({}), [FS('home'), P('home'), { type: 'LET' }]);
    assert.equal(b.events.at(-1)!.kind, 'let');
    const p = run(PB.reducer, PB.init({}), [FS('home'), P('home'), { type: 'LET' }]);
    assert.notEqual(p.events.at(-1)!.kind, 'let');
  });
  test('lets reach the Stats tab (table tennis / badminton) and a correction keeps them', () => {
    const t = run(TT.reducer, TT.init({}), [FS('home'), P('home'), { type: 'LET' }, P('away')]);
    const r = conductSec(keyStats(racketView('tabletennis', t, R1)!))!.rows.find((x) => x.key === 'lets');
    assert.ok(r);
    const again = TT.reducer(t, { type: 'EDIT_LOG', payload: { points: [{ side: 'home' }, { side: 'away' }] } });
    assert.ok(again.events.some((e) => e.kind === 'let'));
  });
  test('Quick options offer the Let tile in table tennis and badminton', () => {
    assert.match(read('src/sports/RacketQuickOptions.tsx'), /LET_TILE_SPORTS/);
  });
});

describe('RB14: squash video review (PSA)', () => {
  const RV = (side: Side, upheld: unknown): ScoreAction => ({ type: 'REVIEW', side, payload: { upheld } });
  test('a marker (no score), upheld or not', () => {
    const s = run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), RV('away', true)]);
    const e = s.events.at(-1)!;
    assert.equal(e.kind, 'review');
    assert.equal(e.rev, 'upheld');
    assert.ok(isMark(e));
    assert.deepEqual(s.current, { home: 1, away: 0 });
  });
  test('one unsuccessful review per player per game; an upheld one is kept', () => {
    let s = run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), RV('away', true), RV('away', true), RV('away', false)]);
    const n = s.events.filter((e) => e.kind === 'review').length;
    s = SQ.reducer(s, RV('away', false));
    assert.equal(s.events.filter((e) => e.kind === 'review').length, n, 'the 2nd unsuccessful one is refused');
    s = run(SQ.reducer, s, [...L.rGame(0, 11).slice(0, 11)]);
    s = SQ.reducer(s, RV('away', false));
    assert.equal(s.events.filter((e) => e.kind === 'review').length, n + 1, 'a new game, a new review');
  });
  test('hostile: not squash, no side, a non-boolean outcome', () => {
    assert.equal(run(TT.reducer, TT.init({}), [FS('home'), RV('home', true)]).events.length, 0);
    const s0 = run(SQ.reducer, SQ.init({}), [FS('home')]);
    assert.equal(SQ.reducer(s0, RV('home', 'yes')), s0);
    assert.equal(SQ.reducer(s0, { type: 'REVIEW', payload: { upheld: true } }), s0);
  });
  test('Stats: video reviews and how many were upheld', () => {
    const s = run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), RV('away', true), RV('away', false)]);
    const r = conductSec(keyStats(racketView('squash', s, R1)!))!.rows.find((x) => x.key === 'rev')!;
    assert.equal(r.away, '2 (1 upheld)');
  });
});

describe('RB16: a pickleball technical in side-out scoring', () => {
  test('a point to the receiving team, serve unchanged (USA Pickleball 13.G)', () => {
    const s0 = run(PB.reducer, PB.init({ scoring: 'sideout', playersPerSide: 2 }), [FS('home')]);
    const s = PB.reducer(s0, C('home', 'point'));
    assert.deepEqual(s.current, { home: 0, away: 1 });
    assert.equal(s.serving, s0.serving);
    assert.equal(s.serverNo, s0.serverNo);
  });
});

describe('RB11 / RB17: settings words hold; one tap still scores; commentary names the new choices', () => {
  test('a point button is still one dispatch', () => {
    const s = run(PB.reducer, PB.init({ pointDetail: true }), [FS('home'), P('home')]);
    assert.deepEqual(s.current, { home: 1, away: 0 });
  });
  test('hostile detail values store nothing', () => {
    const base: LiveEvent[] = [{ id: 1, stamp: 'G1', icon: '', label: '', kind: 'point', side: 'home' }];
    const ev = applyPointDetail(base, { pd: { how: 'winner', shot: '__proto__' } }, 'squash')!;
    assert.equal(ev[0].pd?.shot, undefined);
    assert.equal(applyPointDetail(base, { pd: { how: 'edge' } }, 'tabletennis'), null);
  });
  test('commentary: a pickleball ace and a TT edge winner', () => {
    const p = { side: 'home' as Side, pd: { how: 'ace' as const } };
    assert.match(racketSentence('pickleball', p as never, { winner: 'Hana', loser: 'Asha', server: 'Hana' }, 'rally') ?? '', /[Aa]ce/);
    const e = { side: 'home' as Side, pd: { how: 'winner' as const, shot: 'edge' } };
    assert.match(racketSentence('tabletennis', e as never, { winner: 'Hana', loser: 'Asha', server: 'Hana' }, 'point') ?? '', /Edge/);
  });
  test('the opposite side helper (sanity)', () => assert.equal(opp('home'), 'away'));
});
