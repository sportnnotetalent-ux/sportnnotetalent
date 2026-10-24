/**
 * IDs-only scoring guard (docs/privacy/ids-only-scoring.md, founder
 * 2026-10-24) — the invasion sports: football, hockey, handball, ice hockey,
 * netball, rugby union, rugby league and American football.
 *
 * `matches.state` (saved after every tap) and `match_events` (attribution /
 * attribution2 / payload) are public, logged out included. For each sport a
 * realistic match is scored the way its controls build the actions — the pure
 * builders they call (football/actions.ts; invasion/actions.ts for subs, a new
 * keeper and the XI stamp; each engine's `eventCredits` → `creditAttribution`
 * for the credits, AF `buildPlay`) and the voice parsers — with squads whose
 * players have distinctive full names. Then:
 *   1. the reduced state and every action's attribution / attribution2 /
 *      payload contain none of those names (nor a first name or surname);
 *   2. the display builders — commentary / feed, match facts, timeline, box
 *      score, ticker detail + flash, the live suspension banner, named Undo,
 *      the tournament discipline table — given a NameOf that maps ids to
 *      initials (what a viewer outside the child's circle gets) show the
 *      initials and never a full name.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import { nameInitials, type NameOf } from '../src/core/playerNames.ts';
import { carriesNames, nameRow, withNames } from '../src/sports/invasion/names.ts';
import { subAction, keeperAction, xiStamp } from '../src/sports/invasion/actions.ts';
// football
import * as fb from '../src/sports/football/engine.ts';
import * as fa from '../src/sports/football/actions.ts';
import { footballFeed, footballFacts } from '../src/sports/football/feed.ts';
import { footballTickerDetail, footballTickerFlash } from '../src/sports/football/ticker.ts';
import { footballLiveField } from '../src/sports/football/fieldTime.ts';
import { footballBox } from '../src/sports/boxSources.ts';
import { sportDisciplineTable, type DisciplineMatch } from '../src/sports/discipline.ts';
// hockey
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyFeed, hockeyFacts } from '../src/sports/hockey/feed.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { hockeyBox } from '../src/sports/hockey/box.ts';
import { hockeyTickerDetail, hockeyTickerFlash } from '../src/sports/hockey/ticker.ts';
import { hockeyLiveField } from '../src/sports/hockey/totals.ts';
// handball
import * as hb from '../src/sports/handball/engine.ts';
import { handballFeed, handballFacts } from '../src/sports/handball/feed.ts';
import { handballTimeline } from '../src/sports/handball/timeline.ts';
import { handballBox } from '../src/sports/handball/box.ts';
import { handballTickerDetail, handballTickerFlash } from '../src/sports/handball/ticker.ts';
import { handballLiveField } from '../src/sports/handball/totals.ts';
// ice hockey
import * as ih from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyCommentary } from '../src/sports/ice_hockey/commentary.ts';
import { iceHockeyTimeline } from '../src/sports/ice_hockey/timeline.ts';
import { iceHockeyBox } from '../src/sports/ice_hockey/box.ts';
import { iceHockeyTickerDetail, iceHockeyTickerFlash } from '../src/sports/ice_hockey/ticker.ts';
// netball
import * as nb from '../src/sports/netball/engine.ts';
import { netballFeed } from '../src/sports/netball/commentary.ts';
import { netballTimeline } from '../src/sports/netball/timeline.ts';
import { netballBox } from '../src/sports/netball/box.ts';
import { netballTickerDetail, netballTickerFlash } from '../src/sports/netball/ticker.ts';
import { netballLiveField } from '../src/sports/netball/totals.ts';
// rugby union
import * as rg from '../src/sports/rugby/engine.ts';
import { rugbyCommentary } from '../src/sports/rugby/commentary.ts';
import { rugbyTimeline, rugbyUndoLabel } from '../src/sports/rugby/timeline.ts';
import { rugbyBox } from '../src/sports/rugby/box.ts';
import { rugbyTickerDetail, rugbyTickerFlash } from '../src/sports/rugby/ticker.ts';
import { rugbyLiveField } from '../src/sports/rugby/totals.ts';
// rugby league
import * as lg from '../src/sports/rugby_league/engine.ts';
import { leagueCommentary } from '../src/sports/rugby_league/commentary.ts';
import { leagueTimeline, leagueUndoLabel } from '../src/sports/rugby_league/timeline.ts';
import { leagueBox } from '../src/sports/rugby_league/box.ts';
import { leagueTickerDetail, leagueTickerFlash } from '../src/sports/rugby_league/ticker.ts';
import { leagueLiveField } from '../src/sports/rugby_league/totals.ts';
// American football
import * as af from '../src/sports/american_football/engine.ts';
import { afCommentary } from '../src/sports/american_football/commentary.ts';
import { afTimeline, afPlays, afUndoLabel } from '../src/sports/american_football/timeline.ts';
import { afBox } from '../src/sports/american_football/box.ts';
import { afTickerDetail, afTickerFlash } from '../src/sports/american_football/ticker.ts';
// voice
import { hockeyVoice, handballVoice } from '../src/sports/voiceParsers.ts';
import { rugbyVoice } from '../src/sports/rugby/voice.ts';
import { leagueVoice } from '../src/sports/rugby_league/voice.ts';
import { iceHockeyVoice } from '../src/sports/ice_hockey/voice.ts';
import { netballVoice } from '../src/sports/netball/voice.ts';
import { afVoice } from '../src/sports/american_football/voice.ts';

/* ------------------------------- the squads -------------------------------- */

