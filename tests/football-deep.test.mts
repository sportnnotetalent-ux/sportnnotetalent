/**
 * Deep wave (invasion-goal family) — football depth:
 *  - optional "Deeper stats" tracking (shot detail, key passes, clearances,
 *    goal kicks / throw-ins, card reasons): off by default, the state keeps
 *    its exact old shape unless switched on; the live-settings group;
 *  - the reducer: shot zone / big chance / woodwork, a key pass's shot,
 *    GOAL_DETAIL on the latest goal, NO_GOAL (score never moves), card reasons;
 *  - statTotals: shot-detail keys derived only for a match that tracked them,
 *    key passes / clearances credited live and zero-filled only when tracked
 *    (SD-19 contract via the harness);
 *  - the match centre's depth figures and categories;
 *  - the minute-by-minute commentary (BBC-style sentences, folded saves /
 *    blocks / key passes, FIFA minutes, running score, shoot-out) and facts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as football from '../src/sports/football/engine.ts';
import { footballStatTotals, FOOTBALL_DERIVED_KEYS, GOAL_STAT, STAT_KEY, statCredits } from '../src/sports/football/totals.ts';
import {
  shotDetailTracked, keyPassesTracked, footballShotDetailTotals, footballDepthTeamStats, footballDepthUntracked, optionalStatKeys, SHOT_DETAIL_KEYS,
} from '../src/sports/football/depth.ts';
import { footballCentreSource } from '../src/sports/football/centre.ts';
import { footballFeed, footballFacts, footballFeedPeriods, FOOTBALL_PERIOD_LABEL, footballEventSentence, footballStatSentence } from '../src/sports/football/feed.ts';
import { footballStats, footballCentre } from '../src/sports/football/stats.ts';
import { centreComparison, visibleCategories, centreKeys } from '../src/sports/invasion/centre.ts';
import { feedSections } from '../src/sports/invasion/feed.ts';
import { validateSchema, statDefIn, aggregateValue } from '../src/sports/statSchema.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { GoalType, StatKind } from '../src/sports/football/events.ts';
import type { StatLine } from '../src/core/types.ts';

type Side = 'home' | 'away';
const NAME = (id: string) => id.toUpperCase();
const names = { home: 'India', away: 'Japan' };
const run = (acts: ScoreAction[], config: Record<string, unknown> = {}) => acts.reduce(football.reducer, football.init(config));

let minute = 1;
let half: 1 | 2 = 1;
const at = () => ({ minute: minute++, half });
const attr = (id: string, stat: string, extra?: Record<string, number>) => ({ playerId: id, stat, playerName: NAME(id), ...(extra ? { extra } : {}) });
const goal = (side: Side, id: string, goalType: GoalType = 'open', more: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'GOAL', side, payload: { goalType, pid: id, ...more, ...at() }, attribution: attr(id, 'goals', { shots: 1, shotsOnTarget: 1, [GOAL_STAT[goalType]]: 1 }) });
const assist = (side: Side, id: string): ScoreAction => ({ type: 'ASSIST', side, payload: { pid: id, ...at() }, attribution: attr(id, 'assists') });
/** recordStat as the controls fire it (detail rides in the payload) */
const stat = (side: Side, kind: StatKind, id?: string, detail: Record<string, unknown> = {}): ScoreAction => {
  const key = STAT_KEY[kind];
  const c = statCredits({ kind, onTarget: detail.onTarget as boolean, blocked: detail.blocked as boolean, complete: detail.complete as boolean });
  const { [key ?? '']: _k, ...extra } = c;
  return {
    type: 'STAT', side, payload: { kind, at: 1, ...detail, playerName: id ? NAME(id) : undefined, ...at() },
    attribution: id && key ? attr(id, key, Object.keys(extra).length ? extra : undefined) : undefined,
  };
};
const card = (side: Side, id: string, color: 'yellow' | 'red', reason?: string, secondYellow = false): ScoreAction =>
  ({ type: color === 'yellow' ? 'YELLOW' : 'RED', side, payload: { pid: id, ...(reason ? { reason } : {}), ...(secondYellow ? { secondYellow: true } : {}), ...at() }, attribution: attr(id, color === 'yellow' ? 'yellowCards' : 'redCards') });
