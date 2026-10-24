/**
 * Deep wave — ice hockey at IIHF / NHL game-summary depth:
 *  - optional "Stats to track" (faceoffs, hits & blocked shots, giveaways &
 *    takeaways, missed shots): the TALLY action, credits (a faceoff credits the
 *    winner and the loser on the other side), absolute statTotals (SD-19
 *    harness, every undo prefix), zeros only when tracked;
 *  - old logs replay identically (no new keys, no new columns, same score);
 *  - the broadcast sheet: goals by strength, PP / PK, power-play time from the
 *    penalty box replay, penalties by infraction, save %, faceoff %, shot
 *    attempts, shots by period — rows only for what was tracked;
 *  - the commentary: grouped by period, newest first, running score, period
 *    ends, the shoot-out group, the filters.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, eventCredits, creditAttribution, tallyTracked, ICE_HOCKEY_LIVE_SETTINGS, TALLY_KEYS,
  type IceHockeyState, type Side, type IceEvent, type PenKind, type Strength, type TallyKind,
} from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyTotals, DERIVED_KEYS } from '../src/sports/ice_hockey/totals.ts';
import { iceHockeyBox } from '../src/sports/ice_hockey/box.ts';
import { iceHockeyStats } from '../src/sports/ice_hockey/stats.ts';
import { iceHockeyTimeline } from '../src/sports/ice_hockey/timeline.ts';
import { iceHockeySheet, powerPlayTime, goalsBy, infractions } from '../src/sports/ice_hockey/sheet.ts';
import { iceHockeyCommentary, sentence } from '../src/sports/ice_hockey/commentary.ts';
import { filterFeed } from '../src/sports/feedGroups.ts';
import { iceHockeyVoice } from '../src/sports/ice_hockey/voice.ts';
import type { Player } from '../src/core/types.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import type { NameOf } from '../src/core/playerNames.ts';

const HOME = ['hg', 'h2', 'h3', 'h4', 'h5', 'h6'];
const AWAY = ['ag', 'a2', 'a3', 'a4', 'a5', 'a6'];
const nm = (id: string) => id.toUpperCase();
/** IDs-only scoring: the state keeps ids; the viewer's names come from a lookup */
const VIEWER: NameOf = (id, legacy) => (id ? nm(id) : (legacy ?? '').trim() || 'Player');
const NAMES = { home: 'Kings', away: 'Wolves' };
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<IceEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', side: side ?? 'home', ...ev } as IceEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hg' : 'ag', name: nm(team === 'home' ? 'hg' : 'ag') } } });
const goal = (side: Side, sec: number, period: number, scorer?: string, a1?: string, f: { strength?: Strength; en?: boolean } = {}) =>
  A('GOAL', side, sec, period, { type: 'goal', playerId: scorer, playerName: scorer && nm(scorer), secondId: a1, secondName: a1 && nm(a1), strength: f.strength ?? 'ev', en: f.en },
    { strength: f.strength ?? 'ev', ...(f.en ? { en: true } : {}) });
const shot = (side: Side, sec: number, period: number, shooter?: string) =>
  A('SHOT', side, sec, period, { type: 'shot', playerId: shooter, playerName: shooter && nm(shooter), gkId: side === 'home' ? 'ag' : 'hg', gkName: side === 'home' ? 'AG' : 'HG' });
const pen = (side: Side, sec: number, period: number, kind: PenKind, who?: string, infraction?: string) =>
  A('PEN', side, sec, period, { type: 'pen', pen: kind, playerId: who, playerName: who && nm(who) }, { pen: kind, ...(infraction ? { infraction } : {}) });
const tally = (side: Side, sec: number, period: number, kind: TallyKind, who?: string, loser?: string) =>
  A('TALLY', side, sec, period, { type: 'tally', tally: kind, playerId: who, playerName: who && nm(who), ...(loser ? { secondId: loser, secondName: nm(loser) } : {}) }, { kind });
