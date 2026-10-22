/**
 * Deep wave — weightlifting at IWF depth: the coach's weight changes (counted,
 * IWF two per attempt — asked, never refused), jury reversals, the referees'
 * decision text (3-0 / 2-1), the results commentary (attempt by attempt, lead
 * changes, totals, no total, end of the snatch, medals), the session stats,
 * the new stat-line keys (per-lift make rate, openers), the career (per-lift
 * rates, bests per category) and the "Stats to track" rules. Old results (no
 * lights, no jury, no changes, no new keys) read exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  declare, recordLift, changeCount, changeLimitIssue, juryReverse, rankEntries, disciplineOf, liftLines, liftingCareer, liftCounts,
  decisionText, lightsScore, changeText, liftFeed, liftSessionStats, liftStatsLine, winnerLine,
  rulesFor, ruleOf, phaseRules, COMPETITION_RULES, PRECISION_RULES, ordinalOf, placesOf, FeedBuilder,
  type EntryResult, type LiftAttempt, type ResultEntry, type Category,
} from '../src/data/results/index.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema, aggregateValue } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

const WL = disciplineOf('wl.total')!;
const W = true, R = false;
const G = (kg: number, seq: number, extra: Partial<LiftAttempt> = {}): LiftAttempt => ({ kg, good: true, seq, ...extra });
const X = (kg: number, seq: number, extra: Partial<LiftAttempt> = {}): LiftAttempt => ({ kg, good: false, seq, ...extra });
const lifter = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Lifter ${i}`, heat: 1, result: { order: i, ...result } });

/** A finished session: 1 wins 189 (2nd after the snatch), 2 is 2nd on 183, 3 has no total. */
const session = (): ResultEntry[] => [
  lifter(1, { bodyweight: 78.4, lifts: {
    snatch: [G(80, 1, { lights: [W, W, W] }), X(84, 4, { lights: [W, R, R] }), G(84, 6)],
    cj: [G(100, 10), G(105, 12, { chg: [103] }), X(108, 14, { lights: [W, W, R], jury: true })],
  } }),
  lifter(2, { bodyweight: 77.9, lifts: { snatch: [G(82, 2), G(85, 5), X(88, 7)], cj: [G(98, 11), X(101, 13), X(101, 15)] } }),
  lifter(3, { bodyweight: 78.9, lifts: { snatch: [X(75, 3), X(75, 8), { kg: 75, pass: true, good: false, seq: 9 }], cj: [G(90, 16), G(92, 17), X(95, 18)] } }),
];

describe('weight changes (IWF: two per attempt)', () => {
  test('changing the coach\'s declaration keeps the earlier weights; the app\'s automatic one is not a change', () => {
    assert.deepEqual(declare([{ kg: 80 }], 82), [{ kg: 82, chg: [80] }]);
    assert.deepEqual(declare([{ kg: 82, chg: [80] }], 83), [{ kg: 83, chg: [80, 82] }]);
    // the same weight again: nothing changes
    assert.deepEqual(declare([{ kg: 80, chg: [78] }], 80), [{ kg: 80, chg: [78] }]);
    // replacing the automatic +1 kg is the coach's declaration, not a change
    assert.deepEqual(declare([G(80, 1), { kg: 81, auto: true }], 84), [G(80, 1), { kg: 84 }]);
    assert.equal(changeCount({ kg: 83, chg: [80, 82] }), 2);
    assert.equal(changeCount({ kg: 83 }), 0);
  });
  test('the decision keeps the change history', () => {
    const l = recordLift([{ kg: 83, chg: [80, 82] }], { good: true }, 7);
    assert.deepEqual(l[0], { kg: 83, seq: 7, good: true, chg: [80, 82] });
    assert.deepEqual(l[1], { kg: 84, auto: true });
  });
  test('a third change asks (IWF default); "no limit" never asks; the automatic declaration is free', () => {
    const two: LiftAttempt[] = [{ kg: 82, chg: [80, 81] }];
    assert.match(changeLimitIssue(two, 84)!, /change 3 .*80 → 81 → 82 → 84 kg.*two changes \(IWF\)/);
    assert.equal(changeLimitIssue(two, 84, { wlChanges: 0 }), null);
    assert.equal(changeLimitIssue(two, 82), null, 'the same weight is no change');
    assert.equal(changeLimitIssue([{ kg: 82, chg: [80] }], 84), null, 'a second change is allowed');
    assert.equal(changeLimitIssue([G(80, 1), { kg: 81, auto: true }], 85), null);
    assert.equal(changeLimitIssue([], 85), null);
  });
});