const p = (id: string) => ({ id, name: NAME(id) });
const xi = (team: Side, gk: string, players: string[]): ScoreAction => ({ type: 'XI', payload: { team, gk: p(gk), players: players.map(p), keepers: [p(gk)] } });
const KICK: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1, ord: true } }, xi('home', 'hgk', ['hgk', 'hcb', 'hmf', 'hst']), xi('away', 'agk', ['agk', 'acb', 'amf', 'ast'])];
const DEEP = { trackShotDetail: true, trackKeyPasses: true, trackClearances: true, trackSetPieces: true, trackCardReasons: true };

/** A match with every deep capture: ids follow the reducer's seq (KICKOFF/XI don't bump it). */
function deepMatch(): ScoreAction[] {
  minute = 1; half = 1;
  return [
    ...KICK,
    stat('home', 'shot', 'hst', { onTarget: true, zone: 'out', bigChance: true }), // id 1
    stat('away', 'save', 'agk'), // id 2 — folds into shot 1
    stat('home', 'keyPass', 'hmf', { ref: 1 }), // id 3 — folds into shot 1
    goal('home', 'hst', 'open', { bodyPart: 'right', zone: 'box', bigChance: true }), // id 4
    assist('home', 'hmf'),
    stat('away', 'shot', 'ast', { onTarget: false, woodwork: true, zone: 'out' }), // id 5
    stat('away', 'shot', 'amf', { onTarget: false, blocked: true, zone: 'box' }), // id 6
    stat('home', 'block', 'hcb'), // id 7 — folds into shot 6
    stat('home', 'clearance', 'hcb'), // id 8
    stat('away', 'goalKick'), stat('home', 'throwIn'), // ids 9, 10
    stat('home', 'foul', 'hmf', { secondName: 'AMF' }), // id 11
    card('home', 'hmf', 'yellow', 'foul'), // id 12
    { type: 'NO_GOAL', side: 'away', payload: { reason: 'offside', review: true, ...at() } }, // id 13
    { type: 'NEXT_HALF', payload: { at: 2 } },
    ...(() => { half = 2; return [] as ScoreAction[]; })(),
    stat('home', 'penaltyWon', 'hst'),
    goal('home', 'hst', 'penalty'),
    card('away', 'acb', 'red', 'dogso'),
    { type: 'END', payload: { at: 3 } },
  ];
}

/* ------------------------------ old shape kept ------------------------------ */

describe('deep wave · football — off by default, old states unchanged', () => {
  test('a format without the toggles: no `deep` key, nothing tracked', () => {
    const s = football.init({});
    assert.equal('deep' in s, false);
    assert.equal(football.readDeepTrack({}), undefined);
    assert.equal(shotDetailTracked(s), false);
    assert.equal(keyPassesTracked(s), false);
    assert.deepEqual(optionalStatKeys(s), []);
    assert.deepEqual(Object.keys(s.track).length, 15, 'TrackConfig keeps its 15 keys');
  });
  test('switched-on toggles land on `deep` only', () => {
    const s = football.init({ trackShotDetail: true, trackCardReasons: false });
    assert.deepEqual(s.deep, { shotDetail: true });
    assert.deepEqual(football.init(DEEP).deep, { shotDetail: true, keyPasses: true, clearances: true, setPieces: true, cardReasons: true });
  });
  test('a log without the new payload keys replays to events / stats without them', () => {
    minute = 1; half = 1;
    const s = run([...KICK, stat('home', 'shot', 'hst', { onTarget: true }), goal('home', 'hst'), card('home', 'hcb', 'yellow')]);
    assert.deepEqual(Object.keys(s.stats[0]).sort(), ['complete', 'half', 'id', 'kind', 'minute', 'onTarget', 'playerId', 'playerName', 'secondName', 'side'].sort());
    for (const e of s.events) for (const k of ['zone', 'bigChance', 'reason', 'review']) assert.equal(k in e, false, k);
    // and statTotals writes none of the deep keys
    const t = footballStatTotals(s);
    for (const k of [...SHOT_DETAIL_KEYS, 'keyPasses', 'clearances']) assert.equal(k in (t.hst?.stats ?? {}), false, k);
  });
  test('live settings: the deeper stats, read from `deep`, on for a new match (but goals ruled out)', () => {
    const LS = football.FOOTBALL_LIVE_SETTINGS;
    // defaults-on DOI5: one "Stats to track" group for every stats toggle
    const keys = LS.fields.filter((f) => football.DEEP_TRACK_FIELDS.some((d) => d.key === f.key)).map((f) => f.key);
    for (const k of keys) assert.equal(LS.fields.find((f) => f.key === k)?.group, 'Stats to track', k);
    assert.deepEqual(keys, ['trackShotDetail', 'trackKeyPasses', 'trackClearances', 'trackSetPieces', 'trackCardReasons', 'trackRuledOut']);
    assert.equal(LS.read(football.init({})).trackShotDetail, false);
    assert.equal(LS.read(football.init({ trackShotDetail: true })).trackShotDetail, true);
    // defaults-on DOI2: the standard is a new match's — on, but goals ruled out
    for (const k of keys) assert.equal(LS.defaults?.[k], k !== 'trackRuledOut', k);
    // FB-17: crosses / dribbles / handballs can be switched off too
    assert.ok(['trackCrosses', 'trackDribbles', 'trackHandball'].every((k) => LS.fields.some((f) => f.key === k)));
  });
});

