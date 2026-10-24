/**
 * Deep wave (court-team) — basketball at broadcast depth:
 *  - optional capture: shot zones (one tap per zone), fast-break tags (TAG),
 *    fouls drawn — each stamped on its play, so old logs replay identically;
 *  - derived figures: 2PM-A, points in the paint, second-chance points,
 *    points off turnovers, fast-break points, bench points, time leading;
 *  - the play-by-play commentary (period groups, newest first, running score);
 *  - the team-stats panel (categories × periods, coverage notes);
 *  - statTotals deep keys (SD-19 harness), the box columns (2PM-A / FD) and
 *    the career rows (2P%, FG% by zone, FD).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player, StatLine } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init, reducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { freeThrowAction, foulAction, lineupAction, missAction, reboundAction, scoreAction, statAction, type StatPlay } from '../src/sports/basketball/actions.ts';
import { withRosters } from '../src/sports/racketNames.ts';
import { zoneLabel, zoneBehindArc, isShotZone } from '../src/sports/basketball/events.ts';
import {
  bbCoverage, bbDeepKeys, bbDeepRows, bbDeepTotals, bbTeamFigures, benchPoints, gameOrder, possessionTags, timeLeading, mmss,
} from '../src/sports/basketball/deep.ts';
import { basketballFeed, describePlay, shotPhrase } from '../src/sports/basketball/commentary.ts';
import { basketballPanel, bbPanelPeriods } from '../src/sports/basketball/panel.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { basketballBox } from '../src/sports/boxSources.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS, statSchema } from '../src/sports/statSchemas.ts';
import { careerSections } from '../src/data/career.ts';
import { filterFeed, leadTracker, groupHeading } from '../src/sports/feedModel.ts';
import { maText, shareText, betterSide, pctOf } from '../src/sports/statPanel.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const ARJUN = P('p-arjun', 'Arjun'), BEN = P('p-ben', 'Ben'), CHEN = P('p-chen', 'Chen');
const XAVI = P('p-xavi', 'Xavi'), YUSUF = P('p-yusuf', 'Yusuf');
const HOME = [ARJUN, BEN, CHEN], AWAY = [XAVI, YUSUF];
const NAMES = { home: 'Reds', away: 'Blues' };
/** IDs-only scoring: the commentary names players by id — here, the squads' names */
const SQUADS = withRosters(undefined, HOME, AWAY);

/* the actions the controls dispatch (actions.ts — the player by id), stamped like `fire` */
const at = (a: ScoreAction, q: number, sec: number, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ ...a, payload: { ...a.payload, quarter: q, minute: Math.floor(sec / 60), sec, v: 2, ...extra } });
const make = (side: Side, p: Player | undefined, pts: number, q: number, sec: number, extra: Record<string, unknown> = {}): ScoreAction =>
  at(scoreAction(side, pts, p, { fga: true }), q, sec, extra);
const miss = (side: Side, p: Player | undefined, pts: number, q: number, sec: number, extra: Record<string, unknown> = {}): ScoreAction =>
  at(missAction(side, pts, p), q, sec, extra);
const ft = (side: Side, p: Player, made: boolean, q: number, sec: number): ScoreAction => at(freeThrowAction(side, made, p), q, sec);
const reb = (side: Side, p: Player, rt: 'off' | 'def' | undefined, q: number, sec: number): ScoreAction => at(reboundAction(side, p, rt), q, sec);
const simple = (type: StatPlay) => (side: Side, p: Player, q: number, sec: number): ScoreAction => at(statAction(side, type, p), q, sec);
const ast = simple('ASSIST'), stl = simple('STEAL'), tov = simple('TURNOVER');
const foul = (side: Side, p: Player, q: number, sec: number, foulType: 'personal' | 'shooting' | 'offensive' = 'personal', o: { fdt?: boolean; drawnBy?: Player } = {}): ScoreAction =>
  at(foulAction(side, p, foulType, o), q, sec);
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);

const DEEP = { periodMinutes: 10, regPeriods: 4, trackMisses: true, foulsForBonus: 4, techIsTeamFoul: true, gameClock: true, trackZones: true, trackFastBreak: true, trackFoulsDrawn: true };
const FIVE: ScoreAction[] = [lineupAction('home', [ARJUN, BEN]), lineupAction('away', [XAVI])];

