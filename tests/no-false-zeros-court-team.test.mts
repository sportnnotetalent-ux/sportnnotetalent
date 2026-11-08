/**
 * Wave 1 (docs/sport-expert/defaults-on/PLAN.md) — no false zeros in the
 * court-team family: volleyball, kabaddi, netball, handball.
 * Break-it list: docs/security/breaks/no-false-zeros-court-team.md (NZC1…12).
 *
 * The rule (racket DD11): a stat counts as tracked only once at least one
 * entry of that kind was captured in the match. Switched on with nothing
 * captured → nothing shown, nothing written to careers, no rate. Where entries
 * were captured, every figure is what it was before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';

import * as vb from '../src/sports/volleyball/engine.ts';
import { catTracked, detailTracked, receptionTracked, acedTracked, digTracked, assistTracked } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';

import { init as kbInit, reducer as kbReducer, raidActions, type KabaddiState, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import { kabaddiTotals, kabaddiTouchedTracked } from '../src/sports/kabaddi/totals.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { kabaddiPlayerCounts } from '../src/sports/kabaddi/deepBox.ts';

import {
  init as nbInit, reducer as nbReducer, eventCredits as nbCredits, creditAttribution as nbAttr,
  type NetballEvent, type NetballState, type Pos,
} from '../src/sports/netball/engine.ts';
import { nbCoverage, cprOn, nbDeepKeys } from '../src/sports/netball/deep.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
import { netballPanel } from '../src/sports/netball/panel.ts';

import {
  init as hbInit, reducer as hbReducer, eventCredits as hbCredits, creditAttribution as hbAttr,
  type HandballEvent, type HandballState,
} from '../src/sports/handball/engine.ts';
import { faultTypesTracked, sevenMDrawnTracked, handballDepthFigures, handballUntracked } from '../src/sports/handball/depth.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';

type Side = 'home' | 'away';
const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');

/* =============================== volleyball =============================== */

const VP = (id: string, fullName: string) => ({ id, fullName });
const VH = [VP('h1', 'Asha'), VP('h2', 'Bela'), VP('h3', 'Chitra'), VP('h4', 'Diya'), VP('h5', 'Esha'), VP('h6', 'Fara')];
const VA = [VP('a1', 'Uma'), VP('a2', 'Vani'), VP('a3', 'Wren'), VP('a4', 'Xia'), VP('a5', 'Yami'), VP('a6', 'Zoya')];
const vroster = (sd: Side) => (sd === 'home' ? VH : VA);
const vLineup: ScoreAction[] = [
  { type: 'LINEUP', payload: { team: 'home', players: VH.map((p) => ({ id: p.id, name: p.fullName })) } },
  { type: 'LINEUP', payload: { team: 'away', players: VA.map((p) => ({ id: p.id, name: p.fullName })) } },
];
const vdet = (kind: string, side: Side, p: { id: string; fullName: string }, q?: string): ScoreAction =>
  ({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: p.id, playerName: p.fullName }, ...(q ? { q } : {}) } });
const vplay = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(vb.reducer, vb.init(cfg));
const ALL_VB = { vbAttack: true, vbReception: true, vbDig: true, vbAssist: true, vbAced: true };
const VB_KEYS = {
  attack: ['attackAttempts', 'attackKills', 'attackErrors', 'attacksBlocked'],
  reception: ['receptions', 'receptionsPerfect', 'receptionsPositive'],
  aced: ['receptionErrors'],
  dig: ['digs'],
  assist: ['setAssists'],
} as const;
const vRow = (s: vb.VolleyballState, cat: string, key: string) =>
  volleyballMatchStats(s).cats.find((c) => c.id === cat)?.rows.find((r) => r.key === key);
/** A match with every stat switched on (format keys) and only points scored. */
const vbSkipped = () => vplay([
  ...vLineup,
  vb.outcomeAction('attack', 'home', VH[0]), vb.outcomeAction('ace', 'away', VA[1]),
  vb.outcomeAction('block', 'home', VH[2]), vb.outcomeAction('attack', 'away', VA[3]),
], ALL_VB);

