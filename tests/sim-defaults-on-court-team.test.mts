/**
 * Wave 3 (docs/sport-expert/defaults-on/PLAN.md) — the 600-user simulation for
 * "Stats to track on by default" in the court-team family (quality mandate
 * step 6; breaks: docs/security/breaks/defaults-on-court-team.md).
 *
 * 150 scorers per sport (volleyball, kabaddi, netball, handball) each start a
 * NEW match from the new-match form (a random preset, friendly or
 * tournament), so every new default is on. Each scorer answers each optional
 * prompt with their own probability (0 = skips every one), and only where
 * the controls offer it (the match tracks it):
 *  - DOC8: the score is exactly the score of the same plays with nothing
 *    described — a prompt never holds or changes a point;
 *  - DOC7: a stat's keys appear only when at least one was captured (no false
 *    zeros), and when captured they are the captures;
 *  - DOC12: no attack-attempt keys in volleyball.
 * Then OLD matches (formats without the keys, or with them off) replay to the
 * fingerprint recorded on the code before this wave (d9e624ab) — DOC1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { FormatField, ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
// volleyball
import { VOLLEYBALL_META } from '../src/sports/volleyball/meta.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { catOn } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
// kabaddi
import { KABADDI_META } from '../src/sports/kabaddi/meta.ts';
import { init as kbInit, reducer as kbReducer, raidActions, RAID_SKILLS, type KabaddiState, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import { kabaddiTotals } from '../src/sports/kabaddi/totals.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
// netball
import { NETBALL_META } from '../src/sports/netball/meta.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
import { netballPanel } from '../src/sports/netball/panel.ts';
// handball
import { HANDBALL_META } from '../src/sports/handball/meta.ts';
import * as hb from '../src/sports/handball/engine.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { handballDepthFigures } from '../src/sports/handball/depth.ts';

type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
/** A scorer's habit for one prompt: never, sometimes, mostly. */
const habit = (r: () => number) => pick(r, [0, 0, 0.3, 0.8]);

/** FormatEditor.defaultsFor + a preset pick (the new-match form). */
function newMatchFormat(fields: readonly FormatField[], r: () => number): Record<string, unknown> {
  const ctx = r() < 0.5 ? 'tournament' : undefined;
  const preset = fields.find((f) => f.type === 'preset');
  const presetDefault = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? presetDefault : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  const chosen = preset?.options?.find((o) => o.value === presetDefault);
  if (chosen?.set) Object.assign(out, chosen.set);
  if (preset?.options?.length) {
    const o = pick(r, preset.options);
    Object.assign(out, { [preset.key]: o.value }, o.set ?? {});
  }
  return out;
}
const fpOf = (xs: unknown[]) => { const h = createHash('sha256'); for (const x of xs) h.update(JSON.stringify(x) + '\n'); return h.digest('hex'); };
const record = (k: string, d: string) => { if (process.env.RECORD) console.log('FP', k, d); return d; };

/** Old-match fingerprints, recorded on the code before this wave (d9e624ab). */
const BEFORE = {
  volleyball: '5a533318e1b85b30ed3f66efa3e8fab41ef0aaa75fcdab27d2730ee76b16f6e0',
  kabaddi: '74b0297ea412c871093a6673b3bb08e5c42457f60989327ef7ffd0cb64866122',
  netball: 'b04483a273d68e1a5af9b70389e1bc3db3a1dfa59d4ebb881caad80518713be8',
  handball: '0b6a4618c05e067d0e7b2cf3f5bd77586ea59a00b8af6575c6a76168fc5cc3b4',
};
const USERS = 150; // per sport: 600 in all
const OLD = 40; // old matches per sport

/* ================================= volleyball ================================ */

const VB_OLD = [{}, { preset: 'indoor' }, { preset: 'beach', vbAttack: false, vbReception: false, vbDig: false, vbAssist: true, vbAced: true }, { vbAssist: false, vbAced: false }];
const vroster = (sd: Side) => [1, 2, 3, 4, 5, 6].map((i) => `${sd[0]}${i}`);
const vLineup: ScoreAction[] = SIDES.map((team) => ({ type: 'LINEUP', payload: { team, players: vroster(team).map((id) => ({ id, name: id })) } }));
const vdet = (kind: string, side: Side, id: string, q?: string): ScoreAction => ({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: id }, ...(q ? { q } : {}) } });

