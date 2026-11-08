/**
 * No false zeros — football, hockey, ice hockey, rugby union, rugby league
 * (docs/security/breaks/no-false-zeros-invasion.md, NZI1…NZI16).
 *
 * The rule (racket DD11, now every invasion sport): a "Stats to track" stat
 * counts as tracked only once at least one event of that kind was captured in
 * the match. Switched on with nothing captured shows nothing and writes
 * nothing to careers. The toggle still means "offered" (buttons, voice).
 * Ends with a 600-user simulation: random matches per sport with every toggle
 * on and random capture.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScoreAction } from '../src/sports/types.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { centreComparison } from '../src/sports/invasion/centre.ts';
import { ruledOutTracked } from '../src/sports/invasion/ruledOut.ts';
import { restartsTracked } from '../src/sports/invasion/restarts.ts';
// football
import * as football from '../src/sports/football/engine.ts';
import { footballTrackedKeys } from '../src/sports/football/actions.ts';
import { footballStatTotals, GOAL_STAT, STAT_KEY, statCredits } from '../src/sports/football/totals.ts';
import { footballCapturedKeys, footballDepthTeamStats, footballPossession, optionalStatKeys } from '../src/sports/football/depth.ts';
import { footballCentreSource } from '../src/sports/football/centre.ts';
import { footballStats as footballSchema, footballCentre } from '../src/sports/football/stats.ts';
import type { StatKind } from '../src/sports/football/events.ts';
// hockey
import * as hockey from '../src/sports/hockey/engine.ts';
import { hockeyDepthFigures, hockeyPossession, referralsTracked, possessionTracked } from '../src/sports/hockey/depth.ts';
// ice hockey
import * as ice from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyTotals } from '../src/sports/ice_hockey/totals.ts';
import { iceHockeyBox } from '../src/sports/ice_hockey/box.ts';
import { iceHockeySheet } from '../src/sports/ice_hockey/sheet.ts';
import { iceHockeyStats } from '../src/sports/ice_hockey/stats.ts';
import { iceHockeyVoice } from '../src/sports/ice_hockey/voice.ts';
// rugby union
import * as rugby from '../src/sports/rugby/engine.ts';
import { rugbyTotals } from '../src/sports/rugby/totals.ts';
import { rugbyBox } from '../src/sports/rugby/box.ts';
import { rugbySheet } from '../src/sports/rugby/sheet.ts';
import { rugbyStats } from '../src/sports/rugby/stats.ts';
// rugby league
import * as league from '../src/sports/rugby_league/engine.ts';
import { leagueTotals } from '../src/sports/rugby_league/totals.ts';
import { leagueBox } from '../src/sports/rugby_league/box.ts';
import { leagueSheet } from '../src/sports/rugby_league/sheet.ts';
import { rugbyLeagueStats } from '../src/sports/rugby_league/stats.ts';
import type { StatSheet } from '../src/sports/compareSheet.ts';
import type { Player } from '../src/core/types.ts';

type Side = 'home' | 'away';
const nm = (id: string) => id.toUpperCase();
const keysOf = (t: Record<string, { stats: Record<string, number> }>): Set<string> => new Set(Object.values(t).flatMap((l) => Object.keys(l.stats)));
const sheetRows = (sh: StatSheet): string[] => sh.sections.flatMap((x) => x.rows.map((r) => r.key));
const sheetSections = (sh: StatSheet): string[] => sh.sections.map((x) => x.key);
const boxCols = (schema: Parameters<typeof buildBoxTable>[0], data: Parameters<typeof buildBoxTable>[1]): string[] => buildBoxTable(schema, data).columns.map((c) => c.key);
let u = 0;

/* ================================ football ================================= */

const FB_ALL_ON = {
  trackShots: true, trackPossession: true, trackPasses: true, trackFouls: true, trackCards: true, trackOffsides: true, trackCorners: true,
  trackTackles: true, trackInterceptions: true, trackSaves: true, trackCrosses: true, trackDribbles: true, trackHandball: true,
  trackAttackContribution: true, trackDefenceContribution: true,
  trackShotDetail: true, trackKeyPasses: true, trackClearances: true, trackSetPieces: true, trackRuledOut: true,
};
const fbAttr = (id: string, stat: string, extra?: Record<string, number>) => ({ playerId: id, stat, playerName: nm(id), ...(extra ? { extra } : {}) });
let fbMin = 1;
const fbAt = () => ({ minute: fbMin++, half: 1 });
const fbGoal = (side: Side, id: string): ScoreAction =>
  ({ type: 'GOAL', side, payload: { goalType: 'open', pid: id, ...fbAt() }, attribution: fbAttr(id, 'goals', { shots: 1, shotsOnTarget: 1, [GOAL_STAT.open]: 1 }) });
