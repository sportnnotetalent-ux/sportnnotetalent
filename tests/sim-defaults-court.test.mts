/**
 * Court sports, batch 3 — seeded simulation (quality mandate step 6;
 * breaks: docs/security/breaks/defaults-court.md).
 *
 * Per sport, random matches played the way the controls play them (a capture
 * is offered only when the match tracks it, and skipped at random):
 *  - OLD matches (a stored format without the keys, a bare preset, or the
 *    format an older new-match form wrote with the switch off): the replayed
 *    states and their stats are fingerprinted, and the fingerprint is the one
 *    recorded on the code BEFORE this batch (DC8 — replay exactly as before);
 *    no capture is on and no new key appears (DC9 — no false zeros).
 *  - NEW matches (a format seeded by the new-match form): the capture is on,
 *    its stats are real, and skipping it never changes the score (DC10).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { FormatField, ScoreAction } from '../src/sports/types.ts';
import { BASKETBALL_META } from '../src/sports/basketball/meta.ts';
import * as bb from '../src/sports/basketball/engine.ts';
import { scoreAction, missAction, freeThrowAction } from '../src/sports/basketball/actions.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { VOLLEYBALL_META } from '../src/sports/volleyball/meta.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { catOn } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { NETBALL_META } from '../src/sports/netball/meta.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
import { HANDBALL_META } from '../src/sports/handball/meta.ts';
import * as hb from '../src/sports/handball/engine.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { handballDepthFigures } from '../src/sports/handball/depth.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const ids = (side: Side, n: number) => Array.from({ length: n }, (_, i) => `${side[0]}${i + 1}`);
const P = (id: string) => ({ id, fullName: id.toUpperCase() });
const defaultsFor = (fields: readonly FormatField[]): Record<string, unknown> => {
  const preset = fields.find((f) => f.type === 'preset');
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f.default]));
  const chosen = preset?.options?.find((o) => o.value === preset.default);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};
const hex = (h: ReturnType<typeof createHash>, k: string) => { const d = h.digest('hex'); if (process.env.RECORD) console.log('FP', k, d); return d; };
const fp = (h: ReturnType<typeof createHash>, x: unknown) => h.update(JSON.stringify(x) + '\n');

/** The fingerprints of the OLD matches, recorded on the code before this batch (704330b). */
const BEFORE = {
  basketball: '6031ecc8fc84e0b58ff06ed80adf3a570f5ae242f147188d1bbf2666a21215dc',
  volleyball: 'cc7d51358149412e226c073f1f9b720fc8f401c43af9c68725ab00498e89aebe',
  // no-false-zeros NZC6: the old International matches here have trackCpr on
  // and log no centre pass receive — centrePassReceives 0 is no longer written.
  // Was 'f3028c39219e4b522f9d3125bcba9265a23882a30a5298ddb06e16489093fb7c'.
  netball: '82be5194b5ca63780acfc97363f04e99211d82c274241b5362cceb85a3475ba8',
  handball: 'c5c5bc5624d415eb12d49c1e8b99b730c2cd747668bc857c06abaf986c99f06c',
};
const N = 130; // per sport and per kind (old / new): 1,040 matches in all

/* --------------------------------- basketball -------------------------------- */

const BB_OLD = [{ preset: 'fiba' }, {}, { preset: 'fiba', regPeriods: 4, periodMinutes: 10, trackMisses: false, trackZones: false }, { preset: 'nba', trackMisses: false }];
function bbGame(cfg: Record<string, unknown>) {
  let s = bb.reducer(bb.init(cfg), { type: 'KICKOFF', payload: { at: 1 } });
  let made = 0, missed = 0;
  for (let i = 0; i < 30 && !s.ended; i++) {
    const side = SIDES[rnd(2)];
    const p = P(ids(side, 5)[rnd(5)]);
    const r = rnd(10);
    const tracking = s.trackMisses === true; // the controls: Miss buttons and `fga` only when tracking
    if (r < 5) { s = bb.reducer(s, scoreAction(side, 2 + rnd(2), p, { fga: tracking })); made++; }
    else if (r < 8 && tracking) { s = bb.reducer(s, missAction(side, 2 + rnd(2), p)); missed++; }
    else s = bb.reducer(s, freeThrowAction(side, rnd(2) === 0, p));
  }
  return { s, made, missed };
}

