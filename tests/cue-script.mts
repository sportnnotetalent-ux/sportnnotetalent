/**
 * Cue sports test helper (not a test file): score a snooker or billiards
 * match the way the screen does, through the controls' builders, and keep the
 * dispatched actions (the event log). Every tap must be accepted — a builder
 * that offers a tap the engine refuses fails here.
 */
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import * as BC from '../src/sports/billiards/controls.ts';

type Side = 'home' | 'away';

function recorder<St>(reduce: (s: St, a: never) => St, s0: St) {
  let s = s0;
  const actions: ScoreAction[] = [];
  const tap = (a: ScoreAction | null, what = 'tap') => {
    assert.ok(a, `${what}: the controls offered it`);
    const n = reduce(s, a as never);
    assert.notEqual(n, s, `${what}: the engine accepted ${JSON.stringify(a)}`);
    actions.push(a);
    s = n;
  };
  return { get state() { return s; }, actions, tap };
}

export function snookerScript(config: Record<string, unknown> = {}) {
  const r = recorder(S.reducer, S.createInitialState(config));
  const api = {
    get state() { return r.state; },
    actions: r.actions,
    tap: r.tap,
    pot(...balls: Array<S.Ball | 'free'>) { for (const b of balls) r.tap(SC.potAction(r.state, b), `pot ${b}`); return api; },
    reds(n: number, free = false) { r.tap(SC.potAction(r.state, 'red', { reds: n, free }), `${n} reds`); return api; },
    miss() { r.tap(SC.missAction(r.state), 'miss'); return api; },
    safety() { r.tap(SC.safetyAction(r.state), 'safety'); return api; },
    foul(f: SC.FoulInput = {}) { r.tap(SC.foulAction(r.state, f), 'foul'); return api; },
    freeBall() { r.tap(SC.freeBallAction(r.state), 'free ball'); return api; },
    playAgain() { r.tap(SC.playAgainAction(r.state), 'play again'); return api; },
    replace() { r.tap(SC.replaceAction(r.state), 'replace'); return api; },
    lots(side: Side) { r.tap(SC.respotTurnAction(r.state, side), 'lots'); return api; },
    breakOff(side: Side) { r.tap(SC.breakOffAction(r.state, side), 'break off'); return api; },
    concede(side: Side) { r.tap(SC.concedeAction(r.state, side), 'concede'); return api; },
    award(side: Side, reason?: S.AwardReason) { r.tap(SC.awardAction(r.state, side, reason), 'award'); return api; },
    quick(home: number, away: number) { r.tap(SC.frameScoreAction(r.state, home, away), `frame ${home}-${away}`); return api; },
    rerack() { r.tap(SC.rerackAction(r.state), 're-rack'); return api; },
    /** red + black for every red left, then the colours (a total clearance) */
    clearance() {
      while (r.state.frame && r.state.frame.on === 'red') api.pot('red', 'black');
      for (const c of S.COLOURS) if (r.state.frame && !r.state.frame.respot && r.state.frame.on === c) api.pot(c);
      return api;
    },
  };
  return api;
}

export function billiardsScript(config: Record<string, unknown> = {}) {
  const r = recorder(B.reducer, B.createInitialState(config));
  const api = {
    get state() { return r.state; },
    actions: r.actions,
    tap: r.tap,
    stroke(parts: BC.Parts, times = 1) { for (let i = 0; i < times; i++) r.tap(BC.strokeAction(r.state, parts), `stroke ${Object.keys(parts)}`); return api; },
    miss() { r.tap(BC.missAction(r.state), 'miss'); return api; },
    safety() { r.tap(BC.safetyAction(r.state), 'safety'); return api; },
    foul(kind?: B.FoulKind) { r.tap(BC.foulAction(r.state, kind), 'foul'); return api; },
    time() { r.tap(BC.timeAction(r.state), 'time'); return api; },
    breakOff(side: Side) { r.tap(BC.breakOffAction(r.state, side), 'break off'); return api; },
    concede(side: Side) { r.tap(BC.concedeAction(r.state, side), 'concede'); return api; },
    award(side: Side, reason?: B.AwardReason) { r.tap(BC.awardAction(r.state, side, reason), 'award'); return api; },
    quick(home: number, away: number) { r.tap(BC.frameScoreAction(r.state, home, away), `game ${home}-${away}`); return api; },
  };
  return api;
}

/** One player per side (the ctx the data layer gives an individual sport). */
export const SINGLES_CTX = { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } };
