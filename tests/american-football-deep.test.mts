/**
 * Deep wave — American football at NFL Game Book / ESPN team-box depth:
 *  - FREE from the play-by-play log: drives (start, plays, net yards, time,
 *    result, how obtained, points), red zone / past-midfield trips, 3rd & 4th
 *    down, first downs by how (a TD from scrimmage counts), net passing, yards
 *    per play, punting, punt returns, longest run / reception (derived keys);
 *  - optional "Stats to track": targets (complete + the intended receiver on an
 *    incompletion), passes defended, tackles for loss; times sacked from the
 *    last passer — statTotals contract (SD-19 harness, every undo prefix),
 *    zeros only when tracked;
 *  - old logs replay identically (score-only: no new keys; play by play: only
 *    the derived longest-gain keys), score unchanged;
 *  - the broadcast sheet (sections, scopes, score-only hides play-by-play
 *    rows), the drive chart, the commentary (drive / quarter groups, lines,
 *    running score, period ends, two-minute warning, filters), the box.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, credit, buildPlay, eventCredits, creditAttribution, teamFigures, afTracked, deepKeys, AF_LIVE_SETTINGS, DEEP_KEYS,
  type AFState, type AFEvent, type Side, type TdHow, type TryKind, type Who,
} from '../src/sports/american_football/engine.ts';
import { afTotals, DERIVED_KEYS } from '../src/sports/american_football/totals.ts';
import { afBox } from '../src/sports/american_football/box.ts';
import { americanFootballStats } from '../src/sports/american_football/stats.ts';
import { afTimeline } from '../src/sports/american_football/timeline.ts';
import { afDrives, driveRows, possessionIn, resultText } from '../src/sports/american_football/drives.ts';
import { afSheet } from '../src/sports/american_football/sheet.ts';
import { afCommentary, sentence } from '../src/sports/american_football/commentary.ts';
import { filterFeed } from '../src/sports/feedGroups.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

const nm = (id: string) => id.toUpperCase();
const W = (id?: string): Who | undefined => (id ? { id, name: nm(id) } : undefined);
const NAMES = { home: 'Lions', away: 'Bears' };
let u = 0;
const at = (period: number, psec: number, len = 900) => ({ uid: `u${++u}`, period, psec, sec: (period - 1) * len + psec });
const NFL = { preset: 'nfl', variant: 'tackle', rules: 'nfl' };
const PBP = { ...NFL, mode: 'pbp' };
const td = (side: Side, t: Record<string, unknown>, how: TdHow, scorer?: string, passer?: string, yards?: number): ScoreAction =>
  ({ type: 'TD', side, payload: { how, ...(yards != null ? { yards } : {}), ...t }, ...credit({ type: 'td', how, yards, playerId: scorer, playerName: scorer && nm(scorer), ...(passer ? { secondId: passer, secondName: nm(passer) } : {}) }) });
const tryA = (side: Side, t: Record<string, unknown>, kind: TryKind, good: boolean, who?: string): ScoreAction =>
  ({ type: 'TRY', side, payload: { kind, good, ...t }, ...credit({ type: 'try', kind, good, playerId: who, playerName: who && nm(who) }) });
const fg = (side: Side, t: Record<string, unknown>, good: boolean, yards: number, kicker?: string): ScoreAction =>
  ({ type: 'FG', side, payload: { good, yards, ...t }, ...credit({ type: 'fg', good, playerId: kicker, playerName: kicker && nm(kicker) }) });
const endP = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const kick = (rec: Side, spot: number, t: Record<string, unknown>): ScoreAction => ({ type: 'PLAY', side: rec, payload: { play: 'kickoff', newSpot: spot, ...t } });

/** A log built against the running state (as the controls do). */
function builder(cfg: Record<string, unknown>) {
  const acts: ScoreAction[] = [];
  let s = init(cfg);
  const go = (a: ScoreAction) => { acts.push(a); s = reducer(s, a); return s; };
  const p = (side: Side, inp: Parameters<typeof buildPlay>[2], t: Record<string, unknown>) => go(buildPlay(s, side, inp, t));
  return { acts, go, p, get s() { return s; } };
}

/** An NFL game played by play: TD drive, punt, failed 4th down, interception,
 *  a field goal drive across the quarter break, a drive cut by half-time. */
