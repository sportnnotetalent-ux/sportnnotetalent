/**
 * Round 2 (precision-strength) — the founder's answers to the deep wave's open
 * questions, built:
 *  1. weightlifting Robi points next to Sinclair (organiser reference totals,
 *     IWF world records by default) — the sheet and the best-lifter lists;
 *  2. the weightlifting clock (1 min, 2 min for consecutive attempts, 30 s
 *     signals) — a scorer aid, never stored;
 *  3. shooting penalties in finals (2 points off a shot; totals and
 *     eliminations net of it);
 *  4. more ISSF events and the NRAI school classes;
 *  5. archery recurve indoor: single 40 cm face (default) or the triple face;
 *  6. the IWF team classification (28-25-23 …) as its own result, and archery
 *     team-match arrows credited to each archer.
 * Old results read exactly as before: nothing new is written without its source.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, eventAwards, bracketEntrant, bracketState, archMatch, archLines, archeryCareer, archStats, archFeed,
  archRoundOf, faceOf, roundWithFace, roundLine, parseArrow, parseEnd, setMatchEnd, creditEnd, creditsEnd, endInArcherOrder, perArcherOf, creditedArrows, creditText,
  TEAM_SPEC, MIXED_SPEC, INDIVIDUAL_SPEC, arrowDistribution,
  finalState, rankShootFinal, setFinalShot, setFinalPenalty, netFinalShots, finalPenaltyTotal, shootLines, shootStats, shootFeed, shootingCareer,
  shootEventOf, shootTeamOf, stageOf, seriesError, setSeries, defaultShots, defaultFinalists,
  clockAllowance, clockView, clockText, CLOCK_ONE, CLOCK_TWO, CLOCK_WARN,
  robiPoints, robiRef, parseRobiRefs, normClass, ROBI_B, ROBI_WR, sessionBestLifter, bestLifters, liftLines, liftingCareer, sinclairTotal,
  wlTeamClassification, placesText, TEAM_CLASS_POINTS,
  rulesFor, ruleOf, phaseRules, COMPETITION_RULES, PRECISION_RULES,
  type Arrow, type ArchSide, type EntryResult, type ResultEntry, type LiftAttempt, type ShootFinalStats, type ArchBracketStats, type ArchRoundStats, type Category,
} from '../src/data/results/index.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema, aggregateValue } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

const row = (i: number, result: EntryResult = {}, extra: Partial<ResultEntry> = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat: 1, result: { order: i, ...result }, ...extra });
const flat = (v: number, n: number) => Array.from({ length: n }, () => v);
const a3 = (t: string): Arrow[] => t.split(' ').map((x) => parseArrow(x)!);
const mkLine = (sport: string, stats: Record<string, number>): StatLine => ({ id: Math.random().toString(), playerId: 'p', sport, stats } as unknown as StatLine);
const G = (kg: number, seq: number): LiftAttempt => ({ kg, good: true, seq });
const X = (kg: number, seq: number): LiftAttempt => ({ kg, good: false, seq });

/* ------------------------------ 1. Robi points ------------------------------ */