type Side = 'home' | 'away';
const HOME_NAMES = [
  'Zebedee Quartermaine', 'Philomena Thistlewood', 'Barnaby Fitzwilliam', 'Octavia Pennyworth', 'Leopold Ashcombe',
  'Marigold Featherstone', 'Cornelius Blackwood', 'Seraphina Lockhart', 'Archibald Wexley', 'Ottoline Gravesend',
  'Peregrine Halloway', 'Wilhelmina Crabtree', 'Ignatius Bramblecote', 'Euphemia Starling', 'Thelonius Marchbanks',
];
const AWAY_NAMES = [
  'Thaddeus Whitlock', 'Clementine Rookwood', 'Montgomery Ravensworth', 'Henrietta Coldwater', 'Bartholomew Kettering',
  'Rosalind Merriweather', 'Algernon Fairbanks', 'Gwendolyn Hollister', 'Fitzgerald Quimby', 'Isadora Vanterpool',
  'Percival Dunwoody', 'Araminta Cholmondeley', 'Lysander Pettigrew', 'Philippa Wainscott', 'Benedict Hargreaves',
];
/** h1…h15 / a1…a15 */
const squad = (side: Side, sport: string): Player[] =>
  (side === 'home' ? HOME_NAMES : AWAY_NAMES).map((fullName, i) => ({ id: `${side[0]}${i + 1}`, fullName, sports: [sport] }) as Player);
const ALL = [...HOME_NAMES.map((n, i) => [`h${i + 1}`, n]), ...AWAY_NAMES.map((n, i) => [`a${i + 1}`, n])] as [string, string][];
/** every full name, and every first name and surname on its own */
const SECRETS = ALL.flatMap(([, n]) => [n, ...n.split(' ')]);
const INITIALS: Record<string, string> = Object.fromEntries(ALL.map(([id, n]) => [id, nameInitials(n)]));
/** a viewer outside the children's circle (players_view: initials) */
const viewer: NameOf = (id, legacy) => (id && INITIALS[id]) || (legacy ?? '').trim() || 'Player';
const H = (n: number) => `h${n}`;
const A = (n: number) => `a${n}`;
const P = (id: string) => ({ id });

function assertNoNames(what: string, value: unknown) {
  const json = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  for (const s of SECRETS) assert.ok(!json.includes(s), `${what} must not contain "${s}": ${json.slice(0, 300)}`);
}
/** The state and every action: ids only. */
function assertIdsOnly(label: string, state: unknown, actions: ScoreAction[]) {
  assertNoNames(`${label} state`, state);
  for (const a of actions) {
    assertNoNames(`${label} ${a.type} attribution`, a.attribution ?? null);
    assertNoNames(`${label} ${a.type} attribution2`, a.attribution2 ?? null);
    assertNoNames(`${label} ${a.type} payload`, a.payload ?? null);
    assert.equal(carriesNames(a), false, `${label} ${a.type} carries a name key: ${JSON.stringify(a)}`);
  }
}
/** A shown text names players by initials ("Z. Q."), never by name. */
function assertInitials(what: string, value: unknown, ...expected: string[]) {
  assertNoNames(what, value);
  const json = JSON.stringify(value);
  for (const e of expected) assert.ok(json.includes(e), `${what} should show "${e}": ${json.slice(0, 400)}`);
}

/** A log built against the running state, as the controls dispatch. */
function scorer<S>(init: S, reducer: (s: S, a: ScoreAction) => S) {
  const actions: ScoreAction[] = [];
  const steps: { type: string; prev: S; next: S }[] = [];
  let s = init;
  const go = (...as: (ScoreAction | null | undefined)[]) => {
    for (const a of as) {
      if (!a) continue;
      const prev = s;
      actions.push(a);
      s = reducer(s, a);
      steps.push({ type: a.type, prev, next: s });
    }
    return s;
  };
  return { actions, steps, go, get s() { return s; } };
}
const voiceCtx = (state: unknown, sport: string, now: number): VoiceContext =>
  ({ state, homeName: 'Lions', awayName: 'Tigers', homeRoster: squad('home', sport), awayRoster: squad('away', sport), now }) as VoiceContext;
const TEAMS = { home: 'Lions', away: 'Tigers' };

/* --------------------------------- football --------------------------------- */