/* --------------------------------- reducer --------------------------------- */

describe('deep wave · football reducer', () => {
  const s = run(deepMatch(), DEEP);
  test('shots carry zone / big chance / woodwork; a key pass its shot', () => {
    assert.deepEqual([s.stats[0].zone, s.stats[0].bigChance], ['out', true]);
    assert.equal(s.stats.find((e) => e.kind === 'keyPass')?.ref, 1);
    assert.equal(s.stats.find((e) => e.woodwork)?.playerName, 'AST');
  });
  test('goals carry zone / big chance; GOAL_DETAIL patches the side\'s latest goal (null clears)', () => {
    const g = s.events.find((e) => e.type === 'goal')!;
    assert.deepEqual([g.zone, g.bigChance, g.bodyPart], ['box', true, 'right']);
    minute = 1; half = 1;
    let t = run([...KICK, goal('home', 'hst'), goal('away', 'ast'), goal('home', 'hmf')]);
    t = football.reducer(t, { type: 'GOAL_DETAIL', side: 'home', payload: { zone: 'out', bigChance: true } });
    assert.deepEqual([t.events[2].zone, t.events[2].bigChance, t.events[0].zone], ['out', true, undefined]);
    t = football.reducer(t, { type: 'GOAL_DETAIL', side: 'home', payload: { zone: null } });
    assert.deepEqual([t.events[2].zone, t.events[2].bigChance], [undefined, true]);
    assert.equal(t.home, 2, 'the score never moves');
  });
  test('NO_GOAL: a timeline row with reason + VAR flag; the score is untouched', () => {
    const ng = s.events.find((e) => e.type === 'nogoal')!;
    assert.deepEqual([ng.side, ng.reason, ng.review], ['away', 'offside', true]);
    assert.equal(s.away, 0);
    assert.deepEqual(football.fairPlayScore(s.events).away, -4, 'a ruled-out goal is no card');
  });
  test('card reasons ride on the card', () => {
    assert.deepEqual(s.events.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => e.reason), ['foul', 'dogso']);
  });
});

/* ------------------------------- statTotals -------------------------------- */

