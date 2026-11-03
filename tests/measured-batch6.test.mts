/**
 * Measured sports batch 6 (expert audit docs/sport-expert/measured.md P2 items,
 * breaks docs/security/breaks/measured-batch6.md): precision "Stats to track"
 * per event, the archery penalty inside a match, golf maximum score / stats at
 * setup / penalty guard / match-play hole notes, cycling relegation and UCI DQ
 * reasons, athletics start-conduct cards and field fouls, the weightlifting
 * re-attempt, crew exclusion vs disqualification and the swimming take-over → DQ
 * link. Old rows read identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, phaseLines, groupMeet, eventCommentary, matchOutcome, setMatchEnd,
  precisionTrackOptions, eventRules, setPrecisionOverride, setMatchPenalty, raceDqCodesFor, athDqReasonStale,
  startCard, reAttempt, takeoverDq, precisionRuleNote, recordLift, liftingOrder,
  type DisciplineDef, type EntryResult, type LiftAttempt, type ResultEntry, type PhaseFormat, type MeetPhase, type ArchSide, type Arrow,
} from '../src/data/results/index.ts';
import {
  standardPar72, rankLeaderboard, penaltyStrokes, roundStats, type GolfCard, type RankInput,
} from '../src/sports/golf/engine.ts';
import { GOLF_META } from '../src/sports/golf/meta.ts';
import { golfFormatOf } from '../src/data/golfLeaderboard.ts';
import { golfTrackSummary } from '../src/sports/golf/track.ts';
import { golfMatchReducer, initGolfMatch, holeAction } from '../src/sports/golf/match.ts';
import { golfMatchFeed, golfRoundFeed } from '../src/sports/golf/feed.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const row = (i: number, result: EntryResult = {}, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result: { order: i, ...result } });
const U16B = { age: 'U16', gender: 'M' as const };
const ph = (id: string, format: PhaseFormat, entries: ResultEntry[], status: MeetPhase['status'] = 'live'): MeetPhase => ({ id, format, status, date: '2026-11-03T09:00:00Z', entries });
const lines = (f: PhaseFormat, es: ResultEntry[]) => eventCommentary(groupMeet([ph('x', f, es)])[0]).map((i) => i.text).join('\n');

/* --------------------------- B1 / B2 precision capture --------------------------- */

describe('B1 / B2 / F1 / F2: precision "Stats to track" per event', () => {
  const WL = D('wl.total'), AR = D('shoot.10mar'), R70 = D('arch.r70'), R70T = D('arch.r70.team'), M100 = D('ath.100m');
  test('each precision event offers its own capture switches', () => {
    assert.deepEqual(precisionTrackOptions(WL).map((o) => o.key), ['wlLights', 'wlJury']);
    assert.deepEqual(precisionTrackOptions(AR).map((o) => o.key), ['shootPen']);
    assert.deepEqual(precisionTrackOptions(R70T).map((o) => o.key), ['archTeamArrows']);
    assert.deepEqual(precisionTrackOptions(R70), []);
    assert.deepEqual(precisionTrackOptions(M100), []);
  });
  test('the event override wins over the (locked) competition rule, both ways', () => {
    assert.equal(eventRules(WL, { rules: {}, track: { wlLights: true } }).wlLights, true);
    assert.equal(eventRules(WL, { rules: { wlJury: true }, track: { wlJury: false } }).wlJury, false);
    assert.equal(eventRules(AR, { rules: undefined, track: { shootPen: true } }).shootPen, true);
    assert.equal(eventRules(R70T, { track: { archTeamArrows: true } }).archTeamArrows, true);
  });
  test('F1: no override → the rules exactly as stored (old phases)', () => {
    const rules = { wlStep: 2, wlLights: true };
    assert.deepEqual(eventRules(WL, { rules }), rules);
    assert.deepEqual(eventRules(WL, { rules: undefined }), {});
  });
  test('B2: hostile or foreign overrides are ignored', () => {
    const r = eventRules(WL, { rules: {}, track: { wlLights: 'yes' as unknown as boolean, wlJury: 1 as unknown as boolean, shootPen: true, reaction: true } });
    assert.equal(r.wlLights, undefined);
    assert.equal(r.wlJury, undefined);
    assert.equal(r.shootPen, undefined, 'a shooting key on a lifting event');
    assert.equal(eventRules(R70, { track: { archTeamArrows: true } }).archTeamArrows, undefined, 'team arrows on an individual event');
  });
  test('F1: picking the meet’s value drops the override', () => {
    assert.deepEqual(setPrecisionOverride(undefined, 'wlLights', true, {}), { wlLights: true });
    assert.equal(setPrecisionOverride({ wlLights: true }, 'wlLights', false, {}), undefined);
    assert.deepEqual(setPrecisionOverride({ reaction: true }, 'wlJury', true, { wlJury: false }), { reaction: true, wlJury: true });
    assert.equal(setPrecisionOverride({ shootPen: false }, 'shootPen', true, { shootPen: true }), undefined);
  });
  test('F2: the header follows the event’s capture', () => {
    assert.match(precisionRuleNote(AR, eventRules(AR, { track: { shootPen: true } })), /−2 button on each series/);
    assert.match(precisionRuleNote(WL, eventRules(WL, { track: { wlLights: true, wlJury: true } })), /referees’ lights on every attempt · jury reversals in view/);
  });
});

