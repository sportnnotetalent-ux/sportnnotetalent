/**
 * Measured sports batch 5 (expert audit docs/sport-expert/measured.md, breaks
 * docs/security/breaks/measured-batch5.md): WD keeps what was done (weightlifting
 * snatch, shooting series), shooting DNF, result-changing entries offered
 * whatever the switch (shooting −2, weightlifting jury, a new archery penalty),
 * an athletics draw of lots at the qualifying line, the crew false-start
 * warning step, commentary for golf WD / DQ, walk red cards and false-start
 * warnings, a separate FS stat, golf's maximum score and match-play fields,
 * and the rule lines on the results headers. Old rows read identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, rankByHeat, qualify, liftAwards, liftLines, liftingOrder, activeLift, shootLines, archLines, phaseLines, crewLines,
  setEnd, archTotals, archRowText, archRoundOf, groupMeet, eventCommentary, effectiveStatus,
  withStatusChange, drawOfLots, crewFalseStart, trackRuleLine, precisionRuleNote, juryOffered, penaltyInView, targetStatuses, setArrowPenalty, archPenaltyOf,
  type DisciplineDef, type EntryResult, type LiftAttempt, type ResultEntry, type PhaseFormat, type MeetPhase,
} from '../src/data/results/index.ts';
import { golfRoundFeed, type FeedPlayer } from '../src/sports/golf/feed.ts';
import { standardPar72, type GolfCard } from '../src/sports/golf/engine.ts';
import { GOLF_META } from '../src/sports/golf/meta.ts';
import { matchRules } from '../src/sports/matchRules.ts';
import { golfFormatOf } from '../src/data/golfLeaderboard.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const WL = D('wl.total'), SN = D('wl.snatch'), CJ = D('wl.cj');
const AR = D('shoot.10mar'), R70 = D('arch.r70'), M100 = D('ath.100m'), LJ = D('ath.lj'), X1 = D('row.1x.2000'), W10 = D('ath.walk.10000');
const G = (kg: number, seq: number): LiftAttempt => ({ kg, good: true, seq });
const N = (kg: number, seq: number): LiftAttempt => ({ kg, good: false, seq });
const row = (i: number, result: EntryResult = {}, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result: { order: i, ...result } });

/* ------------------------------ B1 / B4 weightlifting ------------------------------ */

