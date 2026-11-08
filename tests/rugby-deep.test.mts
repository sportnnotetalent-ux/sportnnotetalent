/**
 * Deep wave — rugby union at World Rugby / Opta match-centre depth:
 *  - optional "Stats to track" (penalties by offence & free kicks, turnovers
 *    conceded, 22 entries, possession & territory, offloads): the TALLY /
 *    POSSESSION / TERRITORY actions, credits, absolute statTotals (SD-19
 *    harness, every undo prefix), zeros only when tracked;
 *  - old logs replay identically (no new keys, flags, columns or sections —
 *    an old match that tracked detail never gains the new keys);
 *  - the broadcast sheet: scoring, attack (points per 22 entry), defence,
 *    set piece (steals), possession & territory on the playing clock,
 *    discipline (offences, free kicks, sin-bin time), turnovers by cause,
 *    points by half — rows only for what was tracked;
 *  - the commentary: grouped by half, newest first, rugby minutes, running
 *    score, half-time / full-time lines, the kicking competition, filters.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, eventCredits, creditAttribution, tallyTracked, ballTime, currentBall, RUGBY_LIVE_SETTINGS, TALLY_KEYS, DETAIL_STATS,
  type RugbyEvent, type RugbyState, type Side, type KickKind, type TallyKind,
} from '../src/sports/rugby/engine.ts';
import { rugbyTotals, DERIVED_KEYS } from '../src/sports/rugby/totals.ts';
import { rugbyBox } from '../src/sports/rugby/box.ts';
import { rugbyStats } from '../src/sports/rugby/stats.ts';
import { rugbyTimeline, rugbyUndoLabel, describeEvent } from '../src/sports/rugby/timeline.ts';
import { rugbySheet, entryFigures, sinBinTime } from '../src/sports/rugby/sheet.ts';
import { rugbyCommentary, sentence, RUGBY_FEED_TAGS } from '../src/sports/rugby/commentary.ts';
import { filterFeed, feedTags } from '../src/sports/feedGroups.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import type { StatSheet } from '../src/sports/compareSheet.ts';
import type { NameOf } from '../src/core/playerNames.ts';
import { nameRow } from '../src/sports/invasion/names.ts';

/* ---------------------------------- helpers --------------------------------- */

const HOME = Array.from({ length: 15 }, (_, i) => `h${i + 1}`);
const AWAY = Array.from({ length: 15 }, (_, i) => `a${i + 1}`);
const nm = (id: string) => id.toUpperCase();
/** IDs-only scoring: the state keeps ids; the viewer's names come from a lookup */
const VIEWER: NameOf = (id, legacy) => (id ? nm(id) : (legacy ?? '').trim() || 'Player');
const NAMES = { home: 'Lions', away: 'Wolves' };
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, psec: number, ev: Partial<RugbyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'setpiece', ...ev } as RugbyEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, psec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
type T = readonly [number, number, number];
const H1 = (min: number): T => [min * 60, 1, min * 60];
const H2 = (min: number, h1 = 2400): T => [h1 + (min - 40) * 60, 2, (min - 40) * 60];
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })) } });
const tryA = (side: Side, t: T, scorer?: string, assist?: string) =>
  A('TRY', side, ...t, { type: 'try', playerId: scorer, playerName: scorer && nm(scorer), secondId: assist, secondName: assist && nm(assist) });
const kickA = (side: Side, t: T, kick: KickKind, made: boolean, kicker?: string) =>
  A('KICK', side, ...t, { type: 'kick', kick, made, playerId: kicker, playerName: kicker && nm(kicker) }, { kick, made });
const cardA = (side: Side, t: T, card: 'yellow' | 'red', who: string, extra: Record<string, unknown> = {}) =>
  A('CARD', side, ...t, { type: 'card', card, playerId: who, playerName: nm(who), ...(extra.second ? { second: true } : {}) }, { card, ...extra });
const tally = (side: Side, t: T, kind: TallyKind, who?: string, extra: Record<string, unknown> = {}) =>
  A('TALLY', side, ...t, { type: 'tally', tally: kind, playerId: who, playerName: who && nm(who) }, { kind, ...extra });
const detailA = (side: Side, t: T, detail: string, who?: string) =>
  A('DETAIL', side, ...t, { type: 'detail', detail: detail as RugbyEvent['detail'], playerId: who, playerName: who && nm(who) }, { detail });
