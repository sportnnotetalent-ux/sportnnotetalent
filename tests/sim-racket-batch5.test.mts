/**
 * Quality mandate step 6 for racket batch 5 (docs/security/breaks/racket-batch5.md):
 * 600 random padel matches with time violations (marked and old-style), 400
 * tennis matches through the shared loss-of-serve code, and 600 random
 * badminton / table tennis / squash / pickleball matches with conduct,
 * timeouts, lets, video reviews, the new detail choices and hostile values.
 * Checks: a time "fault · loss of serve" is exactly a Fault (1st serve) or a
 * double fault (2nd); old-style records never score; the Conduct & timeouts
 * rows add up (per game they sum to the match); markers never move the score;
 * a correction keeps every marker; ≥ 500 distinct players.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as padel from '../src/sports/padel/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs, rallyServingSide, type RallyState } from '../src/sports/rallyEngine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { conductRows, isMark, type RacketSport } from '../src/sports/conduct.ts';
import { conductAction } from '../src/sports/racketActions.ts';
import { DETAIL_HOWS, RACKET_SHOTS, errTypeOf, howDef, type DepthSport } from '../src/sports/pointDetail.ts';
import { errorTypeRows, keyStats, racketTally, racketView } from '../src/sports/racketMatchStats.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 5105;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
const side = (): Side => (rnd(2) ? 'home' : 'away');
const players = new Set<string>();
const TV = (s: Side, level: 'warning' | 'fault' | 'point', p?: string): ScoreAction => conductAction(s, { level, track: 'time' }, p ? { id: p } : undefined, 1);
const score = (x: { pts: unknown; games: unknown; sets: unknown; ended: boolean }) => JSON.stringify([x.pts, x.games, x.sets, x.ended]);
const marks = (ev: LiveEvent[]) => ev.filter((e) => isMark(e)).map((e) => [e.kind, e.side, e.label, e.rev, e.tmo]);

/** the sum of every game's / set's rows equals the match's (counts only) */
function rowsAddUp(sport: RacketSport, events: LiveEvent[], periods: number) {
  const all = conductRows(sport, events);
  for (const r of all) {
    if (r.key === 'rev') continue;
    let h = 0, a = 0;
    for (let p = 1; p <= periods; p++) {
      const x = conductRows(sport, events, p).find((y) => y.key === r.key);
      h += x?.hv ?? 0; a += x?.av ?? 0;
    }
    assert.deepEqual([h, a], [r.hv, r.av], `${sport} ${r.key}`);
  }
  // penalty points conceded = the points a penalty gave the other side
  const pen = { home: 0, away: 0 };
  for (const e of events) if (e.kind === 'point' && e.pen && (e.pen.by === 'home' || e.pen.by === 'away')) { pen[e.pen.by] += 1; assert.equal(e.side, opp(e.pen.by)); }
  const row = all.find((r) => r.key === 'penPts');
  assert.deepEqual([row?.hv ?? 0, row?.av ?? 0], [pen.home, pen.away]);
}