/* ------------------------------ B3 / B4 archery match ------------------------------ */

describe('B3 / B4 / F3: archery penalty inside a match', () => {
  const side = (ends: Arrow[][], pen?: number[]): ArchSide => ({ ends, ...(pen ? { pen } : {}) });
  const A: Arrow[][] = [['X', 10, 9], [9, 9, 9], [10, 10, 10]];
  const B: Arrow[][] = [[10, 10, 8], [9, 9, 8], [10, 10, 9]];
  test('no penalty: scores exactly as before', () => {
    const o = matchOutcome(side(A), side(B), 'sets');
    assert.deepEqual(o.ends.map((e) => [e.a, e.b, e.pa, e.pb]), [[29, 28, 2, 0], [27, 26, 2, 0], [30, 29, 2, 0]]);
    assert.equal(o.winner, 'a');
  });
  test('the end’s highest arrow off: the end, set points and winner follow; arrows stay as shot', () => {
    const o = matchOutcome(side(A, [1]), side(B), 'sets');
    assert.deepEqual(o.ends[0], { a: 19, b: 28, pa: 0, pb: 2 });
    assert.equal(o.ta, 19 + 27 + 30);
    assert.equal(o.a, 4);
    const c = matchOutcome(side(A, [0, 0, 1]), side(B), 'cumulative');
    assert.equal(c.ta, 29 + 27 + 20);
  });
  test('setMatchPenalty stores per end, clamps, and clearing the end clears it', () => {
    let r: EntryResult = { mp: { '1': side(A) } };
    r = setMatchPenalty(r, '1', 1, 1);
    assert.deepEqual(r.mp!['1'].pen, [0, 1, 0]);
    assert.deepEqual(r.mp!['1'].ends, A, 'the arrows are untouched');
    r = setMatchPenalty(r, '1', 1, 0);
    assert.equal(r.mp!['1'].pen, undefined, 'no penalty left → the key goes');
    r = setMatchPenalty(r, '1', 2, 9);
    assert.deepEqual(r.mp!['1'].pen, [0, 0, 3]);
    assert.equal(setMatchPenalty({ mp: { '1': side([]) } }, '1', 0, 1).mp!['1'].pen, undefined, 'no end, no penalty');
    const cleared = setMatchEnd(r, '1', 2, null);
    assert.equal(cleared.mp!['1'].pen, undefined);
  });
  test('B4: hostile stored penalties never raise a score or crash', () => {
    for (const pen of [[-1], [1.5], ['2' as unknown as number], [99], null as unknown as number[], 'x' as unknown as number[]]) {
      const o = matchOutcome(side(A, pen), side(B), 'sets');
      assert.ok(o.ends[0].a >= 0 && o.ends[0].a <= 29, JSON.stringify(pen));
    }
    assert.equal(matchOutcome(side(A, [99]), side(B), 'sets').ends[0].a, 0, 'more than the end holds → every arrow off');
  });
});

/* ------------------------------ B5 golf capture at setup ------------------------------ */

describe('B5: golf stats to track in the round summary', () => {
  test('the summary names what the round keeps', () => {
    assert.equal(golfTrackSummary({ track: ['putts', 'fairway'] }), 'Stats kept: putts · fairways');
    assert.equal(golfTrackSummary({ track: [] }), 'Stats kept: strokes only');
    assert.equal(golfTrackSummary({}), '', 'no round setting → each marker’s phone (as before)');
    assert.equal(golfTrackSummary({ track: ['nope', 7] }), 'Stats kept: strokes only');
  });
});

/* ------------------------------ B6 / B7 maximum score ------------------------------ */

