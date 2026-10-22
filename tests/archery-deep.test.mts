/**
 * Deep wave — archery at World Archery depth: the face's rings (the compound
 * 80 cm 6-ring face scores 5–X, the 40 cm triple face 6–X — anything outside
 * is M), the results commentary (end by end with places in the ranking round;
 * every match end with set points, shoot-offs decided by the closer arrow, the
 * podium), the stats (average arrow, X per end, best / worst end, the arrow
 * distribution; match play sets won-shared-lost, the average arrow in
 * matches, shoot-offs), the new stat-line keys and the career. Old results
 * read exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, parseArrow, parseEnd, endError, setEnd, archRoundOf, bracketEntrant, archLines, archeryCareer, eventAwards, bracketState,
  archFeed, archStats, arrowDistribution, endDash, matchPlayOf,
  type Arrow, type EntryResult, type ResultEntry, type ArchSide, type ArchRoundStats, type ArchBracketStats,
} from '../src/data/results/index.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema, aggregateValue } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

const R70 = disciplineOf('arch.r70')!;
const archer = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Archer ${i}`, heat: 1, result: { order: i, ...result } });
const rr = (ends: string[], perEnd = 6): EntryResult => ends.reduce<EntryResult>((r, t, i) => {
  const p = parseEnd(t, perEnd);
  if ('error' in p) throw new Error(p.error);
  return setEnd(r, i, p.arrows);
}, {});
const a3 = (t: string): Arrow[] => t.split(' ').map((x) => parseArrow(x)!);
const side = (ends: string[], so: Arrow[] = [], closer: boolean[] = []): ArchSide => ({ ends: ends.map(a3), ...(so.length ? { so } : {}), ...(closer.length ? { closer } : {}) });
const seeded = (n: number) => Array.from({ length: n }, (_, i) => archer(i + 1, { ...bracketEntrant({ mark: 700 - i * 10, tens: 30 - i, xs: 10 - i }, i + 1) }));
const WIN = ['10 10 10', '10 10 10', '10 10 10'], LOSE = ['9 9 9', '9 9 9', '9 9 9'];
function play(rows: ResultEntry[], key: string, a: string, b: string, aSide: ArchSide = side(WIN), bSide: ArchSide = side(LOSE)): ResultEntry[] {
  return rows.map((e) => (e.id === a ? { ...e, result: { ...e.result, mp: { ...e.result.mp, [key]: aSide } } } : e.id === b ? { ...e, result: { ...e.result, mp: { ...e.result.mp, [key]: bSide } } } : e));
}

/** Two ends of a ranking round: 1 leads after two; 3 shot a perfect 60. */
const ranking = (): ResultEntry[] => [
  archer(1, rr(['X 10 10 9 9 8', '10 10 9 9 9 8'])),
  archer(2, rr(['10 10 10 10 9 9', '9 9 9 8 8 7'])),
  archer(3, rr(['9 9 8 8 7 7', 'X X X 10 10 10'])),
];

/** A bracket of 4: 1 beats 4 and 2 (gold); 2 beats 3 6-5 on the closer shoot-off arrow; 3 takes bronze. */
const bracket = (): ResultEntry[] => {
  let rows = seeded(4);
  rows = play(rows, '1', 'e1', 'e4');
  rows = play(rows, '1', 'e2', 'e3',
    side(['10 10 10', '9 9 9', '10 10 10', '9 9 9', '10 9 9'], [10], [true]),
    side(['9 9 9', '10 10 10', '9 9 9', '10 10 10', '10 9 9'], [10], [false]));
  rows = play(rows, 'B', 'e3', 'e4');
  rows = play(rows, '2', 'e1', 'e2');
  return rows;
};