/** A charted game: zones on every shot, a fast break, fouls drawn. */
function deepGame(): ScoreAction[] {
  return [
    ...FIVE,
    { type: 'KICKOFF', payload: { at: 1 } },
    make('home', ARJUN, 3, 1, 30, { zone: 'c3', fbt: true }), ast('home', BEN, 1, 31), // 3-0
    miss('away', XAVI, 2, 1, 50, { zone: 'mid' }), reb('home', BEN, 'def', 1, 52),
    stl('away', YUSUF, 1, 60), make('away', YUSUF, 2, 1, 64, { zone: 'paint', fbt: true }), // 3-2 off the steal
    { type: 'TAG', side: 'away', payload: { fb: true } },
    miss('home', ARJUN, 2, 1, 90, { zone: 'paint' }), reb('home', BEN, 'off', 1, 92),
    make('home', BEN, 2, 1, 94, { zone: 'paint', fbt: true }), // 5-2 second chance
    foul('away', XAVI, 1, 95, 'shooting', { fdt: true, drawnBy: BEN }), ft('home', BEN, true, 1, 95), // and-one 6-2
    tov('home', CHEN, 1, 120), make('away', XAVI, 3, 1, 125, { zone: 'ab3', fbt: true }), // 6-5 off a turnover
    { type: 'NEXT_QUARTER' },
    { type: 'CLOCK', payload: { run: true, at: 1000 } },
    make('home', CHEN, 2, 2, 40, { zone: 'mid', fbt: true }), // 8-5 bench
    foul('home', ARJUN, 2, 41, 'personal', { fdt: true }), // drawn by nobody named
    miss('away', XAVI, 3, 2, 70, { zone: 'c3' }),
  ];
}

/* --------------------------------- capture --------------------------------- */

describe('deep wave · capture stays one tap; old logs replay identically', () => {
  test('zones / fast-break / fouls-drawn flags are on the state only when the format carries them', () => {
    const s = init({});
    assert.equal('trackZones' in s || 'trackFastBreak' in s || 'trackFoulsDrawn' in s, false);
    const d = init(DEEP);
    assert.deepEqual([d.trackZones, d.trackFastBreak, d.trackFoulsDrawn], [true, true, true]);
    assert.equal(init({ trackZones: false }).trackZones, false);
  });
  test('a zone rides on the shot; an unknown zone is dropped; old payloads keep the old event', () => {
    const s = run(init(DEEP), { type: 'KICKOFF', payload: { at: 1 } },
      make('home', ARJUN, 2, 1, 10, { zone: 'paint', fbt: true }), miss('home', ARJUN, 3, 1, 20, { zone: 'c3' }), make('home', ARJUN, 2, 1, 30, { zone: 'moon' }));
    assert.deepEqual(s.events.map((e) => [e.type, e.zone, e.fbt]), [['score', 'paint', true], ['miss', 'c3', undefined], ['score', undefined, undefined]]);
    const old = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, { type: 'SCORE', side: 'home', payload: { points: 2, quarter: 1, minute: 1 } });
    assert.deepEqual(Object.keys(old.events[0]).sort(), ['id', 'minute', 'playerName', 'points', 'quarter', 'side', 'type']);
  });
  test('TAG marks / unmarks the side\'s latest made field goal (by id too); a free throw is never tagged', () => {
    let s = run(init(DEEP), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 2, 1, 10), make('away', XAVI, 3, 1, 20), ft('home', BEN, true, 1, 25));
    s = reducer(s, { type: 'TAG', side: 'home', payload: { fb: true } });
    assert.deepEqual(s.events.map((e) => e.fb), [true, undefined, undefined]);
    s = reducer(s, { type: 'TAG', side: 'home', payload: { fb: false } });
    assert.equal(s.events[0].fb, undefined);
    s = reducer(s, { type: 'TAG', payload: { id: 2, fb: true } });
    assert.equal(s.events[1].fb, true);
    assert.equal(reducer(s, { type: 'TAG', payload: { id: 3, fb: true } }), s, 'a free throw is not a field goal');
    assert.equal(reducer(s, { type: 'TAG', side: 'home', payload: {} }), s, 'no fb flag: nothing');
  });
  test('the basket that ends a first-to-N game can still be tagged', () => {
    const cfg = { targetPoints: 3, winBy: 1, regPeriods: 1, trackFastBreak: true };
    let s = run(init(cfg), { type: 'KICKOFF', payload: { at: 1 } }, { type: 'SCORE', side: 'home', payload: { points: 2, fbt: true } }, { type: 'SCORE', side: 'home', payload: { points: 1, fbt: true } });
    assert.equal(s.ended, true);
    s = reducer(s, { type: 'TAG', side: 'home', payload: { fb: true } });
    assert.equal(s.events[1].fb, true);
    assert.equal(reducer(s, { type: 'SCORE', side: 'home', payload: { points: 2 } }), s, 'nothing else changes a finished game');
  });
  test('a foul keeps who drew it (by id); without the flag the foul is exactly as before', () => {
    const s = run(init(DEEP), { type: 'KICKOFF', payload: { at: 1 } }, foul('away', XAVI, 1, 10, 'shooting', { fdt: true, drawnBy: BEN }), foul('home', ARJUN, 1, 20));
    assert.deepEqual([s.events[0].fdt, s.events[0].drawn, s.events[0].drawnPid], [true, undefined, 'p-ben']);
    assert.equal('fdt' in s.events[1] || 'drawn' in s.events[1], false);
    // an older log stored the name beside the id; it replays as it was
    const old = reducer(init(DEEP), { type: 'FOUL', side: 'away', payload: { foulType: 'shooting', pid: 'p-xavi', fdt: true, drawn: 'Ben', drawnPid: 'p-ben' }, attribution: { playerId: 'p-xavi', stat: 'fouls', playerName: 'Xavi' } });
    assert.deepEqual([old.events[0].drawn, old.events[0].drawnPid], ['Ben', 'p-ben']);
  });
  test('zone helpers', () => {
    assert.equal(zoneLabel('c3'), 'Corner 3'); assert.equal(zoneLabel('ab3', true), 'Above-the-break 2');
    assert.equal(zoneBehindArc('paint'), false); assert.equal(zoneBehindArc('ab3'), true);
    assert.equal(isShotZone('mid'), true); assert.equal(isShotZone('x'), false);
  });
});

