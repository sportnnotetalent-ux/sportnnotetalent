/**
 * Racket round 2 — the founder's answers to the deep wave's open questions
 * (docs/sport-depth/deep-wave/racket-round2.md):
 *   1. tennis serve speed in mph as well as km/h (a match / format option;
 *      the log stays km/h — converted on entry and display);
 *   2. "Fastest serve" a tournament leader with a minimum (10 serves clocked);
 *   3. badminton Jump smash and Block shots;
 *   4. rally-length buckets an organiser option per sport (default = the
 *      deep-wave buckets; old matches read as before);
 *   5. leaders with minimums: padel net points won %, pickleball 3rd-shot
 *      drop success %, table tennis serve & 3rd ball won %;
 *   6. squash "lets asked" in careers, per player;
 *   7. pickleball "Nobody" on the kitchen-line mark → kitchen ARRIVAL %.
 * Rules: scoring stays one tap, new capture optional, old logs replay
 * identically, nothing untracked reads 0, career keys only when tracked.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs } from '../src/sports/rallyEngine.ts';
import { badmintonTotals, padelTotals, rallyTotals, tennisTotals } from '../src/sports/racketTotals.ts';
import {
  DEFAULT_RALLY_SCHEME, DEPTH_SPORTS, MPH_MAX, MPH_MIN, RALLY_BUCKETS_OF, RALLY_SCHEMES, allRallyBuckets, applyPointDetail, arrivalTracked, creditsOf,
  detailFlags, detailKeys, initDetailFlags, matchRallyBuckets, netSides, pdText, rallyBucketsOf, rallySchemeOf, speedIn, speedRange, speedText,
  speedUnitOf, toggleNet, toggleNobody, validSpeed, type DetailSport,
} from '../src/sports/pointDetail.ts';
import { keyStats as tennisKeyStats, rallyLengthRows as tennisRallyRows, tennisCareerKeys, tennisView, TENNIS_EXTRA_KEYS } from '../src/sports/tennis/matchStats.ts';
import { tennisCommentary } from '../src/sports/tennis/commentaryModel.ts';
import { ARRIVAL_KEYS, LETS_KEY, keyStats, letsTracked, phaseRows, racketCareerKeys, racketExtraKeys, racketView, rallyLengthRows } from '../src/sports/racketMatchStats.ts';
import { racketCommentary, racketSentence } from '../src/sports/racketCommentaryModel.ts';
import { detailLiveSettings, trackFormatFields, trackOptionFields } from '../src/sports/pointDetailSettings.ts';
import { planLiveApply } from '../src/sports/liveSettings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { aggregateValue, qualifierOf, qualifierText, rankPlayers, statDefIn, validateSchema, type SportStatSchema } from '../src/sports/statSchema.ts';
import { effectiveQualifier, minimumRows } from '../src/data/leaderMinimums.ts';
import { careerSections } from '../src/data/career.ts';
import { readFileSync } from 'node:fs';

type Side = 'home' | 'away';
const P = (side: Side, id?: string): ScoreAction => ({ type: 'POINT', side, ...(id ? { attribution: { playerId: id, stat: 'points', playerName: id.toUpperCase() } } : {}) });
const D = (payload: Record<string, unknown>): ScoreAction => ({ type: 'POINT_DETAIL', payload });
const FS = (side: Side, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side, ...extra } });
const TRACK = (flags: Record<string, unknown>): ScoreAction => ({ type: 'SET_DETAIL', payload: flags });
const LET = (side?: Side): ScoreAction => ({ type: 'LET', ...(side ? { side } : {}) });
const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(reducer, s0);
const rally = (id: 'tabletennis' | 'squash' | 'pickleball', perSide = 1) =>
  makeRallyEngine({ id, icon: '', sideOutValue: id === 'squash' ? 'english' : id === 'pickleball' ? 'sideout' : '__none__', sideOutLabel: 'x', defaults: { playersPerSide: perSide, target: 11, winBy: 2, gamesToWin: 3 } });
const TT = rally('tabletennis');
const SQ = rally('squash');
const SQ2 = rally('squash', 2);
const PB1 = rally('pickleball');
const SINGLES = L.ctxOf({ home: ['h1'], away: ['a1'] });
const DOUBLES = L.ctxOf({ home: ['h1', 'h2'], away: ['a1', 'a2'] });
const R1 = { home: ['h1'], away: ['a1'] };
const show = (rows: Array<{ label: string; home: string; away: string }>) => rows.map((r) => `${r.label}: ${r.home} | ${r.away}`);
const line = (sport: string, stats: Record<string, number>, id = 'm1', playerId = 'p'): StatLine => ({ id, matchId: id, playerId, sport, stats } as StatLine);
const ev = () => [{ id: 1, stamp: 'Game 1', icon: '', label: 'Point', side: 'home' as const, kind: 'point' }];

// ------------------------------------------------- 1 · serve speed unit --

describe('round 2 · 1 — serve speed in km/h or mph (the log stays km/h)', () => {
  test('validSpeed: typed in the unit, stored as a whole km/h; ranges match; every whole mph reads back', () => {
    assert.equal(validSpeed('193'), 193);
    assert.equal(validSpeed('120', 'mph'), 193);
    assert.equal(validSpeed(' 95 ', 'mph'), 153);
    assert.deepEqual([validSpeed(MPH_MIN - 1, 'mph'), validSpeed(MPH_MAX + 1, 'mph'), validSpeed('', 'mph'), validSpeed('abc', 'mph')], [undefined, undefined, undefined, undefined]);
    assert.deepEqual([validSpeed(MPH_MIN, 'mph'), validSpeed(MPH_MAX, 'mph')], [31, 270]); // inside 30–270 km/h
    for (let m = MPH_MIN; m <= MPH_MAX; m++) assert.equal(speedIn(validSpeed(m, 'mph')!, 'mph'), m, `${m} mph`);
    assert.deepEqual([speedRange('kmh'), speedRange('mph')], [[30, 270], [19, 168]]);
    assert.deepEqual([speedText(193), speedText(193, 'mph'), speedText(182.5, 'mph'), speedText(undefined, 'mph')], ['193 km/h', '120 mph', '113 mph', '–']);
    assert.deepEqual([speedUnitOf({ speedUnit: 'mph' }), speedUnitOf({}), speedUnitOf(null), speedUnitOf({ speedUnit: 'knots' })], ['mph', 'kmh', 'kmh', 'kmh']);
  });
  test('a match / format option: SET_DETAIL and the format set it; km/h leaves an old state untouched', () => {
    assert.deepEqual(detailFlags({ speedUnit: 'mph' }, {}), { speedUnit: 'mph' });
    assert.equal(detailFlags({ speedUnit: 'kmh' }, {}), null);
    assert.equal(detailFlags({ speedUnit: 'knots' }, {}), null);
    assert.deepEqual(detailFlags({ speedUnit: 'kmh' }, { speedUnit: 'mph' }), { speedUnit: 'kmh' });
    assert.equal(tennis.init({ speedUnit: 'mph' }).speedUnit, 'mph');
    assert.equal('speedUnit' in tennis.init({ speedUnit: 'kmh' }), false);
    assert.equal('speedUnit' in tennis.init(), false);
    const ls = detailLiveSettings('tennis');
    const fresh = tennis.init();
    assert.deepEqual(planLiveApply(ls as never, fresh, 0, ls.read(fresh as never), { ...ls.read(fresh as never), speedUnit: 'mph' }), { kind: 'format', patch: { speedUnit: 'mph' } });
    const live = run(tennis.reducer, fresh, [FS('home'), P('home')]);
    const plan = planLiveApply(ls as never, live, 2, ls.read(live as never), { ...ls.read(live as never), speedUnit: 'mph' });
    assert.deepEqual(plan, { kind: 'event', action: { type: 'SET_DETAIL', payload: { speedUnit: 'mph' } } });
    assert.equal(ls.read(tennis.reducer(live, (plan as { action: ScoreAction }).action) as never).speedUnit, 'mph');
    // the organiser's default: an advanced format field of tennis (with the Stats to track toggles);
    // tennis/index.tsx pulls in React Native, so read that it spreads them
    const ff = trackFormatFields('tennis').find((f) => f.key === 'speedUnit')!;
    assert.deepEqual([ff.type, ff.default, ff.advanced, ff.options!.map((o) => o.value)], ['choice', 'kmh', true, ['kmh', 'mph']]);
    assert.ok(trackFormatFields('tennis').some((f) => f.key === 'speedDetail' && f.advanced));
    assert.match((readFileSync(new URL('../src/sports/tennis/index.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/sports/tennis/meta.ts', import.meta.url), 'utf8')), /\.\.\.trackFormatFields\('tennis'\)/);
  });
  test('the panel, the commentary show mph; the log and the career keys stay km/h', () => {
    const s = run(tennis.reducer, tennis.init({ speedUnit: 'mph' }), [
      FS('home'), TRACK({ speedDetail: true }),
      P('home'), D({ kmh: validSpeed('120', 'mph') }),
      P('home'), D({ kmh: validSpeed('110', 'mph') }),
    ]);
    assert.deepEqual(s.events.filter((e) => e.kind === 'point').map((e) => e.kmh), [193, 177]);
    const v = tennisView(s, R1)!;
    assert.equal(v.unit, 'mph');
    const svc = tennisKeyStats(v).find((x) => x.id === 'service')!;
    assert.deepEqual(show(svc.rows.filter((r) => r.key.startsWith('kmh'))), ['Fastest serve: 120 mph | –', 'Serve average: 115 mph | –']);
    const t = tennisTotals(s, SINGLES);
    assert.deepEqual([t.h1.stats.srvKmhMax, t.h1.stats.srvKmhSum, t.h1.stats.srvKmhN], [193, 370, 2]);
    const meta = tennisCommentary(s, { homeName: 'H', awayName: 'A' })[0].rows.flatMap((r) => (r.kind === 'point' && r.meta ? [r.meta] : []));
    assert.deepEqual(meta, ['110 mph', '120 mph']);
    // switching back to km/h re-reads the same log
    const k = tennis.reducer(s, TRACK({ speedUnit: 'kmh' }));
    assert.equal(tennisKeyStats(tennisView(k, R1)!).find((x) => x.id === 'service')!.rows.find((r) => r.key === 'kmhMax')!.home, '193 km/h');
  });
});

// -------------------------------------------- 2 · fastest serve leader --

describe('round 2 · 2 — "Fastest serve" ranks with a minimum of 10 serves clocked', () => {
  const sch = STAT_SCHEMAS.tennis as never as SportStatSchema<string>;
  const def = statDefIn(sch, 'srvKmhMax')!;
  test('the leader, its minimum and the organiser override', () => {
    assert.ok(sch.leaders.includes('srvKmhMax'));
    assert.deepEqual(qualifierOf(def), { den: 10, unit: { label: 'serves clocked', one: 'serve clocked' } });
    assert.equal(qualifierText(sch, def, qualifierOf(def)), 'min 10 serves clocked');
    assert.deepEqual(effectiveQualifier('tennis', 'srvKmhMax', { srvKmhMax: 4 }), { den: 4, unit: { label: 'serves clocked', one: 'serve clocked' } });
    assert.equal(effectiveQualifier('tennis', 'srvKmhMax', { srvKmhMax: 0 }), null);
    assert.ok(minimumRows('tennis').some((r) => r.key === 'srvKmhMax' && r.label === 'Fastest serve' && r.text === 'min 10 serves clocked'));
  });
  test('ranks by the best single match among players with enough serves clocked; the career figure is unchanged', () => {
    const lines = [
      line('tennis', { srvKmhMax: 199, srvKmhN: 9 }, 'm1', 'a'),
      line('tennis', { srvKmhMax: 188, srvKmhN: 4 }, 'm2', 'b'), line('tennis', { srvKmhMax: 176, srvKmhN: 8 }, 'm3', 'b'),
      line('tennis', { points: 4 }, 'm4', 'c'),
    ];
    assert.deepEqual(rankPlayers(sch, def, lines).map((r) => [r.playerId, r.value, r.den]), [['b', 188, 12]]);
    assert.deepEqual(rankPlayers(sch, def, lines, { qualifier: null }).map((r) => r.playerId), ['a', 'b']);
    const a = aggregateValue(sch, def, [lines[0]]);
    assert.deepEqual([a.text, a.den, a.tracked], ['199', 9, true]);
  });
  test('validation: a best figure with a den minimum must say which keys are its den', () => {
    const bad = { ...sch, stats: sch.stats.map((s) => (s.key === 'srvKmhMax' ? { ...s, agg: { kind: 'max' as const, qualifier: { den: 10 } } } : s)) };
    assert.ok(validateSchema(bad as never).some((e) => e.includes('srvKmhMax')));
    assert.deepEqual(validateSchema(sch as never), []);
  });
});

// ------------------------------------------------ 3 · badminton shots --

describe('round 2 · 3 — badminton Jump smash and Block', () => {
  test('chips, credits, keys, words; another sport refuses them', () => {
    assert.deepEqual(creditsOf('badminton', { how: 'winner', wing: 'bh', shot: 'jumpSmash' }), [['winner', 'winners'], ['winner', 'winnersBh'], ['winner', 'winnersJumpSmash']]);
    assert.deepEqual(creditsOf('badminton', { how: 'fe', shot: 'block' }), [['loser', 'forcedErrors'], ['loser', 'feBlock']]);
    for (const k of ['winnersJumpSmash', 'ueJumpSmash', 'feJumpSmash', 'winnersBlock', 'ueBlock', 'feBlock']) assert.ok(detailKeys('badminton').includes(k), k);
    assert.deepEqual(applyPointDetail(ev(), { pd: { how: 'winner', shot: 'jumpSmash' } }, 'badminton')![0].pd, { how: 'winner', shot: 'jumpSmash' });
    assert.deepEqual(applyPointDetail(ev(), { pd: { how: 'winner', shot: 'jumpSmash' } }, 'squash')![0].pd, { how: 'winner' });
    assert.equal(pdText({ how: 'fe', wing: 'bh', shot: 'block' }, true, 'badminton'), 'Forced error (backhand block)');
    assert.equal(racketSentence('badminton', { side: 'home', kind: 'point', pd: { how: 'winner', wing: 'fh', shot: 'jumpSmash' } }, { winner: 'Axelsen', loser: 'Lee', server: 'Axelsen' }),
      'Axelsen wins the point with a Forehand Jump Smash Winner');
  });
  test('careers: the keys are written when tracked, declared and labelled as other sports\' keys of the same name', () => {
    const s = run(badminton.reducer, badminton.init({}), [FS('home'), TRACK({ pointDetail: true }), P('home', 'h1'), D({ pd: { how: 'winner', shot: 'jumpSmash' } }), P('away', 'a1'), D({ pd: { how: 'winner', wing: 'bh', shot: 'block' } })]);
    const t = badmintonTotals(s, SINGLES);
    assert.deepEqual([t.h1.stats.winnersJumpSmash, t.a1.stats.winnersBlock, t.a1.stats.winnersBh, t.h1.stats.feBlock], [1, 1, 1, 0]);
    const bd = STAT_SCHEMAS.badminton as never, tt = STAT_SCHEMAS.tabletennis as never;
    assert.equal(statDefIn(bd, 'winnersJumpSmash')!.label, 'Jump smash winners');
    assert.equal(statDefIn(bd, 'winnersBlock')!.label, statDefIn(tt, 'winnersBlock')!.label);
    const rows = careerSections(bd, [line('badminton', { winners: 3, winnersJumpSmash: 2, winnersBlock: 0 })]).find((x) => x.id === 'shots')!.rows.map((r) => r.key);
    assert.ok(rows.includes('winnersJumpSmash') && !rows.includes('winnersBlock')); // a shot row hides at 0
  });
});

// ------------------------------------------- 4 · rally-length buckets --

describe('round 2 · 4 — rally-length buckets are an organiser option per sport', () => {
  test('every sport: the deep-wave buckets are the default scheme, plus one standard alternative', () => {
    const sports: DetailSport[] = ['tennis', ...DEPTH_SPORTS];
    for (const sp of sports) {
      assert.equal(RALLY_SCHEMES[sp][0].id, DEFAULT_RALLY_SCHEME, sp);
      assert.deepEqual(RALLY_SCHEMES[sp][0].buckets, RALLY_BUCKETS_OF[sp], sp);
      assert.ok(RALLY_SCHEMES[sp].length >= 2, sp);
      assert.deepEqual(rallyBucketsOf(sp), RALLY_BUCKETS_OF[sp], sp);
      assert.deepEqual(rallySchemeOf(sp, 'nope').id, 'std', sp);
      // the option is a choice beside the toggles, in the card and the format
      const f = trackOptionFields(sp).find((x) => x.key === 'rallyBuckets')!;
      assert.deepEqual([f.type, f.default, f.options!.map((o) => o.value)], ['choice', 'std', RALLY_SCHEMES[sp].map((x) => x.id)], sp);
    }
    assert.deepEqual(rallyBucketsOf('tabletennis', 'four'), ['1-2', '3-4', '5-6', '7+']);
    assert.deepEqual(rallyBucketsOf('squash', 'long'), ['0-10', '11-20', '21+']);
    assert.deepEqual(rallyBucketsOf('padel', 'chart'), ['1-3', '4-6', '7-9', '10+']);
    for (const sp of DEPTH_SPORTS) assert.ok(trackFormatFields(sp).some((f) => f.key === 'rallyBuckets' && f.advanced), sp);
  });
  test('the scheme: format (non-default only) and SET_DETAIL; a capture refuses another sport\'s bucket', () => {
    assert.deepEqual(initDetailFlags({ rallyBuckets: 'chart' }), { rallyBuckets: 'chart' });
    assert.deepEqual(initDetailFlags({ rallyBuckets: 'std' }), {});
    assert.deepEqual(detailFlags({ rallyBuckets: 'four' }, {}), { rallyBuckets: 'four' });
    assert.equal(detailFlags({ rallyBuckets: 'std' }, {}), null);
    assert.equal(TT.init({ rallyBuckets: 'four' }).rallyBuckets, 'four');
    assert.equal('rallyBuckets' in TT.init({}), false);
    assert.equal(applyPointDetail(ev(), { rallyLen: '7+' }, 'tabletennis')![0].rallyLen, '7+');
    assert.equal(applyPointDetail(ev(), { rallyLen: '7+' }, 'badminton'), null);
    assert.equal(applyPointDetail(ev(), { rallyLen: '1-3' }, 'padel')![0].rallyLen, '1-3');
    assert.equal(applyPointDetail(ev(), { rallyLen: '0-10' }, 'padel'), null);
    assert.equal(applyPointDetail(ev(), { rallyLen: '21+' }, 'squash')![0].rallyLen, '21+');
  });
  test('old matches read the default buckets as before; a mid-match change reads both, by length', () => {
    const old = run(badminton.reducer, badminton.init({}), L.BADMINTON_LOG);
    assert.deepEqual(racketView('badminton', old, R1)!.buckets, ['0-4', '5-10', '11+']);
    const mixed = run(badminton.reducer, badminton.init({}), [
      FS('home'), TRACK({ rallyDetail: true }), P('home'), D({ rallyLen: '0-4' }), TRACK({ rallyBuckets: 'chart' }), P('home'), D({ rallyLen: '1-3' }),
    ]);
    // the new scheme's buckets + the old one's that a point carries (5–10 / 11+ never used: left out)
    assert.deepEqual(matchRallyBuckets('badminton', mixed), ['0-4', '1-3', '4-6', '7-9', '10+']);
    const v = racketView('badminton', mixed, R1)!;
    assert.deepEqual(rallyLengthRows(v).filter((r) => r.hv + r.av).map((r) => r.label), ['0–4 shots', '1–3 shots']);
  });
  test('padel with the finer buckets: panel and careers follow them (no default-bucket keys)', () => {
    const s = run(padel.reducer, padel.init({ rallyBuckets: 'chart', playersPerSide: 1 }), [
      FS('home'), TRACK({ rallyDetail: true }), P('home'), D({ rallyLen: '1-3' }), P('away'), D({ rallyLen: '10+' }), P('away'), D({ rallyLen: '10+' }),
    ]);
    const v = racketView('padel', s, R1)!;
    assert.deepEqual(show(rallyLengthRows(v)), ['1–3 shots: 1 (100%) | 0 (0%)', '4–6 shots: – | –', '7–9 shots: – | –', '10+ shots: 0 (0%) | 2 (100%)']);
    const t = padelTotals(s, SINGLES);
    assert.deepEqual([t.h1.stats.rl13Pts, t.h1.stats.rl13Won, t.a1.stats.rl10Pts, t.a1.stats.rl10Won, t.h1.stats.rl46Pts], [1, 1, 2, 2, 0]);
    assert.equal('rl04Pts' in t.h1.stats, false);
    const sch = STAT_SCHEMAS.padel as never;
    const rally = careerSections(sch, [line('padel', { rl13Pts: 4, rl13Won: 3, rl46Pts: 2, rl46Won: 1, rl79Pts: 0, rl79Won: 0, rl10Pts: 1, rl10Won: 0 })]).find((x) => x.id === 'rally')!;
    assert.deepEqual(rally.rows.map((r) => [r.key, r.value]), [['rl13Pct', '75%'], ['rl46Pct', '50%'], ['rl10Pct', '0%']]);
  });
  test('table tennis four phases: transition (5–6) and stalemate (7+); serve & 3rd / receive & 4th unchanged', () => {
    const s = run(TT.reducer, TT.init({ rallyBuckets: 'four' }), [
      FS('away'), TRACK({ rallyDetail: true }),
      P('away'), D({ rallyLen: '1-2' }), P('home'), D({ rallyLen: '5-6' }), P('home'), D({ rallyLen: '7+' }), P('away'), D({ rallyLen: '3-4' }),
    ]);
    const v = racketView('tabletennis', s, R1)!;
    assert.deepEqual(rallyLengthRows(v).map((r) => r.label), ['Serve & receive (1–2)', '3rd & 4th ball (3–4)', 'Transition (5–6)', 'Stalemate (7+)']);
    assert.deepEqual(show(phaseRows(v)), [
      'Serve & 3rd ball (own serve, shots 1–4): 0/1 (0%) | 1/1 (100%)',
      'Receive & 4th ball (shots 1–4): 0/1 (0%) | 1/1 (100%)',
      'Transition (5–6 shots): 1/1 (100%) | 0/1 (0%)',
      'Stalemate (7+ shots): 1/1 (100%) | 0/1 (0%)',
    ]);
    const k = racketCareerKeys(v, 'home');
    assert.deepEqual([k.rl56Pts, k.rl56Won, k.rl7Pts, k.rl7Won, k.serve3Pts, k.receive4Pts, 'rl5Pts' in k], [1, 1, 1, 1, 1, 1, false]);
    const tt = STAT_SCHEMAS.tabletennis as never;
    assert.equal(statDefIn(tt, 'rl56Pct')!.label, 'Points won % · rally 5–6 shots (transition)');
    assert.equal(statDefIn(tt, 'rl7Pct')!.label, 'Points won % · rally 7+ shots (stalemate)');
  });
  test('tennis with the Match Charting buckets: panel, career keys, schema; default tennis unchanged', () => {
    const s = run(tennis.reducer, tennis.init({ rallyBuckets: 'chart' }), [FS('home'), TRACK({ rallyDetail: true }), P('home'), D({ rallyLen: '4-6' }), P('away'), D({ rallyLen: '7-9' })]);
    const v = tennisView(s, R1)!;
    assert.deepEqual(v.buckets, ['1-3', '4-6', '7-9', '10+']);
    assert.deepEqual(show(tennisRallyRows(v).filter((r) => r.hv + r.av)), ['4–6 shots: 1 (100%) | 0 (0%)', '7–9 shots: 0 (0%) | 1 (100%)']);
    assert.deepEqual(tennisRallyRows(v).map((r) => r.label), ['1–3 shots', '4–6 shots', '7–9 shots', '10+ shots']);
    assert.deepEqual(tennisCareerKeys(v, 'home', 'h1'), { rl13Pts: 0, rl13Won: 0, rl46Pts: 1, rl46Won: 1, rl79Pts: 1, rl79Won: 0, rl10Pts: 0, rl10Won: 0 });
    for (const k of ['rl13Pts', 'rl46Won', 'rl79Pct', 'rl10Pct']) assert.ok(statDefIn(STAT_SCHEMAS.tennis as never, k), k);
    assert.ok(TENNIS_EXTRA_KEYS.includes('rl10Won'));
    assert.deepEqual(tennisView(run(tennis.reducer, tennis.init(), L.TENNIS_BO3), R1)!.buckets, ['0-4', '5-8', '9+']);
  });
  test('a rally key shared by several sports reads the same in each', () => {
    const schemas = (['tennis', ...DEPTH_SPORTS] as const).map((sp) => [sp, STAT_SCHEMAS[sp] as never as SportStatSchema<string>] as const);
    const labels = new Map<string, Set<string>>();
    for (const [, sch] of schemas) for (const d of sch.stats) if (/^rl\d/.test(d.key)) (labels.get(d.key) ?? labels.set(d.key, new Set()).get(d.key)!).add(d.label);
    for (const [k, set] of labels) assert.equal(set.size, 1, `${k}: ${[...set].join(' / ')}`);
    for (const sp of ['tennis', ...DEPTH_SPORTS] as DetailSport[]) {
      for (const b of allRallyBuckets(sp)) assert.ok(schemas.find(([x]) => x === sp)![1].stats.some((d) => d.key === `rl${b.replace(/[-+]/g, '')}Pct`), `${sp} ${b}`);
    }
  });
});

// ----------------------------------------------------- 5 · leaders --

describe('round 2 · 5 — padel net %, pickleball 3rd-shot drop %, table tennis serve & 3rd ball % lead with a minimum', () => {
  const cases: Array<[DetailSport, string, string, string, string]> = [
    ['padel', 'netPtsPct', 'Net points won %', 'min 20 net points', 'netPts'],
    ['pickleball', 'thirdDropPct', '3rd-shot drop success %', 'min 15 3rd-shot drops', 'thirdDrop'],
    ['tabletennis', 'serve3Pct', 'Serve & 3rd ball won %', 'min 30 serve & 3rd ball points', 'serve3Pts'],
  ];
  test('each is a leader with its minimum (an organiser can change it)', () => {
    for (const [sp, key, label, min] of cases) {
      const sch = STAT_SCHEMAS[sp] as never as SportStatSchema<string>;
      assert.equal(sch.leaders.at(-1), key, sp);
      const def = statDefIn(sch, key)!;
      assert.equal(def.leaderLabel, label, sp);
      assert.equal(qualifierText(sch, def, qualifierOf(def)), min, sp);
      assert.ok(minimumRows(sp).some((r) => r.key === key && r.text === min), sp);
    }
    // the rest of the family is unchanged: no depth leader for badminton / squash, pickleball's kitchen % none
    assert.equal(STAT_SCHEMAS.badminton.leaders.includes('netPtsPct' as never), false);
    assert.equal(qualifierOf(statDefIn(STAT_SCHEMAS.pickleball as never, 'kitchenPct')!), undefined);
  });
  test('ranking respects the minimum', () => {
    const pd = STAT_SCHEMAS.padel as never as SportStatSchema<string>;
    const def = statDefIn(pd, 'netPtsPct')!;
    const lines = [line('padel', { netPts: 12, netPtsWon: 9 }, 'm1', 'a'), line('padel', { netPts: 10, netPtsWon: 6 }, 'm2', 'a'), line('padel', { netPts: 8, netPtsWon: 8 }, 'm3', 'b')];
    assert.deepEqual(rankPlayers(pd, def, lines).map((r) => [r.playerId, r.text]), [['a', '68%']]);
    const pb = STAT_SCHEMAS.pickleball as never as SportStatSchema<string>;
    const drop = statDefIn(pb, 'thirdDropPct')!;
    assert.deepEqual(rankPlayers(pb, drop, [line('pickleball', { thirdDrop: 16, thirdDropWon: 10 }, 'm1', 'a'), line('pickleball', { thirdDrop: 14, thirdDropWon: 14 }, 'm2', 'b')]).map((r) => r.playerId), ['a']);
    const tt = STAT_SCHEMAS.tabletennis as never as SportStatSchema<string>;
    const s3 = statDefIn(tt, 'serve3Pct')!;
    assert.deepEqual(rankPlayers(tt, s3, [line('tabletennis', { serve3Pts: 30, serve3Won: 18 }, 'm1', 'a'), line('tabletennis', { serve3Pts: 29, serve3Won: 29 }, 'm2', 'b')]).map((r) => r.playerId), ['a']);
  });
});

// -------------------------------------------------- 6 · squash lets --

describe('round 2 · 6 — squash "lets asked" in careers, per player', () => {
  test('credited to the player who asked (named lets only); no key without a named let', () => {
    const s = run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), LET('away'), LET(), LET('away'), P('away'), LET('home')]);
    const v = racketView('squash', s, R1)!;
    assert.equal(letsTracked(v), true);
    const t = rallyTotals(s, SINGLES, 'squash');
    assert.deepEqual([t.h1.stats[LETS_KEY], t.a1.stats[LETS_KEY]], [1, 2]);
    // an old match (one unnamed Let button) or one without a let: no key — never a false 0
    const old = rallyTotals(run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), LET()]), SINGLES, 'squash');
    assert.equal(LETS_KEY in old.h1.stats, false);
    assert.equal(LETS_KEY in rallyTotals(run(SQ.reducer, SQ.init({}), L.SQUASH_LOG), SINGLES, 'squash').h1.stats, false);
    assert.ok(racketExtraKeys('squash').includes(LETS_KEY));
    assert.equal(racketExtraKeys('badminton').includes(LETS_KEY), false);
  });
  test('doubles: the button names a side, so both of its players; the career row', () => {
    const t = rallyTotals(run(SQ2.reducer, SQ2.init({}), [FS('home'), P('home'), LET('home')]), DOUBLES, 'squash');
    assert.deepEqual([t.h1.stats.letsAsked, t.h2.stats.letsAsked, t.a1.stats.letsAsked], [1, 1, 0]);
    const sch = STAT_SCHEMAS.squash as never;
    const rows = careerSections(sch, [line('squash', { letsAsked: 3, strokesWon: 1 }), line('squash', { letsAsked: 2 }, 'm2'), line('squash', { points: 9 }, 'm3')])
      .find((x) => x.id === 'shots')!.rows;
    const lets = rows.find((r) => r.key === 'letsAsked')!;
    assert.deepEqual([lets.label, lets.value, lets.coverage], ['Lets asked', '5', { tracked: 2, total: 3 }]);
  });
});

// ------------------------------------------- 7 · pickleball kitchen arrival --

/** Pickleball singles, rally scoring, home serves first (the rally winner serves):
 *  1 home wins · home at the kitchen line   (home serving)
 *  2 away wins · nobody got there           (home serving)
 *  3 away wins · both                       (away serving)
 *  4 home wins · not described              (away serving) */