test(`basketball: ${N} old + ${N} new matches — old replay unchanged, new ones track misses (FG% real)`, () => {
  seed = 20261103; // each sport from the same seed: the old phase never depends on the new
  const h = createHash('sha256');
  for (let m = 0; m < N; m++) {
    const cfg = BB_OLD[rnd(BB_OLD.length)];
    const { s, missed } = bbGame(cfg);
    assert.notEqual(s.trackMisses, true, 'DC8: nothing switched on');
    assert.equal(missed, 0);
    const t = basketballStatTotals(s);
    for (const l of Object.values(t)) assert.equal('fgAtt' in l.stats, false, 'DC9: no FGA key');
    fp(h, { s, t });
  }
  assert.equal(hex(h, 'basketball'), BEFORE.basketball, 'DC8: old matches replay exactly as before');
  const fresh = defaultsFor(BASKETBALL_META.formatFields ?? []);
  for (let m = 0; m < N; m++) {
    const { s, made, missed } = bbGame(fresh);
    assert.equal(s.trackMisses, true);
    const t = basketballStatTotals(s);
    let att = 0, fgm = 0;
    for (const l of Object.values(t)) { att += l.stats.fgAtt ?? 0; fgm += l.stats.fgMade ?? 0; assert.ok((l.stats.fgAtt ?? 0) >= (l.stats.fgMade ?? 0)); }
    assert.equal(fgm, made);
    assert.equal(att, made + missed);
  }
});

/* --------------------------------- volleyball -------------------------------- */

const VB_OLD = [{}, { preset: 'indoor' }, { preset: 'indoor', setsToWin: 3, vbAttack: false, vbReception: false, vbDig: false, vbAssist: false }, { setsToWin: 2, pointsPerSet: 21, vbAssist: false }];
const VB_KINDS = ['attack', 'attack', 'attack', 'ace', 'block', 'opperror', 'serveerror'] as const;
const vbLineup = (): ScoreAction[] => SIDES.map((team) => ({ type: 'LINEUP', payload: { team, players: ids(team, 6).map((id) => ({ id, name: id.toUpperCase() })) } }));
function vbGame(cfg: Record<string, unknown>) {
  let s = vbLineup().reduce(vb.reducer, vb.init(cfg));
  let plain = vbLineup().reduce(vb.reducer, vb.init(cfg));
  let assists = 0;
  for (let i = 0; i < 70 && !s.ended; i++) {
    const side = SIDES[rnd(2)];
    const kind = VB_KINDS[rnd(VB_KINDS.length)];
    const a = vb.outcomeAction(kind, side, P(ids(side, 6)[rnd(6)]));
    s = vb.reducer(s, a); plain = vb.reducer(plain, a);
    // "Set by?" — a non-blocking row after a kill, only when tracked; often skipped
    if (kind === 'attack' && catOn(s, 'assist') && rnd(3) > 0) {
      s = vb.reducer(s, { type: 'VB_DETAIL', side, payload: { kind: 'assist', player: { playerId: ids(side, 6)[rnd(6)] } } });
      assists++;
    }
  }
  return { s, plain, assists };
}

test(`volleyball: ${N} old + ${N} new matches — old replay unchanged, new ones ask "Set by?" (optional)`, () => {
  seed = 20261103; // each sport from the same seed: the old phase never depends on the new
  const h = createHash('sha256');
  for (let m = 0; m < N; m++) {
    const { s, assists } = vbGame(VB_OLD[rnd(VB_OLD.length)]);
    assert.equal('detail' in s, false, 'DC8: nothing switched on');
    assert.equal(assists, 0);
    const t = volleyballStatTotals(s);
    for (const l of Object.values(t)) assert.equal('setAssists' in l.stats, false, 'DC9');
    fp(h, { s, t });
  }
  assert.equal(hex(h, 'volleyball'), BEFORE.volleyball, 'DC8: old matches replay exactly as before');
  const fresh = defaultsFor(VOLLEYBALL_META.formatFields ?? []);
  for (let m = 0; m < N; m++) {
    const { s, plain, assists } = vbGame(fresh);
    assert.equal(catOn(vb.init(fresh), 'assist'), true);
    assert.deepEqual([s.current, s.setsWon, s.sets, s.ended], [plain.current, plain.setsWon, plain.sets, plain.ended], 'DC10: the setter never moves the score');
    const t = volleyballStatTotals(s);
    let sum = 0;
    for (const l of Object.values(t)) { sum += l.stats.setAssists ?? 0; assert.equal('attackAttempts' in l.stats, false); }
    assert.equal(sum, assists);
  }
});