function game(cfg: Record<string, unknown> = PBP) {
  const b = builder(cfg);
  const { go, p } = b;
  go(kick('home', 25, at(1, 0)));
  // d1 — Lions: 75 yds, TD
  p('home', { play: 'pass', yards: 15, p1: W('h1'), p2: W('h3') }, at(1, 30));
  p('home', { play: 'run', yards: 5, p1: W('h2') }, at(1, 60));
  go({ type: 'TACKLE', side: 'away', payload: at(1, 60), ...credit({ type: 'tackle', playerId: 'a6', playerName: 'A6' }) });
  p('home', { play: 'run', yards: 10, p1: W('h2') }, at(1, 90));
  p('home', { play: 'pass', yards: 20, p1: W('h1'), p2: W('h4') }, at(1, 120));
  p('home', { play: 'run', yards: 6, p1: W('h2') }, at(1, 150));
  p('home', { play: 'pass', yards: 30, p1: W('h1'), p2: W('h3') }, at(1, 180)); // 19-yd TD catch
  go(tryA('home', at(1, 180), 'kick', true, 'h11'));
  go(kick('away', 25, at(1, 200)));
  // d2 — Bears: three and out, punt
  p('away', { play: 'run', yards: 3, p1: W('a2') }, at(1, 230));
  p('away', { play: 'inc', p1: W('a1') }, at(1, 250));
  p('away', { play: 'sack', yards: -6, p1: W('a1'), p2: W('h9') }, at(1, 270));
  p('away', { play: 'punt', yards: 45, p1: W('a10'), ret: 5 }, at(1, 300));
  // d3 — Lions from their 38: fail on 4th down
  p('home', { play: 'run', yards: 2, p1: W('h2') }, at(1, 330));
  p('home', { play: 'inc', p1: W('h1') }, at(1, 350));
  p('home', { play: 'inc', p1: W('h1') }, at(1, 370));
  p('home', { play: 'run', yards: 4, p1: W('h2') }, at(1, 400));
  // d4 — Bears from their 56: interception
  p('away', { play: 'pass', yards: 10, p1: W('a1'), p2: W('a3') }, at(1, 430));
  p('away', { play: 'int', p1: W('a1'), p2: W('h8'), newSpot: 30 }, at(1, 460));
  // d5 — Lions from their 30, across the quarter break: field goal
  p('home', { play: 'run', yards: 5, p1: W('h2') }, at(1, 500));
  go(endP());
  p('home', { play: 'run', yards: 10, p1: W('h2') }, at(2, 30));
  p('home', { play: 'penalty', yards: 5, on: 'away', autoFirst: true, foul: 'Holding (defence)' }, at(2, 60));
  go({ type: 'TIMEOUT', side: 'away', payload: { ...at(2, 70), at: 0 } });
  p('home', { play: 'pass', yards: 30, p1: W('h1'), p2: W('h4') }, at(2, 100));
  p('home', { play: 'inc', p1: W('h1') }, at(2, 130));
  go({ ...fg('home', at(2, 160), true, 37, 'h11') });
  go(kick('away', 35, at(2, 180)));
  // d6 — Bears: cut by half-time
  p('away', { play: 'run', yards: 4, p1: W('a2') }, at(2, 210));
  go(endP());
  // Q3 — Lions receive; d7 in progress
  go(kick('home', 25, at(3, 0)));
  p('home', { play: 'run', yards: 3, p1: W('h2') }, at(3, 40));
  return b;
}

/* ------------------------------- old logs ---------------------------------- */

describe('deep wave · old logs replay identically', () => {
  const SCORES: ScoreAction[] = [
    td('home', at(1, 200), 'pass', 'h3', 'h1', 24), tryA('home', at(1, 200), 'kick', true, 'h11'),
    fg('away', at(1, 600), true, 42, 'a11'), td('away', at(2, 300), 'run', 'a2', undefined, 3), tryA('away', at(2, 300), 'two', false), endP(), endP(),
  ];
  test('score-only: no track flags in the state, no new keys on any line, same score', () => {
    const s = SCORES.reduce(reducer, init(NFL));
    for (const f of ['trackTargets', 'trackDefence'] as const) assert.equal(f in s, false);
    assert.deepEqual([s.home, s.away], [7, 9]);
    for (const l of Object.values(afTotals(s))) for (const k of [...DEEP_KEYS, 'rushLong', 'recLong']) assert.equal(k in l.stats, false, k);
    assert.deepEqual(deepKeys(s), []);
  });
  test('play by play (old): no tracked-capture keys; only the derived longest-gain keys appear', () => {
    const s = game().s;
    assert.deepEqual([s.home, s.away], [10, 0]);
    const t = afTotals(s);
    for (const l of Object.values(t)) for (const k of ['targets', 'passDef', 'tfl']) assert.equal(k in l.stats, false, k);
    assert.equal(t.h2.stats.rushLong, 10);
    assert.equal(t.h3.stats.recLong, 19, 'the touchdown catch');
    assert.equal('rushLong' in t.h3.stats, false, 'only players with a carry');
  });
  test('an old sack (no quarterback on it) credits nobody new; a new one names the last passer', () => {
    const old = eventCredits({ type: 'play', play: 'sack', yards: -6, secondId: 'h9' });
    assert.equal(old.first, undefined);
    assert.deepEqual(old.second?.stats, { sacks: 1 });
    const s = game().s;
    assert.deepEqual([afTotals(s).a1.stats.timesSacked, afTotals(s).a1.stats.sackYdsLost], [1, 6]);
    assert.equal(afTotals(s).h1.stats.timesSacked, 0, 'once a sack names the QB, every line reads 0');
  });
  test('an unknown play or a PASS_DEF without a side is ignored', () => {
    const s = reducer(reducer(init(PBP), { type: 'PLAY', side: 'home', payload: { play: 'dance' } }), { type: 'PASS_DEF', payload: {} });
    assert.equal(s.events.length, 0);
  });
});