describe('jury reversals', () => {
  test('the jury reverses good ↔ no lift; reversing again restores the referees; the automatic next weight follows', () => {
    const l = juryReverse([G(80, 1, { lights: [W, W, R] }), { kg: 81, auto: true }], 0);
    assert.deepEqual(l, [{ kg: 80, good: false, seq: 1, lights: [W, W, R], jury: true }, { kg: 80, auto: true }]);
    assert.deepEqual(juryReverse(l, 0), [{ kg: 80, good: true, seq: 1, lights: [W, W, R] }, { kg: 81, auto: true }]);
    // a weight the coach declared is not touched
    assert.deepEqual(juryReverse([X(80, 1), { kg: 80 }], 0)[1], { kg: 80 });
    // the meet's increase (SD-141) is used for the automatic weight
    assert.deepEqual(juryReverse([X(80, 1), { kg: 80, auto: true }], 0, { wlStep: 2 })[1], { kg: 82, auto: true });
  });
  test('a declined or undecided attempt can\'t be reversed', () => {
    const pass: LiftAttempt[] = [{ kg: 80, pass: true, good: false, seq: 1 }];
    assert.deepEqual(juryReverse(pass, 0), pass);
    assert.deepEqual(juryReverse([{ kg: 80 }], 0), [{ kg: 80 }]);
  });
  test('the ranking reads the final decision', () => {
    const before = [lifter(1, { lifts: { snatch: [G(80, 1)], cj: [G(100, 3)] } }), lifter(2, { lifts: { snatch: [G(78, 2)], cj: [G(101, 4)] } })];
    assert.deepEqual(rankEntries(before, WL).map((r) => `${r.label}:${r.best}`), ['1:180', '2:179']);
    const after = before.map((e) => (e.id === 'e1' ? { ...e, result: { ...e.result, lifts: { ...e.result.lifts, cj: juryReverse(e.result.lifts!.cj, 0) } } } : e));
    assert.deepEqual(rankEntries(after, WL).map((r) => r.id), ['e2', 'e1']);
  });
});

describe('decision text', () => {
  test('lights white–red, the jury, declined', () => {
    assert.equal(lightsScore({ lights: [W, W, W] }), '3-0');
    assert.equal(lightsScore({ lights: [W, R, R] }), '1-2');
    assert.equal(lightsScore({}), null);
    assert.equal(decisionText(G(80, 1, { lights: [W, W, R] })), 'good lift (2-1)');
    assert.equal(decisionText(X(80, 1, { lights: [R, R, R] })), 'no lift (0-3)');
    assert.equal(decisionText(G(80, 1)), 'good lift');
    assert.equal(decisionText(X(80, 1, { lights: [W, W, R], jury: true })), "no lift — jury reversed the referees' 2-1");
    assert.equal(decisionText(G(80, 1, { jury: true })), 'good lift — jury reversed the referees');
    assert.equal(decisionText({ kg: 80, pass: true, good: false }), 'declined');
    assert.equal(decisionText({ kg: 80 }), 'declared');
    assert.equal(changeText({ kg: 88, chg: [87] }), '(changed from 87 kg)');
    assert.equal(changeText({ kg: 88, chg: [86, 87] }), '(changed twice: 86 → 87 → 88 kg)');
    assert.equal(changeText({ kg: 88 }), '');
  });
});

