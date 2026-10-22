/**
 * Deep wave (invasion-goal family) — hockey (FIH) depth:
 *  - optional tracking (possession on the game clock, video referrals): off by
 *    default, old states keep their exact shape;
 *  - shots wide vs blocked, shoot-out saved vs missed + the keeper (one tap
 *    either way), a PC goal settling the open corner;
 *  - statTotals: the shoot-out keeper's saves (derived, SD-19 contract);
 *  - the match centre's depth figures and categories;
 *  - the commentary by quarter (running score, folded saves, shoot-out) and
 *    the match facts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, eventCredits, creditAttribution, readHockeyTrack, HOCKEY_LIVE_SETTINGS, type HockeyEvent, type HockeyState, type Side } from '../src/sports/hockey/engine.ts';
import { hockeyTotals, DERIVED_KEYS } from '../src/sports/hockey/totals.ts';
import { hockeyPossession, hockeyDepthFigures, hockeyUntracked, possessionSecs, hockeyShootoutKeepers } from '../src/sports/hockey/depth.ts';
import { hockeyFeed, hockeyFacts, hockeyFeedPeriods, hockeyPeriodLabel, hockeySentence } from '../src/sports/hockey/feed.ts';
import { hockeyBox } from '../src/sports/hockey/box.ts';
import { hockeyStats, hockeyCentre } from '../src/sports/hockey/stats.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { centreComparison, visibleCategories, centreKeys } from '../src/sports/invasion/centre.ts';
import { feedSections } from '../src/sports/invasion/feed.ts';
import { validateSchema, statDefIn } from '../src/sports/statSchema.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';

const nm = (id: string) => id.toUpperCase();
const names = { home: 'India', away: 'Japan' };
let u = 0;
/** As the controls fire it: game second + period + uid, credits from eventCredits. */
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<HockeyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'pc', ...ev } as HockeyEvent);
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

function match(): ScoreAction[] {
  u = 0;
  return [
    XI('home', 'hgk', ['hgk', 'h1', 'h2']), XI('away', 'agk', ['agk', 'a1', 'a2']),
    { type: 'POSS', side: 'home', payload: { sec: 0, period: 1 } },
    A('SHOT', 'home', 120, 1, { type: 'shot', onGoal: true, ...who('h1') }, { onGoal: true, uid: 's1' }),
    A('SAVE', 'away', 120, 1, { type: 'save', ...who('agk') }, { ref: 's1' }),
    A('SHOT', 'away', 200, 1, { type: 'shot', onGoal: false, ...who('a1') }, { onGoal: false, miss: 'wide' }),
    { type: 'POSS', side: 'away', payload: { sec: 300, period: 1 } },
    { type: 'POSS', side: 'away', payload: { sec: 350, period: 1 } }, // a repeat: ignored
    A('SHOT', 'home', 400, 1, { type: 'shot', onGoal: false, ...who('h2') }, { onGoal: false, miss: 'blocked' }),
    A('PC', 'home', 500, 1, {}, { uid: 'pc1' }),
    A('GOAL', 'home', 510, 1, { type: 'goal', goalType: 'pc', ...who('h1'), secondId: 'h2', secondName: 'H2' }, { goalType: 'pc', pcRef: 'pc1' }),
    { type: 'POSS', side: 'home', payload: { sec: 600, period: 1 } },
    { type: 'END_PERIOD', payload: { at: 0 } },
    A('CARD', 'away', 1000, 2, { type: 'card', card: 'green', ...who('a2') }, { card: 'green', minutes: 2 }),
    A('REFERRAL', 'away', 1100, 2, {}, { upheld: false }),
    A('GOAL', 'away', 1200, 2, { type: 'goal', goalType: 'field', ...who('a1') }, { goalType: 'field' }),
    A('CARD', 'home', 1250, 2, { type: 'card', card: 'red', ...who('h2') }, { card: 'red' }),
  ];
}
const CFG = { trackPossession: true, trackReferrals: true, periods: 4, periodMinutes: 15 };

describe('deep wave · hockey — off by default, old states unchanged', () => {
  test('no `track` / `poss` keys unless switched on; old shots / kicks carry no new keys', () => {
    const s = init({});
    assert.equal('track' in s, false);
    assert.equal('poss' in s, false);
    assert.equal(readHockeyTrack({ trackPossession: false }), undefined);
    assert.deepEqual(init(CFG).track, { possession: true, referrals: true });
    const t = run([A('SHOT', 'home', 10, 1, { type: 'shot', onGoal: false }, { onGoal: false })]);
    assert.equal('miss' in t.events[0], false);
  });
  test('live settings: a "Stats to track" group read from the state', () => {
    const keys = HOCKEY_LIVE_SETTINGS.fields.filter((f) => f.group === 'Stats to track').map((f) => f.key);
    assert.deepEqual(keys, ['trackPossession', 'trackReferrals']);
    assert.deepEqual([HOCKEY_LIVE_SETTINGS.read(init({})).trackPossession, HOCKEY_LIVE_SETTINGS.read(init(CFG)).trackReferrals], [false, true]);
  });
});