describe('IDs-only · football', () => {
  const T0 = Date.UTC(2026, 9, 24, 9);
  const m = scorer(fb.init({ halfMinutes: 45, decider: 'penalties', sinBinMinutes: 10, trackCardReasons: true }), fb.reducer);
  // the controls add the minute / half to each action (`fire`)
  const at = (minute: number, half: 1 | 2 = minute <= 45 ? 1 : 2) => (a: ScoreAction): ScoreAction => ({ ...a, payload: { ...a.payload, minute, half } });
  const tracked = ['goals', 'assists', 'yellowCards', 'redCards', 'shots', 'shotsOnTarget', 'fouls', 'saves'];
  m.go({ type: 'KICKOFF', payload: { at: T0, ord: true } });
  const slots = (side: Side) => Array.from({ length: 11 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: i === 0 ? 'GK' : 'CM' }));
  m.go(fa.xiAction('home', fa.xiOf(slots('home'), [H(1), H(14)])), fa.xiAction('away', fa.xiOf(slots('away'), [A(1)])));
  m.go(at(9)(fa.goalAction('home', P(H(9)), 'open', { bodyPart: 'right', tracked })), at(9)(fa.assistAction('home', P(H(7)), tracked)));
  m.go(at(14)(fa.statAction('shot', 'away', P(A(9)), { onTarget: true }, { at: T0, tracked })), at(14)(fa.statAction('save', 'home', P(H(1)), {}, { possSide: 'home', at: T0, tracked })));
  m.go(at(20)(fa.foulAction('away', P(A(5)), P(H(8)), { at: T0, tracked })));
  for (const a of fa.cardActions(m.s.events, 'away', 'yellow', P(A(5)), { reason: 'foul', tracked })) m.go(at(20)(a));
  m.go(at(30)(fa.sinBinAction('home', P(H(4)), 10, { tracked })));
  for (const a of fa.officialCardActions(m.s.events, 'home', 'yellow', 'Head coach')) m.go(at(33)(a));
  m.go(at(40)(fa.ownGoalAction('away', P(H(5)))));
  m.go(at(60)(fa.subAction('home', P(H(10)), P(H(12)))), at(62)(fa.subAction('away', P(A(3)), P(A(13)))));
  m.go(at(70)(fa.statAction('tackle', 'home', P(H(12)), {}, { possSide: 'home', at: T0, tracked })));
  for (const a of fa.cardActions(m.s.events, 'away', 'yellow', P(A(5)), { tracked })) m.go(at(75)(a)); // second yellow → red
  m.go(at(80)(fa.statAction('offside', 'away', P(A(9)), {}, { possSide: 'home', at: T0 })));
  // a timeline correction (remove the offside, take a stat back)
  m.go(fa.statRemoval(m.s.stats.find((x) => x.kind === 'offside')!));
  m.go({ type: 'END', payload: { at: T0 + 100 * 60_000 } });
  m.go({ type: 'START_SHOOTOUT', payload: { first: 'home' } });
  m.go(fa.penKickAction('home', 'scored', P(H(9)), P(A(1))), fa.penKickAction('away', 'saved', P(A(9)), P(H(1))));
  m.go(fa.penKickAction('home', 'scored', P(H(7)), P(A(1))), fa.penKickAction('away', 'missed', P(A(13)), P(H(1))));
  m.go(fa.penKickAction('home', 'scored', P(H(8)), P(A(1))));
  const removal = fa.eventRemoval(m.s.events.find((e) => e.type === 'goal')!);
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('football', s, [...m.actions, ...removal]);
    assert.ok(s.events.some((e) => e.type === 'goal' && e.playerId === H(9) && e.secondId === H(7)));
    assert.ok(s.stats.some((x) => x.kind === 'foul' && x.playerId === A(5) && x.secondId === H(8)), 'the fouled player by id');
    assert.ok(s.events.some((e) => e.type === 'sub' && e.playerId === H(10) && e.secondId === H(12) && e.playerName === undefined));
    assert.deepEqual(s.subbedOff, { home: [H(10)], away: [A(3)] }, 'subbed off by id');
    assert.ok(fb.isSubbedOff(s, 'home', { id: H(10) }));
    assert.deepEqual(s.xi?.home?.gk, { id: H(1) });
    assert.ok(s.shootout?.kicks?.every((k) => k.takerId && k.keeperId && !k.takerName && !k.keeperName));
    assert.ok(s.events.some((e) => e.type === 'red' && e.secondYellow && e.playerId === A(5)), 'second yellow by id');
    assert.ok(s.events.some((e) => e.official && e.playerName === 'Head coach'), "the official's role label stays");
  });
  test('commentary, facts, ticker, box, banner and discipline name players by id (initials)', () => {
    const feed = footballFeed(s, TEAMS, viewer);
    assertInitials('football feed', feed, 'A. W.', 'C. B.', 'B. K.');
    assert.ok(feed.some((i) => i.text.includes('Foul by B. K. (Tigers). S. L. (Lions) wins a free kick.')), 'the fouled player by id');
    assert.ok(feed.some((i) => /Substitution, Lions\. W\. C\. replaces O\. G\./.test(i.text)));
    assertInitials('football facts', footballFacts(s, 0, viewer), 'A. W.');
    assertInitials('football ticker', footballTickerDetail(s, { ...TEAMS, player: viewer }), 'A. W.');
    const prev = m.steps.find((x) => x.type === 'GOAL')!;
    assertInitials('football flash', footballTickerFlash(prev.prev, prev.next, viewer), 'A. W.');
    const box = footballBox(s, { homeRoster: squad('home', 'football'), awayRoster: squad('away', 'football'), nameOf: viewer, now: T0 });
    const d = box.data('all');
    assertInitials('football box', d, 'A. W.', 'Z. Q.');
    assert.ok([...d.home.rows, ...d.away.rows].every((r) => r.playerId), 'box rows by id');
    assertNoNames('football shootout notes', box.notes?.());
    const live = footballLiveField(fb.reducer(s, { type: 'NEXT_HALF' }), T0, viewer);
    assertNoNames('football banner', live);
    const match: DisciplineMatch = { id: 'm1', sport: 'football', status: 'completed', startsAt: '2026-10-24', homeTeam: { id: 't1', name: 'Lions' }, awayTeam: { id: 't2', name: 'Tigers' }, state: s } as DisciplineMatch;
    const disc = sportDisciplineTable('football', [match], {}, viewer)!;
    assertInitials('football discipline', disc, 'B. K.');
  });
});

/* ---------------------------------- hockey ---------------------------------- */