/* ------------------------------ derived figures ------------------------------ */

describe('deep wave · derived figures', () => {
  const s = run(init(DEEP), ...deepGame());
  test('coverage: zones charted on every shot; fast breaks and fouls drawn tracked', () => {
    const c = bbCoverage(s);
    assert.deepEqual(c.zones, { charted: 8, of: 8 });
    assert.deepEqual(c.fastBreak, { tracked: 5, of: 5 });
    assert.deepEqual(c.foulsDrawn, { tracked: 2, of: 2 });
    assert.equal(c.reboundsTyped, true); assert.equal(c.possession, true); assert.equal(c.shots, true);
  });
  test('possessions: second-chance (incl. the and-one FT), off a steal, off a turnover', () => {
    const tags = possessionTags(s);
    const byText = (side: Side, pts: number) => s.events.find((e) => e.side === side && e.type === 'score' && e.points === pts && tags.has(e.id));
    assert.deepEqual(tags.get(byText('home', 2)!.id), { second: true });
    const andOne = s.events.find((e) => e.type === 'freethrow')!;
    assert.deepEqual(tags.get(andOne.id), { second: true }, 'the and-one free throw belongs to the possession');
    assert.deepEqual(tags.get(s.events.find((e) => e.type === 'score' && e.side === 'away' && e.points === 2)!.id), { offTo: true });
    assert.deepEqual(tags.get(s.events.find((e) => e.type === 'score' && e.side === 'away' && e.points === 3)!.id), { offTo: true });
    assert.equal(tags.has(s.events.find((e) => e.pid === 'p-chen' && e.type === 'score')!.id), false, 'a new period closes every window');
  });
  test('an offensive foul is a turnover; the other side\'s play closes the window', () => {
    const g = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, foul('home', ARJUN, 1, 10, 'offensive'), miss('away', XAVI, 2, 1, 12), reb('away', YUSUF, 'off', 1, 13),
      make('away', XAVI, 2, 1, 15), make('home', BEN, 2, 1, 20));
    const t = possessionTags(g);
    assert.deepEqual(t.get(g.events[3].id), { second: true, offTo: true });
    assert.equal(t.has(g.events[4].id), false);
  });
  test('team figures: shooting by value and zone, paint / second-chance / fast-break / off-turnover points, FD', () => {
    const h = bbTeamFigures(s, 'home'), a = bbTeamFigures(s, 'away');
    assert.deepEqual([h.points, h.fgm, h.fga, h.tpm, h.tpa, h.inM, h.inA, h.ftm, h.fta], [8, 3, 4, 1, 1, 2, 3, 1, 1]);
    assert.deepEqual([a.points, a.fgm, a.fga, a.tpm, a.tpa, a.inM, a.inA], [5, 2, 4, 1, 2, 1, 2]);
    assert.deepEqual(h.zones.paint, { made: 1, att: 2, points: 2 });
    assert.deepEqual(a.zones.c3, { made: 0, att: 1, points: 0 });
    assert.deepEqual([h.paint, h.second, h.fastBreak, h.offTo, h.fd], [2, 3, 0, 0, 1]);
    assert.deepEqual([a.paint, a.second, a.fastBreak, a.offTo, a.fd], [2, 0, 2, 5, 0]);
    assert.deepEqual([h.from3, h.fromIn, h.fromFt], [3, 4, 1]);
    const q2 = bbTeamFigures(s, 'home', 2);
    assert.deepEqual([q2.points, q2.pf, q2.teamFouls], [2, 1, 1]);
  });
  test('bench points from the five set on court (else the lineup); unknown starters → null', () => {
    assert.equal(benchPoints(s, 'home', 'all'), 2); // Chen's 2
    assert.equal(benchPoints(s, 'away', 'all'), 2); // Yusuf's 2
    const noFive = run(init({}), make('home', ARJUN, 2, 1, 10));
    assert.equal(benchPoints(noFive, 'home', 'all'), null);
    assert.equal(benchPoints(noFive, 'home', 'all', { ids: ['p-ben'] }), 2);
    assert.equal(benchPoints(noFive, 'home', 'all', { ids: ['p-arjun'] }), 0);
  });
  test('time leading from the game clock (all scoring plays stamped); null without a clock', () => {
    const tl = timeLeading(s)!;
    // Q1: level 0–30, Reds lead 30–600 (never caught) · Q2 (in play): Reds lead to its last play, 70 s
    assert.deepEqual(tl, { home: 640, away: 0, tied: 30 });
    assert.equal(timeLeading(run(init({}), make('home', ARJUN, 2, 1, 10))), null);
    assert.equal(mmss(640), '10:40');
  });
  test('game order: period, then the clock second (or minute), then log order', () => {
    const g = run(init({}), { type: 'SCORE', side: 'home', payload: { points: 2, quarter: 2, minute: 1 } }, { type: 'SCORE', side: 'home', payload: { points: 2, quarter: 1, minute: 5 } },
      { type: 'SCORE', side: 'away', payload: { points: 2, quarter: 1, minute: 0, sec: 20 } });
    assert.deepEqual(gameOrder(g.events).map((e) => e.id), [3, 2, 1]);
  });
});

