/**
 * Deep wave — timed races: the live results commentary (raceCommentary.ts).
 * Lines per heat / round / trial / bar height, newest first, derived from the
 * stored results every time (a correction rewrites its line; an old event
 * reads exactly what it holds), for athletics (track, field, road / XC,
 * combined events), swimming, rowing / canoe and cycling — never for the
 * other event sports.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventCommentary, meetCommentary, compareItems, groupMeet, repechagePlan, presetOf, combinedKey,
  type CommentaryItem, type MeetEvent, type MeetPhase, type PhaseFormat, type ResultEntry, type EntryResult, type ResultFlag,
} from '../src/data/results/index.ts';

const U14G = { age: 'U14', gender: 'F' as const };
const run = (id: string, name: string, result: EntryResult, heat = 1, athleteId = `p_${name}`): ResultEntry => ({ id, athleteId, name, heat, result });
const phase = (id: string, format: PhaseFormat, entries: ResultEntry[], status: MeetPhase['status'] = 'completed', date = '2026-10-20T09:00:00Z'): MeetPhase => ({ id, format, status, date, entries });
const one = (phases: MeetPhase[]): MeetEvent => groupMeet(phases)[0];
const texts = (items: CommentaryItem[]) => items.map((i) => i.text);

/* --------------------------- a sprint: heats → final --------------------------- */

const plan = [{ phase: 'heat' as const, heats: 2, progression: { byPlace: 3, byMark: 2 } }, { phase: 'final' as const, heats: 1 }];
const fHeat: PhaseFormat = { discipline: 'ath.100m', category: U14G, phase: 'heat', phaseNo: 1, heats: 2, progression: plan[0].progression, eventKey: 'g100', plan, eventTitle: '100 m U14 Girls' };
const fFinal: PhaseFormat = { ...fHeat, phase: 'final', phaseNo: 2, heats: 1, progression: undefined };
const heats = () => phase('ph1', fHeat, [
  run('h0', 'Priya Sharma', { lane: 4, mark: 12.48, wind: 0.8 }), run('h1', 'Asha Rao', { lane: 5, mark: 12.61, wind: 0.8 }),
  run('h2', 'Meena K', { lane: 3, mark: 12.9, wind: 0.8 }), run('h3', 'Riya D', { lane: 6, status: 'DQ', ruleRef: 'TR 17.3', reason: 'Lane infringement' }),
  run('h4', 'Tara S', { lane: 4, mark: 12.7, wind: -0.2 }, 2), run('h5', 'Uma P', { lane: 5, mark: 12.75, wind: -0.2 }, 2),
  run('h6', 'Vani L', { lane: 3, mark: 12.8, wind: -0.2 }, 2), run('h7', 'Zoya M', { lane: 6, mark: 13.2, wind: -0.2 }, 2),
]);
const final = (extra: Partial<PhaseFormat> = {}, status: MeetPhase['status'] = 'completed', first = 12.31) => phase('ph2', { ...fFinal, ...extra }, [
  run('f0', 'Priya Sharma', { lane: 4, mark: first, wind: 1.1 }), run('f1', 'Asha Rao', { lane: 5, mark: 12.55, wind: 1.1 }),
  run('f4', 'Tara S', { lane: 3, mark: 12.6, wind: 1.1 }), run('f5', 'Uma P', { lane: 6, mark: 12.9, wind: 1.1 }),
], status, '2026-10-20T15:00:00Z');

