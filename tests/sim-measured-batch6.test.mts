/**
 * Measured sports batch 6 — simulation (quality mandate step 6): 700 random
 * competitions, 100 per scenario — precision capture overrides (hostile values
 * mixed in), archery matches with penalties, golf maximum-score rounds,
 * cycling keirin / scratch with relegations, weightlifting re-attempts,
 * athletics start cards / field fouls, and swimming take-overs → DQ.
 * Invariants are checked after every competition.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, phaseLines, groupMeet, eventCommentary, matchOutcome, setMatchPenalty, endSum,
  eventRules, precisionTrackOptions, setPrecisionOverride, startCard, reAttempt, recordLift, liftingOrder, takeoverDq, takeoverEarly,
  type EntryResult, type LiftAttempt, type ResultEntry, type PhaseFormat, type Arrow, type ArchSide, type TrackOverrides,
} from '../src/data/results/index.ts';
import { standardPar72, rankLeaderboard, holeCap, type HoleScore, type MaxScore } from '../src/sports/golf/engine.ts';

let seed = 20261104;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: T[]): T => xs[rnd(xs.length)];
const row = (i: number, result: EntryResult, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result: { order: i, ...result } });
const U = { age: 'U16', gender: 'M' as const };
const HOSTILE: unknown[] = [true, false, 'yes', 1, 0, null, -1, {}, 'true'];

function precision() {
  const def = disciplineOf(pick(['wl.total', 'wl.snatch', 'shoot.10mar', 'arch.r70', 'arch.r70.team', 'arch.r70.mixed', 'ath.100m', 'swim.100free']))!;
  const rules: Record<string, unknown> = {};
  for (const k of ['wlLights', 'wlJury', 'shootPen', 'archTeamArrows', 'wlStep']) if (rnd(3) === 0) rules[k] = pick(HOSTILE.concat([2]));
  const track: Record<string, unknown> = {};
  for (const k of ['wlLights', 'wlJury', 'shootPen', 'archTeamArrows', 'reaction']) if (rnd(2) === 0) track[k] = pick(HOSTILE);
  const r = eventRules(def, { rules: rules as never, track: track as TrackOverrides });
  const offered = new Set(precisionTrackOptions(def).map((o) => o.key as string));
  for (const k of Object.keys(r)) {
    if (k in track && offered.has(k) && typeof track[k] === 'boolean') assert.equal(r[k], track[k], `${def.key} ${k}`);
    else assert.deepEqual(r[k], rules[k], `${def.key} ${k} follows the rule`);
  }
  assert.deepEqual(eventRules(def, { rules: rules as never }), rules, 'no override → the rules as stored');
  // toggling every offered key twice drops back to no override
  let own: TrackOverrides | undefined;
  for (const o of precisionTrackOptions(def)) { own = setPrecisionOverride(own, o.key, true, rules as never); own = setPrecisionOverride(own, o.key, false, rules as never); }
  for (const o of precisionTrackOptions(def)) assert.ok(!own || typeof own[o.key] !== 'boolean' || own[o.key] !== (rules[o.key] === true), 'an override never equals the meet value');
}

const ARROWS: Arrow[] = ['X', 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'M'];
function archeryMatch() {
  const fmt = pick(['sets', 'cumulative'] as const);
  const ends = (n: number) => Array.from({ length: n }, () => [pick(ARROWS), pick(ARROWS), pick(ARROWS)]);
  const n = 1 + rnd(5);
  const ea = ends(n), eb = ends(n);
  const pen = (): unknown[] | undefined => (rnd(2) ? undefined : Array.from({ length: n }, () => pick([0, 0, 1, 2, 3, -1, 1.5, '2', 99, null])));
  const pa = pen(), pb = pen();
  const A: ArchSide = { ends: ea, ...(pa ? { pen: pa as number[] } : {}) }, B: ArchSide = { ends: eb, ...(pb ? { pen: pb as number[] } : {}) };
  const o = matchOutcome(A, B, fmt);
  const plain = matchOutcome({ ends: ea }, { ends: eb }, fmt);
  o.ends.forEach((e, k) => {
    assert.ok(e.a >= 0 && e.a <= endSum(ea[k]), 'net never above the arrows');
    assert.ok(e.b >= 0 && e.b <= endSum(eb[k]));
    assert.equal(e.pa + e.pb, 2);
    const ok = (p: unknown) => typeof p === 'number' && Number.isInteger(p) && p > 0;
    if (!ok(pa?.[k]) && !ok(pb?.[k]) && plain.ends[k]) { assert.equal(e.a, plain.ends[k].a); assert.equal(e.b, plain.ends[k].b); }
  });
  if (o.done && !o.shootOff && fmt === 'sets') assert.ok(o.a >= 6 || o.b >= 6);
  // the setter keeps the arrows as shot and clamps
  let r: EntryResult = { mp: { '1': { ends: ea } } };
  r = setMatchPenalty(r, '1', rnd(n + 1), pick([0, 1, 2, 5, -3]));
  assert.deepEqual(r.mp!['1'].ends, ea);
  for (const p of r.mp!['1'].pen ?? []) assert.ok(Number.isInteger(p) && p >= 0 && p <= 3);
}

function golfMax() {
  const H = standardPar72();
  const cap: MaxScore = pick(['ndb', 'par3', 'par5', 'none']);
  const n = 2 + rnd(8);
  const players = Array.from({ length: n }, (_, i) => {
    const rcv = H.map(() => rnd(2));
    const thru = rnd(4) ? 18 : rnd(18);
    const strokes: HoleScore[] = H.map((h, j) => (j >= thru ? null : rnd(10) === 0 ? 'P' : Math.max(1, h.par + rnd(7) - 2)));
    return { id: `g${i}`, status: 'finished' as const, rounds: [{ card: { strokes }, holes: H, received: rcv }] };
  });
  const net = rnd(2) === 0;
  const board = rankLeaderboard(players, { scoring: 'stroke', net, tieBreak: pick(['countback', 'shared'] as const), cap });
  const rule: MaxScore = cap === 'none' ? 'ndb' : cap;
  for (const p of players) {
    const r = board.find((x) => x.id === p.id)!;
    const rd = p.rounds[0];
    let want = 0;
    H.forEach((h, j) => {
      const s = rd.card.strokes[j];
      if (s == null) return;
      const c = holeCap(h.par, rd.received[j], rule)!;
      want += (s === 'P' ? c : Math.min(s, c)) - h.par - (net ? rd.received[j] : 0);
    });
    assert.equal(r.total, want, 'the capped total');
    assert.notEqual(r.status, 'dnf', 'a pickup never makes a max-score card NR');
    if (rd.card.strokes.some((x) => x != null)) assert.ok(r.position != null);
  }
  const ranked = board.filter((r) => r.position != null);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i].total >= ranked[i - 1].total, 'low wins');
  // without a cap a finished card with a pickup is no return (unchanged)
  const plain = rankLeaderboard(players, { scoring: 'stroke', net, tieBreak: 'shared' });
  for (const p of players) if (p.rounds[0].card.strokes.includes('P')) assert.equal(plain.find((x) => x.id === p.id)!.position, null);
}

function cycling() {
  const def = disciplineOf(pick(['cyc.keirin', 'cyc.scratch', 'cyc.elim']))!;
  const n = 3 + rnd(7);
  const fins = Array.from({ length: n }, (_, i) => i + 1).sort(() => rnd(3) - 1);
  const es = fins.map((fin, i) => row(i + 1, {
    fin, ...(def.key === 'cyc.scratch' && rnd(4) === 0 ? { laps: pick([1, -1]) } : {}),
    ...(rnd(4) === 0 ? { relegated: pick([true, true, 'yes', 1] as never[]) } : {}),
    ...(rnd(10) === 0 ? { status: pick(['DNF', 'DQ'] as const), fin: undefined } : {}),
  }));
  const r = rankEntries(es, def);
  const rel = (e: ResultEntry) => def.key !== 'cyc.elim' && e.result.relegated === true;
  const placed = r.filter((x) => x.position != null);
  const firstRel = placed.findIndex((x) => rel(x.entry));
  if (firstRel >= 0) assert.ok(placed.slice(firstRel).every((x) => rel(x.entry)), 'relegated riders after every other finisher');
  const relOrder = placed.filter((x) => rel(x.entry)).map((x) => x.entry.result.fin!);
  assert.deepEqual(relOrder, [...relOrder].sort((a, b) => a - b), 'relegated keep their line order');
  // the others rank as if nobody had been relegated
  const clean = rankEntries(es.filter((e) => !rel(e)).map((e) => ({ ...e, result: { ...e.result, relegated: undefined } })), def).filter((x) => x.position != null).map((x) => x.id);
  assert.deepEqual(placed.filter((x) => !rel(x.entry)).map((x) => x.id), clean);
  assert.ok(r.filter((x) => x.status !== 'ok').every((x) => x.position == null));
}

function lifting() {
  const n = 2 + rnd(5);
  let seq = 0;
  let es: ResultEntry[] = Array.from({ length: n }, (_, i) => row(i + 1, { lifts: { snatch: [{ kg: 60 + rnd(30) }] } }));
  for (let step = 0; step < 18; step++) {
    const call = liftingOrder(es, 'snatch')[0];
    if (!call) break;
    es = es.map((e) => {
      if (e.id !== call.entryId) return e;
      let list = recordLift(e.result.lifts?.snatch, { good: rnd(3) > 0 }, ++seq);
      if (rnd(5) === 0) {
        const i = rnd(list.length);
        const before = list.filter((a) => a.good !== undefined || a.pass).length;
        const next = reAttempt(list, i);
        const after = next.filter((a) => a.good !== undefined || a.pass).length;
        assert.ok(after === before || after === before - 1, 'a re-attempt sets aside at most one decision');
        assert.ok(next.length <= 3);
        list = next;
      }
      return { ...e, result: { ...e.result, lifts: { snatch: list } } };
    });
  }
  for (const e of es) {
    const l = e.result.lifts?.snatch ?? [];
    assert.ok(l.length <= 3);
    assert.ok(l.every((a) => Number.isInteger(a.kg) && a.kg > 0));
  }
}

function athletics() {
  const M = disciplineOf('ath.100m')!, LJ = disciplineOf('ath.lj')!;
  const f: PhaseFormat = { discipline: 'ath.100m', category: U, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'a', eventTitle: '100 m' };
  const n = 3 + rnd(6);
  const es = Array.from({ length: n }, (_, i) => {
    let r: EntryResult = { lane: i + 1, mark: 11 + rnd(200) / 100 };
    const cards = rnd(4);
    for (let c = 0; c < Math.min(cards, 2); c++) r = startCard(r).next;
    if (rnd(8) === 0) r = { ...r, scWarn: pick(HOSTILE) as never };
    return row(i + 1, r);
  });
  const ranked = rankEntries(es, M);
  for (const x of ranked) {
    if (x.entry.result.status === 'DQ') { assert.equal(x.position, null); assert.equal(x.entry.result.ruleRef, 'TR 16.5'); }
  }
  const lines = phaseLines(f, ranked);
  for (const l of lines) assert.equal(l.stats.fs, undefined, 'a start card is never a false start');
  const text = eventCommentary(groupMeet([{ id: 'x', format: f, status: 'live', date: '2026-11-03T09:00:00Z', entries: es }])[0]).map((i) => i.text).join('\n');
  const warned = es.filter((e) => e.result.scWarn === true && e.result.status !== 'DQ').length;
  assert.equal((text.match(/yellow card for start conduct/g) ?? []).length, warned);
  // field fouls
  const lf: PhaseFormat = { discipline: 'ath.lj', category: U, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'lj' };
  const fes = Array.from({ length: n }, (_, i) => row(i + 1, { attempts: Array.from({ length: rnd(7) }, () => (rnd(3) === 0 ? { foul: true } : rnd(5) === 0 ? { pass: true } : { mark: 4 + rnd(300) / 100 })) }));
  for (const l of phaseLines(lf, rankEntries(fes, LJ))) {
    const e = fes.find((x) => x.athleteId === l.playerId)!;
    const want = (e.result.attempts ?? []).filter((a) => a.foul).length;
    if ((e.result.attempts ?? []).length) assert.equal(l.stats.fieldFouls, want);
    else assert.equal(l.stats.fieldFouls, undefined);
  }
}

function swimming() {
  const R = disciplineOf(pick(['swim.4x100free', 'swim.4x100medley', 'swim.100free']))!;
  const t: unknown[] = Array.from({ length: rnd(4) }, () => pick([0.2, 0.05, -0.02, -0.03, -0.04, -0.2, null, 'x', NaN]));
  const r: EntryResult = { mark: 230, takeovers: t as number[], ...(rnd(6) === 0 ? { status: 'DQ' as const } : {}) };
  const n = takeoverDq(R, r);
  const early = t.findIndex((v) => typeof v === 'number' && takeoverEarly(v));
  if (!R.teamSize || r.status || early < 0) assert.equal(n, null);
  else {
    assert.equal(n!.status, 'DQ');
    assert.equal(n!.ruleRef, 'SW 10.13');
    assert.match(n!.reason!, new RegExp(`${early + 2}|leg`, 'i'));
    assert.deepEqual(n!.takeovers, r.takeovers);
  }
}

const SCENARIOS: [string, () => void][] = [
  ['precision capture', precision], ['archery match penalties', archeryMatch], ['golf maximum score', golfMax],
  ['cycling relegation', cycling], ['weightlifting re-attempts', lifting], ['athletics start cards / fouls', athletics], ['swimming take-overs', swimming],
];

for (const [name, run] of SCENARIOS) {
  test(`sim: 100 random competitions — ${name}`, () => {
    for (let i = 0; i < 100; i++) run();
  });
}
