/**
 * SD-157 — tennis at ATP / Infosys "Match Stats" depth: the wing + shot
 * model (old stroke ids normalised on read, never rewritten), the optional
 * net points / rally length / serve speed captures, the KEY STATS / SERVE &
 * RETURN / RALLY / RALLY LENGTH panels (tennis/matchStats.ts), the career
 * keys (statTotals, written only when tracked), the schema / career / leader
 * rows and the "Stats to track" settings. Decision 8: old logs replay
 * identically and show no false zeros.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import { pointInputs, correctionActions } from '../src/sports/rallyEdit.ts';
import { tennisTotals } from '../src/sports/racketTotals.ts';
import {
  applyPointDetail, detailKeys, pdText, strokeOf, strokePhrase, toggleNet, validKmh, LEGACY_TENNIS_STROKES, RETIRED_TENNIS_KEYS,
} from '../src/sports/pointDetail.ts';
import {
  keyStats, rallyLengthRows, rallyRows, serveFilters, serveReturnRows, strokeSummary, tennisCareerKeys, tennisView, TENNIS_EXTRA_KEYS,
} from '../src/sports/tennis/matchStats.ts';
import { detailLiveSettings, TENNIS_TRACK_FIELDS } from '../src/sports/pointDetailSettings.ts';
import { planLiveApply } from '../src/sports/liveSettings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { aggregateValue, rankPlayers, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { planStatSync } from '../src/data/statSync.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const ACE = (side: Side): ScoreAction => ({ type: 'ACE', side });
const DF = (server: Side): ScoreAction => ({ type: 'POINT', side: opp(server), payload: { df: true } });
const D = (payload: Record<string, unknown>): ScoreAction => ({ type: 'POINT_DETAIL', payload });
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const TRACK = (flags: Record<string, boolean>): ScoreAction => ({ type: 'SET_DETAIL', payload: flags });
const ALL_ON = TRACK({ pointDetail: true, serveDetail: true, netDetail: true, rallyDetail: true, speedDetail: true });
const run = (log: ScoreAction[], cfg: Record<string, unknown> = {}) => log.reduce(tennis.reducer, tennis.init(cfg));
const SINGLES = L.ctxOf({ home: ['h1'], away: ['a1'] });
const DOUBLES = L.ctxOf({ home: ['h1', 'h2'], away: ['a1', 'a2'] });
const R1 = { home: ['h1'], away: ['a1'] };
const show = (rows: Array<{ label: string; home: string; away: string }>) => rows.map((r) => `${r.label}: ${r.home} | ${r.away}`);

/**
 * Everything tracked. Game 1, home serves:
 *  1 FH winner (1st serve 190, rally 0-4)            15-0
 *  2 home's BH volley forced error at the net (185, 5-8) 15-15
 *  3 ace on the 2nd serve (160)                       30-15
 *  4 double fault                                     30-30
 *  5 away's FH return unforced error (200)            40-30
 *  6 service winner                                   game home
 * Game 2, away serves:
 *  7 away overhead winner at the net (175, 9+)        15-0
 *  8 home BH return winner (0-4)                      15-15
 *  9 (not described)                                  30-15
 * 10 home wins, both at the net (5-8)                 30-30
 */
const GAME_LOG: ScoreAction[] = [
  FS('home'), ALL_ON,
  P('home'), D({ pd: { how: 'winner', wing: 'fh', shot: 'gs' }, kmh: 190, rallyLen: '0-4' }),
  P('away'), D({ pd: { how: 'fe', wing: 'bh', shot: 'volley' }, atNet: 'home', rallyLen: '5-8', kmh: 185 }),
  ACE('home'), D({ serve: 2, kmh: 160 }),
  DF('home'),
  P('home'), D({ pd: { how: 'ue', wing: 'fh', shot: 'return' }, kmh: 200 }),
  P('home'), D({ pd: { how: 'sw' } }),
  P('away'), D({ pd: { how: 'winner', shot: 'overhead' }, atNet: 'away', rallyLen: '9+', kmh: 175 }),
  P('home'), D({ pd: { how: 'winner', wing: 'bh', shot: 'return' }, rallyLen: '0-4' }),
  P('away'),
  P('home'), D({ atNet: 'both', rallyLen: '5-8' }),
];