function vbGame(cfg: Record<string, unknown>, r: () => number) {
  const p = { reception: habit(r), dig: habit(r), assist: habit(r), aced: habit(r) };
  const n = { reception: 0, dig: 0, assist: 0, aced: 0 };
  let s = vLineup.reduce(vb.reducer, vb.init(cfg));
  let plain = vLineup.reduce(vb.reducer, vb.init(cfg));
  for (let i = 0; i < 25 + Math.floor(r() * 40) && !s.ended; i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const opp = other(side);
    // rally chips, offered only when the match tracks them
    if (catOn(s, 'reception') && r() < p.reception) { s = vb.reducer(s, vdet('reception', opp, pick(r, vroster(opp)), pick(r, ['perfect', 'good', 'poor']))); n.reception++; }
    if (catOn(s, 'dig') && r() < p.dig) { s = vb.reducer(s, vdet('dig', opp, pick(r, vroster(opp)))); n.dig++; }
    const kind = pick(r, ['attack', 'attack', 'ace', 'block', 'opperror', 'serveerror'] as const);
    const a = vb.outcomeAction(kind, side, { id: pick(r, vroster(side)), fullName: 'x' });
    s = vb.reducer(s, a); plain = vb.reducer(plain, a);
    // the "Last point" card
    if (kind === 'attack' && catOn(s, 'assist') && r() < p.assist) { s = vb.reducer(s, vdet('assist', side, pick(r, vroster(side)))); n.assist++; }
    if (kind === 'ace' && catOn(s, 'aced') && r() < p.aced) { s = vb.reducer(s, vdet('aced', opp, pick(r, vroster(opp)))); n.aced++; }
  }
  return { s, plain, n };
}

test(`volleyball: ${USERS} new matches (all presets) — never blocked, no false zeros`, () => {
  const r = rng(20261108);
  for (let u = 0; u < USERS; u++) {
    const fmt = newMatchFormat(VOLLEYBALL_META.formatFields ?? [], r);
    const s0 = vb.init(fmt);
    for (const c of ['reception', 'dig', 'assist', 'aced'] as const) assert.equal(catOn(s0, c), true, c);
    assert.equal(catOn(s0, 'attack'), false, 'DOC12');
    const { s, plain, n } = vbGame(fmt, r);
    assert.deepEqual([s.current, s.setsWon, s.sets, s.ended], [plain.current, plain.setsWon, plain.sets, plain.ended], 'DOC8');
    const lines = Object.values(volleyballStatTotals(s));
    const has = (k: string) => lines.some((l) => k in l.stats);
    const sum = (k: string) => lines.reduce((a, l) => a + (l.stats[k] ?? 0), 0);
    assert.equal(has('digs'), n.dig > 0, `DOC7 digs ${JSON.stringify(n)}`);
    assert.equal(has('setAssists'), n.assist > 0, 'DOC7 setAssists');
    assert.equal(has('receptionErrors'), n.aced > 0, 'DOC7 receptionErrors');
    if (n.reception > 0) assert.ok(has('receptions'));
    if (n.reception + n.aced === 0) assert.equal(has('receptions'), false, 'DOC7 receptions');
    if (n.dig) assert.equal(sum('digs'), n.dig);
    if (n.assist) assert.equal(sum('setAssists'), n.assist);
    assert.equal(has('attackAttempts'), false, 'DOC12');
  }
});

test(`volleyball: ${OLD} old matches replay exactly as before (DOC1)`, () => {
  const r = rng(20261208); // its own stream: the old phase never depends on the new
  const out: unknown[] = [];
  for (let m = 0; m < OLD; m++) {
    const cfg = pick(r, VB_OLD);
    const { s } = vbGame(cfg, r);
    assert.equal(catOn(s, 'reception') || catOn(s, 'dig'), false, 'DOC1');
    out.push({ s, t: volleyballStatTotals(s) });
  }
  assert.equal(record('volleyball', fpOf(out)), BEFORE.volleyball || fpOf(out), 'DOC1: old matches replay exactly as before');
  if (!process.env.RECORD) assert.ok(BEFORE.volleyball, 'fingerprint recorded');
});