test('600 padel matches: a marked time fault is a Fault or a double fault; an old-style one never scores', () => {
  let faults = 0, doubles = 0, records = 0;
  for (let m = 0; m < 600; m++) {
    const cfg = { playersPerSide: rnd(2) ? 2 : 1, deuce: pick(['advantage', 'golden', 'star']), gamesPerSet: pick([4, 6]), setsToWin: pick([1, 2]), serveDetail: rnd(2) === 0 };
    const ids = { home: [`p${m}h1`, `p${m}h2`], away: [`p${m}a1`, `p${m}a2`] };
    for (const id of [...ids.home, ...ids.away]) players.add(id);
    let s = padel.reducer(padel.init(cfg), { type: 'SET_FIRST_SERVER', payload: { side: side() } });
    let oracle = s; // the same match with FAULT / double fault for each marked time fault
    for (let i = 0; i < 300 && !s.ended; i++) {
      const server = padel.serveInfo(s).side as Side;
      const roll = rnd(12);
      let a: ScoreAction; let o: ScoreAction | null;
      if (roll < 2) {
        const who = rnd(4) ? server : opp(server);
        a = TV(who, 'fault', pick(ids[who]));
        o = who !== server ? null : s.fault ? { type: 'POINT', side: opp(server), payload: { df: true } } : { type: 'FAULT', side: server };
      } else if (roll === 2) { a = { type: 'CONDUCT', side: server, payload: { level: 'fault', track: 'time' } }; o = null; } // old style: a record
      else if (roll === 3) { a = { type: 'FAULT', side: server }; o = a; }
      else if (roll === 4) { a = TV(side(), pick(['warning', 'point'] as const)); o = a.payload!.level === 'point' ? a : null; }
      else if (roll === 5) { a = { type: 'TIMEOUT', side: side(), payload: { t: pick(['timeout', 'medical', '__proto__']) } }; o = null; }
      else { a = { type: 'POINT', side: side() }; o = a; }
      const before = s;
      s = padel.reducer(s, a);
      if (o) oracle = padel.reducer(oracle, o);
      if (a.type === 'CONDUCT' && a.payload?.level === 'fault') {
        if (a.payload.los && a.side === server) { if (before.fault) doubles++; else faults++; } else { records++; assert.equal(score(s), score(before), 'a record never scores'); assert.equal(!!s.fault, !!before.fault); }
      }
      assert.equal(score(s), score(oracle), `match ${m} step ${i}`);
      assert.equal(!!s.fault, !!oracle.fault);
    }
    // the points carry the same serve / df as the oracle's
    const sig = (x: padel.PadelState) => JSON.stringify(x.events.filter((e) => e.kind === 'point' && !e.pen).map((e) => [e.side, !!e.df, e.serve ?? null]));
    assert.equal(sig(s), sig(oracle));
    // a correction keeps the score and every marker
    const again = padel.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.equal(score(again), score(s));
    assert.deepEqual(marks(again.events), marks(s.events));
    rowsAddUp('padel', s.events, s.sets.length + (s.ended ? 0 : 1));
    if (s.events.length) assert.ok(racketView('padel', s));
  }
  assert.ok(faults > 200 && doubles > 50 && records > 200, `${faults} ${doubles} ${records}`);
});

test('400 tennis matches: the shared loss-of-serve is unchanged (oracle: Fault / double fault)', () => {
  for (let m = 0; m < 400; m++) {
    let s = tennis.reducer(tennis.init(), { type: 'SET_FIRST_SERVER', payload: { side: side() } });
    let oracle = s;
    for (let i = 0; i < 300 && !s.ended; i++) {
      const server = tennis.serveInfo(s).side as Side;
      const roll = rnd(10);
      let a: ScoreAction; let o: ScoreAction | null;
      if (roll < 2) {
        // tennis scores it with or without the mark (TF4)
        a = rnd(2) ? TV(server, 'fault') : { type: 'CONDUCT', side: server, payload: { level: 'fault', track: 'time' } };
        o = s.fault ? { type: 'POINT', side: opp(server), payload: { df: true } } : { type: 'FAULT', side: server };
      } else if (roll === 2) { a = TV(opp(server), 'fault'); o = null; } else { a = { type: 'POINT', side: side() }; o = a; }
      s = tennis.reducer(s, a);
      oracle = tennis.reducer(oracle, o ?? { type: 'NOOP' });
      assert.equal(score(s), score(oracle));
    }
    rowsAddUp('tennis', s.events, s.sets.length + (s.ended ? 0 : 1));
  }
});

const ENGINES = {
  tabletennis: makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }),
  squash: makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }),
  pickleball: makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } }),
};
type GameSport = 'badminton' | keyof typeof ENGINES;
const HOSTILE = ['__proto__', 'side', '', 7, null];

