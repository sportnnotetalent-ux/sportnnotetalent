/**
 * MVP kabaddi P0s (docs/mvp/audit-kabaddi-pickleball-padel.md):
 *  - Do-or-die: a failed do-or-die raid puts the raider out and gives the
 *    defence 1 point (AKFI / PKL). No tackle was made, so it is never a
 *    "super tackle", even against 3 or fewer defenders.
 *  - 5-raid shootout: a raid can score several points, so the shootout only
 *    finishes early when the trailing side can't catch up at the most one
 *    raid can score (every defender + the bonus = teamSize + 1).
 * Both are gated so saved matches replay as they were scored: the fixed
 * do-or-die applies to raids marked `rv: 3`, the fixed shootout to a
 * shootout started with `v: 2` (it stores its per-raid `max`).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayRaids, decideRaidShootout, type KabaddiCfg, type RaidOutcome } from '../src/sports/kabaddi/rules.ts';
import { init, reducer, formOutcome, raidActions, kabaddiWinner, type KabaddiState } from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const cfg: KabaddiCfg = { teamSize: 7, style: 'sanjeevani', proRules: true };
const r = (touches: number, extra: Partial<RaidOutcome> = {}): RaidOutcome => ({ side: 'home', touches, bonus: false, raiderOut: false, v: 2, ...extra });
/** Home sends 4 out (3 defenders left), then two empty raids; the 4th raid is do-or-die. */
const lead = [r(4), r(0), r(0)];

describe('failed do-or-die = +1 to the defence, not a super tackle', () => {
  test('new raid (rv 3) against 3 defenders: +1, raider out, no super tackle', () => {
    const d = replayRaids([...lead, r(0, { rv: 3 })], cfg);
    const last = d.perRaid[3];
    assert.equal(last.doOrDieFail, true);
    assert.equal(last.raiderOut, true);
    assert.equal(last.superTackle, false);
    assert.equal(last.tacklePts, 1);
    assert.equal(d.away, 1);
  });

  test('a real tackle against 3 defenders is still a super tackle (+2)', () => {
    const d = replayRaids([...lead, r(0, { raiderOut: true, rv: 3 })], cfg);
    assert.equal(d.perRaid[3].superTackle, true);
    assert.equal(d.away, 2);
  });

  test('an older raid (no rv) replays as it was saved (+2)', () => {
    const d = replayRaids([...lead, r(0)], cfg);
    assert.equal(d.perRaid[3].tacklePts, 2);
    assert.equal(d.away, 2);
  });

  test('the raid form marks new raids rv 3, and the reducer keeps the mark', () => {
    assert.equal(formOutcome({ side: 'home', touches: 0, bonus: false, tackled: false }).rv, 3);
    let s: KabaddiState = init({ playersPerSide: 7 });
    const form = (touches: number) => ({ side: 'home' as const, touches, bonus: false, tackled: false });
    for (const t of [4, 0, 0, 0]) for (const a of raidActions(s, form(t))) s = reducer(s, a);
    assert.equal(s.away, 1);
  });
});

describe('5-raid shootout counts multi-point raids', () => {
  test('home +3, away 0, home +2: not over (away can still score 2 × 8)', () => {
    assert.equal(decideRaidShootout([3, 2], [0], 8), null);
  });

  test('clinches only when the lead is out of reach at 8 a raid', () => {
    // home 20 after 5; away 3 after 4 with 1 raid left: 3 + 8 < 20
    assert.equal(decideRaidShootout([4, 4, 4, 4, 4], [1, 1, 1, 0], 8), 'home');
    // home 10 after 5; away 3 after 4: 3 + 8 = 11 ≥ 10, so away raids on
    assert.equal(decideRaidShootout([2, 2, 2, 2, 2], [1, 1, 1, 0], 8), null);
  });

  test('five each: most points wins; level → sudden death', () => {
    assert.equal(decideRaidShootout([1, 0, 2, 1, 1], [0, 1, 1, 0, 1], 8), 'home');
    assert.equal(decideRaidShootout([1, 1, 1, 1, 1], [1, 1, 1, 1, 1], 8), null);
    assert.equal(decideRaidShootout([1, 1, 1, 1, 1, 2], [1, 1, 1, 1, 1, 0], 8), 'home');
  });

  const shoot = (side: 'home' | 'away', points: number): ScoreAction => ({ type: 'SHOOTOUT_RAID', side, payload: { points } });
  test('a new shootout (v 2) plays on after home +3, away 0, home +2', () => {
    let s = reducer(init({ playersPerSide: 7 }), { type: 'START_SHOOTOUT', payload: { v: 2 } });
    assert.equal(s.shootout?.max, 8);
    for (const a of [shoot('home', 3), shoot('away', 0), shoot('home', 2)]) s = reducer(s, a);
    assert.equal(s.ended, false);
    for (const a of [shoot('away', 3), shoot('home', 0), shoot('away', 3)]) s = reducer(s, a);
    assert.equal(s.ended, false);
    assert.equal(kabaddiWinner(s), 'away'); // 6 vs 5, still running
  });

  test('an old shootout (no v) replays as it was saved', () => {
    let s = reducer(init({ playersPerSide: 7 }), { type: 'START_SHOOTOUT' });
    assert.equal(s.shootout?.max, undefined);
    for (const a of [shoot('home', 3), shoot('away', 0), shoot('home', 2)]) s = reducer(s, a);
    assert.equal(s.ended, true);
  });
});