describe('the commentary', () => {
  test('attempt by attempt in competition order, newest first: leads, totals, no total, end of the snatch, medals', () => {
    const feed = liftFeed(session());
    const lines = feed.map((f) => `${f.tag ? `${f.tag} · ` : ''}${f.text}`).reverse();
    assert.deepEqual(lines.slice(0, 4), [
      'Sn 1 · Lifter 1 80 kg — good lift (3-0)',
      'Lifter 1 leads the snatch — 80 kg',
      'Sn 1 · Lifter 2 82 kg — good lift',
      'Lifter 2 leads the snatch — 82 kg',
    ]);
    assert.ok(lines.includes('Sn 2 · Lifter 1 84 kg — no lift (1-2)'));
    // equal weight later does not take the lead (IWF: who lifted it first) — 84 after 85 never leads
    assert.equal(lines.filter((l) => l.includes('leads the snatch')).length, 2);
    assert.ok(lines.includes('Sn 3 · Lifter 3 75 kg — declined'));
    assert.ok(lines.includes('Lifter 3: no total — no good snatch'));
    assert.ok(lines.includes('Sn · Snatch over — 1. Lifter 2 85 kg · 2. Lifter 1 84 kg'));
    assert.ok(lines.indexOf('Sn · Snatch over — 1. Lifter 2 85 kg · 2. Lifter 1 84 kg') > lines.indexOf('Lifter 3: no total — no good snatch'));
    assert.ok(lines.includes('Lifter 1: total 184 kg (84 + 100)'));
    assert.ok(lines.includes('Lifter 1 leads on total — 184 kg'));
    assert.ok(lines.includes('Lifter 2: total 183 kg (85 + 98)'));
    assert.ok(lines.includes('C&J 2 · Lifter 1 105 kg (changed from 103 kg) — good lift'));
    assert.ok(lines.includes("C&J 3 · Lifter 1 108 kg — no lift — jury reversed the referees' 2-1"));
    // the last line (shown first): the medals
    assert.equal(feed[0].text, '🥇 Lifter 1 189 kg · 🥈 Lifter 2 183 kg');
    assert.equal(feed[0].tone, 'medal');
    const tones = new Map(feed.map((f) => [f.text, f.tone]));
    assert.equal(tones.get('Lifter 1 80 kg — good lift (3-0)'), 'good');
    assert.equal(tones.get('Lifter 1 84 kg — no lift (1-2)'), 'bad');
    assert.equal(tones.get('Lifter 1: total 184 kg (84 + 100)'), 'lead');
  });
  test('a correction rewrites it (derived, never stored)', () => {
    const s = session();
    s[1] = { ...s[1], result: { ...s[1].result, lifts: { ...s[1].result.lifts, snatch: [G(82, 2), X(85, 5), X(88, 7)] } } };
    const lines = liftFeed(s).map((f) => f.text);
    assert.ok(lines.includes('Lifter 1 leads the snatch — 84 kg'));
  });
  test('a session in progress has no medal line; nothing taken → no feed', () => {
    const live = [lifter(1, { lifts: { snatch: [G(80, 1), { kg: 81, auto: true }] } }), lifter(2, { lifts: { snatch: [{ kg: 78 }] } })];
    const feed = liftFeed(live);
    assert.equal(feed.length, 2);
    assert.ok(!feed.some((f) => f.tone === 'medal'));
    assert.deepEqual(liftFeed([lifter(1, { lifts: { snatch: [{ kg: 80 }] } })]), []);
    assert.deepEqual(liftFeed([]), []);
  });
  test('attempts entered on the grid without an attempt number come last, in lift order', () => {
    const feed = liftFeed([lifter(1, { lifts: { snatch: [{ kg: 80, good: true }], cj: [G(100, 1)] } })]);
    const tags = feed.map((f) => f.tag).filter(Boolean).reverse();
    assert.deepEqual(tags.slice(0, 2), ['C&J 1', 'Sn 1']);
  });
});