describe('Robi points (IWF best lifter, next to Sinclair)', () => {
  test('the formula: the reference scores 1000, half of it 100; b = log2(10)', () => {
    assert.ok(Math.abs(ROBI_B - 3.3219281) < 1e-6);
    assert.equal(robiPoints(300, 300), 1000);
    assert.equal(robiPoints(150, 300), 100);
    assert.equal(robiPoints(270, 300), Math.round(1000 * 0.9 ** ROBI_B * 100) / 100);
    assert.equal(robiPoints(null, 300), null);
    assert.equal(robiPoints(250, undefined), null);
    assert.equal(robiPoints(0, 300), null);
  });
  test('reference totals: the organiser\'s list ("60: 290, +110 470"), else the IWF senior world record; none → no Robi', () => {
    assert.equal(normClass('60'), '60 kg'); assert.equal(normClass('+110 kg'), '+110 kg'); assert.equal(normClass('110+'), '+110 kg'); assert.equal(normClass('x'), null);
    assert.deepEqual(parseRobiRefs('60: 290, 65 = 312; +110: 470 kg'), { '60 kg': 290, '65 kg': 312, '+110 kg': 470 });
    assert.deepEqual(parseRobiRefs('60 290, 65 300'), { '60 kg': 290, '65 kg': 300 });
    assert.equal(parseRobiRefs(''), null);
    assert.equal(parseRobiRefs('sixty: 290'), null);
    const M60: Category = { age: 'Senior', gender: 'M', weightClass: '60 kg' };
    assert.deepEqual(robiRef(M60), { kg: 307, from: 'iwf' });
    assert.deepEqual(robiRef(M60, { robiRefM: '60: 290' }), { kg: 290, from: 'meet' });
    // the women's list doesn't apply to men; no gender / no reference → none
    assert.equal(robiRef({ gender: 'M', weightClass: '45 kg' }, { robiRefF: '45: 150' }), null);
    assert.equal(robiRef({ gender: 'X', weightClass: '60 kg' }), null);
  });
  test('the IWF defaults: the categories from 1 Aug 2026 and the retired 2025–26 ones the app still offers; senior / junior only', () => {
    for (const k of ['60 kg', '65 kg', '70 kg', '75 kg', '85 kg', '95 kg', '110 kg', '+110 kg', '71 kg', '79 kg', '88 kg', '94 kg']) assert.ok(ROBI_WR.M[k] > 250 && ROBI_WR.M[k] < 520, k);
    for (const k of ['49 kg', '53 kg', '57 kg', '61 kg', '69 kg', '77 kg', '86 kg', '+86 kg', '48 kg', '58 kg', '63 kg']) assert.ok(ROBI_WR.F[k] > 180 && ROBI_WR.F[k] < 360, k);
    // within the current list heavier categories lift more
    for (const list of [['60 kg', '65 kg', '70 kg', '75 kg', '85 kg', '95 kg', '110 kg', '+110 kg'].map((k) => ROBI_WR.M[k]), ['49 kg', '53 kg', '57 kg', '61 kg', '69 kg', '77 kg', '86 kg', '+86 kg'].map((k) => ROBI_WR.F[k])]) {
      for (let i = 1; i < list.length; i++) assert.ok(list[i] > list[i - 1], `${list[i]} > ${list[i - 1]}`);
    }
    assert.deepEqual([ROBI_WR.M['110 kg'], ROBI_WR.F['77 kg']], [428, 278]);
    assert.ok(ROBI_WR.asOf && ROBI_WR.source);
    assert.deepEqual(robiRef({ age: 'Junior', gender: 'F', weightClass: '77 kg' }), { kg: 278, from: 'iwf' });
    // a youth / school category of the same name is not measured against the senior record
    assert.equal(robiRef({ age: 'Youth', gender: 'M', weightClass: '60 kg' }), null);
    assert.equal(robiRef({ age: 'School', gender: 'M', weightClass: '60 kg' }), null);
    assert.deepEqual(robiRef({ age: 'Youth', gender: 'M', weightClass: '60 kg' }, { robiRefM: '60: 260' }), { kg: 260, from: 'meet' });
    // the rules: Robi off by default, references empty (= the IWF defaults), copied onto phases when set
    assert.equal(ruleOf(undefined, 'robi'), false);
    assert.deepEqual(phaseRules('weightlifting', { robi: true, robiRefM: '60: 290' }), { robiRefM: '60: 290' });
  });
  test('a session: Sinclair and Robi per lifter with a total; the stat line writes `robi` only with a reference', () => {
    const cat: Category = { age: 'Senior', gender: 'M', weightClass: '79 kg' };
    const entries = [
      row(1, { bodyweight: 78.5, lifts: { snatch: [G(150, 1)], cj: [G(180, 2)] } }),
      row(2, { bodyweight: 79, lifts: { snatch: [X(150, 3), X(150, 4), X(150, 5)], cj: [G(185, 6)] } }),
    ];
    const rows = sessionBestLifter(entries, { category: cat, rules: { robiRefM: '79: 330' } });
    assert.equal(rows.length, 1, 'no total, no best-lifter row');
    assert.deepEqual([rows[0].total, rows[0].robi, rows[0].ref, rows[0].sinclair], [330, 1000, 330, sinclairTotal(330, 78.5, 'M')]);
    const lines = liftLines({ category: cat, rules: { robiRefM: '79: 330' } }, entries);
    assert.equal(lines.find((l) => l.playerId === 'p1')!.stats.robi, 1000);
    assert.equal(lines.find((l) => l.playerId === 'p2')!.stats.robi, undefined);
    // the default reference (the retired 79 kg record, 365): 330 / 365
    assert.equal(liftLines({ category: cat }, entries).find((l) => l.playerId === 'p1')!.stats.robi, robiPoints(330, 365));
    // a school category with no reference: no Robi key
    const school = liftLines({ category: { age: 'School', gender: 'M', weightClass: '45 kg' } }, entries);
    assert.equal(school.find((l) => l.playerId === 'p1')!.stats.robi, undefined);
  });
  test('the meet\'s best lifters by Robi: across categories, finished sessions only', () => {
    const ev = (cls: string, done: boolean, sn: number, cj: number) => {
      const category: Category = { age: 'Senior', gender: 'M', weightClass: cls };
      return { category, phases: [{ status: done ? 'completed' : 'live', format: { category }, entries: [row(Number(cls.replace(/\D/g, '')), { bodyweight: 70, lifts: { snatch: [G(sn, 1)], cj: [G(cj, 2)] } })] }] };
    };
    const fmt = { robiRefM: '60: 300, 71: 350, 79: 360' };
    const list = bestLifters([ev('60 kg', true, 130, 160), ev('71 kg', true, 150, 190), ev('79 kg', false, 170, 200)], 'robi', fmt);
    assert.deepEqual(list.map((r) => [r.id, r.ref]), [['e71', 350], ['e60', 300]]);
    assert.ok(list[0].robi! > list[1].robi!);
    // the phase's own rules win over the tournament's
    const own = ev('71 kg', true, 150, 190);
    (own.phases[0].format as { rules?: Record<string, string> }).rules = { robiRefM: '71: 340' };
    assert.equal(bestLifters([own], 'robi', fmt)[0].ref, 340);
  });
  test('the career shows the best Robi points like Sinclair (only from sessions that wrote it)', () => {
    const c = liftingCareer([
      { eventId: 'a', date: '2026-01-01', stats: { comps: 1, m_wl_snatch: 80, m_wl_cj: 100, m_wl_total: 180, sinclair: 230.1 } },
      { eventId: 'b', date: '2026-02-01', stats: { comps: 1, m_wl_snatch: 82, m_wl_cj: 101, m_wl_total: 183, sinclair: 233.2, robi: 412.5 } },
    ], new Map(), '2026-01-01');
    assert.deepEqual(c.bests.map((b) => [b.key, b.pb.text]), [['snatch', '82 kg'], ['cj', '101 kg'], ['total', '183 kg'], ['sinclair', '233.20'], ['robi', '412.50']]);
    assert.ok(!c.history[0].flags.some((f) => /robi/i.test(f)));
    const only = liftingCareer([{ eventId: 'a', date: '2026-01-01', stats: { comps: 1, m_wl_total: 180 } }], new Map(), '2026-01-01');
    assert.ok(!only.bests.some((b) => b.key === 'robi'));
  });
  test('the Robi key in the schema validates; the best only from sessions that wrote it', () => {
    const schema = STAT_SCHEMAS.weightlifting;
    assert.deepEqual(validateSchema(schema), []);
    const def = schema.stats.find((x) => x.key === 'robi')!;
    assert.equal(aggregateValue(schema, def, [mkLine('weightlifting', { robi: 410.5 }), mkLine('weightlifting', { robi: 420.25 }), mkLine('weightlifting', { comps: 1 })]).text, '420.25');
  });
});

