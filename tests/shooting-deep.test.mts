/**
 * Deep wave — shooting at ISSF depth: penalties (2-point deductions, an
 * optional capture — totals, ties and records net of them), perfect series,
 * the results commentary (series by series with places, the final shot by
 * shot with eliminations, shoot-offs and the podium, the mixed team medal
 * matches), the stats (best / worst series, spread, positions, shot
 * distribution, final averages and places after each elimination), the new
 * stat-line keys and the career. Old results read exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, setSeries, setPenalty, penaltyTotal, netSeries, withTotals, perfectSeries, shotsInSeries, shootEventOf, qualKeys,
  shootLines, shootingCareer, shootFeed, shootStats, seriesTag, shortNames, seriesLine, eventAwards, withQualification, rulesFor, ruleOf,
  type EntryResult, type ResultEntry, type ArchSide, type ShootSeriesStats, type ShootFinalStats,
} from '../src/data/results/index.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema, aggregateValue } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

const AR = disciplineOf('shoot.10mar')!, AP = disciplineOf('shoot.10map')!, R3P = disciplineOf('shoot.50m3p')!;
const evAR = shootEventOf('shoot.10mar')!, evAP = shootEventOf('shoot.10map')!, ev3P = shootEventOf('shoot.50m3p')!;
const shooter = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Shooter ${i}`, heat: 1, result: { order: i, ...result } });
const ser = (series: number[], xs: number[] = [], scoring: 'decimal' | 'integer' | 'hits' = 'integer'): EntryResult =>
  series.reduce<EntryResult>((r, v, i) => setSeries(r, i, scoring, { total: v, xs: xs[i] }), {});
const flat = (v: number, n: number) => Array.from({ length: n }, () => v);

/** A 20-shot air pistol match (integer): 1 wins 194-8x; 3 shot a perfect 100 first. */
const match = (): ResultEntry[] => [
  shooter(1, ser([96, 98], [3, 5])),
  shooter(2, ser([97, 95], [4, 2])),
  shooter(3, ser([100, 90], [6, 1])),
];

describe('penalties (ISSF 2-point deductions — optional capture)', () => {
  test('the rule is off by default; a penalty comes off the series and the total', () => {
    assert.ok(rulesFor('shooting').some((r) => r.key === 'shootPen'));
    assert.equal(ruleOf(undefined, 'shootPen'), false);
    const r = setPenalty(ser([97, 95], [4, 2]), 1, 2, 'integer');
    assert.deepEqual(r.pen, [0, 2]);
    assert.equal(r.mark, 190);
    assert.equal(penaltyTotal(r), 2);
    assert.deepEqual(netSeries(r), [97, 93]);
    assert.equal(seriesLine(r, evAP, 20), '97·4x 95·2x−2');
    // cleared: back to the shot score, no `pen` kept
    const back = setPenalty(r, 1, 0, 'integer');
    assert.equal(back.pen, undefined); assert.equal(back.mark, 192);
    // a series not entered yet can't carry one
    assert.deepEqual(setPenalty(ser([97], [4]), 3, 2, 'integer'), ser([97], [4]));
  });
  test('decimal totals stay exact; a corrected series keeps its penalty; clearing the last series drops it', () => {
    let r = setPenalty(ser([104.3, 103.9], [], 'decimal'), 0, 2, 'decimal');
    assert.equal(r.mark, 206.2);
    r = setSeries(r, 1, 'decimal', { total: 104.1 });
    assert.equal(r.mark, 206.4);
    assert.deepEqual(r.pen, [2]);
    const cleared = setSeries(setPenalty(r, 1, 2, 'decimal'), 1, 'decimal', null);
    assert.deepEqual(cleared.pen, [2]);
    assert.equal(cleared.mark, 102.3);
    assert.equal(withTotals({ series: [100, 100], pen: [2, 2] }, 'integer').mark, 196);
  });
  test('ties and countback compare net of the penalty', () => {
    const rows = [shooter(1, ser([96, 98], [3, 5])), shooter(2, setPenalty(ser([97, 95], [4, 3]), 1, 2, 'integer')), shooter(3, ser([100, 90], [6, 1]))];
    // 2 and 3 on 190: 3 has 7 X, 2 has 7 X → the last series back: 3's 90 v 2's 93 (net)
    assert.deepEqual(rankEntries(rows, AP).map((r) => `${r.label}:${r.id}:${r.best}`), ['1:e1:194', '2:e2:190', '3:e3:190']);
    assert.deepEqual(qualKeys(rows[1].result, evAP).slice(0, 4), [1900, 7, 930, 970]);
    // an old result (no pen) has exactly the same keys as before
    assert.deepEqual(qualKeys(ser([97, 95], [4, 3]), evAP).slice(0, 4), [1920, 7, 950, 970]);
  });
});