describe('NZC1–4 · volleyball: switched on, nothing captured → not tracked', () => {
  const s = vbSkipped();
  test('NZC1 digs / set assists: no key, no row', () => {
    assert.equal(digTracked(s), false);
    assert.equal(assistTracked(s), false);
    const t = volleyballStatTotals(s);
    for (const l of Object.values(t)) { assert.equal('digs' in l.stats, false); assert.equal('setAssists' in l.stats, false); }
    assert.equal(vRow(s, 'defence', 'digs'), undefined);
    assert.equal(vRow(s, 'defence', 'assists'), undefined);
  });
  test('NZC2 who was aced: no receptionErrors key, no "receiver named" row, no reception efficiency', () => {
    assert.equal(acedTracked(s), false);
    for (const l of Object.values(volleyballStatTotals(s))) assert.equal('receptionErrors' in l.stats, false);
    assert.equal(vRow(s, 'reception', 'acedNamed'), undefined);
  });
  test('NZC2 graded receptions but no aced receiver named: reception efficiency not computed', () => {
    const g = vb.reducer(s, vdet('reception', 'home', VH[1], 'perfect'));
    assert.equal(receptionTracked(g), true);
    assert.equal(acedTracked(g), false);
    assert.equal(vRow(g, 'reception', 'recEff'), undefined);
    assert.equal(volleyballStatTotals(g).h2.stats.receptions, 1);
    assert.equal('receptionErrors' in volleyballStatTotals(g).h2.stats, false);
  });
  test('NZC3 reception quality: no receptions keys', () => {
    assert.equal(receptionTracked(s), false);
    assert.equal(catTracked(s, 'reception'), false);
    for (const l of Object.values(volleyballStatTotals(s))) assert.equal('receptions' in l.stats, false);
  });
  test('NZC4 attack attempts: kills alone are not attempts — no keys, no efficiency row', () => {
    assert.equal(detailTracked(s), false);
    for (const l of Object.values(volleyballStatTotals(s))) assert.equal('attackAttempts' in l.stats, false);
    assert.equal(vRow(s, 'attack', 'eff'), undefined);
  });
  test('NZC4 an older SD-81 log (detail: true) with no entry: no attack keys either', () => {
    const old = vplay([...vLineup, { type: 'SET_DETAIL', payload: { detail: true } }, vb.outcomeAction('attack', 'home', VH[0])]);
    assert.equal(detailTracked(old), false);
    assert.equal('attackAttempts' in volleyballStatTotals(old).h1.stats, false);
  });
});

describe('NZC1–4, NZC12 · volleyball: captured entries → exactly as before', () => {
  test('one of each: every category written, 0 on the other lines', () => {
    let s = vbSkipped();
    s = vb.reducer(s, vdet('dig', 'home', VH[4]));
    s = vb.reducer(s, vb.outcomeAction('attack', 'home', VH[0]));
    s = vb.reducer(s, vdet('assist', 'home', VH[1]));
    s = vb.reducer(s, vb.outcomeAction('ace', 'home', VH[3]));
    s = vb.reducer(s, vdet('aced', 'away', VA[0]));
    s = vb.reducer(s, vdet('inplay', 'away', VA[2]));
    s = vb.reducer(s, vdet('reception', 'away', VA[0], 'good'));
    const t = volleyballStatTotals(s);
    assert.equal(t.h5.stats.digs, 1);
    assert.equal(t.h1.stats.digs, 0);
    assert.equal(t.h2.stats.setAssists, 1);
    assert.equal(t.a1.stats.receptionErrors, 1);
    assert.equal(t.a1.stats.receptions, 2);
    assert.equal(t.a3.stats.attackAttempts, 1);
    assert.equal(t.h1.stats.attackKills, 2);
    assert.equal(t.h1.stats.attackAttempts, 2);
    assert.ok(vRow(s, 'defence', 'digs'));
    assert.ok(vRow(s, 'reception', 'recEff'));
    assert.ok(vRow(s, 'attack', 'eff'));
  });
  test('NZC11 an entry undone (the action taken out of the log) → not tracked again', () => {
    const acts: ScoreAction[] = [...vLineup, vb.outcomeAction('attack', 'home', VH[0]), vdet('dig', 'away', VA[0])];
    assert.equal(digTracked(vplay(acts, ALL_VB)), true);
    assert.equal(digTracked(vplay(acts.slice(0, -1), ALL_VB)), false);
  });
});

