/**
 * Quality mandate step 6 for invasion batch 1 (docs/security/breaks/invasion-batch1.md):
 * 600 random football matches and 600 random hockey matches, scored with the
 * new taps (shots with every outcome, goals, penalties / strokes scored, saved
 * or missed, grid saves with or without a shooter or keeper, red cards with
 * "Cards" off). After every tap: a side's saves never exceed the other side's
 * shots on target that didn't go in, and the stat lines (live credits) match
 * the replayed statTotals. 300 old-style football logs and 300 old hockey logs
 * replay with no new shot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fb from '../src/sports/football/engine.ts';
import { footballStatTotals, FOOTBALL_DERIVED_KEYS } from '../src/sports/football/totals.ts';
import { goalAction, statAction, penaltyMissActions, gridSaveActions, cardActions, cardChoices } from '../src/sports/football/actions.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyTotals, DERIVED_KEYS as HK_DERIVED } from '../src/sports/hockey/totals.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
let seed = 20261102;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pick = (side: Side) => (rnd(4) === 0 ? null : { id: `${side[0]}${1 + rnd(10)}` });
const keeperOf = (side: Side) => (rnd(5) === 0 ? undefined : { id: `${side[0]}gk` });

/* -------------------------------- football -------------------------------- */

const fbOk = (s: fb.FootballState, where: string) => {
  const t = fb.footballStats(s, 0).totals;
  const goals = (side: Side) => s.events.filter((e) => e.type === 'goal' && e.side === side).length;
  for (const side of ['home', 'away'] as const) {
    const faced = t[opp(side)].shotsOnTarget - goals(opp(side));
    assert.ok(t[side].saves <= faced, `${where}: ${side} saves ${t[side].saves} > shots on target faced ${faced}`);
  }
};

/** One random tap: the actions the controls fire for it. */
function fbTap(s: fb.FootballState): ScoreAction[] {
  const side: Side = rnd(2) ? 'home' : 'away';
  const p = pick(side);
  switch (rnd(9)) {
    case 0: return [goalAction(side, p ?? { id: `${side[0]}9` }, rnd(4) ? 'open' : 'penalty')];
    case 1: { // shot → on target → saved (the shot flow's 🧤 Saved)
      const gk = keeperOf(opp(side));
      return [statAction('shot', side, p, { onTarget: true }), ...(gk ? [statAction('save', opp(side), gk)] : [])];
    }
    case 2: return [statAction('shot', side, p, { onTarget: rnd(2) === 0 })];
    case 3: return [statAction('shot', side, p, { onTarget: false, blocked: true })];
    case 4: return penaltyMissActions(side, rnd(2) ? 'saved' : 'missed', p, keeperOf(opp(side)));
    case 5: return gridSaveActions(side, keeperOf(side), pick(opp(side)));
    case 6: return cardActions(s.events, side, cardChoices(s.track.cards).colours[rnd(cardChoices(s.track.cards).colours.length)], p ?? { id: `${side[0]}5` });
    case 7: return [statAction('corner', side, null)];
    default: return [statAction('foul', side, p)];
  }
}

test('football: 600 random matches — saves never outrun shots on target faced; lines match statTotals', () => {
  const sp: TotalsSport<fb.FootballState> = { name: 'football', init: fb.init, reducer: fb.reducer, statTotals: footballStatTotals, partial: true, derived: FOOTBALL_DERIVED_KEYS };
  let taps = 0;
  for (let m = 0; m < 600; m++) {
    const config = { halfMinutes: 45, trackCards: rnd(2) === 0 };
    let s = fb.reducer(fb.init(config), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
    const log: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } } as ScoreAction];
    const n = 10 + rnd(40);
    for (let i = 0; i < n; i++) {
      const as = fbTap(s).map((a) => ({ ...a, payload: { ...a.payload, minute: 1 + i, half: 1 } }));
      for (const a of as) s = fb.reducer(s, a);
      log.push(...as);
      taps++;
      fbOk(s, `match ${m} tap ${i}`);
      // undo the whole tap now and then: every prefix stays consistent
      if (rnd(10) === 0) {
        let back = fb.reducer(fb.init(config), log[0]);
        for (const a of log.slice(1, log.length - as.length)) back = fb.reducer(back, a);
        fbOk(back, `match ${m} undo ${i}`);
      }
    }
    if (m % 20 === 0) assertContract({ ...sp, config }, toRecords(log), { every: 5, label: `match ${m}` });
  }
  assert.ok(taps > 10_000);
});