describe('perfect series', () => {
  test('integer all tens (100 / 50 in fives), shotgun all targets; decimal never', () => {
    assert.equal(perfectSeries(ser([100, 98, 100]), evAP, 30), 2);
    const p25 = shootEventOf('shoot.25mp')!;
    assert.equal(perfectSeries(ser([50, 49, 50]), p25, 15), 2);
    assert.equal(shotsInSeries(p25, 15, 2), 5);
    const trap = shootEventOf('shoot.trap')!;
    assert.equal(perfectSeries(ser([25, 24], [], 'hits'), trap, 50), 1);
    assert.equal(perfectSeries(ser([109.0], [], 'decimal'), evAR, 10), 0);
    // a short last round (a 40-target match: 25 + 15) is perfect at 15
    assert.equal(perfectSeries(ser([25, 15], [], 'hits'), trap, 40), 2);
  });
});

describe('the commentary', () => {
  test('qualification: each shooter\'s series and running total with place, the best series, the leader, a perfect series, the end', () => {
    const feed = shootFeed(match(), AP, 20).map((f) => `${f.tag ? `${f.tag} · ` : ''}${f.text}`).reverse();
    assert.deepEqual(feed, [
      'S1 · Shooter 1 96-3x — 96-3x after 1 (3rd)',
      'S1 · Shooter 2 97-4x — 97-4x after 1 (2nd)',
      'S1 · Shooter 3 100-6x — 100-6x after 1 (1st)',
      'S1 · Perfect series — Shooter 3 100',
      'S1 · Series 1 — best Shooter 3 100; Shooter 3 leads on 100-6x (+3)',
      'S2 · Shooter 1 98-5x — 194-8x after 2 (1st)',
      'S2 · Shooter 2 95-2x — 192-6x after 2 (2nd)',
      'S2 · Shooter 3 90-1x — 190-7x after 2 (3rd)',
      'S2 · Series 2 — best Shooter 1 98; Shooter 1 leads on 194-8x (+2)',
      'S2 · Shooter 1 takes the lead',
      'Match complete — 1. Shooter 1 194-8x · 2. Shooter 2 192-6x · 3. Shooter 3 190-7x',
    ]);
  });
  test('a big field gets the series summary (and perfect series / penalties) but not every shooter\'s line', () => {
    const rows = [...match(), shooter(4, setPenalty(ser([95], [2]), 0, 2, 'integer'))];
    const feed = shootFeed(rows, AP, 20, 3).map((f) => f.text).reverse();
    // in firing-point order, then the summary
    assert.deepEqual(feed.slice(0, 3), ['Perfect series — Shooter 3 100', 'Shooter 4: −2 penalty in series 1', 'Series 1 — best Shooter 3 100; Shooter 3 leads on 100-6x (+3)']);
    assert.ok(!feed.some((l) => l.startsWith('Match complete')), 'Shooter 4 has one series of two');
  });
  test('3 positions: the series tags and the position in the summary', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => seriesTag(ev3P, 60, i)), ['K1', 'K2', 'P1', 'P2', 'S1', 'S2']);
    assert.equal(seriesTag(evAR, 60, 3), 'S4');
    const feed = shootFeed([shooter(1, ser([95], [2]))], R3P, 60).map((f) => f.text);
    assert.ok(feed.includes('Series 1 (kneeling) — best Shooter 1 95; Shooter 1 leads on 95-2x'));
  });
  test('the final: shot by shot (every finalist in the detail line), lead changes, eliminations, the podium', () => {
    // a final of 6: out after 16, 18, 20, 22; gold on 24. Shooter 5 opens 10.9, then 10.4; Shooter 6 shoots 10.5
    const vals = [10.0, 10.1, 10.2, 10.3];
    const outAt = [16, 18, 20, 22];
    const rows = [
      ...vals.map((v, i) => shooter(i + 1, { fshots: flat(v, outAt[i]), qual: { mark: 620 } })),
      shooter(5, { fshots: [10.9, ...flat(10.4, 23)], qual: { mark: 621 } }),
      shooter(6, { fshots: flat(10.5, 24), qual: { mark: 622 } }),
    ];
    const feed = shootFeed(rows, AR, 60);
    const lines = feed.map((f) => `${f.tag ? `${f.tag} · ` : ''}${f.text}`).reverse();
    // every finalist is "Shooter n" — first names aren't unique, so whole names
    assert.equal(lines[0], 'Shot 1 · Best Shooter 5 10.9 · Shooter 5 leads on 10.9 (+0.4)');
    assert.equal(feed[feed.length - 1].detail, 'Shooter 5 10.9 · Shooter 6 10.5 · Shooter 4 10.3 · Shooter 3 10.2 · Shooter 2 10.1 · Shooter 1 10.0');
    assert.ok(lines.includes('Shot 5 · Best Shooter 6 10.5 · level at the top on 52.5'));
    assert.ok(lines.includes('Shot 6 · Shooter 6 takes the lead'));
    assert.ok(lines.includes('Shot 16 · Shooter 1 eliminated — 6th (160.0)'));
    assert.ok(lines.includes('Shot 22 · Shooter 4 eliminated — 3rd (226.6)'));
    assert.equal(feed[0].text, '🥇 Shooter 6 252.0 · 🥈 Shooter 5 250.1 · 🥉 Shooter 4 226.6');
  });
  test('the final: a shoot-off at an elimination is described', () => {
    const rows = [
      shooter(1, { fshots: [...flat(10.0, 22), 10.5, 10.5], so: { '22': [10.2] }, qual: { mark: 620 } }),
      shooter(2, { fshots: flat(10.0, 22), so: { '22': [9.8] }, qual: { mark: 620 } }),
      shooter(3, { fshots: flat(10.5, 24), qual: { mark: 620 } }),
    ];
    const lines = shootFeed(rows, AR, 60).map((f) => f.text);
    assert.ok(lines.includes('Shoot-off after shot 22: Shooter 1 10.2 v Shooter 2 9.8'));
    assert.ok(lines.includes('Shooter 2 eliminated — 3rd (220.0)'));
    // first names when they are unique
    assert.deepEqual([...shortNames([{ id: 'a', name: 'Manu Bhaker', heat: 1, result: {} }, { id: 'b', name: 'Manu Rao', heat: 1, result: {} }, { id: 'c', name: 'Esha Singh', heat: 1, result: {} }]).values()], ['Manu Bhaker', 'Manu Rao', 'Esha']);
  });
  test('mixed team medal matches: series by series with the 2-1-0 points, the winner', () => {
    const side = (ends: number[][]): ArchSide => ({ ends });
    const win = Array.from({ length: 8 }, () => [10.5, 10.4]), lose = Array.from({ length: 8 }, () => [10.2, 10.1]);
    const team = (id: string, seed: number, mp: Record<string, ArchSide>): ResultEntry => ({ id, name: id, heat: 1, result: { seed, order: seed, mp, members: [{ name: `${id} 1` }, { name: `${id} 2` }], qual: { mark: 600 } } });
    const rows = [team('Red', 1, { G: side(win) }), team('Blue', 2, { G: side(lose) }), team('Green', 3, {}), team('Gold', 4, {})];
    const lines = shootFeed(rows, disciplineOf('shoot.10marx')!, 60).map((f) => `${f.tag} · ${f.text}`).reverse();
    assert.equal(lines[0], 'Gold S1 · Red 20.9 v Blue 20.3 — Red 2 points · 2–0');
    assert.equal(lines[lines.length - 1], 'Gold · Red win gold 16–0');
  });
  test('nothing entered → no commentary; a team ranked on its members\' scores has none', () => {
    assert.deepEqual(shootFeed([shooter(1), shooter(2)], AP, 60), []);
    const t: ResultEntry = { id: 't', name: 'Red', heat: 1, result: { members: [{ name: 'a' }], ms: [{ mark: 570 }], mark: 570, series: [570] } };
    assert.deepEqual(shootFeed([t], disciplineOf('shoot.10map.team')!, 60), []);
  });
});