const endPeriod = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const run = (actions: ScoreAction[], config?: Record<string, unknown>): IceHockeyState => actions.reduce(reducer, init(config));
const ALL_ON = { trackFaceoffs: true, trackPhysical: true, trackPuck: true, trackAttempts: true };

/* ------------------------------- old logs ---------------------------------- */

describe('deep wave · old logs replay identically', () => {
  const log: ScoreAction[] = [xi('home'), xi('away'), goal('home', 100, 1, 'h4', 'h3'), shot('away', 200, 1, 'a2'), pen('away', 300, 1, 'minor', 'a3', 'Hooking'), endPeriod()];
  const s = run(log);
  test('no track flags in the state, no tally keys on any line', () => {
    for (const f of ['trackFaceoffs', 'trackPhysical', 'trackPuck', 'trackAttempts'] as const) assert.equal(f in s, false);
    const t = iceHockeyTotals(s);
    for (const l of Object.values(t)) for (const k of TALLY_KEYS) assert.equal(k in l.stats, false, k);
    assert.deepEqual([s.home, s.away], [1, 0]);
  });
  test('no new box columns, no faceoff / hits sections in the sheet', () => {
    const table = buildBoxTable(iceHockeyStats, iceHockeyBox(s).data('all'));
    assert.ok(!table.columns.some((c) => ['fo', 'faceoffPct', 'checks', 'shotBlocks', 'takeaways', 'giveaways', 'missedShots'].includes(c.key)));
    const keys = iceHockeySheet(s).sections.map((x) => x.key);
    assert.ok(!keys.includes('fo') && !keys.includes('phys'));
    assert.ok(!iceHockeySheet(s).sections.find((x) => x.key === 'shots')!.rows.some((r) => r.key === 'missed' || r.key === 'attempts'));
  });
  test('an unknown TALLY kind is ignored', () => {
    const t = run([...log.slice(0, 2), { type: 'TALLY', side: 'home', payload: { kind: 'dance', uid: 'x', sec: 10, period: 1 } }]);
    assert.equal(t.events.length, 0);
  });
});

/* -------------------------------- tallies ---------------------------------- */

const SPORT: TotalsSport<IceHockeyState> = {
  name: 'ice hockey deep', init, reducer, statTotals: iceHockeyTotals, config: { decider: 'otso', ...ALL_ON },
  derived: DERIVED_KEYS as unknown as string[], signed: ['plusMinus'],
};

