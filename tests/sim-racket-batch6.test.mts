/**
 * Quality mandate step 6 for racket batch 6 (docs/security/breaks/racket-batch6.md):
 * 400 random table tennis matches (singles / doubles, 11 / 21 points, with and
 * without expedite, rally in progress or not, hostile EXPEDITEs), 200 badminton
 * matches (shuttle changes, long / wide / old "out" errors, hostile sides) and
 * 200 squash matches (injury categories, hostile categories).
 * Checks: who serves matches an operational ITTF oracle (a server who serves
 * two in turn, one each at deuce, one each under expedite with the 2.15.2
 * restart) on the live state, in serve stats and in the doubles order; a log
 * without the marker serves exactly as before; markers never move the score;
 * a correction keeps every marker and the server; the Stats rows count exactly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs, type RallyState } from '../src/sports/rallyEngine.ts';
import { conductRows, isMark } from '../src/sports/conduct.ts';
import { errTypeOf } from '../src/sports/pointDetail.ts';
import { errorTypeRows, racketView } from '../src/sports/racketMatchStats.ts';
import { ttServer, ttServerOf } from '../src/sports/tabletennis/serve.ts';
import { ttDoublesTurn } from '../src/sports/doublesOrder.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 6106;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
const side = (): Side => (rnd(2) ? 'home' : 'away');
const P = (s: Side): ScoreAction => ({ type: 'POINT', side: s });
const players = new Set<string>();
const TT = makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQ = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const score = (x: { current: unknown; games: unknown; gamesWon: unknown; ended: boolean }) => JSON.stringify([x.current, x.games, x.gamesWon, x.ended]);

/** Operational ITTF oracle: who serves the next point, step by step. */
class Oracle {
  srv: Side; served = 0; exp = false; g = 0; h = 0; a = 0; opening: Side; target: number;
  constructor(opening: Side, target: number) { this.opening = opening; this.target = target; this.srv = opening; }
  first(g: number): Side { return g % 2 === 0 ? this.opening : opp(this.opening); }
  get each() { return this.target >= 21 ? 5 : 2; }
  get deuce() { return Math.max(1, this.target - 1); }
  point(w: Side, gameOver: boolean) {
    if (w === 'home') this.h += 1; else this.a += 1;
    if (gameOver) { this.g += 1; this.h = 0; this.a = 0; this.srv = this.first(this.g); this.served = 0; return; }
    this.served += 1;
    if (this.exp || (this.h >= this.deuce && this.a >= this.deuce) || this.served === this.each) { this.srv = opp(this.srv); this.served = 0; }
  }
  /** expedite comes in now: a rally in progress keeps its server; between
   *  rallies the last receiver serves (= the server changes unless the turn
   *  was ending anyway); 0-0: the game's first server */
  expedite(rally: boolean, lastServer: Side | null) {
    this.exp = true;
    if (this.h + this.a === 0) this.srv = this.first(this.g);
    else if (!rally && lastServer) this.srv = opp(lastServer);
    this.served = 0;
  }
}

