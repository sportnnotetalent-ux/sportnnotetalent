/**
 * Wave 4 polish for the invasion codes (docs/security/breaks/polish-invasion.md PI1–PI21):
 *  1. Ice hockey faceoff zones: the faceoff logs at the winner tap; the zone is
 *     attached after (FO_ZONE, ref = the faceoff) on a non-blocking DescribeCard,
 *     crediting exactly what the old one-step TALLY-with-zone did. Zones ON by
 *     default for new matches.
 *  2. NZI15: a correction that deletes the only event of a kind in a completed
 *     hockey / ice hockey / union / league match clears that key on the line.
 *  3. Football goal re-entry from the timeline keeps the assist and the detail.
 * Plus a 600-scorer simulation of all three.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreAction } from '../src/sports/types.ts';
import * as ice from '../src/sports/ice_hockey/engine.ts';
import * as icMeta from '../src/sports/ice_hockey/meta.ts';
import * as iceTotals from '../src/sports/ice_hockey/totals.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import * as hkTotals from '../src/sports/hockey/totals.ts';
import * as rugby from '../src/sports/rugby/engine.ts';
import * as ruTotals from '../src/sports/rugby/totals.ts';
import * as league from '../src/sports/rugby_league/engine.ts';
import * as rlTotals from '../src/sports/rugby_league/totals.ts';
import * as football from '../src/sports/football/engine.ts';
import * as fbActions from '../src/sports/football/actions.ts';
import { footballStatTotals } from '../src/sports/football/totals.ts';
import * as statSync from '../src/data/statSync.ts';
import { applyStatWrites, planStatSync, type ExistingStatLine, type MatchTotals } from '../src/data/statSync.ts';
import { assertContract, liveSums, normalize, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { FormatField } from '../src/sports/types.ts';

/** What the new-match forms stamp (as tests/defaults-on-invasion.test.mts mirrors FormatEditor `defaultsFor`). */
const newMatch = (fields: readonly FormatField[]) => {
  const preset = fields.find((f) => f.type === 'preset');
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f.default]));
  Object.assign(out, preset?.options?.find((o) => o.value === preset.default)?.set ?? {});
  return out;
};

const ROOT = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** a small deterministic PRNG (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
}

/* =============================== 1. ice hockey =============================== */

const foZoneAction = (ice as unknown as { foZoneAction?: (s: ice.IceHockeyState, ref: string, zone: ice.FoZone | null, tracked?: string[]) => ScoreAction | null }).foZoneAction;
const ZONES = { trackFaceoffs: true, trackFaceoffZones: true };
const HOME = ['h1', 'h2', 'h3', 'h4', 'h5', 'hg'];
const AWAY = ['a1', 'a2', 'a3', 'a4', 'a5', 'ag'];
const iceXi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id })), gk: { id: team === 'home' ? 'hg' : 'ag' } } });

/** a faceoff won by `side` as the controls fire it (the old one-step flow when `zone` is given) */
function fo(uid: string, side: Side, who?: string, loser?: string, zone?: ice.FoZone, sec = 10): ScoreAction {
  const ev = { type: 'tally' as const, side, tally: 'faceoff' as const, playerId: who, ...(loser ? { secondId: loser } : {}), ...(zone ? { zone } : {}) };
  const cr = ice.eventCredits(ev);
  const a1 = ice.creditAttribution(cr.first), a2 = ice.creditAttribution(cr.second);
  return { type: 'TALLY', side, payload: { kind: 'faceoff', ...(zone ? { zone } : {}), uid, sec, period: 1 }, ...(a1 ? { attribution: a1 } : {}), ...(a2 ? { attribution2: a2 } : {}) };
}
function hit(uid: string, side: Side, who?: string, sec = 10): ScoreAction {
  const cr = ice.eventCredits({ type: 'tally', side, tally: 'hit', playerId: who });
  const a1 = ice.creditAttribution(cr.first);
  return { type: 'TALLY', side, payload: { kind: 'hit', uid, sec, period: 1 }, ...(a1 ? { attribution: a1 } : {}) };
}
const iceRun = (as: ScoreAction[], cfg: Record<string, unknown> = ZONES) => as.reduce(ice.reducer, ice.init(cfg));
/** dispatch the next action built from the state so far (as the controls do) */
const then = (s: ice.IceHockeyState, a: ScoreAction | null, log: ScoreAction[]) => { if (a) { log.push(a); return ice.reducer(s, a); } return s; };
const stripTracked = (a: ScoreAction): ScoreAction => {
  const strip = (x?: ScoreAction['attribution']) => { if (!x) return x; const { tracked: _t, ...r } = x; return r; };
  return { ...a, ...(a.attribution ? { attribution: strip(a.attribution) } : {}), ...(a.attribution2 ? { attribution2: strip(a.attribution2) } : {}) };
};
const ICE_SPORT: TotalsSport<ice.IceHockeyState> = {
  name: 'ice hockey zones later', init: ice.init, reducer: ice.reducer, statTotals: iceTotals.iceHockeyTotals, config: ZONES,
  derived: [...iceTotals.DERIVED_KEYS], signed: ['plusMinus'],
};