/* ================================== kabaddi ================================== */

const KB_OLD = [{}, { preset: 'pro', playersPerSide: 7, halfMinutes: 20, style: 'sanjeevani', superTackle: true, doOrDie: true, caughtTouches: 'void' }, { preset: 'school', trackSkills: false, trackTouched: false, playersPerSide: 7 }];
const kroster = (sd: Side) => [1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `${sd[0]}${i}`, fullName: `${sd[0]}${i}` }));
const KCTX: StatTotalsContext = { players: { home: kroster('home').map((p) => ({ id: p.id, name: p.fullName })), away: kroster('away').map((p) => ({ id: p.id, name: p.fullName })) } };

function kbGame(cfg: Record<string, unknown>, r: () => number) {
  const pSkill = habit(r);
  let described = 0;
  const go = (s: KabaddiState, f: RaidForm, minute: number) => {
    for (const a of raidActions(s, f)) s = kbReducer(s, a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half: 1 } });
    return s;
  };
  let s: KabaddiState = kbReducer(kbInit(cfg), { type: 'KICKOFF', payload: { at: 1 } });
  let plain: KabaddiState = kbReducer(kbInit(cfg), { type: 'KICKOFF', payload: { at: 1 } });
  for (let i = 0; i < 20 + Math.floor(r() * 25) && !s.ended; i++) {
    const side: Side = i % 2 === 0 ? 'home' : 'away';
    const raider = pick(r, kroster(side));
    const quick = r() < 0.5; // the one-tap raids never ask for the skill
    const touches = quick ? (r() < 0.5 ? 1 : 0) : Math.floor(r() * 3);
    const tackled = !quick && touches === 0 && r() < 0.3;
    const f: RaidForm = { side, raider, touches, bonus: false, tackled, ...(tackled ? { tackler: pick(r, kroster(other(side))) } : {}) };
    const skill = !quick && s.track?.skills && touches > 0 && r() < pSkill ? pick(r, RAID_SKILLS.filter((k) => k.key !== 'escape')).key : undefined;
    const minute = 1 + Math.floor(i / 2);
    plain = go(plain, f, minute);
    s = go(s, skill ? { ...f, skill } : f, minute);
    if (skill) described++;
  }
  return { s, plain, described };
}

test(`kabaddi: ${USERS} new matches (all rule sets) — skill on, never blocked, no false zeros`, () => {
  const r = rng(20261109);
  for (let u = 0; u < USERS; u++) {
    const fmt = newMatchFormat(KABADDI_META.formatFields ?? [], r);
    assert.deepEqual(kbInit(fmt).track, { skills: true }, 'skill on, touched off (DOC13)');
    const { s, plain, described } = kbGame(fmt, r);
    assert.deepEqual([s.home, s.away, s.out], [plain.home, plain.away, plain.out], 'DOC8');
    const skills = kabaddiMatchStats(s).cats.find((c) => c.id === 'skills');
    if (!described) assert.equal(skills, undefined, 'DOC7: no Skills rows from the switch alone');
    else assert.match(skills!.note ?? '', new RegExp(`${described} raid skills? of`));
    for (const l of Object.values(kabaddiTotals(s, KCTX))) {
      assert.equal(Object.keys(l.stats).some((k) => /skill|^sk_/i.test(k)), false, 'skills never reach careers');
      assert.equal('touchedOut' in l.stats, false, 'touched not tracked');
    }
  }
});

test(`kabaddi: ${OLD} old matches replay exactly as before (DOC1)`, () => {
  const r = rng(20261209); // its own stream: the old phase never depends on the new
  const out: unknown[] = [];
  for (let m = 0; m < OLD; m++) {
    const { s } = kbGame(pick(r, KB_OLD), r);
    assert.equal('track' in s, false, 'DOC1');
    out.push({ s, t: kabaddiTotals(s, KCTX) });
  }
  assert.equal(record('kabaddi', fpOf(out)), BEFORE.kabaddi || fpOf(out), 'DOC1: old matches replay exactly as before');
  if (!process.env.RECORD) assert.ok(BEFORE.kabaddi, 'fingerprint recorded');
});