describe('the face: rings it doesn\'t have are M', () => {
  test('compound 50 m 6-ring face 5–X, compound indoor triple face 6–X, recurve unchanged', () => {
    assert.equal(archRoundOf('arch.c50')!.minRing, 5);
    assert.equal(archRoundOf('arch.c18i')!.minRing, 6);
    assert.equal(archRoundOf('arch.c50.team')!.minRing, 5);
    assert.equal(archRoundOf('arch.r70')!.minRing, undefined);
    assert.equal(archRoundOf('arch.c30')!.minRing, undefined, 'a school compound round on a full face');
    assert.match((parseEnd('X 10 9 4 5 6', 6, 5) as { error: string }).error, /rings 5–10 \(X\) only — an arrow outside the 5 ring is M/);
    assert.deepEqual(parseEnd('X 10 9 5 5 M', 6, 5), { arrows: ['X', 10, 9, 5, 5, 'M'] });
    assert.match(endError([10, 9, 5], 3, 6)!, /rings 6–10/);
    assert.equal(endError([10, 9, 6], 3, 6), null);
    // without the face (old callers): unchanged
    assert.deepEqual(parseEnd('X 10 9 4 5 6', 6), { arrows: ['X', 10, 9, 6, 5, 4] });
  });
});

describe('the commentary', () => {
  test('ranking round: each archer\'s end with the running total and place, the best end, the leader, a lead change', () => {
    const lines = archFeed(ranking(), R70).map((f) => `${f.tag ? `${f.tag} · ` : ''}${f.text}`).reverse();
    assert.deepEqual(lines, [
      'E1 · Archer 1 X-10-10-9-9-8 = 56 — 56 after 1 (2nd)',
      'E1 · Archer 2 10-10-10-10-9-9 = 58 — 58 after 1 (1st)',
      'E1 · Archer 3 9-9-8-8-7-7 = 48 — 48 after 1 (3rd)',
      'E1 · End 1 — best Archer 2 58 (10-10-10-10-9-9); Archer 2 leads on 58 (+2)',
      'E2 · Archer 1 10-10-9-9-9-8 = 55 — 111 after 2 (1st)',
      'E2 · Archer 2 9-9-9-8-8-7 = 50 — 108 after 2 (3rd)',
      'E2 · Archer 3 X-X-X-10-10-10 = 60 — 108 after 2 (2nd)',
      'E2 · End 2 — best Archer 3 60 (X-X-X-10-10-10); Archer 1 leads on 111 (+3)',
      'E2 · Archer 1 takes the lead',
    ]);
    assert.equal(archFeed(ranking(), R70).find((f) => f.text.startsWith('Archer 3 X-X-X'))!.tone, 'good');
  });
  test('the ranking round complete: the top three with 10s and X; the halfway standings outdoors', () => {
    const full = (t: string) => Array.from({ length: 12 }, () => t);
    // level on 672 and on 36 10s: the X count separates them (WA)
    const rows = [archer(1, rr(full('X 10 10 9 9 8'))), archer(2, rr(full('10 10 10 9 9 8')))];
    const feed = archFeed(rows, R70).map((f) => f.text);
    assert.equal(feed[0], 'Ranking round complete — 1. Archer 1 672 (36 10s, 12 X) · 2. Archer 2 672 (36 10s, 0 X)');
    assert.ok(feed.includes('Halfway (36 arrows) — 1. Archer 1 336 · 2. Archer 2 336'));
  });
  test('match play: every end with the set points, the shoot-off on the closer arrow, the winners, the podium', () => {
    const feed = archFeed(bracket(), R70);
    const lines = feed.map((f) => `${f.tag ? `${f.tag} · ` : ''}${f.text}`).reverse();
    assert.equal(lines[0], 'SF E1 · Archer 1 10-10-10 = 30 v Archer 4 9-9-9 = 27 — Archer 1 takes the set, 2-0');
    assert.ok(lines.includes('SF · Archer 1 beats Archer 4 6-0'));
    assert.ok(lines.includes('SF E2 · Archer 2 9-9-9 = 27 v Archer 3 10-10-10 = 30 — Archer 3 takes the set, 2-2'));
    assert.ok(lines.includes('SF E5 · Archer 2 10-9-9 = 28 v Archer 3 10-9-9 = 28 — set shared, 5-5'));
    assert.ok(lines.includes('SF · Shoot-off: Archer 2 10 v Archer 3 10 — level — Archer 2 closer to the centre'));
    assert.ok(lines.includes('SF · Archer 2 beats Archer 3 6-5 after a shoot-off'));
    assert.ok(lines.includes('Bronze · Archer 3 beats Archer 4 6-0 — bronze'));
    assert.ok(lines.includes('Gold · Archer 1 beats Archer 2 6-0 — gold'));
    assert.ok(lines.indexOf('Bronze · Archer 3 beats Archer 4 6-0 — bronze') < lines.indexOf('Gold · Archer 1 beats Archer 2 6-0 — gold'), 'bronze before gold');
    assert.equal(feed[0].text, '🥇 Archer 1 · 🥈 Archer 2 · 🥉 Archer 3');
  });
  test('compound: cumulative totals; a walkover; nothing entered → no commentary', () => {
    let rows = seeded(2).map((e) => e);
    rows = play(rows, '1', 'e1', 'e2', side(['10 10 9', '10 10 9', '10 10 9', '10 10 9', '10 10 9']), side(['10 9 9', '10 9 9', '10 9 9', '10 9 9', '10 9 9']));
    const lines = archFeed(rows, disciplineOf('arch.c50')!).map((f) => f.text).reverse();
    assert.equal(lines[0], 'Archer 1 10-10-9 = 29 v Archer 2 10-9-9 = 28 — 29-28');
    assert.ok(lines.includes('Archer 1 beats Archer 2 145-140 — gold'));
    const wo = seeded(2).map((e) => (e.id === 'e2' ? { ...e, result: { ...e.result, mp: { '1': { wo: true } } } } : e));
    assert.deepEqual(archFeed(wo, R70).map((f) => f.text).reverse()[0], "Archer 1 through — Archer 2 didn't shoot (walkover)");
    assert.deepEqual(archFeed([archer(1), archer(2)], R70), []);
    assert.deepEqual(archFeed(seeded(4), R70), []);
    assert.equal(endDash(['X', 10, 'M']), 'X-10-M');
  });
});