describe('stats', () => {
  test('qualification: best / worst / spread / average series, X, perfect series, penalties, lead changes', () => {
    const s = shootStats(match(), AP, 20) as ShootSeriesStats;
    assert.equal(s.kind, 'series');
    assert.deepEqual(s.shooters.map((x) => [x.place, x.name, x.best, x.worst, x.spread, x.avg, x.xs, x.perfect]), [
      [1, 'Shooter 1', 98, 96, 2, 97, 8, 0],
      [2, 'Shooter 2', 97, 95, 2, 96, 6, 0],
      [3, 'Shooter 3', 100, 90, 10, 95, 7, 1],
    ]);
    assert.deepEqual(s.bestSeries, { names: ['Shooter 3'], value: 100, index: 0 });
    assert.equal(s.perfect, 1); assert.equal(s.penalties, 0); assert.equal(s.leadChanges, 1);
  });
  test('3 positions: kneeling / prone / standing totals; shot by shot: the distribution', () => {
    const s = shootStats([shooter(1, ser([95, 98, 92], [2, 5, 1]))], R3P, 30) as ShootSeriesStats;
    assert.deepEqual(s.shooters[0].byPos, [{ pos: 'K', total: 95 }, { pos: 'P', total: 98 }, { pos: 'S', total: 92 }]);
    const shots = [10.9, 10.5, 10.4, 10.0, 9.9, 9.5, 8.7, 10.1, 10.2, 7.6];
    const r = setSeries({}, 0, 'decimal', { total: 0, shots });
    const d = (shootStats([shooter(1, r)], AR, 10) as ShootSeriesStats).shooters[0].shots!;
    assert.deepEqual([d.n, d.avg, d.tens, d.top, d.low], [10, 9.78, 6, 2, 7.6]);
    assert.deepEqual(d.dist.map((x) => `${x.label}:${x.n}`), ['10.5+:2', '10.0–10.4:4', '9.x:2', '8.x:1', '≤7.9:1']);
    const ri = setSeries({}, 0, 'integer', { total: 0, shots: ['X', 'X', 10, 9, 9, 8, 7, 6, 10, 10] });
    const di = (shootStats([shooter(1, ri)], AP, 10) as ShootSeriesStats).shooters[0].shots!;
    assert.deepEqual(di.dist.map((x) => `${x.label}:${x.n}`), ['X:2', '10:3', '9:2', '8:1', '7:1', '≤6:1']);
    assert.equal(di.top, 2);
  });
  test('the final: shots counted, average, best, 10.0+ and the place after each elimination; lead changes; best shot', () => {
    const vals = [10.0, 10.1, 10.2, 10.3];
    const outAt = [16, 18, 20, 22];
    const rows = [
      ...vals.map((v, i) => shooter(i + 1, { fshots: flat(v, outAt[i]), qual: { mark: 620 } })),
      shooter(5, { fshots: [10.9, ...flat(10.4, 23)], qual: { mark: 621 } }),
      shooter(6, { fshots: flat(10.5, 24), qual: { mark: 622 } }),
    ];
    const s = shootStats(rows, AR, 60) as ShootFinalStats;
    assert.deepEqual(s.checkpoints, [16, 18, 20, 22, 24]);
    const by = new Map(s.finalists.map((f) => [f.name, f]));
    assert.deepEqual(by.get('Shooter 6'), { id: 'e6', name: 'Shooter 6', place: 1, shots: 24, total: 252, avg: 10.5, best: 10.5, tens: 24, ranks: [1, 1, 1, 1, 1] });
    assert.deepEqual(by.get('Shooter 1')!.ranks, [6, null, null, null, null]);
    assert.equal(by.get('Shooter 1')!.shots, 16);
    assert.equal(s.leadChanges, 1);
    assert.deepEqual(s.bestShot, { names: ['Shooter 5'], value: 10.9 });
    assert.equal(s.finalists[0].name, 'Shooter 6');
  });
});