/* ================================== netball ================================== */

const NB_POS: nb.Pos[] = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const nroster = (sd: Side) => NB_POS.map((p) => `${sd[0]}${p.toLowerCase()}`);
const NB_OLD = [
  {},
  { preset: 'international', periods: 4, periodMinutes: 15 },
  { preset: 'international', periods: 4, periodMinutes: 15, trackCpr: true, detail: true },
  { preset: 'school', periods: 4, periodMinutes: 10, trackCpr: false, detail: false },
  { preset: 'halves', periods: 2, periodMinutes: 20, trackCpr: false, detail: false, trackGains: false, trackTurnovers: false },
];
const credit = (e: Parameters<typeof nb.eventCredits>[0]) => {
  const cr = nb.eventCredits(e);
  const a1 = nb.creditAttribution(cr.first, 1, [...nb.LIVE_KEYS]), a2 = nb.creditAttribution(cr.second, 1, [...nb.LIVE_KEYS]);
  return { ...(a1 ? { attribution: a1 } : {}), ...(a2 ? { attribution2: a2 } : {}) };
};

function nbGame(cfg: Record<string, unknown>, r: () => number) {
  const p = { feed: habit(r), rebound: habit(r), gain: habit(r), tt: habit(r), cpr: habit(r), pickup: habit(r) };
  const n = { feed: 0, rebound: 0, gain: 0, tt: 0, cpr: 0, pickup: 0 };
  const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(NB_POS.map((q, i) => [q, { id: nroster(team)[i] }])) } });
  const start = () => [xi('home'), xi('away'), { type: 'FIRST_CENTRE', side: 'home' } as ScoreAction].reduce(nb.reducer, nb.init(cfg));
  let s = start(), plain = start();
  let uid = 0;
  const both = (a: ScoreAction) => { s = nb.reducer(s, a); plain = nb.reducer(plain, a); };
  const describe = (id: string, d: Parameters<typeof nb.describeAction>[2]) => { const a = nb.describeAction(s, id, d); if (a) s = nb.reducer(s, a); return !!a; };
  for (let i = 0; i < 30 + Math.floor(r() * 30); i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const sec = 10 + i * 20;
    const id = `p${++uid}`;
    // the centre-pass-receive row, only when tracked
    if (s.trackCpr && r() < p.cpr) { s = nb.reducer(s, { type: 'CPR', side, payload: { playerId: nroster(side)[2], pos: 'WA', uid: `c${uid}`, sec, period: 1 } }); n.cpr++; }
    const roll = r();
    if (roll < 0.55) {
      const pos = r() < 0.5 ? 'GS' : 'GA';
      const miss = r() < 0.3;
      both({ type: miss ? 'MISS' : 'GOAL', side, payload: { pos, uid: id, sec, period: 1 }, ...credit({ type: miss ? 'miss' : 'goal', playerId: nroster(side)[pos === 'GS' ? 0 : 1] }) });
      const fields = nb.describeFields(s, s.events.find((e) => e.id === id)!);
      if (fields.includes('feed') && r() < p.feed && describe(id, { feed: nroster(side)[2 + Math.floor(r() * 2)] })) n.feed++;
      if (fields.includes('rebound') && r() < p.rebound) {
        const rs: Side = r() < 0.5 ? side : other(side);
        if (describe(id, { rebound: { side: rs, playerId: nroster(rs)[rs === side ? 0 : 6], uid: `r${uid}` } })) n.rebound++;
      }
    } else if (roll < 0.7) {
      both({ type: 'STAT', side, payload: { kind: 'deflection', uid: id, sec, period: 1 }, ...credit({ type: 'stat', stat: 'deflection', playerId: nroster(side)[6] }) });
      if (nb.describeFields(s, s.events.find((e) => e.id === id)!).includes('gain') && r() < p.gain && describe(id, { gain: r() < 0.5 })) n.gain++;
    } else if (roll < 0.85) {
      both({ type: 'STAT', side, payload: { kind: 'turnover', uid: id, sec, period: 1 }, ...credit({ type: 'stat', stat: 'turnover', playerId: nroster(side)[3] }) });
      if (nb.describeFields(s, s.events.find((e) => e.id === id)!).includes('tt') && r() < p.tt && describe(id, { tt: pick(r, ['badPass', 'footwork', 'heldBall', 'offside']) })) n.tt++;
    } else if (s.trackGains && r() < p.pickup) {
      // the extra "Pick-up" button, only when tracked
      s = nb.reducer(s, { type: 'STAT', side, payload: { kind: 'pickup', uid: id, sec, period: 1, playerId: nroster(side)[5] }, ...credit({ type: 'stat', stat: 'pickup', playerId: nroster(side)[5] }) });
      n.pickup++;
    } else {
      both({ type: 'STAT', side, payload: { kind: 'intercept', uid: id, sec, period: 1 }, ...credit({ type: 'stat', stat: 'intercept', playerId: nroster(side)[5] }) });
    }
  }
  return { s, plain, n };
}