describe('B1 / B4 / F2 / F3: a lifter who withdraws after the snatch keeps the snatch', () => {
  const session = (wd: EntryResult) => [
    row(1, { lifts: { snatch: [G(100, 1), G(105, 4), N(108, 7)], cj: [G(130, 10), G(135, 13), N(140, 16)] } }),
    row(2, { ...wd, lifts: { snatch: [G(102, 2), G(110, 5), N(112, 8)] } }),
    row(3, { lifts: { snatch: [G(98, 3), N(101, 6), N(101, 9)], cj: [G(125, 11), N(130, 14), N(130, 17)] } }),
  ];
  test('the WD lifter (withdrawn now) is ranked 1st in the snatch, not in the total', () => {
    const es = session(withStatusChange(WL, { lifts: { snatch: [G(102, 2), G(110, 5), N(112, 8)] } }, 'WD'));
    assert.equal(es[1].result.wdKeep, true);
    const sn = rankEntries(es, SN);
    assert.deepEqual(sn.filter((r) => r.position != null).map((r) => [r.id, r.position]), [['e2', 1], ['e1', 2], ['e3', 3]]);
    const tot = rankEntries(es, WL);
    assert.equal(tot.find((r) => r.id === 'e2')!.status, 'WD');
    assert.equal(tot.find((r) => r.id === 'e2')!.position, null);
    assert.equal(rankEntries(es, CJ).find((r) => r.id === 'e2')!.position, null);
  });
  test('snatch gold, profile line keeps the snatch (no place, no total)', () => {
    const es = session(withStatusChange(WL, { lifts: { snatch: [G(102, 2), G(110, 5), N(112, 8)] } }, 'WD'));
    const aw = liftAwards(es, { liftMedals: true });
    assert.equal(aw.snatch.find((a) => a.medal === 'gold')?.entryId, 'e2');
    const line = liftLines({ category: undefined }, es, { liftMedals: true }).find((l) => l.playerId === 'p2');
    assert.ok(line, 'a line is written');
    assert.equal(line!.stats.m_wl_snatch, 110);
    assert.equal(line!.stats.liftGolds, 1);
    assert.equal(line!.stats.place, undefined);
    assert.equal(line!.stats.m_wl_total, undefined);
  });
  test('F2: a withdrawn lifter is never called again', () => {
    const es = [row(1, { lifts: { snatch: [G(100, 1), G(105, 3), G(108, 5)], cj: [{ kg: 130 }] } }), row(2, withStatusChange(WL, { lifts: { snatch: [G(102, 2), G(110, 4), G(112, 6)], cj: [{ kg: 135 }] } }, 'WD'))];
    assert.equal(activeLift(es), 'cj');
    assert.deepEqual(liftingOrder(es, 'cj').map((c) => c.entryId), ['e1']);
  });
  test('B4 / F1: an old WD row (no wdKeep) reads exactly as before — unranked everywhere, no line', () => {
    const es = session({ status: 'WD' });
    assert.equal(rankEntries(es, SN).find((r) => r.id === 'e2')!.position, null);
    assert.equal(rankEntries(es, SN).find((r) => r.id === 'e2')!.status, 'WD');
    assert.equal(liftLines({ category: undefined }, es, { liftMedals: true }).some((l) => l.playerId === 'p2'), false);
  });
  test('F3: a WD lifter with no good attempt stays WD (and gets no keep marker)', () => {
    const r = withStatusChange(WL, { lifts: { snatch: [N(100, 1)] } }, 'WD');
    assert.equal(effectiveStatus(r, SN), 'WD');
    assert.equal(withStatusChange(WL, {}, 'WD').wdKeep, undefined);
  });
  test('clearing WD drops the marker; field events never get it', () => {
    const r = withStatusChange(WL, { lifts: { snatch: [G(100, 1)] } }, 'WD');
    assert.equal(withStatusChange(WL, r, undefined).wdKeep, undefined);
    assert.equal(withStatusChange(WL, r, undefined).status, undefined);
    assert.equal(withStatusChange(LJ, { attempts: [{ mark: 5 }] }, 'WD').wdKeep, undefined);
  });
  test('B18: a hostile marker (wdKeep: "yes") is ignored', () => {
    const r = { status: 'WD', wdKeep: 'yes', lifts: { snatch: [G(100, 1)] } } as unknown as EntryResult;
    assert.equal(effectiveStatus(r, SN), 'WD');
  });
});

/* ------------------------------ B2 / B3 shooting ------------------------------ */

describe('B2 / B3 / F4: shooting WD keeps the series fired; DNF', () => {
  const f = { discipline: 'shoot.10mar', category: undefined };
  test('shooting statuses include DNF; other target sports unchanged', () => {
    assert.deepEqual(targetStatuses(AR), ['DNS', 'DNF', 'DQ', 'WD']);
    assert.deepEqual(targetStatuses(R70), ['DNS', 'DQ', 'WD']);
  });
  test('a withdrawn shooter: unranked, the total stays on the sheet, the series reach the profile (no PB key)', () => {
    const es = [row(1, { series: [104.1, 103.2, 102.5, 104.0, 103.3, 102.9], mark: 620 }), row(2, withStatusChange(AR, { series: [105.0, 104.2], mark: 209.2 }, 'WD'))];
    const ranked = rankEntries(es, AR);
    const wd = ranked.find((r) => r.id === 'e2')!;
    assert.equal(wd.position, null);
    assert.equal(wd.bestText, '209.2');
    const line = shootLines(f, ranked, 'match').find((l) => l.playerId === 'p2');
    assert.ok(line);
    assert.equal(line!.stats.comps, 1);
    assert.equal(line!.stats.pts, 209.2);
    assert.equal(line!.stats.m_sh_10mar, undefined);
    assert.equal(line!.stats.place, undefined);
  });
  test('a DNF shooter with a full card never writes the PB key', () => {
    const full = [104.1, 103.2, 102.5, 104.0, 103.3, 102.9];
    const ranked = rankEntries([row(1, { series: full, mark: 620, status: 'DNF' })], AR);
    assert.equal(ranked[0].position, null);
    const line = shootLines(f, ranked, 'match')[0];
    assert.equal(line.stats.m_sh_10mar, undefined);
  });
  test('F1: an old WD shooter (no marker) still writes nothing', () => {
    const ranked = rankEntries([row(1, { series: [105.0], mark: 105, status: 'WD' })], AR);
    assert.equal(shootLines(f, ranked, 'match').length, 0);
  });
});

