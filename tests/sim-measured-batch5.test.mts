/**
 * Measured sports batch 5 — simulation (quality mandate step 6): 600 random
 * competitions, 100 per scenario — weightlifting sessions with withdrawals,
 * shooting with DNF / WD, archery ranking rounds with penalties (hostile values
 * mixed in), athletics qualifying lines with draws of lots, crew false starts,
 * and the commentary (walk red cards, false-start warnings, golf WD / DQ) with
 * hostile values. Invariants are checked after every competition.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, rankByHeat, qualify, liftingOrder, liftLines, shootLines, setEnd, setArrowPenalty, archTotals,
  groupMeet, eventCommentary, withStatusChange, drawOfLots, crewFalseStart, endSum,
  type EntryResult, type LiftAttempt, type ResultEntry, type PhaseFormat, type Arrow,
} from '../src/data/results/index.ts';
import { golfRoundFeed } from '../src/sports/golf/feed.ts';
import { standardPar72, type GolfCard } from '../src/sports/golf/engine.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: T[]): T => xs[rnd(xs.length)];

const WL = disciplineOf('wl.total')!, SN = disciplineOf('wl.snatch')!, AR = disciplineOf('shoot.10mar')!, R70 = disciplineOf('arch.r70')!;
const M100 = disciplineOf('ath.100m')!, X1 = disciplineOf('row.1x.2000')!;
const row = (i: number, result: EntryResult, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result: { order: i, ...result } });
const U = { age: 'U16', gender: 'M' as const };

function weightlifting() {
  const n = 3 + rnd(6);
  let seq = 0;
  const es: ResultEntry[] = [];
  for (let i = 1; i <= n; i++) {
    const lift = (base: number): LiftAttempt[] => Array.from({ length: rnd(4) }, (_, k) => ({ kg: base + k * 2, good: rnd(3) > 0, seq: ++seq }));
    const sn = lift(80 + rnd(30));
    const cj = sn.length === 3 ? lift(100 + rnd(40)) : [];
    let r: EntryResult = { lifts: { snatch: sn, ...(cj.length ? { cj } : {}) } };
    const w = rnd(4);
    if (w === 1) r = withStatusChange(WL, r, 'WD');
    else if (w === 2) r = { ...r, status: 'WD' }; // an old WD row (no marker)
    else if (w === 3 && rnd(5) === 0) r = { ...r, status: 'WD', wdKeep: pick([1, 'yes', null]) as unknown as boolean }; // hostile
    es.push(row(i, r));
  }
  const sn = rankEntries(es, SN), tot = rankEntries(es, WL);
  for (const e of es) {
    const r = e.result;
    const goodSn = (r.lifts?.snatch ?? []).some((a) => a.good === true);
    const keeps = r.status === 'WD' && r.wdKeep === true;
    const expectSn = goodSn && (r.status !== 'WD' || keeps);
    const got = sn.find((x) => x.id === e.id)!;
    if (r.status === 'WD' && !keeps) assert.equal(got.position, null, 'an old / hostile WD is never ranked');
    if (expectSn) assert.notEqual(got.position, null, 'a kept snatch is ranked');
    if (r.status === 'WD' && r.wdKeep !== true) assert.equal(r.wdKeep === undefined || r.wdKeep !== true, true);
    const t = tot.find((x) => x.id === e.id)!;
    if (r.status === 'WD' && !keeps) assert.equal(t.position, null);
  }
  for (const lift of ['snatch', 'cj'] as const) for (const c of liftingOrder(es, lift)) assert.notEqual(es.find((e) => e.id === c.entryId)!.result.status, 'WD', 'a withdrawn lifter is never called');
  const lines = liftLines({ category: undefined }, es, { liftMedals: true });
  for (const l of lines) {
    const e = es.find((x) => x.athleteId === l.playerId)!;
    if (e.result.status === 'WD') assert.equal(e.result.wdKeep, true, 'only a kept WD writes a line');
  }
}

function shooting() {
  const n = 3 + rnd(6);
  const es: ResultEntry[] = [];
  for (let i = 1; i <= n; i++) {
    const series = Array.from({ length: 1 + rnd(6) }, () => (95 + rnd(100) / 10));
    let r: EntryResult = { series, mark: Math.round(series.reduce((a, b) => a + b, 0) * 10) / 10 };
    const w = rnd(5);
    if (w === 1) r = withStatusChange(AR, r, 'WD');
    else if (w === 2) r = { ...r, status: 'WD' };
    else if (w === 3) r = withStatusChange(AR, r, 'DNF');
    es.push(row(i, r));
  }
  const ranked = rankEntries(es, AR);
  for (const x of ranked) if (x.status === 'WD' || x.status === 'DNF') assert.equal(x.position, null);
  const lines = shootLines({ discipline: 'shoot.10mar', category: undefined }, ranked, 'match');
  for (const l of lines) {
    const e = es.find((x) => x.athleteId === l.playerId)!;
    if (e.result.status === 'WD') assert.equal(e.result.wdKeep, true);
    if (e.result.status === 'WD' || e.result.status === 'DNF') { assert.equal(l.stats.m_sh_10mar, undefined); assert.equal(l.stats.place, undefined); }
    if (e.result.status === 'DNF') assert.equal(e.result.wdKeep, undefined, 'only WD carries the keep marker');
  }
}

function archery() {
  const arrows: Arrow[] = ['X', 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'M'];
  let r: EntryResult = {};
  const ends = 1 + rnd(12);
  for (let i = 0; i < ends; i++) r = setEnd(r, i, Array.from({ length: 6 }, () => pick(arrows)));
  const before = JSON.stringify(r.ends);
  for (let k = 0; k < 1 + rnd(4); k++) {
    const n = pick<number>([0, 1, 2, 3, 7, -1, 1.5, NaN, '2' as unknown as number]);
    r = setArrowPenalty(r, rnd(ends + 1), n);
  }
  if (rnd(3) === 0) r = setEnd(r, ends, Array.from({ length: 6 }, () => pick(arrows)));
  assert.equal(JSON.stringify(r.ends).startsWith(before.slice(0, -1)), true, 'arrows stay as shot');
  const raw = (r.ends ?? []).reduce((s, e) => s + endSum(e), 0);
  assert.ok((r.mark ?? 0) >= 0 && (r.mark ?? 0) <= raw, 'net score between 0 and the raw total');
  assert.equal(r.mark, archTotals(r.ends, r.arrPen).mark);
  assert.ok((r.tens ?? 0) >= 0 && (r.xs ?? 0) >= 0);
  for (const p of r.arrPen ?? []) assert.ok(Number.isInteger(p) && p >= 0 && p <= 6, 'stored penalties are clean');
  let c = r;
  for (let i = 0; i < (r.ends ?? []).length; i++) c = setArrowPenalty(c, i, 0);
  assert.equal(c.mark, raw, 'clearing every penalty restores the raw total');
  assert.equal(c.arrPen, undefined);
  assert.equal(rankEntries([row(1, r)], R70)[0].best, r.mark);
}

function qualifying() {
  const heats = 1 + rnd(3);
  const es: ResultEntry[] = [];
  let id = 0;
  for (let h = 1; h <= heats; h++) for (let l = 1; l <= 3 + rnd(5); l++) es.push(row(++id, { lane: l, mark: 12 + rnd(8) / 10, hand: true }, h));
  const prog = { byPlace: 1 + rnd(2), byMark: 1 + rnd(3) };
  const cap = 2 + rnd(es.length);
  const q = qualify(rankByHeat(es, M100, { handLegal: true }), M100, prog);
  const draw = drawOfLots(q, cap);
  if (draw.length) assert.ok(q.marks.size > cap);
  else assert.ok(q.marks.size <= cap || !q.tieAtLine.length);
  // the referee draws lots: distinct places for every tied athlete
  draw.forEach((d, k) => { const e = es.find((x) => x.id === d)!; e.result = { ...e.result, decider: k + 1 }; });
  const q2 = qualify(rankByHeat(es, M100, { handLegal: true }), M100, prog);
  for (const d of draw) assert.ok(!q2.tieAtLine.includes(d), 'a drawn athlete is no longer tied');
  assert.ok(q2.marks.size <= q.marks.size);
}

function crews() {
  const rule = pick([undefined, { crewFalseStart: 'zero' }, { crewFalseStart: 'warn' }, { crewFalseStart: '<x>' }]);
  const es: ResultEntry[] = [];
  for (let i = 1; i <= 3 + rnd(4); i++) {
    let r: EntryResult = { lane: i, mark: 400 + rnd(40) };
    const taps = rnd(3);
    for (let k = 0; k < taps && r.status !== 'FS'; k++) {
      const s = crewFalseStart(r, rule, pick(['rowing', 'canoe']));
      if (k === 0 && rule?.crewFalseStart !== 'zero') assert.equal(s.step, 'warn');
      if (k === 1 || rule?.crewFalseStart === 'zero') assert.equal(s.step, 'out');
      r = s.next;
    }
    es.push(row(i, r));
  }
  for (const x of rankEntries(es, X1)) {
    if (x.entry.result.status === 'FS') assert.equal(x.position, null);
    else assert.notEqual(x.position, null, 'a warned crew is still ranked');
  }
}

function commentary() {
  const walk: PhaseFormat = { discipline: 'ath.walk.10000', category: U, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'w', eventTitle: 'Walk', ...(rnd(2) ? { road: { penaltyZone: true } as PhaseFormat['road'] } : {}) };
  const crew: PhaseFormat = { discipline: 'row.1x.2000', category: U, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'r', eventTitle: 'Row' };
  const hostile = () => pick<unknown>([undefined, 0, 1, 2, 3, 4, -2, 'x', 1.5, NaN, true]);
  const wEs = Array.from({ length: 2 + rnd(5) }, (_, i) => row(i + 1, { fin: i + 1, rc: hostile() as number, fsWarn: hostile() as boolean }));
  const cEs = Array.from({ length: 2 + rnd(4) }, (_, i) => row(i + 1, { lane: i + 1, mark: 400 + i, fsWarn: hostile() as boolean, ...(rnd(4) === 0 ? { status: 'FS' as const } : {}) }));
  for (const [f, es] of [[walk, wEs], [crew, cEs]] as const) {
    const t = eventCommentary(groupMeet([{ id: 'p', format: f, status: pick(['live', 'completed'] as const), date: '2026-11-03T09:00:00Z', entries: es }])[0]).map((i) => i.text).join('\n');
    assert.doesNotMatch(t, /undefined|NaN|\[object/);
    assert.doesNotMatch(t, /-\d+ red card|1\.5 red/);
  }
  const H = standardPar72();
  const players = Array.from({ length: 2 + rnd(4) }, (_, i) => {
    const admin = rnd(2) ? { status: pick(['wd', 'dq', 'dns', 'evil']) as 'wd', reason: pick([undefined, '', 'injury', 'z'.repeat(rnd(500))]), thru: pick<unknown>([undefined, 3, -1, 99, 'x']) as number } : undefined;
    const card: GolfCard = { strokes: H.map((h, k) => (k < rnd(19) ? h.par + rnd(3) - 1 : null)), ...(admin ? { admin } : {}) };
    return { id: `g${i}`, name: `Golfer ${i}`, card, holes: H, received: H.map(() => 0) };
  });
  const feed = golfRoundFeed(players, { scoring: pick(['stroke', 'stableford'] as const) });
  const adm = feed.find((g) => g.key === 'admin');
  for (const it of adm?.items ?? []) { assert.ok(it.text.length < 160); assert.doesNotMatch(it.text, /undefined|NaN|after -|after 99/); }
  const real = players.filter((p) => ['wd', 'dq', 'dns'].includes(p.card.admin?.status as string)).length;
  assert.equal(adm?.items.length ?? 0, real);
}

const SCENARIOS = [weightlifting, shooting, archery, qualifying, crews, commentary];

test('600 random measured-sport competitions keep every batch 5 invariant', () => {
  for (let i = 0; i < 600; i++) SCENARIOS[i % SCENARIOS.length]();
});