describe('stats', () => {
  test('ranking round: average arrow, 10s / X / 9s / M, X per end, best / worst end, distribution, lead changes', () => {
    const s = archStats(ranking(), R70) as ArchRoundStats;
    assert.equal(s.kind, 'ranking');
    const a1 = s.archers[0];
    assert.deepEqual([a1.place, a1.name, a1.ends, a1.arrows, a1.total, a1.avgArrow, a1.tens, a1.xs, a1.nines, a1.misses, a1.xPerEnd, a1.bestEnd, a1.worstEnd, a1.halves],
      [1, 'Archer 1', 2, 12, 111, 9.25, 5, 1, 5, 0, 0.5, 56, 55, undefined]);
    assert.deepEqual(a1.dist.map((d) => `${d.label}:${d.n}`), ['X:1', '10:4', '9:5', '8:2', '7:0', '≤6:0', 'M:0']);
    assert.deepEqual(s.bestEnd, { names: ['Archer 3'], value: 60 });
    assert.deepEqual(s.mostX, { names: ['Archer 3'], value: 3 });
    assert.equal(s.leadChanges, 1);
    assert.deepEqual(arrowDistribution(['X', 10, 6, 'M'], 6).map((d) => d.label), ['X', '10', '9', '8', '7', '6', 'M']);
    assert.deepEqual(arrowDistribution([5, 4], 1).find((d) => d.label === '≤6')!.n, 2);
  });
  test('match play: won-lost, sets won-shared-lost, the average arrow over the ends that counted, shoot-offs', () => {
    const s = archStats(bracket(), R70) as ArchBracketStats;
    assert.equal(s.kind, 'bracket');
    const a2 = s.archers.find((a) => a.name === 'Archer 2')!;
    assert.deepEqual([a2.place, a2.won, a2.lost, a2.sets, a2.arrows, a2.points, a2.avgArrow, a2.tens, a2.xs, a2.bestEnd, a2.shootOffs],
      [2, 1, 1, { won: 2, tied: 1, lost: 5 }, 24, 223, 9.29, 7, 0, 30, { won: 1, lost: 0 }]);
    assert.deepEqual(s.archers.map((a) => a.place), [1, 2, 3, 4]);
    assert.equal(s.shootOffs, 1);
    assert.deepEqual(s.bestEnd, { names: ['Archer 1', 'Archer 2', 'Archer 3'], value: 30 });
  });
});