describe('a sprint event: heats, qualifiers, the final, a record', () => {
  test('each heat: the winner, the qualifiers with Q / q, the wind, a DQ with its rule', () => {
    const t = texts(eventCommentary(one([heats()])));
    assert.ok(t.includes('100 m U14 Girls · Heat 1: Priya Sharma wins in 12.48 Q; Asha Rao 12.61 Q; Meena K 12.90 Q (wind +0.8) · Riya D DQ (TR 17.3 Lane infringement)'), t.join('\n'));
    assert.ok(t.includes('100 m U14 Girls · Heat 2: Tara S wins in 12.70 Q; Uma P 12.75 Q; Vani L 12.80 Q; Zoya M 13.20 q (wind −0.2)'), t.join('\n'));
  });
  test('the heats closed: how many went through and the fastest', () => {
    const items = eventCommentary(one([heats()]));
    const round = items.find((i) => i.kind === 'round')!;
    assert.equal(round.text, '100 m U14 Girls — Heats done: 7 through to the final (6 Q, 1 q); fastest: Priya Sharma 12.48');
  });
  test('the final: the race line, the medal line, and a meet record broken against the book before the lock', () => {
    const fin = final({ recordsBefore: [{ scope: 'MR', discipline: 'ath.100m', category: 'U14-F', value: 12.4, holder: 'Old Champ', year: 2019 }] });
    const items = eventCommentary(one([heats(), fin]));
    assert.equal(items[0].kind, 'record'); // newest first: the record, then the medals
    assert.equal(items[0].text, 'New meet record: Priya Sharma 12.31 — 100 m U14 Girls (was 12.40, Old Champ 2019)');
    assert.equal(items[1].text, '100 m U14 Girls final — 🥇 Priya Sharma 12.31 · 🥈 Asha Rao 12.55 · 🥉 Tara S 12.60');
    assert.match(items[2].text, /^100 m U14 Girls · Final: Priya Sharma wins in 12\.31; Asha Rao 12\.55; Tara S 12\.60 \(wind \+1\.1\)$/);
    assert.ok(items.indexOf(items.find((i) => i.phaseId === 'ph1')!) > 2); // the heats are older
  });
  test('no record line when the record stood, when none existed before, or when the time is an unconfirmed out-of-range mark', () => {
    const stood = final({ recordsBefore: [{ scope: 'MR', discipline: 'ath.100m', category: 'U14-F', value: 12.2, holder: 'X' }] });
    assert.ok(!eventCommentary(one([stood])).some((i) => i.kind === 'record'));
    assert.ok(!eventCommentary(one([final()])).some((i) => i.kind === 'record'));
    const silly = final({ recordsBefore: [{ scope: 'MR', discipline: 'ath.100m', category: 'U14-F', value: 12.4, holder: 'X' }] }, 'completed', 5.12);
    assert.ok(!eventCommentary(one([silly])).some((i) => i.kind === 'record'));
  });
  test('a heat still being entered reads "so far"; nothing entered → no line', () => {
    const live = phase('ph1', fHeat, [run('a', 'Priya Sharma', { mark: 12.48 }), run('b', 'Asha Rao', {})], 'live');
    const items = eventCommentary(one([live]));
    assert.equal(items.length, 1);
    assert.ok(items[0].provisional);
    assert.equal(items[0].text, '100 m U14 Girls · Heat 1 (so far): Priya Sharma wins in 12.48 Q');
    assert.deepEqual(eventCommentary(one([phase('ph1', fHeat, [run('a', 'A', {})], 'scheduled')])), []);
  });
  test('a correction rewrites the line (nothing is stored)', () => {
    const before = eventCommentary(one([final(undefined, 'live')]))[0].text;
    const after = eventCommentary(one([final(undefined, 'live', 12.6)]))[0].text;
    assert.match(before, /Priya Sharma wins in 12\.31/);
    assert.match(after, /Asha Rao wins in 12\.55/);
  });
  test('PB / MR flags the screen worked out are added to the line', () => {
    const flags = new Map([['ph2', new Map<string, ResultFlag[]>([['f0', ['MR']], ['f1', ['PB']]])]]);
    const items = eventCommentary(one([final(undefined, 'live')]), { flags });
    assert.match(items[0].text, /Priya Sharma wins in 12\.31 MR; Asha Rao 12\.55 PB/);
  });
  test('a dead heat for the win', () => {
    const dh = phase('p', { ...fFinal }, [run('a', 'A', { mark: 12.31 }), run('b', 'B', { mark: 12.31 }), run('c', 'C', { mark: 12.5 })], 'live');
    assert.match(eventCommentary(one([dh]))[0].text, /A and B dead-heat in 12\.31; C 12\.50/);
  });
  test('a timed final: each heat\'s fastest, places across heats', () => {
    const tf = phase('p', { ...fFinal, heats: 2 }, [run('a', 'A', { mark: 12.5 }), run('b', 'B', { mark: 12.3 }, 2)], 'live');
    const t = texts(eventCommentary(one([tf])));
    assert.ok(t.includes('100 m U14 Girls · Final, heat 1: A fastest in 12.50'), t.join('\n'));
    assert.ok(t.includes('100 m U14 Girls · Final, heat 2: B fastest in 12.30'), t.join('\n'));
  });
});

/* ------------------------------ splits story ------------------------------ */

describe('lap times: the winner\'s race (only when recorded)', () => {
  const f: PhaseFormat = { discipline: 'ath.1500m', category: U14G, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'g1500', eventTitle: '1500 m U14 Girls' };
  test('came from behind at the last split', () => {
    const p = phase('p', f, [run('a', 'Asha', { order: 1, mark: 290.5, splits: [55, 125, 200] }), run('b', 'Bina', { order: 2, mark: 292.1, splits: [54, 124, 199] })], 'live');
    assert.equal(eventCommentary(one([p]))[0].text, '1500 m U14 Girls · Final: Asha wins in 4:50.50 — came from 2nd at 1100 m; Bina 4:52.10');
  });
  test('an old result with no splits reads as before (no story)', () => {
    const p = phase('p', f, [run('a', 'Asha', { mark: 290.5 }), run('b', 'Bina', { mark: 292.1 })], 'live');
    assert.equal(eventCommentary(one([p]))[0].text, '1500 m U14 Girls · Final: Asha wins in 4:50.50; Bina 4:52.10');
  });
});