describe('deep wave · optional tallies (faceoffs, hits, blocks, giveaways, takeaways, missed shots)', () => {
  const log: ScoreAction[] = [
    xi('home'), xi('away'),
    tally('home', 0, 1, 'faceoff', 'h4', 'a4'),
    tally('away', 30, 1, 'faceoff', 'a4', 'h4'),
    tally('home', 60, 1, 'faceoff'), // team only (no centres named)
    tally('home', 70, 1, 'hit', 'h2'), tally('away', 80, 1, 'block', 'a3'), tally('home', 90, 1, 'takeaway', 'h5'),
    tally('away', 95, 1, 'giveaway', 'a6'), tally('home', 99, 1, 'missed', 'h6'),
    goal('home', 100, 1, 'h4', 'h3'), shot('away', 200, 1, 'a2'),
    endPeriod(), endPeriod(), endPeriod(),
  ];
  const records = toRecords(log);
  test('the reducer stores the tally with its winner / loser', () => {
    const s = run(log, SPORT.config);
    const fo = s.events.filter((e) => e.type === 'tally' && e.tally === 'faceoff');
    assert.deepEqual(fo.map((e) => [e.side, e.playerId, e.secondId]), [['home', 'h4', 'a4'], ['away', 'a4', 'h4'], ['home', undefined, undefined]]);
    assert.deepEqual([s.home, s.away], [1, 0], 'tallies never change the score');
  });
  test('credits: the loser is on the other side', () => {
    const c = eventCredits({ type: 'tally', side: 'home', tally: 'faceoff', playerId: 'h4', secondId: 'a4' });
    assert.deepEqual(c.first?.stats, { faceoffWins: 1 });
    assert.deepEqual([c.second?.stats, c.second?.side], [{ faceoffLosses: 1 }, 'away']);
    assert.deepEqual(eventCredits({ type: 'tally', side: 'away', tally: 'block', playerId: 'a3' }).first?.stats, { shotBlocks: 1 });
    assert.deepEqual(eventCredits({ type: 'tally', side: 'home', tally: 'hit', playerId: 'h2' }).first?.stats, { checks: 1 });
  });
  test('statTotals = live sums on every prefix; tracked keys read 0 for everyone else', () => {
    const t = assertContract(SPORT, records);
    assert.deepEqual([t.h4.stats.faceoffWins, t.h4.stats.faceoffLosses, t.a4.stats.faceoffWins, t.a4.stats.faceoffLosses], [1, 1, 1, 1]);
    assert.equal(t.h2.stats.checks, 1);
    assert.equal(t.a3.stats.shotBlocks, 1);
    assert.equal(t.h5.stats.takeaways, 1);
    assert.equal(t.a6.stats.giveaways, 1);
    assert.equal(t.h6.stats.missedShots, 1);
    assert.equal(t.h3.stats.faceoffWins, 0, 'tracked → 0, not "not tracked"');
  });
  test('only the switched-on toggles own their keys', () => {
    const s = run(log.filter((a) => a.type !== 'TALLY'), { trackFaceoffs: true });
    const t = iceHockeyTotals(s);
    assert.equal(t.h3.stats.faceoffWins, 0);
    assert.equal('checks' in t.h3.stats, false);
    assert.equal(tallyTracked(s, 'trackFaceoffs'), true);
    assert.equal(tallyTracked(s, 'trackPhysical'), false);
  });
  test('box: FO won-lost, FO%, HIT, BLK, TK, GV, MS columns when tracked', () => {
    const s = run(log, SPORT.config);
    const table = buildBoxTable(iceHockeyStats, iceHockeyBox(s).data('all'));
    const keys = table.columns.map((c) => c.key);
    for (const k of ['fo', 'faceoffPct', 'checks', 'shotBlocks', 'takeaways', 'giveaways', 'missedShots']) assert.ok(keys.includes(k), k);
    const h4 = table.home.rows.find((r) => r.playerId === 'h4')!;
    assert.equal(h4.cells[keys.indexOf('fo')], '1-1');
    assert.equal(h4.cells[keys.indexOf('faceoffPct')], '50.0%');
  });
  test('career rows and leaders: FO% with a 20-draw minimum, hidden when untracked', () => {
    const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'ice_hockey', stats } as unknown as StatLine);
    const career = careerSections(iceHockeyStats, [line({ goals: 1, faceoffWins: 12, faceoffLosses: 8 }, 1), line({ goals: 0, faceoffWins: 3, faceoffLosses: 2 }, 2), line({ goals: 2 }, 3)]);
    const fo = career.flatMap((s) => s.rows).find((r) => r.key === 'faceoffPct');
    assert.equal(fo?.value, '60.0%');
    assert.deepEqual(fo?.coverage, { tracked: 2, total: 3 }, 'says over how many games it was tracked');
    const none = careerSections(iceHockeyStats, [line({ goals: 1 }, 1)]);
    assert.equal(none.flatMap((s) => s.rows).some((r) => r.key === 'faceoffWins' || r.key === 'checks'), false, 'untracked rows are hidden');
  });
  test('schema stays valid; live settings carry the toggles', () => {
    assert.deepEqual(validateSchema(iceHockeyStats), []);
    const r = ICE_HOCKEY_LIVE_SETTINGS.read(run([], { trackFaceoffs: true }));
    assert.equal(r.trackFaceoffs, true);
    assert.equal(r.trackPhysical, false);
    // round 2 added "Faceoff zones" (trackFaceoffZones) to the group: 4 → 5
    assert.equal(ICE_HOCKEY_LIVE_SETTINGS.fields.filter((f) => f.group === 'Stats to track').length, 5);
  });
  test('the key-moments timeline leaves tallies out', () => {
    const s = run(log, SPORT.config);
    assert.ok(!iceHockeyTimeline(s).some((r) => r.kind === 'tally'));
  });
});