/* ------------------------------ 2. the lifting clock ------------------------------ */

describe('the lifting clock (a scorer aid, never stored)', () => {
  test('1 minute; 2 minutes when the lifter follows themself in the same lift', () => {
    const entries = [
      row(1, { lifts: { snatch: [G(80, 1), G(82, 3), { kg: 84 }] } }),
      row(2, { lifts: { snatch: [G(80, 2), { kg: 83 }] } }),
    ];
    assert.deepEqual(clockAllowance(entries, { entryId: 'e1', lift: 'snatch' }), { seconds: CLOCK_TWO, consecutive: true });
    assert.deepEqual(clockAllowance(entries, { entryId: 'e2', lift: 'snatch' }), { seconds: CLOCK_ONE, consecutive: false });
    // the first lift of the clean & jerk: nobody has lifted yet in it
    assert.deepEqual(clockAllowance(entries, { entryId: 'e1', lift: 'cj' }), { seconds: CLOCK_ONE, consecutive: false });
    // a declined attempt isn't a lift: the lifter before it decides
    const declined = [row(1, { lifts: { snatch: [G(80, 1), { kg: 82 }] } }), row(2, { lifts: { snatch: [{ kg: 80, pass: true, good: false, seq: 2 }] } })];
    assert.equal(clockAllowance(declined, { entryId: 'e1', lift: 'snatch' }).seconds, CLOCK_TWO);
  });
  test('idle, running, the 30-second signals, time, stopped', () => {
    assert.equal(CLOCK_WARN, 30);
    assert.deepEqual(clockView(60, null, 0), { left: 60, text: '1:00', phase: 'idle', note: '' });
    assert.equal(clockView(60, 0, 10_000).text, '0:50');
    assert.equal(clockView(60, 0, 10_000).phase, 'running');
    assert.equal(clockView(60, 0, 10_400).text, '0:50', 'whole seconds rounded up');
    const w = clockView(60, 0, 31_000);
    assert.deepEqual([w.phase, w.text], ['warn', '0:29']);
    assert.match(w.note, /30 seconds — final call/);
    // a 2-minute clock also signals 30 s after the start (declare the next weight)
    assert.match(clockView(120, 0, 31_000).note, /next weight/);
    assert.equal(clockView(120, 0, 10_000).note, '');
    const o = clockView(60, 0, 61_000);
    assert.deepEqual([o.phase, o.text], ['over', '0:00']);
    assert.match(o.note, /no lift/);
    assert.equal(clockView(120, 0, 30_000).text, '1:30');
    const s = clockView(60, 0, 99_000, 12.3);
    assert.deepEqual([s.phase, s.text], ['stopped', '0:13']);
    assert.equal(clockText(125), '2:05');
  });
  test('the rule: on by default (IWF); the organiser can switch it off', () => {
    assert.equal(ruleOf(undefined, 'wlClock'), 'iwf');
    assert.deepEqual(phaseRules('weightlifting', { wlClock: 'off' }), { wlClock: 'off' });
  });
});

/* ---------------------------- 3. penalties in finals ---------------------------- */

