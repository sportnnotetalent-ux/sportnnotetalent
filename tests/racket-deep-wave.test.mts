/**
 * Deep wave (racket) — badminton, table tennis, squash, padel and pickleball
 * at broadcast depth: the shared point-detail model (wing + each sport's
 * shots, error / service-fault types, rally buckets, net / kitchen line, 3rd
 * shot — src/sports/pointDetail.ts), the "Stats to track" settings, the match
 * stats (src/sports/racketMatchStats.ts), the career keys (statTotals, written
 * only when tracked) and the schema / career rows. Decision 8: old logs replay
 * identically, SD-107 stroke ids are normalised on read (never rewritten) and
 * keep their career keys, and nothing untracked reads as a false 0.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs, type RallyState } from '../src/sports/rallyEngine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { badmintonTotals, padelTotals, rallyTotals, RACKET_RECORD_KEYS, SET_RECORD_KEYS, SERVE_KEYS, SERVE_SET_KEYS } from '../src/sports/racketTotals.ts';
import {
  DEPTH_SPORTS, DETAIL_HOWS, RACKET_SHOTS, applyPointDetail, creditsOf, detailKeys, errTypeOf, pdText, rallyBucketsOf, rallyKey, shotOf, shotPhrase,
  thirdTracked, detailFlags, initDetailFlags, type DepthSport,
} from '../src/sports/pointDetail.ts';
import {
  errorTypeRows, keyStats, phaseRows, racketCareerKeys, racketExtraKeys, racketTally, racketView, rallyLengthRows, serveTabRows, shotRows, strokeSummary, thirdShotRows,
} from '../src/sports/racketMatchStats.ts';
import { detailLiveSettings, trackFields, trackFormatFields } from '../src/sports/pointDetailSettings.ts';
import { planLiveApply } from '../src/sports/liveSettings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { aggregateValue, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';

type Side = 'home' | 'away';
const P = (side: Side, id?: string): ScoreAction => ({ type: 'POINT', side, ...(id ? { attribution: { playerId: id, stat: 'points', playerName: id.toUpperCase() } } : {}) });
const D = (payload: Record<string, unknown>): ScoreAction => ({ type: 'POINT_DETAIL', payload });
const FS = (side: Side, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side, ...extra } });
const TRACK = (flags: Record<string, boolean>): ScoreAction => ({ type: 'SET_DETAIL', payload: flags });
const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(reducer, s0);
const engine = (id: 'tabletennis' | 'squash' | 'pickleball', perSide = 1, target = 11) =>
  makeRallyEngine({ id, icon: '', sideOutValue: id === 'squash' ? 'english' : id === 'pickleball' ? 'sideout' : '__none__', sideOutLabel: 'x', defaults: { playersPerSide: perSide, target, winBy: 2, gamesToWin: 3 } });
const TT = engine('tabletennis');
const SQ = engine('squash');
const PB = engine('pickleball', 2);
const SINGLES = L.ctxOf({ home: ['h1'], away: ['a1'] });
const DOUBLES = L.ctxOf({ home: ['h1', 'h2'], away: ['a1', 'a2'] });
const R1 = { home: ['h1'], away: ['a1'] };
const show = (rows: Array<{ label: string; home: string; away: string }>) => rows.map((r) => `${r.label}: ${r.home} | ${r.away}`);

// ------------------------------------------------------------------ model --

describe('deep wave · the model (wing + each sport\'s shots)', () => {
  test('every sport offers wing + shot on winners and both errors; unforced errors keep their types', () => {
    for (const sp of DEPTH_SPORTS) {
      for (const how of ['winner', 'ue', 'fe'] as const) assert.equal(DETAIL_HOWS[sp].find((h) => h.how === how)?.wingShot, true, `${sp}.${how}`);
      assert.ok(DETAIL_HOWS[sp].find((h) => h.how === 'ue')!.strokes!.length >= 2, sp);
      assert.equal(DETAIL_HOWS[sp].find((h) => h.how === 'winner')!.strokes, undefined, sp);
    }
    // round 2: + jump smash and block (founder)
    assert.deepEqual(RACKET_SHOTS.badminton.map((d) => d.id), ['smash', 'jumpSmash', 'drop', 'clear', 'netShot', 'netKill', 'drive', 'lift', 'push', 'block', 'serve']);
    // racket-batch5: + edge / net cord (TT-b), + serve (squash, F11)
    assert.deepEqual(RACKET_SHOTS.tabletennis.map((d) => d.id), ['receive', 'flick', 'push', 'chop', 'loop', 'block', 'smash', 'lob', 'edge']);
    assert.deepEqual(RACKET_SHOTS.squash.map((d) => d.id), ['drive', 'drop', 'boast', 'volley', 'lob', 'kill', 'nick', 'serve']);
    assert.ok(['bandeja', 'vibora', 'x3', 'chiquita', 'bajada', 'wall'].every((k) => RACKET_SHOTS.padel.some((d) => d.id === k)));
    assert.ok(['dink', 'drop', 'reset', 'erne', 'atp'].every((k) => RACKET_SHOTS.pickleball.some((d) => d.id === k)));
    // service-fault types (BWF Law 9.1, ITTF, WSF, USA Pickleball)
    // racket-batch5 RB9: new types offered; the old ids still read (last)
    assert.deepEqual(DETAIL_HOWS.badminton.find((h) => h.how === 'sf')!.strokes, ['high', 'foot', 'net', 'out', 'balk', 'fault']);
    assert.deepEqual(DETAIL_HOWS.tabletennis.find((h) => h.how === 'sf')!.strokes, ['net', 'out', 'illegal']);
    assert.deepEqual(DETAIL_HOWS.squash.find((h) => h.how === 'sf')!.strokes, ['low', 'shortLine', 'sideWall', 'foot', 'out', 'short']);
  });
  test('SD-107 winner stroke ids are normalised on read to the same shot (or wing) — never rewritten', () => {
    assert.deepEqual(shotOf('badminton', { how: 'winner', stroke: 'netKill' }), { shot: 'netKill' });
    assert.deepEqual(shotOf('badminton', { how: 'winner', stroke: 'push' }), { shot: 'push' });
    assert.deepEqual(shotOf('tabletennis', { how: 'winner', stroke: 'fh' }), { wing: 'fh' });
    assert.deepEqual(shotOf('tabletennis', { how: 'winner', stroke: 'loop' }), { shot: 'loop' });
    assert.deepEqual(shotOf('squash', { how: 'winner', stroke: 'nick' }), { shot: 'nick' });
    assert.deepEqual(shotOf('padel', { how: 'winner', stroke: 'x3' }), { shot: 'x3' });
    assert.deepEqual(shotOf('pickleball', { how: 'winner', stroke: 'atp' }), { shot: 'atp' });
    // an error's stroke is its TYPE, never a shot
    assert.deepEqual(shotOf('badminton', { how: 'ue', stroke: 'net' }), {});
    assert.equal(errTypeOf('badminton', { how: 'ue', stroke: 'net' }), 'net');
    assert.equal(errTypeOf('badminton', { how: 'sf', stroke: 'high' }), 'high');
    assert.equal(errTypeOf('badminton', { how: 'winner', stroke: 'smash' }), undefined);
    // the new fields win over a legacy id; another sport's shot is dropped
    assert.deepEqual(shotOf('badminton', { how: 'winner', stroke: 'smash', wing: 'bh' }), { wing: 'bh' });
    assert.deepEqual(shotOf('squash', { how: 'winner', shot: 'smash' as never }), {});
  });
  test('credits: the legacy keys carry on (winnersSmash, winnersFh, ueNet); new points add wing / shot / type keys', () => {
    assert.deepEqual(creditsOf('badminton', { how: 'winner', stroke: 'smash' }), [['winner', 'winners'], ['winner', 'winnersSmash']]);
    assert.deepEqual(creditsOf('tabletennis', { how: 'winner', stroke: 'fh' }), [['winner', 'winners'], ['winner', 'winnersFh']]);
    assert.deepEqual(creditsOf('pickleball', { how: 'ue', stroke: 'kitchen' }), [['loser', 'unforcedErrors'], ['loser', 'ueKitchen']]);
    assert.deepEqual(creditsOf('badminton', { how: 'ue', wing: 'bh', shot: 'netShot', stroke: 'net' }),
      [['loser', 'unforcedErrors'], ['loser', 'ueBh'], ['loser', 'ueNetShot'], ['loser', 'ueNet']]);
    assert.deepEqual(creditsOf('padel', { how: 'fe', wing: 'fh', shot: 'bandeja' }), [['loser', 'forcedErrors'], ['loser', 'feFh'], ['loser', 'feBandeja']]);
    assert.deepEqual(creditsOf('badminton', { how: 'sf', stroke: 'high' }), [['loser', 'serviceFaults'], ['loser', 'sfHigh']]);
  });
  test('detailKeys: no duplicates, the legacy keys still listed, the quick keys unchanged', () => {
    for (const sp of DEPTH_SPORTS) {
      const keys = detailKeys(sp);
      assert.equal(new Set(keys).size, keys.length, sp);
    }
    for (const k of ['winnersSmash', 'winnersNetKill', 'winnersPush', 'ueNet', 'sfHigh', 'feLift']) assert.ok(detailKeys('badminton').includes(k), k);
    for (const k of ['winnersFh', 'winnersBh', 'winnersLoop', 'winnersFlick', 'ueOut', 'feChop', 'sfIllegal']) assert.ok(detailKeys('tabletennis').includes(k), k);
    assert.deepEqual(detailKeys('squash', true), ['strokesWon', 'strokesConceded', 'noLets']);
    assert.deepEqual(detailKeys('padel', true), ['aces']);
  });
  test('words: the sport\'s shot names, an error keeps its type, a fault its type', () => {
    assert.equal(shotPhrase('badminton', { wing: 'fh', shot: 'netKill' }), 'Forehand net kill');
    assert.equal(shotPhrase('badminton', { wing: 'fh', shot: 'netKill' }, true), 'Forehand Net Kill');
    assert.equal(shotPhrase('pickleball', { shot: 'atp' }, true), 'Around The Post (ATP)');
    assert.equal(pdText({ how: 'ue', wing: 'fh', shot: 'drive', stroke: 'net' }, true, 'badminton'), 'Unforced error (forehand drive, into the net)');
    assert.equal(pdText({ how: 'winner', shot: 'nick' }, true, 'squash'), 'Nick winner');
    assert.equal(pdText({ how: 'sf', stroke: 'high' }, true, 'badminton'), 'Service fault (above 1.15 m)');
    assert.equal(pdText({ how: 'ue', stroke: 'tin' }, true, 'squash'), 'Unforced error (tin)');
    // a timeline without its sport still reads another sport's shot
    assert.equal(pdText({ how: 'winner', wing: 'bh', shot: 'bandeja' }, false), 'Backhand bandeja winner');
    // tennis unchanged
    assert.equal(pdText({ how: 'winner', wing: 'fh', shot: 'gs' }), 'Forehand winner');
    assert.equal(pdText({ how: 'ue', stroke: 'bh' }), 'Unforced error (backhand)');
  });
  test('POINT_DETAIL validates per sport: shots, rally buckets, 3rd shot (tennis unchanged)', () => {
    const ev = [{ id: 1, stamp: 'Game 1', icon: '', label: 'Point', side: 'home' as const, kind: 'point' }];
    const b = applyPointDetail(ev, { pd: { how: 'winner', shot: 'gs' }, rallyLen: '5-10' }, 'badminton')!;
    assert.deepEqual([b[0].pd, b[0].rallyLen], [{ how: 'winner' }, '5-10']); // a tennis shot isn't a badminton one
    assert.equal(applyPointDetail(ev, { rallyLen: '5-10' }), null); // the tennis engine: tennis buckets only
    assert.equal(applyPointDetail(ev, { rallyLen: '1-2' }, 'tabletennis')![0].rallyLen, '1-2');
    assert.equal(applyPointDetail(ev, { third: 'drop' }, 'pickleball')![0].third, 'drop');
    assert.equal(applyPointDetail(ev, { third: 'drop' }, 'padel'), null);
    assert.equal(applyPointDetail(ev, { third: 'smash' }, 'pickleball'), null);
    const t = applyPointDetail(ev, { third: 'drive' }, 'pickleball')!;
    assert.equal(applyPointDetail(t, { third: null }, 'pickleball')![0].third, undefined);
    assert.deepEqual(rallyBucketsOf('tabletennis'), ['1-2', '3-4', '5+']);
    assert.deepEqual([rallyKey('0-4'), rallyKey('9+'), rallyKey('5-10'), rallyKey('16+')], ['rl04', 'rl9', 'rl510', 'rl16']);
  });
});

// ---------------------------------------------------------- Decision 8 --

describe('deep wave · Decision 8 — old logs', () => {
  const cases: Array<[DepthSport, () => { s: unknown; again: unknown; keys: string[] }]> = [
    ['badminton', () => ({ s: run(badminton.reducer, badminton.init({}), L.BADMINTON_LOG), again: run(badminton.reducer, badminton.init({}), L.BADMINTON_LOG), keys: L.RALLY_KEYS.slice(0, 4) })],
    ['tabletennis', () => ({ s: run(TT.reducer, TT.init({}), L.TT_LOG), again: run(TT.reducer, TT.init({}), L.TT_LOG), keys: L.RALLY_KEYS })],
    ['squash', () => ({ s: run(SQ.reducer, SQ.init({}), L.SQUASH_LOG), again: run(SQ.reducer, SQ.init({}), L.SQUASH_LOG), keys: L.RALLY_KEYS })],
    ['pickleball', () => ({ s: run(PB.reducer, PB.init({ scoring: 'sideout' }), L.PICKLEBALL_SIDEOUT_LOG), again: run(PB.reducer, PB.init({ scoring: 'sideout' }), L.PICKLEBALL_SIDEOUT_LOG), keys: L.RALLY_KEYS })],
    ['padel', () => ({ s: run(padel.reducer, padel.init({}), L.PADEL_TWO_SETS), again: run(padel.reducer, padel.init({}), L.PADEL_TWO_SETS), keys: L.TENNIS_KEYS })],
  ];
  test('old logs replay identically; no new flag, no new key, no tracked tab', () => {
    for (const [sp, mk] of cases) {
      const { s, again, keys } = mk();
      assert.equal(L.fingerprint(s as never, keys), L.fingerprint(again as never, keys), sp);
      for (const k of ['rallyDetail', 'netDetail', 'thirdDetail']) assert.equal(k in (s as object), false, `${sp}.${k}`);
      const totals = sp === 'badminton' ? badmintonTotals(s as never, SINGLES) : sp === 'padel' ? padelTotals(s as never, SINGLES) : rallyTotals(s as never, SINGLES, sp);
      for (const k of [...racketExtraKeys(sp), ...detailKeys(sp)]) assert.equal(k in totals.h1.stats, false, `${sp}.${k}`);
      const v = racketView(sp, s, R1)!;
      assert.deepEqual(v.cov, { detail: null, serve: false, net: false, rally: false, third: false, arrival: false }, sp);
      assert.deepEqual(v.buckets, rallyBucketsOf(sp), sp); // round 2: the default buckets, as before
      assert.ok(!keyStats(v).some((x) => x.id === 'shots' || x.id === 'decisions'), sp);
    }
  });
  test('an EDIT_LOG of the same list replays identically', () => {
    const s = run(TT.reducer, TT.init({}), L.TT_LOG);
    const e = TT.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.equal(L.fingerprint(e as never, L.RALLY_KEYS), L.fingerprint(s as never, L.RALLY_KEYS));
  });
  test('an SD-107 detail match: the log keeps its ids; careers read the same keys as before', () => {
    const s = run(badminton.reducer, badminton.init({}), [TRACK({ pointDetail: true }), P('home', 'h1'), D({ pd: { how: 'winner', stroke: 'netKill' } }), P('away', 'a1'), D({ pd: { how: 'ue', stroke: 'out' } })]);
    assert.deepEqual(s.events.filter((e) => e.kind === 'point').map((e) => e.pd?.stroke), ['netKill', 'out']);
    const t = badmintonTotals(s, SINGLES);
    assert.deepEqual([t.h1.stats.winnersNetKill, t.h1.stats.unforcedErrors, t.h1.stats.ueOut, t.h1.stats.ueBh], [1, 1, 1, 0]);
    // tracked detail writes the full key set (absolute, 0 when none) — rally length untracked: none
    assert.equal(t.a1.stats.feLift, 0);
    assert.equal('rl04Pts' in t.a1.stats, false);
  });
});

// ------------------------------------------------------- settings --

describe('deep wave · "Stats to track"', () => {
  test('each sport\'s options with a hint, under one group (point detail on, the rest off)', () => {
    const keys = (sp: DepthSport) => trackFields(sp).map((f) => f.key);
    assert.deepEqual(keys('badminton'), ['pointDetail', 'rallyDetail']);
    assert.deepEqual(keys('tabletennis'), ['pointDetail', 'rallyDetail']);
    assert.deepEqual(keys('squash'), ['pointDetail', 'rallyDetail']);
    assert.deepEqual(keys('padel'), ['pointDetail', 'serveDetail', 'netDetail', 'rallyDetail']);
    assert.deepEqual(keys('pickleball'), ['pointDetail', 'netDetail', 'rallyDetail', 'thirdDetail']);
    assert.equal(trackFields('pickleball').find((f) => f.key === 'netDetail')!.label, 'Kitchen line');
    for (const sp of DEPTH_SPORTS) {
      const ls = detailLiveSettings(sp);
      const toggles = ls.fields.filter((f) => f.type === 'toggle');
      // founder 2026-11-08 (describe-done.md DD1): every option on for a new match
      assert.ok(toggles.every((f) => f.default === true && f.group === 'Stats to track' && (f.hint ?? '').length > 20), sp);
      // round 2: + the rally-length buckets option (a choice, the deep-wave buckets by default)
      assert.deepEqual(ls.fields.filter((f) => f.type !== 'toggle').map((f) => [f.key, f.default]), [['rallyBuckets', 'std']], sp);
      assert.ok(trackFormatFields(sp).every((f) => f.advanced === true), sp);
    }
  });
  test('event mode: the format before the first rally, SET_DETAIL after; init reads the format', () => {
    const ls = detailLiveSettings('pickleball');
    const fresh = PB.init({});
    assert.deepEqual(planLiveApply(ls as never, fresh, 0, ls.read(fresh as never), { ...ls.read(fresh as never), thirdDetail: true }), { kind: 'format', patch: { thirdDetail: true } });
    const live = run(PB.reducer, fresh, [FS('home'), P('home')]);
    const plan = planLiveApply(ls as never, live, 2, ls.read(live as never), { ...ls.read(live as never), thirdDetail: true, netDetail: true });
    assert.deepEqual(plan, { kind: 'event', action: { type: 'SET_DETAIL', payload: { netDetail: true, thirdDetail: true } } });
    const after = PB.reducer(live, (plan as { action: ScoreAction }).action);
    assert.deepEqual([after.netDetail, after.thirdDetail], [true, true]);
    assert.deepEqual(initDetailFlags({ rallyDetail: true, thirdDetail: true, x: true }), { rallyDetail: true, thirdDetail: true });
    assert.equal(PB.init({ thirdDetail: true }).thirdDetail, true);
    assert.equal(detailFlags({ thirdDetail: false }, {}), null);
    // describe-done.md DD11: switched on but nothing tagged yet is not tracked (no false zero)
    assert.equal(thirdTracked(after), false);
  });
});

// ---------------------------------------------------------- stats --

/** Badminton singles, everything tracked. Game 1, home serves first:
 *  1 home FH smash winner (5–10)            1-0
 *  2 away: home BH net-shot UE into the net (0–4)  1-1 (service over)
 *  3 home: away serve fault, too high       2-1
 *  4 away: home FE on a lift (11+)          2-2
 *  5 home (not described)                   3-2 */
