/**
 * Deep wave (invasion-goal family) — handball (IHF) depth:
 *  - optional tracking (technical-fault kinds, 7 m won by): off by default,
 *    old states keep their exact shape;
 *  - empty goal (IHF 4:1, a 7th court player): nobody in goal — the keeper is
 *    not charged, goals into the empty goal counted (IHF "EG");
 *  - the IHF goalkeeper line by position (derived, free on every match);
 *  - 7 m won by (live credit), shoot-out saved vs missed + the keeper;
 *  - statTotals (SD-19 contract), the match centre and the commentary.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, eventCredits, creditAttribution, keeperAt, goalEmpty, readHandballTrack, HANDBALL_LIVE_SETTINGS,
  type HandballEvent, type HandballState, type Side,
} from '../src/sports/handball/engine.ts';
import { handballTotals, DERIVED_KEYS } from '../src/sports/handball/totals.ts';
import { handballDepthFigures, handballUntracked, emptyGoalIndexes, handballDerivedCredits } from '../src/sports/handball/depth.ts';
import { handballFeed, handballFacts, handballFeedPeriods, handballPeriodLabel } from '../src/sports/handball/feed.ts';
import { handballBox } from '../src/sports/handball/box.ts';
import { handballStats, handballCentre } from '../src/sports/handball/stats.ts';
import { handballTimeline } from '../src/sports/handball/timeline.ts';
import { centreComparison, visibleCategories, centreKeys } from '../src/sports/invasion/centre.ts';
import { feedSections } from '../src/sports/invasion/feed.ts';
import { validateSchema, statDefIn, aggregateValue } from '../src/sports/statSchema.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import type { NameOf } from '../src/core/playerNames.ts';

const nm = (id: string) => id.toUpperCase();
/** IDs-only scoring: the state keeps ids; the viewer's names come from a lookup */
const NAMES: NameOf = (id, legacy) => (id ? nm(id) : (legacy ?? '').trim() || 'Player');
const names = { home: 'India', away: 'Korea' };
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<HandballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', ...ev } as HandballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: payload.uid ?? `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const who = (id: string) => ({ playerId: id, playerName: nm(id) });
const XI = (team: Side, gk: string, players: string[]): ScoreAction => ({ type: 'XI', payload: { team, gk: { id: gk, name: nm(gk) }, players: players.map((id) => ({ id, name: nm(id) })) } });
const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce(reducer, init(config));
const goal = (side: Side, sec: number, id: string, shotType: string, period = 1, assist?: string) =>
  A('GOAL', side, sec, period, { type: 'goal', shotType: shotType as never, ...who(id), ...(assist ? { secondId: assist, secondName: nm(assist) } : {}) }, { shotType });
const missSaved = (side: Side, sec: number, id: string, shotType: string, gk: string, uid: string): ScoreAction[] => [
  A('MISS', side, sec, 1, { type: 'miss', shotType: shotType as never, ...who(id) }, { shotType, result: 'saved', uid }),
  A('SAVE', side === 'home' ? 'away' : 'home', sec, 1, { type: 'save', shotType: shotType as never, ...who(gk) }, { ref: uid, shotType }),
];