/* ---------------------------------- netball ---------------------------------- */

const NB_POS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const NB_OLD = [
  { preset: 'international', periods: 4, periodMinutes: 15, trackCpr: true, detail: false },
  { preset: 'international', periods: 4, periodMinutes: 15 },
  { preset: 'school', periods: 4, periodMinutes: 10, trackCpr: false, detail: false },
  {},
];
let nu = 0;
function nbAct(type: string, side: Side, ev: Record<string, unknown>, payload: Record<string, unknown>): ScoreAction {
  const cr = nb.eventCredits({ type: ev.type, ...ev } as nb.NetballEvent);
  const a: ScoreAction = { type, side, payload: { ...payload, uid: `n${++nu}`, sec: nu, period: 1 } };
  const a1 = nb.creditAttribution(cr.first), a2 = nb.creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
function nbGame(cfg: Record<string, unknown>) {
  nu = 0;
  const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(NB_POS.map((p, i) => [p, { id: ids(team, 7)[i] }])) } });
  let s = [xi('home'), xi('away'), { type: 'FIRST_CENTRE', side: 'home' } as ScoreAction].reduce(nb.reducer, nb.init(cfg));
  let feeds = 0, goals = 0;
  for (let i = 0; i < 40; i++) {
    const side = SIDES[rnd(2)];
    const pos = rnd(2) === 0 ? 'GS' : 'GA';
    const shooter = ids(side, 7)[pos === 'GS' ? 0 : 1];
    // the feed step only when tracked, with its Skip
    const feeder = s.detail && rnd(3) > 0 ? ids(side, 7)[2 + rnd(2)] : undefined;
    if (feeder) feeds++;
    if (rnd(3) > 0) { s = nb.reducer(s, nbAct('GOAL', side, { type: 'goal', playerId: shooter, secondId: feeder }, { pos })); goals++; }
    else {
      const miss = nbAct('MISS', side, { type: 'miss', playerId: shooter, secondId: feeder }, { pos });
      s = nb.reducer(s, miss);
      if (s.detail && rnd(2) === 0) s = nb.reducer(s, nbAct('STAT', side, { type: 'stat', stat: 'rebound', playerId: ids(side, 7)[0] }, { kind: 'rebound', ref: miss.payload!.uid }));
    }
  }
  return { s, feeds, goals };
}

test(`netball: ${N} old + ${N} new matches — old replay unchanged, new International ones ask feeds & rebounds`, () => {
  seed = 20261103; // each sport from the same seed: the old phase never depends on the new
  const h = createHash('sha256');
  for (let m = 0; m < N; m++) {
    const { s, feeds } = nbGame(NB_OLD[rnd(NB_OLD.length)]);
    assert.equal(s.detail, false, 'DC8');
    assert.equal(feeds, 0);
    const t = netballTotals(s);
    for (const l of Object.values(t)) { assert.equal('feeds' in l.stats, false, 'DC9'); assert.equal('goalAssists' in l.stats, false); }
    fp(h, { s, t });
  }
  assert.equal(hex(h, 'netball'), BEFORE.netball, 'DC8: old matches replay exactly as before');
  const fresh = defaultsFor(NETBALL_META.formatFields ?? []);
  for (let m = 0; m < N; m++) {
    const { s, feeds, goals } = nbGame(fresh);
    assert.equal(s.detail, true);
    assert.equal(s.trackCpr, true);
    assert.equal(s.home + s.away, goals, 'DC10: feeds never move the score');
    const t = netballTotals(s);
    assert.equal(Object.values(t).reduce((n, l) => n + (l.stats.feeds ?? 0), 0), feeds);
  }
});

/* ---------------------------------- handball --------------------------------- */

