/**
 * Screen sweep, invasion (break list docs/security/breaks/screen-sweep-invasion.md):
 *  S1 hockey: Stroke → Saved / Missed and Shot → On goal / Wide / Blocked record
 *     in a friendly with no squad (one tap), reaching Stats and Commentary;
 *  S2 ice hockey: Penalty shot → Saved / Missed / Scored records (a saved one
 *     is a shot on goal, the save the goalie's when one is set);
 *  S3 rugby: the penalty-try card with no squad is an unnamed PLAYER's card,
 *     never a team official's.
 * The tests drive what the controls dispatch: `asksWho(listed)` decides if the
 * outcome tap opens a "who?" step; if not, the engine's tap builder fires.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { asksWho } from '../src/sports/invasion/asksWho.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyBox } from '../src/sports/hockey/box.ts';
import { hockeyFeed } from '../src/sports/hockey/feed.ts';
import { hockeyTotals } from '../src/sports/hockey/totals.ts';
import * as ih from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyCommentary } from '../src/sports/ice_hockey/commentary.ts';
import { iceHockeyTotals } from '../src/sports/ice_hockey/totals.ts';
import * as rg from '../src/sports/rugby/engine.ts';
import { rugbyCommentary } from '../src/sports/rugby/commentary.ts';
import { rugbyLiveField } from '../src/sports/rugby/totals.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const names = { home: 'Lions', away: 'Tigers' };
const T0 = 1_000_000;
const stamp = (a: ScoreAction, at: number): ScoreAction => ({ ...a, payload: { ...a.payload, at } });

describe('asksWho · the "who?" step only when somebody is listed', () => {
  test('nobody listed: the outcome tap records at once', () => {
    assert.equal(asksWho([]), false);
    assert.equal(asksWho(undefined), false);
  });
  test('a squad: the picker still shows', () => assert.equal(asksWho([{ id: 'p1' }]), true));
});

/* ------------------------------ S1: hockey ------------------------------- */