/* ------------------------------- the sheet ---------------------------------- */

describe('deep wave · the broadcast stats sheet', () => {
  const log: ScoreAction[] = [
    xi('home'), xi('away'),
    pen('away', 100, 1, 'minor', 'a2', 'Tripping'),
    goal('home', 150, 1, 'h4', 'h3', { strength: 'pp' }), // PP goal ends the minor: 50 s of PP
    pen('away', 300, 1, 'minor', 'a3', 'Tripping'), // runs out: 120 s
    shot('home', 320, 1, 'h5'), shot('home', 330, 1, 'h6'), shot('away', 340, 1, 'a5'),
    pen('home', 500, 1, 'minor', 'h2', 'Hooking'), pen('away', 500, 1, 'minor', 'a4', 'Slashing'), // coincident at full strength: 4 on 4, no PP
    endPeriod(),
    pen('home', 1300, 2, 'minor', 'h5', 'Interference'), // away PP 120 s in P2
    goal('away', 1350, 2, 'a6', undefined, { strength: 'pp' }),
    endPeriod(),
    { type: 'PULL', side: 'away', payload: { uid: 'pl', sec: 3500, period: 3 } },
    goal('home', 3550, 3, 'h3', undefined, { en: true }),
    endPeriod(),
  ];
  const s = run(log);
  test('power-play time from the penalty box replay', () => {
    assert.deepEqual(powerPlayTime(s), { home: 170, away: 50 });
    assert.deepEqual(powerPlayTime(s, 1), { home: 170, away: 0 });
    assert.deepEqual(powerPlayTime(s, 2), { home: 0, away: 50 });
  });
  test('goals by strength', () => {
    assert.deepEqual(goalsBy(s, 'home'), { all: 2, ev: 1, pp: 1, sh: 0, en: 1, ps: 0 });
    assert.deepEqual(goalsBy(s, 'away', 2), { all: 1, ev: 0, pp: 1, sh: 0, en: 0, ps: 0 });
  });
  test('a 4-on-4 (coincident minors at full strength) is not a power-play opportunity', () => {
    const t = run([pen('home', 500, 1, 'minor', 'h2'), pen('away', 500, 1, 'minor', 'a4')]);
    assert.deepEqual(powerPlayTime(t), { home: 0, away: 0 });
    const t2 = run([pen('home', 500, 1, 'double', 'h2'), pen('away', 500, 1, 'minor', 'a4')]);
    assert.equal(powerPlayTime(t2, 'all', 900).away, 120, 'the double minor outlasts the 4 on 4');
  });
  test('power play 1/2, penalty kill, infractions in order', () => {
    const sh = iceHockeySheet(s);
    const row = (sec: string, key: string) => sh.sections.find((x) => x.key === sec)!.rows.find((r) => r.key === key)!;
    assert.equal(row('pp', 'ppConv').home, '1/2 (50%)');
    assert.equal(row('pp', 'ppConv').away, '1/1 (100%)');
    assert.equal(row('pp', 'pk').home, '0/1 (0%)', 'home killed none of the away power plays');
    assert.equal(row('pp', 'pk').away, '1/2 (50%)');
    assert.equal(row('pp', 'ppTime').home, '2:50');
    assert.deepEqual(infractions(s).map((x) => [x.name, x.home, x.away]), [['Tripping', 0, 2], ['Hooking', 1, 0], ['Slashing', 0, 1], ['Interference', 1, 0]]);
    assert.equal(row('pens', 'inf:Tripping').away, '2');
    assert.equal(row('goals', 'eng').home, '1');
    assert.equal(row('gk', 'svPct').away, '66.7%', 'away: 2 saves, 1 goal against in net (the EN goal does not count)');
  });
  test('shots by period on the Overall view only; a period scope narrows everything', () => {
    assert.ok(iceHockeySheet(s).sections.some((x) => x.key === 'byPeriod'));
    const p1 = iceHockeySheet(s, 1);
    assert.ok(!p1.sections.some((x) => x.key === 'byPeriod'));
    assert.equal(p1.sections.find((x) => x.key === 'shots')!.rows.find((r) => r.key === 'sog')!.home, '3');
  });
  test('faceoffs and shot attempts appear once tracked', () => {
    const t = run([...log.slice(0, 3), tally('home', 160, 1, 'faceoff', 'h4', 'a4'), tally('home', 170, 1, 'faceoff', 'h4', 'a4'), tally('away', 180, 1, 'faceoff', 'a4', 'h4'),
      tally('home', 190, 1, 'missed', 'h5'), tally('away', 195, 1, 'block', 'a3')], ALL_ON);
    const sh = iceHockeySheet(t);
    const fo = sh.sections.find((x) => x.key === 'fo')!;
    assert.equal(fo.rows.find((r) => r.key === 'foPct')!.home, '66.7%');
    const shots = sh.sections.find((x) => x.key === 'shots')!;
    assert.equal(shots.rows.find((r) => r.key === 'attempts')!.home, '2', 'no shot on goal yet + 1 missed + 1 blocked by away');
    assert.equal(shots.rows.find((r) => r.key === 'blockedBy')!.home, '1');
  });
});