describe('B6 / B7 / F4: golf maximum score competition (Rule 21.2)', () => {
  const H = standardPar72();
  const rcv = H.map(() => 0);
  const par = H.map((h) => h.par);
  const input = (id: string, strokes: GolfCard['strokes']): RankInput => ({ id, status: 'finished', rounds: [{ card: { strokes }, holes: H, received: rcv }] });
  test('a competition option and its format', () => {
    assert.ok((GOLF_META.formatFields ?? []).find((f) => f.key === 'competition')!.options!.some((o) => o.value === 'maxscore'));
    const f = golfFormatOf({ format: { competition: 'maxscore', maxScore: 'par3' } });
    assert.equal(f.scoring, 'stroke');
    assert.equal(f.maxComp, true);
    assert.equal(f.maxScore, 'par3');
    assert.equal(golfFormatOf({ format: { competition: 'maxscore', maxScore: 'none' } }).maxScore, 'ndb', 'B7: a max-score round always has a cap');
    assert.equal(golfFormatOf({ format: { competition: 'stroke' } }).maxComp, undefined, 'old rounds: no key');
  });
  test('a pickup takes the cap and the round counts; a big hole is capped', () => {
    const pick = [...par]; pick[0] = 'P';
    const big = [...par]; big[1] = 11;
    const even = [...par];
    const board = rankLeaderboard([input('a', pick), input('b', big), input('c', even)], { scoring: 'stroke', net: false, tieBreak: 'shared', cap: 'par3' });
    const by = new Map(board.map((r) => [r.id, r]));
    assert.equal(by.get('c')!.position, 1);
    assert.equal(by.get('a')!.total, 3, 'pickup = par + 3');
    assert.equal(by.get('a')!.status, 'finished');
    assert.equal(by.get('a')!.position, 2);
    assert.equal(by.get('b')!.total, 3, '11 on a par 4 capped at 7');
    assert.equal(by.get('a')!.positionLabel, 'T2');
  });
  test('net double bogey cap uses the strokes received', () => {
    const r2 = H.map((_, i) => (i === 0 ? 1 : 0));
    const big = [...par]; big[0] = 12;
    const b = rankLeaderboard([{ id: 'x', status: 'finished', rounds: [{ card: { strokes: big }, holes: H, received: r2 }] }], { scoring: 'stroke', net: false, tieBreak: 'shared', cap: 'ndb' });
    assert.equal(b[0].total, 3, 'par + 2 + 1 received');
  });
  test('countback uses the capped holes too', () => {
    const a = [...par]; a[17] = 'P'; a[0] = par[0] - 3;  // −3 front, +3 (cap) on 18
    const b = [...par];
    const board = rankLeaderboard([input('a', a), input('b', b)], { scoring: 'stroke', net: false, tieBreak: 'countback', cap: 'par3' });
    assert.equal(board[0].id, 'b', 'last 9 / 6 / 3 / 1: b is better (a took the cap on 18)');
  });
  test('F1 / B18: without a cap a pickup is still no return (stroke play unchanged)', () => {
    const pick = [...par]; pick[0] = 'P';
    const board = rankLeaderboard([input('a', pick), input('c', par)], { scoring: 'stroke', net: false, tieBreak: 'shared' });
    assert.equal(board.find((r) => r.id === 'a')!.positionLabel, 'DNF');
  });
  test('the commentary says a pickup scores the maximum', () => {
    const c: GolfCard = { strokes: H.map((h, i) => (i === 0 ? 'P' : i < 2 ? h.par : null)) };
    const t = golfRoundFeed([{ id: 'a', name: 'Asha', card: c, holes: H, received: rcv }], { scoring: 'stroke', maxComp: 'par3' }).flatMap((g) => g.items.map((i) => i.text)).join('\n');
    assert.match(t, /Asha picked up · scores the maximum \(7\)/);
    const old = golfRoundFeed([{ id: 'a', name: 'Asha', card: c, holes: H, received: rcv }], { scoring: 'stroke' }).flatMap((g) => g.items.map((i) => i.text)).join('\n');
    assert.match(old, /Asha picked up \(no return\)/);
  });
});

/* ------------------------------ B8 penalty strokes ------------------------------ */