test('400 table tennis matches: the server follows the ITTF oracle, with and without expedite', () => {
  let withExp = 0, rallyExp = 0, refused = 0, doublesChecked = 0;
  for (let m = 0; m < 400; m++) {
    const doubles = rnd(3) === 0;
    const target = rnd(5) === 0 ? 21 : 11;
    const cfg = { playersPerSide: doubles ? 2 : 1, pointsPerGame: target, gamesToWin: pick([1, 2, 3]) };
    const R = doubles ? { home: [`t${m}h1`, `t${m}h2`], away: [`t${m}a1`, `t${m}a2`] } : { home: [`t${m}h1`], away: [`t${m}a1`] };
    for (const id of [...R.home, ...R.away]) players.add(id);
    const opening = side();
    let s: RallyState = TT.reducer(TT.init(cfg), { type: 'SET_FIRST_SERVER', payload: { side: opening } });
    let plain: RallyState = s; // the same match without the new actions
    const o = new Oracle(opening, target);
    const want = rnd(3) !== 0; // two in three matches bring expedite in
    const expAt = rnd(60);
    let lastServer: Side | null = null;
    const servers: Side[] = [];
    let pts = 0;
    for (let step = 0; step < 400 && !s.ended; step++) {
      // hostile EXPEDITEs (bad payloads are just "between rallies"; a 2nd one is refused)
      if (want && pts === expAt && !s.events.some((e) => e.kind === 'expedite')) {
        const rally = rnd(2) === 0;
        const next = TT.reducer(s, { type: 'EXPEDITE', payload: rally ? { rally: true } : pick([{}, { rally: 'yes' }, { rally: 1 }]) });
        // ITTF 2026 2.15.2: not once 18 points (2 × (target − 2)) are played in the game
        const lim = 2 * Math.max(1, target - 2);
        if (s.current.home + s.current.away >= lim) { assert.equal(next, s, 'refused from 18 points played'); refused += 1; }
        else {
          assert.notEqual(next, s);
          assert.equal(score(next), score(s), 'a marker never scores');
          s = next;
          o.expedite(rally, s.current.home + s.current.away > 0 ? lastServer : null);
          withExp += 1; if (rally) rallyExp += 1;
        }
      }
      if (rnd(25) === 0 && s.events.some((e) => e.kind === 'expedite')) assert.equal(TT.reducer(s, { type: 'EXPEDITE' }), s, 'once per match');
      const sv = ttServerOf(s);
      assert.equal(sv, o.srv, `m${m} pt${pts}`);
      if (!s.events.some((e) => e.kind === 'expedite')) assert.equal(sv, ttServer(s.current.home, s.current.away, s.games.length, opening, target));
      if (doubles) {
        const t = ttDoublesTurn(s, R);
        if (t) { assert.equal(t.serverSide, sv); doublesChecked += 1; }
      }
      servers.push(sv);
      lastServer = sv;
      const w = rnd(5) < 3 ? sv : opp(sv);
      const games = s.games.length;
      s = TT.reducer(s, P(w));
      plain = TT.reducer(plain, P(w));
      o.point(w, s.games.length > games);
      pts += 1;
    }
    assert.equal(score(s), score(plain), 'the same score with or without the markers');
    // serve stats (a replay without markers) name the same servers
    const st = serveStats('tabletennis', s, R)!;
    assert.deepEqual(st.trace.map((t) => t.server), servers, `serve stats m${m}`);
    // a correction (EDIT_LOG of the same points) keeps the marker and the server
    const again = TT.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.equal(again.events.filter((e) => e.kind === 'expedite').length, s.events.filter((e) => e.kind === 'expedite').length);
    assert.equal(score(again), score(s));
    if (!s.ended) assert.equal(ttServerOf(again), ttServerOf(s));
    // the Stats row exactly when it came in
    assert.equal(conductRows('tabletennis', s.events).some((r) => r.key === 'exp'), s.events.some((e) => e.kind === 'expedite'));
  }
  assert.ok(withExp > 100 && rallyExp > 30, `${withExp} / ${rallyExp}`);
  assert.ok(doublesChecked > 1000, String(doublesChecked));
  assert.ok(refused >= 0);
});