describe('deep wave · football statTotals', () => {
  const sp: TotalsSport<football.FootballState> = {
    name: 'football', init: football.init, reducer: football.reducer, statTotals: footballStatTotals, partial: true, derived: FOOTBALL_DERIVED_KEYS, config: DEEP,
  };
  test('the SD-19 contract holds (live key passes / clearances; derived shot detail), every undo prefix', () => {
    const t = assertContract(sp, toRecords(deepMatch()), { every: 1 });
    assert.deepEqual(
      SHOT_DETAIL_KEYS.map((k) => t.hst.stats[k]),
      // shotsInBox, shotsOutBox, goalsInBox, goalsOutBox, bigChances, bigChancesMissed, woodwork
      [1, 1, 1, 0, 2, 1, 0],
    );
    assert.equal(t.ast.stats.woodwork, 1);
    assert.equal(t.amf.stats.shotsInBox, 1);
    assert.equal(t.hmf.stats.keyPasses, 1);
    assert.equal(t.hcb.stats.clearances, 1);
    assert.equal(t.hcb.stats.keyPasses, 0, 'zero-filled: the match tracked key passes');
  });
  test('without the toggles nothing deep is written (no false 0)', () => {
    minute = 1; half = 1;
    const s = run([...KICK, stat('home', 'shot', 'hst', { onTarget: true }), goal('home', 'hst')]);
    assert.deepEqual(footballShotDetailTotals(s), {});
    assert.equal('keyPasses' in footballStatTotals(s).hst.stats, false);
  });
  test('schema: valid, every deep key declared with labels; chances created = key passes + assists over tracked lines', () => {
    assert.deepEqual(validateSchema(footballStats), []);
    for (const k of [...SHOT_DETAIL_KEYS, 'keyPasses', 'clearances', 'chancesCreated', 'shotsOffTarget', 'penaltiesTaken', 'goalKicks', 'throwIns', 'goalsRuledOut']) {
      assert.ok(statDefIn(footballStats, k)?.label, k);
    }
    const line = (stats: Record<string, number>, id: string): StatLine => ({ id, matchId: id, playerId: 'p', sport: 'football', stats } as StatLine);
    const def = statDefIn(footballStats, 'chancesCreated')!;
    assert.equal(aggregateValue(footballStats, def, [line({ assists: 2 }, 'm1')]).tracked, false, 'no match tracked key passes → not tracked');
    assert.equal(aggregateValue(footballStats, def, [line({ assists: 2 }, 'm1'), line({ keyPasses: 3, assists: 1 }, 'm2')]).value, 4);
  });
});

/* ------------------------------ match centre ------------------------------- */

describe('deep wave · football match centre', () => {
  const s = run(deepMatch(), DEEP);
  test('depth team figures: off target, shot detail, key passes, restarts, penalties, ruled out, save %', () => {
    const d = footballDepthTeamStats(s);
    assert.deepEqual(
      { off: d.away.shotsOffTarget, inBox: d.home.shotsInBox, outBox: d.home.shotsOutBox, big: d.home.bigChances, bigMiss: d.home.bigChancesMissed, wood: d.away.woodwork },
      { off: 1, inBox: 1, outBox: 1, big: 2, bigMiss: 1, wood: 1 },
    );
    assert.deepEqual([d.home.keyPasses, d.home.clearances, d.away.goalKicks, d.home.throwIns], [1, 1, 1, 1]);
    assert.deepEqual([d.home.penaltiesTaken, d.home.penaltyGoals, d.away.penaltiesTaken], [1, 1, 0]);
    assert.deepEqual([d.away.goalsRuledOut, d.home.goalsRuledOut], [1, 0]);
    assert.equal(d.away.savePct, 33, 'away keeper: 1 save, 2 goals let in');
    assert.deepEqual(footballDepthUntracked(s), []);
  });
  test('a plain match: no penalties / ruled-out rows, the toggles listed "not tracked"', () => {
    minute = 1; half = 1;
    const plain = run([...KICK, stat('home', 'shot', 'hst', { onTarget: false })]);
    const d = footballDepthTeamStats(plain);
    assert.equal('penaltiesTaken' in d.home, false);
    assert.equal('bigChances' in d.home, false);
    assert.deepEqual(footballDepthUntracked(plain), ['bigChances', 'keyPasses']);
    const src = footballCentreSource(plain, { now: 4 });
    const attack = footballCentre.find((c) => c.id === 'attack')!;
    const cmp = centreComparison(footballStats, src.data('all'), 'all', attack);
    assert.ok(cmp.untracked.includes('Big chances'));
    assert.ok(!cmp.rows.some((r) => r.key === 'woodwork'));
  });
  test('categories: rows per category for the scope; every key declared', () => {
    const src = footballCentreSource(s, { now: 4 });
    const data = src.data('all');
    const cats = visibleCategories(footballStats, data, 'all', footballCentre);
    assert.ok(cats.length >= 5);
    const attack = centreComparison(footballStats, data, 'all', footballCentre.find((c) => c.id === 'attack')!);
    const row = (k: string) => attack.rows.find((r) => r.key === k)!;
    assert.deepEqual([row('shots').home, row('shots').away], ['3', '2']);
    assert.deepEqual([row('bigChances').home, row('woodwork').away], ['2', '1']);
    // first half only: the 2nd-half penalty is out of scope
    const h1 = centreComparison(footballStats, src.data(1), 1, footballCentre.find((c) => c.id === 'attack')!);
    assert.equal(h1.rows.find((r) => r.key === 'penaltiesTaken'), undefined);
    for (const k of centreKeys(footballCentre)) assert.ok(statDefIn(footballStats, k), k);
  });
});