describe('B8: golf penalty strokes never exceed the strokes − 1', () => {
  test('penaltyStrokes clamps and ignores hostile values', () => {
    assert.equal(penaltyStrokes(1, 5), 1);
    assert.equal(penaltyStrokes(3, 2), 1);
    assert.equal(penaltyStrokes(2, 1), 0);
    assert.equal(penaltyStrokes(-1, 5), 0);
    assert.equal(penaltyStrokes('2', 5), 0);
    assert.equal(penaltyStrokes(1.5, 5), 0);
    assert.equal(penaltyStrokes(2, 'P'), 2, 'a pickup keeps what was entered');
    assert.equal(penaltyStrokes(99, 'P'), 0, 'hostile on a pickup');
    assert.equal(penaltyStrokes(null, 4), 0);
  });
  test('the stat never counts more than possible; legit cards unchanged', () => {
    const H = standardPar72();
    const strokes = H.map((h) => h.par);
    const ok = roundStats({ strokes, penalties: H.map((_, i) => (i === 0 ? 2 : null)) } as GolfCard, H, H.map(() => 0));
    assert.equal(ok.penalties, 2);
    const bad = roundStats({ strokes: H.map((h, i) => (i === 0 ? 2 : h.par)), penalties: H.map((_, i) => (i === 0 ? 3 : null)) } as GolfCard, H, H.map(() => 0));
    assert.equal(bad.penalties, 1);
  });
});

/* ------------------------------ B9 match play hole notes ------------------------------ */

describe('B9: golf match play — a hole won by penalty or concession', () => {
  const pl = { home: { id: 'h' }, away: { id: 'a' } };
  test('the action carries how, the state keeps it, the feed says it', () => {
    let s = initGolfMatch({ holes: '18' });
    s = golfMatchReducer(s, holeAction('home', pl, { how: 'penalty' }));
    s = golfMatchReducer(s, holeAction('away', pl, {}));
    s = golfMatchReducer(s, holeAction('away', pl, { how: 'conceded' }));
    assert.deepEqual(s.how, ['penalty', null, 'conceded']);
    const t = golfMatchFeed(s, { home: 'Ravi', away: 'Dev' }).flatMap((g) => g.items.map((i) => i.text)).join('\n');
    assert.match(t, /Hole 1: Ravi wins the hole — Dev lost it by penalty \(general penalty\)/);
    assert.match(t, /Hole 3: Dev wins the hole — Ravi conceded it/);
  });
  test('hostile / absent how: old logs replay to the same state', () => {
    let s = initGolfMatch({ holes: '18' });
    s = golfMatchReducer(s, { type: 'HOLE', side: 'home', payload: { winner: 'home', how: 'bribe' } });
    s = golfMatchReducer(s, { type: 'HOLE', payload: { winner: 'halved', how: 'penalty' } });
    assert.equal(s.how, undefined, 'unknown how, or a halved hole: nothing stored');
    assert.deepEqual(Object.keys(s).sort(), Object.keys(golfMatchReducer(golfMatchReducer(initGolfMatch({ holes: '18' }), { type: 'HOLE', payload: { winner: 'home' } }), { type: 'HOLE', payload: { winner: 'halved' } })).sort());
  });
  test('a halved hole can’t be "by penalty"', () => {
    assert.equal(holeAction('halved', pl, { how: 'penalty' }).payload.how, undefined);
  });
});

/* ------------------------------ B10 / B11 cycling relegation ------------------------------ */

describe('B10 / B11: cycling relegation (keirin, scratch)', () => {
  const K = D('cyc.keirin'), S = D('cyc.scratch'), E = D('cyc.elim');
  test('a relegated rider is classified last of the finishers (not out)', () => {
    const r = rankEntries([row(1, { fin: 1, relegated: true }), row(2, { fin: 2 }), row(3, { fin: 3 }), row(4, { status: 'DNF' })], K);
    assert.deepEqual(r.map((x) => [x.id, x.position, x.status]), [['e2', 1, 'ok'], ['e3', 2, 'ok'], ['e1', 3, 'ok'], ['e4', null, 'DNF']]);
  });
  test('several relegated riders keep their line order; scratch: below every lap group', () => {
    const r = rankEntries([row(1, { fin: 2, relegated: true, laps: 1 }), row(2, { fin: 1, relegated: true }), row(3, { fin: 3 }), row(4, { fin: 4 })], S);
    assert.deepEqual(r.map((x) => x.id), ['e3', 'e4', 'e2', 'e1']);
  });
  test('B11: hostile flag ignored; elimination unaffected; old rows identical', () => {
    const r = rankEntries([row(1, { fin: 1, relegated: 'yes' as unknown as true }), row(2, { fin: 2 })], K);
    assert.deepEqual(r.map((x) => x.id), ['e1', 'e2']);
    const e = rankEntries([row(1, { fin: 1, relegated: true }), row(2, { fin: 2 })], E);
    assert.deepEqual(e.map((x) => [x.id, x.position]), [['e1', 1], ['e2', 2]]);
    const old = rankEntries([row(1, { fin: 2 }), row(2, { fin: 1 }), row(3, { fin: 3, laps: 1 })], S);
    assert.deepEqual(old.map((x) => [x.id, x.position]), [['e3', 1], ['e2', 2], ['e1', 3]]);
  });
  test('the heat line says who was relegated', () => {
    const f: PhaseFormat = { discipline: 'cyc.keirin', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'k', eventTitle: 'Keirin U16 Boys' };
    assert.match(lines(f, [row(1, { fin: 1, relegated: true }), row(2, { fin: 2 })]), /Athlete 1 relegated \(placed last of the finishers\)/);
  });
});