/* ================================= kabaddi ================================= */

const KP = (id: string, fullName: string) => ({ id, fullName });
const KH = [KP('h1', 'Pardeep'), KP('h2', 'Rahul'), KP('h3', 'Sunil'), KP('h4', 'Manjeet'), KP('h5', 'Neeraj'), KP('h6', 'Sachin'), KP('h7', 'Vikas')];
const KA = [KP('a1', 'Arjun'), KP('a2', 'Bhanu'), KP('a3', 'Chetan'), KP('a4', 'Deepak'), KP('a5', 'Eshan'), KP('a6', 'Fazel'), KP('a7', 'Girish')];
const KCFG = { playersPerSide: 7, style: 'sanjeevani', superTackle: true, doOrDie: true, caughtTouches: 'void', substitutes: 2 };
const KCTX: StatTotalsContext = { players: { home: KH.map((p) => ({ id: p.id, name: p.fullName })), away: KA.map((p) => ({ id: p.id, name: p.fullName })) } };
class Kb {
  s: KabaddiState;
  constructor(cfg: Record<string, unknown> = KCFG) { this.s = kbInit(cfg); this.s = kbReducer(this.s, { type: 'KICKOFF', payload: { at: 1 } }); }
  raid(f: Partial<RaidForm> & { side: Side }, minute = 3, half = 1) {
    for (const a of raidActions(this.s, { touches: 0, bonus: false, tackled: false, ...f })) this.s = kbReducer(this.s, a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half } });
    return this;
  }
}
const kbSkipped = () => new Kb({ ...KCFG, trackTouched: true })
  .raid({ side: 'home', raider: KH[0], touches: 2 })
  .raid({ side: 'away', raider: KA[0], touches: 1 })
  .raid({ side: 'home', raider: KH[1], touches: 0, tackled: true, tackler: KA[2] });

describe('NZC5 · kabaddi "Defenders touched": switched on, nobody named → not tracked', () => {
  const s = kbSkipped().s;
  test('no touchedOut / unsuccessfulTackles key in careers or the deep box', () => {
    assert.equal(kabaddiTouchedTracked(s), false);
    for (const l of Object.values(kabaddiTotals(s, KCTX))) {
      assert.equal('touchedOut' in l.stats, false);
      assert.equal('unsuccessfulTackles' in l.stats, false);
    }
    for (const l of kabaddiPlayerCounts(s).values()) assert.equal('touchedOut' in l, false);
  });
  test('no "Unsuccessful tackles" row in the match centre', () => {
    const def = kabaddiMatchStats(s).cats.find((c) => c.id === 'defending');
    assert.equal(def?.rows.some((r) => r.key === 'unsuccTkl'), false);
  });
  test('one raid names a touched defender → tracked on every line, as before', () => {
    const m = kbSkipped().raid({ side: 'home', raider: KH[0], touches: 1, touched: [KA[3]] });
    assert.equal(kabaddiTouchedTracked(m.s), true);
    const t = kabaddiTotals(m.s, KCTX);
    assert.equal(t.a4.stats.touchedOut, 1);
    assert.equal(t.a4.stats.unsuccessfulTackles, 1);
    assert.equal(t.a3.stats.touchedOut, 0);
  });
  test('switch OFF but a raid named one (older log) → still tracked', () => {
    const m = new Kb().raid({ side: 'home', raider: KH[0], touches: 1, touched: [KA[3]] });
    assert.equal(kabaddiTouchedTracked(m.s), true);
  });
});

/* ================================= netball ================================= */