describe('IDs-only · hockey', () => {
  const TRACKED = [...hk.LIVE_KEYS];
  const credit = (e: Parameters<typeof hk.eventCredits>[0]) => {
    const cr = hk.eventCredits(e);
    return { attribution: hk.creditAttribution(cr.first, 1, TRACKED), attribution2: hk.creditAttribution(cr.second, 1, TRACKED) };
  };
  let u = 0;
  const t = (sec: number, period = 1) => ({ uid: `u${++u}`, sec, period });
  // (the clock left running: the banner reads the game clock)
  const m = scorer(hk.init({ decider: 'shootout', stopClock: false }), hk.reducer);
  const keeper = { slot: (sl: { position?: string }) => sl.position === 'GK', player: () => false };
  const slots = (side: Side) => Array.from({ length: 11 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: i === 0 ? 'GK' : 'MF' })) as never[];
  m.go({ type: 'XI', payload: { team: 'home', ...xiStamp(slots('home'), squad('home', 'hockey'), keeper) } }, { type: 'XI', payload: { team: 'away', ...xiStamp(slots('away'), squad('away', 'hockey'), keeper) } });
  m.go({ type: 'CLOCK', payload: { run: true, at: 1 } });
  m.go({ type: 'GOAL', side: 'home', payload: { goalType: 'field', ...t(120) }, ...credit({ type: 'goal', goalType: 'field', playerId: H(9), secondId: H(7) }) });
  const shot = t(300);
  m.go({ type: 'SHOT', side: 'away', payload: { onGoal: true, ...shot }, ...credit({ type: 'shot', onGoal: true, playerId: A(9) }) });
  m.go({ type: 'SAVE', side: 'home', payload: { ref: shot.uid, ...t(300) }, ...credit({ type: 'save', playerId: H(1) }) });
  m.go({ type: 'CARD', side: 'away', payload: { card: 'green', ...t(400) }, ...credit({ type: 'card', card: 'green', playerId: A(5) }) });
  m.go({ type: 'STROKE', side: 'away', payload: { outcome: 'missed', ...t(500) }, ...credit({ type: 'stroke', outcome: 'missed', playerId: A(10) }) });
  m.go({ ...subAction('home', P(H(10)), P(H(12))), payload: { ...subAction('home', P(H(10)), P(H(12))).payload, ...t(600) } });
  m.go({ ...keeperAction('away', P(A(12))), payload: { ...keeperAction('away', P(A(12))).payload, ...t(700) } });
  const voiced = hockeyVoice('goal Ravensworth', voiceCtx(m.s, 'hockey', 1 + 800_000)) ?? [];
  assert.ok(voiced.length >= 1, 'a voice-scored goal');
  m.go(...voiced);
  for (let p = 0; p < 4; p++) m.go({ type: 'SET_CLOCK', payload: { periodSec: 900 } }, { type: 'END_PERIOD', payload: { at: 0 } });
  m.go({ type: 'START_SHOOTOUT', payload: { first: 'home' } });
  m.go({ type: 'SO', side: 'home', payload: { scored: true, outcome: 'scored', keeperId: A(12) }, attribution: { playerId: H(9), stat: 'soTaken', extra: { soGoals: 1 } } });
  m.go({ type: 'SO', side: 'away', payload: { scored: false, outcome: 'saved', keeperId: H(1) }, attribution: { playerId: A(9), stat: 'soTaken' } });
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('hockey', s, m.actions);
    assert.ok(s.events.some((e) => e.type === 'goal' && e.playerId === H(9) && e.secondId === H(7)));
    assert.ok(s.events.some((e) => e.type === 'goal' && e.playerId === A(3)), 'the voice goal by id');
    assert.ok(s.events.some((e) => e.type === 'gk' && e.playerId === A(12) && e.playerName === undefined));
  });
  test('feed, facts, timeline, box, ticker and banner show initials', () => {
    assertInitials('hockey feed', hockeyFeed(s, TEAMS, viewer), 'A. W.', 'C. B.', 'Z. Q.', 'M. R.');
    assertInitials('hockey facts', hockeyFacts(s, 0, viewer), 'A. W.');
    assertInitials('hockey timeline', hockeyTimeline(s, TEAMS, viewer), 'W. C.');
    assertInitials('hockey box', hockeyBox(s, { nameOf: viewer }).data('all'), 'A. W.');
    assertInitials('hockey ticker', hockeyTickerDetail(s, { ...TEAMS, player: viewer }), 'A. W.');
    const g = m.steps.find((x) => x.type === 'GOAL')!;
    assertInitials('hockey flash', hockeyTickerFlash(g.prev, g.next, viewer), 'A. W.');
    const card = m.steps.find((x) => x.type === 'CARD')!;
    assertInitials('hockey banner', hockeyLiveField(card.next, 1 + 400_500, viewer), 'B. K.');
  });
});

/* --------------------------------- handball --------------------------------- */

describe('IDs-only · handball', () => {
  const TRACKED = [...hb.LIVE_KEYS];
  const credit = (e: Parameters<typeof hb.eventCredits>[0]) => {
    const cr = hb.eventCredits(e);
    return { attribution: hb.creditAttribution(cr.first, 1, TRACKED), attribution2: hb.creditAttribution(cr.second, 1, TRACKED) };
  };
  let u = 0;
  const t = (sec: number, period = 1) => ({ uid: `u${++u}`, sec, period });
  const m = scorer(hb.init({ decider: 'shootout', stopClock: false }), hb.reducer);
  const keeper = { slot: (sl: { position?: string }) => sl.position === 'GK', player: () => false };
  const slots = (side: Side) => Array.from({ length: 7 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: i === 0 ? 'GK' : 'CB' })) as never[];
  m.go({ type: 'XI', payload: { team: 'home', ...xiStamp(slots('home'), [], keeper) } }, { type: 'XI', payload: { team: 'away', ...xiStamp(slots('away'), [], keeper) } });
  m.go({ type: 'CLOCK', payload: { run: true, at: 1 } });
  m.go({ type: 'GOAL', side: 'home', payload: { shotType: 'wing', ...t(60) }, ...credit({ type: 'goal', shotType: 'wing', playerId: H(4), secondId: H(3) }) });
  const miss = t(120);
  m.go({ type: 'MISS', side: 'away', payload: { shotType: 'nineM', result: 'saved', ...miss }, ...credit({ type: 'miss', shotType: 'nineM', playerId: A(4) }) });
  m.go({ type: 'SAVE', side: 'home', payload: { ref: miss.uid, shotType: 'nineM', ...t(120) }, ...credit({ type: 'save', shotType: 'nineM', playerId: H(1) }) });
  const to = t(200);
  m.go({ type: 'TURNOVER', side: 'away', payload: { stolen: true, ...to }, ...credit({ type: 'turnover', playerId: A(2) }) });
  m.go({ type: 'STEAL', side: 'home', payload: { ref: to.uid, ...t(200) }, ...credit({ type: 'steal', playerId: H(5) }) });
  m.go({ type: 'CARD', side: 'away', payload: { card: 'twoMin', ...t(300) }, ...credit({ type: 'card', card: 'twoMin', playerId: A(6) }) });
  m.go({ type: 'CARD', side: 'home', payload: { card: 'yellow', official: 'Coach', ...t(320) } });
  m.go({ ...subAction('home', P(H(6)), P(H(8))), payload: { ...subAction('home', P(H(6)), P(H(8))).payload, ...t(400) } });
  m.go({ ...keeperAction('home', P(H(9))), payload: { ...keeperAction('home', P(H(9))).payload, ...t(450) } });
  const voiced = handballVoice('goal Coldwater', voiceCtx(m.s, 'handball', 1 + 500_000)) ?? [];
  assert.ok(voiced.length, 'a voice-scored goal');
  m.go(...voiced);
  for (let p = 0; p < 2; p++) m.go({ type: 'SET_CLOCK', payload: { periodSec: 1800 } }, { type: 'END_PERIOD', payload: { at: 0 } });
  m.go({ type: 'START_SHOOTOUT', payload: { first: 'home' } });
  m.go({ type: 'SO', side: 'home', payload: { scored: false, outcome: 'saved', keeperId: A(1) }, attribution: { playerId: H(4), stat: 'soTaken' } });
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('handball', s, m.actions);
    assert.ok(s.events.some((e) => e.type === 'goal' && e.playerId === H(4) && e.secondId === H(3)));
    assert.ok(s.events.some((e) => e.type === 'goal' && e.playerId === A(4)), 'the voice goal by id');
    assert.ok(s.events.some((e) => e.type === 'card' && e.official === 'Coach'), "the official's role label stays");
  });
  test('feed, facts, timeline, box, ticker and banner show initials', () => {
    assertInitials('handball feed', handballFeed(s, TEAMS, viewer), 'O. P.', 'B. F.');
    assertInitials('handball facts', handballFacts(s, 3, viewer), 'O. P.');
    assertInitials('handball timeline', handballTimeline(s, TEAMS, viewer), 'O. P.');
    assertInitials('handball box', handballBox(s, { nameOf: viewer }).data('all'), 'O. P.');
    assertInitials('handball ticker', handballTickerDetail(s, { ...TEAMS, player: viewer }), 'O. P.');
    const g = m.steps.find((x) => x.type === 'GOAL')!;
    assertInitials('handball flash', handballTickerFlash(g.prev, g.next, viewer), 'O. P.');
    const card = m.steps.find((x) => x.type === 'CARD')!;
    assertInitials('handball banner', handballLiveField(card.next, 1 + 300_500, viewer), 'R. M.');
  });
});