describe('stat lines and career', () => {
  test('ranking round: ends shot, 9s, best end (free — from the arrows)', () => {
    const lines = archLines({ discipline: 'arch.r70' }, rankEntries(ranking(), R70), 'qual');
    const s1 = lines.find((l) => l.playerId === 'p1')!.stats;
    assert.deepEqual([s1.rEnds, s1.n9, s1.bestEnd, s1.arrows, s1.xs], [2, 5, 56, 12, 1]);
  });
  test('match play: arrows and points in matches, 10s and X, shoot-offs won / lost (only when shot)', () => {
    const rows = bracket();
    const ranked = rankEntries(rows, R70);
    const lines = archLines({ discipline: 'arch.r70' }, ranked, 'bracket', eventAwards(ranked, {}));
    const s2 = lines.find((l) => l.playerId === 'p2')!.stats;
    assert.deepEqual([s2.mArrows, s2.mPts, s2.mTens, s2.mXs, s2.soW, s2.soL], [24, 223, 7, 0, 1, undefined]);
    const s3 = lines.find((l) => l.playerId === 'p3')!.stats;
    assert.deepEqual([s3.soW, s3.soL], [undefined, 1]);
    // the shared helper: walkovers and byes don't count
    const st = bracketState(rows, 'sets');
    assert.equal(matchPlayOf(st, 'e1', (id, k) => rows.find((e) => e.id === id)?.result.mp?.[k]).arrows, 18);
  });
  test('career: X per end and the match average only from lines that recorded them; best end per round', () => {
    const phases = new Map([
      ['q0', { discipline: 'arch.r70', title: 'Ranking (old)', date: '2025-03-01' }],
      ['q1', { discipline: 'arch.r70', title: 'Ranking', date: '2026-03-01' }],
      ['b1', { discipline: 'arch.r70', title: 'Match play', date: '2026-03-01' }],
    ]);
    const old = { eventId: 'q0', date: '2025-03-01', stats: { comps: 1, arrows: 72, pts: 640, tens: 20, xs: 8, m_ar_r70: 640 } };
    const c0 = archeryCareer([old], phases, '2026-01-01');
    assert.equal(c0.xPerEnd, null); assert.equal(c0.match, null); assert.deepEqual(c0.shootOffs, { won: 0, lost: 0 });
    assert.equal(c0.bests[0].bestEnd, undefined);
    const c = archeryCareer([old,
      { eventId: 'q1', date: '2026-03-01', stats: { comps: 1, arrows: 72, pts: 660, tens: 30, xs: 12, m_ar_r70: 660, rEnds: 12, n9: 30, bestEnd: 59 } },
      { eventId: 'b1', date: '2026-03-01T12', stats: { brackets: 1, place: 2, mW: 1, mL: 1, sp: 8, spA: 11, mArrows: 24, mPts: 223, mTens: 7, mXs: 0, soW: 1 } },
    ], phases, '2026-01-01');
    assert.equal(c.xPerEnd, 1); // 12 X in 12 ends — the old round (no end count) is not mixed in
    assert.deepEqual(c.match, { arrows: 24, points: 223, tens: 7, xs: 0, avgArrow: 9.29 });
    assert.deepEqual(c.shootOffs, { won: 1, lost: 0 });
    assert.equal(c.bests[0].bestEnd, 59);
    assert.match(c.history[0].text, /avg arrow 9\.29$/);
  });
  test('the schema validates; X per end aggregates only over rounds with an end count', () => {
    const schema = STAT_SCHEMAS.archery;
    assert.deepEqual(validateSchema(schema), []);
    const def = schema.stats.find((s) => s.key === 'xPerEnd')!;
    const mk = (stats: Record<string, number>): StatLine => ({ id: Math.random().toString(), playerId: 'p', sport: 'archery', stats } as unknown as StatLine);
    assert.equal(aggregateValue(schema, def, [mk({ arrows: 72, xs: 8 })]).text, '–');
    assert.equal(aggregateValue(schema, def, [mk({ arrows: 72, xs: 8 }), mk({ arrows: 72, xs: 12, rEnds: 12 })]).text, '1.00');
  });
});