/* -------------------------------- drives ----------------------------------- */

describe('deep wave · drives from the play-by-play log', () => {
  const s = game().s;
  const { drives } = afDrives(s);
  test('segmentation: offence, start, plays, net yards, result, how obtained', () => {
    assert.deepEqual(drives.map((d) => [d.off, d.start, d.plays, d.yards, d.result ?? 'live', d.obtained]), [
      ['home', 25, 6, 75, 'td', 'kickoff'],
      ['away', 25, 3, -3, 'punt', 'kickoff'],
      ['home', 38, 4, 6, 'downs', 'punt'],
      ['away', 56, 2, 10, 'int', 'downs'],
      ['home', 30, 4, 50, 'fg', 'int'],
      ['away', 35, 1, 4, 'half', 'kickoff'],
      ['home', 25, 1, 3, 'live', 'kickoff'],
    ]);
  });
  test('points, first downs, red zone, time on the clock', () => {
    assert.deepEqual(drives.map((d) => d.points), [7, 0, 0, 0, 3, 0, 0]);
    assert.deepEqual(drives.map((d) => d.firstDowns), [4, 0, 0, 1, 3, 0, 0]);
    assert.deepEqual(drives.map((d) => d.redZone), [true, false, false, false, true, false, false]);
    assert.equal(drives[0].endSec - drives[0].startSec, 180, 'kickoff at 0 → TD at 3:00');
    assert.equal(drives[4].endSec - drives[4].startSec, 900 + 160 - 460, 'from the interception to the kick, across the quarter break');
    assert.equal(drives[4].period, 1);
    assert.equal(drives[4].endPeriod, 2);
  });
  test('the drive chart: newest first, "Q1 · Lions", how obtained · start · plays, yards, time', () => {
    const rows = driveRows(s, NAMES);
    assert.equal(rows.length, 7);
    assert.equal(rows[6].title, 'Q1 · Lions');
    assert.equal(rows[6].result, 'Touchdown');
    assert.equal(rows[6].detail, 'Kickoff · Own 25 · 6 plays, 75 yds, 3:00');
    assert.equal(rows[4].detail, 'Punt · Own 38 · 4 plays, 6 yds, 1:40');
    assert.equal(rows[1].result, 'End of half');
    assert.equal(rows[0].result, 'In progress');
  });
  test('a turnover returned for a touchdown stays with the drive; its try too', () => {
    const b = builder(PBP);
    b.go({ type: 'SET_DRIVE', payload: { off: 'home', spot: 40 } });
    b.p('home', { play: 'int', p1: W('h1'), p2: W('a8') }, at(1, 30));
    b.go(td('away', at(1, 35), 'int', 'a8', undefined, 60));
    b.go(tryA('away', at(1, 35), 'kick', true, 'a11'));
    const log = afDrives(b.s);
    assert.equal(log.drives.length, 1);
    assert.equal(resultText(b.s, log.drives[0]), 'Interception · returned for a TD');
    const ids = b.s.events.map((e) => log.driveOf.get(e.id));
    assert.deepEqual(ids, [0, 0, 0]);
    assert.equal(log.drives[0].points, 0, 'the defence scored, not the drive');
  });
  test('flag: past midfield instead of a red zone; a failed series is "downs"; no kickoffs', () => {
    const b = builder({ preset: 'flag', mode: 'pbp' });
    b.go({ type: 'SET_DRIVE', payload: { off: 'home', spot: 5 } });
    b.p('home', { play: 'pass', yards: 22, p1: W('h1'), p2: W('h2') }, at(1, 30, 1200)); // own 5 → 27: past midfield, 1st & Goal
    b.p('home', { play: 'inc', p1: W('h1') }, at(1, 50, 1200));
    b.p('home', { play: 'inc', p1: W('h1') }, at(1, 70, 1200));
    b.p('home', { play: 'run', yards: 3, p1: W('h3') }, at(1, 90, 1200));
    b.p('away', { play: 'run', yards: 4, p1: W('a3') }, at(1, 120, 1200));
    const d = afDrives(b.s).drives;
    assert.deepEqual(d.map((x) => [x.off, x.start, x.result ?? 'live', x.redZone]), [['home', 5, 'downs', true], ['away', 5, 'live', false]]);
  });
  test('Kansas overtime: each possession is a drive from the 10; a failed 4th down ends the game', () => {
    const b = builder({ preset: 'nfhs', variant: 'tackle', rules: 'nfhs', decider: 'kansas', mode: 'pbp' });
    b.go(td('home', at(1, 10, 720), 'run', 'h2')); b.go(tryA('home', at(1, 10, 720), 'kick', true));
    b.go(td('away', at(1, 20, 720), 'run', 'a2')); b.go(tryA('away', at(1, 20, 720), 'kick', true));
    for (let i = 0; i < 4; i++) b.go(endP());
    b.go({ type: 'OT_FIRST', payload: { first: 'home' } });
    b.p('home', { play: 'run', yards: 4, p1: W('h2') }, at(5, 0, 720));
    b.p('home', { play: 'run', yards: 6, p1: W('h2') }, at(5, 0, 720));
    b.go(tryA('home', at(5, 0, 720), 'kick', true, 'h11'));
    for (let i = 0; i < 4; i++) b.p('away', { play: 'inc', p1: W('a1') }, at(5, 0, 720));
    assert.ok(b.s.ended);
    const d = afDrives(b.s).drives;
    assert.deepEqual(d.map((x) => [x.off, x.start, x.result, x.points]), [['home', 90, 'td', 7], ['away', 90, 'downs', 0]]);
    assert.equal(driveRows(b.s, NAMES)[1].detail, 'Overtime · Opp 10 · 2 plays, 10 yds');
    const f = afCommentary(b.s, NAMES);
    assert.equal(f[0].title, 'OT · Bears possession');
    assert.equal(f[0].lines[0].text, 'Final (OT) — Lions 14–7 Bears.');
    assert.equal(f[0].lines[1].text, '4th & Goal at Opp 10 — A1 pass incomplete. Turnover on downs.');
  });
  test('a score-only game has no drives', () => {
    assert.equal(afDrives([td('home', at(1, 10), 'run', 'h2')].reduce(reducer, init(NFL))).drives.length, 0);
  });
});