describe('S1 · hockey strokes and shots in a friendly with no squad', () => {
  const start = (): hk.HockeyState => hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction);
  const run = (s: hk.HockeyState, as: ScoreAction[]) => as.reduce((st, a, i) => hk.reducer(st, stamp(a, T0 + 60_000 + i)), s);

  test('Stroke → Saved: a stroke, a shot on goal, the team save; Stats and Commentary show it', () => {
    const as = hk.strokeTapActions('home', 'saved', undefined, undefined, { uid: 'u1' });
    assert.deepEqual(as.map((a) => [a.type, a.side]), [['STROKE', 'home'], ['SAVE', 'away']]);
    assert.equal(as[1].payload?.ref, 'u1');
    const s = run(start(), as);
    const f = hk.teamFigures(s, 'home');
    assert.deepEqual([f.strokes, f.shots, f.shotsOnGoal], [1, 1, 1]);
    assert.equal(hk.teamFigures(s, 'away').saves, 1);
    const box = hockeyBox(s, { now: T0 + 120_000 }).data('all');
    assert.equal(box.home.teamStats?.strokesAwarded, 1);
    assert.equal(box.home.team?.stats.shots, 1);
    assert.equal(box.home.team?.stats.shotsOnGoal, 1);
    assert.equal(box.away.team?.stats.saves, 1);
    const feed = hockeyFeed(s, names);
    assert.equal(feed.length, 1); // the save folds into its stroke
    assert.match(feed[0].text, /Penalty stroke saved/);
  });
  test('Stroke → Missed: a shot off goal, no save', () => {
    const as = hk.strokeTapActions('away', 'missed', undefined, undefined, { uid: 'u2' });
    assert.deepEqual(as.map((a) => a.type), ['STROKE']);
    const s = run(start(), as);
    const f = hk.teamFigures(s, 'away');
    assert.deepEqual([f.strokes, f.shots, f.shotsOnGoal], [1, 1, 0]);
    assert.match(hockeyFeed(s, names)[0].text, /Penalty stroke missed/);
  });
  test('Shot → On goal — saved: a shot on goal and its save, one Commentary line', () => {
    const as = hk.shotTapActions('home', true, undefined, undefined, { uid: 'u3' });
    assert.deepEqual(as.map((a) => [a.type, a.side]), [['SHOT', 'home'], ['SAVE', 'away']]);
    const s = run(start(), as);
    assert.deepEqual([hk.teamFigures(s, 'home').shots, hk.teamFigures(s, 'home').shotsOnGoal, hk.teamFigures(s, 'away').saves], [1, 1, 1]);
    const feed = hockeyFeed(s, names);
    assert.equal(feed.length, 1);
    assert.match(feed[0].text, /Shot on goal by Lions, saved/);
  });
  test('Shot → Wide / Blocked: a shot, not on goal, no save', () => {
    for (const miss of ['wide', 'blocked'] as const) {
      const as = hk.shotTapActions('home', false, undefined, undefined, { uid: `m-${miss}`, miss });
      assert.deepEqual(as.map((a) => a.type), ['SHOT']);
      assert.equal(as[0].payload?.miss, miss);
      const s = run(start(), as);
      assert.deepEqual([hk.teamFigures(s, 'home').shots, hk.teamFigures(s, 'home').shotsOnGoal], [1, 0]);
    }
  });
  test('named taker and keeper: credits as before (batch 1), the save to the keeper', () => {
    const as = hk.strokeTapActions('home', 'saved', 'h9', 'agk', { uid: 'u4' }, ['strokesMissed']);
    assert.deepEqual(as[0].attribution && { id: as[0].attribution.playerId, stat: as[0].attribution.stat, extra: as[0].attribution.extra }, { id: 'h9', stat: 'strokesMissed', extra: { shots: 1, shotsOnGoal: 1 } });
    assert.deepEqual(as[1].attribution && [as[1].attribution.playerId, as[1].attribution.stat], ['agk', 'saves']);
    const t = hockeyTotals(run(start(), as));
    assert.equal(t.agk.stats.saves, 1);
  });
  test('the PC link rides on the attempt', () => {
    const as = hk.shotTapActions('home', true, undefined, undefined, { uid: 'u5', pcRef: 'pc1' });
    assert.equal(as[0].payload?.pcRef, 'pc1');
  });
  test('old logs replay identically: an old STROKE / SHOT / SAVE log keeps its state', () => {
    const old: ScoreAction[] = [
      { type: 'STROKE', side: 'home', payload: { outcome: 'saved', uid: 'o1', sec: 60, period: 1 }, attribution: { playerId: 'h9', stat: 'strokesMissed' } },
      { type: 'SAVE', side: 'away', payload: { ref: 'o1', sec: 60, period: 1 } },
      { type: 'SHOT', side: 'away', payload: { onGoal: false, uid: 'o2', sec: 70, period: 1 } },
    ];
    const s = old.reduce(hk.reducer, start());
    assert.deepEqual(JSON.parse(JSON.stringify(s.events)), [
      { id: 'o1', sec: 60, period: 1, type: 'stroke', side: 'home', outcome: 'saved', playerId: 'h9' },
      { id: 'e2', sec: 60, period: 1, type: 'save', side: 'away', ref: 'o1' },
      { id: 'o2', sec: 70, period: 1, type: 'shot', side: 'away', onGoal: false },
    ]);
    assert.equal(hk.teamFigures(s, 'home').shots, 0);
  });
});

/* ---------------------------- S2: ice hockey ----------------------------- */

describe('S2 · ice hockey penalty shot', () => {
  const start = (): ih.IceHockeyState => ih.reducer(ih.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction);
  const run = (s: ih.IceHockeyState, as: ScoreAction[]) => as.reduce((st, a, i) => ih.reducer(st, stamp(a, T0 + 60_000 + i)), s);
  const lines = (s: ih.IceHockeyState) => iceHockeyCommentary(s, names).flatMap((g) => g.lines.map((l) => l.text));

  test('Saved, no squad, no goalie: a shot on goal, the team save, a Commentary line', () => {
    const s0 = start();
    const a = ih.penaltyShotAction(s0, 'home', 'saved');
    assert.equal(a.type, 'SHOT');
    assert.equal(a.payload?.ps, true);
    const s = run(s0, [a]);
    assert.equal(s.events.length, 1);
    assert.equal(ih.teamFigures(s, 'home').shotsOnGoal, 1);
    assert.equal(ih.teamFigures(s, 'away').saves, 1);
    assert.ok(lines(s).some((t) => /Penalty shot by Lions — stopped/.test(t)), lines(s).join(' | '));
  });
  test('Saved with a goalie set: the save is the goalie\'s', () => {
    const s0 = run(start(), [{ type: 'GK', side: 'away', payload: { id: 'g1' } }]);
    const a = ih.penaltyShotAction(s0, 'home', 'saved', 'h7', 'g1', ['shotsOnGoal', 'saves']);
    assert.equal(a.attribution?.playerId, 'h7');
    assert.deepEqual([a.attribution2?.playerId, a.attribution2?.stat], ['g1', 'saves']);
    const t = iceHockeyTotals(run(s0, [a]));
    assert.equal(t.g1.stats.saves, 1);
    assert.equal(t.h7.stats.shotsOnGoal, 1);
  });
  test('Missed: a miss (no shot on goal), in the Commentary', () => {
    const s0 = start();
    const s = run(s0, [ih.penaltyShotAction(s0, 'away', 'missed')]);
    assert.equal(s.events.at(-1)?.type, 'miss');
    assert.equal(ih.teamFigures(s, 'away').shotsOnGoal, 0);
    assert.ok(lines(s).some((t) => /Penalty shot by Tigers misses the net/.test(t)));
  });
  test('Scored: a penalty-shot goal', () => {
    const s0 = start();
    const s = run(s0, [ih.penaltyShotAction(s0, 'home', 'scored')]);
    assert.equal(s.home, 1);
    assert.equal(s.events.at(-1)?.ps, true);
  });
  test('old logs replay identically: an old penalty-shot SHOT / MISS keeps its state', () => {
    const old: ScoreAction[] = [
      { type: 'SHOT', side: 'home', payload: { ps: true, uid: 'p1', sec: 30, period: 1 } },
      { type: 'MISS', side: 'away', payload: { playerId: 'a3', uid: 'p2', sec: 40, period: 1 } },
    ];
    const s = old.reduce(ih.reducer, start());
    assert.deepEqual(JSON.parse(JSON.stringify(s.events)), [
      { id: 'p1', sec: 30, period: 1, type: 'shot', side: 'home', ps: true },
      { id: 'p2', sec: 40, period: 1, type: 'miss', side: 'away', playerId: 'a3', ps: true },
    ]);
  });
});

