/**
 * Round 2 (founder answers, 2026-10-22) — American football:
 *  - passes defended INCLUDE interceptions (NFL): with "Defensive detail" on at
 *    the time of the pick, the interceptor is credited a pass defended as well
 *    as the interception (`pdef` mark on the play, set at record time, so a
 *    log replays the same; older interceptions never carry it);
 *  - drive charts COUNT punts and field-goal attempts as plays (NFL drive
 *    chart); a punt on 4th down still ends the drive as a punt, not "downs".
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, credit, buildPlay, eventCredits, creditAttribution, afTracked, deepKeys,
  type AFState, type Side, type Who,
} from '../src/sports/american_football/engine.ts';
import { afTotals, DERIVED_KEYS } from '../src/sports/american_football/totals.ts';
import { afDrives, driveLine } from '../src/sports/american_football/drives.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';

const nm = (id: string) => id.toUpperCase();
const W = (id?: string): Who | undefined => (id ? { id, name: nm(id) } : undefined);
let u = 0;
const at = (period: number, psec: number, len = 900) => ({ uid: `r${++u}`, period, psec, sec: (period - 1) * len + psec });
const NFL = { preset: 'nfl', variant: 'tackle', rules: 'nfl' };
const PBP = { ...NFL, mode: 'pbp' };
const kick = (rec: Side, spot: number, t: Record<string, unknown>): ScoreAction => ({ type: 'PLAY', side: rec, payload: { play: 'kickoff', newSpot: spot, ...t } });
const fg = (side: Side, t: Record<string, unknown>, good: boolean, yards: number, kicker?: string): ScoreAction =>
  ({ type: 'FG', side, payload: { good, yards, ...t }, ...credit({ type: 'fg', good, playerId: kicker, playerName: kicker && nm(kicker) }) });

function builder(cfg: Record<string, unknown>) {
  const acts: ScoreAction[] = [];
  let s = init(cfg);
  const go = (a: ScoreAction) => { acts.push(a); s = reducer(s, a); return s; };
  const p = (side: Side, inp: Parameters<typeof buildPlay>[2], t: Record<string, unknown>) => go(buildPlay(s, side, inp, t));
  return { acts, go, p, get s() { return s; } };
}

/* ------------------------- passes defended + INTs -------------------------- */

describe('round 2 · an interception is also a pass defended (NFL) when defence detail is tracked', () => {
  test('eventCredits: the pdef mark adds passDef to the interceptor; unmarked = as before', () => {
    assert.deepEqual(eventCredits({ type: 'play', play: 'int', playerId: 'h1', secondId: 'a8', pdef: true }).second?.stats, { defInt: 1, passDef: 1 });
    assert.deepEqual(eventCredits({ type: 'play', play: 'int', playerId: 'h1', secondId: 'a8' }).second?.stats, { defInt: 1 });
    assert.deepEqual(eventCredits({ type: 'play', play: 'int', playerId: 'h1', secondId: 'a8', pdef: true }).first?.stats, { passAtt: 1, passInt: 1 }, 'the passer is unchanged');
  });
  test('buildPlay marks the pick only while "Defensive detail" is on (UI and voice share it)', () => {
    const on = init({ ...PBP, trackDefence: true });
    const off = init(PBP);
    const a = buildPlay({ ...on, drive: { off: 'home', down: 1, spot: 30, line: 40 } }, 'home', { play: 'int', p1: W('h1'), p2: W('a8') }, at(1, 10));
    assert.equal(a.payload?.pdef, true);
    assert.deepEqual(a.attribution2?.extra, { passDef: 1 });
    assert.equal(a.attribution2?.side, 'away', 'still the defender');
    const b = buildPlay({ ...off, drive: { off: 'home', down: 1, spot: 30, line: 40 } }, 'home', { play: 'int', p1: W('h1'), p2: W('a8') }, at(1, 10));
    assert.equal('pdef' in (b.payload ?? {}), false);
    assert.equal(b.attribution2?.extra, undefined);
    const c = buildPlay({ ...on, drive: { off: 'home', down: 1, spot: 30, line: 40 } }, 'home', { play: 'inc', p1: W('h1') }, at(1, 10));
    assert.equal('pdef' in (c.payload ?? {}), false, 'only an interception');
  });
  test('the reducer keeps the mark on interceptions only', () => {
    const s0 = { ...init({ ...PBP, trackDefence: true }), drive: { off: 'home' as Side, down: 1, spot: 30, line: 40 } };
    const s1 = reducer(s0, { type: 'PLAY', side: 'home', payload: { play: 'int', pdef: true, ...at(1, 10) } });
    assert.equal(s1.events[0].pdef, true);
    const s2 = reducer(s0, { type: 'PLAY', side: 'home', payload: { play: 'run', yards: 3, pdef: true, ...at(1, 10) } });
    assert.equal('pdef' in s2.events[0], false);
  });
  test('statTotals contract: breakup + interception = 2 passes defended; every undo prefix', () => {
    const TRACK = { ...PBP, trackDefence: true };
    const SPORT: TotalsSport<AFState> = { name: 'american_football round 2', init, reducer, statTotals: afTotals, partial: false, derived: DERIVED_KEYS, config: TRACK };
    const b = builder(TRACK);
    b.go(kick('home', 25, at(1, 0)));
    b.p('home', { play: 'inc', p1: W('h1') }, at(1, 20));
    b.go({ type: 'PASS_DEF', side: 'away', payload: at(1, 20), ...credit({ type: 'pd', playerId: 'a4', playerName: 'A4' }) });
    b.p('home', { play: 'int', p1: W('h1'), p2: W('a4'), newSpot: 40 }, at(1, 40));
    b.p('away', { play: 'int', p1: W('a1'), p2: W('h7'), newSpot: 30 }, at(1, 70));
    const t = assertContract(SPORT, toRecords(b.acts));
    assert.deepEqual([t.a4.stats.passDef, t.a4.stats.defInt], [2, 1]);
    assert.deepEqual([t.h7.stats.passDef, t.h7.stats.defInt], [1, 1]);
    assert.equal(t.h1.stats.passDef, 0, 'tracked → 0 for everyone else');
  });
  test('old / untracked logs: an interception never writes passDef (no false count)', () => {
    const b = builder(PBP);
    b.go(kick('home', 25, at(1, 0)));
    b.p('home', { play: 'int', p1: W('h1'), p2: W('a4'), newSpot: 40 }, at(1, 40));
    const t = afTotals(b.s);
    assert.equal('passDef' in t.a4.stats, false);
    assert.equal(t.a4.stats.defInt, 1);
    assert.deepEqual(deepKeys(b.s), []);
    // an old log replayed with the new reducer: same events, no mark
    assert.equal(b.s.events.some((e) => e.pdef), false);
  });
  test('a marked pick alone makes defence detail "tracked"; undo reverses the PD with the INT', () => {
    const s = reducer({ ...init(PBP), drive: { off: 'home', down: 1, spot: 30, line: 40 } }, { type: 'PLAY', side: 'home', payload: { play: 'int', pdef: true, ...at(1, 10) }, attribution2: { playerId: 'a8', stat: 'defInt', by: 1 } });
    assert.equal(afTracked(s, 'trackDefence'), true);
    const cr = eventCredits({ type: 'play', play: 'int', playerId: 'h1', secondId: 'a8', secondName: 'A8', pdef: true });
    // IDs-only scoring: the reversal names the player by id only
    assert.deepEqual(creditAttribution(cr.second, -1), { playerId: 'a8', stat: 'defInt', by: -1, extra: { passDef: -1 } });
  });
});