describe('deep wave · hockey capture + figures', () => {
  const s = run(match(), CFG);
  test('possession on the game clock: per period, repeats ignored', () => {
    assert.equal(s.poss?.length, 3);
    assert.deepEqual(possessionSecs(s, 0, 900), { home: 300 + 300, away: 300 });
    assert.deepEqual(hockeyPossession(s, 1), { home: 67, away: 33 });
    // Q2: home has had the ball from 600 on (the clock wasn't run: up to the last moment logged)
    assert.equal(hockeyPossession(s, 2)?.home, 100);
    assert.equal(hockeyPossession(run(match().filter((a) => a.type !== 'POSS'))), undefined, 'not tracked → no figure');
    // a mark logged late still counts at its own second
    const late = { ...s, poss: [{ side: 'home' as const, sec: 0, period: 1 }, { side: 'home' as const, sec: 600, period: 1 }, { side: 'away' as const, sec: 300, period: 1 }] };
    assert.deepEqual(possessionSecs(late, 0, 900), { home: 600, away: 300 });
  });
  test('wide vs blocked; the PC goal settles its corner; referrals', () => {
    const d = hockeyDepthFigures(s, 'home');
    assert.deepEqual([d.shotsWide, d.blockedShots], [0, 1]);
    assert.deepEqual([hockeyDepthFigures(s, 'away').shotsWide, hockeyDepthFigures(s, 'away').referralsLost], [1, 1]);
    assert.equal(s.events.find((e) => e.type === 'pc')?.pcResult, 'goal');
    assert.equal(d.suspensionMinutes, 0);
    assert.equal(hockeyDepthFigures(s, 'away').suspensionMinutes, 2);
  });
  test('team save %: saves ÷ shots on goal faced', () => {
    assert.equal(hockeyDepthFigures(s, 'away').savePct, 50); // 1 save, 1 goal let in
    assert.equal(hockeyDepthFigures(s, 'home').savePct, 0); // no save, 1 goal let in
  });
  test('untracked: possession / wide-blocked listed only when the match didn\'t log them', () => {
    assert.deepEqual(hockeyUntracked(s), []);
    assert.deepEqual(hockeyUntracked(run([A('SHOT', 'home', 10, 1, { type: 'shot', onGoal: false }, { onGoal: false })])), ['possession', 'shotsWide', 'blockedShots']);
  });
  test('match centre: categories over the box source; every key declared', () => {
    const src = hockeyBox(s, { now: 0 });
    const data = src.data('all');
    const cats = visibleCategories(hockeyStats, data, 'all', hockeyCentre);
    assert.deepEqual(cats.map((c) => c.id), ['top', 'attack', 'setPieces', 'keeping', 'discipline']);
    const top = centreComparison(hockeyStats, data, 'all', hockeyCentre[0]);
    const row = (k: string) => top.rows.find((r) => r.key === k)!;
    assert.deepEqual([row('possession').home, row('possession').away], ['76%', '24%']);
    const att = centreComparison(hockeyStats, data, 'all', hockeyCentre[1]);
    assert.deepEqual(att.rows.find((r) => r.key === 'blockedShots')?.home, '1');
    assert.deepEqual(att.rows.find((r) => r.key === 'conversion')?.home, '33%');
    const disc = centreComparison(hockeyStats, data, 'all', hockeyCentre[4]);
    assert.deepEqual(disc.rows.find((r) => r.key === 'referralsLost')?.away, '1');
    for (const k of centreKeys(hockeyCentre)) assert.ok(statDefIn(hockeyStats, k), k);
    assert.deepEqual(validateSchema(hockeyStats), []);
  });
  test('timeline rows say wide / blocked and the referral', () => {
    const rows = hockeyTimeline(s);
    assert.ok(rows.some((r) => r.label === 'Shot blocked'));
    assert.ok(rows.some((r) => r.label === 'Shot wide'));
    assert.ok(rows.some((r) => r.label === 'Video referral — not upheld'));
  });
});