test('600 badminton / table tennis / squash / pickleball matches: markers, rows, details', () => {
  let lets = 0, reviews = 0, refusedReviews = 0, details = 0;
  for (let m = 0; m < 600; m++) {
    const sport: GameSport = pick(['badminton', 'tabletennis', 'squash', 'pickleball'] as const);
    const dbl = sport !== 'squash' && rnd(2) === 0;
    const cfg = { playersPerSide: dbl ? 2 : 1, pointDetail: true, ...(sport === 'pickleball' && rnd(2) ? { scoring: 'sideout' } : {}) };
    const ids = { home: dbl ? [`g${m}h1`, `g${m}h2`] : [`g${m}h1`], away: dbl ? [`g${m}a1`, `g${m}a2`] : [`g${m}a1`] };
    for (const id of [...ids.home, ...ids.away]) players.add(id);
    const r = (sport === 'badminton' ? badminton.reducer : ENGINES[sport].reducer) as (s: RallyState, a: ScoreAction) => RallyState;
    const i0 = (sport === 'badminton' ? badminton.init(cfg) : ENGINES[sport].init(cfg)) as RallyState;
    let s = r(i0, { type: 'SET_FIRST_SERVER', payload: { side: side() } });
    const shots = RACKET_SHOTS[sport as DepthSport].map((x) => x.id);
    for (let i = 0; i < 400 && !s.ended; i++) {
      const roll = rnd(16);
      const before = s;
      let a: ScoreAction;
      if (roll === 0) a = { type: 'LET', ...(rnd(2) ? { side: side() } : {}) };
      else if (roll === 1) a = { type: 'REVIEW', side: rnd(8) ? side() : ('x' as Side), payload: { upheld: rnd(5) ? rnd(2) === 0 : pick(HOSTILE) } };
      else if (roll === 2) a = { type: 'TIMEOUT', side: side(), payload: { t: pick(['timeout', 'medical', 'toilet', '__proto__']) } };
      else if (roll === 3) a = { type: 'CONDUCT', side: side(), payload: { level: pick(['warning', 'point', 'point2', 'fault', 'referee', 'nope']) } };
      else if (roll === 4) {
        const how = pick([...DETAIL_HOWS[sport as DepthSport].map((h) => h.how), 'edge', '__proto__']);
        const d = howDef(sport as DepthSport, how as never);
        const stroke = d?.strokes && rnd(2) ? pick([...d.strokes, ...HOSTILE]) : undefined;
        a = { type: 'POINT_DETAIL', payload: { pd: { how, ...(stroke !== undefined ? { stroke } : {}), ...(rnd(2) ? { shot: pick([...shots, '__proto__']) } : {}) } } };
      } else a = { type: 'POINT', side: side() };
      s = r(s, a);
      if (a.type === 'LET' || a.type === 'REVIEW' || a.type === 'TIMEOUT' || (a.type === 'CONDUCT' && ['warning', 'fault', 'referee'].includes(String(a.payload?.level)))) {
        assert.equal(JSON.stringify([s.current, s.games, s.ended]), JSON.stringify([before.current, before.games, before.ended]), 'a marker never scores');
      }
      if (a.type === 'LET') {
        if (sport === 'pickleball') assert.equal(s, before); else if (!before.ended) { assert.equal(s.events.at(-1)!.kind, 'let'); lets++; }
      }
      if (a.type === 'REVIEW') {
        if (sport !== 'squash' || typeof a.payload?.upheld !== 'boolean' || (a.side !== 'home' && a.side !== 'away')) assert.equal(s, before);
        else if (s === before) refusedReviews++; else reviews++;
      }
      if (a.type === 'POINT_DETAIL' && s !== before) details++;
    }
    // every stored detail is valid for the sport
    for (const e of s.events) {
      if (!e.pd) continue;
      assert.ok(howDef(sport as DepthSport, e.pd.how), e.pd.how);
      if (e.pd.shot) assert.ok(shots.includes(e.pd.shot), String(e.pd.shot));
    }
    const v = racketView(sport as DepthSport, s, ids);
    if (v) {
      const t = racketTally(v);
      for (const x of ['home', 'away'] as Side[]) {
        const typed = errorTypeRows(v).filter((row) => row.key.startsWith('sf-')).reduce((n, row) => n + (x === 'home' ? row.hv : row.av), 0);
        assert.ok(typed <= t[x].sf, 'typed service faults ≤ service faults');
      }
      const sec = keyStats(v).find((q) => q.id === 'conduct');
      assert.equal(!!sec, conductRows(sport, s.events).length > 0 && v.st.match.rallies > 0);
    }
    rowsAddUp(sport, s.events, s.games.length + (s.ended ? 0 : 1));
    // a correction keeps every marker and the score
    const again = r(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.equal(JSON.stringify([again.current, again.games]), JSON.stringify([s.current, s.games]));
    assert.deepEqual(marks(again.events), marks(s.events));
    void rallyServingSide; void errTypeOf;
  }
  assert.ok(lets > 300 && reviews > 50 && refusedReviews > 5 && details > 1000, `${lets} ${reviews} ${refusedReviews} ${details}`);
});

test('at least 500 simulated players', () => assert.ok(players.size >= 500, String(players.size)));