describe('PI1–PI11 · ice hockey faceoff zone attached after', () => {
  test('PI2: the FO_ZONE builder exists and credits winner OZ + loser DZ (the mirror)', () => {
    assert.equal(typeof foZoneAction, 'function');
    const log: ScoreAction[] = [iceXi('home'), iceXi('away'), fo('f1', 'home', 'h4', 'a4')];
    const s = iceRun(log);
    const a = foZoneAction!(s, 'f1', 'oz')!;
    assert.equal(a.type, 'FO_ZONE');
    assert.equal(a.side, 'home');
    assert.deepEqual(a.payload, { ref: 'f1', zone: 'oz' });
    assert.deepEqual([a.attribution?.playerId, a.attribution?.stat, a.attribution?.by], ['h4', 'faceoffWinsOz', 1]);
    assert.deepEqual([a.attribution2?.playerId, a.attribution2?.stat, a.attribution2?.by, a.attribution2?.side], ['a4', 'faceoffLossesDz', 1, 'away']);
  });
  test('PI2/PI3: winner tap + zone later = the old one-step faceoff (events, totals, live sums)', () => {
    const base = [iceXi('home'), iceXi('away')];
    const old = [...base, fo('f1', 'away', 'a4', 'h3', 'dz'), hit('x1', 'home', 'h2')];
    const log: ScoreAction[] = [...base];
    let s = iceRun(log);
    s = then(s, fo('f1', 'away', 'a4', 'h3'), log);
    s = then(s, hit('x1', 'home', 'h2'), log);
    s = then(s, foZoneAction!(s, 'f1', 'dz'), log);
    const o = iceRun(old);
    assert.deepEqual(s.events, o.events);
    assert.deepEqual(iceTotals.iceHockeyTotals(s), iceTotals.iceHockeyTotals(o));
    assert.deepEqual(normalizeSums(liveSums(toRecords(log.map(stripTracked)))), normalizeSums(liveSums(toRecords(old))));
  });
  test('PI3: an old one-step log replays exactly as before (TALLY still reads its zone)', () => {
    const old = [iceXi('home'), iceXi('away'), fo('f1', 'home', 'h4', 'a4', 'oz'), fo('f2', 'away', 'a4', 'h4', 'nz')];
    const s = iceRun(old);
    assert.deepEqual(s.events.map((e) => e.zone), ['oz', 'nz']);
    assert.equal(iceTotals.iceHockeyTotals(s).h4.stats.faceoffWinsOz, 1);
    assert.equal(iceTotals.iceHockeyTotals(s).h4.stats.faceoffLossesNz, 1);
  });
  test('PI4: hostile / stray zone steps do nothing', () => {
    const log = [iceXi('home'), iceXi('away'), fo('f1', 'home', 'h4', 'a4'), hit('x1', 'home', 'h2')];
    const s = iceRun(log);
    assert.equal(foZoneAction!(s, 'x1', 'oz'), null, 'a hit');
    assert.equal(foZoneAction!(s, 'nope', 'oz'), null, 'no such faceoff');
    assert.equal(foZoneAction!(s, 'f1', 'zz' as ice.FoZone), null, 'junk zone');
    assert.equal(foZoneAction!(s, 'f1', null), null, 'clearing a zone that is not there');
    for (const forged of [
      { type: 'FO_ZONE', side: 'away', payload: { ref: 'f1', zone: 'oz' } },
      { type: 'FO_ZONE', side: 'home', payload: { ref: 'x1', zone: 'oz' } },
      { type: 'FO_ZONE', side: 'home', payload: { ref: 'f1', zone: 'xx' } },
      { type: 'FO_ZONE', side: 'home', payload: { zone: 'oz' } },
      { type: 'FO_ZONE', side: 'home', payload: { ref: 'f1', zone: { oz: 1 } } },
    ] as ScoreAction[]) assert.deepEqual(ice.reducer(s, forged), s, JSON.stringify(forged));
  });
  test('PI5: change the zone (OZ → DZ), clear it; credits are the difference', () => {
    const log: ScoreAction[] = [iceXi('home'), iceXi('away')];
    let s = iceRun(log);
    s = then(s, fo('f1', 'home', 'h4', 'a4'), log);
    s = then(s, foZoneAction!(s, 'f1', 'oz'), log);
    const ch = foZoneAction!(s, 'f1', 'dz')!;
    const h = [ch.attribution, ch.attribution2].find((x) => x?.playerId === 'h4')!;
    assert.deepEqual({ [h.stat]: h.by, ...h.extra }, { faceoffWinsOz: -1, faceoffWinsDz: 1 });
    s = then(s, ch, log);
    assert.equal(s.events.at(-1)!.zone, 'dz');
    assert.equal(foZoneAction!(s, 'f1', 'dz'), null, 'same zone again: no step');
    s = then(s, foZoneAction!(s, 'f1', null), log);
    assert.equal('zone' in s.events.at(-1)!, false);
    const t = normalize(iceTotals.iceHockeyTotals(s));
    assert.deepEqual(t.h4.stats, { faceoffWins: 1 });
    assert.deepEqual(t.a4.stats, { faceoffLosses: 1 });
    assertContract(ICE_SPORT, toRecords(log));
  });
  test('PI6: removing a zoned faceoff reverses its zone keys too', () => {
    const log: ScoreAction[] = [iceXi('home'), iceXi('away')];
    let s = iceRun(log);
    s = then(s, fo('f1', 'home', 'h4', 'a4'), log);
    s = then(s, foZoneAction!(s, 'f1', 'nz'), log);
    const e = s.events.find((x) => x.id === 'f1')!;
    const cr = ice.eventCredits(e);
    s = then(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: 'f1' }, attribution: ice.creditAttribution(cr.first, -1), attribution2: ice.creditAttribution(cr.second, -1) }, log);
    const sums = normalizeSums(liveSums(toRecords(log)));
    assert.deepEqual(sums, {});
  });
  test('PI7: the zone of the last faceoff is accepted after the final horn', () => {
    const log: ScoreAction[] = [iceXi('home'), iceXi('away')];
    let s = iceRun(log);
    s = then(s, fo('f1', 'home', 'h4', 'a4'), log);
    s = then(s, { type: 'END', payload: { at: 0 } }, log);
    assert.equal(s.ended, true);
    s = then(s, foZoneAction!(s, 'f1', 'oz'), log);
    assert.equal(s.events.find((e) => e.id === 'f1')!.zone, 'oz');
  });
  test('PI8: no zone attached → no zone keys; the zone step stamps the zone keys as tracked', () => {
    const s = iceRun([iceXi('home'), iceXi('away'), fo('f1', 'home', 'h4', 'a4')]);
    assert.ok(!Object.keys(iceTotals.iceHockeyTotals(s).h4.stats).some((k) => /Oz|Nz|Dz$/.test(k)));
    // as the controls build it: tracked = the keys with the patched faceoff counted
    const patched = (ice as unknown as { foZonePatch: (e: ice.IceEvent, z: unknown) => ice.IceEvent | null }).foZonePatch(s.events.at(-1)!, 'oz')!;
    const a = foZoneAction!(s, 'f1', 'oz', ice.iceTrackedKeys(s, patched))!;
    for (const k of ice.FO_ZONE_KEYS) assert.ok(a.attribution?.tracked?.includes(k), k);
  });
  test('PI1/PI10/PI11: the controls — no zone panel; a DescribeCard keyed by the faceoff; Undo names the step', () => {
    const ui = src('src/sports/ice_hockey/index.tsx');
    assert.doesNotMatch(ui, /mode: 'foZone'/);
    assert.match(ui, /const foMarks = useDescribeMarks<string>\(\)/);
    assert.match(ui, /<DescribeCard title=\{`Last faceoff/);
    assert.match(ui, /foZoneAction\(/);
    assert.match(ui, /step\.type === 'FO_ZONE'/);
    assert.match(ui, /'faceoff zone'/);
  });
  test('PI9: zones ON for a new match (one constant), OFF fallback for a saved one', () => {
    assert.equal(icMeta.ICE_HOCKEY_STATS_DEFAULTS.trackFaceoffZones, true);
    assert.equal(ice.ICE_HOCKEY_LIVE_SETTINGS.defaults?.trackFaceoffZones, true);
    assert.equal(ice.init(newMatch(icMeta.ICE_HOCKEY_META.formatFields!)).trackFaceoffZones, true);
    assert.equal('trackFaceoffZones' in ice.init({}), false);
    assert.equal('trackFaceoffZones' in ice.init({ trackFaceoffs: true }), false);
  });
});

/** live sums with zeros (and empty players) dropped */
function normalizeSums(x: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const id of Object.keys(x).sort()) {
    const st = Object.fromEntries(Object.entries(x[id]).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b)));
    if (Object.keys(st).length) out[id] = st;
  }
  return out;
}

/* ================================= 2. NZI15 ================================= */

type Gen = { name: string; keys: () => readonly string[] | undefined; totals: (as: ScoreAction[]) => MatchTotals; kinds: Record<string, (side: Side, who: string) => ScoreAction> };
const P = { home: ['h1', 'h2', 'h3', 'h4'], away: ['a1', 'a2', 'a3', 'a4'] };
const withCr = <C extends { first?: { playerId: string; stats: Record<string, number> }; second?: { playerId: string; stats: Record<string, number> } }>(a: ScoreAction, cr: C, attr: (c: C['first'], sign?: number) => ScoreAction['attribution']): ScoreAction => {
  const a1 = attr(cr.first), a2 = attr(cr.second);
  return { ...a, ...(a1 ? { attribution: a1 } : {}), ...(a2 ? { attribution2: a2 } : {}) };
};
let nu = 0;
const id = () => `u${++nu}`;
const GENS: Gen[] = [
  {
    name: 'hockey', keys: () => (hkTotals as Record<string, unknown>).STAT_TOTALS_KEYS as string[] | undefined,
    totals: (as) => hkTotals.hockeyTotals(as.reduce(hockey.reducer, hockey.init({}))),
    kinds: {
      pcGoal: (side, who) => withCr({ type: 'GOAL', side, payload: { goalType: 'pc', uid: id(), sec: 60 } }, hockey.eventCredits({ type: 'goal', goalType: 'pc', playerId: who }), hockey.creditAttribution),
      fieldGoal: (side, who) => withCr({ type: 'GOAL', side, payload: { goalType: 'field', uid: id(), sec: 60 } }, hockey.eventCredits({ type: 'goal', goalType: 'field', playerId: who }), hockey.creditAttribution),
      save: (side, who) => withCr({ type: 'SAVE', side, payload: { uid: id(), sec: 60 } }, hockey.eventCredits({ type: 'save', playerId: who }), hockey.creditAttribution),
      green: (side, who) => withCr({ type: 'CARD', side, payload: { card: 'green', uid: id(), sec: 60 } }, hockey.eventCredits({ type: 'card', card: 'green', playerId: who }), hockey.creditAttribution),
      shot: (side, who) => withCr({ type: 'SHOT', side, payload: { onGoal: false, uid: id(), sec: 60 } }, hockey.eventCredits({ type: 'shot', onGoal: false, playerId: who }), hockey.creditAttribution),
    },
  },
  {
    name: 'ice hockey', keys: () => (iceTotals as Record<string, unknown>).STAT_TOTALS_KEYS as string[] | undefined,
    totals: (as) => iceTotals.iceHockeyTotals(as.reduce(ice.reducer, ice.init({ trackFaceoffs: true, trackPhysical: true, trackPuck: true, trackAttempts: true, trackFaceoffZones: true }))),
    kinds: {
      hit: (side, who) => hit(id(), side, who),
      faceoff: (side, who) => fo(id(), side, who, P[opp(side)][0], 'oz'),
      giveaway: (side, who) => withCr({ type: 'TALLY', side, payload: { kind: 'giveaway', uid: id(), sec: 30 } }, ice.eventCredits({ type: 'tally', side, tally: 'giveaway', playerId: who }), ice.creditAttribution),
      ppGoal: (side, who) => withCr({ type: 'GOAL', side, payload: { strength: 'pp', uid: id(), sec: 30 } }, ice.eventCredits({ type: 'goal', side, strength: 'pp', playerId: who }), ice.creditAttribution),
    },
  },
  {
    name: 'rugby union', keys: () => (ruTotals as Record<string, unknown>).STAT_TOTALS_KEYS as string[] | undefined,
    totals: (as) => ruTotals.rugbyTotals(as.reduce(rugby.reducer, rugby.init({ trackPenalties: true, trackTurnovers: true, trackOffloads: true, trackDetail: true }))),
    kinds: {
      tackle: (side, who) => withCr({ type: 'DETAIL', side, payload: { detail: 'tackle', uid: id() } }, rugby.eventCredits({ type: 'detail', detail: 'tackle', playerId: who }), rugby.creditAttribution),
      carry: (side, who) => withCr({ type: 'DETAIL', side, payload: { detail: 'carry', uid: id() } }, rugby.eventCredits({ type: 'detail', detail: 'carry', playerId: who }), rugby.creditAttribution),
      dropGoal: (side, who) => withCr({ type: 'KICK', side, payload: { kick: 'drop', made: true, uid: id() } }, rugby.eventCredits({ type: 'kick', kick: 'drop', made: true, playerId: who }), rugby.creditAttribution),
      offload: (side, who) => withCr({ type: 'TALLY', side, payload: { kind: 'offload', uid: id() } }, rugby.eventCredits({ type: 'tally', tally: 'offload', playerId: who }), rugby.creditAttribution),
      yellow: (side, who) => withCr({ type: 'CARD', side, payload: { card: 'yellow', uid: id() } }, rugby.eventCredits({ type: 'card', card: 'yellow', playerId: who }), rugby.creditAttribution),
    },
  },
  {
    name: 'rugby league', keys: () => (rlTotals as Record<string, unknown>).STAT_TOTALS_KEYS as string[] | undefined,
    totals: (as) => rlTotals.leagueTotals(as.reduce(league.reducer, league.init({}))),
    kinds: {
      tackle: (side, who) => withCr({ type: 'DETAIL', side, payload: { detail: 'tackle', uid: id() } }, league.eventCredits({ type: 'detail', detail: 'tackle', playerId: who }), league.creditAttribution),
      lineBreak: (side, who) => withCr({ type: 'DETAIL', side, payload: { detail: 'lineBreak', uid: id() } }, league.eventCredits({ type: 'detail', detail: 'lineBreak', playerId: who }), league.creditAttribution),
      try: (side, who) => withCr({ type: 'TRY', side, payload: { uid: id() } }, league.eventCredits({ type: 'try', playerId: who }), league.creditAttribution),
      fieldGoal: (side, who) => withCr({ type: 'KICK', side, payload: { kick: 'fg', made: true, uid: id() } }, league.eventCredits({ type: 'kick', kick: 'fg', made: true, playerId: who }), league.creditAttribution),
    },
  },
];

const syncOwnedKeys = (statSync as unknown as { syncOwnedKeys?: (p: { statTotalsPartial?: boolean; statTotalsKeys?: readonly string[] }, keys?: string[]) => string[] }).syncOwnedKeys;
let ln = 0;
const mkLine = (w: { playerId: string; stats: Record<string, number> }): ExistingStatLine => ({ id: `l${++ln}`, playerId: w.playerId, stats: { ...w.stats } });
/** the lines a completed match holds after its sync, plus an appearance key */
function linesFor(t: MatchTotals): ExistingStatLine[] {
  const lines: ExistingStatLine[] = [];
  applyStatWrites(lines, planStatSync([], t, (x) => x), mkLine);
  for (const l of lines) l.stats.starts = 1;
  return lines;
}
const lineView = (lines: ExistingStatLine[]) => Object.fromEntries(lines.map((l) => [l.playerId, Object.fromEntries(Object.entries(l.stats).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b)))]).sort(([a], [b]) => String(a).localeCompare(String(b))));

describe('PI12–PI16 · NZI15: a correction that deletes the last event of a kind clears its key', () => {
  for (const g of GENS) {
    test(`${g.name}: the stale key is set to 0; the appearance key stays`, () => {
      const keys = g.keys();
      assert.ok(Array.isArray(keys) && keys.length, `${g.name} declares STAT_TOTALS_KEYS`);
      const kinds = Object.keys(g.kinds);
      const once = g.kinds[kinds[0]]('home', 'h1');
      const rest = kinds.slice(1).map((k, i) => g.kinds[k](i % 2 ? 'away' : 'home', i % 2 ? 'a2' : 'h2'));
      const full = [...rest, once];
      const lines = linesFor(g.totals(full));
      const owned = syncOwnedKeys!({ statTotalsKeys: keys }, undefined);
      const after = g.totals(rest); // the correction deleted `once`
      applyStatWrites(lines, planStatSync(lines, after, (x) => x, {}, owned), mkLine);
      const stale = Object.keys(g.totals([once]).h1.stats).filter((k) => !(k in (after.h1?.stats ?? {})) && g.totals([once]).h1.stats[k] !== 0);
      assert.ok(stale.length, 'the case has a key only that event wrote');
      const h1 = lines.find((l) => l.playerId === 'h1')!;
      for (const k of stale) assert.equal(h1.stats[k], 0, `${g.name} h1.${k}`);
      assert.equal(h1.stats.starts, 1, 'starts untouched');
      // same as syncing the corrected match from scratch
      const clean = linesFor(after);
      if (!clean.some((l) => l.playerId === 'h1')) clean.push({ id: 'x', playerId: 'h1', stats: { starts: 1 } });
      assert.deepEqual(lineView(lines), lineView(clean));
    });
  }
  test('PI13: keys outside the declared list are never touched', () => {
    const lines = [{ id: 'l', playerId: 'p', stats: { tackles: 2, starts: 1, legacy: 4 } }];
    const w = planStatSync(lines, {}, (x) => x, {}, ['tackles']);
    assert.deepEqual(w, [{ kind: 'update', id: 'l', playerId: 'p', stats: { tackles: 0, starts: 1, legacy: 4 } }]);
  });
  test('PI14: a partial sport (football) gets no extra owned keys', () => {
    assert.deepEqual(syncOwnedKeys!({ statTotalsPartial: true, statTotalsKeys: ['goals'] }), []);
    assert.deepEqual(syncOwnedKeys!({}), []);
  });
  test('PI15: the key-limited resync only clears its own keys', () => {
    assert.deepEqual(syncOwnedKeys!({ statTotalsKeys: ['tackles', 'carries', 'minutes'] }, ['minutes', 'capt']), ['minutes']);
  });
  test('PI12: the four plugins declare their list; the data layer passes it', () => {
    for (const s of ['hockey', 'ice_hockey', 'rugby', 'rugby_league']) assert.match(src(`src/sports/${s}/index.tsx`), /statTotalsKeys: STAT_TOTALS_KEYS/, s);
    assert.doesNotMatch(src('src/sports/football/index.tsx'), /statTotalsKeys/);
    assert.match(src('src/data/repos.ts'), /syncOwnedKeys\(/);
    assert.match(src('src/sports/types.ts'), /statTotalsKeys\?: readonly string\[\]/);
  });
});

/* ============================ 3. football re-entry =========================== */

type Carry = { a1?: string; goalType?: string; bodyPart?: string; zone?: string; bigChance?: boolean; situation?: string };
const fb = fbActions as unknown as {
  goalCarry?: (e: football.FootballState['events'][number]) => Carry;
  reenterGoalActions?: (s: Pick<football.FootballState, 'seq'>, side: Side, scorer: { id: string }, carry: Carry, o?: { tracked?: string[] }) => ScoreAction[];
};
const kick: ScoreAction = { type: 'KICKOFF', payload: { at: 1 } };
const fRun = (as: ScoreAction[], s = football.init({})) => as.reduce(football.reducer, s);

describe('PI17–PI21 · football goal re-entry keeps the assist and the detail', () => {
  test('PI17/PI18/PI19: edit goal 1 (header, assist p2) to scorer p5 — with a later home goal on the board', () => {
    assert.equal(typeof fb.goalCarry, 'function');
    assert.equal(typeof fb.reenterGoalActions, 'function');
    const log: ScoreAction[] = [kick, fbActions.goalAction('home', { id: 'p1' }, 'header' as never, { bodyPart: 'head' as never, zone: 'box' as never, bigChance: true })];
    let s = fRun(log);
    const g1 = s.events.at(-1)!;
    log.push(fbActions.assistAction('home', { id: 'p2' }, undefined, g1.id));
    log.push(fbActions.goalAction('home', { id: 'p3' }, 'open'));
    s = fRun(log);
    const goal1 = s.events.find((e) => e.id === g1.id)!;
    const carry = fb.goalCarry!(goal1);
    assert.deepEqual(carry, { a1: 'p2', goalType: 'header', bodyPart: 'head', zone: 'box', bigChance: true });
    // the held removal, then the re-entry (built from the state after it — the controls' `view`)
    const removal = fbActions.eventRemoval(goal1);
    const view = removal.reduce(football.reducer, s);
    const re = fb.reenterGoalActions!(view, 'home', { id: 'p5' }, carry);
    const done = [...removal, ...re].reduce(football.reducer, s);
    const goals = done.events.filter((e) => e.type === 'goal');
    assert.equal(goals.length, 2);
    const g = goals.at(-1)!;
    assert.deepEqual([g.playerId, g.secondId, g.goalType, g.bodyPart, g.zone, g.bigChance], ['p5', 'p2', 'header', 'head', 'box', true]);
    assert.equal(goals[0].secondId, undefined, 'the later goal gets no assist');
    // live credits = the clean match scored with p5
    const clean = [kick, fbActions.goalAction('home', { id: 'p3' }, 'open'), fbActions.goalAction('home', { id: 'p5' }, 'header' as never, { bodyPart: 'head' as never, zone: 'box' as never, bigChance: true })];
    const cleanS = fRun(clean);
    clean.push(fbActions.assistAction('home', { id: 'p2' }, undefined, cleanS.events.at(-1)!.id));
    assert.deepEqual(normalizeSums(liveSums(toRecords([...log, ...removal, ...re]))), normalizeSums(liveSums(toRecords(clean))));
    assert.deepEqual(normalize(footballStatTotals(done)), normalize(footballStatTotals(fRun(clean))));
  });
  test('PI17: the old assister re-entered as the scorer — the assist is dropped', () => {
    const re = fb.reenterGoalActions!({ seq: 4 }, 'home', { id: 'p2' }, { a1: 'p2', goalType: 'open' });
    assert.deepEqual(re.map((a) => a.type), ['GOAL']);
  });
  test('PI18: a situation only where it fits; no carry = a plain open goal, as before', () => {
    const re = fb.reenterGoalActions!({ seq: 4 }, 'away', { id: 'q1' }, {});
    assert.deepEqual(re, [fbActions.goalAction('away', { id: 'q1' }, 'open', {})]);
    const pen = fb.reenterGoalActions!({ seq: 4 }, 'away', { id: 'q1' }, { goalType: 'penalty', situation: 'corner' });
    assert.equal('situation' in pen[0].payload!, false);
  });
  test('PI19: the assist names the re-entered goal by its own id (seq + 1)', () => {
    const re = fb.reenterGoalActions!({ seq: 9 }, 'home', { id: 'p5' }, { a1: 'p2' });
    assert.equal(re[1].payload?.ref, 10);
  });
  test('PI20: a legacy name-only assister is not carried', () => {
    const s = fRun([kick, fbActions.goalAction('home', { id: 'p1' }, 'open'), { type: 'ASSIST', side: 'home', payload: { name: 'Old Name' } } as ScoreAction]);
    const g = s.events.find((e) => e.type === 'goal')!;
    assert.equal(fb.goalCarry!(g).a1, undefined);
  });
  test('PI17/PI21: the controls carry it (button and voice)', () => {
    const ui = src('src/sports/football/index.tsx');
    assert.match(ui, /step: 'scorer', carry: goalCarry\(ev\)/);
    assert.match(ui, /reenterGoalActions\(/);
    assert.match(ui, /flow\.carry/);
  });
});

/* ============================ 4. the 600-scorer sim =========================== */

describe('PI sim · 600 scorers', () => {
  test('ice hockey: 600 matches of faceoffs with zones now / later / never / undone / changed = the old flow', () => {
    const r = rng(4242);
    for (let m = 0; m < 600; m++) {
      const log: ScoreAction[] = [iceXi('home'), iceXi('away')];
      const old: ScoreAction[] = [iceXi('home'), iceXi('away')];
      let s = iceRun(log);
      const open: { id: string; side: Side; w?: string; l?: string }[] = [];
      const finalZone = new Map<string, ice.FoZone | undefined>();
      const n = 3 + r.int(12);
      for (let i = 0; i < n; i++) {
        const roll = r.next();
        if (roll < 0.55) {
          const side: Side = r.pick(['home', 'away'] as const);
          const named = r.next() < 0.85;
          const w = named ? r.pick(P[side]) : undefined, l = named && r.next() < 0.9 ? r.pick(P[opp(side)]) : undefined;
          const fid = `m${m}f${i}`;
          s = then(s, fo(fid, side, w, l), log);
          open.push({ id: fid, side, w, l });
          finalZone.set(fid, undefined);
        } else if (roll < 0.75) {
          const side: Side = r.pick(['home', 'away'] as const);
          const a = hit(`m${m}h${i}`, side, r.pick(P[side]));
          s = then(s, a, log); old.push(a);
          continue;
        }
        // describe one of the faceoffs (latest mostly; sometimes an older one — Edit)
        if (!open.length || r.next() < 0.3) continue;
        const f = r.next() < 0.8 ? open.at(-1)! : r.pick(open);
        const mode = r.pick(['later', 'never', 'undone', 'changed', 'cleared'] as const);
        if (mode === 'never') continue;
        const z = r.pick(ice.FO_ZONES);
        const a = foZoneAction!(s, f.id, z, ice.iceTrackedKeys(s));
        if (mode === 'undone') { if (a) { const before = s; s = ice.reducer(s, a); s = before; } continue; } // dispatched then undone: gone from the log
        s = then(s, a, log);
        finalZone.set(f.id, a ? z : finalZone.get(f.id));
        if (mode === 'changed') {
          const z2 = r.pick(ice.FO_ZONES);
          const b = foZoneAction!(s, f.id, z2, ice.iceTrackedKeys(s));
          s = then(s, b, log);
          if (b) finalZone.set(f.id, z2);
        } else if (mode === 'cleared') {
          const b = foZoneAction!(s, f.id, null, ice.iceTrackedKeys(s));
          s = then(s, b, log);
          if (b) finalZone.set(f.id, undefined);
        }
      }
      // the old one-step flow: each faceoff with its final zone, in the same order as the new log's events
      const oldFlow: ScoreAction[] = [iceXi('home'), iceXi('away')];
      for (const a of log.slice(2)) {
        if (a.type === 'FO_ZONE') continue;
        if (a.type === 'TALLY' && a.payload?.kind === 'faceoff') {
          const f = open.find((x) => x.id === a.payload!.uid)!;
          oldFlow.push(fo(f.id, f.side, f.w, f.l, finalZone.get(f.id)));
        } else oldFlow.push(a);
      }
      const o = iceRun(oldFlow);
      assert.deepEqual(s.events, o.events, `m${m} events`);
      assert.deepEqual(iceTotals.iceHockeyTotals(s), iceTotals.iceHockeyTotals(o), `m${m} totals`);
      assert.deepEqual(normalizeSums(liveSums(toRecords(log.map(stripTracked)))), normalizeSums(liveSums(toRecords(oldFlow))), `m${m} live credits`);
      // old logs replay identically
      assert.deepEqual(iceRun(oldFlow), o);
      if (m % 25 === 0) assertContract(ICE_SPORT, toRecords(log), { label: `m${m}` });
    }
  });

  test('NZI15: 600 completed matches, a correction deletes the last event(s) of a kind — the lines match a clean sync', () => {
    const r = rng(1515);
    for (let m = 0; m < 600; m++) {
      const g = GENS[m % GENS.length];
      const kinds = Object.keys(g.kinds);
      const acts: { kind: string; a: ScoreAction }[] = [];
      const n = 2 + r.int(10);
      for (let i = 0; i < n; i++) {
        const side: Side = r.pick(['home', 'away'] as const);
        const kind = r.pick(kinds);
        acts.push({ kind, a: g.kinds[kind](side, r.pick(P[side])) });
      }
      const lines = linesFor(g.totals(acts.map((x) => x.a)));
      const gone = r.pick(acts).kind;
      const kept = acts.filter((x) => x.kind !== gone).map((x) => x.a);
      const after = g.totals(kept);
      applyStatWrites(lines, planStatSync(lines, after, (x) => x, {}, syncOwnedKeys!({ statTotalsKeys: g.keys() })), mkLine);
      const clean = linesFor(after);
      for (const l of lines) if (!clean.some((c) => c.playerId === l.playerId)) clean.push({ id: 'x', playerId: l.playerId, stats: { starts: 1 } });
      assert.deepEqual(lineView(lines), lineView(clean), `${g.name} m${m} (deleted every ${gone})`);
      // PI16: every key the totals produce is declared
      const declared = new Set(g.keys());
      for (const t of Object.values(g.totals(acts.map((x) => x.a)))) for (const k of Object.keys(t.stats)) assert.ok(declared.has(k), `${g.name}: ${k} not in STAT_TOTALS_KEYS`);
    }
  });

  test('football: 600 goal re-entries keep the assist and the detail; totals = the clean match', () => {
    const r = rng(1717);
    const types = ['open', 'header', 'penalty', 'freekick'] as const;
    for (let m = 0; m < 600; m++) {
      const log: ScoreAction[] = [kick];
      let s = fRun(log);
      const goals = 1 + r.int(4);
      for (let i = 0; i < goals; i++) {
        const side: Side = r.pick(['home', 'away'] as const);
        const gt = r.pick(types);
        log.push(fbActions.goalAction(side, { id: `${side[0]}${1 + r.int(4)}` }, gt as never, { bigChance: r.next() < 0.3 }));
        s = fRun(log);
        if (r.next() < 0.7) {
          const g = s.events.at(-1)!;
          let a = `${side[0]}${1 + r.int(4)}`;
          if (a === g.playerId) a = `${side[0]}9`;
          log.push(fbActions.assistAction(side, { id: a }, undefined, g.id));
          s = fRun(log);
        }
      }
      const target = r.pick(s.events.filter((e) => e.type === 'goal'));
      const carry = fb.goalCarry!(target);
      const scorer = r.next() < 0.15 && carry.a1 ? carry.a1 : `${target.side[0]}${5 + r.int(3)}`;
      const removal = fbActions.eventRemoval(target);
      const view = removal.reduce(football.reducer, s);
      const re = fb.reenterGoalActions!(view, target.side, { id: scorer }, carry);
      const done = re.reduce(football.reducer, view);
      const g = done.events.at(-1)!;
      assert.equal(g.type, 'goal');
      assert.equal(g.playerId, scorer);
      assert.equal(g.goalType, target.goalType);
      assert.equal(!!g.bigChance, !!target.bigChance);
      assert.equal(g.secondId, carry.a1 && carry.a1 !== scorer ? carry.a1 : undefined, `m${m} assist`);
      // nothing else moved: the other goals keep their assists
      const others = (x: football.FootballState) => x.events.filter((e) => e.type === 'goal' && e.id !== target.id && e.id !== g.id).map((e) => [e.id, e.playerId, e.secondId]);
      assert.deepEqual(others(done), others(s));
      // live credits = the totals' owned keys (goals / assists) of the corrected match
      const sums = liveSums(toRecords([...log, ...removal, ...re]));
      const t = footballStatTotals(done);
      for (const [pid, st] of Object.entries(sums)) {
        for (const k of ['goals', 'assists'] as const) {
          const want = done.events.filter((e) => e.type === 'goal' && (k === 'goals' ? e.playerId === pid : e.secondId === pid)).length;
          assert.equal(st[k] ?? 0, want, `m${m} ${pid}.${k}`);
        }
      }
      assert.ok(t);
    }
  });
});