function match(): ScoreAction[] {
  u = 0;
  return [
    XI('home', 'hgk', ['hgk', 'h1', 'h2', 'h3']), XI('away', 'agk', ['agk', 'a1', 'a2', 'a3']),
    goal('home', 60, 'h1', 'wing', 1, 'h2'),
    ...missSaved('away', 120, 'a1', 'nineM', 'hgk', 'm1'),
    ...missSaved('away', 150, 'a2', 'sixM', 'hgk', 'm2'),
    goal('away', 200, 'a1', 'sixM'),
    A('TURNOVER', 'home', 260, 1, { type: 'turnover', ...who('h3') }, { fault: 'steps' }),
    A('DRAWN', 'away', 300, 1, { type: 'drawn', ...who('a3') }),
    ...missSaved('away', 305, 'a2', 'sevenM', 'hgk', 'm3'),
    A('EMPTY_GOAL', 'away', 400, 1, {}, { on: true }),
    goal('home', 420, 'h2', 'nineM'), // into the empty goal: AGK not charged
    A('EMPTY_GOAL', 'away', 450, 1, {}, { on: false }),
    goal('home', 500, 'h1', 'fastBreak'),
    A('CARD', 'away', 520, 1, { type: 'card', card: 'twoMin', ...who('a3') }, { card: 'twoMin' }),
    A('TIMEOUT', 'away', 530, 1),
    { type: 'END_PERIOD', payload: { at: 0 } },
    goal('away', 1900, 'a1', 'breakthrough', 2),
  ];
}
const CFG = { trackFaultTypes: true, trackSevenMDrawn: true };

describe('deep wave · handball — off by default, old states unchanged', () => {
  test('no `track` key unless switched on; a turnover without a kind carries none', () => {
    assert.equal('track' in init({}), false);
    assert.equal(readHandballTrack({}), undefined);
    assert.deepEqual(init(CFG).track, { faultTypes: true, sevenMDrawn: true });
    const s = run([A('TURNOVER', 'home', 10, 1, { type: 'turnover' })]);
    assert.equal('fault' in s.events[0], false);
  });
  test('live settings: "Stats to track" read from the state', () => {
    assert.deepEqual(HANDBALL_LIVE_SETTINGS.fields.filter((f) => f.group === 'Stats to track').map((f) => f.key), ['trackFaultTypes', 'trackSevenMDrawn']);
    assert.equal(HANDBALL_LIVE_SETTINGS.read(init(CFG)).trackSevenMDrawn, true);
  });
});

describe('deep wave · handball empty goal (IHF 4:1)', () => {
  const s = run(match(), CFG);
  test('nobody in goal while empty; the keeper is back after', () => {
    const i = s.events.findIndex((e) => e.type === 'empty' && e.on === true);
    assert.equal(goalEmpty(s, 'away', i + 1), true);
    assert.equal(keeperAt(s, 'away', i + 1), undefined);
    assert.equal(goalEmpty(s, 'away'), false);
    assert.equal(keeperAt(s, 'away')?.id, 'agk');
  });
  test('the empty-goal goal is tagged, credited to the scorer (derived) and not charged to the keeper', () => {
    assert.equal(emptyGoalIndexes(s).size, 1);
    assert.deepEqual(handballDerivedCredits(s).h2?.stats, { emptyGoalGoals: 1 });
    const t = handballTotals(s);
    assert.equal(t.agk.stats.goalsConceded, 2, '3 home goals, one into the empty goal');
    assert.equal(t.h2.stats.emptyGoalGoals, 1);
    assert.equal(handballDepthFigures(s, 'home').emptyGoalGoals, 1);
  });
  test('an older log without empty-goal events: keepers unchanged, no EG key', () => {
    const s0 = run(match().filter((a) => a.type !== 'EMPTY_GOAL'));
    assert.equal(handballTotals(s0).agk.stats.goalsConceded, 3);
    assert.equal('emptyGoalGoals' in handballDepthFigures(s0, 'home'), false);
  });
});