/* ------------------------------ B5 / B6 penalties in reach ------------------------------ */

describe('B5 / B6: result-changing entries never need the switch', () => {
  test('the −2 sits in view when the switch is on or the row holds one; else behind ⋯', () => {
    assert.equal(penaltyInView(true, false), true);
    assert.equal(penaltyInView(false, true), true);
    assert.equal(penaltyInView(false, false), false);
  });
  test('a jury reversal is offered on any decided attempt, whatever wlJury says', () => {
    assert.equal(juryOffered({ kg: 100, good: true, seq: 1 }), true);
    assert.equal(juryOffered({ kg: 100, good: false, seq: 1 }), true);
    assert.equal(juryOffered({ kg: 100, good: false, pass: true, seq: 1 }), false);
    assert.equal(juryOffered({ kg: 100 }), false);
    assert.equal(juryOffered(undefined), false);
  });
});

/* ------------------------------ B7 / B8 archery penalty ------------------------------ */

describe('B7 / B8 / F5: archery penalty — the highest arrow(s) of the end don\'t count', () => {
  const base = () => setEnd(setEnd({}, 0, ['X', 10, 9, 9, 8, 7]), 1, [10, 10, 9, 9, 9, 8]);
  test('one arrow off end 1: the X stays on the record, the score, 10s and X drop', () => {
    const r = setArrowPenalty(base(), 0, 1);
    assert.deepEqual(r.ends![0], ['X', 10, 9, 9, 8, 7]);
    assert.equal(r.mark, 53 + 55 - 10);
    assert.equal(r.tens, 4 - 1);
    assert.equal(r.xs, 0);
    assert.deepEqual(r.arrPen, [1, 0]);
  });
  test('a later end saved keeps the penalty; clearing it restores the score and drops the key', () => {
    let r = setArrowPenalty(base(), 0, 1);
    r = setEnd(r, 2, [9, 9, 9, 9, 9, 9]);
    assert.equal(r.mark, 53 + 55 + 54 - 10);
    r = setArrowPenalty(r, 0, 0);
    assert.equal(r.mark, 53 + 55 + 54);
    assert.equal(r.arrPen, undefined);
  });
  test('ranks on the net score; the row text says so', () => {
    const a = row(1, setArrowPenalty(base(), 0, 1)), b = row(2, setEnd(setEnd({}, 0, [10, 9, 9, 9, 8, 7]), 1, [10, 10, 9, 9, 9, 8]));
    assert.deepEqual(rankEntries([a, b], R70).map((r) => r.id), ['e2', 'e1']);
    assert.match(archRowText(a.result, archRoundOf('arch.r70')!), /−10 penalty/);
  });
  test('profile line: points net of the penalty, arPen written', () => {
    const ranked = rankEntries([row(1, setArrowPenalty(base(), 0, 1))], R70);
    const line = archLines({ discipline: 'arch.r70', category: undefined }, ranked, 'match')[0];
    assert.equal(line.stats.pts, 98);
    assert.equal(line.stats.arPen, 10);
  });
  test('B8: hostile penalty values never raise the score or go negative', () => {
    const ends = [['X', 10, 9] as ('X' | 10 | 9)[]];
    assert.equal(archPenaltyOf(ends, [-1] as number[]).mark, 0);
    assert.equal(archPenaltyOf(ends, [1.5] as number[]).mark, 0);
    assert.equal(archPenaltyOf(ends, ['2'] as unknown as number[]).mark, 0);
    assert.equal(archPenaltyOf(ends, [9]).mark, 29);
    assert.equal(archTotals(ends, [9]).mark, 0);
    assert.equal(setArrowPenalty({ ends }, 0, 99).arrPen![0], 3);
    assert.equal(setArrowPenalty({ ends }, 5, 1).arrPen, undefined, 'no end 6: nothing to penalise');
  });
  test('F1: an old card (no arrPen) totals exactly as before', () => {
    const r = base();
    assert.equal(r.arrPen, undefined);
    assert.equal(r.mark, 108);
    assert.deepEqual(archTotals(r.ends), { mark: 108, tens: 4, xs: 1, arrows: 12 });
  });
});

/* ------------------------------ B9 athletics draw ------------------------------ */