const BAD: ScoreAction[] = [
  FS('home'), TRACK({ pointDetail: true, rallyDetail: true }),
  P('home', 'h1'), D({ pd: { how: 'winner', wing: 'fh', shot: 'smash' }, rallyLen: '5-10' }),
  P('away', 'a1'), D({ pd: { how: 'ue', wing: 'bh', shot: 'netShot', stroke: 'net' }, rallyLen: '0-4' }),
  P('home', 'h1'), D({ pd: { how: 'sf', stroke: 'high' } }),
  P('away', 'a1'), D({ pd: { how: 'fe', shot: 'lift' }, rallyLen: '11+' }),
  P('home', 'h1'),
];

describe('deep wave · match stats', () => {
  const s = run(badminton.reducer, badminton.init({}), BAD);
  const v = racketView('badminton', s, R1)!;
  test('coverage, tally and key stats', () => {
    assert.deepEqual(v.cov, { detail: 'full', serve: false, net: false, rally: true, third: false, arrival: false });
    const t = racketTally(v);
    assert.deepEqual([t.home.winners, t.home.ue, t.home.fe, t.away.sf, t.described], [1, 1, 1, 1, 4]);
    const ks = keyStats(v);
    // no game / match point yet at 3-2 of a game to 21: no Games section
    assert.deepEqual(ks.map((x) => x.id), ['serve', 'shots', 'points']);
    // the rally winner serves: home served rallies 1, 2, 4 (won 1); away 3, 5 (won none)
    assert.deepEqual(show(ks[0].rows), ['Service faults: 0 | 1', 'Points won on serve: 1/3 (33%) | 0/2 (0%)', 'Points won on receive: 2/2 (100%) | 2/3 (67%)']);
    assert.deepEqual(show(ks[1].rows), ['Winners: 1 | 0', 'Unforced errors: 1 | 0', 'Forced errors: 1 | 0', 'Winners / UE: 1.00 | –']);
    assert.equal(ks[2].rows.find((r) => r.key === 'tot')!.home, '3/5 (60%)');
  });
  test('shots by how × wing; the stroke summary; errors by type', () => {
    assert.deepEqual(show(shotRows(v, 'all', 'winner', 'all').filter((r) => r.hv + r.av)), ['Winners: 1 | 0', 'Smash: 1 | 0']);
    assert.deepEqual(show(shotRows(v, 'all', 'ue', 'bh').filter((r) => r.hv + r.av)), ['Backhand · unforced errors: 1 | 0', 'Net shot: 1 | 0']);
    // a forced error with no wing counts under "either wing" only
    assert.deepEqual(show(shotRows(v, 'all', 'fe', 'all').filter((r) => r.hv + r.av)), ['Forced errors: 1 | 0', 'Lift: 1 | 0']);
    assert.equal(shotRows(v, 'all', 'fe', 'fh')[0].hv, 0);
    assert.deepEqual(strokeSummary(v).filter((r) => r.home + r.away).map((r) => `${r.label}: ${r.home}-${r.away}`), ['FH winners: 1-0', 'BH unforced errors: 1-0']);
    assert.deepEqual(show(errorTypeRows(v)), ['Unforced errors · into the net: 1 | 0', 'Service faults · above 1.15 m: 0 | 1']);
  });
  test('rally length, on serve / on receive; game scope', () => {
    assert.deepEqual(show(rallyLengthRows(v)), ['0–4 shots: 0 (0%) | 1 (100%)', '5–10 shots: 1 (100%) | 0 (0%)', '11+ shots: 0 (0%) | 1 (100%)']);
    const ph = phaseRows(v);
    assert.equal(ph.find((r) => r.key === '0-4-rcv')!.away, '1/1 (100%)');
    assert.deepEqual(serveTabRows(v).map((r) => r.key).slice(0, 3), ['tot', 'srv', 'rcv']);
    assert.deepEqual(keyStats(v, 2), []); // a game with no rally yet
  });
  test('table tennis: aces and the three-phase analysis', () => {
    const tt = run(TT.reducer, TT.init({}), [
      FS('away'), TRACK({ pointDetail: true, rallyDetail: true }),
      P('away'), D({ pd: { how: 'ace' }, rallyLen: '1-2' }),
      P('home'), D({ pd: { how: 'winner', wing: 'bh', shot: 'flick' }, rallyLen: '1-2' }),
      P('home'), D({ pd: { how: 'winner', wing: 'fh', shot: 'loop' }, rallyLen: '3-4' }),
      P('away'), D({ pd: { how: 'ue', wing: 'fh', shot: 'loop', stroke: 'out' }, rallyLen: '5+' }),
    ]);
    const vt = racketView('tabletennis', tt, R1)!;
    assert.equal(keyStats(vt)[0].rows[0].key, 'aces');
    assert.deepEqual(show(phaseRows(vt)), [
      'Serve & 3rd ball (own serve, shots 1–4): 1/1 (100%) | 1/2 (50%)',
      'Receive & 4th ball (shots 1–4): 1/2 (50%) | 0/1 (0%)',
      'Rally (5+ shots): 0/1 (0%) | 1/1 (100%)',
    ]);
    assert.deepEqual(rallyLengthRows(vt).map((r) => r.label), ['Serve & receive (1–2)', '3rd & 4th ball (3–4)', 'Rally (5+)']);
    const k = racketCareerKeys(vt, 'home');
    assert.deepEqual([k.serve3Pts, k.serve3Won, k.receive4Pts, k.receive4Won, k.rl12Pts, k.rl5Won], [1, 1, 2, 1, 2, 0]);
  });
  test('squash: lets by who appealed, strokes, no lets — Referee decisions (free with the one-tap buttons)', () => {
    const sq = run(SQ.reducer, SQ.init({}), [
      FS('home'), P('home'), { type: 'LET', side: 'away' }, { type: 'LET' },
      { type: 'POINT', side: 'home', payload: { pd: { how: 'stroke' } } }, { type: 'POINT', side: 'away', payload: { pd: { how: 'nolet' } } },
    ]);
    const vs = racketView('squash', sq)!;
    assert.equal(vs.cov.detail, 'quick');
    const dec = keyStats(vs).find((x) => x.id === 'decisions')!;
    assert.deepEqual(show(dec.rows), ['Lets asked (2 in all · 1 not named): 0 | 1', 'Strokes won: 1 | 0', 'No lets: 1 | 0']);
    assert.ok(!keyStats(vs).some((x) => x.id === 'shots')); // one-tap detail only: no winners / errors
    // an old match without lets or decisions: no section
    assert.ok(!keyStats(racketView('squash', run(SQ.reducer, SQ.init({}), L.SQUASH_LOG))!).some((x) => x.id === 'decisions'));
  });
  test('pickleball side-out doubles: side-out %, kitchen line, 3rd shot', () => {
    const pb = run(PB.reducer, PB.init({ scoring: 'sideout' }), [
      FS('home', { alt: true, pos: 2 }), TRACK({ netDetail: true, thirdDetail: true }),
      P('home'), D({ third: 'drop', atNet: 'both' }),
      P('away'), D({ third: 'drive' }),
      P('home'),
      P('home'), D({ third: 'drop', atNet: 'home' }),
    ]);
    const vp = racketView('pickleball', pb, { home: ['h1', 'h2'], away: ['a1', 'a2'] })!;
    assert.deepEqual(vp.cov, { detail: null, serve: false, net: true, rally: false, third: true, arrival: false });
    const serve = keyStats(vp).find((x) => x.id === 'serve')!;
    assert.deepEqual(serve.rows.map((r) => r.label).slice(0, 2), ['Rallies won on serve', 'Side-out % (receive rallies won)']);
    assert.ok(serve.rows.some((r) => r.key === 'ho' && r.away === '1'));
    assert.equal(keyStats(vp).find((x) => x.id === 'points')!.rows[0].label, 'Kitchen-line rallies won');
    assert.deepEqual(show(thirdShotRows(vp)).slice(0, 2), ['3rd-shot drops: 1 (50%) | 1 (100%)', 'Rallies won after a 3rd-shot drop: 1/1 (100%) | 0/1 (0%)']);
    const t = rallyTotals(pb, DOUBLES, 'pickleball');
    // the side's keys on both players (the scorer marks a side, not a player)
    for (const id of ['h1', 'h2']) assert.deepEqual([t[id].stats.kitchenPts, t[id].stats.kitchenWon, t[id].stats.thirdDrop, t[id].stats.thirdDropWon, t[id].stats.thirdDrive], [2, 2, 1, 1, 1]);
    assert.equal('rl04Pts' in t.h1.stats, false); // rally length not tracked
    assert.equal('winners' in t.h1.stats, false); // nor point detail
  });
  test('padel: aces from the one-tap button, net points, golden points, 1st serve when tracked', () => {
    const log: ScoreAction[] = [FS('home'), TRACK({ serveDetail: true, netDetail: true })];
    for (const side of ['home', 'home', 'home', 'away', 'away', 'away'] as Side[]) log.push(P(side));
    log.push(P('away'), D({ atNet: 'away' }));
    log.push({ type: 'POINT', side: 'away', payload: { pd: { how: 'ace' } } });
    const pd = run(padel.reducer, padel.init({ deuce: 'golden', playersPerSide: 1 }), log);
    const vp = racketView('padel', pd, R1)!;
    assert.deepEqual([vp.cov.detail, vp.cov.serve, vp.cov.net], ['quick', true, true]);
    const ks = keyStats(vp);
    assert.deepEqual(ks.find((x) => x.id === 'serve')!.rows.map((r) => r.key), ['aces', 's1in', 's1won', 's2won']);
    assert.equal(ks.find((x) => x.id === 'points')!.rows.find((r) => r.key === 'net')!.away, '1/1 (100%)');
    assert.equal(ks.find((x) => x.id === 'games')!.rows.find((r) => r.key === 'gold')!.away, '1/1 (100%)');
    const t = padelTotals(pd, SINGLES);
    assert.deepEqual([t.a1.stats.netPts, t.a1.stats.netPtsWon, t.a1.stats.aces], [1, 1, 1]);
  });
});