describe('deep wave · handball keeper line by position, 7 m won, fault kinds', () => {
  const s = run(match(), CFG);
  test('per keeper: saves and goals let in by position (free — derived from every log)', () => {
    const h = handballTotals(s).hgk.stats;
    assert.deepEqual([h.nineMSaves, h.sixMSaves, h.sevenMSaves, h.sixMConceded, h.breakthroughConceded, h.wingConceded], [1, 1, 1, 1, 1, 0]);
    const line = (stats: Record<string, number>): StatLine => ({ id: 'l1', matchId: 'm1', playerId: 'hgk', sport: 'handball', stats } as StatLine);
    assert.equal(aggregateValue(handballStats, statDefIn(handballStats, 'sixMSavePct')!, [line(h)]).text, '50%');
  });
  test('team save % overall and by position', () => {
    const d = handballDepthFigures(s, 'home');
    assert.equal(d.savePct, 60); // 3 saves, 2 goals let in
    assert.equal(d.sixMSavePct, 50);
    assert.equal(d.nineMSavePct, 100);
    assert.equal(d.sevenMSavePct, 100);
    assert.equal('wingSavePct' in d, false, 'no wing shot faced → no figure');
  });
  test('7 m won: credited live (and by statTotals), zero-filled when tracked; fault kinds counted', () => {
    const t = handballTotals(s);
    assert.equal(t.a3.stats.sevenMDrawn, 1);
    assert.equal(t.a1.stats.sevenMDrawn, 0);
    assert.equal(handballDepthFigures(s, 'home').tfSteps, 1);
    assert.deepEqual(handballUntracked(s), []);
    const plain = run(match().filter((a) => a.type !== 'DRAWN'));
    assert.deepEqual(handballUntracked(plain), ['sevenMDrawn']);
    assert.equal('sevenMDrawn' in handballTotals(plain).a1.stats, false);
    assert.equal('tfSteps' in handballDepthFigures(run(match().map((a) => (a.type === 'TURNOVER' ? { ...a, payload: { ...a.payload, fault: undefined } } : a))), 'home'), false);
  });
  test('the SD-19 contract holds (derived keeper / EG / SO keys, live 7 m won), every undo prefix', () => {
    const sp: TotalsSport<HandballState> = { name: 'handball', init, reducer, statTotals: handballTotals, partial: false, derived: DERIVED_KEYS, config: CFG };
    assertContract(sp, toRecords(match()), { every: 1 });
  });
  test('match centre categories; every key declared; schema valid', () => {
    const data = handballBox(s).data('all');
    const cats = visibleCategories(handballStats, data, 'all', handballCentre);
    assert.deepEqual(cats.map((c) => c.id), ['top', 'shooting', 'keeping', 'ball', 'discipline']);
    const keep = centreComparison(handballStats, data, 'all', handballCentre[2]);
    assert.equal(keep.rows.find((r) => r.key === 'sixMSavePct')?.home, '50%');
    const wing = keep.rows.find((r) => r.key === 'wingSavePct')!;
    assert.deepEqual([wing.home, wing.away], ['–', '0%'], 'home faced no wing shot; away saved 0 of 1');
    assert.equal(keep.rows.find((r) => r.key === 'fastBreakSavePct')?.away, '0%');
    assert.equal(keep.rows.find((r) => r.key === 'breakthroughSavePct')?.home, '0%');
    const shoot = centreComparison(handballStats, data, 'all', handballCentre[1]);
    assert.equal(shoot.rows.find((r) => r.key === 'emptyGoalGoals')?.home, '1');
    assert.equal(shoot.rows.find((r) => r.key === 'sevenMDrawn')?.away, '1');
    const ball = centreComparison(handballStats, data, 'all', handballCentre[3]);
    assert.equal(ball.rows.find((r) => r.key === 'tfSteps')?.home, '1');
    for (const k of centreKeys(handballCentre)) assert.ok(statDefIn(handballStats, k), k);
    assert.deepEqual(validateSchema(handballStats), []);
  });
  test('timeline rows for the new events', () => {
    const rows = handballTimeline(s, undefined, NAMES);
    assert.ok(rows.some((r) => r.label === 'Empty goal — 7th court player'));
    assert.ok(rows.some((r) => r.label === 'Goalkeeper back in goal'));
    assert.ok(rows.some((r) => r.label === '7 m throw won'));
    assert.ok(rows.some((r) => r.label === 'Technical fault · steps'));
  });
});