const POS: Pos[] = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const NH = ['hgs', 'hga', 'hwa', 'hc', 'hwd', 'hgd', 'hgk'];
const NA = ['ags', 'aga', 'awa', 'ac', 'awd', 'agd', 'agk'];
const nroster = (sd: Side) => (sd === 'home' ? NH : NA);
let nu = 0;
function NA_(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<NetballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = nbCredits({ type: ev.type ?? 'timeout', ...ev } as NetballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `n${++nu}`, sec, period } };
  const a1 = nbAttr(cr.first), a2 = nbAttr(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const nxi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(POS.map((p, i) => [p, { id: nroster(team)[i], name: nroster(team)[i] }])) } });
const ngoal = (side: Side, sec: number, feeder?: string) =>
  NA_('GOAL', side, sec, 1, { type: 'goal', playerId: nroster(side)[0], playerName: nroster(side)[0], secondId: feeder, secondName: feeder }, { pos: 'GS' });
const nstat = (side: Side, sec: number, kind: 'intercept' | 'deflection' | 'turnover' | 'pickup', who: string, extra: Record<string, unknown> = {}) =>
  NA_('STAT', side, sec, 1, { type: 'stat', stat: kind, playerId: who, playerName: who }, { kind, ...(kind === 'pickup' ? { playerId: who, playerName: who } : {}), ...extra });
const ncpr = (side: Side, sec: number, who: string, pos: Pos) => NA_('CPR', side, sec, 1, {}, { playerId: who, playerName: who, pos });
const nrun = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(nbReducer, nbInit(cfg));
const NB_ALL = { trackCpr: true, trackGains: true, trackTurnovers: true, detail: true };
const nbSkipped = () => nrun([
  nxi('home'), nxi('away'), { type: 'FIRST_CENTRE', side: 'home' },
  ngoal('home', 30), ngoal('away', 60),
  nstat('home', 70, 'intercept', 'hgd'), nstat('away', 80, 'deflection', 'agk'),
], NB_ALL);
const nRow = (s: NetballState, key: string) => netballPanel(s).categories.flatMap((c) => c.rows).find((r) => r.key === key);

describe('NZC6–8 · netball: switched on, nothing captured → not tracked', () => {
  const s = nbSkipped();
  test('NZC6 centre pass receives: no key, no panel row', () => {
    assert.equal(cprOn(s, nbCoverage(s)), false);
    assert.equal(nbDeepKeys(s).includes('centrePassReceives'), false);
    for (const l of Object.values(netballTotals(s))) assert.equal('centrePassReceives' in l.stats, false);
    assert.equal(nRow(s, 'cpr'), undefined);
  });
  test('NZC7 gains & pick-ups: no pickups / deflection-outcome keys, no Pick-ups row', () => {
    assert.equal(nbCoverage(s).gains, false);
    for (const l of Object.values(netballTotals(s))) {
      for (const k of ['pickups', 'deflectionsGain', 'deflectionsNoGain', 'gains']) assert.equal(k in l.stats, false, k);
    }
    assert.equal(nRow(s, 'pickups'), undefined);
  });
  test('NZC8 feeds & rebounds: every feeder skipped → no Feeds / Goal assists rows', () => {
    assert.equal(nRow(s, 'feeds'), undefined);
    assert.equal(nRow(s, 'goalAssists'), undefined);
  });
  test('captured → tracked exactly as before', () => {
    const c = nbReducer(nbReducer(nbReducer(nbReducer(s, ncpr('away', 61, 'awa', 'WA')), nstat('home', 90, 'pickup', 'hwd')), ngoal('home', 100, 'hwa')), nstat('away', 110, 'deflection', 'agd', { gain: false }));
    const t = netballTotals(c);
    assert.equal(t.awa.stats.centrePassReceives, 1);
    assert.equal(t.hgs.stats.centrePassReceives, 0);
    assert.equal(t.hwd.stats.pickups, 1);
    assert.equal(t.agd.stats.deflectionsNoGain, 1);
    assert.equal(t.hgd.stats.gains, 1); // the intercept counts once gains are tracked
    assert.ok(nRow(c, 'cpr'));
    assert.ok(nRow(c, 'pickups'));
    assert.equal(nRow(c, 'feeds')?.home, '1');
  });
});

/* ================================= handball ================================= */