/* ----------------------------- statTotals / box ----------------------------- */

describe('deep wave · statTotals, box score, career', () => {
  const SP: TotalsSport<BasketballState> = {
    name: 'basketball deep', init, reducer, partial: true, config: DEEP, statTotals: basketballStatTotals,
    derived: ['minutes', 'plusMinus', 'twosMade', 'twosAtt', 'paintMade', 'paintAtt', 'midMade', 'midAtt', 'c3Made', 'c3Att', 'ab3Made', 'ab3Att', 'foulsDrawn', 'fastBreakPoints'],
    signed: ['plusMinus'],
  };
  test('deep keys: owned only when tracked, zero-filled, by id; the contract holds on every undo prefix', () => {
    const t = assertContract(SP, toRecords([...deepGame(), { type: 'END' }]), { every: 1 });
    assert.deepEqual([t['p-ben'].stats.twosMade, t['p-ben'].stats.twosAtt, t['p-ben'].stats.paintMade, t['p-ben'].stats.foulsDrawn], [1, 1, 1, 1]);
    assert.deepEqual([t['p-arjun'].stats.c3Made, t['p-arjun'].stats.c3Att, t['p-arjun'].stats.paintAtt, t['p-arjun'].stats.twosAtt], [1, 1, 1, 1]);
    assert.equal(t['p-yusuf'].stats.fastBreakPoints, 2);
    assert.equal(t['p-arjun'].stats.fastBreakPoints, 0, 'tracked: a real 0');
    assert.equal(t['p-chen'].stats.midMade, 1);
  });
  test('an untracked game owns no zone / FD / fast-break keys; 2PM without misses tracked, no 2PA', () => {
    const plain = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 2, 1, 10, { fga: undefined }), foul('away', XAVI, 1, 20));
    assert.deepEqual(bbDeepKeys(plain), ['twosMade']);
    const t = basketballStatTotals(plain);
    assert.deepEqual(Object.keys(t['p-arjun'].stats).filter((k) => /zone|paint|mid|c3|ab3|foulsDrawn|fastBreak|twosAtt/.test(k)), []);
    assert.equal(t['p-arjun'].stats.twosMade, 1);
  });
  test('half-court (3×3): no 2P / zone keys (their 1s and 2s aren\'t 5×5 shots)', () => {
    const g = run(init({ targetPoints: 21, regPeriods: 1, trackZones: true }), { type: 'KICKOFF', payload: { at: 1 } }, scoreAction('home', 2, ARJUN, { halfCourt: true, zone: 'ab3' }));
    assert.deepEqual(bbDeepKeys(g), []);
  });
  test('a credit without a resolvable id is skipped, never voiding the rest', () => {
    // an older log: the fouled player stored by a name nobody knows
    const g = run(init(DEEP), ...FIVE, { type: 'FOUL', side: 'away', payload: { foulType: 'personal', pid: 'p-xavi', fdt: true, drawn: 'Stranger' }, attribution: { playerId: 'p-xavi', stat: 'fouls', playerName: 'Xavi' } });
    assert.deepEqual(bbDeepTotals(g).lines, {});
    assert.ok(basketballStatTotals(g)['p-xavi'], 'the fouler\'s line is still there');
  });
  test('box: 2PM-A, 2P% and FD columns when tracked; the totals add up (team row included)', () => {
    const s = run(init(DEEP), ...deepGame(), make('home', undefined, 2, 2, 90, { zone: 'paint' }));
    const t = buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: HOME, awayRoster: AWAY }).data('all'));
    const cols = t.columns.map((c) => c.abbr);
    assert.ok(cols.includes('2PM-A') && cols.includes('2P%') && cols.includes('FD'), cols.join(' '));
    const cell = (side: Side, name: string, abbr: string) => t[side].rows.find((r) => r.name === name)!.cells[cols.indexOf(abbr)];
    assert.equal(cell('home', 'Arjun', '2PM-A'), '0-1');
    assert.equal(cell('home', 'Ben', 'FD'), '1');
    assert.equal(cell('home', 'Chen', 'FD'), '0', 'tracked: 0, not –');
    assert.equal(t.home.totals[cols.indexOf('2PM-A')], '3-4');
    const deep = bbDeepRows(s, 2);
    assert.deepEqual(deep.home.team, { twosMade: 1, twosAtt: 1, paintMade: 1, paintAtt: 1 });
  });
  test('box: an untracked game keeps the old columns (no 2PM-A / FD)', () => {
    const s = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 2, 1, 10, { fga: undefined }));
    const t = buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: HOME, awayRoster: AWAY }).data('all'));
    assert.ok(!t.columns.some((c) => c.abbr === '2PM-A' || c.abbr === 'FD'));
  });
  test('career: 2P%, FG% by zone and fouls drawn over the games that tracked them (coverage note)', () => {
    const line = (id: string, stats: Record<string, number>): StatLine => ({ id, matchId: id, playerId: 'p', sport: 'basketball', stats, won: true } as StatLine);
    const lines = [
      line('m1', { points: 10, fgMade: 4, fgAtt: 8, twosMade: 3, twosAtt: 6, paintMade: 2, paintAtt: 3, c3Made: 1, c3Att: 2, foulsDrawn: 3, fastBreakPoints: 4 }),
      line('m2', { points: 6, fgMade: 3, twosMade: 3 }),
      line('m3', { points: 8, fgMade: 4 }), // an older game: no deep keys
    ];
    const secs = careerSections(statSchema('basketball')!, lines);
    const row = (sec: string, key: string) => secs.find((x) => x.id === sec)?.rows.find((r) => r.key === key);
    assert.equal(row('shooting', 'twoPct')?.value, '50%');
    assert.equal(row('shooting', 'twosMA')?.value, '3-6');
    assert.equal(row('zones', 'paintPct')?.value, '67%');
    assert.equal(row('zones', 'c3Pct')?.value, '50%');
    assert.equal(row('zones', 'midPct'), undefined, 'never charted → not shown');
    assert.equal(row('discipline', 'foulsDrawn')?.value, '3');
    assert.deepEqual(row('discipline', 'foulsDrawn')?.coverage, { tracked: 1, total: 3 });
    assert.equal(row('zones', 'fastBreakPoints')?.value, '4');
  });
});

