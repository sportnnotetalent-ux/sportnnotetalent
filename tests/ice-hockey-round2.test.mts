/**
 * Round 2 — ice hockey faceoff zones (founder-approved):
 *  - an optional "Faceoff zones" toggle (only with Faceoffs): a draw carries its
 *    zone from the WINNER's view (oz / nz / dz); the losing centre's zone is the
 *    mirror (oz ↔ dz, nz stays). Off = one tap, the payload unchanged;
 *  - credits: per-zone won / lost keys for both centres, live credits that
 *    statTotals sums (SD-19 harness on every undo prefix), keyed coverage;
 *  - the sheet: FO by zone per team (own view), only when zones were tracked;
 *  - careers: won-lost and FO % by zone with the same 20-draw minimum;
 *  - commentary / timeline / voice mention the zone; old logs replay the same;
 *  - power plays stay per penalty: a 5-on-3 from two penalties = two chances.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, eventCredits, creditAttribution, mirrorZone, isFoZone, foZoneKey, zonesTracked, ppOpportunities, teamFigures,
  FO_ZONES, FO_ZONE_KEYS, TRACK_FIELDS, ICE_HOCKEY_LIVE_SETTINGS,
  type IceHockeyState, type Side, type IceEvent, type FoZone, type PenKind,
} from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyTotals, DERIVED_KEYS, OWNED_LIVE_KEYS } from '../src/sports/ice_hockey/totals.ts';
import { iceHockeySheet, faceoffZones } from '../src/sports/ice_hockey/sheet.ts';
import { iceHockeyStats } from '../src/sports/ice_hockey/stats.ts';
import { iceHockeyBox } from '../src/sports/ice_hockey/box.ts';
import { iceHockeyCommentary, sentence } from '../src/sports/ice_hockey/commentary.ts';
import { describeEvent } from '../src/sports/ice_hockey/timeline.ts';
import { iceHockeyVoice } from '../src/sports/ice_hockey/voice.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema, type StatDef } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Player, StatLine } from '../src/core/types.ts';
import type { NameOf } from '../src/core/playerNames.ts';

const HOME = ['hg', 'h2', 'h3', 'h4', 'h5'];
const AWAY = ['ag', 'a2', 'a3', 'a4', 'a5'];
const nm = (id: string) => id.toUpperCase();
/** IDs-only scoring: the state keeps ids; the viewer's names come from a lookup */
const VIEWER: NameOf = (id, legacy) => (id ? nm(id) : (legacy ?? '').trim() || 'Player');
const NAMES = { home: 'Kings', away: 'Wolves' };
let u = 0;
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hg' : 'ag', name: nm(team === 'home' ? 'hg' : 'ag') } } });
/** a faceoff won by `side` (winner / loser centres), with the zone from the winner's view */
function fo(side: Side, sec: number, period: number, who?: string, loser?: string, zone?: FoZone | string): ScoreAction {
  const ev = { type: 'tally', side, tally: 'faceoff', playerId: who, playerName: who && nm(who), ...(loser ? { secondId: loser, secondName: nm(loser) } : {}), ...(isFoZone(zone) ? { zone } : {}) } as IceEvent;
  const cr = eventCredits(ev);
  const a: ScoreAction = { type: 'TALLY', side, payload: { kind: 'faceoff', ...(zone ? { zone } : {}), uid: `f${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first), a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
function pen(side: Side, sec: number, kind: PenKind, who: string): ScoreAction {
  const cr = eventCredits({ type: 'pen', side, pen: kind, playerId: who, playerName: nm(who) });
  return { type: 'PEN', side, payload: { pen: kind, uid: `p${++u}`, sec, period: 1 }, attribution: creditAttribution(cr.first) };
}
const endPeriod = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const run = (actions: ScoreAction[], config?: Record<string, unknown>): IceHockeyState => actions.reduce(reducer, init(config));
const ZONES_ON = { trackFaceoffs: true, trackFaceoffZones: true };

/** Kings v Wolves: 6 zoned draws (h4 v a4 mostly) + one with no zone + a team-only draw */
const LOG: ScoreAction[] = [
  xi('home'), xi('away'),
  fo('home', 0, 1, 'h4', 'a4', 'nz'), // centre ice: both NZ
  fo('home', 60, 1, 'h4', 'a4', 'oz'), // Kings win in the Wolves' end: h4 OZ won, a4 DZ lost
  fo('away', 120, 1, 'a4', 'h4', 'oz'), // Wolves win in the Kings' end: a4 OZ won, h4 DZ lost
  fo('away', 180, 1, 'a4', 'h3', 'dz'), // Wolves win in their own end: a4 DZ won, h3 OZ lost
  fo('home', 240, 1, 'h3', 'a5', 'dz'),
  endPeriod(),
  fo('home', 1300, 2, 'h4', 'a4', 'oz'),
  fo('away', 1360, 2, 'a4', 'h4'), // zone skipped
  fo('home', 1400, 2, undefined, undefined, 'nz'), // team only (no centres named)
  endPeriod(), endPeriod(),
];

/* ------------------------------ zone helpers -------------------------------- */

describe('round 2 · faceoff zone helpers', () => {
  test('the mirror: offensive ↔ defensive, neutral stays; keys per zone', () => {
    assert.deepEqual(FO_ZONES.map(mirrorZone), ['dz', 'nz', 'oz']);
    for (const z of FO_ZONES) assert.equal(mirrorZone(mirrorZone(z)), z);
    assert.deepEqual([isFoZone('oz'), isFoZone('nz'), isFoZone('dz'), isFoZone('OZ'), isFoZone('slot'), isFoZone(undefined)], [true, true, true, false, false, false]);
    assert.deepEqual([foZoneKey(true, 'oz'), foZoneKey(false, 'dz'), foZoneKey(true, 'nz')], ['faceoffWinsOz', 'faceoffLossesDz', 'faceoffWinsNz']);
    assert.deepEqual([...FO_ZONE_KEYS].sort(), FO_ZONES.flatMap((z) => [foZoneKey(true, z), foZoneKey(false, z)]).sort());
  });
  test('credits: the winner his zone, the loser the mirror (both from their own side)', () => {
    const c = eventCredits({ type: 'tally', side: 'home', tally: 'faceoff', playerId: 'h4', secondId: 'a4', zone: 'oz' });
    assert.deepEqual(c.first?.stats, { faceoffWins: 1, faceoffWinsOz: 1 });
    assert.deepEqual([c.second?.stats, c.second?.side], [{ faceoffLosses: 1, faceoffLossesDz: 1 }, 'away']);
    const n = eventCredits({ type: 'tally', side: 'away', tally: 'faceoff', playerId: 'a4', secondId: 'h4', zone: 'nz' });
    assert.deepEqual([n.first?.stats, n.second?.stats], [{ faceoffWins: 1, faceoffWinsNz: 1 }, { faceoffLosses: 1, faceoffLossesNz: 1 }]);
    // no zone: exactly the deep-wave credits
    const plain = eventCredits({ type: 'tally', side: 'home', tally: 'faceoff', playerId: 'h4', secondId: 'a4' });
    assert.deepEqual([plain.first?.stats, plain.second?.stats], [{ faceoffWins: 1 }, { faceoffLosses: 1 }]);
    // a zone on another tally is ignored
    assert.deepEqual(eventCredits({ type: 'tally', side: 'home', tally: 'hit', playerId: 'h2', zone: 'oz' }).first?.stats, { checks: 1 });
  });
  test('the attribution keeps faceoffWins as its stat, the zone rides in extra', () => {
    const a = creditAttribution(eventCredits({ type: 'tally', side: 'home', tally: 'faceoff', playerId: 'h4', secondId: 'a4', zone: 'dz' }).first);
    assert.deepEqual([a?.stat, a?.by, a?.extra], ['faceoffWins', 1, { faceoffWinsDz: 1 }]);
  });
});

/* -------------------------------- reducer ----------------------------------- */

describe('round 2 · the TALLY action carries the zone (faceoffs only)', () => {
  const s = run(LOG, ZONES_ON);
  const fos = s.events.filter((e) => e.type === 'tally' && e.tally === 'faceoff');
  test('stored from the winner\'s view; a skipped zone has no field', () => {
    assert.deepEqual(fos.map((e) => e.zone), ['nz', 'oz', 'oz', 'dz', 'dz', 'oz', undefined, 'nz']);
    assert.equal('zone' in fos[6], false);
    assert.deepEqual([s.home, s.away], [0, 0], 'zones never change the score');
  });
  test('an unknown zone is ignored; a zone on a hit is ignored', () => {
    const t = run([xi('home'), xi('away'), fo('home', 10, 1, 'h4', 'a4', 'slot'), { type: 'TALLY', side: 'home', payload: { kind: 'hit', zone: 'oz', uid: 'x', sec: 20, period: 1 } }], ZONES_ON);
    assert.deepEqual(t.events.map((e) => [e.tally, 'zone' in e]), [['faceoff', false], ['hit', false]]);
  });
  test('the toggle is in the state only when on', () => {
    assert.equal('trackFaceoffZones' in init(), false);
    assert.equal('trackFaceoffZones' in init({ trackFaceoffs: true }), false);
    assert.equal(init({ trackFaceoffZones: 'true' }).trackFaceoffZones, true);
  });
  test('zones are tracked only with Faceoffs (or when a zone was recorded)', () => {
    assert.equal(zonesTracked(init(ZONES_ON)), true);
    assert.equal(zonesTracked(init({ trackFaceoffZones: true })), false, 'zones alone (no faceoffs) track nothing');
    assert.equal(zonesTracked(init({ trackFaceoffs: true })), false);
    assert.equal(zonesTracked(run([fo('home', 0, 1, 'h4', 'a4', 'oz')])), true, 'a recorded zone counts');
  });
});

/* ------------------------------- statTotals --------------------------------- */

const SPORT: TotalsSport<IceHockeyState> = {
  name: 'ice hockey round 2', init, reducer, statTotals: iceHockeyTotals, config: ZONES_ON, derived: DERIVED_KEYS as unknown as string[], signed: ['plusMinus'],
};

describe('round 2 · statTotals: per-zone keys, absolute, keyed', () => {
  test('SD-19 contract on every undo prefix; each centre credited his own zone', () => {
    const t = assertContract(SPORT, toRecords(LOG));
    const h4 = t.h4.stats, a4 = t.a4.stats, h3 = t.h3.stats;
    assert.deepEqual([h4.faceoffWins, h4.faceoffLosses, h4.faceoffWinsNz, h4.faceoffWinsOz, h4.faceoffLossesDz], [3, 2, 1, 2, 1]);
    assert.deepEqual([a4.faceoffWins, a4.faceoffLosses, a4.faceoffWinsOz, a4.faceoffWinsDz, a4.faceoffLossesNz, a4.faceoffLossesDz], [3, 3, 1, 1, 1, 2]);
    assert.deepEqual([h3.faceoffWinsDz, h3.faceoffLossesOz], [1, 1]);
    // the skipped zone counts overall only: wins = Σ zones + 1 for a4 (the 1360 draw)
    assert.equal(a4.faceoffWins, a4.faceoffWinsOz + a4.faceoffWinsNz + a4.faceoffWinsDz + 1);
    // a tracked key reads 0 for everyone with a line (the goalies too)
    assert.equal(t.hg.stats.faceoffWinsOz, 0);
  });
  test('Faceoffs without zones: no zone key on any line (never a false 0)', () => {
    const plain = LOG.map((a) => (a.type === 'TALLY' ? { ...a, payload: { ...a.payload, zone: undefined } } : a));
    const s = run(plain, { trackFaceoffs: true });
    const t = iceHockeyTotals(s);
    for (const l of Object.values(t)) for (const k of FO_ZONE_KEYS) assert.equal(k in l.stats, false, k);
    assert.equal(t.h4.stats.faceoffWins, 3);
  });
  test('the per-zone keys are owned live keys (credited live, summed by statTotals)', () => {
    for (const k of FO_ZONE_KEYS) assert.ok((OWNED_LIVE_KEYS as readonly string[]).includes(k), k);
    for (const k of FO_ZONE_KEYS) assert.ok(!(DERIVED_KEYS as readonly string[]).includes(k), k);
  });
});

/* --------------------------------- sheet ------------------------------------ */

describe('round 2 · match stats: faceoffs by zone', () => {
  const s = run(LOG, ZONES_ON);
  const rowOf = (sh: ReturnType<typeof iceHockeySheet>, key: string) => sh.sections.find((x) => x.key === 'fo')?.rows.find((r) => r.key === key);
  test('each team from its own end: OZ won / taken; home OZ draws are away DZ draws', () => {
    const h = faceoffZones(s, 'home'), a = faceoffZones(s, 'away');
    assert.deepEqual(h, { oz: { won: 2, total: 3 }, nz: { won: 2, total: 2 }, dz: { won: 1, total: 2 } });
    assert.deepEqual(a, { oz: { won: 1, total: 2 }, nz: { won: 0, total: 2 }, dz: { won: 1, total: 3 } });
    for (const z of FO_ZONES) assert.equal(h[z].total, a[mirrorZone(z)].total, z);
  });
  test('rows "won/taken (%)", the note, the period scope', () => {
    const sh = iceHockeySheet(s);
    assert.deepEqual([rowOf(sh, 'fo:oz')?.label, rowOf(sh, 'fo:oz')?.home, rowOf(sh, 'fo:oz')?.away], ['Offensive zone', '2/3 (66.7%)', '1/2 (50.0%)']);
    assert.equal(rowOf(sh, 'fo:nz')?.away, '0/2 (0.0%)');
    assert.equal(rowOf(sh, 'fo:dz')?.home, '1/2 (50.0%)');
    assert.match(sh.sections.find((x) => x.key === 'fo')!.note ?? '', /offensive = in the other team’s end/);
    const p2 = iceHockeySheet(s, 2);
    assert.deepEqual([rowOf(p2, 'fo:oz')?.home, rowOf(p2, 'fo:oz')?.away], ['1/1 (100.0%)', '0/0']);
    assert.deepEqual([rowOf(p2, 'fo:dz')?.home, rowOf(p2, 'fo:dz')?.away], ['0/0', '0/1 (0.0%)'], 'the Kings\' OZ draw is the Wolves\' DZ draw');
    assert.equal(rowOf(iceHockeySheet(s, 3), 'fo:oz'), undefined, 'no zoned draw in P3: no row');
  });
  test('without zones: the Faceoffs section as before (no zone rows, no note)', () => {
    const t = run(LOG.map((a) => (a.type === 'TALLY' ? { ...a, payload: { ...a.payload, zone: undefined } } : a)), { trackFaceoffs: true });
    const fo = iceHockeySheet(t).sections.find((x) => x.key === 'fo')!;
    assert.deepEqual(fo.rows.map((r) => r.key), ['fow', 'foPct']);
    assert.equal(fo.note, undefined);
  });
  test('the box score stays lean: no zone columns (decision)', () => {
    const table = buildBoxTable(iceHockeyStats, iceHockeyBox(s).data('all'));
    assert.ok(!table.columns.some((c) => /Oz|Nz|Dz/.test(c.key)));
    assert.ok(table.columns.some((c) => c.key === 'fo'));
  });
});

/* --------------------------------- careers ---------------------------------- */

describe('round 2 · careers: FO % by zone (20-draw minimum, keyed)', () => {
  const def = (k: string) => iceHockeyStats.stats.find((d) => d.key === k) as StatDef;
  const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'ice_hockey', stats } as unknown as StatLine);
  test('the schema: zone keys keyed, FO % per zone with the same 20-draw minimum as FO %', () => {
    assert.deepEqual(validateSchema(iceHockeyStats), []);
    for (const k of FO_ZONE_KEYS) assert.equal(def(k)?.coverage, 'keyed', k);
    for (const k of ['faceoffPct', 'faceoffPctOz', 'faceoffPctNz', 'faceoffPctDz']) {
      const a = def(k).agg;
      assert.equal(a?.kind === 'rate' ? a.qualifier?.den : undefined, 20, k);
    }
    assert.ok(!iceHockeyStats.leaders.some((k) => /Pct(Oz|Nz|Dz)$/.test(k)), 'no zone leaderboards (decision)');
  });
  test('rows under Faceoffs: won-lost and FO % per zone, with coverage; hidden when never tracked', () => {
    const career = careerSections(iceHockeyStats, [
      line({ faceoffWins: 10, faceoffLosses: 8, faceoffWinsOz: 6, faceoffLossesOz: 4, faceoffWinsNz: 3, faceoffLossesNz: 3, faceoffWinsDz: 1, faceoffLossesDz: 1 }, 1),
      line({ faceoffWins: 5, faceoffLosses: 5 }, 2), // faceoffs, no zones
      line({ goals: 1 }, 3),
    ]);
    const fo = career.find((x) => x.id === 'faceoffs')!;
    const r = (k: string) => fo.rows.find((x) => x.key === k);
    assert.deepEqual([r('faceoffsOz')?.label, r('faceoffsOz')?.value], ['Offensive zone (won-lost)', '6-4']);
    assert.deepEqual([r('faceoffPctOz')?.label, r('faceoffPctOz')?.value], ['FO% · offensive zone', '60.0%']);
    assert.equal(r('faceoffPctDz')?.value, '50.0%');
    assert.deepEqual(r('faceoffPctOz')?.coverage, { tracked: 1, total: 3 });
    assert.equal(r('faceoffPct')?.value, '53.6%', 'overall FO % over every faceoff game (15 of 28)');
    const none = careerSections(iceHockeyStats, [line({ faceoffWins: 5, faceoffLosses: 5 }, 1)]).flatMap((x) => x.rows);
    assert.ok(!none.some((x) => /(Oz|Nz|Dz)$/.test(x.key)), 'no zone rows without zone data');
  });
});

/* ------------------------- commentary, timeline, voice ----------------------- */

describe('round 2 · the zone in the commentary, timeline and voice', () => {
  const s = run(LOG, ZONES_ON);
  const e = (x: Partial<IceEvent>) => ({ id: 'x', sec: 0, period: 1, side: 'home', type: 'tally', tally: 'faceoff', ...x }) as IceEvent;
  test('commentary: "… in the offensive zone" (the winner\'s view); no zone reads as before', () => {
    assert.equal(sentence(s, e({ playerName: 'Rao', secondName: 'Khan', zone: 'oz' }), NAMES).text, 'Rao (Kings) wins the faceoff against Khan in the offensive zone.');
    assert.equal(sentence(s, e({ zone: 'nz' }), NAMES).text, 'Kings win the faceoff in the neutral zone.');
    assert.equal(sentence(s, e({ playerName: 'Rao', secondName: 'Khan' }), NAMES).text, 'Rao (Kings) wins the faceoff against Khan.');
    const lines = iceHockeyCommentary(s, NAMES, VIEWER).flatMap((g) => g.lines).filter((l) => l.tags?.includes('faceoff'));
    assert.equal(lines.length, 8);
    assert.ok(lines.some((l) => l.text === 'A4 (Wolves) wins the faceoff against H3 in the defensive zone.'));
  });
  test('the correction list labels the zone ("Faceoff won (OZ)")', () => {
    assert.equal(describeEvent(e({ zone: 'oz', playerName: 'Rao' })).label, 'Faceoff won (OZ)');
    assert.equal(describeEvent(e({ playerName: 'Rao' })).label, 'Faceoff won');
  });
  const P = (id: string, fullName: string, jerseyNo?: number): Player => ({ id, fullName, jerseyNo, sports: ['ice_hockey'] } as Player);
  const homeRoster = [P('h2', 'Asha Rao', 2), P('h3', 'Meera Khan', 3)];
  const awayRoster = [P('a2', 'Ravi Nair', 12)];
  const T = 1_700_000_000_000;
  const clock: ScoreAction = { type: 'CLOCK', payload: { run: true, at: T - 300_000 } };
  const ctx = (st: IceHockeyState) => ({ state: st, homeName: 'Hawks', awayName: 'Wolves', homeRoster, awayRoster, now: T });
  test('voice: "faceoff Rao offensive zone" records the zone and credits it', () => {
    const live = run([xi('home'), xi('away'), clock], ZONES_ON);
    const a = iceHockeyVoice('faceoff Rao offensive zone', ctx(live))![0];
    assert.deepEqual([a.type, a.side, a.payload?.kind, a.payload?.zone, a.attribution?.playerId, a.attribution?.stat, a.attribution?.extra], ['TALLY', 'home', 'faceoff', 'oz', 'h2', 'faceoffWins', { faceoffWinsOz: 1 }]);
    assert.equal(iceHockeyVoice('faceoff Nair neutral zone', ctx(live))![0].payload?.zone, 'nz');
    assert.equal(iceHockeyVoice('faceoff Khan defensive zone', ctx(live))![0].payload?.zone, 'dz');
    assert.equal('zone' in iceHockeyVoice('faceoff Rao', ctx(live))![0].payload!, false, 'no zone said: none recorded');
  });
  test('voice: zones not tracked → the payload has no zone, as before', () => {
    const live = run([xi('home'), xi('away'), clock], { trackFaceoffs: true });
    const a = iceHockeyVoice('faceoff Rao offensive zone', ctx(live))![0];
    assert.equal('zone' in a.payload!, false);
    assert.equal(a.attribution?.extra, undefined);
  });
});

/* ------------------------------ old logs + PP ------------------------------- */

describe('round 2 · old logs replay identically; power plays per penalty', () => {
  test('a deep-wave log (faceoffs, no zones) replays to the same state with or without the new code paths', () => {
    const old = LOG.map((a) => (a.type === 'TALLY' ? { ...a, payload: { ...a.payload, zone: undefined } } : a));
    const cfg = { trackFaceoffs: true, trackPhysical: true };
    const s = run(old, cfg);
    assert.deepEqual(s, run(old, { ...cfg, trackFaceoffZones: false }));
    assert.ok(s.events.every((e) => !('zone' in e)));
    assert.equal('trackFaceoffZones' in s, false);
    assert.deepEqual(iceHockeyTotals(s), iceHockeyTotals(run(old, { ...cfg, trackFaceoffZones: false })));
  });
  test('a 5-on-3 from two penalties counts as TWO power-play opportunities (NHL, per penalty — kept)', () => {
    const s = run([xi('home'), xi('away'), pen('away', 100, 'minor', 'a2'), pen('away', 130, 'minor', 'a3'), { type: 'TIMEOUT', side: 'home', payload: { uid: 'to', sec: 300, period: 1 } }]);
    const opps = ppOpportunities(s, 600);
    assert.deepEqual(opps.map((p) => p.side), ['away', 'away']);
    assert.equal(teamFigures(s, 'home').ppChances, 2);
    assert.equal(iceHockeySheet(s, 'all', 600).sections.find((x) => x.key === 'pp')!.rows.find((r) => r.key === 'ppConv')!.home, '0/2 (0%)');
  });
  test('live settings and the format: "Faceoff zones" right after "Faceoffs", off by default', () => {
    const keys = TRACK_FIELDS.map((f) => f.key);
    assert.equal(keys.indexOf('trackFaceoffZones'), keys.indexOf('trackFaceoffs') + 1);
    const f = TRACK_FIELDS.find((x) => x.key === 'trackFaceoffZones')!;
    assert.deepEqual([f.label, f.type, f.default, f.group], ['Faceoff zones', 'toggle', false, 'Stats to track']);
    assert.equal(ICE_HOCKEY_LIVE_SETTINGS.read(init(ZONES_ON)).trackFaceoffZones, true);
    assert.equal(ICE_HOCKEY_LIVE_SETTINGS.read(init()).trackFaceoffZones, false);
    assert.equal(ICE_HOCKEY_LIVE_SETTINGS.defaults?.trackFaceoffZones, false);
  });
});