/* -------------------------------- ice hockey -------------------------------- */

describe('IDs-only · ice hockey', () => {
  const TRACKED = [...ih.LIVE_KEYS];
  const credit = (e: Parameters<typeof ih.eventCredits>[0]) => {
    const cr = ih.eventCredits(e);
    return { attribution: ih.creditAttribution(cr.first, 1, TRACKED), attribution2: ih.creditAttribution(cr.second, 1, TRACKED), third: ih.creditAttribution(cr.third, 1, TRACKED) };
  };
  let u = 0;
  const t = (sec: number, period = 1) => ({ uid: `u${++u}`, sec, period });
  const m = scorer(ih.init({ decider: 'otso', soRounds: 3, trackFaceoffs: true, stopClock: false }), ih.reducer);
  const keeper = { slot: (sl: { position?: string }) => sl.position === 'G', player: () => false };
  const slots = (side: Side) => Array.from({ length: 6 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: i === 0 ? 'G' : 'F' })) as never[];
  m.go({ type: 'XI', payload: { team: 'home', ...xiStamp(slots('home'), [], keeper) } }, { type: 'XI', payload: { team: 'away', ...xiStamp(slots('away'), [], keeper) } });
  m.go({ type: 'CLOCK', payload: { run: true, at: 1 } });
  const g = t(100);
  const cr = credit({ type: 'goal', side: 'home', playerId: H(4), secondId: H(3), strength: 'ev' });
  m.go({ type: 'GOAL', side: 'home', payload: { ...g, strength: 'ev' }, attribution: cr.attribution, attribution2: cr.attribution2 });
  m.go({ type: 'ASSIST2', side: 'home', payload: { ref: g.uid, ...t(100) }, attribution: credit({ type: 'goal', side: 'home', thirdId: H(2) }).third });
  const sh = credit({ type: 'shot', side: 'away', playerId: A(5), gkId: H(1) });
  m.go({ type: 'SHOT', side: 'away', payload: t(200), attribution: sh.attribution, attribution2: sh.attribution2 });
  const pen = credit({ type: 'pen', side: 'away', pen: 'minor', playerId: A(3) });
  m.go({ type: 'PEN', side: 'away', payload: { pen: 'minor', infraction: 'Tripping', ...t(300) }, attribution: pen.attribution });
  const fo = credit({ type: 'tally', side: 'home', tally: 'faceoff', playerId: H(5), secondId: A(4) });
  m.go({ type: 'TALLY', side: 'home', payload: { kind: 'faceoff', ...t(320) }, attribution: fo.attribution, attribution2: fo.attribution2 });
  m.go({ ...keeperAction('away', P(A(6))), payload: { ...keeperAction('away', P(A(6))).payload, ...t(400) } });
  const voiced = iceHockeyVoice('goal Ravensworth', voiceCtx(m.s, 'ice_hockey', 1 + 500_000)) ?? [];
  assert.ok(voiced.length, 'a voice-scored goal');
  m.go(...voiced);
  for (let p = 0; p < 4; p++) m.go({ type: 'END_PERIOD', payload: { at: 0 } });
  m.go({ type: 'START_SHOOTOUT', payload: { first: 'away' } });
  m.go({ type: 'SO', side: 'away', payload: { scored: true }, attribution: { playerId: A(9), stat: 'soTaken', extra: { soGoals: 1 } } });
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('ice hockey', s, m.actions);
    const goal = s.events.find((e) => e.type === 'goal')!;
    assert.deepEqual([goal.playerId, goal.secondId, goal.thirdId, goal.thirdName], [H(4), H(3), H(2), undefined]);
    assert.ok(s.events.some((e) => e.type === 'shot' && e.gkId === H(1) && e.gkName === undefined));
  });
  test('commentary, timeline, box and ticker show initials', () => {
    assertInitials('ice commentary', iceHockeyCommentary(s, TEAMS, viewer), 'O. P.', 'B. F.', 'P. T.');
    assertInitials('ice timeline', iceHockeyTimeline(s, TEAMS, viewer), 'O. P.');
    assertInitials('ice box', iceHockeyBox(s, { nameOf: viewer }).data('all'), 'O. P.', 'Z. Q.');
    assertInitials('ice ticker', iceHockeyTickerDetail(s, { ...TEAMS, player: viewer }), 'O. P.');
    const step = m.steps.find((x) => x.type === 'GOAL')!;
    assertInitials('ice flash', iceHockeyTickerFlash(step.prev, step.next, viewer), 'O. P.');
  });
});