describe('shooting: penalties in finals (ISSF 6.12.6.2 b / 6.17.1.5)', () => {
  const AR = disciplineOf('shoot.10mar')!;
  const ev = shootEventOf('shoot.10mar')!;
  const fin = (i: number, fshots: number[], fpen?: number[]) => row(i, { fshots, qual: { mark: 620 }, ...(fpen ? { fpen } : {}) });
  test('a penalty comes off the shot it was given on; never below 0; cleared without a trace', () => {
    let r: EntryResult = { fshots: [10.5, 10.2, 9.9] };
    r = setFinalPenalty(r, 1, 2);
    assert.deepEqual(r.fpen, [0, 2]);
    assert.deepEqual(netFinalShots(r), [10.5, 8.2, 9.9]);
    assert.equal(finalPenaltyTotal(r), 2);
    assert.deepEqual(netFinalShots({ fshots: [1.5], fpen: [2] }), [0], 'no score below zero');
    assert.deepEqual(netFinalShots({ fshots: [10.1, 9.9] }), [10.1, 9.9], 'no penalty: the shots as fired');
    assert.deepEqual(netFinalShots(setFinalPenalty({ fshots: [10.4] }, 0, 1)), [9.4], 'dry firing in a final: 1 point');
    assert.equal(setFinalPenalty(r, 1, 0).fpen, undefined);
    // a shot not fired yet can't carry one; removing shots takes their penalties off
    assert.deepEqual(setFinalPenalty({ fshots: [10] }, 3, 2), { fshots: [10] });
    assert.deepEqual(setFinalShot(r, 1, null), { fshots: [10.5] });
    assert.deepEqual(setFinalShot(setFinalPenalty(r, 0, 2), 1, null), { fshots: [10.5], fpen: [2] });
  });
  test('eliminations and the final ranking use the net total: a penalty can put a finalist out', () => {
    // a school final of 3: one out after shot 22, gold on shot 24
    const base = [fin(1, flat(10.1, 22)), fin(2, flat(10.2, 22)), fin(3, [...flat(10.1, 21), 10.0])];
    assert.deepEqual(finalState(base, ev).out.map((o) => o.id), ['e3']);
    const pen = [fin(1, flat(10.1, 22), [0, 0, 2]), fin(2, flat(10.2, 22)), fin(3, [...flat(10.1, 21), 10.0])];
    const st = finalState(pen, ev);
    assert.deepEqual(st.out.map((o) => o.id), ['e1'], '222.2 − 2 = 220.2 is now the lowest');
    assert.equal(st.totals.get('e1'), 2202);
    assert.equal(rankShootFinal(pen, AR).find((r) => r.id === 'e1')!.best, 220.2);
    // a finalist's row read on its own (rank.ts) is net too
    assert.equal(rankEntries([fin(9, [10, 10], [2])], AR)[0].best, 18);
  });
  test('stats, commentary and the stat line show the final penalty', () => {
    const rows = [fin(1, flat(10.3, 24), [0, 0, 2]), fin(2, flat(10.1, 24)), fin(3, flat(10.2, 24))];
    const s = shootStats(rows, AR, 60) as ShootFinalStats;
    assert.equal(s.penalties, 2);
    const f1 = s.finalists.find((f) => f.id === 'e1')!;
    assert.deepEqual([f1.pen, f1.total, f1.best, f1.place], [2, 245.2, 10.3, 1]);
    assert.equal(s.finalists.find((f) => f.id === 'e2')!.pen, undefined, 'no penalty, no key');
    assert.equal((shootStats([fin(1, flat(10.1, 24)), fin(2, flat(10.2, 24)), fin(3, flat(10.3, 24))], AR, 60) as ShootFinalStats).penalties, undefined);
    assert.ok(shootFeed(rows, AR, 60).some((it) => /^Penalty — Athlete 1 −2 on shot 3 \(10\.3 counts 8\.3\)$/.test(it.text)));
    const ranked = rankEntries(rows, AR);
    const lines = shootLines({ discipline: 'shoot.10mar' }, ranked, 'final', eventAwards(ranked, {}));
    const l1 = lines.find((l) => l.playerId === 'p1')!.stats;
    assert.deepEqual([l1.fpts, l1.pen, l1.fShots], [245.2, 2, 24]);
    assert.equal(lines.find((l) => l.playerId === 'p2')!.stats.pen, undefined);
    // the career adds a final's penalty to the penalties
    assert.equal(shootingCareer([{ eventId: 'f', date: '2026-10-01', stats: l1 }], new Map(), '2026-01-01').penalties, 2);
  });
  test('the switch: off by default; the same "Penalties" rule covers series and final shots', () => {
    assert.equal(ruleOf(undefined, 'shootPen'), false);
    assert.match(rulesFor('shooting').find((r) => r.key === 'shootPen')!.choices!.find((c) => c.value === true)!.label, /final shot/);
  });
});

/* ------------------------- 4. more ISSF events, NRAI classes ------------------------- */