test(`netball: ${USERS} new matches (every preset) — all four on, never blocked, no false zeros`, () => {
  const r = rng(20261110);
  const presets = new Set<unknown>();
  for (let u = 0; u < USERS; u++) {
    const fmt = newMatchFormat(NETBALL_META.formatFields ?? [], r);
    presets.add(fmt.preset);
    const s0 = nb.init(fmt);
    assert.deepEqual([s0.detail, s0.trackCpr, s0.trackGains, s0.trackTurnovers], [true, true, true, true], `DOC5 ${String(fmt.preset)}`);
    const { s, plain, n } = nbGame(fmt, r);
    assert.deepEqual([s.home, s.away], [plain.home, plain.away], 'DOC8');
    const lines = Object.values(netballTotals(s));
    const has = (k: string) => lines.some((l) => k in l.stats);
    assert.equal(has('centrePassReceives'), n.cpr > 0, `DOC7 cpr ${JSON.stringify(n)}`);
    for (const k of ['pickups', 'deflectionsGain', 'deflectionsNoGain']) assert.equal(has(k), n.gain + n.pickup > 0, `DOC7 ${k}`);
    const rows = netballPanel(s).categories.flatMap((c) => c.rows);
    assert.equal(rows.some((x) => x.key === 'feeds'), n.feed > 0, 'DOC7 feeds');
    assert.equal(rows.some((x) => x.key === 'cpr'), n.cpr > 0, 'DOC7 cpr row');
  }
  assert.deepEqual([...presets].sort(), ['custom', 'halves', 'international', 'school'], 'every preset simulated');
});

test(`netball: ${OLD} old matches replay exactly as before (DOC1)`, () => {
  const r = rng(20261210); // its own stream: the old phase never depends on the new
  const out: unknown[] = [];
  for (let m = 0; m < OLD; m++) {
    const cfg = pick(r, NB_OLD);
    const { s } = nbGame(cfg, r);
    if (!('detail' in cfg)) assert.equal(s.detail, false, 'DOC1');
    assert.notEqual(s.trackGains, true, 'DOC1');
    out.push({ s, t: netballTotals(s) });
  }
  assert.equal(record('netball', fpOf(out)), BEFORE.netball || fpOf(out), 'DOC1: old matches replay exactly as before');
  if (!process.env.RECORD) assert.ok(BEFORE.netball, 'fingerprint recorded');
});

/* ================================== handball ================================= */