/* ---------------------------------- netball --------------------------------- */

describe('IDs-only · netball', () => {
  const TRACKED = [...nb.LIVE_KEYS];
  const credit = (e: Parameters<typeof nb.eventCredits>[0]) => {
    const cr = nb.eventCredits(e);
    return { attribution: nb.creditAttribution(cr.first, 1, TRACKED), attribution2: nb.creditAttribution(cr.second, 1, TRACKED) };
  };
  let u = 0;
  const t = (sec: number, period = 1) => ({ uid: `u${++u}`, sec, period });
  const POS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'] as const;
  const m = scorer(nb.init({ detail: true, stopClock: false }), nb.reducer);
  // the team sheet's positions, ids only (as the controls stamp them)
  for (const side of ['home', 'away'] as const) m.go({ type: 'XI', payload: { team: side, pos: Object.fromEntries(POS.map((p, i) => [p, { id: `${side[0]}${i + 1}` }])) } });
  m.go({ type: 'FIRST_CENTRE', side: 'home' }, { type: 'CLOCK', payload: { run: true, at: 1 } });
  m.go({ type: 'GOAL', side: 'home', payload: { pos: 'GS', ...t(60) }, ...credit({ type: 'goal', playerId: H(1), secondId: H(3) }) });
  const miss = t(120);
  m.go({ type: 'MISS', side: 'away', payload: { pos: 'GA', ...miss }, ...credit({ type: 'miss', playerId: A(2), secondId: A(4) }) });
  m.go({ type: 'STAT', side: 'home', payload: { kind: 'rebound', ref: miss.uid, ...t(121) }, ...credit({ type: 'stat', stat: 'rebound', playerId: H(7) }) });
  m.go({ type: 'STAT', side: 'home', payload: { kind: 'intercept', ...t(150) }, ...credit({ type: 'stat', stat: 'intercept', playerId: H(6) }) });
  m.go({ type: 'PENALTY', side: 'away', payload: { penalty: 'contact', ...t(180) }, ...credit({ type: 'penalty', penalty: 'contact', playerId: A(6) }) });
  m.go({ type: 'SANCTION', side: 'away', payload: { sanction: 'suspension', minutes: 2, ...t(200) }, ...credit({ type: 'sanction', sanction: 'suspension', playerId: A(7) }) });
  m.go({ ...subAction('home', P(H(4)), P(H(9)), { pos: 'C' }), payload: { ...subAction('home', P(H(4)), P(H(9)), { pos: 'C' }).payload, ...t(300) } });
  m.go({ type: 'POS', side: 'home', payload: { id: H(2), pos: 'WA', ...t(310) } });
  m.go({ type: 'CPR', side: 'home', payload: { playerId: H(3), pos: 'WA', ...t(320) } });
  const voiced = netballVoice('goal away GS', voiceCtx(m.s, 'netball', 1 + 400_000)) ?? [];
  assert.ok(voiced.length, 'a voice-scored goal');
  m.go(...voiced);
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('netball', s, m.actions);
    assert.deepEqual(s.xi?.home?.pos?.GS, { id: H(1) });
    assert.ok(s.events.some((e) => e.type === 'goal' && e.playerId === H(1) && e.secondId === H(3)));
  });
  test('feed, timeline, box, ticker and banner show initials', () => {
    assertInitials('netball feed', netballFeed(s, TEAMS, viewer), 'Z. Q.', 'B. F.');
    assertInitials('netball timeline', netballTimeline(s, TEAMS, viewer), 'Z. Q.');
    assertInitials('netball box', netballBox(s, { nameOf: viewer }).data('all'), 'Z. Q.');
    assertInitials('netball ticker', netballTickerDetail(s, { ...TEAMS, player: viewer }), 'Z. Q.');
    const g = m.steps.find((x) => x.type === 'GOAL')!;
    assertInitials('netball flash', netballTickerFlash(g.prev, g.next, viewer), 'Z. Q.');
    const sanc = m.steps.find((x) => x.type === 'SANCTION')!;
    assertInitials('netball banner', netballLiveField(sanc.next, 1 + 200_500, viewer), 'A. F.');
  });
});

/* ------------------------------- rugby union -------------------------------- */

