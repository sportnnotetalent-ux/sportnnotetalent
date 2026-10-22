/**
 * Deep wave — timed races (athletics, swimming, rowing, canoe sprint,
 * cycling): the optional "Stats to track" captures (lap / changeover /
 * intermediate times, swimming take-overs, reaction times), the analysis
 * derived from them (splits with places, the winner's race, fastest finish,
 * relay legs, gaps, paths through the rounds), the athletics DQ reasons, and
 * the new career keys (heats won, best reaction, the relay lead-off time as an
 * individual swim). Old results — with none of these captured — show nothing
 * new and write exactly the old lines apart from the derived heat win.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, phaseDiscipline, rankEntries, rankByHeat, splitDistances, athSplitDistances, cycSplitDistances, raceSplitDistances, raceMetres, distanceLabel,
  raceTracking, splitsOffered, splitPoints, splitPlaces, winnerSplitStory, fastestFinish, relayLegs, takeoverEarly, takeoverText, parseTakeover, takeoversOffered,
  reactionSummary, gapsToWinner, raceGapText, phaseRanking, heatName, roundTag, progressionPaths, pathText, pathKey, heatAnalysis, hasAnalysis,
  athDqCodesFor, ATH_DQ, athDqReasonStale, isTimedRaceSport, chipOffered, roadRowText, leadOffDiscipline, leadOffLine, phaseLines, athleticsCareer, crewLines, crewCareer, markKey,
  repechagePlan, rulesFor, ruleDef, phaseRules,
  type DisciplineDef, type EntryResult, type ResultEntry, type PhaseFormat, type PhaseInfo, type RankedEntry,
} from '../src/data/results/index.ts';
import { STAT_SCHEMAS, statDef } from '../src/sports/statSchemas.ts';
import { validateSchema, aggregateValue } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The "Stats to track" toggles a plugin declares: [key, default] (plugins are .tsx — read as text). */
const statsToTrack = (sport: string): [string, string][] =>
  [...fs.readFileSync(path.join(ROOT, `src/sports/${sport}/index.tsx`), 'utf8').matchAll(/\{ key: '(\w+)'[^\n]*default: (\w+)[^\n]*group: 'Stats to track'/g)].map((m) => [m[1], m[2]]);

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const run = (id: string, name: string, result: EntryResult, heat = 1, athleteId: string | undefined = `p_${id}`): ResultEntry => ({ id, athleteId, name, heat, result });
const OFF = raceTracking('athletics', {});

/* ----------------------------- split points ------------------------------ */

describe('where intermediate times are read', () => {
  test('athletics: laps at the finish line for 400 m and longer, changeovers for relays; none for sprints', () => {
    assert.deepEqual(athSplitDistances('ath.400m'), [200]);
    assert.deepEqual(athSplitDistances('ath.800m'), [400]);
    assert.deepEqual(athSplitDistances('ath.1500m'), [300, 700, 1100]);
    assert.deepEqual(athSplitDistances('ath.3000m'), [200, 600, 1000, 1400, 1800, 2200, 2600]);
    assert.deepEqual(athSplitDistances('ath.4x100'), [100, 200, 300]);
    assert.deepEqual(athSplitDistances('ath.4x400'), [400, 800, 1200]);
    for (const k of ['ath.100m', 'ath.200m', 'ath.110mh', 'ath.lj']) assert.deepEqual(athSplitDistances(k), [], k);
  });
  test('cycling: pursuit every 1000 m, kilo / 500 m / team sprint each 250 m lap, a 10 km+ ITT halfway', () => {
    assert.deepEqual(cycSplitDistances('cyc.ip.4000'), [1000, 2000, 3000]);
    assert.deepEqual(cycSplitDistances('cyc.tp.3000'), [1000, 2000]);
    assert.deepEqual(cycSplitDistances('cyc.tt.1000'), [250, 500, 750]);
    assert.deepEqual(cycSplitDistances('cyc.ts.750'), [250, 500]);
    assert.deepEqual(cycSplitDistances('cyc.itt.20'), [10000]);
    assert.deepEqual(cycSplitDistances('cyc.itt.5'), []);
    assert.deepEqual(cycSplitDistances('cyc.sprint'), []);
    assert.deepEqual(raceSplitDistances('swim.200free'), []); // swimming / crews keep their own tables
  });
  test('splitDistances dispatches: swim and crew tables unchanged, athletics and cycling added', () => {
    assert.deepEqual(splitDistances('swim.200free'), [50, 100, 150]);
    assert.deepEqual(splitDistances('row.1x.2000'), [500, 1000, 1500]);
    assert.deepEqual(splitDistances('cs.k1.500'), [250]);
    assert.deepEqual(splitDistances('ath.800m'), [400]);
    assert.deepEqual(splitDistances('cyc.ip.3000'), [1000, 2000]);
  });
  test('race distances and labels', () => {
    assert.equal(raceMetres('ath.1500m'), 1500); assert.equal(raceMetres('ath.110mh'), 110); assert.equal(raceMetres('ath.4x400'), 1600);
    assert.equal(raceMetres('swim.4x100medley'), 400); assert.equal(raceMetres('row.8p.2000'), 2000); assert.equal(raceMetres('cyc.itt.20'), 20000);
    assert.equal(raceMetres('ath.lj'), undefined); assert.equal(raceMetres('cyc.rr'), undefined);
    assert.equal(distanceLabel(300), '300 m'); assert.equal(distanceLabel(10000), '10 km'); assert.equal(distanceLabel(1000), '1000 m');
  });
});

/* ----------------------------- stats to track ---------------------------- */

describe('"Stats to track" — off by default, swimming splits as before', () => {
  test('raceTracking reads the sport settings; everything new is off unless switched on', () => {
    // round 2: + where the lap times are read (finish-line passes by default)
    assert.deepEqual(raceTracking('athletics', {}), { reaction: false, lapSplits: false, relayLegs: false, splits: false, takeovers: false, cycSplits: false, chipTimes: false, lapPoints: 'finish' });
    assert.equal(raceTracking('swimming', {}).splits, true);
    assert.equal(raceTracking('swimming', { splits: false }).splits, false);
    assert.equal(raceTracking('rowing', {}).splits, false);
    assert.equal(raceTracking('athletics', { lapSplits: true, relayLegs: true, reaction: true }).lapSplits, true);
    assert.equal(raceTracking('cycling', { cycSplits: true }).cycSplits, true);
    assert.equal(raceTracking('athletics', { cycSplits: true }).cycSplits, false); // another sport's key does nothing
  });
  test('splitsOffered: swimming / crews exactly as SD-94 / SD-99; athletics and cycling follow the toggles', () => {
    assert.equal(splitsOffered(D('swim.200free'), {}, OFF), true);
    assert.equal(splitsOffered(D('swim.200free'), { splits: false }, OFF), false);
    assert.equal(splitsOffered(D('swim.50free'), {}, OFF), false); // no split points
    assert.equal(splitsOffered(D('row.1x.2000'), {}, OFF), false);
    assert.equal(splitsOffered(D('row.1x.2000'), { splits: true }, OFF), true);
    assert.equal(splitsOffered(D('ath.1500m'), {}, OFF), false);
    assert.equal(splitsOffered(D('ath.1500m'), {}, raceTracking('athletics', { lapSplits: true })), true);
    assert.equal(splitsOffered(D('ath.4x400'), {}, raceTracking('athletics', { lapSplits: true })), false); // relays need relayLegs
    assert.equal(splitsOffered(D('ath.4x400'), {}, raceTracking('athletics', { relayLegs: true })), true);
    assert.equal(splitsOffered(D('ath.100m'), {}, raceTracking('athletics', { lapSplits: true })), false);
    assert.equal(splitsOffered(D('cyc.ip.4000'), {}, raceTracking('cycling', { cycSplits: true })), true);
    assert.equal(splitsOffered(D('cyc.rr'), {}, raceTracking('cycling', { cycSplits: true })), false);
    assert.equal(takeoversOffered(D('swim.4x100free'), raceTracking('swimming', { takeovers: true })), true);
    assert.equal(takeoversOffered(D('swim.100free'), raceTracking('swimming', { takeovers: true })), false);
    assert.equal(takeoversOffered(D('swim.4x100free'), raceTracking('swimming', {})), false);
  });
  test('the five plugins list their toggles under "Stats to track", all off except swimming splits', () => {
    assert.deepEqual(statsToTrack('athletics'), [['reaction', 'false'], ['lapSplits', 'false'], ['relayLegs', 'false'], ['chipTimes', 'false']]);
    assert.deepEqual(statsToTrack('swimming'), [['splits', 'true'], ['reaction', 'false'], ['takeovers', 'false']]);
    assert.deepEqual(statsToTrack('cycling'), [['cycSplits', 'false']]);
    assert.deepEqual(statsToTrack('rowing'), [['splits', 'false']]);
    assert.deepEqual(statsToTrack('canoe'), [['splits', 'false']]);
    assert.ok(isTimedRaceSport('canoe') && !isTimedRaceSport('weightlifting') && !isTimedRaceSport(null));
  });
});

/* ------------------------------ split analysis ----------------------------- */

const M1500 = D('ath.1500m');
const r1500 = [
  run('a', 'Asha', { order: 1, mark: 290.5, splits: [55, 125, 200] }),
  run('b', 'Bina', { order: 2, mark: 292.1, splits: [54, 124, 199] }),
  run('c', 'Chitra', { order: 3, mark: 300 }), // no splits read for her
];

describe('splits: laps, places, the winner\'s race', () => {
  test('splitPoints: cumulative times + each lap, the finish last; none recorded → []', () => {
    const pts = splitPoints(M1500, r1500[0].result);
    assert.deepEqual(pts.map((p) => [p.label, p.time, p.seg]), [['300 m', 55, 55], ['700 m', 125, 70], ['1100 m', 200, 75], ['1500 m', 290.5, 90.5]]);
    assert.deepEqual(splitPoints(M1500, r1500[2].result), []);
    assert.deepEqual(splitPoints(M1500, { splits: [55], status: 'DNF' }).map((p) => p.time ?? null), [55, null, null, null]);
    assert.deepEqual(splitPoints(D('swim.100free'), { splits: [30], mark: 62 }, true).map((p) => p.label), ['50 yd', '100 yd']);
  });
  test('splitPlaces: place at each split among those timed there; equal times share', () => {
    const pl = splitPlaces([...r1500.map((e) => ({ id: e.id, result: e.result })), { id: 'd', result: { splits: [55, 125] } }], 3);
    assert.deepEqual(pl.get('a'), [2, 2, 2]);
    assert.deepEqual(pl.get('b'), [1, 1, 1]);
    assert.deepEqual(pl.get('d'), [2, 2, undefined]);
    assert.deepEqual(pl.get('c'), [undefined, undefined, undefined]);
  });
  test('the winner\'s race from the splits; null without them', () => {
    const rows = rankEntries(r1500, M1500);
    assert.equal(winnerSplitStory(M1500, rows), 'came from 2nd at 1100 m');
    const led = rankEntries([run('a', 'Asha', { mark: 280, splits: [50, 120, 190] }), run('b', 'Bina', { mark: 285, splits: [51, 121, 191] })], M1500);
    assert.equal(winnerSplitStory(M1500, led), 'led at every split');
    const took = rankEntries([run('a', 'Asha', { mark: 280, splits: [52, 120, 190] }), run('b', 'Bina', { mark: 285, splits: [51, 121, 191] })], M1500);
    assert.equal(winnerSplitStory(M1500, took), 'took the lead by 700 m');
    assert.equal(winnerSplitStory(D('ath.100m'), rankEntries([run('x', 'X', { mark: 12 })], D('ath.100m'))), null);
    assert.equal(winnerSplitStory(M1500, rankEntries([run('x', 'X', { mark: 290 })], M1500)), null);
  });
  test('the fastest finish (last split → line)', () => {
    const f = fastestFinish(M1500, rankEntries(r1500, M1500))!;
    assert.deepEqual([f.name, f.seg, f.label], ['Asha', 90.5, '400 m']);
  });
});

/* -------------------------------- relays --------------------------------- */

describe('relay legs and swimming take-overs', () => {
  const members = ['Ravi', 'Sam', 'Tej', 'Uday'].map((n, i) => ({ playerId: `m${i}`, name: n }));
  test('athletics 4 × 100 m: leg times from the changeovers (leg 1 includes the reaction)', () => {
    const legs = relayLegs(D('ath.4x100'), { members, splits: [11.2, 21.4, 31.9], mark: 42.0 })!;
    assert.deepEqual(legs.map((l) => [l.leg, l.name, l.time]), [[1, 'Ravi', 11.2], [2, 'Sam', 10.2], [3, 'Tej', 10.5], [4, 'Uday', 10.1]]);
    assert.equal(relayLegs(D('ath.4x100'), { members, mark: 42 }), null); // nothing recorded → nothing shown
    assert.equal(relayLegs(D('ath.100m'), { splits: [1], mark: 12 }), null);
  });
  test('a missing changeover leaves both neighbouring legs blank, never 0', () => {
    const legs = relayLegs(D('ath.4x400'), { members, splits: [52, undefined as unknown as number, 156], mark: 208 })!;
    assert.deepEqual(legs.map((l) => l.time ?? null), [52, null, null, 52]);
  });
  test('swimming 4 × 100 m: legs at every 100 m of the 50 m splits; take-overs flagged below −0.03 s', () => {
    const legs = relayLegs(D('swim.4x100free'), { members, splits: [27, 56, 83, 112, 140, 169, 197], mark: 226.5, takeovers: [0.21, -0.05, null] })!;
    assert.deepEqual(legs.map((l) => l.time), [56, 56, 57, 57.5]);
    assert.deepEqual(legs.map((l) => [l.takeover ?? null, l.early ?? null]), [[null, null], [0.21, false], [-0.05, true], [null, null]]);
    assert.ok(relayLegs(D('swim.4x50medley'), { members, takeovers: [0.1] })); // take-overs alone still show
  });
  test('team sprint: each rider\'s 250 m lap', () => {
    assert.deepEqual(relayLegs(D('cyc.ts.750'), { members: members.slice(0, 3), splits: [17.5, 31.2], mark: 44.9 })!.map((l) => l.time), [17.5, 13.7, 13.7]);
  });
  test('take-over helpers: tolerance, text, parsing', () => {
    assert.equal(takeoverEarly(-0.03), false); assert.equal(takeoverEarly(-0.04), true); assert.equal(takeoverEarly(0.5), false); assert.equal(takeoverEarly(null), false);
    assert.equal(takeoverText(-0.05), '−0.05'); assert.equal(takeoverText(0.21), '+0.21');
    assert.equal(parseTakeover('0.21'), 0.21); assert.equal(parseTakeover('−0.05'), -0.05); assert.equal(parseTakeover('-.05'), -0.05);
    assert.equal(parseTakeover('21'), 0.21); assert.equal(parseTakeover('-5'), -0.05); assert.equal(parseTakeover(''), undefined);
    assert.ok(Number.isNaN(parseTakeover('abc'))); assert.ok(Number.isNaN(parseTakeover('7.5')));
  });
});

/* --------------------------- reaction, gaps, ranks ------------------------ */

describe('reaction times, gaps, a phase ranked like the screen', () => {
  const M100 = D('ath.100m');
  const rows = rankEntries([
    run('a', 'Asha', { lane: 4, mark: 12.31, reaction: 0.152 }), run('b', 'Bina', { lane: 5, mark: 12.55, reaction: 0.098 }),
    run('c', 'Chitra', { lane: 3, mark: 12.6 }), run('d', 'Divya', { lane: 6, status: 'DNS', reaction: 0.2 }),
  ], M100);
  test('reaction summary: fastest, average, under 0.100 s (athletics only); none recorded → null', () => {
    const s = reactionSummary(rows, 'athletics')!;
    assert.deepEqual([s.fastest.name, s.mean, s.n, s.under100], ['Bina', 0.125, 2, ['Bina']]);
    assert.deepEqual(reactionSummary(rows, 'swimming')!.under100, []);
    assert.equal(reactionSummary(rankEntries([run('x', 'X', { mark: 12 })], M100), 'athletics'), null);
  });
  test('gaps to the winner: seconds behind / metres short', () => {
    const g = gapsToWinner(rows, M100);
    assert.deepEqual([...g], [['b', 0.24], ['c', 0.29]]);
    assert.equal(raceGapText(0.24, M100), '+0.24');
    assert.equal(raceGapText(0.31, D('ath.lj')), '−0.31 m');
    const lj = rankEntries([run('x', 'X', { attempts: [{ mark: 5.4 }] }), run('y', 'Y', { attempts: [{ mark: 5.09 }] })], D('ath.lj'));
    assert.equal(gapsToWinner(lj, D('ath.lj')).get('y'), 0.31);
  });
  test('phaseRanking: heats with Q / q; a timed final across heats; crews routed', () => {
    const f: PhaseFormat = { discipline: 'ath.100m', phase: 'heat', phaseNo: 1, heats: 2, eventKey: 'e', progression: { byPlace: 1, byMark: 1 } };
    const pr = phaseRanking({ format: f, entries: [run('a', 'A', { mark: 12 }), run('b', 'B', { mark: 12.2 }), run('c', 'C', { mark: 12.1 }, 2), run('d', 'D', { mark: 12.5 }, 2)] })!;
    assert.deepEqual([...pr.heats.get(1)!, ...pr.heats.get(2)!].map((r) => `${r.id}:${r.flags.join('')}`), ['a:Q', 'b:q', 'c:Q', 'd:']);
    const tf = phaseRanking({ format: { ...f, phase: 'final', progression: undefined }, entries: [run('a', 'A', { mark: 12 }), run('c', 'C', { mark: 11.9 }, 2)] })!;
    assert.ok(tf.timedFinal);
    assert.equal(tf.heats.get(1)![0].position, 2);
    const plan = repechagePlan(9, 6);
    const crew: PhaseFormat = { discipline: 'row.1x.2000', phase: 'heat', phaseNo: 1, heats: 2, eventKey: 'r', plan, progression: plan[0].progression };
    const cr = phaseRanking({ format: crew, entries: [run('a', 'A', { mark: 420 }), run('b', 'B', { mark: 430 }), run('c', 'C', { mark: 425 }, 2)] })!;
    assert.equal(cr.dest.get('a'), 'Final A');
    assert.equal(phaseRanking({ format: { ...f, discipline: 'nope' }, entries: [] }), null);
  });
  test('heat names and round tags', () => {
    const f = (x: Partial<PhaseFormat>): PhaseFormat => ({ discipline: 'ath.100m', phase: 'heat', phaseNo: 1, heats: 3, eventKey: 'e', ...x });
    assert.equal(heatName(f({}), 2), 'Heat 2');
    assert.equal(heatName(f({ phase: 'semi', heats: 2 }), 1), 'Semi-final 1');
    assert.equal(heatName(f({ phase: 'final', heats: 1 }), 1), 'Final');
    assert.equal(heatName(f({ phase: 'final', heats: 2 }), 2), 'Final, heat 2');
    assert.equal(heatName(f({ phase: 'final', heats: 2, races: ['A', 'B'], discipline: 'row.1x.2000' }), 2), 'Final B');
    assert.equal(heatName(f({ phase: 'final', heats: 2, races: ['A', 'B'], discipline: 'cyc.ip.4000' }), 1), 'Final for gold');
    assert.equal(heatName(f({ phase: 'repechage', heats: 1 }), 1), 'Repechage');
    assert.equal(heatName(f({ phase: 'qualification', heats: 2, discipline: 'ath.lj' }), 2), 'Group B');
    assert.deepEqual([roundTag(f({}), 2), roundTag(f({ phase: 'semi', heats: 2 }), 1), roundTag(f({ phase: 'final', heats: 1 }), 1), roundTag(f({ phase: 'final', heats: 2, races: ['A', 'B'] }), 2)], ['H2', 'SF1', 'F', 'FB']);
  });
});

/* ----------------------------- through the rounds ------------------------- */

describe('paths through the rounds', () => {
  const plan = [{ phase: 'heat' as const, heats: 2, progression: { byPlace: 1, byMark: 1 } }, { phase: 'final' as const, heats: 1 }];
  const h: PhaseFormat = { discipline: 'ath.100m', phase: 'heat', phaseNo: 1, heats: 2, eventKey: 'e', plan, progression: plan[0].progression };
  const fin: PhaseFormat = { ...h, phase: 'final', phaseNo: 2, heats: 1, progression: undefined };
  const phases = [
    { id: 'ph1', format: h, entries: [run('h1', 'Asha', { mark: 12.4 }, 1, 'pa'), run('h2', 'Bina', { mark: 12.6 }, 1, 'pb'), run('h3', 'Chitra', { mark: 12.5 }, 2, 'pc'), run('h4', 'Divya', { mark: 13 }, 2, 'pd')] },
    { id: 'ph2', format: fin, entries: [run('f1', 'Asha', { mark: 12.3 }, 1, 'pa'), run('f2', 'Bina', { mark: 12.45 }, 1, 'pb'), run('f3', 'Chitra', { mark: 12.2 }, 1, 'pc')] },
  ];
  test('each athlete\'s rounds, furthest first, by athlete id (not name)', () => {
    const paths = progressionPaths(phases, new Map([['ph2', new Map([['f3', ['PB' as const]]])]]));
    assert.deepEqual(paths.map((p) => p.key), ['pc', 'pa', 'pb', 'pd']);
    assert.equal(pathText(paths[0]), 'H2 12.50 (1) Q → F 12.20 (1)');
    assert.deepEqual(paths[0].steps[1].flags, ['PB']);
    assert.equal(pathText(paths[2]), 'H1 12.60 (2) q → F 12.45 (3)');
    assert.equal(pathText(paths[3]), 'H2 13.00 (2)');
  });
  test('one round only → no paths; a relay team keeps its key across rounds', () => {
    assert.deepEqual(progressionPaths([phases[0]]), []);
    assert.equal(pathKey({ id: 'x', name: 'Red A', heat: 1, result: { team: { id: 't1', name: 'Red' } } }), 'team:t1');
  });
});

/* ------------------------------- heat analysis ------------------------------ */

describe('the race-analysis card data', () => {
  test('a 1500 m heat with lap times; a 100 m with nothing extra shows no card', () => {
    const rows = rankEntries(r1500, M1500);
    const a = heatAnalysis(M1500, 1, rows);
    assert.deepEqual(a.splitLabels, ['300 m', '700 m', '1100 m', '1500 m']);
    assert.equal(a.splits.length, 2);
    assert.equal(a.story, 'came from 2nd at 1100 m');
    assert.ok(hasAnalysis(a));
    const plain = heatAnalysis(D('ath.100m'), 1, rankEntries([run('x', 'X', { mark: 12 }), run('y', 'Y', { mark: 12.2 })], D('ath.100m')));
    assert.equal(hasAnalysis(plain), false); // old results: nothing new to show
    assert.equal(plain.gaps.get('y'), 0.2);
  });
  test('a relay shows legs (not raw splits) and the fastest flying leg', () => {
    const team = (id: string, splits: number[], mark: number, names: string[]): ResultEntry => ({ id, name: `${id} House`, heat: 1, result: { splits, mark, members: names.map((n) => ({ name: n })) } });
    const rows = rankEntries([team('Red', [11.2, 21.4, 31.9], 42, ['A', 'B', 'C', 'D']), team('Blue', [11, 21.5, 31.5], 41.9, ['E', 'F', 'G', 'H'])], D('ath.4x100'));
    const a = heatAnalysis(D('ath.4x100'), 1, rows);
    assert.equal(a.splits.length, 0);
    assert.equal(a.legs.length, 2);
    assert.deepEqual(a.fastestLeg, { name: 'G', team: 'Blue House', leg: 3, time: 10 });
  });
});

/* ------------------------------ road chip times ------------------------------ */

describe('road races: the chip (net) time beside the gun time', () => {
  const road = D('ath.road.10000');
  const on = raceTracking('athletics', { chipTimes: true });
  test('offered for a gun-timed road race or road walk when tracked — not XC, not a track walk, not a chip-timed race', () => {
    assert.equal(chipOffered(road, {}, on), true);
    assert.equal(chipOffered(road, {}, raceTracking('athletics', {})), false);
    assert.equal(chipOffered(road, { road: { kind: 'road', timing: 'chip' } }, on), false);
    assert.equal(chipOffered(D('ath.walk.10000'), {}, on), true);
    assert.equal(chipOffered(D('ath.walk.t3000'), {}, on), false);
    assert.equal(chipOffered(D('ath.xc.4000'), {}, on), false);
    assert.equal(chipOffered(D('ath.1500m'), {}, on), false);
  });
  test('shown on the sheet line; the gun time still ranks', () => {
    const rows = rankEntries([run('a', 'A', { fin: 1, mark: 2050, chip: 2043 }), run('b', 'B', { fin: 2, mark: 2049, chip: 2040 })], road);
    assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
    assert.equal(roadRowText(rows[0], { discipline: road.key }), 'chip 34:03');
    assert.equal(roadRowText(rankEntries([run('c', 'C', { fin: 1, mark: 2050 })], road)[0], { discipline: road.key }), '');
  });
});

/* -------------------------------- DQ reasons -------------------------------- */

describe('World Athletics DQ reasons', () => {
  test('lanes / break line / hurdles / relays only where they can happen', () => {
    const refs = (k: string) => athDqCodesFor(D(k)).map((c) => c.ref);
    assert.deepEqual(refs('ath.100m'), ['TR 17.3', 'TR 17.2', 'TR 6', 'TR 7.1']);
    assert.ok(refs('ath.800m').includes('TR 17.5'));
    assert.ok(refs('ath.110mh').includes('TR 22.6'));
    assert.ok(refs('ath.4x100').includes('TR 24.7') && !refs('ath.4x100').includes('TR 22.6'));
    assert.ok(!refs('ath.1500m').includes('TR 17.3')); // no lanes
    assert.ok(ATH_DQ.every((c) => /^TR \d/.test(c.ref) && c.label));
  });
  test('a picked reason is cleared when another rule is typed over it; a typed reason is kept', () => {
    assert.equal(athDqReasonStale({ reason: 'Lane infringement' }, 'TR 22.6'), true);
    assert.equal(athDqReasonStale({ reason: 'Lane infringement' }, 'TR 17.3'), false);
    assert.equal(athDqReasonStale({ reason: 'Pushed at the bell' }, 'TR 17.2'), false);
    assert.equal(athDqReasonStale({}, undefined), false);
  });
});

/* --------------------------- stat lines and careers -------------------------- */

describe('career keys: heats won, reaction time, the relay lead-off swim', () => {
  const M100 = D('ath.100m');
  test('a heat winner gets heatWins; a final winner doesn\'t (that is a gold); reaction only when read', () => {
    const rows = rankEntries([run('a', 'A', { mark: 12, reaction: 0.15 }), run('b', 'B', { mark: 12.2 })], M100);
    const heat = phaseLines({ discipline: 'ath.100m', phase: 'heat' }, rows);
    assert.deepEqual([heat[0].stats.heatWins, heat[0].stats.reaction, heat[1].stats.heatWins, 'reaction' in heat[1].stats], [1, 0.15, undefined, false]);
    const fin = phaseLines({ discipline: 'ath.100m', phase: 'final' }, rows);
    assert.equal(fin[0].stats.heatWins, undefined);
    const lj = phaseLines({ discipline: 'ath.lj', phase: 'qualification' }, rankEntries([run('x', 'X', { attempts: [{ mark: 5 }] })], D('ath.lj')));
    assert.equal(lj[0].stats.heatWins, undefined); // field events don't win heats
  });
  const members = ['Asha', 'Bina', 'Chitra', 'Divya'].map((n, i) => ({ playerId: `s${i}`, name: n }));
  const relay = (result: EntryResult): RankedEntry[] => rankEntries([{ id: 'r', name: 'Red A', heat: 1, result: { members, ...result } }], D('swim.4x100free'));
  const fmt = { discipline: 'swim.4x100free', phase: 'final' as const, category: { age: 'U14', gender: 'F' as const, course: 'LCM' as const } };
  test('the lead-off swimmer gets the 100 m freestyle time from the relay splits; the others don\'t', () => {
    const lines = phaseLines(fmt, relay({ mark: 240, splits: [28, 58.4, 88, 119, 149, 180, 210] }));
    assert.equal(lines[0].stats[markKey('swim.100free', 'LCM')], 58.4);
    assert.equal(lines[1].stats[markKey('swim.100free', 'LCM')], undefined);
    assert.ok(lines.every((l) => l.stats.relays === 1));
  });
  test('no lead-off time: no splits, a mixed relay, a DQ relay, the meet rule says relay only', () => {
    assert.equal(phaseLines(fmt, relay({ mark: 240 }))[0].stats.m_sw_100free_lc, undefined);
    assert.equal(phaseLines({ ...fmt, category: { ...fmt.category, gender: 'X' } }, relay({ mark: 240, splits: [28, 58.4] }))[0].stats.m_sw_100free_lc, undefined);
    assert.equal(phaseLines(fmt, relay({ mark: 240, splits: [28, 58.4], status: 'DQ' }))[0].stats.m_sw_100free_lc, undefined);
    assert.equal(phaseLines({ ...fmt, rules: { swimLeadOff: false } }, relay({ mark: 240, splits: [28, 58.4] }))[0].stats.m_sw_100free_lc, undefined);
    assert.equal(leadOffDiscipline('swim.4x100medley'), 'swim.100back');
    assert.equal(leadOffDiscipline('swim.4x50free'), 'swim.50free');
    assert.equal(leadOffDiscipline('swim.100free'), undefined);
    assert.equal(leadOffLine('ath.4x100', fmt, relay({ mark: 240, splits: [28, 58.4] })[0]), null);
  });
  test('the swimLeadOff rule: standard on, copied to phases only when switched off', () => {
    const r = ruleDef('swimLeadOff')!;
    assert.equal(r.default, true); assert.ok(r.phase);
    assert.ok(rulesFor('swimming').some((x) => x.key === 'swimLeadOff'));
    assert.deepEqual(phaseRules('swimming', { swimLeadOff: true }), {});
    assert.deepEqual(phaseRules('swimming', { swimLeadOff: false }), { swimLeadOff: false });
  });
  test('athleticsCareer: the lead-off counts as a 100 m freestyle PB (not a relay best); heats won; best reaction', () => {
    const lines = [
      { eventId: 'ph1', date: '2026-03-01', stats: { races: 1, place: 1, heatWins: 1, mark: 60.1, m_sw_100free_lc: 60.1, reaction: 0.71 } },
      { eventId: 'ph2', date: '2026-03-02', stats: { relays: 1, place: 1, golds: 1, m_sw_100free_lc: 58.4 } },
      { eventId: 'ph3', date: '2026-03-03', stats: { relays: 1, place: 2 } }, // an old relay line: as before
    ];
    const infos = new Map<string, PhaseInfo>([
      ['ph1', { discipline: 'swim.100free', category: { age: 'U14', gender: 'F', course: 'LCM' }, phase: 'heat', title: '100 m free heats', date: '2026-03-01' }],
      ['ph2', { discipline: 'swim.4x100free', category: { age: 'U14', gender: 'F', course: 'LCM' }, phase: 'final', title: '4 × 100 m free relay final', date: '2026-03-02' }],
      ['ph3', { discipline: 'swim.4x100free', category: { age: 'U14', gender: 'F', course: 'LCM' }, phase: 'final', title: '4 × 100 m free relay', date: '2026-03-03' }],
    ]);
    const c = athleticsCareer(lines, infos, '2026-01-01');
    assert.equal(c.bests.length, 1);
    assert.equal(c.bests[0].pb.value, 58.4);
    assert.match(c.bests[0].label, /100 m freestyle/);
    assert.equal(c.heatWins, 1);
    assert.deepEqual(c.bestReaction, { value: 0.71, title: '100 m free heats', date: '2026-03-01', eventId: 'ph1' });
    assert.equal(c.relays, 2);
    const relayRow = c.history.find((h) => h.eventId === 'ph2')!;
    assert.match(relayRow.text, /relay · lead-off 58\.40/);
    assert.deepEqual(relayRow.flags, ['PB']);
    assert.equal(c.history.find((h) => h.eventId === 'ph3')!.text, '2nd relay');
    const none = athleticsCareer([{ eventId: 'x', stats: { races: 1, place: 3, mark: 12.5, m_100m: 12.5 } }], new Map(), '2026-01-01');
    assert.equal(none.heatWins, 0); assert.equal(none.bestReaction, undefined);
  });
  test('crews: a heat / repechage won; Final B\'s winner (7th) is not a win', () => {
    const X1 = D('row.1x.2000');
    const heat = crewLines({ discipline: 'row.1x.2000', phase: 'heat' }, rankEntries([run('a', 'A', { mark: 420 }), run('b', 'B', { mark: 430 })], X1));
    assert.deepEqual(heat.map((l) => l.stats.heatWins), [1, undefined]);
    const fin = crewLines({ discipline: 'row.1x.2000', phase: 'final' }, rankEntries([run('a', 'A', { mark: 420, race: 'A' }), run('b', 'B', { mark: 410, race: 'B' })], X1));
    assert.ok(fin.every((l) => l.stats.heatWins === undefined));
    const cc = crewCareer(heat.map((l) => ({ eventId: 'h', stats: l.stats })), new Map(), '2026-01-01');
    assert.equal(cc.heatWins, 1);
  });
  test('schemas: heatWins / reaction declared with shared labels; best reaction = the lowest, absent when never read', () => {
    for (const sp of ['athletics', 'swimming', 'rowing', 'canoe'] as const) {
      assert.deepEqual(validateSchema(STAT_SCHEMAS[sp]), [], sp);
      assert.ok(STAT_SCHEMAS[sp].stats.some((d) => d.key === 'heatWins'), sp);
    }
    const sch = STAT_SCHEMAS.athletics;
    const def = sch.stats.find((d) => d.key === 'reaction')!;
    const L = (stats: Record<string, number>): StatLine => ({ id: String(Math.random()), playerId: 'p', sport: 'athletics', stats } as StatLine);
    assert.equal(aggregateValue(sch, def, [L({ races: 1, reaction: 0.16 }), L({ races: 1, reaction: 0.142 }), L({ races: 1 })]).value, 0.142);
    assert.equal(aggregateValue(sch, def, [L({ races: 1 })]).value, undefined); // never read: no figure, not 0
    assert.equal(statDef('heatWins')?.label, 'Heats won');
  });
});

/* --------------------------- relay fixture sanity ---------------------------- */

describe('the discipline as raced', () => {
  test('a phase keeps its rules on the discipline (swimLeadOff off travels with it)', () => {
    const d = phaseDiscipline(D('swim.4x100free'), { rules: { swimLeadOff: false } });
    assert.equal(d.rules?.swimLeadOff, false);
    assert.ok(rankByHeat([], d).size === 0);
  });
});