let hu = 0;
function HA(type: string, side: Side | undefined, sec: number, ev: Partial<HandballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = hbCredits({ type: ev.type ?? 'timeout', ...ev } as HandballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `h${++hu}`, sec, period: 1 } };
  const a1 = hbAttr(cr.first), a2 = hbAttr(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const hwho = (id: string) => ({ playerId: id, playerName: id });
const HROS = { home: ['hgk', 'h1', 'h2', 'h3'], away: ['agk', 'a1', 'a2', 'a3'] } as const;
const hxi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, gk: { id: HROS[team][0], name: HROS[team][0] }, players: HROS[team].map((id) => ({ id, name: id })) } });
const hgoal = (side: Side, sec: number, id: string, shotType = 'sixM') => HA('GOAL', side, sec, { type: 'goal', shotType: shotType as never, ...hwho(id) }, { shotType });
const hturn = (side: Side, sec: number, id: string, fault?: string) => HA('TURNOVER', side, sec, { type: 'turnover', ...hwho(id) }, fault ? { fault } : {});
const hdrawn = (side: Side, sec: number, id: string) => HA('DRAWN', side, sec, { type: 'drawn', ...hwho(id) });
const hrun = (acts: ScoreAction[], cfg: Record<string, unknown> = {}) => acts.reduce(hbReducer, hbInit(cfg));
const HB_ALL = { trackFaultTypes: true, trackSevenMDrawn: true };
const hbSkipped = () => hrun([hxi('home'), hxi('away'), hgoal('home', 30, 'h1'), hturn('away', 40, 'a2'), hgoal('away', 50, 'a1', 'sevenM')], HB_ALL);

describe('NZC9–10 · handball: switched on, nothing captured → not tracked', () => {
  const s = hbSkipped();
  test('NZC9 fault kinds: no tf* figures', () => {
    assert.equal(faultTypesTracked(s), false);
    for (const sd of ['home', 'away'] as const) assert.equal(Object.keys(handballDepthFigures(s, sd)).some((k) => k.startsWith('tf')), false);
  });
  test('NZC10 7 m won: no sevenMDrawn key; listed "not tracked"', () => {
    assert.equal(sevenMDrawnTracked(s), false);
    for (const l of Object.values(handballTotals(s))) assert.equal('sevenMDrawn' in l.stats, false);
    assert.deepEqual(handballUntracked(s), ['sevenMDrawn']);
  });
  test('captured → tracked exactly as before', () => {
    const c = hbReducer(hbReducer(s, hturn('home', 60, 'h2', 'steps')), hdrawn('home', 70, 'h3'));
    assert.equal(handballDepthFigures(c, 'home').tfSteps, 1);
    assert.equal(handballDepthFigures(c, 'away').tfSteps, 0);
    const t = handballTotals(c);
    assert.equal(t.h3.stats.sevenMDrawn, 1);
    assert.equal(t.a1.stats.sevenMDrawn, 0);
    assert.deepEqual(handballUntracked(c), []);
  });
});

/* ============================ 600-user simulation ============================ */

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