const HB_OLD = [{}, { preset: 'senior', playersPerSide: 7, periodMinutes: 30 }, { preset: 'youth20', trackFaultTypes: false, trackSevenMDrawn: false }];
const hroster = (sd: Side) => ['gk', '1', '2', '3', '4', '5', '6'].map((x) => `${sd[0]}${x}`);
let hu = 0;
function HA(type: string, side: Side, sec: number, ev: Partial<hb.HandballEvent>, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = hb.eventCredits({ type: ev.type ?? 'timeout', ...ev } as hb.HandballEvent);
  const a: ScoreAction = { type, side, payload: { ...payload, uid: `h${++hu}`, sec, period: 1 } };
  const a1 = hb.creditAttribution(cr.first), a2 = hb.creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const FAULTS = hb.FAULT_TYPES;

function hbGame(cfg: Record<string, unknown>, r: () => number) {
  hu = 0;
  const p = { fault: habit(r), drawn: habit(r) };
  const n = { fault: 0, drawn: 0 };
  const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, gk: { id: hroster(team)[0], name: hroster(team)[0] }, players: hroster(team).map((id) => ({ id, name: id })) } });
  const start = () => [xi('home'), xi('away')].reduce(hb.reducer, hb.init(cfg));
  let s = start(), plain = start();
  for (let i = 0; i < 30 + Math.floor(r() * 30); i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const sec = 10 + i * 20;
    const who = pick(r, hroster(side).slice(1));
    const roll = r();
    if (roll < 0.5) {
      const a = HA('GOAL', side, sec, { type: 'goal', shotType: 'sixM' as never, playerId: who, playerName: who }, { shotType: 'sixM' });
      s = hb.reducer(s, a); plain = hb.reducer(plain, a);
    } else if (roll < 0.8) {
      // the fault kind is a chip beside the player pick: same action, one key more
      const fault = s.track?.faultTypes && r() < p.fault ? pick(r, FAULTS) : undefined;
      if (fault) n.fault++;
      s = hb.reducer(s, HA('TURNOVER', side, sec, { type: 'turnover', playerId: who, playerName: who }, fault ? { fault } : {}));
      hu--; plain = hb.reducer(plain, HA('TURNOVER', side, sec, { type: 'turnover', playerId: who, playerName: who }));
    } else {
      // 7 m: "won by" is an optional chip on the result screen; its DRAWN goes first
      if (s.track?.sevenMDrawn && r() < p.drawn) { s = hb.reducer(s, HA('DRAWN', side, sec, { type: 'drawn', playerId: who, playerName: who })); n.drawn++; }
      const a = HA('GOAL', side, sec, { type: 'goal', shotType: 'sevenM' as never, playerId: who, playerName: who }, { shotType: 'sevenM' });
      s = hb.reducer(s, a); plain = hb.reducer(plain, a);
    }
  }
  return { s, plain, n };
}

test(`handball: ${USERS} new matches (every preset) — both on, never blocked, no false zeros`, () => {
  const r = rng(20261111);
  for (let u = 0; u < USERS; u++) {
    const fmt = newMatchFormat(HANDBALL_META.formatFields ?? [], r);
    assert.deepEqual(hb.init(fmt).track, { faultTypes: true, sevenMDrawn: true });
    const { s, plain, n } = hbGame(fmt, r);
    assert.deepEqual([s.home, s.away], [plain.home, plain.away], 'DOC8');
    const tf = (['home', 'away'] as const).some((sd) => Object.keys(handballDepthFigures(s, sd)).some((k) => k.startsWith('tf')));
    assert.equal(tf, n.fault > 0, `DOC7 fault kinds ${JSON.stringify(n)}`);
    const lines = Object.values(handballTotals(s));
    assert.equal(lines.some((l) => 'sevenMDrawn' in l.stats), n.drawn > 0, 'DOC7 sevenMDrawn');
  }
});

test(`handball: ${OLD} old matches replay exactly as before (DOC1)`, () => {
  const r = rng(20261211); // its own stream: the old phase never depends on the new
  const out: unknown[] = [];
  for (let m = 0; m < OLD; m++) {
    const { s } = hbGame(pick(r, HB_OLD), r);
    assert.equal('track' in s, false, 'DOC1');
    out.push({ s, t: handballTotals(s) });
  }
  assert.equal(record('handball', fpOf(out)), BEFORE.handball || fpOf(out), 'DOC1: old matches replay exactly as before');
  if (!process.env.RECORD) assert.ok(BEFORE.handball, 'fingerprint recorded');
});