describe('deep wave · handball shoot-out keepers', () => {
  test('saved vs missed + the keeper → soSaves (derived, keyed)', () => {
    u = 200;
    const acts: ScoreAction[] = [
      XI('home', 'hgk', ['hgk', 'h1']), XI('away', 'agk', ['agk', 'a1']),
      goal('home', 60, 'h1', 'nineM'), goal('away', 90, 'a1', 'nineM'),
      { type: 'END', payload: { at: 0 } }, { type: 'START_SHOOTOUT', payload: { first: 'away' } },
      { type: 'SO', side: 'away', payload: { scored: false, outcome: 'saved', keeperId: 'hgk', keeperName: 'HGK' }, attribution: { playerId: 'a1', stat: 'soTaken', playerName: 'A1' } },
      { type: 'SO', side: 'home', payload: { scored: true, outcome: 'scored', keeperId: 'agk', keeperName: 'AGK' }, attribution: { playerId: 'h1', stat: 'soTaken', playerName: 'H1', extra: { soGoals: 1 } } },
    ];
    const sp: TotalsSport<HandballState> = { name: 'handball', init, reducer, statTotals: handballTotals, partial: false, derived: DERIVED_KEYS, config: { decider: 'shootout' } };
    const t = assertContract(sp, toRecords(acts), { every: 1 });
    assert.deepEqual([t.hgk.stats.soSaves, t.agk.stats.soSaves], [1, 0]);
    const s = run(acts, { decider: 'shootout' });
    const f = handballFeed(s, names).filter((i) => i.period === 99);
    assert.deepEqual(f.map((i) => [i.stamp, i.text, i.scoreText]), [
      ['7m 1', 'Throw 1: A1 (Korea) is saved by HGK.', '0–0'],
      ['7m 1', 'Throw 1: H1 (India) scores.', '1–0'],
    ]);
  });
});

describe('deep wave · handball commentary + facts', () => {
  const s = run(match(), CFG);
  const feed = handballFeed(s, names, NAMES);
  test('IHF live-text sentences; saves fold into their attempt', () => {
    const texts = feed.map((i) => i.text);
    assert.ok(texts.includes('H1 (India) scores from the wing. Assist: H2.'));
    assert.ok(texts.includes('A1 (Korea) — 9 m shot saved by HGK.'));
    assert.ok(texts.includes('A2 (Korea) — 7-metre throw saved by HGK.'));
    assert.ok(texts.includes('H2 (India) scores from 9 metres into the empty goal.'));
    assert.ok(texts.includes('Technical fault by H3 (India) — steps.'));
    assert.ok(texts.includes('7-metre throw to Korea, won by A3.'));
    assert.ok(texts.includes('Korea take the goalkeeper off for a 7th court player — their goal is empty.'));
    assert.ok(texts.includes("Korea's goalkeeper is back in goal."));
    assert.ok(texts.includes('2-minute suspension for A3 (Korea). Korea play short for 2 minutes.'));
    assert.ok(texts.includes('Team time-out, Korea.'));
    assert.equal(texts.filter((x) => x.startsWith('Save by')).length, 0);
  });
  test('clock stamps, running score, sections by half', () => {
    const g = feed.find((i) => i.text.startsWith('H1 (India) scores on the fast break'))!;
    assert.deepEqual([g.stamp, g.score], ['08:20', { home: 3, away: 1 }]);
    const secs = feedSections(feed, handballPeriodLabel(s), { periods: handballFeedPeriods(s) });
    assert.deepEqual(secs.map((x) => [x.label, x.score.home, x.score.away, x.goals.away]), [['2nd half', 3, 2, 1], ['1st half', 3, 1, 1]]);
  });
  test('facts: top scorers goals/attempts, HT score', () => {
    const f = handballFacts(s, 3, NAMES);
    assert.deepEqual(f.home, ['🤾 H1 2/2', '🤾 H2 1/1']);
    assert.deepEqual(f.away, ['🤾 A1 2/3']);
    assert.deepEqual(f.notes, ['Half-time 3–1']);
  });
});