const pieceA = (side: Side, t: T, piece: 'lineout' | 'scrum', won: boolean) => A('SET_PIECE', side, ...t, {}, { piece, won });
const ballA = (type: 'POSSESSION' | 'TERRITORY', side: Side, t: T) => A(type, side, ...t);
/** End the period at exactly `len` seconds (the clock run that long). */
const endAt = (len: number): ScoreAction[] => [{ type: 'CLOCK', payload: { run: true, at: 1_000 } }, { type: 'END_PERIOD', payload: { at: 1_000 + len * 1000 } }];
const run = (acts: ScoreAction[], config?: Record<string, unknown>): RugbyState => acts.reduce(reducer, init(config));
const ALL_ON = { trackPenalties: true, trackTurnovers: true, trackEntries: true, trackPossession: true, trackOffloads: true };
const row = (sh: StatSheet, sec: string, key: string) => sh.sections.find((x) => x.key === sec)?.rows.find((r) => r.key === key);
const NEW_KEYS = ['offloads', 'turnoversConceded'];

/** The SD-143 test match: tries, kicks, a sin-bin, a penalty try, a red. */
const MATCH: ScoreAction[] = [
  xi('home'), xi('away'),
  tryA('home', H1(5), 'h11', 'h10'), kickA('home', H1(6), 'conv', true, 'h10'),
  kickA('away', H1(12), 'pen', false, 'a10'),
  cardA('home', H1(30), 'yellow', 'h6'),
  kickA('away', [41 * 60, 1, 41 * 60], 'drop', true, 'a10'),
  ...endAt(42 * 60),
  A('PENALTY_TRY', 'home', ...H2(50, 2520)),
  pieceA('away', H2(52, 2520), 'lineout', false),
  A('SUB', 'home', ...H2(55, 2520), {}, { offId: 'h1', offName: 'H1', onId: 'h16', onName: 'H16' }),
  cardA('away', H2(72, 2520), 'red', 'a7'),
  ...endAt(40 * 60),
];

/* ------------------------------- old logs ---------------------------------- */

describe('deep wave · old logs replay identically', () => {
  const s = run(MATCH);
  test('no track flags, no ball switches, the same score', () => {
    for (const f of ['trackPenalties', 'trackTurnovers', 'trackEntries', 'trackPossession', 'trackOffloads', 'ball'] as const) assert.equal(f in s, false, f);
    assert.deepEqual([s.home, s.away], [14, 3]);
  });
  test('no new keys on any line; box columns as before', () => {
    for (const l of Object.values(rugbyTotals(s))) for (const k of [...TALLY_KEYS, ...DETAIL_STATS]) assert.equal(k in l.stats, false, k);
    const table = buildBoxTable(rugbyStats, rugbyBox(s).data('all'), { scope: 'all' });
    assert.deepEqual(table.columns.map((c) => c.abbr), ['MIN', 'T', 'C', 'PG', 'DG', 'PTS', 'TA', 'YC', 'RC']);
  });
  test('the sheet has no possession, offence, turnover, attack or defence sections', () => {
    const keys = rugbySheet(s).sections.map((x) => x.key);
    assert.deepEqual(keys, ['scoring', 'setPiece', 'discipline', 'byPeriod'], 'set piece only because a lineout was recorded');
    assert.equal(row(rugbySheet(s), 'discipline', 'penaltiesConceded'), undefined, 'penalties never tracked: no false 0');
  });
  test('an old match that tracked detail keeps exactly its keys (no offloads / turnovers conceded)', () => {
    const det = run([xi('home'), detailA('home', H1(1), 'tackle', 'h7'), detailA('away', H1(2), 'penaltyConceded', 'a3'), pieceA('home', H1(3), 'scrum', true), tryA('home', H1(4), 'h11')], { trackDetail: true });
    const t = rugbyTotals(det);
    // no-false-zeros NZI11: the detail kinds it recorded (tackle → its missed-tackle pair,
    // penalty conceded) read on every line; carries / line breaks / turnovers won were never
    // recorded, so they are absent, not 0
    const recorded = ['tackles', 'missedTackles', 'penaltiesGivenAway'];
    for (const l of Object.values(t)) {
      for (const k of DETAIL_STATS) assert.equal(typeof l.stats[k], recorded.includes(k) ? 'number' : 'undefined', k);
      for (const k of NEW_KEYS) assert.equal(k in l.stats, false, k);
    }
    const cols = buildBoxTable(rugbyStats, rugbyBox(det).data('all'), { scope: 'all' }).columns.map((c) => c.key);
    assert.ok(cols.includes('tackles') && !cols.includes('offloads') && !cols.includes('turnoversConceded'));
    assert.equal(row(rugbySheet(det), 'discipline', 'penaltiesConceded')?.away, '1');
    assert.equal(rugbySheet(det).sections.some((x) => x.key === 'offences' || x.key === 'turnovers'), false);
  });
  test('unknown tallies and side-less switches are ignored', () => {
    const t = run([{ type: 'TALLY', side: 'home', payload: { kind: 'dance', uid: 'x', sec: 10, period: 1 } }, { type: 'POSSESSION', payload: { sec: 5, period: 1 } }]);
    assert.equal(t.events.length, 0);
    assert.equal('ball' in t, false);
  });
});