const fbStat = (side: Side, kind: StatKind, id?: string, detail: Record<string, unknown> = {}): ScoreAction => {
  const key = STAT_KEY[kind];
  const c = statCredits({ kind, onTarget: detail.onTarget as boolean, blocked: detail.blocked as boolean, complete: detail.complete as boolean });
  const { [key ?? '']: _k, ...extra } = c;
  return { type: 'STAT', side, payload: { kind, at: 1, ...detail, ...fbAt() }, attribution: id && key ? fbAttr(id, key, Object.keys(extra).length ? extra : undefined) : undefined };
};
const fbP = (id: string) => ({ id, name: nm(id) });
const fbXi = (team: Side, gk: string, players: string[]): ScoreAction => ({ type: 'XI', payload: { team, gk: fbP(gk), players: players.map(fbP), keepers: [fbP(gk)] } });
const FB_KICK: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1000, ord: true } }, fbXi('home', 'hgk', ['hgk', 'hcb', 'hmf', 'hst']), fbXi('away', 'agk', ['agk', 'acb', 'amf', 'ast'])];
const fbRun = (acts: ScoreAction[], config: Record<string, unknown> = FB_ALL_ON) => acts.reduce(football.reducer, football.init(config));
const fbCompare = (s: football.FootballState, now = 600_000) => {
  const data = footballCentreSource(s, { now }).data('all');
  const rows: string[] = [], untracked: string[] = [];
  for (const cat of footballCentre) {
    const c = centreComparison(footballSchema, data, 'all', cat);
    rows.push(...c.rows.map((r) => r.key));
    untracked.push(...c.untracked);
  }
  return { rows, untracked, data };
};
/** the stat kinds a base toggle feeds (cards: a core record; possession: the bar) */
const FB_TOGGLE_KEYS: Record<string, string[]> = {
  tackle: ['tackles'], interception: ['interceptions'], foul: ['fouls'], save: ['saves'], pass: ['passes', 'passesComplete'], cross: ['crosses'],
  dribble: ['dribbles'], offside: ['offsides'], handball: ['handballs'], attackContribution: ['attackingContributions'],
  defenceContribution: ['defensiveContributions'], shot: ['shots', 'shotsOnTarget'], block: ['blocks'], keyPass: ['keyPasses'], clearance: ['clearances'],
};