describe('shooting: 50 m Rifle Prone, 25 m Standard / Centre-Fire Pistol, 50 m Pistol, NRAI peep / open sight', () => {
  test('formats (ISSF Rule Book 2025 edition, 6.11.9; NRAI Match Book 2024)', () => {
    const pr = shootEventOf('shoot.50mpr')!, sp = shootEventOf('shoot.25msp')!, cf = shootEventOf('shoot.25mcf')!, p50 = shootEventOf('shoot.50mp')!;
    const ps = shootEventOf('shoot.10mps')!, os = shootEventOf('shoot.10mos')!;
    assert.deepEqual([pr.scoring, pr.shots, pr.seriesOf, pr.final, pr.gun], ['decimal', 60, 10, undefined, 'rifle']);
    assert.deepEqual([sp.scoring, sp.shots, sp.seriesOf, sp.final], ['integer', 60, 5, undefined]);
    assert.deepEqual([cf.scoring, cf.shots, cf.seriesOf, cf.final], ['integer', 60, 5, undefined]);
    assert.deepEqual([p50.scoring, p50.shots, p50.seriesOf, p50.final], ['integer', 60, 10, undefined]);
    assert.deepEqual([ps.scoring, ps.shots, ps.level, os.shots, os.level, ps.final, os.final], ['integer', 40, 'nrai', 40, 'nrai', undefined, undefined]);
    assert.equal(disciplineOf('shoot.50mpr')!.dp, 1);
    assert.equal(disciplineOf('shoot.25msp')!.tie, 'issf');
    // the ISSF prone maximum: 60 × 10.9 = 654.0 — a series of 10 never tops 109.0
    assert.equal(seriesError(109.0, undefined, 10, 'decimal'), null);
    assert.match(seriesError(109.1, undefined, 10, 'decimal')!, /more than 109\.0/);
    // stages: 4 + 4 + 4 series of 5 (150 s, 20 s, 10 s); precision then rapid fire
    assert.deepEqual(Array.from({ length: 12 }, (_, i) => stageOf(sp, 60, i)), [...flat(0, 4).map(() => '150 s'), ...flat(0, 4).map(() => '20 s'), ...flat(0, 4).map(() => '10 s')]);
    assert.deepEqual([stageOf(cf, 60, 5), stageOf(cf, 60, 6), stageOf(cf, 30, 2), stageOf(cf, 30, 3)], ['Precision', 'Rapid fire', 'Precision', 'Rapid fire']);
    assert.equal(stageOf(pr, 60, 0), undefined);
    // default match lengths: the NRAI 40-shot match for every age; prone 40 for a school
    assert.deepEqual([defaultShots(ps, 'School'), defaultShots(os, 'Youth'), defaultShots(pr, 'School'), defaultShots(sp, 'Senior')], [40, 40, 40, 60]);
    assert.equal(defaultFinalists(pr, 20), 0, 'no final');
    // teams of 3 ride on the new events too
    assert.equal(shootTeamOf('shoot.50mpr.team')!.teamSize, 3);
  });
  test('ranking: integer events count inner tens first', () => {
    const SP = disciplineOf('shoot.25msp')!;
    const ser = (series: number[], xs: number[]): EntryResult => series.reduce<EntryResult>((r, v, i) => setSeries(r, i, 'integer', { total: v, xs: xs[i] }), {});
    const ranked = rankEntries([row(1, ser([48, 47], [1, 1])), row(2, ser([47, 48], [2, 1]))], SP);
    assert.deepEqual(ranked.map((r) => r.id), ['e2', 'e1'], 'equal 95: more inner tens');
    const lines = shootLines({ discipline: 'shoot.25msp', category: { shots: 10 } }, ranked, 'match');
    assert.equal(lines[0].stats.m_sh_25msp_10, 95);
  });
  test('the stat schema has their PB keys and validates', () => {
    const schema = STAT_SCHEMAS.shooting;
    assert.deepEqual(validateSchema(schema), []);
    for (const k of ['m_sh_50mpr', 'm_sh_25msp', 'm_sh_25mcf', 'm_sh_50mp', 'm_sh_10mps', 'm_sh_10mos']) assert.ok(schema.stats.some((s) => s.key === k), k);
  });
});

/* ----------------------------- 5. recurve indoor face ----------------------------- */

describe('archery: recurve indoor — single 40 cm face (default) or the triple face', () => {
  test('the face follows the rule; compound indoor and outdoor rounds are unchanged', () => {
    const r18 = archRoundOf('arch.r18i')!;
    assert.equal(ruleOf(undefined, 'archIndoorFace'), 'full');
    assert.deepEqual(faceOf(r18), { face: '40 cm face', triple: false });
    assert.deepEqual(faceOf(r18, { archIndoorFace: 'triple' }), { face: '40 cm triple face', minRing: 6, triple: true });
    assert.equal(roundWithFace(r18, { archIndoorFace: 'triple' }).minRing, 6);
    assert.equal(roundWithFace(r18).minRing, undefined);
    assert.equal(faceOf(archRoundOf('arch.r18i.team')!, { archIndoorFace: 'triple' }).minRing, 6, 'team events too');
    // compound indoor is always the triple face; outdoor rounds ignore the rule
    assert.equal(faceOf(archRoundOf('arch.c18i')!, { archIndoorFace: 'full' }).minRing, 6);
    assert.equal(faceOf(archRoundOf('arch.r70')!, { archIndoorFace: 'triple' }).minRing, undefined);
    assert.match(roundLine(r18), /40 cm face \(rings 1–10\)$/);
    assert.match(roundLine(r18, { archIndoorFace: 'triple' }), /40 cm triple face \(rings 6–10\)$/);
    assert.equal(roundLine(archRoundOf('arch.r70')!), 'Recurve 70 m · 72 arrows, 12 ends of 6 · 122 cm face');
  });
  test('entry and stats follow the face: a 5 is refused on the triple face; the distribution stops at 6', () => {
    const r18 = archRoundOf('arch.r18i')!;
    assert.ok('arrows' in parseEnd('10 9 5', 3, faceOf(r18).minRing));
    assert.ok('error' in parseEnd('10 9 5', 3, faceOf(r18, { archIndoorFace: 'triple' }).minRing));
    const R18 = { ...disciplineOf('arch.r18i')!, rules: { archIndoorFace: 'triple' } };
    const rows = [row(1, { ends: [a3('X 10 6'), a3('9 9 M')] })];
    assert.deepEqual((archStats(rows, R18) as ArchRoundStats).archers[0].dist.map((d) => d.label), ['X', '10', '9', '8', '7', '6', 'M']);
    assert.ok((archStats(rows, disciplineOf('arch.r18i')!) as ArchRoundStats).archers[0].dist.some((d) => d.label === '≤6'));
    assert.deepEqual(arrowDistribution(['X'], 6).map((d) => d.label).slice(-2), ['6', 'M']);
  });
});