test('football: 300 old-style logs (penalty miss / grid save with no shot) replay with no new shot', () => {
  for (let m = 0; m < 300; m++) {
    let s = fb.reducer(fb.init({ halfMinutes: 45 }), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
    let shots = 0;
    for (let i = 0; i < 20; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const r = rnd(3);
      if (r === 0) s = fb.reducer(s, { type: 'STAT', side, payload: { kind: 'penaltyMissed', at: 1 }, attribution: { playerId: `${side[0]}9`, stat: 'penaltiesMissed' } });
      else if (r === 1) s = fb.reducer(s, { type: 'STAT', side, payload: { kind: 'save', at: 1 }, attribution: { playerId: `${side[0]}gk`, stat: 'saves' } });
      else { s = fb.reducer(s, statAction('shot', side, { id: `${side[0]}7` }, { onTarget: true })); shots++; }
    }
    const t = fb.footballStats(s, 0).totals;
    assert.equal(t.home.shots + t.away.shots, shots, `old match ${m}`);
    assert.ok(s.stats.every((st) => !st.pen));
  }
});

/* --------------------------------- hockey --------------------------------- */

const hkOk = (s: hk.HockeyState, where: string) => {
  for (const side of ['home', 'away'] as const) {
    const f = hk.teamFigures(s, side);
    const o = hk.teamFigures(s, opp(side));
    assert.ok(f.saves <= o.shotsOnGoal - o.goals, `${where}: ${side} saves ${f.saves} > shots on goal faced ${o.shotsOnGoal - o.goals}`);
  }
};

let u = 0;
function hkTap(s: hk.HockeyState): ScoreAction[] {
  const side: Side = rnd(2) ? 'home' : 'away';
  const p = pick(side);
  const stamp = { uid: `u${++u}`, sec: hk.matchSec(s, 0), period: s.period };
  const save = (ref: string): ScoreAction => {
    const gk = rnd(5) ? `${opp(side)[0]}gk` : undefined;
    const c = hk.creditAttribution(hk.eventCredits({ type: 'save', playerId: gk }).first);
    return { type: 'SAVE', side: opp(side), payload: { ref, ...stamp, uid: `u${++u}` }, ...(c ? { attribution: c } : {}) };
  };
  switch (rnd(4)) {
    case 0: {
      const goalType: hk.GoalType = rnd(2) ? 'field' : 'stroke';
      const a = hk.creditAttribution(hk.eventCredits({ type: 'goal', goalType, playerId: p?.id }).first);
      return [{ type: 'GOAL', side, payload: { goalType, ...stamp }, ...(a ? { attribution: a } : {}) }];
    }
    case 1: {
      const outcome = rnd(2) ? 'saved' : 'missed';
      const st = hk.strokeAction(side, outcome, p?.id, stamp);
      return outcome === 'saved' ? [st, save(stamp.uid)] : [st];
    }
    default: {
      const onGoal = rnd(2) === 0;
      const a = hk.creditAttribution(hk.eventCredits({ type: 'shot', onGoal, playerId: p?.id }).first);
      const shot: ScoreAction = { type: 'SHOT', side, payload: { onGoal, ...stamp }, ...(a ? { attribution: a } : {}) };
      return onGoal ? [shot, save(stamp.uid)] : [shot];
    }
  }
}

test('hockey: 600 random matches — saves never outrun shots on goal faced; lines match statTotals', () => {
  const sp: TotalsSport<hk.HockeyState> = { name: 'hockey', init: hk.init, reducer: hk.reducer, statTotals: hockeyTotals, derived: HK_DERIVED };
  for (let m = 0; m < 600; m++) {
    let s = hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: 1 } } as ScoreAction);
    const log: ScoreAction[] = [{ type: 'CLOCK', payload: { run: true, at: 1 } } as ScoreAction];
    const n = 10 + rnd(40);
    for (let i = 0; i < n; i++) {
      const as = hkTap(s);
      for (const a of as) s = hk.reducer(s, a);
      log.push(...as);
      hkOk(s, `match ${m} tap ${i}`);
    }
    if (m % 20 === 0) assertContract(sp, toRecords(log), { every: 5, label: `hockey match ${m}` });
  }
});

test('hockey: 300 old logs (stroke with no shot flag) replay with the old figures', () => {
  for (let m = 0; m < 300; m++) {
    let s = hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: 1 } } as ScoreAction);
    for (let i = 0; i < 10; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      s = hk.reducer(s, { type: 'STROKE', side, payload: { outcome: rnd(2) ? 'saved' : 'missed', uid: `o${m}-${i}` }, attribution: { playerId: `${side[0]}9`, stat: 'strokesMissed' } } as ScoreAction);
    }
    assert.equal(hk.teamFigures(s, 'home').shots + hk.teamFigures(s, 'away').shots, 0);
    for (const l of Object.values(hockeyTotals(s))) assert.equal(l.stats.shots ?? 0, 0);
  }
});