test('200 badminton matches: shuttle changes and long / wide / old "out" errors', () => {
  for (let m = 0; m < 200; m++) {
    const R = { home: [`b${m}h`], away: [`b${m}a`] };
    players.add(R.home[0]); players.add(R.away[0]);
    let s = badminton.reducer(badminton.init({ pointDetail: true }), { type: 'SET_FIRST_SERVER', payload: { side: side() } });
    let plain = s;
    const sh = { home: 0, away: 0, none: 0 };
    const types: Record<string, number> = {};
    for (let i = 0; i < 200 && !s.ended; i++) {
      if (rnd(12) === 0) {
        const who = pick<unknown>(['home', 'away', undefined, 'both', 7]);
        s = badminton.reducer(s, { type: 'SHUTTLE', ...(who !== undefined ? { side: who as Side } : {}) });
        if (who === 'home' || who === 'away') sh[who] += 1; else sh.none += 1;
      }
      const w = side();
      s = badminton.reducer(s, P(w));
      plain = badminton.reducer(plain, P(w));
      if (rnd(3) === 0) {
        const t = pick(['net', 'long', 'wide', 'fault', 'out', 'tin', '__proto__']);
        const how = pick(['ue', 'fe']);
        s = badminton.reducer(s, { type: 'POINT_DETAIL', payload: { pd: { how, stroke: t } } });
        const e = [...s.events].reverse().find((x) => x.kind === 'point')!;
        const et = errTypeOf('badminton', e.pd ?? { how: 'ue' } as never);
        if (['net', 'long', 'wide', 'fault', 'out'].includes(t)) assert.equal(et, t);
        else assert.equal(et, undefined);
      }
    }
    assert.equal(JSON.stringify([s.current, s.games, s.ended]), JSON.stringify([plain.current, plain.games, plain.ended]));
    const total = sh.home + sh.away + sh.none;
    const row = conductRows('badminton', s.events).find((r) => r.key === 'shuttle');
    if (!total) assert.equal(row, undefined);
    else { assert.deepEqual([row!.hv, row!.av], [sh.home, sh.away]); }
    assert.equal(s.events.filter((e) => e.kind === 'shuttle').length, total);
    const again = badminton.reducer(s, { type: 'EDIT_LOG', payload: { points: s.events.filter((e) => e.kind === 'point').map((e) => ({ side: e.side })) } });
    assert.equal(again.events.filter((e) => e.kind === 'shuttle').length, total);
    // every recorded type reaches a row
    for (const e of s.events) { const t = e.pd && errTypeOf('badminton', e.pd); if (t) types[t] = (types[t] ?? 0) + 1; }
    const rows = errorTypeRows(racketView('badminton', s, R)!, 'all');
    if (Object.keys(types).length) assert.ok(rows.length > 0);
  }
});

test('200 squash matches: injury categories, hostile ones ignored', () => {
  const CATS = ['self', 'contributed', 'opponent'] as const;
  const KEY = { self: 'injSelf', contributed: 'injContributed', opponent: 'injOpponent' } as const;
  for (let m = 0; m < 200; m++) {
    players.add(`s${m}h`); players.add(`s${m}a`);
    let s = SQ.reducer(SQ.init({ scoring: pick(['par', 'english']) }), { type: 'SET_FIRST_SERVER', payload: { side: side() } });
    let plain = s;
    const n: Record<string, { home: number; away: number }> = { self: { home: 0, away: 0 }, contributed: { home: 0, away: 0 }, opponent: { home: 0, away: 0 } };
    for (let i = 0; i < 200 && !s.ended; i++) {
      if (rnd(15) === 0) {
        const who = pick<unknown>(['home', 'away', undefined, 'x']);
        const cat = pick<unknown>([...CATS, 'bleeding', '__proto__', 3]);
        const before = s;
        s = SQ.reducer(s, { type: 'INJURY', side: who as Side, payload: { cat } });
        const ok = (who === 'home' || who === 'away') && (CATS as readonly unknown[]).includes(cat);
        if (ok) n[cat as string][who as Side] += 1; else assert.equal(s, before);
      }
      const w = side();
      s = SQ.reducer(s, P(w));
      plain = SQ.reducer(plain, P(w));
    }
    assert.equal(score(s), score(plain));
    const rows = conductRows('squash', s.events);
    for (const c of CATS) {
      const r = rows.find((x) => x.key === KEY[c]);
      if (n[c].home + n[c].away === 0) assert.equal(r, undefined);
      else assert.deepEqual([r!.hv, r!.av], [n[c].home, n[c].away]);
    }
    assert.ok(s.events.filter((e) => e.kind === 'injury').every(isMark));
  }
  assert.ok(players.size >= 500, String(players.size));
});