describe('football · tracked means captured', () => {
  const onlyGoal = fbRun([...FB_KICK, fbGoal('home', 'hst')]);
  test('NZI1: the career stamp lists a switched-on stat only once one was captured', () => {
    const offered = footballTrackedKeys(onlyGoal.track, onlyGoal.deep ?? {});
    assert.ok(offered.includes('tackles'), 'offered: the toggle is on');
    const k = footballCapturedKeys(offered, onlyGoal);
    for (const key of ['tackles', 'fouls', 'passes', 'interceptions', 'saves', 'shots', 'crosses', 'keyPasses', 'clearances']) assert.ok(!k.includes(key), key);
    for (const key of ['goals', 'assists', 'yellowCards', 'redCards', 'penaltiesWon', 'penaltiesMissed']) assert.ok(k.includes(key), `core: ${key}`);
    // the kind being recorded counts (the first tackle's own line lists tackles)
    assert.ok(footballCapturedKeys(offered, onlyGoal, ['tackle']).includes('tackles'));
    const withTackle = fbRun([...FB_KICK, fbGoal('home', 'hst'), fbStat('away', 'tackle', 'acb')]);
    const k2 = footballCapturedKeys(offered, withTackle);
    assert.ok(k2.includes('tackles'));
    assert.ok(!k2.includes('fouls'));
  });
  test('NZI1: the controls stamp the captured keys, with the kind being recorded', () => {
    const ui = readFileSync('src/sports/football/index.tsx', 'utf8');
    assert.match(ui, /footballCapturedKeys\(footballTrackedKeys\(t, deep\), state, adding\)/);
    assert.match(ui, /trackedKeys\(\[kind\]\)/);
  });
  test('NZI2: statTotals writes no 0 for a kind nobody captured', () => {
    const t = footballStatTotals(fbRun([...FB_KICK, fbGoal('home', 'hst'), fbStat('away', 'foul', 'acb')]));
    const keys = keysOf(t);
    for (const key of ['tackles', 'interceptions', 'passes', 'passesComplete', 'saves', 'crosses', 'dribbles', 'offsides', 'handballs', 'attackingContributions', 'defensiveContributions', 'blocks', 'keyPasses', 'clearances']) {
      assert.ok(!keys.has(key), key);
    }
    assert.equal(t.acb.stats.fouls, 1);
    assert.equal(t.hst.stats.fouls, 0, 'captured → 0 for the others with a line');
    assert.equal(t.hst.stats.goals, 1);
    assert.equal(t.hst.stats.penaltiesWon, 0, 'core keys stay');
  });
  test('NZI3: the box has no column of zeros for a kind nobody captured', () => {
    const { data } = fbCompare(onlyGoal);
    const cols = boxCols(footballSchema, data);
    for (const key of ['shots', 'saves', 'fouls']) assert.ok(!cols.includes(key), key);
    const s2 = fbRun([...FB_KICK, fbGoal('home', 'hst'), fbStat('away', 'foul', 'acb')]);
    const cols2 = boxCols(footballSchema, fbCompare(s2).data);
    assert.ok(cols2.includes('fouls'));
    assert.ok(!cols2.includes('saves'));
  });
  test('NZI4: the team comparison leaves out a switched-on stat with nothing captured', () => {
    const { rows, untracked } = fbCompare(onlyGoal);
    for (const key of ['tackles', 'corners', 'passAccuracy', 'passes', 'fouls', 'offsides', 'interceptions', 'saves', 'crosses', 'dribbles', 'handballs', 'shots', 'shotsOnTarget']) {
      assert.ok(!rows.includes(key), key);
    }
    assert.equal(untracked.length, 0, 'the options are on: no "not tracked" note either');
    const s2 = fbRun([...FB_KICK, fbGoal('home', 'hst'), fbStat('away', 'corner'), fbStat('home', 'tackle', 'hcb')]);
    const r2 = fbCompare(s2).rows;
    assert.ok(r2.includes('corners') && r2.includes('tackles'));
    assert.ok(!r2.includes('fouls'));
    // a toggle that is off is still listed "not tracked"
    const off = fbRun([...FB_KICK, fbGoal('home', 'hst')], { ...FB_ALL_ON, trackTackles: false });
    assert.ok(fbCompare(off).untracked.length > 0);
  });
  test('NZI5: depth figures only once one was logged', () => {
    const d = footballDepthTeamStats(onlyGoal);
    for (const key of ['keyPasses', 'clearances', 'goalKicks', 'throwIns', 'goalsRuledOut', 'bigChances', 'shotsInBox', 'shotsOffTarget', 'savePct']) {
      assert.ok(!(key in d.home), key);
    }
    assert.deepEqual(optionalStatKeys(onlyGoal), []);
    const s2 = fbRun([...FB_KICK, fbStat('home', 'clearance', 'hcb'), fbStat('away', 'goalKick'), fbStat('home', 'shot', 'hst', { onTarget: true, zone: 'box' }), fbStat('away', 'save', 'agk')]);
    const d2 = footballDepthTeamStats(s2);
    assert.equal(d2.home.clearances, 1);
    assert.equal(d2.away.goalKicks, 1);
    assert.equal(d2.home.shotsInBox, 1);
    assert.equal(d2.home.shotsOffTarget, 0);
    assert.ok('savePct' in d2.away);
    assert.deepEqual(optionalStatKeys(s2), ['clearances']);
  });
  test('NZI6: possession only once the bar was tapped', () => {
    // fouls / tackles hand the ball over on their own: no bar tap, no %
    const s = fbRun([...FB_KICK, { ...fbStat('home', 'foul', 'hcb'), payload: { kind: 'foul', at: 60_000, possSide: 'away', ...fbAt() } }]);
    assert.equal(footballPossession(s, 120_000), undefined);
    assert.ok(!fbCompare(s, 120_000).rows.includes('possession'));
    const s2 = football.reducer(s, { type: 'POSSESSION', payload: { side: 'home', at: 90_000 } });
    assert.ok(footballPossession(s2, 120_000));
  });
});

/* ================================= hockey ================================== */

describe('hockey · tracked means captured', () => {
  const H = (type: string, side: Side | undefined, sec: number, period: number, payload: Record<string, unknown> = {}): ScoreAction =>
    ({ type, ...(side ? { side } : {}), payload: { uid: `h${++u}`, sec, period, ...payload } });
  const CFG = { trackPossession: true, trackReferrals: true, periods: 4, periodMinutes: 15 };
  const run = (acts: ScoreAction[]) => acts.reduce(hockey.reducer, hockey.init(CFG));
  test('NZI7: referrals switched on with none logged → no referral rows', () => {
    const s = run([H('PC', 'home', 100, 1)]);
    assert.equal(referralsTracked(s), false);
    assert.ok(!('referralsWon' in hockeyDepthFigures(s, 'home')));
    const s2 = run([H('REFERRAL', 'away', 200, 1, { upheld: true })]);
    assert.equal(referralsTracked(s2), true);
    assert.equal(hockeyDepthFigures(s2, 'away').referralsWon, 1);
    assert.equal(hockeyDepthFigures(s2, 'home').referralsWon, 0);
  });
  test('NZI7: possession switched on with no tap → not tracked, no %', () => {
    const s = run([H('PC', 'home', 100, 1)]);
    assert.equal(possessionTracked(s), false);
    assert.equal(hockeyPossession(s, 'all', 0), undefined);
    const s2 = run([{ type: 'POSS', side: 'home', payload: { sec: 0, period: 1 } }, { type: 'POSS', side: 'away', payload: { sec: 300, period: 1 } }, H('PC', 'home', 600, 1)]);
    assert.equal(possessionTracked(s2), true);
    assert.ok(hockeyPossession(s2, 'all', 0));
  });
});