describe('stat lines and career', () => {
  test('best series, perfect series and penalty points on the match line; the final\'s counted shots', () => {
    const rows = rankEntries([...match().slice(0, 2), shooter(3, setPenalty(ser([100, 90], [6, 1]), 1, 2, 'integer'))], AP);
    const lines = shootLines({ discipline: 'shoot.10map', category: { shots: 20 } }, rows, 'match');
    const s3 = lines.find((l) => l.playerId === 'p3')!.stats;
    assert.deepEqual([s3.pts, s3.bestSer, s3.perfect, s3.pen, s3.m_sh_10map_20], [188, 100, 1, 2, 188]);
    const s1 = lines.find((l) => l.playerId === 'p1')!.stats;
    assert.equal(s1.perfect, undefined); assert.equal(s1.pen, undefined); assert.equal(s1.bestSer, 98);
    const fin = rankEntries([shooter(1, { fshots: flat(10, 16), qual: { mark: 600 } }), ...[2, 3, 4, 5, 6].map((i) => shooter(i, { fshots: flat(10 + i / 10, 24), qual: { mark: 600 } }))], AR);
    const fl = shootLines({ discipline: 'shoot.10mar' }, fin, 'final', eventAwards(fin, {}));
    assert.equal(fl.find((l) => l.playerId === 'p1')!.stats.fShots, 16);
    assert.equal(fl.find((l) => l.playerId === 'p6')!.stats.fShots, 24);
    // a qualification line too
    const q = shootLines({ discipline: 'shoot.10map', category: { shots: 20 } }, withQualification(rankEntries(match(), AP), { marks: new Map(), tieAtLine: [] }), 'qual');
    assert.equal(q.find((l) => l.playerId === 'p3')!.stats.perfect, 1);
  });
  test('career: best series per event, perfect series, penalties, the average final shot — only from lines that recorded them', () => {
    const phases = new Map([
      ['q0', { discipline: 'shoot.10map', title: 'Q old', date: '2025-03-01' }],
      ['f0', { discipline: 'shoot.10map', title: 'F old', date: '2025-03-01' }],
      ['q1', { discipline: 'shoot.10map', title: 'Q', date: '2026-03-01' }],
      ['f1', { discipline: 'shoot.10map', title: 'F', date: '2026-03-01' }],
    ]);
    const old = [
      { eventId: 'q0', date: '2025-03-01', stats: { comps: 1, qPlace: 3, pts: 570, shots: 60, xs: 15, xShots: 60, m_sh_10map: 570, qualified: 1 } },
      { eventId: 'f0', date: '2025-03-01T12', stats: { finals: 1, place: 2, fpts: 236.4 } },
    ];
    const c0 = shootingCareer(old, phases, '2026-01-01');
    assert.equal(c0.finalAvg, null); assert.equal(c0.perfect, 0); assert.equal(c0.penalties, 0);
    assert.equal(c0.bests[0].bestSeries, undefined);
    const c = shootingCareer([...old,
      { eventId: 'q1', date: '2026-03-01', stats: { comps: 1, qPlace: 1, pts: 578, shots: 60, xs: 20, xShots: 60, m_sh_10map: 578, bestSer: 100, perfect: 1, pen: 2, qualified: 1 } },
      { eventId: 'f1', date: '2026-03-01T12', stats: { finals: 1, place: 1, fpts: 241.2, fShots: 24, golds: 1 } },
    ], phases, '2026-01-01');
    assert.equal(c.finalAvg, 10.05); assert.equal(c.finalShots, 24);
    assert.equal(c.perfect, 1); assert.equal(c.penalties, 2);
    assert.equal(c.bests[0].bestSeries, 100); assert.equal(c.bests[0].bestSeriesText, '100');
    assert.deepEqual(c.history[1].flags, ['PB', 'final', '1 perfect series', '−2 penalty']);
  });
  test('the schema validates; the average final shot reads only finals with a shot count', () => {
    const schema = STAT_SCHEMAS.shooting;
    assert.deepEqual(validateSchema(schema), []);
    const def = schema.stats.find((s) => s.key === 'finalAvg')!;
    const mk = (stats: Record<string, number>): StatLine => ({ id: Math.random().toString(), playerId: 'p', sport: 'shooting', stats } as unknown as StatLine);
    assert.equal(aggregateValue(schema, def, [mk({ finals: 1, fpts: 236.4 })]).text, '–');
    assert.equal(aggregateValue(schema, def, [mk({ finals: 1, fpts: 236.4 }), mk({ finals: 1, fpts: 252, fShots: 24 })]).text, '10.50');
  });
});