/* ------------------------------ team figures -------------------------------- */

describe('deep wave · team figures and the broadcast sheet', () => {
  const s = game().s;
  const H = teamFigures(s, 'home'), A = teamFigures(s, 'away');
  test('first downs by how (the TD catch counts), plays, 3rd / 4th down, turnovers', () => {
    assert.deepEqual([H.firstDowns, H.firstRush, H.firstPass, H.firstPen], [7, 2, 4, 1]);
    assert.deepEqual([H.passComp, H.passAtt, H.rushAtt, H.plays], [4, 7, 8, 15]);
    assert.deepEqual([H.thirdConv, H.thirdAtt, H.fourthConv, H.fourthAtt], [0, 1, 0, 1]);
    assert.deepEqual([A.thirdConv, A.thirdAtt, A.sacked, A.sackYds, A.intThrown, A.turnovers], [0, 1, 1, 6, 1, 1]);
    assert.deepEqual([A.punts, A.puntYds, H.puntRets, H.puntRetYds], [1, 45, 1, 5]);
  });
  test('sections and rows (whole game)', () => {
    const sh = afSheet(s, 'all', 3 * 900 + 40);
    const keys = sh.sections.map((x) => x.key);
    assert.deepEqual(keys, ['overview', 'passing', 'rushing', 'eff', 'turnovers', 'penalties', 'scoring', 'kicking', 'drives', 'other']);
    const row = (sec: string, key: string) => sh.sections.find((x) => x.key === sec)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('overview', 'firstDowns').home, row('overview', 'firstPen').home], ['7', '1']);
    assert.equal(row('overview', 'totalYards').home, String(H.totalYards));
    assert.equal(row('overview', 'ypp').home, (H.totalYards / H.plays).toFixed(1));
    assert.equal(row('passing', 'cmpAtt').home, '4/7 (57%)');
    assert.deepEqual([row('passing', 'sacked').away, row('passing', 'netPass').away], ['1–6', '4']);
    assert.equal(row('eff', 'third').home, '0/1 (0%)');
    assert.equal(row('eff', 'fourth').home, '0/1 (0%)');
    assert.equal(row('eff', 'redZone').home, '1/2 (50%)');
    assert.equal(row('eff', 'redZone').label, 'Red zone — TDs / trips');
    assert.equal(row('kicking', 'fg').home, '1/1 (100%)');
    assert.equal(row('kicking', 'fgLong').home, '37');
    assert.equal(row('kicking', 'puntAvg').away, '45.0');
    assert.equal(row('kicking', 'puntRetYds').home, '5');
    assert.deepEqual([row('drives', 'drives').home, row('drives', 'avgStart').home, row('drives', 'ptsPerDrive').home], ['4', 'Own 30', '2.50']);
    assert.equal(row('penalties', 'penalties').away, '1');
    assert.ok(row('overview', 'top').home.includes(':'));
  });
  test('a quarter scope narrows rows and drives (drives that started in it)', () => {
    const q2 = afSheet(s, 2);
    const row = (sec: string, key: string) => q2.sections.find((x) => x.key === sec)?.rows.find((r) => r.key === key);
    assert.equal(row('overview', 'firstDowns')?.home, '3');
    assert.equal(row('drives', 'drives')?.away, '1', 'the Bears drive cut by half-time started in Q2');
    assert.equal(row('drives', 'drives')?.home, '0', 'the FG drive started in Q1');
    const t = possessionIn(s, 2);
    assert.equal(t.home + t.away, 900, 'the whole quarter is someone\'s ball');
  });
  test('score-only: scoring, kicking and timeouts only — never a false 0', () => {
    const t = [td('home', at(1, 200), 'pass', 'h3', 'h1', 24), tryA('home', at(1, 200), 'kick', true, 'h11'), fg('away', at(1, 600), false, 48, 'a11')].reduce(reducer, init(NFL));
    const sh = afSheet(t);
    assert.deepEqual(sh.sections.map((x) => x.key), ['scoring', 'kicking', 'other']);
    const k = sh.sections.find((x) => x.key === 'kicking')!;
    assert.deepEqual(k.rows.map((r) => r.key), ['fg', 'xp']);
    assert.equal(k.rows[0].away, '0/1 (0%)');
  });
  test('flag: past midfield, conversions, no kicking section', () => {
    const b = builder({ preset: 'flag', mode: 'pbp' });
    b.go({ type: 'SET_DRIVE', payload: { off: 'home', spot: 5 } });
    b.p('home', { play: 'pass', yards: 25, p1: W('h1'), p2: W('h2') }, at(1, 30, 1200));
    b.p('home', { play: 'run', yards: 25, p1: W('h3') }, at(1, 60, 1200));
    b.go(tryA('home', at(1, 60, 1200), 'two', true, 'h2'));
    const sh = afSheet(b.s);
    assert.ok(!sh.sections.some((x) => x.key === 'kicking'));
    const eff = sh.sections.find((x) => x.key === 'eff')!;
    assert.equal(eff.rows.find((r) => r.key === 'redZone')!.label, 'Past midfield — TDs / trips');
    assert.ok(eff.note);
    assert.equal(sh.sections.find((x) => x.key === 'scoring')!.rows.find((r) => r.key === 'twoPt')!.home, '1/1 (100%)');
    assert.ok(!eff.rows.some((r) => r.key === 'fourth'), 'flag has no 4th down');
  });
});