// ------------------------------------------------- careers and schema --

describe('deep wave · statTotals, schema, career rows', () => {
  test('statTotals contract (SD-19 harness): live keys = credits on every prefix; new keys derived ≥ 0', () => {
    const DERIVED = new Set<string>([...RACKET_RECORD_KEYS, ...SET_RECORD_KEYS, ...SERVE_KEYS, ...SERVE_SET_KEYS, ...detailKeys('badminton'), ...racketExtraKeys('badminton')]);
    const sp: TotalsSport<badminton.BadmintonState> = {
      name: 'badminton deep', init: badminton.init, reducer: badminton.reducer, statTotals: badmintonTotals, partial: true, ctx: SINGLES, derived: (k) => DERIVED.has(k),
    };
    const t = assertContract(sp, toRecords(BAD));
    assert.deepEqual([t.h1.stats.winnersSmash, t.h1.stats.winnersFh, t.h1.stats.ueNetShot, t.h1.stats.feLift, t.a1.stats.sfHigh], [1, 1, 1, 1, 1]);
    assert.deepEqual([t.h1.stats.rl510Pts, t.h1.stats.rl510Won, t.a1.stats.rl04Won, t.a1.stats.rl11Won], [1, 1, 1, 1]);
  });
  test('an EDIT_LOG keeps wing / shot / type / rally length / kitchen / 3rd shot (side-out rallies too)', () => {
    const s = run(badminton.reducer, badminton.init({}), BAD);
    const e = badminton.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(normal(badmintonTotals(e, SINGLES)), normal(badmintonTotals(s, SINGLES)));
    const pb = run(PB.reducer, PB.init({ scoring: 'sideout', playersPerSide: 2 }), [FS('home'), TRACK({ netDetail: true, thirdDetail: true, rallyDetail: true }), P('away'), D({ third: 'lob', atNet: 'away', rallyLen: '5-8' })]);
    assert.equal(pb.events.at(-1)!.kind, 'rally');
    const r = PB.reducer(pb, { type: 'EDIT_LOG', payload: { points: rallyInputs(pb.events) } });
    const last = r.events.at(-1)!;
    assert.deepEqual([last.kind, last.third, last.atNet, last.rallyLen], ['rally', 'lob', 'away', '5-8']);
  });
  test('every racket schema declares its detail and depth keys and stays valid', () => {
    for (const sp of DEPTH_SPORTS) {
      const schema = STAT_SCHEMAS[sp];
      assert.deepEqual(validateSchema(schema as never), [], sp);
      for (const k of [...detailKeys(sp), ...racketExtraKeys(sp)]) assert.ok(statDefIn(schema as never, k), `${sp}.${k}`);
    }
    assert.ok(statDefIn(STAT_SCHEMAS.tabletennis as never, 'serve3Pct'));
    assert.ok(statDefIn(STAT_SCHEMAS.pickleball as never, 'thirdDropShare'));
    assert.ok(statDefIn(STAT_SCHEMAS.padel as never, 'netPtsPct'));
    assert.ok(statDefIn(STAT_SCHEMAS.pickleball as never, 'kitchenPct'));
  });
  const line = (sport: string, stats: Record<string, number>, id = 'm1'): StatLine => ({ id, matchId: id, playerId: 'p', sport, stats } as StatLine);
  test('career: rally length / phases / 3rd shot / shot rows show only for what was tracked', () => {
    const tt = STAT_SCHEMAS.tabletennis as never;
    const secs = careerSections(tt, [line('tabletennis', { points: 10, serve3Pts: 10, serve3Won: 6, receive4Pts: 8, receive4Won: 3, rl12Pts: 9, rl12Won: 5, rl34Pts: 9, rl34Won: 4, rl5Pts: 4, rl5Won: 2, winners: 3, winnersLoop: 2, winnersFh: 3 })]);
    const rally = secs.find((x) => x.id === 'rally');
    assert.ok(rally, secs.map((x) => x.id).join());
    assert.equal(rally!.title, 'Rally phases');
    assert.deepEqual(rally!.rows.slice(0, 2).map((r) => r.key), ['serve3Pct', 'receive4Pct']);
    const shots = secs.find((x) => x.id === 'shots')!.rows.map((r) => r.key);
    assert.ok(shots.includes('winnersLoop') && shots.includes('winnersFh'));
    assert.equal(shots.includes('winnersChop'), false); // a shot row hides at 0
    const plain = careerSections(tt, [line('tabletennis', { points: 10, srvPts: 20, srvPtsWon: 12 })]);
    assert.equal(plain.some((x) => x.id === 'rally' || x.id === 'shots'), false);
    const pb = STAT_SCHEMAS.pickleball as never;
    const third = careerSections(pb, [line('pickleball', { thirdDrop: 6, thirdDropWon: 4, thirdDrive: 2, thirdDriveWon: 0, thirdLob: 0, thirdLobWon: 0 })]).find((x) => x.id === 'third');
    assert.ok(third);
    assert.equal(aggregateValue(pb, statDefIn(pb, 'thirdDropShare')!, [line('pickleball', { thirdDrop: 6, thirdDrive: 2, thirdLob: 0 })]).text, '75%');
    assert.equal(aggregateValue(pb, statDefIn(pb, 'thirdDropPct')!, [line('pickleball', { thirdDrop: 6, thirdDropWon: 4 }), line('pickleball', { points: 9 }, 'm2')]).text, '67%');
  });
});

const normal = (t: Record<string, { side: string; stats: Record<string, number> }>) =>
  Object.fromEntries(Object.entries(t).map(([id, e]) => [id, Object.fromEntries(Object.entries(e.stats).filter(([, x]) => x !== 0).sort())]));
// keep the RallyState import used for the engine's state type
export type _R = RallyState;