/* ------------------------- drive plays: punts + FGs ------------------------- */

describe('round 2 · drive charts count punts and field-goal attempts as plays', () => {
  test('three-and-out + punt = 4 plays; a field-goal drive counts the kick', () => {
    const b = builder(PBP);
    b.go(kick('home', 25, at(1, 0)));
    b.p('home', { play: 'run', yards: 2, p1: W('h2') }, at(1, 30));
    b.p('home', { play: 'inc', p1: W('h1') }, at(1, 50));
    b.p('home', { play: 'inc', p1: W('h1') }, at(1, 70));
    b.p('home', { play: 'punt', yards: 45, p1: W('h10') }, at(1, 90));
    b.p('away', { play: 'pass', yards: 30, p1: W('a1'), p2: W('a3') }, at(1, 130));
    b.p('away', { play: 'run', yards: 5, p1: W('a2') }, at(1, 160));
    b.go(fg('away', at(1, 200), false, 48, 'a11'));
    const { drives } = afDrives(b.s);
    assert.deepEqual(drives.map((d) => [d.off, d.plays, d.result]), [['home', 4, 'punt'], ['away', 3, 'fgMissed']]);
    assert.equal(driveLine(drives[0]), '4 plays, 2 yds, 1:30');
  });
  test('a lone punt / field goal after a turnover is a 1-play drive; a 4th-down punt is a punt, not downs', () => {
    const b = builder(PBP);
    b.go({ type: 'SET_DRIVE', payload: { off: 'home', spot: 70, down: 4, toGo: 5 } });
    b.go(fg('home', { ...at(1, 30), pre: undefined }, true, 47, 'h11'));
    const d1 = afDrives(b.s).drives;
    assert.equal(d1.length, 1);
    assert.deepEqual([d1[0].plays, d1[0].result], [1, 'fg']);
    const c = builder(PBP);
    c.go({ type: 'SET_DRIVE', payload: { off: 'away', spot: 20, down: 4, toGo: 8 } });
    c.p('away', { play: 'punt', yards: 50, p1: W('a10') }, at(1, 30));
    const d2 = afDrives(c.s).drives;
    assert.deepEqual([d2[0].plays, d2[0].result], [1, 'punt']);
  });
  test('penalties are still not plays; kickoffs are never part of a drive', () => {
    const b = builder(PBP);
    b.go(kick('home', 25, at(1, 0)));
    b.p('home', { play: 'penalty', yards: 5, on: 'home', foul: 'False start' }, at(1, 20));
    b.p('home', { play: 'run', yards: 4, p1: W('h2') }, at(1, 40));
    const d = afDrives(b.s).drives[0];
    assert.equal(d.plays, 1);
  });
});