/* ----------------------------- the commentary ------------------------------- */

describe('deep wave · commentary grouped by drive, newest first', () => {
  const s = game().s;
  const feed = afCommentary(s, NAMES);
  test('drive groups with the summary; newest first', () => {
    assert.equal(feed[0].title, 'Q3 · Lions drive');
    assert.equal(feed[0].sub, 'Own 25 · 1 play, 3 yds, 0:40 · In progress');
    const d1 = feed[feed.length - 1];
    assert.equal(d1.title, 'Q1 · Lions drive');
    assert.equal(d1.sub, 'Own 25 · 6 plays, 75 yds, 3:00 · Touchdown');
    assert.equal(d1.side, 'home');
  });
  test('lines: kickoff opens the drive, down & distance, 1st downs, tackles join, TD with the score, the try', () => {
    const d1 = [...feed[feed.length - 1].lines].reverse();
    assert.equal(d1[0].text, 'Kickoff — Lions ball at Own 25.');
    assert.equal(d1[1].text, '1st & 10 at Own 25 — H1 pass complete to H3 for 15 yds (1st down).');
    assert.equal(d1[1].when, '14:30');
    assert.equal(d1[2].text, '1st & 10 at Own 40 — H2 runs for 5 yds. Tackle by A6.');
    const tdLine = d1.find((l) => l.text.includes('TOUCHDOWN'))!;
    assert.equal(tdLine.text, '2nd & 4 at Opp 19 — TOUCHDOWN Lions! H3 19-yd pass from H1.');
    assert.equal(tdLine.score, '6–0');
    assert.equal(d1[d1.length - 1].text, 'Extra point by H11 is good.');
    assert.equal(d1[d1.length - 1].score, '7–0');
  });
  test('punts, sacks, failed 4th down, interceptions, penalties, timeouts, the field goal', () => {
    const all = feed.flatMap((g) => g.lines.map((l) => l.text));
    assert.ok(all.includes('3rd & 7 at Own 28 — A1 sacked by H9 for a loss of 6 yds.'));
    assert.ok(all.includes('4th & 13 at Own 22 — A10 punts 45 yds, returned 5 yds — Lions ball at Own 38.'));
    assert.ok(all.includes('4th & 8 at Own 40 — H2 runs for 4 yds. Turnover on downs.'));
    assert.ok(all.includes('1st & 10 at Opp 34 — A1 pass intercepted by H8 — Lions ball at Own 30.'));
    assert.ok(all.includes('1st & 10 at Own 45 — Penalty on Bears — Holding (defence), 5 yds (1st down).'));
    assert.ok(all.includes('Timeout, Bears (2 left).'));
    assert.ok(all.includes('2nd & 10 at Opp 20 — H11 37-yd field goal is good.'));
  });
  test('period ends sit in the drive they interrupt; half-time; the score on them', () => {
    const fgDrive = feed.find((g) => g.sub?.endsWith('Field goal'))!;
    assert.ok(fgDrive.lines.some((l) => l.text === 'End of the 1st quarter — Lions 7–0 Bears.'));
    const half = feed.flatMap((g) => g.lines).find((l) => l.id === 'end2')!;
    assert.equal(half.text, 'Half-time — Lions 10–0 Bears.');
    assert.equal(half.score, '10–0');
  });
  test('filters: key moments, scoring, turnovers, penalties, passing, rushing; quarter scope', () => {
    const ids = (tag: string) => filterFeed(feed, { tag }).flatMap((g) => g.lines.map((l) => l.text));
    assert.equal(ids('score').length, 3);
    assert.ok(ids('turnover').some((t) => t.includes('intercepted')) && ids('turnover').some((t) => t.includes('Turnover on downs')));
    assert.equal(ids('penalty').length, 1);
    assert.ok(ids('pass').every((t) => /pass|Sack|sacked/.test(t)));
    assert.ok(ids('rush').every((t) => /runs|Run|run\./.test(t)));
    assert.ok(ids('key').some((t) => t.startsWith('Half-time')));
    assert.deepEqual(filterFeed(feed, { scope: 2 }).map((g) => g.title), ['Q2 · Bears drive']);
  });
  test('the two-minute warning line', () => {
    const t = reducer(reducer(init(PBP), endP()), { type: 'TWO_MIN', payload: { at: 0 } });
    const f = afCommentary(reducer(t, endP()), NAMES);
    const line = f.flatMap((g) => g.lines).find((l) => l.id === 'twomin2')!;
    assert.deepEqual([line.when, line.text], ['2:00', 'Two-minute warning.']);
  });
  test('score-only: grouped by quarter with the points in it; final line', () => {
    const t = [
      td('home', at(1, 200), 'pass', 'h3', 'h1', 24), tryA('home', at(1, 200), 'kick', true, 'h11'),
      fg('away', at(2, 600), true, 42, 'a11'), endP(), endP(),
      td('away', at(3, 100), 'int', 'a9', undefined, 35), tryA('away', at(3, 100), 'two', false), endP(), endP(),
    ].reduce(reducer, init(NFL));
    const f = afCommentary(t, NAMES);
    assert.deepEqual(f.map((g) => g.title), ['4th quarter', '3rd quarter', '2nd quarter', '1st quarter']);
    assert.equal(f[3].sub, 'Points 7–0');
    assert.equal(f[3].lines[2].text, 'TOUCHDOWN Lions! H3 24-yd pass from H1.');
    assert.equal(f[1].lines.find((l) => l.text.includes('interception'))!.text, 'TOUCHDOWN Bears! A9 35-yd interception return.');
    assert.equal(f[1].lines.find((l) => l.text.includes('2-point'))!.text, '2-point conversion fails.');
    assert.equal(f[0].lines[0].text, 'Final — Lions 7–9 Bears.');
  });
  test('a correction re-derives the feed (removing the touchdown)', () => {
    const id = s.events.find((e) => e.type === 'td')!.id;
    const t = reducer(s, { type: 'REMOVE_EVENT', payload: { id } });
    const f = afCommentary(t, NAMES);
    assert.equal(f.flatMap((g) => g.lines).find((l) => l.text.includes('field goal is good'))!.score, '4–0', 'the try and the field goal');
  });
  test('sentences: flag sack wording, safety, incompletion with a target, breakups, tackles for loss', () => {
    const flag = init({ preset: 'flag', mode: 'pbp' });
    const e = (x: Partial<AFEvent>) => ({ id: 'x', sec: 0, psec: 0, period: 1, side: 'home', ...x }) as AFEvent;
    assert.equal(sentence(flag, e({ type: 'play', play: 'sack', yards: -4, playerName: 'Rao', secondName: 'Khan' }), NAMES)!.text,
      'Sack of Rao — flag pulled behind the line by Khan for a loss of 4 yds.');
    assert.equal(sentence(s, e({ type: 'safety', side: 'away', playerName: 'Khan' }), NAMES)!.text, 'Safety! Bears score 2 (Khan).');
    assert.equal(sentence(s, e({ type: 'play', play: 'inc', playerName: 'Rao', secondName: 'Das', tgt: true }), NAMES)!.text, 'Rao pass incomplete intended for Das.');
    const b = builder({ ...PBP, trackTackles: true, trackDefence: true, trackTargets: true });
    b.go({ type: 'SET_DRIVE', payload: { off: 'home', spot: 30 } });
    b.p('home', { play: 'inc', p1: W('h1'), p2: W('h4'), tgt: true }, at(1, 10));
    b.go({ type: 'PASS_DEF', side: 'away', payload: at(1, 10), ...credit({ type: 'pd', playerId: 'a4', playerName: 'A4' }) });
    b.p('home', { play: 'run', yards: -2, p1: W('h2') }, at(1, 30));
    b.go({ type: 'TACKLE', side: 'away', payload: { ...at(1, 30), tfl: true }, ...credit({ type: 'tackle', tfl: true, playerId: 'a5', playerName: 'A5' }) });
    const lines = afCommentary(b.s, NAMES)[0].lines.map((l) => l.text);
    assert.deepEqual(lines, [
      '2nd & 10 at Own 30 — H2 runs for a loss of 2 yds. Tackle for loss by A5.',
      '1st & 10 at Own 30 — H1 pass incomplete intended for H4. Broken up by A4.',
    ]);
  });
});