/* ------------------------------ commentary ------------------------------ */

describe('deep wave · play-by-play commentary', () => {
  const s = run(init(DEEP), ...deepGame());
  const feed = basketballFeed(s, NAMES, SQUADS);
  test('period groups, newest first, with the score at the end of each', () => {
    assert.deepEqual(feed.map((g) => g.title), ['Q2', 'Q1']);
    assert.deepEqual(feed[1].score, { home: 6, away: 5 });
    assert.equal(feed[0].live, true);
    assert.equal(groupHeading(feed[0]), 'Q2 · in play · 8–5');
  });
  test('sentences from the captured detail; assist merged; running score; game clock', () => {
    const q1 = [...feed[1].rows].reverse(); // oldest first
    assert.equal(q1[0].text, 'Arjun makes a corner 3 (assist: Ben)');
    assert.deepEqual(q1[0].score, { home: 3, away: 0 });
    assert.equal(q1[0].clock, '09:30');
    assert.ok(!q1.some((r) => r.text.startsWith('Assist')), 'the assist reads on the basket');
    assert.equal(q1[1].text, 'Xavi misses a mid-range 2-pointer');
    assert.equal(q1[2].text, 'Defensive rebound — Ben');
    assert.equal(q1[3].text, 'Yusuf steals the ball');
    assert.equal(q1[4].text, 'Yusuf makes a 2-pointer in the paint on the fast break · off a turnover');
    const second = q1.find((r) => r.text.startsWith('Ben makes'))!;
    assert.equal(second.text, 'Ben makes a 2-pointer in the paint · second chance');
    assert.equal(q1.find((r) => r.text.startsWith('Shooting foul'))!.text, 'Shooting foul on Xavi (drawn by Ben) · team foul 1');
    assert.equal(q1.find((r) => r.text.includes('free throw'))!.text, 'Ben makes free throw');
    assert.equal(q1.find((r) => r.text.startsWith('Xavi makes'))!.text, 'Xavi makes a 3-pointer above the break · off a turnover');
  });
  test('lead notes: a lead change and level scores; scoring rows marked', () => {
    const g = run(init({}), make('home', ARJUN, 2, 1, 10), make('away', XAVI, 2, 1, 20), make('away', XAVI, 3, 1, 30), make('home', ARJUN, 3, 1, 40));
    const rows = [...basketballFeed(g, NAMES, SQUADS)[0].rows].reverse();
    assert.deepEqual(rows.map((r) => r.tag), [undefined, 'Level at 2–2', 'Blues take the lead', 'Level at 5–5']);
    const g2 = run(g, make('home', BEN, 2, 1, 50), make('away', XAVI, 3, 1, 60));
    assert.equal(basketballFeed(g2, NAMES, SQUADS)[0].rows[0].tag, 'Blues take the lead');
    assert.ok(rows.every((r) => r.scoring));
  });
  test('free-throw trips are numbered; team plays read as the team; fouls count team fouls', () => {
    const g = run(init({ foulsForBonus: 1 }), foul('away', XAVI, 1, 5), foul('away', YUSUF, 1, 10, 'shooting'), ft('home', ARJUN, true, 1, 10), ft('home', ARJUN, false, 1, 10),
      { type: 'SCORE', side: 'away', payload: { points: 3, quarter: 1, minute: 1 } });
    const rows = [...basketballFeed(g, NAMES, SQUADS)[0].rows].reverse().map((r) => r.text);
    assert.deepEqual(rows, ['Personal foul on Xavi · team foul 1', 'Shooting foul on Yusuf · team foul 2, free throws', 'Arjun makes free throw 1 of 2', 'Arjun misses free throw 2 of 2', 'Blues score a 3-pointer']);
  });
  test('rows link the player by id; no lookup → an IDs-only play reads "Player", never a name', () => {
    const q1 = feed[1].rows;
    assert.ok(q1.filter((r) => r.playerName).every((r) => r.playerId?.startsWith('p-')));
    assert.ok(basketballFeed(s, NAMES).flatMap((g) => g.rows).every((r) => !/Arjun|Ben|Chen|Xavi|Yusuf/.test(r.text)));
  });
  test('describePlay / shotPhrase for the rest', () => {
    const e = (x: Record<string, unknown>) => ({ id: 1, quarter: 1, minute: 0, side: 'home', ...x }) as never;
    const s0 = init({});
    assert.equal(describePlay(s0, e({ type: 'sub', playerName: 'A', onName: 'B' }), 'Reds'), 'B checks in for A');
    assert.equal(describePlay(s0, e({ type: 'eject', playerName: 'A', reason: '2T' }), 'Reds'), 'A is disqualified (2 technical fouls)');
    assert.equal(describePlay(s0, e({ type: 'timeout' }), 'Reds'), 'Timeout — Reds');
    assert.equal(shotPhrase(1, 'paint', true), 'a 1-pointer in the paint');
    assert.equal(shotPhrase(2, 'c3', true), 'a 2-pointer from the corner');
  });
  test('filters: one period, scoring plays only', () => {
    assert.deepEqual(filterFeed(feed, { group: '2' }).map((g) => g.key), ['2']);
    assert.ok(filterFeed(feed, { scoringOnly: true }).every((g) => g.rows.every((r) => r.scoring)));
  });
  test('leadTracker: the first lead is not a change', () => {
    const t = leadTracker(NAMES);
    // 2-0 Reds lead (the first lead), level, then Blues ahead: a change (a tie in between doesn't reset it)
    assert.deepEqual([t(2, 0), t(2, 2), t(2, 4), t(5, 4)], [undefined, 'Level at 2–2', 'Blues take the lead', 'Reds take the lead']);
  });
});