/* --------------------- 6a. IWF team classification (28-25-23 …) --------------------- */

describe('weightlifting: the IWF team classification as its own result (TCRR 6.8)', () => {
  const lifter = (i: number, team: string | null, sn: LiftAttempt[], cj: LiftAttempt[]): ResultEntry =>
    row(i, { lifts: { snatch: sn, cj } }, team ? { team: { id: `t-${team}`, name: team } } : {});
  const session = (cls: string, gender: 'M' | 'F', entries: ResultEntry[], done = true) => {
    const category: Category = { age: 'Senior', gender, weightClass: cls };
    return { category, phases: [{ status: done ? 'completed' : 'live', format: { category }, entries }] };
  };
  test('28-25-23-22 … 1 for 1st … 25th', () => {
    assert.deepEqual(TEAM_CLASS_POINTS.slice(0, 6), [28, 25, 23, 22, 21, 20]);
    assert.equal(TEAM_CLASS_POINTS.length, 25);
    assert.equal(TEAM_CLASS_POINTS[24], 1);
  });
  test('the total: per gender, a team\'s lifters add up; finished sessions only; no team or no total, no points', () => {
    const events = [
      session('60 kg', 'M', [lifter(1, 'Red', [G(100, 1)], [G(130, 2)]), lifter(2, 'Blue', [G(95, 3)], [G(125, 4)]), lifter(3, 'Red', [G(90, 5)], [G(120, 6)]), lifter(4, null, [G(80, 7)], [G(100, 8)])]),
      session('65 kg', 'M', [lifter(5, 'Blue', [G(110, 1)], [G(140, 2)]), lifter(6, 'Red', [X(110, 3), X(110, 4), X(110, 5)], [G(140, 6)])]),
      session('70 kg', 'M', [lifter(7, 'Red', [G(120, 1)], [G(150, 2)])], false),
      session('53 kg', 'F', [lifter(8, 'Red', [G(80, 1)], [G(100, 2)])]),
    ];
    const g = wlTeamClassification(events, { lifts: 'total' });
    assert.equal(g.length, 2);
    assert.deepEqual(g.map((x) => x.sessions), [2, 1]);
    // 60 kg: Red 28 + 23, Blue 25; 65 kg: Blue 28 (Red's lifter has no total → nothing)
    assert.deepEqual(g[0].rows.map((t) => [t.position, t.team, t.points, t.lifters]), [[1, 'Blue', 53, 2], [2, 'Red', 51, 2]]);
    assert.deepEqual(g[1].rows.map((t) => [t.team, t.points]), [['Red', 28]]);
    assert.notEqual(g[0].label, g[1].label);
  });
  test('snatch, C&J and total (IWF events, 6.8.4 / 6.8.6): a lifter with no total still scores the lift they made', () => {
    const events = [session('65 kg', 'M', [lifter(5, 'Blue', [G(110, 1)], [G(140, 2)]), lifter(6, 'Red', [X(110, 3), X(110, 4), X(110, 5)], [G(141, 6)])])];
    // Blue: snatch 28 + C&J 25 + total 28 = 81; Red: C&J 28 only (no snatch → no snatch or total points)
    assert.deepEqual(wlTeamClassification(events, { lifts: 'all' })[0].rows.map((t) => [t.team, t.points]), [['Blue', 81], ['Red', 28]]);
  });
  test('equal points: more 1st places, then 2nd places … (6.8.5); still level → shared', () => {
    const shared = wlTeamClassification([
      session('60 kg', 'M', [lifter(1, 'Red', [G(100, 1)], [G(130, 2)]), lifter(2, 'Blue', [G(95, 3)], [G(125, 4)])]),
      session('65 kg', 'M', [lifter(3, 'Blue', [G(110, 1)], [G(140, 2)]), lifter(4, 'Red', [G(100, 3)], [G(130, 4)])]),
    ])[0].rows;
    // Red 28 + 25, Blue 25 + 28: same points, same places → shared 1st
    assert.deepEqual(shared.map((t) => [t.position, t.tie, t.team, t.points]), [[1, true, 'Blue', 53], [1, true, 'Red', 53]]);
    const broken = wlTeamClassification([
      session('60 kg', 'M', [lifter(1, 'A', [G(100, 1)], [G(130, 2)]), lifter(2, 'B', [G(95, 3)], [G(125, 4)]), lifter(3, 'B', [G(94, 5)], [G(124, 6)])]),
      session('65 kg', 'M', [lifter(4, 'A', [G(110, 1)], [G(140, 2)]), lifter(5, 'C', [G(100, 3)], [G(130, 4)]), lifter(6, 'C', [G(99, 5)], [G(129, 6)]), lifter(7, 'B', [G(90, 7)], [G(120, 8)])]),
      session('71 kg', 'M', [lifter(8, 'C', [G(110, 1)], [G(140, 2)]), lifter(9, 'D', [G(100, 3)], [G(130, 4)])]),
    ])[0].rows;
    // A 28 + 28 = 56; B 25 + 23 + 22 = 70; C 25 + 23 + 28 = 76; D 25 — no ties
    assert.deepEqual(broken.map((t) => [t.team, t.points]), [['C', 76], ['B', 70], ['A', 56], ['D', 25]]);
    // a tie broken by more 1st places: X 28 + 22 = 50 v Y 25 + 25 = 50
    const tb = wlTeamClassification([
      session('60 kg', 'M', [lifter(1, 'X', [G(100, 1)], [G(130, 2)]), lifter(2, 'Y', [G(95, 3)], [G(125, 4)])]),
      session('65 kg', 'M', [lifter(3, 'Z', [G(110, 1)], [G(140, 2)]), lifter(4, 'Y', [G(100, 3)], [G(130, 4)]), lifter(5, 'W', [G(99, 5)], [G(129, 6)]), lifter(6, 'X', [G(98, 7)], [G(128, 8)])]),
    ])[0].rows;
    assert.deepEqual(tb.slice(0, 2).map((t) => [t.position, t.tie, t.team, t.points]), [[1, false, 'X', 50], [2, false, 'Y', 50]]);
    assert.equal(placesText(tb[0].places), '1st ×1, 4th ×1');
    // the 'share' option keeps them level
    const sh = wlTeamClassification([
      session('60 kg', 'M', [lifter(1, 'X', [G(100, 1)], [G(130, 2)]), lifter(2, 'Y', [G(95, 3)], [G(125, 4)])]),
      session('65 kg', 'M', [lifter(3, 'Z', [G(110, 1)], [G(140, 2)]), lifter(4, 'Y', [G(100, 3)], [G(130, 4)]), lifter(5, 'W', [G(99, 5)], [G(129, 6)]), lifter(6, 'X', [G(98, 7)], [G(128, 8)])]),
    ], { tie: 'share' })[0].rows;
    assert.deepEqual(sh.slice(0, 2).map((t) => [t.position, t.tie]), [[1, true], [1, true]]);
  });
  test('the rule: off by default (the house table stays the meet\'s team result); total or all three when on', () => {
    assert.equal(ruleOf(undefined, 'wlTeamClass'), 'off');
    assert.deepEqual(rulesFor('weightlifting').find((r) => r.key === 'wlTeamClass')!.choices!.map((c) => c.value), ['off', 'total', 'all']);
  });
});