/* =============================== ice hockey ================================ */

const ICE_ON = { trackFaceoffs: true, trackPhysical: true, trackPuck: true, trackAttempts: true, trackFaceoffZones: true };
const IH = ['hg', 'h2', 'h3', 'h4', 'h5', 'h6'], IA = ['ag', 'a2', 'a3', 'a4', 'a5', 'a6'];
function iceA(type: string, side: Side, sec: number, ev: Partial<ice.IceEvent>, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = ice.eventCredits({ side, ...ev } as ice.IceEvent);
  const a: ScoreAction = { type, side, payload: { ...payload, uid: `i${++u}`, sec, period: 1 } };
  const a1 = ice.creditAttribution(cr.first), a2 = ice.creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const iceXi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? IH : IA).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hg' : 'ag', name: nm(team === 'home' ? 'hg' : 'ag') } } });
const iceGoal = (side: Side, sec: number, scorer: string) => iceA('GOAL', side, sec, { type: 'goal', playerId: scorer, strength: 'ev' }, { strength: 'ev' });
const iceTally = (side: Side, sec: number, kind: ice.TallyKind, who?: string, loser?: string, zone?: string) =>
  iceA('TALLY', side, sec, { type: 'tally', tally: kind, playerId: who, ...(loser ? { secondId: loser } : {}), ...(zone ? { zone: zone as never } : {}) }, { kind, ...(zone ? { zone } : {}) });
const iceRun = (acts: ScoreAction[], cfg: Record<string, unknown> = ICE_ON) => acts.reduce(ice.reducer, ice.init(cfg));

describe('ice hockey · tracked means captured', () => {
  const onlyGoal = iceRun([iceXi('home'), iceXi('away'), iceGoal('home', 100, 'h4')]);
  test('NZI8: every toggle on, only a goal → no tally key, column, row or section', () => {
    for (const f of ice.TRACK_FLAGS) assert.equal(ice.tallyTracked(onlyGoal, f), false, f);
    assert.equal(ice.zonesTracked(onlyGoal), false);
    const keys = keysOf(iceHockeyTotals(onlyGoal));
    for (const k of [...ice.TALLY_KEYS, ...ice.FO_ZONE_KEYS]) assert.ok(!keys.has(k), k);
    const cols = boxCols(iceHockeyStats, iceHockeyBox(onlyGoal).data('all'));
    for (const k of ['fo', 'faceoffPct', 'checks', 'shotBlocks', 'takeaways', 'giveaways', 'missedShots']) assert.ok(!cols.includes(k), k);
    const sh = iceHockeySheet(onlyGoal);
    assert.ok(!sheetSections(sh).includes('fo') && !sheetSections(sh).includes('phys'));
    assert.ok(!sheetRows(sh).includes('missed') && !sheetRows(sh).includes('blockedBy'));
    assert.deepEqual(ice.iceTrackedKeys(onlyGoal), []);
  });
  test('NZI8: per kind — a hit gives Hits, not "Blocked shots 0"', () => {
    const s = iceRun([iceXi('home'), iceXi('away'), iceGoal('home', 100, 'h4'), iceTally('home', 200, 'hit', 'h2')]);
    const t = iceHockeyTotals(s);
    assert.equal(t.h2.stats.checks, 1);
    assert.equal(t.h4.stats.checks, 0, 'captured → 0 on the other lines');
    assert.ok(!('shotBlocks' in t.h2.stats));
    const rows = sheetRows(iceHockeySheet(s));
    assert.ok(rows.includes('hits'));
    assert.ok(!rows.includes('blocks') && !rows.includes('takeaways') && !rows.includes('giveaways'));
    const cols = boxCols(iceHockeyStats, iceHockeyBox(s).data('all'));
    assert.ok(cols.includes('checks') && !cols.includes('shotBlocks'));
  });
  test('NZI8: faceoff zones only once a faceoff carried one', () => {
    const s = iceRun([iceXi('home'), iceXi('away'), iceTally('home', 200, 'faceoff', 'h2', 'a2')]);
    assert.equal(ice.zonesTracked(s), false);
    assert.ok(!keysOf(iceHockeyTotals(s)).has(ice.FO_ZONE_KEYS[0]));
    const s2 = iceRun([iceXi('home'), iceXi('away'), iceTally('home', 200, 'faceoff', 'h2', 'a2', 'oz')]);
    assert.equal(ice.zonesTracked(s2), true);
  });
  test('NZI9: the toggle still offers the tally (voice)', () => {
    const P = (id: string, fullName: string): Player => ({ id, fullName, sports: ['ice_hockey'] } as Player);
    const T = 1_700_000_000_000;
    const live = iceRun([iceXi('home'), iceXi('away'), { type: 'CLOCK', payload: { run: true, at: T - 300_000 } }]);
    assert.equal(ice.tallyOffered(live, 'trackPhysical'), true);
    assert.equal(ice.tallyTracked(live, 'trackPhysical'), false);
    const ctx = { state: live, homeName: 'Hawks', awayName: 'Wolves', homeRoster: [P('h2', 'Asha Rao')], awayRoster: [P('a2', 'Ravi Nair')], now: T };
    const a = iceHockeyVoice('hit Nair', ctx as never)![0];
    assert.equal(a.payload?.kind, 'hit');
    assert.ok(a.attribution?.tracked?.includes('checks'), 'NZI10: the first hit stamps its own key');
  });
  test('NZI10: the stamp is built from the state plus the event being recorded', () => {
    const add = { type: 'tally', side: 'home', tally: 'hit' } as ice.IceEvent;
    assert.ok(!ice.iceTrackedKeys(onlyGoal).includes('checks'));
    assert.ok(ice.iceTrackedKeys(onlyGoal, add).includes('checks'));
    assert.ok(!ice.iceTrackedKeys(onlyGoal, add).includes('shotBlocks'));
  });
});