/* ------------------------------ field events ------------------------------ */

describe('field events: each trial, lead changes; bar heights', () => {
  test('long jump: leads / takes the lead / extends / moves up / fouls / passes, in competition order', () => {
    const f: PhaseFormat = { discipline: 'ath.lj', category: U14G, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'glj', eventTitle: 'Long jump U14 Girls' };
    const p = phase('p', f, [
      run('x', 'Xena', { order: 1, attempts: [{ mark: 4.8, wind: 0.5 }, { foul: true }, { mark: 5.1, wind: 1.2 }] }),
      run('y', 'Yami', { order: 2, attempts: [{ mark: 4.95, wind: 0.3 }, { mark: 5.0, wind: 0.1 }, { pass: true }] }),
      run('z', 'Zara', { order: 3, attempts: [{ mark: 4.5 }, { mark: 4.9 }] }),
    ], 'live');
    const t = texts(eventCommentary(one([p])).reverse());
    assert.deepEqual(t, [
      'Long jump U14 Girls · round 1: Xena 4.80 (+0.5) — leads',
      'Long jump U14 Girls · round 1: Yami 4.95 (+0.3) — takes the lead',
      'Long jump U14 Girls · round 1: Zara 4.50 — moves to 3rd',
      'Long jump U14 Girls · round 2: Xena fouls (X)',
      'Long jump U14 Girls · round 2: Yami 5.00 (+0.1) — extends the lead',
      'Long jump U14 Girls · round 2: Zara 4.90 — moves to 2nd',
      'Long jump U14 Girls · round 3: Xena 5.10 (+1.2) — takes the lead',
      'Long jump U14 Girls · round 3: Yami passes',
    ]);
  });
  test('high jump: clears at the nth attempt, passes, three failures → out, the jump-off', () => {
    const f: PhaseFormat = { discipline: 'ath.hj', category: U14G, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'ghj', eventTitle: 'High jump U14 Girls', bar: [1.3, 1.35, 1.4],
      jumpOff: { athletes: ['r', 't'], rounds: [{ height: 1.4, tries: { r: 'X', t: 'O' } }] } };
    const p = phase('p', f, [
      run('r', 'Ravi', { order: 1, heights: [{ height: 1.3, tries: 'O' }, { height: 1.35, tries: 'XO' }, { height: 1.4, tries: 'XXX' }] }),
      run('s', 'Sam', { order: 2, heights: [{ height: 1.3, tries: '-' }, { height: 1.35, tries: 'XX-' }, { height: 1.4, tries: 'X' }] }),
      run('t', 'Tia', { order: 3, heights: [{ height: 1.3, tries: 'XXO' }] }),
    ], 'live');
    const t = texts(eventCommentary(one([p])).reverse());
    assert.deepEqual(t, [
      'High jump U14 Girls: Ravi clears 1.30 at the first attempt (O)',
      'High jump U14 Girls: Sam passes 1.30',
      'High jump U14 Girls: Tia clears 1.30 at the third attempt (XXO)',
      'High jump U14 Girls: Ravi clears 1.35 at the second attempt (XO)',
      'High jump U14 Girls: Sam misses twice at 1.35, passes to the next height (XX-)',
      'High jump U14 Girls: Ravi fails three times at 1.40 (XXX) — out, best 1.35',
      'High jump U14 Girls: Sam fails at 1.40 (X) — out, no height cleared',
      'High jump U14 Girls — jump-off at 1.40: Ravi fails, Tia clears',
    ]);
  });
});

/* ---------------------- road / XC, crews, cycling, combined ---------------------- */