function simVolleyball(r: () => number) {
  // each scorer captures each kind with its own probability (0 = skips every prompt)
  const p = { dig: pick(r, [0, 0, 0.3]), assist: pick(r, [0, 0, 0.5]), aced: pick(r, [0, 0.6]), reception: pick(r, [0, 0.4]), inplay: pick(r, [0, 0.3]) };
  const n: Record<string, number> = { dig: 0, assist: 0, aced: 0, reception: 0, inplay: 0 };
  let s = vplay(vLineup, ALL_VB);
  for (let i = 0; i < 20 + Math.floor(r() * 30); i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const opp = other(side);
    if (r() < p.reception) { s = vb.reducer(s, vdet('reception', opp, pick(r, vroster(opp)), pick(r, ['perfect', 'good', 'poor']))); n.reception++; }
    if (r() < p.dig) { s = vb.reducer(s, vdet('dig', opp, pick(r, vroster(opp)))); n.dig++; }
    if (r() < p.inplay) { s = vb.reducer(s, vdet('inplay', side, pick(r, vroster(side)))); n.inplay++; }
    const kind = pick(r, ['attack', 'ace', 'block', 'opperror'] as const);
    s = vb.reducer(s, vb.outcomeAction(kind, side, pick(r, vroster(side))));
    if (kind === 'attack' && r() < p.assist) { s = vb.reducer(s, vdet('assist', side, pick(r, vroster(side)))); n.assist++; }
    if (kind === 'ace' && r() < p.aced) { s = vb.reducer(s, vdet('aced', opp, pick(r, vroster(opp)))); n.aced++; }
  }
  const t = volleyballStatTotals(s);
  const lines = Object.values(t);
  const sum = (k: string) => lines.reduce((a, l) => a + (l.stats[k] ?? 0), 0);
  const has = (k: string) => lines.some((l) => k in l.stats);
  const every = (k: string) => lines.every((l) => k in l.stats);
  // tracked ⇔ captured; when tracked, every line carries it and the sums are the captures
  for (const [kind, keys] of [['dig', VB_KEYS.dig], ['assist', VB_KEYS.assist], ['aced', VB_KEYS.aced]] as const) {
    for (const k of keys) assert.equal(has(k), n[kind] > 0, `${kind}:${k} ${JSON.stringify(n)}`);
    if (n[kind] > 0) for (const k of keys) assert.ok(every(k));
  }
  if (n.dig) assert.equal(sum('digs'), n.dig);
  if (n.assist) assert.equal(sum('setAssists'), n.assist);
  if (n.aced) assert.equal(sum('receptionErrors'), n.aced);
  // reception: graded receptions or aced receivers counted as receptions
  assert.equal(has('receptions'), n.reception + n.aced > 0);
  if (n.reception + n.aced > 0) assert.equal(sum('receptions'), n.reception + n.aced);
  // attack: only once an in-play / blocked swing was captured
  assert.equal(has('attackAttempts'), n.inplay > 0);
  // the panel follows the same rule
  assert.equal(!!vRow(s, 'defence', 'digs'), n.dig > 0);
  assert.equal(!!vRow(s, 'reception', 'acedNamed'), n.aced > 0);
  return n;
}

function simKabaddi(r: () => number) {
  const p = pick(r, [0, 0, 0.5]);
  const m = new Kb({ ...KCFG, trackTouched: true });
  let named = 0;
  for (let i = 0; i < 15 + Math.floor(r() * 20); i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const ros = side === 'home' ? KH : KA, opp = side === 'home' ? KA : KH;
    const touches = pick(r, [0, 0, 1, 1, 2]);
    const tackled = touches === 0 && r() < 0.4;
    const touched = touches > 0 && r() < p ? [pick(r, opp)] : undefined;
    const before = m.s;
    m.raid({ side, raider: pick(r, ros), touches, tackled, tackler: tackled ? pick(r, opp) : undefined, touched }, 3 + i, 1);
    if (touched && m.s !== before && (m.s.raids ?? []).at(-1)?.touched?.length) named++;
  }
  const t = kabaddiTotals(m.s, KCTX);
  const has = (k: string) => Object.values(t).some((l) => k in l.stats);
  assert.equal(kabaddiTouchedTracked(m.s), named > 0);
  assert.equal(has('touchedOut'), named > 0);
  assert.equal(has('unsuccessfulTackles'), named > 0);
  return named;
}