describe('B9: athletics track — a draw of lots when the qualifiers outnumber the lanes (TR 21.3)', () => {
  const prog = { byPlace: 1, byMark: 2 };
  const es = (d?: [number, number]) => [
    row(1, { lane: 1, mark: 12.5, hand: true }), row(2, { lane: 2, mark: 12.6, hand: true }),
    row(3, { lane: 1, mark: 12.5, hand: true }, 2), row(4, { lane: 2, mark: 12.7, hand: true, ...(d ? { decider: d[0] } : {}) }, 2), row(5, { lane: 3, mark: 12.7, hand: true, ...(d ? { decider: d[1] } : {}) }, 2),
  ];
  test('tie on the q line with one lane short: both listed for the draw', () => {
    const q = qualify(rankByHeat(es(), M100, { handLegal: true }), M100, prog);
    assert.equal(q.marks.size, 5);
    assert.deepEqual(drawOfLots(q, 4).sort(), ['e4', 'e5']);
  });
  test('lanes to spare: no draw (both go through, as now)', () => {
    const q = qualify(rankByHeat(es(), M100, { handLegal: true }), M100, prog);
    assert.deepEqual(drawOfLots(q, 8), []);
  });
  test('the draw entered (1 = through) settles it', () => {
    const q = qualify(rankByHeat(es([1, 2]), M100, { handLegal: true }), M100, prog);
    assert.equal(q.marks.size, 4);
    assert.equal(q.marks.get('e4'), 'q');
    assert.equal(q.marks.has('e5'), false);
    assert.deepEqual(drawOfLots(q, 4), []);
  });
});

/* ------------------------------ B10 / B11 crew false start ------------------------------ */

describe('B10 / B11: crew false start — first a warning, then exclusion', () => {
  test('first false start: yellow card, still racing', () => {
    const s = crewFalseStart({ lane: 3 }, undefined, 'rowing');
    assert.equal(s.step, 'warn');
    assert.equal(s.next.fsWarn, true);
    assert.equal(s.next.status, undefined);
  });
  test('second false start by the same crew: excluded (FS)', () => {
    const s = crewFalseStart({ lane: 3, fsWarn: true }, undefined, 'canoe');
    assert.equal(s.step, 'out');
    assert.equal(s.next.status, 'FS');
    assert.match(s.next.ruleRef ?? '', /second false start/i);
    assert.equal(s.next.fsWarn, true);
  });
  test('meet rule "zero": the first false start excludes', () => {
    assert.equal(crewFalseStart({}, { crewFalseStart: 'zero' }, 'rowing').step, 'out');
  });
  test('a warned crew is still ranked; an excluded one is not', () => {
    const rows = rankEntries([row(1, { lane: 1, mark: 420.5, fsWarn: true }), row(2, { lane: 2, mark: 421, status: 'FS', fsWarn: true })], X1);
    assert.equal(rows[0].position, 1);
    assert.equal(rows[1].position, null);
  });
  test('B18: a hostile warning flag (fsWarn: 1) is not a warning', () => {
    assert.equal(crewFalseStart({ fsWarn: 1 } as unknown as EntryResult, undefined, 'rowing').step, 'warn');
  });
});

/* ------------------------------ B12 commentary ------------------------------ */

const U16B = { age: 'U16', gender: 'M' as const };
const ph = (id: string, format: PhaseFormat, entries: ResultEntry[], status: MeetPhase['status'] = 'live'): MeetPhase => ({ id, format, status, date: '2026-11-03T09:00:00Z', entries });