/* ----------------------------- the commentary ------------------------------- */

describe('deep wave · commentary grouped by period, newest first', () => {
  const log: ScoreAction[] = [
    xi('home'), xi('away'),
    goal('home', 100, 1, 'h4', 'h3'),
    pen('away', 300, 1, 'minor', 'a3', 'Tripping'),
    shot('home', 320, 1, 'h5'),
    endPeriod(),
    goal('away', 1500, 2, 'a6'),
    endPeriod(), endPeriod(),
  ];
  const s = run(log, { decider: 'so' });
  const feed = iceHockeyCommentary(s, NAMES, VIEWER);
  test('groups newest first with the period summary', () => {
    assert.deepEqual(feed.map((g) => g.title), ['3rd period', '2nd period', '1st period']);
    assert.equal(feed[2].sub, 'Goals 1–0 · Shots 2–0');
  });
  test('lines newest first, game time, running score on goals, period end', () => {
    const p1 = feed[2].lines;
    assert.match(p1[0].text, /^End of the 1st period — Kings 1–0 Wolves\. Shots 2–0\.$/);
    assert.equal(p1[p1.length - 1].text, 'GOAL! H4 scores for Kings, assisted by H3.');
    assert.equal(p1[p1.length - 1].score, '1–0');
    assert.equal(p1[p1.length - 1].when, '01:40');
    assert.equal(p1.find((l) => l.tags?.includes('pen'))!.text, 'A3 (Wolves) — minor 2′ for tripping. Kings on the power play.');
    assert.equal(feed[1].lines.find((l) => l.tags?.includes('goal'))!.score, '1–1');
  });
  test('the shoot-out group: each attempt, the winner', () => {
    let t = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    for (const [side, scored] of [['home', true], ['away', false], ['home', true], ['away', false], ['home', true], ['away', false]] as const) {
      t = reducer(t, { type: 'SO', side, payload: { scored } });
    }
    const f = iceHockeyCommentary(t, NAMES);
    assert.equal(f[0].title, 'Shoot-out');
    assert.equal(f[0].lines[0].text, 'Kings win the shoot-out 3–0.');
    assert.equal(f[0].lines.length, 7);
    assert.equal(f[0].lines[1].text, 'Wolves are stopped.');
    assert.equal(f[0].lines[1].score, '3–0');
  });
  test('a correction re-derives the feed (removing the goal)', () => {
    const id = s.events.find((e) => e.type === 'goal' && e.side === 'home')!.id;
    const t = reducer(s, { type: 'REMOVE_EVENT', payload: { id } });
    const f = iceHockeyCommentary(t, NAMES);
    assert.equal(f.find((g) => g.title === '2nd period')!.lines.find((l) => l.tags?.includes('goal'))!.score, '0–1');
  });
  test('filters: key moments keep goals and period ends; scope narrows to a period', () => {
    const key = filterFeed(feed, { tag: 'key' }).flatMap((g) => g.lines.map((l) => l.id));
    assert.ok(key.includes('end1') && !key.some((id) => s.events.find((e) => e.id === id)?.type === 'shot'));
    assert.deepEqual(filterFeed(feed, { scope: 2 }).map((g) => g.title), ['2nd period']);
  });
  test('sentences: penalty shot, coincident penalties, empty net, tallies', () => {
    const e = (x: Partial<IceEvent>) => ({ id: 'x', sec: 0, period: 1, side: 'home', ...x }) as IceEvent;
    assert.equal(sentence(s, e({ type: 'goal', playerName: 'Rao', ps: true }), NAMES).text, 'GOAL! Rao scores for Kings on a penalty shot.');
    assert.equal(sentence(s, e({ type: 'goal', playerName: 'Rao', strength: 'sh', en: true, secondName: 'A', thirdName: 'B' }), NAMES).text,
      'GOAL! Rao scores for Kings short-handed into the empty net, assisted by A and B.');
    assert.equal(sentence(s, e({ type: 'pen', pen: 'minor', playerName: 'Rao' }), NAMES, new Set(['x'])).text, 'Rao (Kings) — minor 2′. Coincident penalties — no power play.');
    assert.equal(sentence(s, e({ type: 'pen', pen: 'gm', playerName: 'Rao' }), NAMES).text, 'Rao (Kings) — game misconduct. Rao is out of the game.');
    assert.equal(sentence(s, e({ type: 'tally', tally: 'faceoff', playerName: 'Rao', secondName: 'Khan' }), NAMES).text, 'Rao (Kings) wins the faceoff against Khan.');
    assert.equal(sentence(s, e({ type: 'tally', tally: 'block' }), NAMES).text, 'Kings block a Wolves shot.');
  });
});