/* ------------------------------- commentary -------------------------------- */

describe('deep wave · football commentary', () => {
  const s = run(deepMatch(), DEEP);
  const feed = footballFeed(s, names);
  const text = (id: string) => feed.find((i) => i.id === id)?.text;
  test('BBC-style sentences; the save, block and key pass read on their shot', () => {
    assert.equal(text('s1'), 'Attempt saved. HST (India) shot from outside the box is saved by AGK. Assisted by HMF. A big chance.');
    assert.equal(feed.some((i) => i.id === 's2' || i.id === 's3' || i.id === 's7'), false, 'folded rows');
    assert.equal(text('e4'), 'Goal! India 1, Japan 0. HST (India) right-footed shot from inside the box. Assisted by HMF. A big chance taken.');
    assert.equal(text('s5'), 'AST (Japan) hits the woodwork with a shot from outside the box!');
    assert.equal(text('s6'), 'Attempt blocked. AMF (Japan) shot from inside the box is blocked by HCB.');
    assert.equal(text('s11'), 'Foul by HMF (India). AMF (Japan) wins a free kick.');
    assert.equal(text('e12'), 'HMF (India) is shown the yellow card for a bad foul.');
    assert.equal(text('e13'), 'Goal ruled out for Japan — offside, after a VAR review.');
    assert.match(text('e16')!, /^Red card! ACB \(Japan\) is sent off for denying an obvious goal-scoring opportunity\.$/);
    assert.match(text('e15')!, /^Goal! India 2, Japan 0\. HST \(India\) converts the penalty\.$/);
  });
  test('running score after each moment; key events; FIFA minutes; grouped by half, newest first', () => {
    assert.deepEqual(feed.find((i) => i.id === 'e4')!.score, { home: 1, away: 0 });
    assert.deepEqual(feed.find((i) => i.id === 'e16')!.score, { home: 2, away: 0 });
    const secs = feedSections(feed, FOOTBALL_PERIOD_LABEL, { periods: footballFeedPeriods(s) });
    assert.deepEqual(secs.map((x) => [x.label, x.score.home, x.score.away, x.goals.home]), [['Second half', 2, 0, 1], ['First half', 1, 0, 1]]);
    assert.equal(secs[0].items[0].id, 'e16', 'newest first');
    const key = feedSections(feed, FOOTBALL_PERIOD_LABEL, { majorOnly: true });
    assert.ok(key.flatMap((x) => x.items).every((i) => i.major));
    assert.ok(key.flatMap((x) => x.items).some((i) => i.id === 's5'), 'woodwork is a key moment');
  });
  test('a backfilled moment sits at its own minute; added time reads 45+2\'', () => {
    let t = football.init({ halfMinutes: 45 });
    t = football.reducer(t, { type: 'KICKOFF', payload: { at: 1, ord: true } });
    t = football.reducer(t, { type: 'GOAL', side: 'home', payload: { minute: 30, half: 1, pid: 'a' }, attribution: { playerId: 'a', stat: 'goals', playerName: 'A' } });
    t = football.reducer(t, { type: 'GOAL', side: 'away', payload: { minute: 47, half: 1, pid: 'b' }, attribution: { playerId: 'b', stat: 'goals', playerName: 'B' } });
    t = football.reducer(t, { type: 'GOAL', side: 'away', payload: { minute: 12, half: 1, pid: 'b' }, attribution: { playerId: 'b', stat: 'goals', playerName: 'B' } }); // backfilled
    const f = footballFeed(t, names);
    assert.deepEqual(f.map((i) => [i.stamp, i.score.home, i.score.away]), [["12'", 0, 1], ["30'", 1, 1], ["45+2'", 1, 2]]);
  });
  test('own goal, second yellow, substitution, shoot-out with its tally', () => {
    assert.equal(footballEventSentence({ id: 1, minute: 3, type: 'owngoal', side: 'away', playerName: 'X' }, names, { home: 0, away: 1 }).text, 'Own goal by X (India). India 0, Japan 1.');
    assert.equal(footballEventSentence({ id: 2, minute: 3, type: 'red', side: 'home', playerName: 'Y', secondYellow: true }, names, { home: 0, away: 0 }).text, 'Second yellow card to Y (India) — sent off. India are a player down.');
    assert.equal(footballEventSentence({ id: 3, minute: 3, type: 'sub', side: 'home', playerName: 'Off', secondName: 'On' }, names, { home: 0, away: 0 }).text, 'Substitution, India. On replaces Off.');
    assert.equal(footballStatSentence({ id: 4, minute: 3, kind: 'penaltyMissed', side: 'home', playerName: 'Z' }, names, { saver: 'GK' }).text, 'Penalty saved! Z (India) fails to score — saved by GK.');
    let so = football.init({ decider: 'penalties' });
    for (const a of [{ type: 'KICKOFF', payload: { at: 1 } }, { type: 'END', payload: { at: 2 } }, { type: 'START_SHOOTOUT', payload: { first: 'away' } }] as ScoreAction[]) so = football.reducer(so, a);
    so = football.reducer(so, { type: 'PEN', side: 'away', payload: { outcome: 'scored', takerId: 't1', takerName: 'T1' } });
    so = football.reducer(so, { type: 'PEN', side: 'home', payload: { outcome: 'saved', takerId: 't2', takerName: 'T2', keeperName: 'K' } });
    const f = footballFeed(so, names);
    const pens = f.filter((i) => i.period === 99);
    assert.deepEqual(pens.map((i) => [i.text, i.scoreText]), [
      ['T1 (Japan) scores. India 0, Japan 1 on penalties.', '0–1'],
      ['T2 (India) has the penalty saved by K. India 0, Japan 1 on penalties.', '0–1'],
    ]);
    assert.equal(feedSections(f, FOOTBALL_PERIOD_LABEL)[0].label, 'Penalty shoot-out');
  });
  test('possession is shown only once the ball changed hands (kick-off alone is no 100% – 0%)', () => {
    let t = football.init({});
    t = football.reducer(t, { type: 'KICKOFF', payload: { at: 1000 } });
    assert.equal(footballFacts(t, 61_000).notes.some((n) => n.startsWith('Possession')), false);
    const top = footballCentre.find((c) => c.id === 'top')!;
    assert.equal(centreComparison(footballStats, footballCentreSource(t, { now: 61_000 }).data('all'), 'all', top).rows.some((r) => r.key === 'possession'), false);
    t = football.reducer(t, { type: 'POSSESSION', payload: { side: 'away', at: 31_000 } });
    assert.ok(footballFacts(t, 61_000).notes.includes('Possession 50% – 50%'));
    const row = centreComparison(footballStats, footballCentreSource(t, { now: 61_000 }).data('all'), 'all', top).rows.find((r) => r.key === 'possession')!;
    assert.deepEqual([row.home, row.away], ['50%', '50%']);
  });
  test('match facts: scorers with minutes and tags, sendings-off, HT', () => {
    const f = footballFacts(s);
    assert.deepEqual(f.home, ["⚽ HST 4', 16' (pen)"]);
    assert.deepEqual(f.away, ["🟥 ACB 17'"]);
    assert.deepEqual(f.notes, ['HT 1-0']);
  });
});