describe('B12: commentary reads every entered status detail', () => {
  test('race walk: red cards and the penalty zone reach the heat line', () => {
    const f: PhaseFormat = { discipline: 'ath.walk.10000', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'w10', eventTitle: '10 km walk U16 Boys', road: { penaltyZone: true } as PhaseFormat['road'] };
    const t = eventCommentary(groupMeet([ph('w', f, [row(1, { fin: 1, mark: 2900 }), row(2, { fin: 2, mark: 2950, rc: 3 }), row(3, { fin: 3, mark: 3000, rc: 1 })])])[0]).map((i) => i.text).join('\n');
    assert.match(t, /Athlete 2 3 red cards — penalty zone 1 min/);
    assert.match(t, /Athlete 3 1 red card/);
  });
  test('B18: hostile red-card counts are ignored', () => {
    const f: PhaseFormat = { discipline: 'ath.walk.10000', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'w10', eventTitle: '10 km walk U16 Boys' };
    const t = eventCommentary(groupMeet([ph('w', f, [row(1, { fin: 1, rc: -3 }), row(2, { fin: 2, rc: 'x' as unknown as number })])])[0]).map((i) => i.text).join('\n');
    assert.doesNotMatch(t, /red card/);
  });
  test('rowing: a crew warned for a false start (yellow card) and one excluded', () => {
    const f: PhaseFormat = { discipline: 'row.1x.2000', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'r1', eventTitle: 'Single sculls U16 Boys' };
    const t = eventCommentary(groupMeet([ph('r', f, [row(1, { lane: 1, mark: 420, fsWarn: true }), row(2, { lane: 2, status: 'FS', fsWarn: true, ruleRef: 'Excluded — second false start' })])])[0]).map((i) => i.text).join('\n');
    assert.match(t, /Athlete 1 warned for a false start \(yellow card\)/);
    assert.match(t, /Athlete 2 FS \(Excluded — second false start\)/);
  });
  test('athletics: the athlete charged with the race\'s false start is named', () => {
    const f: PhaseFormat = { discipline: 'ath.100m', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'a1', eventTitle: '100 m U16 Boys' };
    const t = eventCommentary(groupMeet([ph('a', f, [row(1, { lane: 4, mark: 11.9, fsWarn: true }), row(2, { lane: 5, mark: 12.1 })])])[0]).map((i) => i.text).join('\n');
    assert.match(t, /Athlete 1 charged with the false start/);
  });
  test('F1: an old heat (no new keys) reads exactly as before', () => {
    const f: PhaseFormat = { discipline: 'ath.100m', category: U16B, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'a1', eventTitle: '100 m U16 Boys' };
    const t = eventCommentary(groupMeet([ph('a', f, [row(1, { lane: 4, mark: 11.9 }), row(2, { lane: 5, mark: 12.1 })])])[0]).map((i) => i.text);
    assert.deepEqual(t, ['100 m U16 Boys · Final: Athlete 1 wins in 11.90; Athlete 2 12.10']);
  });

  const H = standardPar72();
  const card = (n: number, admin?: GolfCard['admin']): GolfCard => ({ strokes: H.map((h, i) => (i < n ? h.par : null)), ...(admin ? { admin } : {}) });
  const pl = (id: string, name: string, c: GolfCard): FeedPlayer => ({ id, name, card: c, holes: H, received: H.map(() => 0) });
  test('golf: WD / DQ / DNS with the reason reach the commentary, first', () => {
    const feed = golfRoundFeed([
      pl('a', 'Asha Rao', card(9)),
      pl('b', 'Ravi K', card(7, { status: 'wd', reason: 'injury', thru: 7 })),
      pl('c', 'Dev P', card(18, { status: 'dq', reason: 'Rule 3.3b — wrong score returned' })),
      pl('d', 'Zara M', card(0, { status: 'dns' })),
    ], { scoring: 'stroke' });
    assert.equal(feed[0].key, 'admin');
    const t = feed[0].items.map((i) => i.text);
    assert.deepEqual(t, ['Ravi K withdrew (WD) after 7 holes — injury', 'Dev P disqualified (DQ) — Rule 3.3b — wrong score returned', 'Zara M did not start (DNS)']);
  });
  test('golf: no admin → no extra group (old rounds read identically); hostile admin bounded / ignored', () => {
    assert.ok(golfRoundFeed([pl('a', 'Asha Rao', card(9))], { scoring: 'stroke' }).every((g) => g.key !== 'admin'));
    const feed = golfRoundFeed([
      pl('b', 'Ravi K', card(3, { status: 'evil' as 'wd', reason: 'x' })),
      pl('c', 'Dev P', card(3, { status: 'wd', reason: 'y'.repeat(10_000), thru: -4 })),
    ], { scoring: 'stroke' });
    const t = feed.find((g) => g.key === 'admin')!.items.map((i) => i.text);
    assert.equal(t.length, 1);
    assert.ok(t[0].length < 160);
    assert.doesNotMatch(t[0], /after -4/);
  });
});

/* ------------------------------ B13 FS stat ------------------------------ */