describe('deep wave · hockey shoot-out keepers', () => {
  function so(): ScoreAction[] {
    u = 100;
    return [
      XI('home', 'hgk', ['hgk', 'h1']), XI('away', 'agk', ['agk', 'a1']),
      A('GOAL', 'home', 60, 1, { type: 'goal', ...who('h1') }), A('GOAL', 'away', 120, 1, { type: 'goal', ...who('a1') }),
      { type: 'END', payload: { at: 0 } },
      { type: 'START_SHOOTOUT', payload: { first: 'home' } },
      { type: 'SO', side: 'home', payload: { scored: true, outcome: 'scored', keeperId: 'agk', keeperName: 'AGK' }, attribution: { playerId: 'h1', stat: 'soTaken', playerName: 'H1', extra: { soGoals: 1 } } },
      { type: 'SO', side: 'away', payload: { scored: false, outcome: 'saved', keeperId: 'hgk', keeperName: 'HGK' }, attribution: { playerId: 'a1', stat: 'soTaken', playerName: 'A1' } },
      { type: 'SO', side: 'home', payload: { scored: false, outcome: 'missed', keeperId: 'agk', keeperName: 'AGK' } },
      { type: 'SO', side: 'away', payload: { scored: true } }, // an older-style kick: no outcome, no keeper
    ];
  }
  const sp: TotalsSport<HockeyState> = { name: 'hockey', init, reducer, statTotals: hockeyTotals, partial: false, derived: DERIVED_KEYS, config: { decider: 'shootout' } };
  test('saved vs missed + the keeper facing it → soSaves (derived; SD-19 contract, every prefix)', () => {
    const t = assertContract(sp, toRecords(so()), { every: 1 });
    assert.deepEqual([t.hgk.stats.soSaves, t.agk.stats.soSaves], [1, 0]);
    assert.equal('soSaves' in t.h1.stats, false, 'keyed: only keepers named on an attempt');
    const s = run(so(), { decider: 'shootout' });
    assert.deepEqual(s.shootout!.home.map((k) => k.outcome), ['scored', 'missed']);
    assert.equal('outcome' in s.shootout!.away[1], false);
    assert.deepEqual(Object.keys(hockeyShootoutKeepers(s)).sort(), ['agk', 'hgk']);
  });
  test('commentary: the shoot-out section with its own tally', () => {
    const s = run(so(), { decider: 'shootout' });
    const f = hockeyFeed(s, names).filter((i) => i.period === 99);
    assert.deepEqual(f.map((i) => [i.stamp, i.text, i.scoreText]), [
      ['SO 1', 'Attempt 1: H1 (India) scores.', '1–0'],
      ['SO 1', 'Attempt 1: A1 (Japan) is saved by HGK.', '1–0'],
      ['SO 2', 'Attempt 2: India misses.', '1–0'],
      ['SO 2', 'Attempt 2: Japan scores.', '1–1'],
    ]);
  });
});

describe('deep wave · hockey commentary + facts', () => {
  const s = run(match(), CFG);
  const feed = hockeyFeed(s, names);
  test('sentences: the save folds into its shot; PC goal with assist; cards; referral', () => {
    assert.equal(feed.some((i) => i.text.startsWith('Save by')), false);
    assert.ok(feed.some((i) => i.text === 'Shot on goal by H1 (India), saved by AGK.'));
    assert.ok(feed.some((i) => i.text === "H2 (India)'s shot is blocked."));
    assert.ok(feed.some((i) => i.text === 'Goal! India 1, Japan 0. H1 (India) converts the penalty corner. Assisted by H2.'));
    assert.ok(feed.some((i) => i.text === 'Green card for A2 (Japan) — 2 minutes.'));
    assert.ok(feed.some((i) => i.text === 'Video referral by Japan — not upheld, referral lost.'));
    assert.ok(feed.some((i) => i.text === 'Red card! H2 (India) is sent off — India play a player short.'));
    assert.equal(feed.find((i) => i.text.startsWith('Penalty corner'))?.text, 'Penalty corner to India.');
  });
  test('running score and minutes; sections by quarter, newest first', () => {
    const last = feed[feed.length - 1];
    assert.deepEqual([last.stamp, last.score], ["21'", { home: 1, away: 1 }]);
    const secs = feedSections(feed, hockeyPeriodLabel(s), { periods: hockeyFeedPeriods(s) });
    assert.deepEqual(secs.map((x) => [x.label, x.score.home, x.score.away]), [['2nd quarter', 1, 1], ['1st quarter', 1, 0]]);
  });
  test('facts: scorers with minute and type, sendings-off, possession', () => {
    const f = hockeyFacts(s);
    assert.deepEqual(f.home, ["🏑 H1 9' (PC)", "🟥 H2 21'"]);
    assert.deepEqual(f.away, ["🏑 A1 20'"]);
    assert.deepEqual(f.notes, ['Possession 76% – 24%']);
  });
  test('a team goal and a stroke saved read cleanly', () => {
    assert.equal(hockeySentence({ id: 'x', type: 'goal', side: 'away', sec: 5, period: 1, goalType: 'stroke' }, names, { home: 0, away: 1 }).text, 'Goal! India 0, Japan 1. Japan score from a penalty stroke.');
    assert.equal(hockeySentence({ id: 'y', type: 'stroke', side: 'home', sec: 5, period: 1, outcome: 'saved', playerName: 'P' }, names, { home: 0, away: 0 }, 'K').text, 'Penalty stroke saved by K! P (India) is denied.');
  });
});