/* ------------------------------- the panel ------------------------------- */

describe('deep wave · team stats panel', () => {
  const s = run(init(DEEP), ...deepGame());
  test('categories and rows (match): shooting with zones, scoring breakdown, ball, fouls', () => {
    const d = basketballPanel(s, 'all');
    assert.deepEqual(d.categories.map((c) => c.key), ['shooting', 'scoring', 'ball', 'fouls']);
    const row = (cat: string, key: string) => d.categories.find((c) => c.key === cat)!.rows.find((r) => r.key === key);
    assert.deepEqual([row('shooting', 'fg')!.home, row('shooting', 'fg')!.away], ['3-4 (75%)', '2-4 (50%)']);
    assert.equal(row('shooting', 'zone:paint')!.home, '1-2 (50%)');
    assert.deepEqual([row('scoring', 'paint')!.h, row('scoring', 'second')!.h, row('scoring', 'fastBreak')!.a, row('scoring', 'offTo')!.a], [2, 3, 2, 5]);
    assert.equal(row('scoring', 'bench')!.home, '2');
    assert.equal(row('scoring', 'timeLeading')!.home, '10:40');
    assert.equal(row('ball', 'tov')!.lowerBetter, true);
    assert.equal(row('fouls', 'fd')!.home, '1');
    assert.equal(row('scoring', 'eff')!.h, 9, 'PTS 8 + REB 2 + AST 1 − TO 1 − missed FG 1');
    assert.deepEqual(d.notes, ['Second-chance points and points off turnovers come from the order of the plays logged.']);
  });
  test('a period scope; no time leading outside the match view', () => {
    const d = basketballPanel(s, 2);
    const scoring = d.categories.find((c) => c.key === 'scoring')!;
    assert.equal(scoring.rows.some((r) => r.key === 'timeLeading'), false);
    assert.equal(d.categories.find((c) => c.key === 'fouls')!.rows.find((r) => r.key === 'teamFouls')!.label, 'Team fouls (Q2)');
    assert.deepEqual(bbPanelPeriods(s).map((p) => p.label), ['Q1', 'Q2']);
  });
  test('an untracked game: made-only shooting with a note, no zone / fast-break / FD rows (never a false 0)', () => {
    const g = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 2, 1, 10, { fga: undefined }), foul('away', XAVI, 1, 20));
    const d = basketballPanel(g, 'all');
    const keys = d.categories.flatMap((c) => c.rows.map((r) => r.key));
    assert.ok(keys.includes('fg') && !keys.some((k) => k.startsWith('zone:') || k === 'paint' || k === 'fastBreak' || k === 'fd' || k === 'second' || k === 'offTo'));
    assert.equal(d.categories[0].rows.find((r) => r.key === 'fg')!.label, 'Field goals made');
    assert.equal(d.categories.find((c) => c.key === 'scoring')!.rows.find((r) => r.key === 'eff')!.h, 2, 'no misses logged: none subtracted');
    assert.ok(d.notes.some((n) => /Track missed shots/.test(n)));
  });
  test('partial coverage says so', () => {
    const g = run(init({ trackZones: true, trackMisses: true }), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 2, 1, 10), make('home', ARJUN, 2, 1, 20, { zone: 'paint' }));
    assert.ok(basketballPanel(g, 'all').notes.includes('Shot zones charted on 1 of 2 field goals.'));
  });
  test('panel helpers', () => {
    assert.equal(maText(3, 4), '3-4 (75%)'); assert.equal(maText(0, 0), '–');
    assert.equal(shareText(6, 24), '6 (25%)'); assert.equal(pctOf(1, 3), 33);
    assert.equal(betterSide({ h: 3, a: 1, lowerBetter: true }), 'away'); assert.equal(betterSide({ h: 2, a: 2 }), null);
  });
});