/* ------------------ 6b. archery: team-match arrows credited to each archer ------------------ */

describe('archery: arrows credited to each archer in team matches', () => {
  const R70T = disciplineOf('arch.r70.team')!;
  const team = (id: string, members: string[], seed: number, mp: Record<string, ArchSide>): ResultEntry =>
    ({ id, name: `${id} A`, heat: 1, team: { id: `t-${id}`, name: id }, result: { name: `${id} A`, members: members.map((m) => ({ playerId: m, name: `Archer ${m}` })), ...bracketEntrant({ mark: 1900 - seed, tens: 60, xs: 20 }, seed), mp } });
  /** credited ends: member 0's two arrows, then member 1's, then member 2's */
  const credited = (ends: string[]): ArchSide => ends.reduce<ArchSide>((sd, t, k) => setMatchEnd({ mp: { m: sd } }, 'm', k, a3(t), { per: 2 }).mp!.m, {});
  const plain = (ends: string[]): ArchSide => ({ ends: ends.map(a3) });
  test('2 arrows per archer (WA team 6 / mixed 4); an end typed archer by archer keeps who shot what', () => {
    assert.equal(perArcherOf(TEAM_SPEC), 2); assert.equal(perArcherOf(MIXED_SPEC), 2); assert.equal(perArcherOf(INDIVIDUAL_SPEC), 3);
    const c = creditEnd(a3('9 X 10 8 10 9'), 2);
    assert.deepEqual(c, { arrows: a3('X 10 10 9 9 8'), by: [0, 1, 2, 0, 2, 1] });
    assert.ok(creditsEnd(c.arrows, c.by, 3));
    assert.ok(!creditsEnd(c.arrows, [0, 1], 3) && !creditsEnd(c.arrows, [0, 1, 2, 0, 2, 3], 3));
    // each archer's arrows highest first, archer by archer
    assert.deepEqual(endInArcherOrder(c.arrows, c.by, 3), a3('X 9 10 8 10 9'));
    assert.equal(endInArcherOrder(c.arrows, undefined, 3), null);
  });
  test('setMatchEnd: the end is stored as before (highest first); a later uncredited correction drops that end\'s credit', () => {
    let r: EntryResult = {};
    r = setMatchEnd(r, '1', 0, a3('9 X 10 8 10 9'), { per: 2 });
    assert.deepEqual(r.mp!['1'], { ends: [a3('X 10 10 9 9 8')], by: [[0, 1, 2, 0, 2, 1]] });
    r = setMatchEnd(r, '1', 1, a3('10 10 9 9 8 8'), { per: 2 });
    r = setMatchEnd(r, '1', 0, a3('10 10 10 9 9 9'));
    assert.deepEqual(r.mp!['1'].by, [[], [0, 0, 1, 1, 2, 2]]);
    r = setMatchEnd(r, '1', 1, null);
    assert.equal(r.mp!['1'].by, undefined, 'nothing credited is left');
    // an individual end is untouched (no `by`)
    assert.deepEqual(setMatchEnd({}, '1', 0, a3('9 10 X')).mp!['1'], { ends: [a3('X 10 9')] });
  });
  test('a team bracket: only credited ends count, per archer — lines, stats, commentary and the career', () => {
    const win = credited(['X 9 10 10 9 8', '10 10 10 9 9 9', '10 10 10 10 9 9']);
    const lose = plain(['9 9 9 9 9 9', '9 9 9 9 9 9', '9 9 9 9 9 9']);
    const rows = [
      team('Red', ['p1', 'p2', 'p3'], 1, { '1': win, '2': win }),
      team('Blue', ['p4', 'p5', 'p6'], 2, { '1': win, '2': lose }),
      team('Green', ['p7', 'p8', 'p9'], 3, { '1': lose, B: win }),
      team('Gold', ['q1', 'q2', 'q3'], 4, { '1': lose, B: lose }),
    ];
    const st = bracketState(rows, 'sets', archMatch('sets', undefined, 'arch.r70.team'));
    const credit = creditedArrows(st, 'Red', (id, k) => rows.find((e) => e.id === id)?.result.mp?.[k], 3);
    // 2 matches × 3 ends × 2 arrows = 12 each — member 0: X 9 / 10 10 / 10 10, member 1: 10 10 / 10 9 / 10 10, member 2: 9 8 / 9 9 / 9 9
    assert.deepEqual(credit.map((c) => [c.member, c.arrows, c.points, c.tens, c.xs, c.ends]), [[0, 12, 118, 10, 2, 6], [1, 12, 118, 10, 0, 6], [2, 12, 106, 0, 0, 6]]);
    const ranked = rankEntries(rows, R70T);
    const lines = archLines({ discipline: 'arch.r70.team' }, ranked, 'bracket', eventAwards(ranked, {}));
    const p1 = lines.find((l) => l.playerId === 'p1')!.stats;
    assert.deepEqual([p1.tArrows, p1.tPts, p1.tTens, p1.tXs, p1.teamEv, p1.tmW], [12, 118, 10, 2, 1, 2]);
    // Blue's semi-final ends were credited, its final ones weren't: only the credited ones count
    assert.equal(lines.find((l) => l.playerId === 'p4')!.stats.tArrows, 6);
    // Gold never entered archer by archer: no team-arrow keys at all (no false 0)
    assert.equal(lines.find((l) => l.playerId === 'q1')!.stats.tArrows, undefined);
    assert.ok(!('mArrows' in p1), 'a team match is not the archer\'s individual match play');
    const s = archStats(rows, R70T) as ArchBracketStats;
    assert.deepEqual(s.perArcher!.filter((a) => a.teamId === 'Red').map((a) => [a.name, a.arrows, a.avgArrow]), [['Archer p1', 12, 9.83], ['Archer p2', 12, 9.83], ['Archer p3', 12, 8.83]]);
    assert.equal(creditText(rows[0], win, 0), 'Archer X-9 · Archer 10-10 · Archer 9-8');
    assert.ok(archFeed(rows, R70T).some((it) => (it.detail ?? '').startsWith('Archer X-9 · Archer 10-10 · Archer 9-8')));
    const c = archeryCareer([{ eventId: 'f', date: '2026-10-01', stats: p1 }], new Map(), '2026-01-01');
    assert.deepEqual(c.teamArrows, { arrows: 12, points: 118, tens: 10, xs: 2, avgArrow: 9.83 });
    assert.match(c.history[0].text, /own arrows 12, avg 9\.83$/);
    assert.equal(archeryCareer([{ eventId: 'f', date: '2026-10-01', stats: { teamEv: 1, place: 1 } }], new Map(), '2026-01-01').teamArrows, null);
    // without credit the bracket stats carry no per-archer list
    const none = rows.map((e) => ({ ...e, result: { ...e.result, mp: Object.fromEntries(Object.entries(e.result.mp ?? {}).map(([k, v]) => [k, { ends: v.ends }])) } }));
    assert.equal((archStats(none, R70T) as ArchBracketStats).perArcher, undefined);
  });
  test('the switch is a "Stats to track" capture, off by default; the schema averages only credited lines', () => {
    assert.equal(ruleOf(undefined, 'archTeamArrows'), false);
    assert.ok(PRECISION_RULES.filter((r) => r.group === 'Stats to track').every((r) => r.default === false));
    assert.ok(PRECISION_RULES.every((r) => COMPETITION_RULES.includes(r)));
    const schema = STAT_SCHEMAS.archery;
    assert.deepEqual(validateSchema(schema), []);
    const def = schema.stats.find((x) => x.key === 'tAvgArrow')!;
    assert.equal(aggregateValue(schema, def, [mkLine('archery', { teamEv: 1 })]).text, '–');
    assert.equal(aggregateValue(schema, def, [mkLine('archery', { teamEv: 1 }), mkLine('archery', { teamEv: 1, tArrows: 8, tPts: 76 })]).text, '9.50');
  });
});