describe('SD-157 · Decision 8 — old logs', () => {
  const old = run(L.TENNIS_BO3);
  test('an old log replays identically and writes none of the new keys', () => {
    assert.equal(L.fingerprint(old as never, L.TENNIS_KEYS), L.fingerprint(run(L.TENNIS_BO3) as never, L.TENNIS_KEYS));
    for (const k of ['netDetail', 'rallyDetail', 'speedDetail']) assert.equal(k in old, false, k);
    const t = tennisTotals(old, SINGLES);
    for (const k of [...TENNIS_EXTRA_KEYS, ...detailKeys('tennis')]) assert.equal(k in t.h1.stats, false, k);
    // an EDIT_LOG of the same list is identical too
    const e = tennis.reducer(old, { type: 'EDIT_LOG', payload: { points: pointInputs(old.events) } });
    assert.equal(L.fingerprint(e as never, L.TENNIS_KEYS), L.fingerprint(old as never, L.TENNIS_KEYS));
  });
  test('the panel shows only what an old match can give: no detail, serve, speed, net or rally rows', () => {
    const v = tennisView(old, R1)!;
    assert.deepEqual(v.cov, { detail: false, serve: false, net: false, rally: false, speed: false });
    const ks = keyStats(v);
    assert.deepEqual(ks.map((s) => s.id), ['service', 'points', 'games']);
    assert.deepEqual(ks[0].rows.map((r) => r.key), ['aces', 'dfs']);
    assert.deepEqual(ks[1].rows.map((r) => r.key), ['bpc', 'rcv', 'tot']);
    assert.deepEqual(serveFilters(v), ['all']);
    assert.equal(serveReturnRows(v).some((r) => r.key === 'rtnIn'), false);
  });
  test('SD-107 stroke ids are normalised on read, never rewritten', () => {
    assert.deepEqual(strokeOf({ how: 'winner', stroke: 'fh' }), { wing: 'fh', shot: 'gs' });
    assert.deepEqual(strokeOf({ how: 'winner', stroke: 'bhVolley' }), { wing: 'bh', shot: 'volley' });
    assert.deepEqual(strokeOf({ how: 'winner', stroke: 'overhead' }), { shot: 'overhead' });
    assert.deepEqual(strokeOf({ how: 'ue', stroke: 'volley' }), { shot: 'volley' });
    assert.deepEqual(Object.keys(LEGACY_TENNIS_STROKES).sort(), ['bh', 'bhVolley', 'drop', 'fh', 'fhVolley', 'lob', 'overhead', 'return', 'volley']);
    // the new fields win over a legacy id
    assert.deepEqual(strokeOf({ how: 'winner', stroke: 'fh', wing: 'bh' }), { wing: 'bh' });
  });
  // an SD-107 match: forehand, FH volley, BH volley winners; an overhead at the net; volley and BH errors
  const LEGACY: ScoreAction[] = [
    FS('home'), TRACK({ pointDetail: true }),
    P('home'), D({ pd: { how: 'winner', stroke: 'fh' } }),
    P('home'), D({ pd: { how: 'winner', stroke: 'fhVolley' } }),
    P('home'), D({ pd: { how: 'winner', stroke: 'bhVolley' } }),
    P('home'), D({ pd: { how: 'winner', stroke: 'overhead', net: true } }),
    P('away'), D({ pd: { how: 'ue', stroke: 'volley' } }),
    P('away'), D({ pd: { how: 'ue', stroke: 'bh' } }),
  ];
  const legacy = run(LEGACY);
  test('a legacy-detail match: the log keeps its ids; careers and panels read them in the new model', () => {
    const pts = legacy.events.filter((e) => e.kind === 'point');
    assert.deepEqual(pts.map((e) => e.pd?.stroke), ['fh', 'fhVolley', 'bhVolley', 'overhead', 'volley', 'bh']);
    assert.ok(pts.every((e) => !e.pd?.wing && !e.pd?.shot && !e.atNet));
    const t = tennisTotals(legacy, SINGLES).h1.stats;
    assert.deepEqual(
      [t.winners, t.winnersFh, t.winnersBh, t.winnersGs, t.winnersVolley, t.winnersOverhead, t.winnersFhVolley, t.winnersBhVolley],
      [4, 2, 1, 1, 2, 1, 0, 0],
    );
    assert.deepEqual([t.unforcedErrors, t.ueVolley, t.ueBh, t.ueGs], [2, 1, 1, 1]);
    // the old "At net" flag = the winner at the net
    assert.deepEqual([t.netPts, t.netPtsWon], [1, 1]);
    const v = tennisView(legacy, R1)!;
    assert.deepEqual(show(rallyRows(v, 'all', 'fhW')).slice(0, 3), ['Groundstroke: 1 | 0', 'Return: 0 | 0', 'Volley: 1 | 0']);
    assert.equal(rallyRows(v, 'all', 'bhUe')[0].home, '1');
    assert.equal(keyStats(v).find((s) => s.id === 'points')!.rows.find((r) => r.key === 'net')!.home, '1/1 (100%)');
    assert.equal(pdText(pts[1].pd), 'Forehand volley winner'); // the timeline text is unchanged
  });
  test('re-syncing an older line clears the retired volley keys (no double count)', () => {
    const existing = [{ id: 'l1', playerId: 'h1', stats: { winners: 4, winnersFh: 1, winnersFhVolley: 1, winnersBhVolley: 1 } }];
    const w = planStatSync(existing, tennisTotals(legacy, SINGLES), (x) => x).find((x) => x.playerId === 'h1')!;
    assert.deepEqual([w.stats.winnersFh, w.stats.winnersFhVolley, w.stats.winnersBhVolley, w.stats.winnersVolley], [2, 0, 0, 2]);
    assert.deepEqual([...RETIRED_TENNIS_KEYS], ['winnersFhVolley', 'winnersBhVolley']);
  });
});