/* -------------------------- optional capture ------------------------------- */

const TRACK = { ...PBP, trackTackles: true, trackTargets: true, trackDefence: true };
const SPORT: TotalsSport<AFState> = { name: 'american_football deep', init, reducer, statTotals: afTotals, partial: false, derived: DERIVED_KEYS, config: TRACK };

function trackedLog(): ScoreAction[] {
  const b = builder(TRACK);
  b.go(kick('home', 25, at(1, 0)));
  b.p('home', { play: 'pass', yards: 12, p1: W('h1'), p2: W('h3'), tgt: true }, at(1, 20));
  b.go({ type: 'TACKLE', side: 'away', payload: at(1, 20), ...credit({ type: 'tackle', playerId: 'a6', playerName: 'A6' }) });
  b.p('home', { play: 'sack', yards: -7, p1: W('h1'), p2: W('a9') }, at(1, 40));
  b.p('home', { play: 'inc', p1: W('h1'), p2: W('h4'), tgt: true }, at(1, 60));
  b.go({ type: 'PASS_DEF', side: 'away', payload: at(1, 60), ...credit({ type: 'pd', playerId: 'a4', playerName: 'A4' }) });
  b.p('home', { play: 'run', yards: -3, p1: W('h2') }, at(1, 80));
  b.go({ type: 'TACKLE', side: 'away', payload: { ...at(1, 80), tfl: true }, ...credit({ type: 'tackle', tfl: true, playerId: 'a5', playerName: 'A5' }) });
  b.p('home', { play: 'punt', yards: 40, p1: W('h10') }, at(1, 110));
  b.p('away', { play: 'inc', p1: W('a1') }, at(1, 130)); // no target named
  b.p('away', { play: 'pass', yards: 70, p1: W('a1'), p2: W('a3'), tgt: true }, at(1, 150)); // a 67-yd touchdown catch
  b.go(tryA('away', at(1, 150), 'kick', true, 'a11'));
  return b.acts;
}