describe('IDs-only · rugby union', () => {
  const TRACKED = [...rg.LIVE_KEYS];
  const credit = (e: Parameters<typeof rg.eventCredits>[0]) => {
    const cr = rg.eventCredits(e);
    return { attribution: rg.creditAttribution(cr.first, 1, TRACKED), attribution2: rg.creditAttribution(cr.second, 1, TRACKED) };
  };
  let u = 0;
  const t = (min: number) => ({ uid: `u${++u}`, sec: min * 60, psec: min * 60, period: 1 });
  const m = scorer(rg.init({}), rg.reducer);
  const slots = (side: Side) => Array.from({ length: 15 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: String(i + 1) })) as never[];
  for (const side of ['home', 'away'] as const) m.go({ type: 'XI', payload: { team: side, players: xiStamp(slots(side), []).players } });
  m.go({ type: 'CLOCK', payload: { run: true, at: 1 } });
  m.go({ type: 'TRY', side: 'home', payload: t(5), ...credit({ type: 'try', playerId: H(11), secondId: H(10) }) });
  m.go({ type: 'KICK', side: 'home', payload: { kick: 'conv', made: true, ...t(6) }, ...credit({ type: 'kick', kick: 'conv', made: true, playerId: H(10) }) });
  m.go({ type: 'CARD', side: 'away', payload: { card: 'yellow', ...t(20) }, ...credit({ type: 'card', card: 'yellow', playerId: A(6) }) });
  m.go({ ...subAction('away', P(A(12)), P(A(15)), { temp: 'hia' }), payload: { ...subAction('away', P(A(12)), P(A(15)), { temp: 'hia' }).payload, ...t(25) } });
  m.go({ ...subAction('home', P(H(1)), P(H(14))), payload: { ...subAction('home', P(H(1)), P(H(14))).payload, ...t(30) } });
  const voiced = rugbyVoice('try Ravensworth', voiceCtx(m.s, 'rugby', 1 + 35 * 60_000)) ?? [];
  assert.ok(voiced.length, 'a voice-scored try');
  m.go(...voiced);
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('rugby', s, m.actions);
    assert.ok(s.events.some((e) => e.type === 'try' && e.playerId === H(11) && e.secondId === H(10)));
    assert.ok(s.events.some((e) => e.type === 'try' && e.playerId === A(3)), 'the voice try by id');
  });
  test('commentary, timeline, box, ticker, banner and Undo show initials', () => {
    assertInitials('rugby commentary', rugbyCommentary(s, TEAMS, viewer), 'P. H.', 'O. G.');
    assertInitials('rugby timeline', rugbyTimeline(s, TEAMS, viewer), 'P. H.');
    assertInitials('rugby box', rugbyBox(s, { nameOf: viewer }).data('all'), 'P. H.');
    assertInitials('rugby ticker', rugbyTickerDetail(s, { ...TEAMS, player: viewer }), 'P. H.');
    const tr = m.steps.find((x) => x.type === 'TRY')!;
    assertInitials('rugby flash', rugbyTickerFlash(tr.prev, tr.next, viewer), 'P. H.');
    assertInitials('rugby undo', rugbyUndoLabel(tr, viewer), 'P. H.');
    const card = m.steps.find((x) => x.type === 'CARD')!;
    assertInitials('rugby banner', rugbyLiveField(card.next, 1 + 21 * 60_000, viewer), 'R. M.');
  });
});

/* ------------------------------- rugby league ------------------------------- */

describe('IDs-only · rugby league', () => {
  const TRACKED = [...lg.LIVE_KEYS];
  const credit = (e: Parameters<typeof lg.eventCredits>[0]) => {
    const cr = lg.eventCredits(e);
    return { attribution: lg.creditAttribution(cr.first, 1, TRACKED), attribution2: lg.creditAttribution(cr.second, 1, TRACKED) };
  };
  let u = 0;
  const t = (min: number) => ({ uid: `u${++u}`, sec: min * 60, psec: min * 60, period: 1 });
  const m = scorer(lg.init({}), lg.reducer);
  const slots = (side: Side) => Array.from({ length: 13 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: String(i + 1) })) as never[];
  for (const side of ['home', 'away'] as const) m.go({ type: 'XI', payload: { team: side, players: xiStamp(slots(side), []).players } });
  m.go({ type: 'CLOCK', payload: { run: true, at: 1 } });
  m.go({ type: 'TRY', side: 'home', payload: t(7), ...credit({ type: 'try', playerId: H(5), secondId: H(7) }) });
  m.go({ type: 'KICK', side: 'home', payload: { kick: 'conv', made: true, ...t(8) }, ...credit({ type: 'kick', kick: 'conv', made: true, playerId: H(7) }) });
  m.go({ type: 'SANCTION', side: 'away', payload: { sanction: 'sinBin', ...t(20) }, ...credit({ type: 'sanction', sanction: 'sinBin', playerId: A(10) }) });
  m.go({ type: 'KICK', side: 'away', payload: { kick: 'fg', made: true, ...t(39) }, ...credit({ type: 'kick', kick: 'fg', made: true, playerId: A(7) }) });
  m.go({ ...subAction('home', P(H(8)), P(H(13))), payload: { ...subAction('home', P(H(8)), P(H(13))).payload, ...t(30) } });
  const voiced = leagueVoice('try Coldwater', voiceCtx(m.s, 'rugby_league', 1 + 35 * 60_000)) ?? [];
  assert.ok(voiced.length, 'a voice-scored try');
  m.go(...voiced);
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('rugby league', s, m.actions);
    assert.ok(s.events.some((e) => e.type === 'try' && e.playerId === H(5) && e.secondId === H(7)));
  });
  test('commentary, timeline, box, ticker, banner and Undo show initials', () => {
    assertInitials('league commentary', leagueCommentary(s, TEAMS, viewer), 'L. A.', 'C. B.');
    assertInitials('league timeline', leagueTimeline(s, viewer), 'L. A.');
    assertInitials('league box', leagueBox(s, { nameOf: viewer }).data('all'), 'L. A.');
    assertInitials('league ticker', leagueTickerDetail(s, { player: viewer }), 'L. A.');
    const tr = m.steps.find((x) => x.type === 'TRY')!;
    assertInitials('league flash', leagueTickerFlash(tr.prev, tr.next, viewer), 'L. A.');
    assertInitials('league undo', leagueUndoLabel(tr, viewer), 'L. A.');
    const sb = m.steps.find((x) => x.type === 'SANCTION')!;
    assertInitials('league banner', leagueLiveField(sb.next, 1 + 21 * 60_000, viewer), 'I. V.');
  });
});

/* ----------------------------- American football ----------------------------- */