describe('road and cross-country, regattas, cycling, combined events', () => {
  test('a road race: the first three on the line and the team score', () => {
    const f: PhaseFormat = { discipline: 'ath.road.5000', category: U14G, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'r5', eventTitle: '5 km road U14 Girls',
      road: { kind: 'road', team: { scorers: 2, size: 3, basis: 'overall' } } as PhaseFormat['road'] };
    const team = (n: string) => ({ id: n, name: `${n} House` });
    const p = phase('p', f, [
      { ...run('a', 'Asha', { fin: 1, mark: 1100 }), team: team('Red') }, { ...run('b', 'Bina', { fin: 2, mark: 1110 }), team: team('Blue') },
      { ...run('c', 'Chitra', { fin: 3 }), team: team('Red') }, { ...run('d', 'Divya', { fin: 4 }), team: team('Blue') },
    ]);
    const t = texts(eventCommentary(one([p])));
    assert.ok(t.includes('5 km road U14 Girls · Final: 1st Asha (18:20) · 2nd Bina (18:30) · 3rd Chitra · 4 finished'), t.join('\n'));
    assert.ok(t.includes('5 km road U14 Girls — teams: 1st Red House (4 pts) · 2nd Blue House (6 pts)'), t.join('\n'));
  });
  test('a rowing heat routes crews ("→ Final A"); the heats closed count each route', () => {
    const rp = repechagePlan(9, 6);
    const f: PhaseFormat = { discipline: 'row.1x.2000', category: { age: 'Open', gender: 'M' }, phase: 'heat', phaseNo: 1, heats: 2, eventKey: 'x1', plan: rp, progression: rp[0].progression, eventTitle: 'Men’s 1x 2000 m' };
    const p = phase('p', f, [run('a', 'Arjun', { mark: 420 }), run('b', 'Bala', { mark: 430 }), run('c', 'Chetan', { mark: 425 }, 2), run('d', 'Dev', { mark: 433 }, 2)]);
    const items = eventCommentary(one([p]));
    assert.ok(texts(items).some((x) => x.startsWith('Men’s 1x 2000 m · Heat 1: Arjun wins in 7:00.00 → Final A')), texts(items).join('\n'));
    assert.match(items.find((i) => i.kind === 'round')!.text, /Heats done: 2 to Final A, 2 to Repechage/);
  });
  test('cycling: a points race by the order on the line', () => {
    const f: PhaseFormat = { discipline: 'cyc.scratch', category: U14G, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'sc', eventTitle: 'Scratch race U14 Girls' };
    const p = phase('p', f, [run('a', 'Asha', { fin: 2 }), run('b', 'Bina', { fin: 1 })], 'live');
    assert.match(eventCommentary(one([p]))[0].text, /^Scratch race U14 Girls · Final: 1st Bina · 2nd Asha$/);
  });
  test('a combined event: points next to each mark, the standings after each locked event', () => {
    const PEN = presetOf('pen')!.events.F!;
    const KEY = combinedKey('pen', 'F', PEN);
    const f = (discipline: string, index: number): PhaseFormat => ({ discipline, phase: 'final', phaseNo: index + 1, heats: 1, eventKey: 'pen', eventTitle: 'Pentathlon U16 Girls', category: { age: 'U16', gender: 'F' }, combined: { key: KEY, table: 'F', events: PEN, index } });
    const p1 = phase('c1', f(PEN[0], 0), [run('a1', 'Asha', { mark: 15.0, wind: 0.5 }, 1, 'ga'), run('b1', 'Bina', { mark: 16.0, wind: 0.5 }, 1, 'gb')], 'completed', '2026-10-20T09:00:00Z');
    const items = eventCommentary(one([p1]));
    const heat = items.find((i) => i.kind === 'heat')!.text;
    assert.match(heat, /^Pentathlon U16 Girls · 1\. 100 m hurdles: Asha wins in 15\.00 \(\d+ pts\); Bina 16\.00 \(\d+ pts\)/);
    assert.match(items.find((i) => i.kind === 'standings')!.text, /^Pentathlon U16 Girls after 1 of 5 \(100 m hurdles\): 1st Asha \d+ pts · 2nd Bina \d+ pts$/);
  });
});

/* ------------------------------ the meet feed ------------------------------ */

describe('the meet feed', () => {
  test('newest first across events; limited; other event sports have no commentary here', () => {
    const early = one([phase('a1', { ...fHeat, eventKey: 'a' }, [run('x', 'X', { mark: 12.5 })], 'live', '2026-10-20T08:00:00Z')]);
    const late = one([phase('b1', { ...fHeat, eventKey: 'b', eventTitle: '200 m U14 Girls', discipline: 'ath.200m' }, [run('y', 'Y', { mark: 25.1 })], 'live', '2026-10-20T10:00:00Z')]);
    const lift = one([phase('w1', { discipline: 'wl.total', phase: 'final', phaseNo: 1, heats: 1, eventKey: 'w' }, [run('z', 'Z', { lifts: { snatch: [{ kg: 50, good: true }] } })], 'live')]);
    const feed = meetCommentary([early, late, lift]);
    assert.deepEqual(feed.map((i) => i.eventKey), ['b', 'a']);
    assert.equal(meetCommentary([early, late], { limit: 1 }).length, 1);
    assert.deepEqual(eventCommentary(lift), []);
    const items = [...feed].reverse();
    assert.deepEqual(items.sort(compareItems).map((i) => i.eventKey), ['b', 'a']);
  });
});