/* ------------------------------ source guards ------------------------------ */

describe('deep wave · scorer UI guards', () => {
  const src = readFileSync(new URL('../src/sports/basketball/index.tsx', import.meta.url), 'utf8');
  test('the four "Stats to track" switches in the live settings; their defaults come from BB_TRACK_DEFAULTS (round 2: shot zones on, the rest off)', () => {
    for (const k of ['trackMisses', 'trackZones', 'trackFastBreak', 'trackFoulsDrawn']) assert.match(src, new RegExp(`key: '${k}'[^\\n]*default: BB_TRACK_DEFAULTS\\.${k}[^\\n]*group: 'Stats to track'`));
  });
  test('zone buttons log one SCORE / MISS with the zone; the fast-break chip dispatches TAG; fouls drawn ride on the FOUL', () => {
    assert.match(src, /score\(side, zoneValue\(b\.zone\), selected, tracking, \{ zone: b\.zone \}\)/);
    assert.match(src, /miss\(side, zoneValue\(b\.zone\), selected, b\.zone\)/);
    assert.match(src, /dispatch\(\{ type: 'TAG', side: assistFor\.side, payload: \{ fb: !assistFor\.fb \} \}\)/);
    assert.match(src, /const drawn = state\.trackFoulsDrawn \? \{ fdt: true, drawnBy \} : \{\};\s*fire\(foulAction\(side, fouler, type, drawn\)\)/);
    assert.doesNotMatch(src, /drawn: drawnBy\.fullName/, 'IDs-only: who drew it by id, never the name');
  });
  test('the live view: play-by-play, team stats (+ shot chart), box score', () => {
    assert.match(src, /<PlayFeed groups=\{basketballFeed\(s/);
    assert.match(src, /<CategoryStatsPanel periods=\{bbPanelPeriods\(s\)\}/);
    assert.match(src, /<ShotChart state=\{s\}/);
    assert.match(src, /<MatchBoxScore sport="basketball" show="box"/);
  });
});