/* --------------------------------- voice ------------------------------------ */

describe('deep wave · voice for the tracked tallies', () => {
  const P = (id: string, fullName: string, jerseyNo?: number): Player => ({ id, fullName, jerseyNo, sports: ['ice_hockey'] } as Player);
  const homeRoster = [P('h2', 'Asha Rao', 2), P('h3', 'Meera Khan', 3), P('hg', 'Tara Singh', 1)];
  const awayRoster = [P('a2', 'Ravi Nair', 12), P('ag', 'Dev Shah', 31)];
  const T = 1_700_000_000_000;
  const clock: ScoreAction = { type: 'CLOCK', payload: { run: true, at: T - 300_000 } };
  const ctx = (s: IceHockeyState) => ({ state: s, homeName: 'Hawks', awayName: 'Wolves', homeRoster, awayRoster, now: T });
  test('tracked: faceoff / hit / blocked shot / takeaway / missed shot', () => {
    const live = run([xi('home'), xi('away'), clock], ALL_ON);
    const fo = iceHockeyVoice('faceoff Rao', ctx(live))![0];
    assert.deepEqual([fo.type, fo.side, fo.payload?.kind, fo.attribution?.playerId, fo.attribution?.stat], ['TALLY', 'home', 'faceoff', 'h2', 'faceoffWins']);
    assert.equal(iceHockeyVoice('hit Nair', ctx(live))![0].payload?.kind, 'hit');
    assert.equal(iceHockeyVoice('blocked shot Khan', ctx(live))![0].payload?.kind, 'block');
    assert.equal(iceHockeyVoice('takeaway Rao', ctx(live))![0].payload?.kind, 'takeaway');
    assert.equal(iceHockeyVoice('missed shot Nair', ctx(live))![0].payload?.kind, 'missed');
    assert.equal(iceHockeyVoice('faceoff home', ctx(live))![0].attribution, undefined, 'team only');
  });
  test('untracked: the same words fall back to the usual calls', () => {
    const live = run([xi('home'), xi('away'), clock]);
    assert.equal(iceHockeyVoice('faceoff Rao', ctx(live)), null);
    assert.equal(iceHockeyVoice('shot Rao', ctx(live))![0].type, 'SHOT');
  });
});