describe('session stats', () => {
  test('make rate per lift, openers, average jump, referees, jury, changes, no total, the winner', () => {
    const s = liftSessionStats(session());
    assert.equal(s.lifters, 3);
    assert.deepEqual(s.snatch, { attempted: 8, made: 4, declined: 1, openMade: 2, openAttempted: 3, best: { kg: 85, name: 'Lifter 2' }, avgJump: 2 });
    assert.deepEqual(s.cj, { attempted: 9, made: 5, declined: 0, openMade: 3, openAttempted: 3, best: { kg: 105, name: 'Lifter 1' }, avgJump: 2.7 });
    assert.deepEqual(s.lights, { recorded: 3, unanimous: 1, split: 2 });
    assert.equal(s.jury, 1);
    assert.deepEqual(s.changes, { total: 1, attempts: 1 });
    assert.deepEqual(s.noTotal, [{ name: 'Lifter 3', lift: 'snatch' }]);
    assert.deepEqual(s.winner, { name: 'Lifter 1', total: 189, margin: 6, snatchPlace: 2 });
    assert.equal(winnerLine(s.winner!, true), 'Lifter 1 wins with 189 kg — by 6 kg; 2nd after the snatch');
    assert.equal(liftStatsLine(s.snatch), '4/8 good (50%) · openers 2/3 · best Lifter 2 85 kg · average jump +2 kg · 1 declined');
  });
  test('old results (no lights, jury or changes): no line about them — never a false 0', () => {
    const s = liftSessionStats([lifter(1, { lifts: { snatch: [G(80, 1)], cj: [G(100, 2)] } })]);
    assert.equal(s.lights, undefined); assert.equal(s.jury, undefined); assert.equal(s.changes, undefined);
    assert.equal(s.winner?.margin, undefined);
  });
  test('equal totals: the one who lifted it first, said so', () => {
    const s = liftSessionStats([
      lifter(1, { lifts: { snatch: [G(80, 1)], cj: [G(100, 3)] } }),
      lifter(2, { lifts: { snatch: [G(80, 2)], cj: [G(100, 4)] } }),
    ]);
    assert.equal(s.winner!.name, 'Lifter 1');
    assert.equal(s.winner!.liftedFirst, true);
    assert.equal(winnerLine(s.winner!, false), 'Lifter 1 leads with 180 kg — level on total, lifted it first');
  });
});