describe('B13: a false start is counted on its own', () => {
  test('athletics: FS writes fs and dq; another DQ writes dq only', () => {
    const f = { discipline: 'ath.100m', phase: 'final' as const, category: U16B };
    const lines = phaseLines(f, rankEntries([row(1, { lane: 4, mark: 11.9 }), row(2, { lane: 5, status: 'FS', ruleRef: 'TR 16.8' }), row(3, { lane: 6, status: 'DQ', ruleRef: 'TR 17.3' })], M100));
    assert.equal(lines.find((l) => l.playerId === 'p2')!.stats.fs, 1);
    assert.equal(lines.find((l) => l.playerId === 'p2')!.stats.dq, 1);
    assert.equal(lines.find((l) => l.playerId === 'p3')!.stats.fs, undefined);
  });
  test('crews: an exclusion for false starts writes fs too', () => {
    const lines = crewLines({ discipline: 'row.1x.2000', phase: 'final' }, rankEntries([row(1, { lane: 1, mark: 420 }), row(2, { lane: 2, status: 'FS' })], X1));
    assert.equal(lines.find((l) => l.playerId === 'p2')!.stats.fs, 1);
  });
  test('the stat schemas list "False starts"', () => {
    for (const s of ['athletics', 'rowing', 'canoe']) assert.ok(STAT_SCHEMAS[s as keyof typeof STAT_SCHEMAS]?.stats.some((x) => x.key === 'fs'), s);
  });
});

/* ------------------------------ B14 / B15 golf settings ------------------------------ */

describe('B14 / B15: golf maximum score visible; match play hides stroke-play fields', () => {
  const fields = GOLF_META.formatFields!;
  test('a maxScore field with the WHS default (net double bogey)', () => {
    const f = fields.find((x) => x.key === 'maxScore');
    assert.ok(f);
    assert.equal(f!.default, 'ndb');
    assert.deepEqual(f!.options!.map((o) => o.value), ['ndb', 'par3', 'par5', 'none']);
  });
  test('absent maxScore still reads net double bogey (old rounds identical)', () => {
    assert.equal(golfFormatOf({ format: {} } as never).maxScore, 'ndb');
    assert.equal(golfFormatOf({ format: { maxScore: 'none' } } as never).maxScore, 'none');
  });
  test('match play: net scoring, ties, prizes, distances and max score are not shown', () => {
    const keys = matchRules(fields, { competition: 'match' }).map((r) => r.key);
    for (const k of ['netScoring', 'tieBreak', 'prizes', 'distUnit', 'maxScore']) assert.ok(!keys.includes(k), k);
    const stroke = matchRules(fields, { competition: 'stroke' }).map((r) => r.key);
    for (const k of ['netScoring', 'tieBreak', 'prizes', 'distUnit', 'maxScore']) assert.ok(stroke.includes(k), k);
  });
});

/* ------------------------------ B16 header rule lines ------------------------------ */

describe('B16: the results header states the rules in force', () => {
  test('athletics track: false-start rule, wind limit, timing', () => {
    assert.equal(trackRuleLine(M100, {}), 'False starts: zero tolerance (TR 16.8) · wind limit +2.0 m/s for records · fully automatic timing');
    assert.equal(trackRuleLine(M100, { rules: { falseStart: 'one', windLimit: 'none' }, handTimed: true }), 'False starts: one per race, the next disqualifies (meet rule) · no wind rule · hand-timed (h)');
    assert.equal(trackRuleLine(D('ath.800m'), {}), 'False starts: zero tolerance (TR 16.8) · fully automatic timing');
  });
  test('not for field, road or combined events; a hostile rule value reads the standard', () => {
    assert.equal(trackRuleLine(LJ, {}), '');
    assert.equal(trackRuleLine(W10, {}), '');
    assert.equal(trackRuleLine(M100, { combined: {} as PhaseFormat['combined'] }), '');
    assert.match(trackRuleLine(M100, { rules: { falseStart: '<evil>' } }), /zero tolerance/);
  });
  test('precision headers: penalties, lights, jury, team arrows', () => {
    assert.match(precisionRuleNote(AR, undefined), /−2 penalty: ⋯ on the series/);
    assert.match(precisionRuleNote(AR, { shootPen: true }), /−2 button on each series/);
    assert.match(precisionRuleNote(WL, undefined), /jury reversal: tap the attempt/);
    assert.match(precisionRuleNote(WL, { wlLights: true, wlJury: true }), /referees’ lights on every attempt · jury reversals in view/);
    assert.match(precisionRuleNote(R70, undefined), /penalty \(highest arrow off\): tap the archer/);
    assert.match(precisionRuleNote(D('arch.r70.team'), { archTeamArrows: true }), /team arrows credited to each archer/);
    assert.equal(precisionRuleNote(M100, undefined), '');
  });
});