/* =============================== rugby union =============================== */

const RU_ON = { trackDetail: true, trackPenalties: true, trackTurnovers: true, trackEntries: true, trackPossession: true, trackOffloads: true, trackRuledOut: true, trackRestarts: true };
const RH = Array.from({ length: 15 }, (_, i) => `h${i + 1}`), RA = Array.from({ length: 15 }, (_, i) => `a${i + 1}`);
function ruA(type: string, side: Side, sec: number, ev: Partial<rugby.RugbyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = rugby.eventCredits({ type: 'setpiece', side, ...ev } as rugby.RugbyEvent);
  const a: ScoreAction = { type, side, payload: { ...payload, uid: `r${++u}`, sec, psec: sec, period: 1 } };
  const a1 = rugby.creditAttribution(cr.first), a2 = rugby.creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const ruXi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? RH : RA).map((id) => ({ id, name: nm(id) })) } });
const ruTry = (side: Side, sec: number, who: string) => ruA('TRY', side, sec, { type: 'try', playerId: who });
const ruDetail = (side: Side, sec: number, detail: rugby.DetailKey, who?: string) => ruA('DETAIL', side, sec, { type: 'detail', detail, playerId: who }, { detail });
const ruTally = (side: Side, sec: number, kind: rugby.TallyKind, who?: string) => ruA('TALLY', side, sec, { type: 'tally', tally: kind, playerId: who }, { kind });
const ruRun = (acts: ScoreAction[], cfg: Record<string, unknown> = RU_ON) => acts.reduce(rugby.reducer, rugby.init(cfg));

describe('rugby union · tracked means captured', () => {
  const onlyTry = ruRun([ruXi('home'), ruXi('away'), ruTry('home', 300, 'h11')]);
  test('NZI11: every option on, only a try → no detail / tally key, column or section', () => {
    assert.equal(rugby.detailTracked(onlyTry), false);
    for (const f of rugby.TRACK_FLAGS) assert.equal(rugby.tallyTracked(onlyTry, f), false, f);
    const keys = keysOf(rugbyTotals(onlyTry));
    for (const k of [...rugby.DETAIL_STATS, ...rugby.TALLY_KEYS]) assert.ok(!keys.has(k), k);
    const cols = boxCols(rugbyStats, rugbyBox(onlyTry).data('all'));
    for (const k of [...rugby.DETAIL_STATS, ...rugby.TALLY_KEYS]) assert.ok(!cols.includes(k), k);
    const sh = rugbySheet(onlyTry);
    for (const sec of ['defence', 'setPiece', 'possession', 'restarts']) assert.ok(!sheetSections(sh).includes(sec), sec);
    for (const r of ['carries', 'lineBreaks', 'offloads', 'entries', 'penaltiesConceded', 'triesRuledOut']) assert.ok(!sheetRows(sh).includes(r), r);
    assert.deepEqual(rugby.trackedTallyKeys(onlyTry), []);
  });
  test('NZI11: per kind — a tackle gives the tackle family, not "Carries 0" or "Lineouts 0/0"', () => {
    const s = ruRun([ruXi('home'), ruXi('away'), ruTry('home', 300, 'h11'), ruDetail('away', 400, 'tackle', 'a7')]);
    const t = rugbyTotals(s);
    assert.equal(t.a7.stats.tackles, 1);
    assert.equal(t.a7.stats.missedTackles, 0, 'the family: tackle success');
    assert.equal(t.h11.stats.tackles, 0);
    for (const k of ['carries', 'lineBreaks', 'turnoversWon', 'penaltiesGivenAway']) assert.ok(!(k in t.a7.stats), k);
    const sh = rugbySheet(s);
    assert.ok(sheetRows(sh).includes('tackles') && sheetRows(sh).includes('missedTackles'));
    assert.ok(!sheetRows(sh).includes('turnoversWon') && !sheetRows(sh).includes('carries'));
    assert.ok(!sheetSections(sh).includes('setPiece'));
  });
  test('NZI11: possession only once the ball was tapped', () => {
    const s = ruRun([ruXi('home'), ruXi('away'), ruA('POSSESSION', 'home', 10)]);
    assert.equal(rugby.tallyTracked(s, 'trackPossession'), true);
  });
  test('NZI10: the union stamp includes the event being recorded', () => {
    const add = { type: 'tally', side: 'home', tally: 'offload' } as rugby.RugbyEvent;
    assert.ok(rugby.trackedTallyKeys(onlyTry, add).includes('offloads'));
    assert.ok(!rugby.trackedTallyKeys(onlyTry, add).includes('turnoversConceded'));
  });
  test('NZI13: tries ruled out and the restarts section only once one was logged', () => {
    assert.equal(ruledOutTracked(true, []), false);
    assert.equal(ruledOutTracked(true, [{ type: 'ruledout' }]), true);
    assert.equal(restartsTracked({ trackRestarts: true, events: [] }), false);
  });
});