describe('deep wave · optional capture: targets, passes defended, tackles for loss, times sacked', () => {
  const log = trackedLog();
  const s = log.reduce(reducer, init(TRACK));
  test('the state carries the toggles only when on; events carry the marks', () => {
    assert.equal(s.trackTargets, true);
    assert.equal(s.trackDefence, true);
    assert.equal(s.events.filter((e) => e.tgt).length, 3, 'the pass, the targeted incompletion, the TD catch');
    assert.equal(s.events.find((e) => e.type === 'td')!.tgt, true);
    assert.equal(s.events.filter((e) => e.type === 'pd').length, 1);
    assert.equal(s.events.filter((e) => e.tfl).length, 1);
    assert.equal(afTracked(s, 'trackTargets'), true);
  });
  test('credits: target on a complete / intended pass; PD; TFL with the tackle; the sacked QB', () => {
    assert.deepEqual(eventCredits({ type: 'play', play: 'pass', yards: 12, playerId: 'h1', secondId: 'h3', tgt: true }).second?.stats, { rec: 1, recYds: 12, targets: 1 });
    assert.deepEqual(eventCredits({ type: 'play', play: 'pass', yards: 12, playerId: 'h1', secondId: 'h3' }).second?.stats, { rec: 1, recYds: 12 }, 'not marked → no target');
    assert.deepEqual(eventCredits({ type: 'play', play: 'inc', playerId: 'h1', secondId: 'h4', tgt: true }).second?.stats, { targets: 1 });
    assert.equal(eventCredits({ type: 'play', play: 'inc', playerId: 'h1', secondId: 'h4' }).second, undefined);
    assert.deepEqual(eventCredits({ type: 'pd', playerId: 'a4' }).first?.stats, { passDef: 1 });
    assert.deepEqual(eventCredits({ type: 'tackle', playerId: 'a5', tfl: true }).first?.stats, { tackles: 1, tfl: 1 });
    const a = credit({ type: 'play', play: 'sack', yards: -7, playerId: 'h1', secondId: 'a9' }, 'home');
    assert.deepEqual([a.attribution?.stat, a.attribution?.extra, a.attribution2?.side], ['timesSacked', { sackYdsLost: 7 }, 'away']);
  });
  test('statTotals = live sums on every prefix; tracked keys read 0 for everyone else', () => {
    const t = assertContract(SPORT, toRecords(log));
    assert.deepEqual([t.h3.stats.targets, t.h3.stats.rec, t.h4.stats.targets, t.a3.stats.targets], [1, 1, 1, 1]);
    assert.deepEqual([t.a4.stats.passDef, t.a5.stats.tfl, t.a5.stats.tackles, t.a6.stats.tfl], [1, 1, 1, 0]);
    assert.deepEqual([t.h1.stats.timesSacked, t.h1.stats.sackYdsLost, t.a9.stats.sacks], [1, 7, 1]);
    assert.deepEqual([t.h10.stats.targets, t.h10.stats.passDef], [0, 0], 'tracked → 0, not "not tracked"');
    assert.equal(t.a3.stats.recLong, 67);
    assert.equal(t.a1.stats.passAtt, 2);
  });
  test('only the switched-on toggles own their keys', () => {
    const t = afTotals([kick('home', 25, at(1, 0)), ...log.slice(1, 3)].reduce(reducer, init({ ...PBP, trackTargets: true })));
    assert.equal('targets' in t.h3.stats, true);
    assert.equal('passDef' in t.h3.stats, false);
    const d = afTotals([kick('home', 25, at(1, 0))].reduce(reducer, init({ ...PBP, trackDefence: true })));
    assert.deepEqual(d, {}, 'no lines yet');
    const tk = init({ ...PBP, trackDefence: true });
    assert.deepEqual(deepKeys(tk), ['passDef'], 'no tackles asked → no TFL key');
    assert.deepEqual(deepKeys(init({ ...PBP, trackDefence: true, trackTackles: true })), ['passDef', 'tfl']);
  });
  test('box: TGT, PD, TFL, SKD, YPC, RLNG… only when tracked; flag has no kicking columns', () => {
    const table = buildBoxTable(americanFootballStats, afBox(s).data('all'));
    const cols = table.columns.map((c) => c.abbr);
    for (const k of ['TGT', 'PD', 'TFL', 'SKD', 'YPC', 'RLNG', 'RCLNG', 'PUNT', 'PNYDS', 'PAVG', 'FR']) assert.ok(cols.includes(k), k);
    const h1 = table.home.rows.find((r) => r.playerId === 'h1')!;
    assert.equal(h1.cells[cols.indexOf('SKD')], '1-7');
    const old = buildBoxTable(americanFootballStats, afBox(game().s).data('all')).columns.map((c) => c.abbr);
    for (const k of ['TGT', 'PD', 'TFL']) assert.ok(!old.includes(k), `${k} hidden when untracked`);
    const flag = builder({ preset: 'flag', mode: 'pbp' });
    flag.go({ type: 'SET_DRIVE', payload: { off: 'home', spot: 5 } });
    flag.p('home', { play: 'run', yards: 4, p1: W('h2') }, at(1, 30, 1200));
    const fc = buildBoxTable(americanFootballStats, afBox(flag.s).data('all')).columns.map((c) => c.abbr);
    assert.ok(!fc.includes('FG') && !fc.includes('XP') && !fc.includes('PUNT'));
  });
  test('career rows and leaders: hidden when untracked; longest run is a max', () => {
    const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'american_football', stats } as unknown as StatLine);
    const career = careerSections(americanFootballStats, [line({ points: 0, rushAtt: 5, rushYds: 40, rushLong: 22, targets: 4, rec: 3, recYds: 30 }, 1), line({ points: 6, rushAtt: 3, rushYds: 9, rushLong: 31 }, 2)]);
    const rows = career.flatMap((x) => x.rows);
    assert.equal(rows.find((r) => r.key === 'rushLong')?.value, '31');
    assert.equal(rows.find((r) => r.key === 'targets')?.value, '4');
    const none = careerSections(americanFootballStats, [line({ points: 6, touchdowns: 1 }, 1)]).flatMap((x) => x.rows);
    assert.ok(!none.some((r) => ['targets', 'passDef', 'tfl', 'timesSacked'].includes(r.key)), 'untracked rows are hidden');
    for (const k of ['rec', 'tfl', 'passDef']) assert.ok(americanFootballStats.leaders.includes(k as never), k);
  });
  test('schema stays valid; live settings carry the toggles; timeline leaves breakups out', () => {
    assert.deepEqual(validateSchema(americanFootballStats), []);
    const r = AF_LIVE_SETTINGS.read(init({ ...PBP, trackTargets: true }));
    assert.equal(r.trackTargets, true);
    assert.equal(r.trackDefence, false);
    assert.equal(AF_LIVE_SETTINGS.fields.filter((f) => f.group === 'Stats to track').length, 3);
    assert.ok(!afTimeline(s).some((x) => x.kind === 'pd' || x.kind === 'tackle'));
  });
  test('undo of a breakup / tackle for loss reverses exactly its credits', () => {
    const pd = s.events.find((e) => e.type === 'pd')!;
    const cr = eventCredits(pd);
    assert.deepEqual(creditAttribution(cr.first, -1), { playerId: 'a4', stat: 'passDef', by: -1, playerName: 'A4' });
    const tfl = s.events.find((e) => e.tfl)!;
    assert.deepEqual(creditAttribution(eventCredits(tfl).first, -1)?.extra, { tfl: -1 });
  });
});