const HB_OLD = [
  { preset: 'senior', playersPerSide: 7, periodMinutes: 30, stopClock: true, trackFaultTypes: false, trackSevenMDrawn: false },
  { preset: 'senior', playersPerSide: 7, periodMinutes: 30 },
  { preset: 'youth20', periodMinutes: 20, trackFaultTypes: false },
  {},
];
let hu = 0;
function hbAct(type: string, side: Side, ev: Record<string, unknown>, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = hb.eventCredits({ type: ev.type, ...ev } as hb.HandballEvent);
  const a: ScoreAction = { type, side, payload: { ...payload, uid: `h${++hu}`, sec: hu * 10, period: 1 } };
  const a1 = hb.creditAttribution(cr.first), a2 = hb.creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
function hbGame(cfg: Record<string, unknown>) {
  hu = 0;
  const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, gk: { id: `${team[0]}gk` }, players: [`${team[0]}gk`, ...ids(team, 6)].map((id) => ({ id })) } });
  let s = [xi('home'), xi('away')].reduce(hb.reducer, hb.init(cfg));
  let plain = s;
  let faults = 0, drawn = 0;
  const both = (a: ScoreAction, extra?: ScoreAction) => { s = hb.reducer(s, a); plain = hb.reducer(plain, extra ?? a); };
  for (let i = 0; i < 50; i++) {
    const side = SIDES[rnd(2)];
    const p = ids(side, 6)[rnd(6)];
    const r = rnd(10);
    if (r < 4) both(hbAct('GOAL', side, { type: 'goal', playerId: p, shotType: 'nineM' }, { shotType: 'nineM' }));
    else if (r < 6) {
      // the chip: a fault type only when tracked, picked at random (no extra tap)
      const fault = s.track?.faultTypes && rnd(2) === 0 ? hb.FAULT_TYPES[rnd(hb.FAULT_TYPES.length)] : undefined;
      if (fault) faults++;
      const a = hbAct('TURNOVER', side, { type: 'turnover', playerId: p }, fault ? { fault } : {});
      both(a, { ...a, payload: { ...a.payload, fault: undefined } });
    } else if (r < 8) {
      // a 7 m: "won by" is a chip on the result screen when tracked; its DRAWN goes first
      if (s.track?.sevenMDrawn && rnd(2) === 0) { s = hb.reducer(s, hbAct('DRAWN', side, { type: 'drawn', playerId: ids(side, 6)[rnd(6)] })); drawn++; }
      if (rnd(2) === 0) both(hbAct('GOAL', side, { type: 'goal', playerId: p, shotType: 'sevenM' }, { shotType: 'sevenM' }));
      else both(hbAct('MISS', side, { type: 'miss', playerId: p, shotType: 'sevenM' }, { shotType: 'sevenM', result: 'missed' }));
    } else both(hbAct('MISS', side, { type: 'miss', playerId: p, shotType: 'sixM' }, { shotType: 'sixM', result: 'missed' }));
  }
  return { s, plain, faults, drawn };
}

test(`handball: ${N} old + ${N} new matches — old replay unchanged, new ones track fault types and 7 m won by`, () => {
  seed = 20261103; // each sport from the same seed: the old phase never depends on the new
  const h = createHash('sha256');
  for (let m = 0; m < N; m++) {
    const { s, faults, drawn } = hbGame(HB_OLD[rnd(HB_OLD.length)]);
    assert.equal('track' in s, false, 'DC8');
    assert.equal(faults + drawn, 0);
    const t = handballTotals(s);
    const fig = handballDepthFigures(s, 'home');
    assert.equal(Object.keys(fig).some((k) => /^fault/i.test(k) || /Faults?$/.test(k)), false, 'DC9: no fault-type keys');
    fp(h, { s, t, fig });
  }
  assert.equal(hex(h, 'handball'), BEFORE.handball, 'DC8: old matches replay exactly as before');
  const fresh = defaultsFor(HANDBALL_META.formatFields ?? []);
  for (let m = 0; m < N; m++) {
    const { s, plain, faults, drawn } = hbGame(fresh);
    assert.deepEqual(s.track, { faultTypes: true, sevenMDrawn: true });
    assert.deepEqual([s.home, s.away], [plain.home, plain.away], 'DC10: the chips never move the score');
    assert.equal(s.events.filter((e) => e.type === 'turnover' && e.fault).length, faults);
    assert.equal(s.events.filter((e) => e.type === 'drawn').length, drawn);
    // DC14: every DRAWN sits right before its 7 m throw
    s.events.forEach((e, i) => { if (e.type === 'drawn') assert.equal(s.events[i + 1]?.shotType, 'sevenM'); });
  }
});