/* ------------------------------ B12 DQ code lists ------------------------------ */

describe('B12: DQ reasons from a list (cycling UCI, rowing / canoe)', () => {
  test('cycling and crews get their lists; athletics keeps its own', () => {
    assert.ok(raceDqCodesFor(D('cyc.keirin')).some((c) => /irregular sprint/i.test(c.label)));
    const row1x = raceDqCodesFor(D('row.1x.2000'));
    assert.ok(row1x.some((c) => /excluded from this race/i.test(c.label)));
    assert.ok(row1x.some((c) => /disqualified from the regatta/i.test(c.label)));
    assert.ok(row1x.some((c) => /boat under/i.test(c.label)));
    assert.ok(!row1x.some((c) => /cox/i.test(c.label)), 'no cox in a single scull');
    assert.ok(raceDqCodesFor(D('row.8p.2000')).some((c) => /cox/i.test(c.label)), 'a cox weight reason (coxed boat)');
    const k1 = raceDqCodesFor(D('cs.k1.200'));
    assert.ok(k1.some((c) => /boat/i.test(c.label)));
    assert.ok(!k1.some((c) => /cox/i.test(c.label)), 'no cox in a canoe');
    assert.ok(raceDqCodesFor(D('ath.100m')).every((c) => c.ref.startsWith('TR')));
    assert.deepEqual(raceDqCodesFor(D('swim.100free')), []);
  });
  test('a picked reason goes stale when another rule is typed over it', () => {
    const c = raceDqCodesFor(D('row.1x.2000'))[0];
    assert.equal(athDqReasonStale({ reason: c.label }, 'something else'), true);
    assert.equal(athDqReasonStale({ reason: c.label }, c.ref), false);
  });
});

/* ------------------------------ B13 start cards ------------------------------ */

describe('B13 / F5: athletics start-conduct cards (TR 16.5)', () => {
  test('first a yellow card (still ranked), the second disqualifies', () => {
    const a = startCard({ mark: 11.9 });
    assert.equal(a.step, 'warn');
    assert.equal(a.next.scWarn, true);
    assert.equal(a.next.status, undefined);
    const b = startCard(a.next);
    assert.equal(b.step, 'out');
    assert.equal(b.next.status, 'DQ');
    assert.equal(b.next.ruleRef, 'TR 16.5');
    assert.equal(b.next.scWarn, true);
  });
  test('F5: counted as dq, never fs', () => {
    const M100 = D('ath.100m');
    const f: PhaseFormat = { discipline: 'ath.100m', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'a' };
    const out = startCard(startCard({}).next).next;
    const l = phaseLines(f, rankEntries([row(1, { lane: 4, mark: 11.9 }), row(2, { lane: 5, ...out })], M100));
    assert.equal(l.find((x) => x.playerId === 'p2')!.stats.dq, 1);
    assert.equal(l.find((x) => x.playerId === 'p2')!.stats.fs, undefined);
  });
  test('the commentary names the yellow card; hostile flag ignored', () => {
    const f: PhaseFormat = { discipline: 'ath.100m', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'a', eventTitle: '100 m U16 Boys' };
    assert.match(lines(f, [row(1, { lane: 4, mark: 11.9, scWarn: true }), row(2, { lane: 5, mark: 12.1 })]), /Athlete 1 yellow card for start conduct \(TR 16\.5\)/);
    assert.doesNotMatch(lines(f, [row(1, { lane: 4, mark: 11.9, scWarn: 1 as unknown as true }), row(2, { lane: 5, mark: 12.1 })]), /yellow card/);
  });
});