describe('SD-157 · capture (POINT_DETAIL atNet / rallyLen / kmh)', () => {
  test('validKmh: a plausible whole km/h, else nothing', () => {
    assert.deepEqual(['182', 182.6, ' 95 ', 30, 270].map(validKmh), [182, 183, 95, 30, 270]);
    assert.deepEqual(['', 'abc', 29, 271, 999, NaN, null].map(validKmh), [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });
  test('set, clear, ignore invalid; never on a double fault; the score never moves', () => {
    const s0 = run([FS('home'), P('home')]);
    assert.equal(applyPointDetail(s0.events, { kmh: 999 }), null);
    assert.equal(applyPointDetail(s0.events, { rallyLen: '10+', atNet: 'none' }), null);
    const s1 = run([FS('home'), P('home'), D({ kmh: '182', rallyLen: '9+', atNet: 'both' })]);
    const e = s1.events.at(-1)!;
    assert.deepEqual([e.kmh, e.rallyLen, e.atNet], [182, '9+', 'both']);
    const s2 = tennis.reducer(s1, D({ kmh: null, atNet: null }));
    assert.deepEqual([s2.events.at(-1)!.kmh, s2.events.at(-1)!.rallyLen, s2.events.at(-1)!.atNet], [undefined, '9+', undefined]);
    assert.deepEqual([s1.pts, s1.games], [s0.pts, s0.games]);
    const df = run([FS('home'), DF('home'), D({ kmh: 180, rallyLen: '0-4' })]);
    assert.equal(df.events.at(-1)!.kmh, undefined);
    // a full annotated game scores exactly like the bare one
    const bare = run(GAME_LOG.filter((a) => a.type !== 'POINT_DETAIL' && a.type !== 'SET_DETAIL'));
    const full = run(GAME_LOG);
    assert.deepEqual([full.pts, full.games, full.events.map((x) => [x.label, x.side])], [bare.pts, bare.games, bare.events.map((x) => [x.label, x.side])]);
  });
  test('toggleNet: home → both → away → none', () => {
    assert.equal(toggleNet(undefined, 'home'), 'home');
    assert.equal(toggleNet('home', 'away'), 'both');
    assert.equal(toggleNet('both', 'home'), 'away');
    assert.equal(toggleNet('away', 'away'), null);
  });
  test('wing / shot texts', () => {
    assert.equal(pdText({ how: 'fe', wing: 'bh', shot: 'volley' }), 'Forced error (backhand volley)');
    assert.equal(pdText({ how: 'winner', wing: 'fh', shot: 'gs' }), 'Forehand winner');
    assert.equal(pdText({ how: 'winner', shot: 'overhead' }), 'Overhead winner');
    assert.equal(pdText({ how: 'ue', wing: 'fh', shot: 'return' }), 'Unforced error (forehand return)');
    assert.equal(pdText({ how: 'fe' }), 'Forced error');
    assert.equal(strokePhrase({ wing: 'fh', shot: 'drop' }, true), 'Forehand Drop Shot');
    assert.equal(strokePhrase({ shot: 'passing' }, true), 'Passing Shot');
  });
  test('flags: format keys and SET_DETAIL, absent unless switched on', () => {
    assert.equal('netDetail' in tennis.init({}), false);
    const s = tennis.init({ netDetail: true, rallyDetail: true, speedDetail: true });
    assert.deepEqual([s.netDetail, s.rallyDetail, s.speedDetail], [true, true, true]);
    const t = run([TRACK({ speedDetail: true })]);
    assert.equal(t.speedDetail, true);
    assert.equal(tennis.reducer(t, TRACK({ speedDetail: true })), t); // no change → same state
  });
  test('EDIT_LOG keeps every annotation; a correction keeps the other points’ ones', () => {
    const s = run(GAME_LOG);
    const sig = (st: tennis.TennisState) => st.events.filter((e) => e.kind === 'point' || e.kind === 'ace')
      .map((e) => [e.pd?.how ?? null, e.pd?.wing ?? null, e.pd?.shot ?? null, e.atNet ?? null, e.rallyLen ?? null, e.kmh ?? null, e.serve ?? null]);
    const e = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(sig(e), sig(s));
    assert.deepEqual(tennisTotals(e, SINGLES), tennisTotals(s, SINGLES));
    // delete point 2 (home's volley error at the net)
    const acts = correctionActions(pointInputs(s.events), pointInputs(s.events).filter((_, i) => i !== 1), () => undefined);
    const c = acts.reduce(tennis.reducer, s);
    assert.deepEqual(sig(c), sig(s).filter((_, i) => i !== 1));
    assert.equal(tennisTotals(c, SINGLES).h1.stats.netPts, 1); // only point 10 left
  });
});

describe('SD-157 · match stats panels', () => {
  const s = run(GAME_LOG);
  const v = tennisView(s, R1)!;
  test('coverage', () => {
    assert.deepEqual(v.cov, { detail: true, serve: true, net: true, rally: true, speed: true });
    assert.equal(v.points.length, 10);
  });
  test('KEY STATS — Service', () => {
    assert.deepEqual(show(keyStats(v)[0].rows), [
      'Aces: 1 | 0', 'Double faults: 1 | 0',
      '1st serve in: 4/6 (67%) | 4/4 (100%)', 'Win 1st serve: 3/4 (75%) | 2/4 (50%)', 'Win 2nd serve: 1/2 (50%) | –',
      'Service winners: 1 | 0',
      'Fastest serve: 200 km/h | 175 km/h', '1st serve average: 192 km/h | 175 km/h', '2nd serve average: 160 km/h | –',
    ]);
  });
  test('KEY STATS — Winners & errors, Points won, Games', () => {
    const [, shots, points, games] = keyStats(v);
    assert.deepEqual(show(shots.rows), [
      'Winners: 2 | 1', 'Return winners: 1 | 0', 'Unforced errors: 0 | 1', 'Return unforced errors: 0 | 1', 'Forced errors: 1 | 0', 'Winners / UE: 2–0 | 1.00',
    ]);
    assert.deepEqual(show(points.rows), [
      'Break points won: – | –', 'Net points won: 1/2 (50%) | 1/2 (50%)', 'Receiving points won: 2/4 (50%) | 2/6 (33%)', 'Total points won: 6/10 (60%) | 4/10 (40%)',
    ]);
    assert.deepEqual(games.rows.map((r) => r.key), ['held', 'brk', 'bps', 'run', 'lead']);
    assert.equal(games.rows[0].home, '1/1 (100%)');
    assert.deepEqual(keyStats(v, 1), keyStats(v, 'all')); // one set so far
    assert.deepEqual(keyStats(v, 2), []);
  });
  test('SERVE & RETURN — Total, 1st serve, 2nd serve (return in play leaves double faults out)', () => {
    assert.deepEqual(serveFilters(v), ['all', 1, 2]);
    assert.deepEqual(show(serveReturnRows(v, 'all', 'all')), [
      'Aces: 1 | 0', 'Service points played: 6 | 4', 'Service points won: 4/6 (67%) | 2/4 (50%)',
      'Return points played: 4 | 6', 'Return points in play: 2/2 (100%) | 2/5 (40%)', 'Return points won: 2/4 (50%) | 2/6 (33%)',
    ]);
    assert.deepEqual(show(serveReturnRows(v, 'all', 1)), [
      'Aces: 0 | 0', 'Service points played: 4 | 4', 'Service points won: 3/4 (75%) | 2/4 (50%)',
      'Return points played: 4 | 4', 'Return points in play: 2/2 (100%) | 2/4 (50%)', 'Return points won: 2/4 (50%) | 1/4 (25%)',
    ]);
    assert.deepEqual(show(serveReturnRows(v, 'all', 2)), [
      'Aces: 1 | 0', 'Service points played: 2 | 0', 'Service points won: 1/2 (50%) | –',
      'Return points played: 0 | 2', 'Return points in play: – | 0/1 (0%)', 'Return points won: – | 1/2 (50%)',
    ]);
  });
  test('RALLY — categories by shot, and the stroke summary (a wingless overhead is in neither wing)', () => {
    assert.equal(rallyRows(v, 'all', 'fhW').find((r) => r.key === 'gs')!.home, '1');
    assert.equal(rallyRows(v, 'all', 'bhW').find((r) => r.key === 'return')!.home, '1');
    assert.equal(rallyRows(v, 'all', 'fhUe').find((r) => r.key === 'return')!.away, '1');
    assert.equal(rallyRows(v, 'all', 'bhFe').find((r) => r.key === 'volley')!.home, '1');
    assert.deepEqual(rallyRows(v, 'all', 'fhW').map((r) => r.label), ['Groundstroke', 'Return', 'Volley', 'Approach', 'Passing', 'Lob', 'Overhead', 'Drop shots']);
    assert.deepEqual(strokeSummary(v).map((r) => [r.cat, r.home, r.away]), [
      ['fhW', 1, 0], ['bhW', 1, 0], ['fhUe', 0, 1], ['bhUe', 0, 0], ['fhFe', 0, 0], ['bhFe', 1, 0],
    ]);
  });
  test('RALLY LENGTH — points won per bucket with the share', () => {
    assert.deepEqual(show(rallyLengthRows(v)), ['0–4 shots: 2 (100%) | 0 (0%)', '5–8 shots: 1 (50%) | 1 (50%)', '9+ shots: 0 (0%) | 1 (100%)']);
    const quiet = tennisView(run([FS('home'), TRACK({ rallyDetail: true }), P('home')]), R1)!;
    assert.deepEqual(show(rallyLengthRows(quiet)), ['0–4 shots: – | –', '5–8 shots: – | –', '9+ shots: – | –']);
  });
  test('speed without 1st / 2nd serve tracking: one "Serve average", no serve filters', () => {
    const sp = tennisView(run([FS('home'), TRACK({ speedDetail: true }), P('home'), D({ kmh: 150 }), P('away'), D({ kmh: 170 })]), R1)!;
    const svc = keyStats(sp)[0].rows;
    assert.deepEqual(show(svc.filter((r) => r.key.startsWith('kmh'))), ['Fastest serve: 170 km/h | –', 'Serve average: 160 km/h | –']);
    assert.deepEqual(serveFilters(sp), ['all']);
    assert.equal(keyStats(sp).some((x) => x.id === 'shots'), false);
  });
});

describe('SD-157 · careers (statTotals) — only what was tracked', () => {
  test('every tracked key on both players, server-side speed', () => {
    const t = tennisTotals(run(GAME_LOG), SINGLES);
    const pick = (o: Record<string, number>, ks: string[]) => ks.map((k) => o[k]);
    assert.deepEqual(pick(t.h1.stats, ['netPts', 'netPtsWon', 'rl04Pts', 'rl04Won', 'rl58Pts', 'rl58Won', 'rl9Pts', 'rl9Won', 'rtnInPlay', 'rtnInPlayOf']), [2, 1, 2, 2, 2, 1, 1, 0, 2, 2]);
    assert.deepEqual(pick(t.a1.stats, ['netPts', 'netPtsWon', 'rl04Won', 'rl58Won', 'rl9Won', 'rtnInPlay', 'rtnInPlayOf']), [2, 1, 0, 1, 1, 2, 5]);
    assert.deepEqual(pick(t.h1.stats, ['srvKmhSum', 'srvKmhN', 'srv1KmhSum', 'srv1KmhN', 'srv2KmhSum', 'srv2KmhN', 'srvKmhMax']), [735, 4, 575, 3, 160, 1, 200]);
    assert.deepEqual(pick(t.a1.stats, ['srvKmhSum', 'srvKmhN', 'srv2KmhN', 'srvKmhMax']), [175, 1, 0, 175]);
    assert.deepEqual(pick(t.h1.stats, ['winners', 'winnersFh', 'winnersBh', 'winnersGs', 'winnersReturn', 'forcedErrors', 'feBh', 'feVolley', 'serviceWinners']), [2, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(pick(t.a1.stats, ['winners', 'winnersOverhead', 'winnersFh', 'unforcedErrors', 'ueFh', 'ueReturn']), [1, 1, 0, 1, 1, 1]);
  });
  test('a speed-only match writes speed keys only; a net-only match net keys only', () => {
    const sp = tennisTotals(run([FS('home'), TRACK({ speedDetail: true }), P('home'), D({ kmh: 150 })]), SINGLES);
    assert.deepEqual([sp.h1.stats.srvKmhMax, sp.h1.stats.srvKmhN, 'srvKmhMax' in sp.a1.stats, sp.a1.stats.srvKmhN], [150, 1, false, 0]);
    for (const k of ['winners', 'netPts', 'rl04Pts', 'rtnInPlay', 'srv1Pts']) assert.equal(k in sp.h1.stats, false, k);
    const net = tennisTotals(run([FS('home'), TRACK({ netDetail: true }), P('home'), D({ atNet: 'home' })]), SINGLES);
    assert.deepEqual([net.h1.stats.netPts, net.h1.stats.netPtsWon, net.a1.stats.netPts, net.a1.stats.netPtsWon], [1, 1, 0, 0]);
    for (const k of ['winners', 'srvKmhN', 'rl04Pts']) assert.equal(k in net.h1.stats, false, k);
  });
  test('doubles: speed goes to the named server; net / rally points are the side’s (both players)', () => {
    // no serving-order pick: game 1 h1, game 2 a1, game 3 h2 (roster order)
    const log: ScoreAction[] = [
      FS('home'), TRACK({ speedDetail: true, rallyDetail: true }),
      P('home'), D({ kmh: 180, rallyLen: '9+' }), ...L.tGame('home').slice(1),
      P('away'), D({ kmh: 170 }), ...L.tGame('away').slice(1),
      P('home'), D({ kmh: 150 }),
    ];
    const t = tennisTotals(run(log, { playersPerSide: 2 }), DOUBLES);
    assert.deepEqual([t.h1.stats.srvKmhMax, t.h2.stats.srvKmhMax, t.a1.stats.srvKmhMax, 'srvKmhMax' in t.a2.stats], [180, 150, 170, false]);
    assert.deepEqual([t.h1.stats.rl9Won, t.h2.stats.rl9Won, t.a1.stats.rl9Pts], [1, 1, 1]);
  });
  test('tennisCareerKeys: nothing for an untracked match', () => {
    assert.deepEqual(tennisCareerKeys(tennisView(run(L.TENNIS_BO3), R1), 'home', 'h1'), {});
    assert.deepEqual(tennisCareerKeys(null, 'home', 'h1'), {});
  });
});

describe('SD-157 · schema, career rows, leaders, settings', () => {
  const sch = STAT_SCHEMAS.tennis as never;
  const line = (stats: Record<string, number>, id = 'm1', playerId = 'p'): StatLine => ({ id, matchId: id, playerId, sport: 'tennis', stats } as StatLine);
  test('every key tennis writes is declared, labelled and the schema is valid', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.tennis), []);
    for (const k of [...TENNIS_EXTRA_KEYS, ...detailKeys('tennis')]) {
      const d = statDefIn(sch, k);
      assert.ok(d && d.label && d.label !== k, k);
    }
    assert.equal(statDefIn(sch, 'srvKmhMax')!.leaderLabel, 'Fastest serve');
  });
  test('Forehand winners / Volley winners read old (SD-107) and new lines the same way', () => {
    const old = line({ winners: 4, winnersFh: 2, winnersFhVolley: 1, winnersBh: 1, winnersBhVolley: 0 }, 'm1');
    const now = line({ winners: 5, winnersFh: 3, winnersFhVolley: 0, winnersBh: 2, winnersBhVolley: 0, winnersVolley: 2 }, 'm2');
    assert.equal(aggregateValue(sch, statDefIn(sch, 'winnersFh')!, [old, now]).value, 6);
    assert.equal(aggregateValue(sch, statDefIn(sch, 'winnersVolley')!, [old, now]).value, 3);
  });
  test('fastest serve is the best match; averages are sum ÷ count over tracked lines', () => {
    const lines = [line({ srvKmhMax: 201, srvKmhSum: 360, srvKmhN: 2, srv1KmhSum: 360, srv1KmhN: 2 }, 'm1'), line({ srvKmhMax: 215, srvKmhSum: 190, srvKmhN: 1, srv1KmhSum: 0, srv1KmhN: 0 }, 'm2'), line({ points: 30 }, 'm3')];
    const fastest = aggregateValue(sch, statDefIn(sch, 'srvKmhMax')!, lines);
    assert.deepEqual([fastest.value, fastest.text, fastest.line?.id], [215, '215', 'm2']);
    assert.equal(aggregateValue(sch, statDefIn(sch, 'serveKmh')!, lines).text, '183');
    assert.equal(aggregateValue(sch, statDefIn(sch, 'firstServeKmh')!, lines).text, '180');
    assert.equal(aggregateValue(sch, statDefIn(sch, 'srvKmhMax')!, [line({ points: 3 })]).tracked, false);
    const ranked = rankPlayers(sch, statDefIn(sch, 'srvKmhMax')!, [line({ srvKmhMax: 190 }, 'x1', 'p1'), line({ srvKmhMax: 205 }, 'x2', 'p2'), line({ points: 1 }, 'x3', 'p3')]);
    assert.deepEqual(ranked.map((r) => r.playerId), ['p2', 'p1']);
  });
  test('career sections: speed, return in play, net % and rally length only when tracked', () => {
    const secs = careerSections(sch, [line({ srvKmhMax: 200, srvKmhSum: 200, srvKmhN: 1, netPts: 4, netPtsWon: 3, rl04Pts: 5, rl04Won: 3, rtnInPlay: 6, rtnInPlayOf: 8, winners: 2 })]);
    const rows = (id: string) => secs.find((x) => x.id === id)?.rows.map((r) => [r.key, r.value]) ?? [];
    assert.ok(rows('serve').some(([k, val]) => k === 'srvKmhMax' && val === '200'));
    assert.ok(rows('serve').some(([k, val]) => k === 'rtnInPlayPct' && val === '75%'));
    assert.ok(rows('shots').some(([k, val]) => k === 'netPtsPct' && val === '75%'));
    assert.deepEqual(rows('rally'), [['rl04Pct', '60%']]);
    const plain = careerSections(sch, [line({ points: 10, srvPts: 30, srvPtsWon: 20 })]);
    assert.equal(plain.some((x) => x.id === 'rally' || x.id === 'shots'), false);
    assert.equal(plain.find((x) => x.id === 'serve')!.rows.some((r) => r.key === 'srvKmhMax'), false);
  });
  test('Scoring settings: every option under "Stats to track" with a hint; event mode', () => {
    const ls = detailLiveSettings('tennis');
    assert.deepEqual(ls.fields.map((f) => [f.key, f.group]), TENNIS_TRACK_FIELDS.map((f) => [f.key, 'Stats to track']));
    assert.ok(ls.fields.every((f) => f.type === 'toggle' && f.default === false && (f.hint ?? '').length > 10));
    const fresh = tennis.init();
    assert.deepEqual(ls.read(fresh), { pointDetail: false, serveDetail: false, netDetail: false, rallyDetail: false, speedDetail: false });
    assert.deepEqual(planLiveApply(ls as never, fresh, 0, ls.read(fresh), { ...ls.read(fresh), speedDetail: true }), { kind: 'format', patch: { speedDetail: true } });
    const live = run([FS('home'), P('home')]);
    const plan = planLiveApply(ls as never, live, 1, ls.read(live), { ...ls.read(live), rallyDetail: true, netDetail: true });
    assert.deepEqual(plan, { kind: 'event', action: { type: 'SET_DETAIL', payload: { rallyDetail: true, netDetail: true } } });
    assert.deepEqual(ls.read(tennis.reducer(live, (plan as { action: ScoreAction }).action)), { pointDetail: false, serveDetail: false, netDetail: true, rallyDetail: true, speedDetail: false });
    // the other racket sports have their own card (deep wave: padel adds net points and rally length)
    assert.deepEqual(detailLiveSettings('padel').fields.map((f) => f.key), ['pointDetail', 'serveDetail', 'netDetail', 'rallyDetail']);
  });
});