function simNetball(r: () => number) {
  const p = { cpr: pick(r, [0, 0, 0.5]), pickup: pick(r, [0, 0.2]), defl: pick(r, [0, 0.5]), feed: pick(r, [0, 0.7]) };
  const n = { cpr: 0, gains: 0, feeds: 0 };
  const acts: ScoreAction[] = [nxi('home'), nxi('away'), { type: 'FIRST_CENTRE', side: 'home' }];
  let sec = 1;
  for (let i = 0; i < 15 + Math.floor(r() * 25); i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const ros = nroster(side);
    if (r() < p.cpr) { acts.push(ncpr(side, sec++, ros[2], 'WA')); n.cpr++; }
    if (r() < 0.3) {
      const g = r() < p.defl;
      acts.push(nstat(side, sec++, 'deflection', ros[6], g ? { gain: r() < 0.5 } : {}));
      if (g) n.gains++;
    }
    if (r() < p.pickup) { acts.push(nstat(side, sec++, 'pickup', ros[4])); n.gains++; }
    if (r() < 0.2) acts.push(nstat(side, sec++, 'intercept', ros[5]));
    const f = r() < p.feed;
    acts.push(ngoal(side, sec++, f ? ros[2] : undefined));
    if (f) n.feeds++;
  }
  const s = nrun(acts, NB_ALL);
  const lines = Object.values(netballTotals(s));
  const has = (k: string) => lines.some((l) => k in l.stats);
  const sum = (k: string) => lines.reduce((a, l) => a + (l.stats[k] ?? 0), 0);
  assert.equal(has('centrePassReceives'), n.cpr > 0);
  if (n.cpr) assert.equal(sum('centrePassReceives'), n.cpr);
  for (const k of ['pickups', 'deflectionsGain', 'deflectionsNoGain', 'gains']) assert.equal(has(k), n.gains > 0, k);
  assert.equal(!!nRow(s, 'cpr'), n.cpr > 0);
  assert.equal(!!nRow(s, 'pickups'), n.gains > 0);
  assert.equal(!!nRow(s, 'feeds'), n.feeds > 0);
  return n;
}

function simHandball(r: () => number) {
  const p = { fault: pick(r, [0, 0, 0.5]), drawn: pick(r, [0, 0, 0.5]) };
  const n = { fault: 0, drawn: 0 };
  const acts: ScoreAction[] = [hxi('home'), hxi('away')];
  let sec = 10;
  for (let i = 0; i < 15 + Math.floor(r() * 20); i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const ros = HROS[side];
    const k = r();
    if (k < 0.5) acts.push(hgoal(side, sec, pick(r, ros.slice(1)), pick(r, ['sixM', 'nineM', 'wing'])));
    else if (k < 0.8) {
      const f = r() < p.fault;
      acts.push(hturn(side, sec, pick(r, ros.slice(1)), f ? pick(r, ['steps', 'double', 'area']) : undefined));
      if (f) n.fault++;
    } else {
      if (r() < p.drawn) { acts.push(hdrawn(side, sec, pick(r, ros.slice(1)))); n.drawn++; }
      acts.push(hgoal(side, sec + 1, pick(r, ros.slice(1)), 'sevenM'));
    }
    sec += 20;
  }
  const s: HandballState = hrun(acts, HB_ALL);
  assert.equal(faultTypesTracked(s), n.fault > 0);
  assert.equal(Object.keys(handballDepthFigures(s, pick(r, ['home', 'away'] as const))).some((x) => x.startsWith('tf')), n.fault > 0);
  const lines = Object.values(handballTotals(s));
  assert.equal(lines.some((l) => 'sevenMDrawn' in l.stats), n.drawn > 0);
  if (n.drawn) assert.equal(lines.reduce((a, l) => a + (l.stats.sevenMDrawn ?? 0), 0), n.drawn);
  return n;
}

describe('600-user simulation · court-team: no stat key or rate without a capture', () => {
  test('600 scorers × 4 sports, every toggle on, random (often zero) capture', () => {
    const seen = { vbZero: 0, vbSome: 0, kbZero: 0, kbSome: 0, nbZero: 0, nbSome: 0, hbZero: 0, hbSome: 0 };
    for (let u = 0; u < 600; u++) {
      const r = rng(9000 + u);
      const v = simVolleyball(r);
      if (v.dig) seen.vbSome++; else seen.vbZero++;
      if (simKabaddi(r)) seen.kbSome++; else seen.kbZero++;
      const nb = simNetball(r);
      if (nb.cpr) seen.nbSome++; else seen.nbZero++;
      const hb = simHandball(r);
      if (hb.drawn) seen.hbSome++; else seen.hbZero++;
    }
    // both branches actually exercised in every sport
    for (const [k, v] of Object.entries(seen)) assert.ok(v > 50, `${k}=${v}`);
  });
});