describe('IDs-only · American football', () => {
  let u = 0;
  const at = (period: number, psec: number, len = 900) => ({ uid: `u${++u}`, period, psec, sec: (period - 1) * len + psec });
  const m = scorer(af.init({ preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp', trackTackles: true, trackTargets: true, trackDefence: true }), af.reducer);
  const slots = (side: Side) => Array.from({ length: 11 }, (_, i) => ({ playerId: `${side[0]}${i + 1}`, position: 'X' })) as never[];
  for (const side of ['home', 'away'] as const) m.go({ type: 'XI', payload: { team: side, players: xiStamp(slots(side), []).players } });
  // the controls' `who(p)` = { id }; a play is `buildPlay` (the same as the PLAY flow)
  const play = (side: Side, inp: Parameters<typeof af.buildPlay>[2], t: Record<string, unknown>) => m.go(af.buildPlay(m.s, side, inp, t));
  m.go({ type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, ...at(1, 0) } });
  play('home', { play: 'pass', yards: 15, p1: P(H(1)), p2: P(H(3)), tgt: true }, at(1, 30));
  m.go({ type: 'TACKLE', side: 'away', payload: at(1, 30), ...af.credit({ type: 'tackle', playerId: A(6) }) });
  play('home', { play: 'run', yards: 5, p1: P(H(2)) }, at(1, 60));
  play('home', { play: 'inc', p1: P(H(1)), p2: P(H(4)), tgt: true }, at(1, 90));
  m.go({ type: 'PASS_DEF', side: 'away', payload: at(1, 90), ...af.credit({ type: 'pd', playerId: A(4) }) });
  play('home', { play: 'pass', yards: 55, p1: P(H(1)), p2: P(H(3)) }, at(1, 120)); // touchdown
  m.go({ type: 'TRY', side: 'home', payload: { kind: 'kick', good: true, ...at(1, 120) }, ...af.credit({ type: 'try', kind: 'kick', good: true, playerId: H(11) }) });
  m.go({ type: 'PLAY', side: 'away', payload: { play: 'kickoff', newSpot: 25, ...at(1, 150) } });
  play('away', { play: 'sack', yards: -6, p1: P(A(1)), p2: P(H(9)) }, at(1, 180));
  m.go({ type: 'FG', side: 'away', payload: { good: true, yards: 40, ...at(1, 240) }, ...af.credit({ type: 'fg', good: true, playerId: A(11) }) });
  m.go({ type: 'EJECT', side: 'home', payload: at(1, 260), ...af.credit({ type: 'eject', playerId: H(8) }) });
  const voiced = afVoice('field goal good Quimby', voiceCtx(m.s, 'american_football', 1 + 300_000)) ?? [];
  assert.ok(voiced.length, 'a voice-scored field goal');
  m.go(...voiced);
  const s = m.s;

  test('state and every action carry ids only', () => {
    assertIdsOnly('American football', s, m.actions);
    assert.ok(s.events.some((e) => e.type === 'td' && e.playerId === H(3) && e.secondId === H(1)));
    assert.ok(s.events.every((e) => e.playerName === undefined), 'no name-only (p1Name) players');
  });
  test('commentary, timeline, plays, box, ticker and Undo show initials', () => {
    assertInitials('AF commentary', afCommentary(s, TEAMS, viewer), 'B. F.', 'Z. Q.');
    assertInitials('AF timeline', afTimeline(s, viewer), 'B. F.');
    assertInitials('AF plays', afPlays(s, 30, viewer), 'Z. Q.');
    assertInitials('AF box', afBox(s, { nameOf: viewer }).data('all'), 'B. F.', 'Z. Q.');
    assertInitials('AF ticker', afTickerDetail(s, { ...TEAMS, player: viewer }), 'B. F.');
    const td = m.steps.find((x) => x.type === 'TD' || (x.type === 'PLAY' && (x.next as af.AFState).events.some((e) => e.type === 'td')))!;
    assertInitials('AF flash', afTickerFlash(td.prev, td.next, viewer), 'B. F.');
    assertInitials('AF undo', afUndoLabel(td, viewer), 'B. F.');
  });
});

/* ------------------------------- older logs ------------------------------- */

describe('IDs-only · an older (named) log still reads as before', () => {
  const fullName = (id: string) => ALL.find(([x]) => x === id)?.[1];
  test('football: stored names show with no lookup; the viewer sees initials by id', () => {
    const named: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1 } },
      { type: 'GOAL', side: 'home', payload: { minute: 10, half: 1, goalType: 'open', pid: H(9) }, attribution: { playerId: H(9), stat: 'goals', playerName: fullName(H(9)) } },
      { type: 'ASSIST', side: 'home', payload: { pid: H(7) }, attribution: { playerId: H(7), stat: 'assists', playerName: fullName(H(7)) } },
      { type: 'SUB', side: 'home', payload: { minute: 60, half: 2, offName: fullName(H(10)), onName: fullName(H(12)), offId: H(10), onId: H(12) } },
      { type: 'STAT', side: 'away', payload: { kind: 'foul', minute: 20, half: 1, playerName: fullName(A(5)), secondName: fullName(H(8)) }, attribution: { playerId: A(5), stat: 'fouls', playerName: fullName(A(5)) } },
    ];
    const s = named.reduce(fb.reducer, fb.init({}));
    assert.equal(s.events[0].playerName, 'Archibald Wexley'); // replayed exactly as stored
    assert.deepEqual(s.subbedOff.home, ['Ottoline Gravesend'], 'an older SUB keeps the name in subbedOff');
    assert.ok(fb.isSubbedOff(s, 'home', { id: H(10), fullName: 'Ottoline Gravesend' }));
    const plain = JSON.stringify(footballFeed(s, TEAMS));
    assert.match(plain, /Archibald Wexley \(Lions\)/);
    assert.match(plain, /Seraphina Lockhart \(Lions\) wins a free kick/, 'a name-only victim keeps its stored name');
    const masked = JSON.stringify(footballFeed(s, TEAMS, viewer));
    assert.match(masked, /A\. W\. \(Lions\)/, 'by id: the stored name is only the fallback');
    assert.ok(!masked.includes('Archibald Wexley'));
    // the display copy is never the stored state
    assert.equal(withNames(s, viewer).events[0].playerName, 'A. W.');
    assert.equal(s.events[0].playerName, 'Archibald Wexley');
    assert.equal(nameRow({ playerId: H(9) }, viewer).playerName, 'A. W.');
  });
});