/* ------------------------------ S3: rugby -------------------------------- */

describe('S3 · rugby penalty-try card with no squad', () => {
  const start = (): rg.RugbyState => rg.reducer(rg.init({}), { type: 'CLOCK', payload: { run: true, at: T0 } } as ScoreAction);
  const run = (s: rg.RugbyState, as: ScoreAction[]) => as.reduce((st, a, i) => rg.reducer(st, stamp(a, T0 + 60_000 + i)), s);

  test('Yellow, nobody listed: an unnamed player\'s yellow — a team card, never an official', () => {
    let s = run(start(), [{ type: 'PENALTY_TRY', side: 'home' }]);
    const a = rg.cardTapAction(s, 'away', 'yellow');
    assert.equal(a.payload?.official, undefined);
    assert.equal(a.attribution, undefined);
    s = run(s, [a]);
    const e = s.events.at(-1)!;
    assert.equal(e.type, 'card');
    assert.equal(e.official, undefined);
    assert.equal(rg.teamFigures(s, 'away').yellowCards, 1);
    // the field tracker follows named players only (unchanged: an old unnamed card replays the same)
    assert.equal(rugbyLiveField(s, T0 + 61_000).short.away, 0);
    const text = rugbyCommentary(s, names).flatMap((g) => g.lines.map((l) => l.text)).join(' | ');
    assert.match(text, /Yellow card: Tigers/);
    assert.doesNotMatch(text, /official/);
  });
  test('Red, nobody listed: a red, team card, no official', () => {
    const s = run(start(), [rg.cardTapAction(start(), 'home', 'red')]);
    assert.equal(rg.teamFigures(s, 'home').redCards, 1);
    assert.equal(s.events.at(-1)!.official, undefined);
  });
  test('a named player\'s second yellow is still a red', () => {
    const s1 = run(start(), [rg.cardTapAction(start(), 'home', 'yellow', { id: 'h4' })]);
    const a = rg.cardTapAction(s1, 'home', 'yellow', { id: 'h4' });
    assert.equal(a.payload?.card, 'red');
    assert.equal(a.payload?.second, true);
    assert.deepEqual([a.attribution?.playerId, a.attribution?.stat], ['h4', 'redCards']);
  });
  test('an unnamed yellow never turns into a second-yellow red', () => {
    const s1 = run(start(), [rg.cardTapAction(start(), 'home', 'yellow')]);
    assert.equal(rg.cardTapAction(s1, 'home', 'yellow').payload?.card, 'yellow');
  });
  test('old logs replay identically: an old official card stays an official card', () => {
    const old: ScoreAction[] = [{ type: 'CARD', side: 'away', payload: { card: 'yellow', official: 'Team official', uid: 'c1', sec: 100, period: 1 } }];
    const s = old.reduce(rg.reducer, start());
    assert.equal(s.events[0].official, 'Team official');
    assert.equal(rg.teamFigures(s, 'away').yellowCards, 0);
  });
});