/* -------------------------------- tallies ---------------------------------- */

const SPORT: TotalsSport<RugbyState> = { name: 'rugby deep', init, reducer, statTotals: rugbyTotals, partial: false, derived: DERIVED_KEYS, config: ALL_ON };

describe('deep wave · optional tallies (penalties, free kicks, turnovers, 22 entries, offloads)', () => {
  const log: ScoreAction[] = [
    xi('home'), xi('away'),
    tally('away', H1(5), 'penalty', 'a7', { infringement: 'offside' }),
    tally('away', H1(6), 'penalty', undefined, { infringement: 'offside' }), // team penalty
    tally('home', H1(7), 'penalty', 'h3', { infringement: 'foulPlay' }),
    tally('home', H1(8), 'penalty', 'h4'), // offence skipped
    tally('away', H1(9), 'freeKick'),
    tally('home', H1(10), 'turnover', 'h9', { cause: 'knockOn' }),
    tally('home', H1(11), 'turnover', undefined, { cause: 'forwardPass' }),
    tally('away', H1(12), 'turnover', 'a12', { cause: 'knockOn' }),
    tally('home', H1(13), 'entry'),
    tally('home', H1(14), 'offload', 'h12'),
    tryA('home', H1(15), 'h11', 'h12'),
    ...endAt(2400), ...endAt(2400),
  ];
  const records = toRecords(log);
  test('the reducer stores each tally with its offence / cause; tallies never change the score', () => {
    const s = run(log, ALL_ON);
    const t = s.events.filter((e) => e.type === 'tally');
    assert.deepEqual(t.map((e) => [e.side, e.tally, e.playerId, e.infringement ?? e.cause]), [
      ['away', 'penalty', 'a7', 'offside'], ['away', 'penalty', undefined, 'offside'], ['home', 'penalty', 'h3', 'foulPlay'], ['home', 'penalty', 'h4', undefined],
      ['away', 'freeKick', undefined, undefined], ['home', 'turnover', 'h9', 'knockOn'], ['home', 'turnover', undefined, 'forwardPass'], ['away', 'turnover', 'a12', 'knockOn'],
      ['home', 'entry', undefined, undefined], ['home', 'offload', 'h12', undefined],
    ]);
    assert.deepEqual([s.home, s.away], [5, 0]);
    const bad = run([tally('home', H1(1), 'penalty', 'h3', { infringement: 'dance' }), tally('home', H1(2), 'entry', 'h3')], ALL_ON);
    assert.equal(bad.events[0].infringement, undefined, 'an unknown offence is dropped');
    assert.equal(bad.events[1].playerId, undefined, 'a 22 entry is the team\'s');
  });
  test('credits: penalty → penaltiesGivenAway, turnover → turnoversConceded, offload → offloads; 22 entries none (round 2: a named free kick → freeKicksConceded)', () => {
    assert.deepEqual(eventCredits({ type: 'tally', tally: 'penalty', playerId: 'a7' }).first?.stats, { penaltiesGivenAway: 1 });
    assert.deepEqual(eventCredits({ type: 'tally', tally: 'turnover', playerId: 'h9' }).first?.stats, { turnoversConceded: 1 });
    assert.deepEqual(eventCredits({ type: 'tally', tally: 'offload', playerId: 'h12' }).first?.stats, { offloads: 1 });
    assert.deepEqual(eventCredits({ type: 'tally', tally: 'entry', playerId: 'h1' }), {});
    // round 2 (founder): free kicks credit a player (optional) — was {} (team only)
    assert.deepEqual(eventCredits({ type: 'tally', tally: 'freeKick', playerId: 'h1' }).first?.stats, { freeKicksConceded: 1 });
    assert.equal(eventCredits({ type: 'tally', tally: 'freeKick' }).first, undefined, 'a team free kick credits nobody');
  });
  test('statTotals = live sums on every prefix; tracked keys read 0 for everyone else', () => {
    const t = assertContract(SPORT, records, { every: 1 });
    assert.equal(t.a7.stats.penaltiesGivenAway, 1);
    assert.equal(t.h3.stats.penaltiesGivenAway, 1);
    assert.equal(t.h9.stats.turnoversConceded, 1);
    assert.equal(t.h12.stats.offloads, 1);
    assert.equal(t.h12.stats.tryAssists, 1);
    assert.deepEqual([t.h11.stats.offloads, t.h11.stats.turnoversConceded, t.h11.stats.penaltiesGivenAway], [0, 0, 0], 'tracked → 0, not "not tracked"');
    assert.equal('tackles' in t.h11.stats, false, 'detail was not tracked');
  });
  test('only the switched-on toggles own their keys', () => {
    // no-false-zeros NZI11: switched on with none recorded owns nothing (was: offloads 0)
    const s = run(log.filter((a) => a.type !== 'TALLY'), { trackOffloads: true });
    const t = rugbyTotals(s);
    assert.equal('offloads' in t.h11.stats, false);
    assert.equal('turnoversConceded' in t.h11.stats, false);
    assert.equal('penaltiesGivenAway' in t.h11.stats, false);
    assert.equal(tallyTracked(s, 'trackOffloads'), false);
    assert.equal(tallyTracked(s, 'trackTurnovers'), false);
    const s2 = run(log.filter((a) => a.type !== 'TALLY' || a.payload?.kind === 'offload'), { trackOffloads: true });
    assert.equal(rugbyTotals(s2).h11.stats.offloads, 0, 'one recorded → 0 for the others');
    assert.equal(tallyTracked(s2, 'trackOffloads'), true);
  });
  test('box: PC, OL, TC columns when tracked; unnamed penalties / turnovers land on the Team row', () => {
    const s = run(log, ALL_ON);
    const d = rugbyBox(s).data('all');
    const table = buildBoxTable(rugbyStats, d, { scope: 'all' });
    const keys = table.columns.map((c) => c.key);
    for (const k of ['penaltiesGivenAway', 'offloads', 'turnoversConceded']) assert.ok(keys.includes(k), k);
    assert.ok(!keys.includes('tackles'), 'detail columns stay hidden');
    assert.equal(d.away.team?.stats.penaltiesGivenAway, 1, 'the team penalty');
    assert.equal(d.home.team?.stats.turnoversConceded, 1, 'the unnamed forward pass');
    assert.equal(table.away.rows.find((r) => r.playerId === 'a7')!.cells[keys.indexOf('penaltiesGivenAway')], '1');
  });
  test('the key-moments timeline leaves tallies out; correction rows and Undo name them', () => {
    const s = run(log, ALL_ON);
    assert.ok(!rugbyTimeline(s).some((r) => r.kind === 'tally'));
    assert.deepEqual(describeEvent(nameRow(s.events[0], VIEWER)), { icon: '⚖', label: 'Penalty conceded', detail: 'A7 · Offside' });
    assert.equal(rugbyUndoLabel({ type: 'TALLY', prev: run(log.slice(0, 2), ALL_ON), next: run(log.slice(0, 3), ALL_ON) }, VIEWER), 'Penalty conceded · A7');
    assert.equal(rugbyUndoLabel({ type: 'POSSESSION', prev: s, next: s }), 'possession switch');
  });
});