describe('stat lines and career', () => {
  test('per-lift make rate and openers (free — from the attempts); declined attempts are not attempts', () => {
    const lines = liftLines({ category: { age: 'Senior', gender: 'M', weightClass: '79 kg' } }, session());
    const by = (p: string) => lines.find((l) => l.playerId === p)!.stats;
    assert.deepEqual([by('p1').snMade, by('p1').snAtt, by('p1').cjMade, by('p1').cjAtt, by('p1').o1Made, by('p1').o1Att], [2, 3, 2, 3, 2, 2]);
    assert.deepEqual([by('p3').snMade, by('p3').snAtt, by('p3').cjMade, by('p3').cjAtt, by('p3').o1Made, by('p3').o1Att], [0, 2, 2, 3, 1, 2]);
    assert.deepEqual(liftCounts(undefined), { snatch: { made: 0, attempted: 0 }, cj: { made: 0, attempted: 0 }, open: { made: 0, attempted: 0 } });
    // a lifter with no snatch attempt gets no snatch pair (not 0 of 0)
    const only = liftLines({}, [lifter(1, { lifts: { cj: [G(100, 1)] } })])[0].stats;
    assert.equal(only.snAtt, undefined); assert.equal(only.cjAtt, 1);
  });
  test('career: per-lift rates only from sessions that recorded them; bests per category', () => {
    const M79: Category = { age: 'Senior', gender: 'M', weightClass: '79 kg' }, M88: Category = { age: 'Senior', gender: 'M', weightClass: '88 kg' };
    const lines = [
      // an old line (before the deep wave): no per-lift keys
      { eventId: 'a', date: '2025-05-01', stats: { comps: 1, m_wl_snatch: 80, m_wl_cj: 100, m_wl_total: 180, made: 4, attempted: 6 } },
      { eventId: 'b', date: '2026-03-01', stats: { comps: 1, m_wl_snatch: 84, m_wl_cj: 105, m_wl_total: 189, made: 4, attempted: 6, snMade: 2, snAtt: 3, cjMade: 2, cjAtt: 3, o1Made: 2, o1Att: 2 } },
      { eventId: 'c', date: '2026-09-01', stats: { comps: 1, m_wl_snatch: 90, m_wl_cj: 110, m_wl_total: 200, made: 5, attempted: 6, snMade: 3, snAtt: 3, cjMade: 2, cjAtt: 3, o1Made: 1, o1Att: 2 } },
    ];
    const infos = new Map([
      ['a', { title: 'A', date: '2025-05-01', category: M79 }],
      ['b', { title: 'B', date: '2026-03-01', category: M79 }],
      ['c', { title: 'C', date: '2026-09-01', category: M88 }],
    ]);
    const c = liftingCareer(lines, infos, '2026-01-01');
    assert.deepEqual(c.perLift.snatch, { made: 5, attempted: 6, rate: 83.3 });
    assert.deepEqual(c.perLift.cj, { made: 4, attempted: 6, rate: 66.7 });
    assert.deepEqual(c.perLift.open, { made: 3, attempted: 4, rate: 75 });
    assert.equal(c.makeRate, 72.2); // unchanged: every line
    assert.deepEqual(c.byCategory.map((k) => [k.category, k.snatch?.value, k.cj?.value, k.total?.value]), [
      ['Senior Men 88 kg', 90, 110, 200],
      ['Senior Men 79 kg', 84, 105, 189],
    ]);
    // only old lines: no per-lift rate (null — "not recorded", never 0%)
    const old = liftingCareer([lines[0]], infos, '2026-01-01');
    assert.deepEqual(old.perLift, { snatch: null, cj: null, open: null });
  });
  test('the schema: per-lift rates aggregate only over lines that carry them', () => {
    const schema = STAT_SCHEMAS.weightlifting;
    assert.deepEqual(validateSchema(schema), []);
    const def = schema.stats.find((s) => s.key === 'snRate')!;
    const mk = (stats: Record<string, number>): StatLine => ({ id: Math.random().toString(), playerId: 'p', sport: 'weightlifting', stats } as unknown as StatLine);
    assert.equal(aggregateValue(schema, def, [mk({ made: 4, attempted: 6 })]).tracked, false);
    const v = aggregateValue(schema, def, [mk({ made: 4, attempted: 6 }), mk({ snMade: 2, snAtt: 3 })]);
    assert.equal(v.text, '67%');
  });
});

describe('competition rules: stats to track (off by default) and the change limit (IWF default)', () => {
  test('the weightlifting rules are listed with their standard defaults', () => {
    const keys = rulesFor('weightlifting').map((r) => r.key);
    for (const k of ['wlChanges', 'wlLights', 'wlJury']) assert.ok(keys.includes(k), k);
    assert.equal(ruleOf(undefined, 'wlChanges'), 2);
    assert.equal(ruleOf(undefined, 'wlLights'), false);
    assert.equal(ruleOf(undefined, 'wlJury'), false);
    assert.deepEqual(phaseRules('weightlifting', { wlJury: true, wlLights: false }), { wlJury: true });
    assert.ok(PRECISION_RULES.every((r) => COMPETITION_RULES.includes(r)));
    assert.ok(PRECISION_RULES.filter((r) => r.group === 'Stats to track').every((r) => r.default === false), 'every capture switch is off by default');
  });
});

describe('the feed helpers', () => {
  test('ordinals, shared places, newest first', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinalOf), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
    assert.deepEqual(placesOf([10, 9, 9, 8], (a, b) => a === b), [{ place: 1, tie: false }, { place: 2, tie: true }, { place: 2, tie: true }, { place: 4, tie: false }]);
    const fb = new FeedBuilder();
    fb.push('a'); fb.push('b', { tone: 'good', tag: 'T' });
    assert.deepEqual(fb.newestFirst(), [{ key: 'f1', text: 'b', tone: 'good', tag: 'T' }, { key: 'f0', text: 'a' }]);
    assert.equal(fb.length, 2);
  });
});