const KITCHEN: ScoreAction[] = [
  FS('home'), TRACK({ netDetail: true }),
  P('home'), D({ atNet: 'home' }), P('away'), D({ atNet: 'none' }), P('away'), D({ atNet: 'both' }), P('home'),
];

describe('round 2 · 7 — pickleball "Nobody" on the kitchen line → kitchen arrival %', () => {
  test('the mark: pickleball only; toggles; nobody is at the kitchen', () => {
    assert.equal(applyPointDetail(ev(), { atNet: 'none' }, 'pickleball')![0].atNet, 'none');
    assert.equal(applyPointDetail(ev(), { atNet: 'none' }, 'padel'), null);
    assert.equal(applyPointDetail(ev(), { atNet: 'none' }), null); // tennis
    assert.deepEqual([toggleNobody(undefined), toggleNobody('none'), toggleNobody('home')], ['none', null, 'none']);
    assert.deepEqual([toggleNet('none', 'home'), toggleNet('both', 'home')], ['home', 'away']);
    assert.deepEqual(netSides({ atNet: 'none' }, 'home'), []);
  });
  test('panel: arrival overall / serving / returning, over the marked rallies only', () => {
    const s = run(PB1.reducer, PB1.init({}), KITCHEN);
    assert.ok(arrivalTracked(s));
    const v = racketView('pickleball', s, R1)!;
    assert.deepEqual([v.cov.net, v.cov.arrival], [true, true]);
    const pts = keyStats(v).find((x) => x.id === 'points')!;
    assert.deepEqual(show(pts.rows.slice(0, 4)), [
      'Kitchen-line rallies won: 1/2 (50%) | 1/1 (100%)',
      'Kitchen arrival: 2/3 (67%) | 1/3 (33%)',
      'Kitchen arrival · serving: 1/2 (50%) | 1/1 (100%)',
      'Kitchen arrival · returning: 1/1 (100%) | 0/2 (0%)',
    ]);
  });
  test('careers: arrival keys only once "Nobody" was used; the rates read them', () => {
    const t = rallyTotals(run(PB1.reducer, PB1.init({}), KITCHEN), SINGLES, 'pickleball');
    const pick = (o: Record<string, number>) => ['kitchenPts', 'kitchenWon', ...ARRIVAL_KEYS].map((k) => o[k]);
    assert.deepEqual(pick(t.h1.stats), [2, 1, 3, 1, 2, 1, 1]);
    assert.deepEqual(pick(t.a1.stats), [1, 1, 3, 1, 1, 0, 2]);
    // kitchen marks without any "Nobody": the kitchen-line keys, no arrival (no false 100%)
    const before = run(PB1.reducer, PB1.init({}), [FS('home'), TRACK({ netDetail: true }), P('home'), D({ atNet: 'home' })]);
    assert.equal(racketView('pickleball', before, R1)!.cov.arrival, false);
    const tb = rallyTotals(before, SINGLES, 'pickleball');
    assert.equal(tb.h1.stats.kitchenPts, 1);
    for (const k of ARRIVAL_KEYS) assert.equal(k in tb.h1.stats, false, k);
    assert.ok(!keyStats(racketView('pickleball', before, R1)!).find((x) => x.id === 'points')!.rows.some((r) => r.key.startsWith('arr')));
    const sch = STAT_SCHEMAS.pickleball as never;
    const shots = careerSections(sch, [line('pickleball', t.h1.stats), line('pickleball', tb.h1.stats, 'm2')]).find((x) => x.id === 'shots')!.rows;
    const arr = shots.find((r) => r.key === 'kitchenArrPct')!;
    assert.deepEqual([arr.label, arr.value], ['Kitchen arrival %', '67%']); // over the line that tracked it only
    assert.equal(shots.find((r) => r.key === 'kitchenSrvArrPct')!.value, '50%');
    for (const k of [...ARRIVAL_KEYS, 'kitchenArrPct', 'kitchenSrvArrPct', 'kitchenRcvArrPct']) assert.ok(statDefIn(sch, k), k);
  });
  test('commentary and corrections keep the mark', () => {
    const s = run(PB1.reducer, PB1.init({}), KITCHEN);
    const metas = racketCommentary('pickleball', s, { homeName: 'A', awayName: 'B' })[0].rows.flatMap((r) => (r.kind === 'point' && r.meta ? [r.meta] : []));
    assert.ok(metas.some((m) => m.includes('Nobody at the kitchen line')), metas.join(' / '));
    const e = PB1.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.deepEqual(e.events.filter((x) => x.kind === 'point').map((x) => x.atNet ?? '-'), ['home', 'none', 'both', '-']);
    assert.deepEqual(racketCareerKeys(racketView('pickleball', e, R1), 'home'), racketCareerKeys(racketView('pickleball', s, R1), 'home'));
  });
});