/* =============================== rugby league ============================== */

const RL_ON = { trackSets: true, trackDefence: true, trackAttack: true, trackErrors: true, trackRuledOut: true, trackRestarts: true };
function rlA(type: string, side: Side | undefined, sec: number, ev: Partial<league.LeagueEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = league.eventCredits({ type: 'sub', side: side ?? 'home', ...ev } as league.LeagueEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `l${++u}`, sec, psec: sec, period: 1 } };
  const a1 = league.creditAttribution(cr.first), a2 = league.creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const rlXi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: Array.from({ length: 13 }, (_, i) => `${team[0]}${i + 1}`).map((id) => ({ id, name: nm(id) })) } });
const rlTry = (side: Side, sec: number, who: string) => rlA('TRY', side, sec, { type: 'try', playerId: who });
const rlDetail = (side: Side, sec: number, detail: league.DetailKey, who?: string) => rlA('DETAIL', side, sec, { type: 'detail', detail, playerId: who }, { detail });
const rlRun = (acts: ScoreAction[], cfg: Record<string, unknown> = RL_ON) => acts.reduce(league.reducer, league.init(cfg));

describe('rugby league · tracked means captured', () => {
  const onlyTry = rlRun([rlXi('home'), rlXi('away'), rlTry('home', 300, 'h2')]);
  test('NZI12: every option on, only a try → no detail keys, columns, rows or sets', () => {
    assert.deepEqual(league.trackedDetails(onlyTry), []);
    for (const f of league.TRACK_FLAGS) assert.equal(league.tracked(onlyTry, f), false, f);
    const keys = keysOf(leagueTotals(onlyTry));
    for (const k of Object.values(league.DETAIL_STAT)) assert.ok(!keys.has(k), k);
    const cols = boxCols(rugbyLeagueStats, leagueBox(onlyTry).data('all'));
    for (const k of Object.values(league.DETAIL_STAT)) assert.ok(!cols.includes(k), k);
    const rows = sheetRows(leagueSheet(onlyTry));
    for (const r of ['carries', 'lineBreaks', 'offloads', 'tackles', 'errors', 'penaltiesConceded', 'sets', 'triesRuledOut']) assert.ok(!rows.includes(r), r);
  });
  test('NZI12: per kind — a run gives Runs, not "Line breaks 0 · Offloads 0"', () => {
    const s = rlRun([rlXi('home'), rlXi('away'), rlTry('home', 300, 'h2'), rlDetail('home', 400, 'run', 'h5')]);
    assert.deepEqual(league.trackedDetails(s), ['run']);
    const t = leagueTotals(s);
    assert.equal(t.h5.stats.carries, 1);
    assert.equal(t.h2.stats.carries, 0);
    assert.ok(!('lineBreaks' in t.h5.stats) && !('offloads' in t.h5.stats) && !('tackles' in t.h5.stats));
    const s2 = rlRun([rlXi('home'), rlXi('away'), rlDetail('away', 400, 'missedTackle', 'a5')]);
    assert.deepEqual(league.trackedDetails(s2), ['tackle', 'missedTackle'], 'the tackle family');
  });
  test('NZI10: the league stamp includes the event being recorded', () => {
    const add = { type: 'detail', side: 'home', detail: 'offload' } as league.LeagueEvent;
    assert.deepEqual(league.trackedDetailKeys(onlyTry, add), ['offloads']);
  });
});

/* ======================= 600-user simulation (NZI14) ======================= */

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x100000000; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