/* ------------------------------ B14 field fouls ------------------------------ */

describe('B14: field fouls on the stat line', () => {
  const LJ = D('ath.lj');
  const f: PhaseFormat = { discipline: 'ath.lj', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'lj' };
  test('fouls counted from the trials; none → 0 written only when trials exist', () => {
    const l = phaseLines(f, rankEntries([row(1, { attempts: [{ mark: 5.1 }, { foul: true }, { pass: true }, { foul: true }] }), row(2, { attempts: [{ mark: 5.0 }] }), row(3, {})], LJ));
    assert.equal(l.find((x) => x.playerId === 'p1')!.stats.fieldFouls, 2);
    assert.equal(l.find((x) => x.playerId === 'p2')!.stats.fieldFouls, 0);
    assert.equal(l.find((x) => x.playerId === 'p3')?.stats.fieldFouls, undefined);
  });
  test('the schema has it (keyed: old lines read "not tracked")', () => {
    const k = STAT_SCHEMAS.athletics.stats.find((s) => s.key === 'fieldFouls');
    assert.ok(k);
    assert.equal(k!.coverage, 'keyed');
  });
});

/* ------------------------------ B15 / B16 re-attempt ------------------------------ */

describe('B15 / B16: weightlifting re-attempt after a loading error', () => {
  const G = (kg: number, seq: number): LiftAttempt => ({ kg, good: true, seq });
  const N = (kg: number, seq: number): LiftAttempt => ({ kg, good: false, seq });
  test('the decided attempt goes back to declared; the coach’s later declaration stays', () => {
    const l = reAttempt([G(100, 1), N(105, 4), { kg: 106 }], 1);
    assert.deepEqual(l, [G(100, 1), { kg: 105, reat: true }, { kg: 106 }]);
  });
  test('the app’s automatic next declaration goes (it followed the old decision)', () => {
    const l = reAttempt([N(100, 1), { kg: 100, auto: true }], 0);
    assert.deepEqual(l, [{ kg: 100, reat: true }]);
    const again = recordLift(l, { good: true }, 9);
    assert.equal(again[0].good, true);
    assert.equal(again[0].seq, 9);
    assert.equal(again[0].reat, true, 'the decided re-attempt still shows R');
    assert.equal(again[1].kg, 101);
  });
  test('the lifter is called again for that attempt', () => {
    const es = [row(1, { lifts: { snatch: reAttempt([G(100, 1), N(105, 3)], 1) } }), row(2, { lifts: { snatch: [G(102, 2), { kg: 107 }] } })];
    const order = liftingOrder(es, 'snatch');
    assert.deepEqual(order.map((c) => [c.entryId, c.attempt, c.kg]), [['e1', 2, 105], ['e2', 2, 107]]);
  });
  test('B16: a declined / undecided attempt, or one with a later lift taken, is not changed', () => {
    const declined: LiftAttempt[] = [{ kg: 100, pass: true, good: false, seq: 1 }];
    assert.deepEqual(reAttempt(declined, 0), declined);
    const undecided: LiftAttempt[] = [{ kg: 100 }];
    assert.deepEqual(reAttempt(undecided, 0), undecided);
    const later = [G(100, 1), N(105, 3), G(105, 5)];
    assert.deepEqual(reAttempt(later, 1), later);
    assert.deepEqual(reAttempt(undefined, 0), []);
  });
});

/* ------------------------------ B17 take-over → DQ ------------------------------ */

describe('B17: swimming early take-over → DQ with the leg', () => {
  const R = D('swim.4x100free');
  test('the first early leg (beyond −0.03) gives the SW 10.13 DQ with the leg', () => {
    const n = takeoverDq(R, { mark: 220, takeovers: [0.2, -0.05, -0.08] });
    assert.ok(n);
    assert.equal(n!.status, 'DQ');
    assert.equal(n!.ruleRef, 'SW 10.13');
    assert.match(n!.reason!, /Early take-off — leg 3/);
    assert.equal(n!.takeovers!.length, 3, 'the readings stay');
  });
  test('within tolerance, already out, or not a relay: nothing', () => {
    assert.equal(takeoverDq(R, { takeovers: [-0.03, 0.1] }), null);
    assert.equal(takeoverDq(R, { status: 'DQ', takeovers: [-0.2] }), null);
    assert.equal(takeoverDq(D('swim.100free'), { takeovers: [-0.2] }), null);
    assert.equal(takeoverDq(R, { takeovers: ['x' as unknown as number] }), null);
  });
});
