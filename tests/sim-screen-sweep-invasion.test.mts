/**
 * Screen sweep, invasion — simulation (quality mandate step 6; break list
 * docs/security/breaks/screen-sweep-invasion.md). 600 hockey, 600 ice hockey
 * and 600 rugby random matches, half with no squad (every outcome tap records
 * at once), half with one:
 *  - every tap is recorded (the log grows by exactly what the tap fires);
 *  - hockey / ice hockey: a side's saves never exceed the other side's shots on goal;
 *  - rugby: a player-card tap never logs an official; team cards = taps;
 *  - replay: the log replays to the same state (and every undo prefix too).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asksWho } from '../src/sports/invasion/asksWho.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import * as ih from '../src/sports/ice_hockey/engine.ts';
import * as rg from '../src/sports/rugby/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const T0 = 1_000_000;
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const squad = (sd: Side, on: boolean) => (on ? Array.from({ length: 11 }, (_, i) => ({ id: `${sd[0]}${i + 1}` })) : []);
const pickId = (list: { id: string }[]) => (asksWho(list) && rnd(4) ? list[rnd(list.length)].id : undefined); // the picker or its Skip

test('hockey: 600 matches of stroke / shot taps', () => {
  let taps = 0;
  for (let m = 0; m < 600; m++) {
    const withSquad = m % 2 === 1;
    let s = hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction);
    const log: ScoreAction[] = [];
    const n = 5 + rnd(25);
    for (let i = 0; i < n; i++) {
      const sd: Side = rnd(2) ? 'home' : 'away';
      const who = pickId(squad(sd, withSquad));
      const gk = withSquad && rnd(2) ? `${opp(sd)[0]}1` : undefined;
      const uid = `m${m}t${i}`;
      const k = rnd(5);
      const as = k === 0 ? hk.strokeTapActions(sd, 'saved', who, gk, { uid })
        : k === 1 ? hk.strokeTapActions(sd, 'missed', who, gk, { uid })
        : hk.shotTapActions(sd, k === 2, who, gk, { uid, ...(k === 3 ? { miss: 'wide' as const } : k === 4 ? { miss: 'blocked' as const } : {}) });
      const before = s.events.length;
      for (const a of as) { const st = { ...a, payload: { ...a.payload, at: T0 + 1000 * (i + 1) } }; log.push(st); s = hk.reducer(s, st); }
      assert.equal(s.events.length, before + as.length, 'every tap recorded');
      taps++;
      for (const x of ['home', 'away'] as const) assert.ok(hk.teamFigures(s, x).saves <= hk.teamFigures(s, opp(x)).shotsOnGoal);
    }
    const replay = log.reduce(hk.reducer, hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction));
    assert.deepEqual(replay, s);
    // undo: every prefix is consistent
    for (let p = 0; p < log.length; p += 3) {
      const ps = log.slice(0, p).reduce(hk.reducer, hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction));
      for (const x of ['home', 'away'] as const) assert.ok(hk.teamFigures(ps, x).saves <= hk.teamFigures(ps, opp(x)).shotsOnGoal);
    }
  }
  assert.ok(taps > 5000);
});

test('ice hockey: 600 matches of penalty shots and shots', () => {
  for (let m = 0; m < 600; m++) {
    const withSquad = m % 2 === 1;
    const s0 = ih.reducer(ih.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction);
    let s = s0;
    const log: ScoreAction[] = [];
    if (withSquad) for (const sd of ['home', 'away'] as const) { const a = { type: 'GK', side: sd, payload: { id: `${sd[0]}g`, at: T0 } } as ScoreAction; log.push(a); s = ih.reducer(s, a); }
    const n = 3 + rnd(15);
    let goals = 0;
    for (let i = 0; i < n && !s.ended; i++) {
      const sd: Side = rnd(2) ? 'home' : 'away';
      const who = pickId(squad(sd, withSquad));
      const gk = ih.goalieAt(s, opp(sd))?.id;
      const res = (['scored', 'saved', 'missed'] as const)[rnd(3)];
      const a = { ...ih.penaltyShotAction(s, sd, res, who, gk), payload: { ...ih.penaltyShotAction(s, sd, res, who, gk).payload, at: T0 + 1000 * (i + 1) } } as ScoreAction;
      const before = s.events.length;
      log.push(a); s = ih.reducer(s, a);
      assert.equal(s.events.length, before + 1, 'every penalty shot recorded');
      if (res === 'scored') goals++;
      if (res === 'saved' && gk) assert.equal(a.attribution2?.playerId, gk);
      for (const x of ['home', 'away'] as const) assert.ok(ih.teamFigures(s, x).saves <= ih.teamFigures(s, opp(x)).shotsOnGoal);
    }
    assert.equal(s.home + s.away, goals);
    assert.deepEqual(log.reduce(ih.reducer, s0), s);
  }
});

test('rugby: 600 matches of penalty-try cards', () => {
  for (let m = 0; m < 600; m++) {
    const withSquad = m % 2 === 1;
    const s0 = rg.reducer(rg.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction);
    let s = s0;
    const log: ScoreAction[] = [];
    const cards = { home: 0, away: 0 };
    const n = 2 + rnd(8);
    for (let i = 0; i < n && !s.ended; i++) {
      const sd: Side = rnd(2) ? 'home' : 'away';
      const pt = { type: 'PENALTY_TRY', side: sd, payload: { at: T0 + 1000 * (i + 1) } } as ScoreAction;
      log.push(pt); s = rg.reducer(s, pt);
      if (rnd(3) === 0) continue; // "No card"
      const off = opp(sd);
      const list = squad(off, withSquad);
      const id = pickId(list);
      const kind = rnd(3) ? 'yellow' as const : 'red' as const;
      const a0 = rg.cardTapAction(s, off, kind, id ? { id } : undefined);
      const a = { ...a0, payload: { ...a0.payload, at: T0 + 1000 * (i + 1) + 1 } } as ScoreAction;
      log.push(a); s = rg.reducer(s, a);
      const e = s.events.at(-1)!;
      assert.equal(e.type, 'card');
      assert.equal(e.official, undefined, 'never an official');
      if (!asksWho(list)) assert.equal(e.playerId, undefined);
      cards[off]++;
    }
    for (const x of ['home', 'away'] as const) {
      const f = rg.teamFigures(s, x);
      assert.equal(f.redCards + f.yellowCards - s.events.filter((e) => e.type === 'card' && e.side === x && e.second).length, cards[x]);
    }
    assert.deepEqual(log.reduce(rg.reducer, s0), s);
  }
});