describe('NZI14 · 600 users: switched on + random capture → keys only for captured kinds, captured values unchanged', () => {
  test('120 football matches', () => {
    const KINDS: StatKind[] = ['shot', 'foul', 'offside', 'corner', 'tackle', 'interception', 'save', 'pass', 'cross', 'dribble', 'handball', 'attackContribution', 'defenceContribution', 'block', 'keyPass', 'clearance'];
    const players: Record<Side, string[]> = { home: ['hgk', 'hcb', 'hmf', 'hst'], away: ['agk', 'acb', 'amf', 'ast'] };
    for (let m = 0; m < 120; m++) {
      const r = rng(1000 + m);
      const used = KINDS.filter(() => r() < 0.3);
      const acts: ScoreAction[] = [...FB_KICK];
      const want = new Map<string, number>(); // player|key → expected
      const bump = (id: string, k: string) => want.set(`${id}|${k}`, (want.get(`${id}|${k}`) ?? 0) + 1);
      const n = Math.floor(r() * 25);
      for (let i = 0; i < n; i++) {
        const side = pick(r, ['home', 'away'] as const);
        if (r() < 0.15) { const id = pick(r, players[side]); acts.push(fbGoal(side, id)); continue; }
        if (!used.length) continue;
        const kind = pick(r, used);
        const id = pick(r, players[side]);
        const complete = kind === 'pass' && r() < 0.5;
        acts.push(fbStat(side, kind, id, complete ? { complete: true } : {}));
        if (STAT_KEY[kind] && kind !== 'shot') bump(id, STAT_KEY[kind]!);
        if (complete) bump(id, 'passesComplete');
      }
      const s = fbRun(acts);
      const captured = new Set(s.stats.map((e) => e.kind));
      const t = footballStatTotals(s);
      const keys = keysOf(t);
      const stamp = footballCapturedKeys(footballTrackedKeys(s.track, s.deep ?? {}), s);
      for (const [kind, ks] of Object.entries(FB_TOGGLE_KEYS)) {
        if (captured.has(kind as StatKind)) continue;
        for (const k of ks) {
          if (k === 'shots' || k === 'shotsOnTarget') { assert.ok(!stamp.includes(k), `m${m} stamp ${k}`); continue; } // a goal still credits its shot live
          assert.ok(!keys.has(k), `m${m} totals ${k}`);
          assert.ok(!stamp.includes(k), `m${m} stamp ${k}`);
        }
      }
      for (const [pk, v] of want) {
        const [id, k] = pk.split('|');
        assert.equal(t[id]?.stats[k], v, `m${m} ${pk}`);
      }
      const { rows } = fbCompare(s);
      if (!captured.has('tackle')) assert.ok(!rows.includes('tackles'), `m${m} tackles row`);
      if (!captured.has('corner')) assert.ok(!rows.includes('corners'), `m${m} corners row`);
    }
  });
  test('120 hockey matches', () => {
    const H = (type: string, side: Side, sec: number, payload: Record<string, unknown> = {}): ScoreAction => ({ type, side, payload: { uid: `hs${++u}`, sec, period: 1, ...payload } });
    for (let m = 0; m < 120; m++) {
      const r = rng(2000 + m);
      const acts: ScoreAction[] = [];
      let refs = 0, poss = 0;
      for (let i = 0; i < 12; i++) {
        const x = r();
        if (x < 0.1) { acts.push(H('REFERRAL', pick(r, ['home', 'away'] as const), i * 30, { upheld: r() < 0.5 })); refs++; }
        else if (x < 0.2) { acts.push({ type: 'POSS', side: pick(r, ['home', 'away'] as const), payload: { sec: i * 30, period: 1 } }); poss++; }
        else acts.push(H('PC', pick(r, ['home', 'away'] as const), i * 30));
      }
      const s = acts.reduce(hockey.reducer, hockey.init({ trackPossession: true, trackReferrals: true }));
      const f = { ...hockeyDepthFigures(s, 'home'), ...hockeyDepthFigures(s, 'away') };
      assert.equal('referralsWon' in f, refs > 0, `m${m} referrals`);
      if (!poss) assert.ok(!('possession' in f), `m${m} possession`);
    }
  });
  test('120 ice hockey matches', () => {
    for (let m = 0; m < 120; m++) {
      const r = rng(3000 + m);
      const used = ice.TALLY_KINDS.filter(() => r() < 0.35);
      const acts: ScoreAction[] = [iceXi('home'), iceXi('away')];
      const want = new Map<string, number>();
      const bump = (id: string, k: string) => want.set(`${id}|${k}`, (want.get(`${id}|${k}`) ?? 0) + 1);
      for (let i = 0; i < 15; i++) {
        const side = pick(r, ['home', 'away'] as const);
        const id = pick(r, side === 'home' ? IH.slice(1) : IA.slice(1));
        if (r() < 0.2 || !used.length) { acts.push(iceGoal(side, 10 + i * 30, id)); continue; }
        const kind = pick(r, used);
        acts.push(iceTally(side, 10 + i * 30, kind, id));
        bump(id, ice.TALLY_KEY[kind]);
      }
      const s = iceRun(acts);
      const t = iceHockeyTotals(s);
      const keys = keysOf(t);
      const cols = boxCols(iceHockeyStats, iceHockeyBox(s).data('all'));
      for (const k of ice.TALLY_KINDS) {
        if (used.includes(k) && s.events.some((e) => e.type === 'tally' && e.tally === k)) continue;
        assert.ok(!keys.has(ice.TALLY_KEY[k]), `m${m} ${k}`);
        assert.ok(!cols.includes(ice.TALLY_KEY[k]), `m${m} col ${k}`);
      }
      for (const [pk, v] of want) { const [id, k] = pk.split('|'); assert.equal(t[id]?.stats[k], v, `m${m} ${pk}`); }
    }
  });
  test('120 rugby union matches', () => {
    const DET = rugby.DETAIL_KEYS.filter((d) => d !== 'penaltyConceded');
    const TAL: rugby.TallyKind[] = ['turnover', 'offload'];
    for (let m = 0; m < 120; m++) {
      const r = rng(4000 + m);
      const usedD = DET.filter(() => r() < 0.3), usedT = TAL.filter(() => r() < 0.3);
      const acts: ScoreAction[] = [ruXi('home'), ruXi('away')];
      const want = new Map<string, number>();
      const bump = (id: string, k: string) => want.set(`${id}|${k}`, (want.get(`${id}|${k}`) ?? 0) + 1);
      for (let i = 0; i < 15; i++) {
        const side = pick(r, ['home', 'away'] as const);
        const id = pick(r, side === 'home' ? RH : RA);
        const x = r();
        if (x < 0.4 && usedD.length) { const d = pick(r, usedD); acts.push(ruDetail(side, 10 + i * 30, d, id)); bump(id, rugby.DETAIL_STAT[d]); }
        else if (x < 0.7 && usedT.length) { const k = pick(r, usedT); acts.push(ruTally(side, 10 + i * 30, k, id)); bump(id, rugby.TALLY_KEY[k]!); }
        else acts.push(ruTry(side, 10 + i * 30, id));
      }
      const s = ruRun(acts);
      const t = rugbyTotals(s);
      const keys = keysOf(t);
      const capD = new Set(s.events.filter((e) => e.type === 'detail').map((e) => e.detail));
      for (const d of DET) {
        const fam = d === 'tackle' || d === 'missedTackle' ? capD.has('tackle') || capD.has('missedTackle') : capD.has(d);
        if (!fam) assert.ok(!keys.has(rugby.DETAIL_STAT[d]), `m${m} ${d}`);
      }
      for (const k of TAL) if (!s.events.some((e) => e.type === 'tally' && e.tally === k)) assert.ok(!keys.has(rugby.TALLY_KEY[k]!), `m${m} ${k}`);
      for (const [pk, v] of want) { const [id, k] = pk.split('|'); assert.equal(t[id]?.stats[k], v, `m${m} ${pk}`); }
    }
  });
  test('120 rugby league matches', () => {
    for (let m = 0; m < 120; m++) {
      const r = rng(5000 + m);
      const used = league.DETAIL_KEYS.filter(() => r() < 0.3);
      const acts: ScoreAction[] = [rlXi('home'), rlXi('away')];
      const want = new Map<string, number>();
      const bump = (id: string, k: string) => want.set(`${id}|${k}`, (want.get(`${id}|${k}`) ?? 0) + 1);
      for (let i = 0; i < 15; i++) {
        const side = pick(r, ['home', 'away'] as const);
        const id = `${side[0]}${1 + Math.floor(r() * 13)}`;
        if (r() < 0.3 || !used.length) { acts.push(rlTry(side, 10 + i * 30, id)); continue; }
        const d = pick(r, used);
        acts.push(rlDetail(side, 10 + i * 30, d, id));
        bump(id, league.DETAIL_STAT[d]);
      }
      const s = rlRun(acts);
      const t = leagueTotals(s);
      const keys = keysOf(t);
      const cap = new Set(s.events.filter((e) => e.type === 'detail').map((e) => e.detail));
      for (const d of league.DETAIL_KEYS) {
        const fam = d === 'tackle' || d === 'missedTackle' ? cap.has('tackle') || cap.has('missedTackle') : cap.has(d);
        if (!fam) assert.ok(!keys.has(league.DETAIL_STAT[d]), `m${m} ${d}`);
      }
      for (const [pk, v] of want) { const [id, k] = pk.split('|'); assert.equal(t[id]?.stats[k], v, `m${m} ${pk}`); }
    }
  });
});