/* --------------------------------- the sheet --------------------------------- */

describe('deep wave · the broadcast stats sheet', () => {
  test('possession and territory: time-weighted on the playing clock, by half', () => {
    const s = run([
      ballA('POSSESSION', 'home', H1(0)), ballA('TERRITORY', 'away', H1(5)), ballA('POSSESSION', 'away', H1(10)),
      ballA('POSSESSION', 'away', H1(12)), // the same side again: no switch
      ballA('POSSESSION', 'home', H1(20)), ballA('TERRITORY', 'home', H1(20)),
      ...endAt(2400),
    ], { trackPossession: true });
    assert.equal(s.ball?.length, 5);
    assert.equal(currentBall(s, 'poss'), 'home');
    assert.deepEqual(ballTime(s, 'poss'), { home: 1800, away: 600, from: 0 });
    assert.deepEqual(ballTime(s, 'terr'), { home: 1200, away: 900, from: 300 });
    const sh = rugbySheet(s);
    assert.deepEqual([row(sh, 'possession', 'possession')?.home, row(sh, 'possession', 'possession')?.away], ['75%', '25%']);
    assert.deepEqual([row(sh, 'possession', 'territory')?.home, row(sh, 'possession', 'territory')?.away], ['57%', '43%']);
    assert.equal(sh.sections.find((x) => x.key === 'possession')?.note, "Time on the playing clock from the scorer's taps.");
    assert.ok(rugbySheet(s, 1).sections.some((x) => x.key === 'possession'));
    // live: the running switch counts up to now; a late start says so
    const live = run([ballA('POSSESSION', 'away', H1(10)), ballA('POSSESSION', 'home', H1(20))], { trackPossession: true });
    assert.deepEqual(ballTime(live, 'poss', 'all', 1800), { home: 600, away: 600, from: 600 });
    assert.equal(rugbySheet(live, 'all', 1800).sections.find((x) => x.key === 'possession')?.note, "Time on the playing clock from the scorer's taps (from 10').");
    // the switch carries across half-time (playing time only)
    const two = run([ballA('POSSESSION', 'home', H1(30)), ...endAt(2400), ballA('POSSESSION', 'away', H2(50))], { trackPossession: true });
    assert.deepEqual(ballTime(two, 'poss', 2, 3600), { home: 600, away: 600, from: 2400 });
    // toggle on but nothing tapped: no rows
    assert.equal(rugbySheet(run([], { trackPossession: true })).sections.some((x) => x.key === 'possession'), false);
  });
  test('22 entries and points per entry (house definition: until the next entry or the end of the half; a try is an entry)', () => {
    const s = run([
      tally('home', H1(2), 'entry'),
      tryA('home', H1(3), 'h11'), kickA('home', H1(3), 'conv', true, 'h10'), // 7 from entry 1
      tally('away', H1(10), 'entry'), kickA('away', H1(11), 'pen', true, 'a10'), // 3
      tally('home', H1(20), 'entry'), // nothing from it
      tryA('away', H1(25), 'a11'), // an entry by itself (none tapped): 5
      kickA('home', H1(30), 'pen', true, 'h10'), // away's entry is open: not home's
      ...endAt(2400),
      kickA('home', H2(45), 'pen', true, 'h10'), // a new half: no entry open
      tally('home', H2(50), 'entry'), kickA('home', H2(51), 'drop', true, 'h10'), // 3
      ...endAt(2400),
    ], { trackEntries: true });
    assert.deepEqual([s.home, s.away], [16, 8]);
    assert.deepEqual(entryFigures(s), { home: { entries: 3, points: 10, scoring: 2 }, away: { entries: 2, points: 8, scoring: 2 } });
    assert.deepEqual(entryFigures(s, 1).home, { entries: 2, points: 7, scoring: 1 });
    const sh = rugbySheet(s);
    assert.equal(row(sh, 'attack', 'entries')?.home, '3');
    assert.deepEqual([row(sh, 'attack', 'pointsPerEntry')?.home, row(sh, 'attack', 'pointsPerEntry')?.away], ['3.3', '4.0']);
    assert.equal(row(sh, 'attack', 'scoringEntries')?.away, '2');
    assert.match(sh.sections.find((x) => x.key === 'attack')!.note!, /until the next entry or the end of the half/);
    assert.equal(row(rugbySheet(s, 1), 'attack', 'pointsPerEntry')?.home, '3.5');
  });
  test('discipline: penalties by offence, free kicks, cards, sin-bin time served', () => {
    const s = run([
      xi('home'), xi('away'),
      tally('away', H1(5), 'penalty', 'a7', { infringement: 'offside' }), tally('away', H1(6), 'penalty', undefined, { infringement: 'offside' }),
      tally('home', H1(7), 'penalty', 'h3', { infringement: 'foulPlay' }), tally('home', H1(8), 'penalty', 'h4'),
      tally('away', H1(9), 'freeKick'),
      cardA('away', H1(10), 'yellow', 'a4'), cardA('away', H1(15), 'red', 'a4', { second: true }), // served 5 minutes
      cardA('home', H1(35), 'yellow', 'h6'), // 5 minutes in H1, 5 in H2
      ...endAt(2400), ...endAt(2400),
    ], { trackPenalties: true });
    const sh = rugbySheet(s);
    assert.deepEqual([row(sh, 'discipline', 'penaltiesConceded')?.home, row(sh, 'discipline', 'penaltiesConceded')?.away], ['2', '2']);
    assert.equal(row(sh, 'discipline', 'penaltiesConceded')?.lowerBetter, true);
    assert.equal(row(sh, 'discipline', 'freeKicks')?.away, '1');
    assert.deepEqual(sh.sections.find((x) => x.key === 'offences')!.rows.map((r) => [r.label, r.home, r.away]), [['Offside', '0', '2'], ['High tackle / foul play', '1', '0']]);
    assert.deepEqual([row(sh, 'discipline', 'yellowCards')?.away, row(sh, 'discipline', 'redCards')?.away], ['2', '1'], 'the second yellow counts as a yellow too');
    assert.deepEqual([sinBinTime(s, 'home'), sinBinTime(s, 'home', 1), sinBinTime(s, 'home', 2), sinBinTime(s, 'away')], [600, 300, 300, 300]);
    assert.deepEqual([row(sh, 'discipline', 'sinBin')?.home, row(sh, 'discipline', 'sinBin')?.away], ['10:00', '5:00']);
  });
  test('turnovers conceded by cause; set piece with steals; detail rows only when tracked', () => {
    const s = run([
      tally('home', H1(10), 'turnover', 'h9', { cause: 'knockOn' }), tally('home', H1(11), 'turnover', undefined, { cause: 'forwardPass' }),
      tally('away', H1(12), 'turnover', 'a12', { cause: 'knockOn' }), tally('home', H1(13), 'turnover'),
      pieceA('home', H1(14), 'lineout', true), pieceA('home', H1(15), 'lineout', false), pieceA('away', H1(16), 'scrum', false),
      detailA('home', H1(17), 'tackle', 'h7'), detailA('home', H1(18), 'tackle', 'h7'), detailA('home', H1(19), 'tackle', 'h8'), detailA('home', H1(20), 'missedTackle', 'h7'),
    ], { trackTurnovers: true, trackDetail: true });
    const sh = rugbySheet(s);
    assert.deepEqual(sh.sections.find((x) => x.key === 'turnovers')!.rows.map((r) => [r.key, r.home, r.away]),
      [['turnoversConceded', '3', '1'], ['cause:knockOn', '1', '1'], ['cause:forwardPass', '1', '0']]);
    assert.equal(row(sh, 'setPiece', 'lineouts')?.home, '1/2 (50%)');
    assert.equal(row(sh, 'setPiece', 'lineoutSteals')?.away, '1');
    assert.equal(row(sh, 'setPiece', 'scrums')?.away, '0/1 (0%)');
    assert.equal(row(sh, 'setPiece', 'scrumSteals')?.home, '1');
    assert.equal(row(sh, 'defence', 'tackleSuccess')?.home, '3/4 (75%)');
    assert.equal(row(sh, 'defence', 'tackles')?.away, '0', 'tracked: a true 0');
    // no-false-zeros NZI11: carries were never recorded → no row (was: '0')
    assert.equal(row(sh, 'attack', 'carries'), undefined);
  });
  test('scoring rows and points by half on the Overall view only', () => {
    const s = run(MATCH);
    const sh = rugbySheet(s);
    assert.deepEqual([row(sh, 'scoring', 'points')?.home, row(sh, 'scoring', 'points')?.away], ['14', '3']);
    assert.equal(row(sh, 'scoring', 'penaltyTries')?.home, '1');
    assert.equal(row(sh, 'scoring', 'conversions')?.home, '1/1 (100%)');
    assert.equal(row(sh, 'scoring', 'penGoals')?.away, '0/1 (0%)');
    assert.equal(row(sh, 'scoring', 'goalKicking')?.away, '0/1 (0%)');
    assert.deepEqual(sh.sections.find((x) => x.key === 'byPeriod')!.rows.map((r) => [r.label, r.home, r.away]), [['1st half', '7', '3'], ['2nd half', '7', '0']]);
    assert.ok(!rugbySheet(s, 2).sections.some((x) => x.key === 'byPeriod'));
    assert.equal(row(rugbySheet(s, 2), 'scoring', 'points')?.home, '7');
  });
});

/* ------------------------------- the commentary ------------------------------ */

describe('deep wave · commentary grouped by half, newest first', () => {
  const s = run(MATCH);
  const feed = rugbyCommentary(s, NAMES, VIEWER);
  test('groups newest first with the half summary', () => {
    assert.deepEqual(feed.map((g) => g.title), ['2nd half', '1st half']);
    assert.equal(feed[1].sub, 'Points 7–3 · Tries 1–0');
    assert.deepEqual(feed.map((g) => g.scope), [2, 1]);
  });
  test('lines newest first, rugby minutes, running score, half-time and full-time', () => {
    const h1 = feed[1].lines;
    assert.equal(h1[0].text, 'Half-time — Lions 7–3 Wolves.');
    assert.equal(h1[0].key, true);
    const tryLine = h1[h1.length - 1];
    assert.deepEqual([tryLine.when, tryLine.text, tryLine.score], ["5'", 'TRY! H11 scores for Lions, assisted by H10.', '5–0']);
    assert.deepEqual([h1[h1.length - 2].text, h1[h1.length - 2].score], ['Conversion by H10 is good.', '7–0']);
    const miss = h1.find((l) => l.text.startsWith('Penalty goal attempt'))!;
    assert.deepEqual([miss.text, miss.score, miss.key], ['Penalty goal attempt by A10 (Wolves) misses.', undefined, undefined]);
    assert.equal(h1.find((l) => l.tags?.includes('card'))!.text, 'Yellow card: H6 (Lions) — 10 minutes in the sin-bin.');
    const drop = h1.find((l) => l.text.startsWith('DROP GOAL'))!;
    assert.deepEqual([drop.when, drop.text, drop.score], ["40+1'", 'DROP GOAL! A10 drops a goal for Wolves.', '7–3']);
    const h2 = feed[0].lines;
    assert.equal(h2[0].text, 'Full time — Lions 14–3 Wolves.');
    assert.deepEqual(h2.map((l) => l.text).slice(1), [
      'Red card: A7 (Wolves) — sent off.',
      'Replacement for Lions: H16 on for H1.',
      'Wolves lose their lineout — Lions steal it.',
      'PENALTY TRY to Lions — 7 points, no conversion.',
    ]);
    assert.equal(h2[h2.length - 1].score, '14–3');
  });
  test('filters: key moments, scores, set piece; scope narrows to a half; tag chips only for what is there', () => {
    const key = filterFeed(feed, { tag: 'key' }).flatMap((g) => g.lines.map((l) => l.text));
    assert.ok(key.includes('Half-time — Lions 7–3 Wolves.') && key.includes('Red card: A7 (Wolves) — sent off.'));
    assert.ok(!key.some((t) => t.startsWith('Penalty goal attempt') || t.startsWith('Replacement')));
    assert.deepEqual(filterFeed(feed, { tag: 'set' }).flatMap((g) => g.lines.map((l) => l.text)), ['Wolves lose their lineout — Lions steal it.']);
    assert.equal(filterFeed(feed, { tag: 'score' }).flatMap((g) => g.lines).length, 5);
    assert.deepEqual(filterFeed(feed, { scope: 1 }).map((g) => g.title), ['1st half']);
    assert.deepEqual(feedTags(feed, RUGBY_FEED_TAGS).map((t) => t.key), ['key', 'score', 'card', 'set', 'sub']);
  });
  test('a correction re-derives the feed (removing the try)', () => {
    const id = s.events.find((e) => e.type === 'try')!.id;
    const f = rugbyCommentary(reducer(s, { type: 'REMOVE_EVENT', payload: { id } }), NAMES, VIEWER);
    const h1 = f.find((g) => g.title === '1st half')!.lines;
    assert.equal(h1.find((l) => l.text.startsWith('Conversion'))!.score, '2–0');
    assert.equal(h1[0].text, 'Half-time — Lions 2–3 Wolves.');
  });
  test('extra time, sudden death and the kicking competition', () => {
    const level = [tryA('home', H1(5), 'h11'), tryA('away', H1(9), 'a11'), ...endAt(2400), ...endAt(2400)];
    const et = run(level, { decider: 'et' });
    const f = rugbyCommentary(et, NAMES);
    assert.equal(f[0].lines[0].text, 'End of normal time — Lions 5–5 Wolves. Extra time follows.');
    let sd = [...endAt(600), ...endAt(600)].reduce(reducer, et);
    assert.equal(rugbyCommentary(sd, NAMES)[0].lines[0].text, 'End of extra time — Lions 5–5 Wolves. Sudden death follows.');
    assert.deepEqual(rugbyCommentary(sd, NAMES).map((g) => g.title).slice(0, 2), ['Extra time · 2nd half', 'Extra time · 1st half']);
    sd = reducer(reducer(sd, { type: 'CLOCK', payload: { run: true, at: 1 } }), { ...kickA('home', [6100, 5, 100], 'drop', true, 'h10'), payload: { ...kickA('home', [6100, 5, 100], 'drop', true, 'h10').payload, at: 101_000 } });
    const g = rugbyCommentary(sd, NAMES);
    assert.equal(g[0].title, 'Sudden death · first score wins');
    assert.equal(g[0].lines[0].text, 'Full time — Lions win it in sudden death: Lions 8–5 Wolves.');
    let k = run(level, { decider: 'kicks' });
    assert.equal(rugbyCommentary(k, NAMES)[0].lines[0].text, 'Full time — Lions 5–5 Wolves. Level — a kicking competition decides it.');
    k = reducer(k, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    for (const [side, scored] of [['away', true], ['home', false], ['away', true], ['home', false], ['away', true], ['home', false]] as const) {
      k = reducer(k, { type: 'SO', side, payload: { scored }, ...(side === 'away' ? { attribution: { playerId: 'a10', playerName: 'A10', stat: 'soTaken' } } : {}) });
    }
    const kf = rugbyCommentary(k, NAMES);
    assert.equal(kf[0].title, 'Kicking competition');
    assert.equal(kf[0].lines.length, 7);
    assert.equal(kf[0].lines[0].text, 'Wolves win the kicking competition 3–0.');
    assert.deepEqual([kf[0].lines[1].text, kf[0].lines[1].score], ['Lions miss.', '0–3']);
    assert.equal(kf[0].lines[6].text, 'A10 (Wolves) kicks it over.');
  });
  test('sentences for the new captures, cards and replacements', () => {
    const e = (x: Partial<RugbyEvent>) => ({ id: 'x', sec: 0, psec: 0, period: 1, side: 'home', ...x }) as RugbyEvent;
    const t = (x: Partial<RugbyEvent>) => sentence(s, e(x), NAMES);
    assert.equal(t({ type: 'tally', tally: 'penalty', playerName: 'Rao', infringement: 'notReleasing' }).text, 'Penalty conceded by Rao (Lions) — not releasing.');
    assert.deepEqual(t({ type: 'tally', tally: 'penalty' }).tags, ['disc']);
    assert.equal(t({ type: 'tally', tally: 'freeKick' }).text, 'Free kick against Lions.');
    assert.equal(t({ type: 'tally', tally: 'turnover', cause: 'kickOut' }).text, 'Turnover conceded by Lions — kicked out on the full.');
    assert.equal(t({ type: 'tally', tally: 'entry' }).text, 'Lions get into the Wolves 22.');
    assert.equal(t({ type: 'tally', tally: 'offload', playerName: 'Rao' }).text, 'Offload by Rao (Lions).');
    assert.equal(t({ type: 'detail', detail: 'lineBreak', playerName: 'Rao' }).text, 'Line break by Rao (Lions).');
    assert.equal(t({ type: 'card', card: 'red', second: true, red20: true, playerName: 'Singh' }).text,
      'Second yellow for Singh (Lions) — 20-minute red card, off for the match; Lions may bring on a replacement after 20 minutes.');
    assert.equal(t({ type: 'card', card: 'yellow', official: 'Coach' }).text, 'Yellow card to Coach (Lions official).');
    assert.equal(t({ type: 'sub', temp: 'hia', playerName: 'Rao', secondName: 'Khan' }).text, 'HIA: Rao off for a head injury assessment, Khan on for Lions (temporary).');
    assert.equal(t({ type: 'setpiece', piece: 'scrum', won: true }).text, 'Lions win their scrum.');
    assert.equal(t({ type: 'kick', kick: 'pen', made: true, playerName: 'Khan' }).text, 'Penalty goal by Khan (Lions) is good.');
  });
});

/* --------------------------- schema, career, settings -------------------------- */

describe('deep wave · schema, career, live settings', () => {
  test('schema stays valid; new keys keyed, turnovers conceded lower-better; box columns', () => {
    assert.deepEqual(validateSchema(rugbyStats), []);
    const def = (k: string) => rugbyStats.stats.find((x) => x.key === k)!;
    assert.equal(def('offloads').coverage, 'keyed');
    assert.equal(def('turnoversConceded').coverage, 'keyed');
    assert.equal(def('turnoversConceded').format?.better, 'lower');
    const cols = rugbyStats.box![0].columns.map((c) => c.key);
    assert.ok(cols.includes('offloads') && cols.includes('turnoversConceded'));
  });
  test('career rows only for matches that tracked them', () => {
    const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'rugby', stats } as unknown as StatLine);
    const career = careerSections(rugbyStats, [line({ points: 5, tries: 1, offloads: 3, turnoversConceded: 1 }, 1), line({ points: 0, tries: 0, offloads: 2, turnoversConceded: 0 }, 2), line({ points: 10, tries: 2 }, 3)]);
    const rows = career.flatMap((x) => x.rows);
    assert.equal(rows.find((r) => r.key === 'offloads')?.value, '5');
    assert.equal(rows.find((r) => r.key === 'turnoversConceded')?.value, '1');
    const none = careerSections(rugbyStats, [line({ points: 5, tries: 1 }, 1)]);
    assert.equal(none.flatMap((x) => x.rows).some((r) => r.key === 'offloads' || r.key === 'turnoversConceded'), false, 'untracked rows are hidden');
  });
  test('live settings carry the toggles in one "Stats to track" row; config replay owns them', () => {
    const r = RUGBY_LIVE_SETTINGS.read(init({ trackEntries: true }));
    assert.equal(r.trackEntries, true);
    assert.equal(r.trackPenalties, false);
    assert.equal(r.trackDetail, false);
    assert.equal(RUGBY_LIVE_SETTINGS.fields.filter((f) => f.group === 'Stats to track').length, 8); // invasion batch 6: + Tries ruled out, Penalty options & 50:22
    assert.equal(RUGBY_LIVE_SETTINGS.mode, 'config');
    assert.equal('trackEntries' in init({ trackEntries: false }), false, 'off = absent (an old match\'s state shape)');
  });
});
