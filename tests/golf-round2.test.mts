/**
 * Round 2 — golf: the founder's answers to the deep wave's questions.
 *   1. A metres option (organiser, per round / tournament; default yards):
 *      drives typed and shown in metres, first-putt buckets in their metric
 *      equivalents; cards keep yards, so careers add up across rounds.
 *   2. Tournament leaders: putts per GIR, driving distance, par-3 / 4 / 5
 *      scoring averages — each with its minimum.
 *   3. Up and downs apart from scrambling, from the optional "shots from off
 *      the green" (PGA TOUR: 2 shots or fewer to hole out from there).
 * Old cards replay identically (no new key); nothing untracked reads 0.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  standardPar72, roundStats, upAndDown, distUnitOf, ydToM, mToYd, driveFromInput, driveIn, distText, puttBucketText, YARD_M, PUTT_BUCKETS,
  type GolfCard,
} from '../src/sports/golf/engine.ts';
import { cleanTrack, withTrack, trackHint, GOLF_TRACK_LABEL } from '../src/sports/golf/track.ts';
import { holeStory, golfRoundFeed, type FeedPlayer } from '../src/sports/golf/feed.ts';
import { golfStatSheet, sliceRound } from '../src/sports/golf/statSheet.ts';
import { golfLeaderCategories, GOLF_STROKE_LEADERS } from '../src/data/golfLeaders.ts';
import { categoryLeaders } from '../src/data/standings.ts';
import { minimumRows } from '../src/data/leaderMinimums.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import type { Player, StatLine } from '../src/core/types.ts';

const H = standardPar72(); // pars 4 4 3 5 4 4 3 4 5 | 4 4 3 5 4 4 3 4 5
const zeros = H.map(() => 0);
const card = (deltas: (number | null)[], extra: Partial<GolfCard> = {}): GolfCard =>
  ({ strokes: H.map((h, i) => (deltas[i] == null ? null : h.par + (deltas[i] as number))), ...extra });
const arr = <T,>(vals: Record<number, T>): (T | null)[] => H.map((_, i) => (i in vals ? vals[i] : null));
const flat = (d = 0) => H.map(() => d);

describe('round 2 · golf metres option', () => {
  test('the round unit: yards by default, metres only when the organiser says so', () => {
    assert.equal(distUnitOf(undefined), 'yd');
    assert.equal(distUnitOf({}), 'yd');
    assert.equal(distUnitOf({ distUnit: 'yd' }), 'yd');
    assert.equal(distUnitOf({ distUnit: 'm' }), 'm');
    assert.equal(distUnitOf({ distUnit: 'metres' }), 'yd', 'unknown values stay yards');
  });
  test('cards store yards: metres in → yards, and every whole metre round-trips exactly', () => {
    for (let m = 46; m <= 411; m++) assert.equal(ydToM(mToYd(m)), m, `${m} m`);
    assert.equal(driveFromInput('245', 'm'), 268); // 245 / 0.9144 = 267.9
    assert.equal(driveFromInput('268', 'yd'), 268);
    assert.equal(driveIn(268, 'm'), 245);
    assert.equal(driveIn(268, 'yd'), 268);
    assert.equal(driveFromInput('30', 'm'), null, 'out of range (under 50 yd)');
    assert.equal(driveFromInput('420', 'm'), null, '459 yd is over the 450 yd limit');
    assert.equal(driveFromInput('', 'm'), null);
    assert.equal(distText(268.4, 'm', 1), '245.4 m');
    assert.equal(distText(268, 'yd'), '268 yd');
  });
  test('first-putt buckets: the same buckets (and career keys), labelled in metres', () => {
    assert.deepEqual(PUTT_BUCKETS.map((_, k) => puttBucketText(k, 'm')), ['< 1 m', '1–3 m', '3–6 m', '6 m+']);
    assert.deepEqual(PUTT_BUCKETS.map((_, k) => puttBucketText(k, 'yd')), ['< 3 ft', '3–10 ft', '10–20 ft', '20 ft+']);
    assert.equal(puttBucketText(3, 'm', true), 'over 6 m');
    assert.equal(puttBucketText(9, 'm'), '');
    assert.match(trackHint('firstPutt', 'm'), /1–3 m/);
    assert.match(trackHint('drive', 'm'), /metres/);
    assert.equal(trackHint('putts', 'm'), GOLF_TRACK_LABEL.putts.hint);
  });
  test('roundStats keeps yards whatever the round shows (careers add up)', () => {
    const c = card(flat(), { track: ['drive'], drive: arr({ 0: driveFromInput('245', 'm') }) });
    const s = roundStats(c, H, zeros);
    assert.equal(s.driveYds, 268);
    assert.equal(s.longDrive, 268);
  });
  test('commentary and the stats panel speak the round unit', () => {
    const c = card(flat(), { track: ['putts', 'firstPutt', 'drive'], putts: arr({ 0: 2 }), firstPutt: arr({ 0: 1 }), drive: arr({ 0: 268 }) });
    assert.equal(holeStory(c, 0, H[0], 'm'), '245-m drive · green in regulation · 2 putts, first from 1–3 m');
    assert.equal(holeStory(c, 0, H[0]), '268-yd drive · green in regulation · 2 putts, first from 3–10 ft', 'yards by default (unchanged)');
    const me = { card: c, holes: H, received: zeros };
    const rows = golfStatSheet(me, [], 'all', 'm').flatMap((x) => x.rows);
    assert.equal(rows.find((r) => r.key === 'dd')?.home, '245 m');
    assert.equal(rows.find((r) => r.key === 'long')?.label, 'Longest drive (m)');
    assert.equal(rows.find((r) => r.key === 'long')?.home, '245');
    assert.equal(rows.find((r) => r.key === 'fp3to10')?.label, 'First putt holed 1–3 m');
    const yd = golfStatSheet(me, [], 'all').flatMap((x) => x.rows);
    assert.equal(yd.find((r) => r.key === 'dd')?.home, '268 yd');
    const pl: FeedPlayer = { id: 'a', name: 'Asha', card: c, holes: H, received: zeros };
    assert.match(golfRoundFeed([pl], { scoring: 'stroke', unit: 'm' }).at(-1)!.items[0].sub ?? '', /245-m drive/);
  });
});

describe('round 2 · golf up and downs (PGA TOUR definition)', () => {
  test('2 shots or fewer from off the green, whatever the score; a chance needs both counts', () => {
    assert.equal(upAndDown(1, 1), true, 'chip + one putt');
    assert.equal(upAndDown(1, 0), true, 'chip-in');
    assert.equal(upAndDown(2, 0), true, 'two shots, holed');
    assert.equal(upAndDown(2, 1), false);
    assert.equal(upAndDown(1, 2), false);
    assert.equal(upAndDown(0, 1), null, 'no shot from off the green: no chance');
    assert.equal(upAndDown(null, 1), null);
    assert.equal(upAndDown(1, null), null, 'putts not entered: not a chance');
  });
  test('the track: up and downs bring putts; the card gets its offGreen row', () => {
    assert.deepEqual(cleanTrack(['upDown']), ['putts', 'upDown']);
    assert.deepEqual(cleanTrack(['drive', 'upDown', 'bunker']), ['putts', 'bunker', 'upDown', 'drive']);
    const c = withTrack({ strokes: H.map(() => null) }, 18, ['putts', 'upDown']);
    assert.equal(c.offGreen?.length, 18);
    assert.deepEqual(c.track, ['putts', 'upDown']);
  });
  test('roundStats: chances and up and downs, apart from scrambling', () => {
    // hole 1 bogey: missed the green, chip + 2 putts (no up and down, no scramble)
    // hole 2 par: missed, chip + 1 putt (up and down AND a scramble)
    // hole 3 bogey on a par 3: missed, chip + 1 putt (up and down, NOT a scramble)
    // hole 4 birdie on a par 5: chipped in (up and down)
    const c = card([1, 0, 1, -1, ...new Array(14).fill(0)], {
      track: ['putts', 'upDown'],
      putts: H.map((_, i) => (i === 0 ? 2 : i === 1 || i === 2 ? 1 : i === 3 ? 0 : 2)),
      offGreen: arr({ 0: 1, 1: 1, 2: 1, 3: 1 }),
    });
    const s = roundStats(c, H, zeros);
    assert.equal(s.udChances, 4);
    assert.equal(s.upDowns, 3);
    assert.equal(s.scrambles, 2, 'pars 2, birdie 4 — the bogey on 3 is an up and down but no scramble');
  });
  test('no false zeros: a card not kept with up and downs gets no keys; one kept with it reads 0 of 0', () => {
    const plain = roundStats(card(flat(), { track: ['putts'], putts: flat(2) }), H, zeros);
    assert.equal('udChances' in plain, false);
    const legacy = roundStats(card(flat(), { putts: flat(2), firDir: H.map(() => 'hit' as const) }), H, zeros);
    assert.equal('udChances' in legacy, false, 'an SD-45 card replays with exactly its old keys');
    // no-false-zeros NZG7: kept with up and downs but "Off green" never entered
    // is not tracked (no keys); one entry makes the zeros real
    const kept = roundStats(card(flat(), { track: ['putts', 'upDown'], putts: flat(2) }), H, zeros);
    assert.equal('udChances' in kept, false);
    const entered = roundStats(card(flat(), { track: ['putts', 'upDown'], putts: flat(2), offGreen: arr({ 0: 2 }) }), H, zeros);
    assert.deepEqual([entered.udChances, entered.upDowns], [1, 0]);
  });
  test('the stats panel: "Up and downs" beside "Scrambling" (older cards keep their label)', () => {
    const c = card([0, 1, ...new Array(16).fill(0)], { track: ['putts', 'upDown'], putts: H.map((_, i) => (i < 2 ? 1 : 2)), offGreen: arr({ 0: 1, 1: 2 }) });
    const around = golfStatSheet({ card: c, holes: H, received: zeros }, []).find((x) => x.id === 'around')!;
    assert.deepEqual(around.rows.map((r) => [r.label, r.home]), [['Scrambling', '1/2 (50%)'], ['Up and downs', '1/2 (50%)']]);
    const old = golfStatSheet({ card: card(flat(), { track: ['putts'], putts: H.map((_, i) => (i === 0 ? 1 : 2)) }), holes: H, received: zeros }, []);
    assert.equal(old.find((x) => x.id === 'around')?.rows[0].label, 'Scrambling (up & down)');
    // the nine slice keeps the row
    assert.equal(sliceRound({ card: c, holes: H, received: zeros }, 'out').card.offGreen?.length, 9);
  });
  test('commentary: "up and down to save par", "up and down for birdie", or how many it took', () => {
    const c = card([0, -1, 1, ...new Array(15).fill(0)], { track: ['putts', 'upDown'], putts: H.map((_, i) => (i === 1 ? 0 : i === 2 ? 2 : 1)), offGreen: arr({ 0: 1, 1: 1, 2: 1 }) });
    assert.match(holeStory(c, 0, H[0]), /up and down to save par$/);
    assert.match(holeStory(c, 1, H[1]), /holed out from off the green · up and down for birdie$/);
    assert.match(holeStory(c, 2, H[2]), /1 shot from off the green, no up and down$/);
    // a card without the row keeps the old wording
    const old = card([0], { track: ['putts'], putts: arr({ 0: 1 }) });
    assert.match(holeStory(old, 0, H[0]), /saved par$/);
  });
  test('careers: "Around the green" shows up and downs once a round tracked them', () => {
    const schema = statSchema('golf')!;
    const L = (stats: Record<string, number>): StatLine => ({ id: 'x', matchId: '', eventId: 'e', playerId: 'p', sport: 'golf', stats, won: false });
    const secs = careerSections(schema, [L({ rounds: 1, udChances: 8, upDowns: 5 }), L({ rounds: 1 })]);
    const around = secs.find((x) => x.id === 'around')!;
    assert.equal(around.rows.find((r) => r.key === 'upDownPct')?.value, '63%');
    assert.equal(careerSections(schema, [L({ rounds: 1 })]).some((x) => x.id === 'around' && x.rows.length), false);
  });
});

describe('round 2 · golf tournament leaders', () => {
  const players = [{ id: 'a', fullName: 'Asha' }, { id: 'b', fullName: 'Bilal' }, { id: 'c', fullName: 'Chitra' }] as Player[];
  let n = 0;
  const L = (pid: string, stats: Record<string, number>): StatLine => ({ id: `l${++n}`, matchId: '', eventId: 'r1', playerId: pid, sport: 'golf', stats, won: false });
  test('every schema still validates', () => {
    for (const s of Object.values(STAT_SCHEMAS)) assert.deepEqual(validateSchema(s as never), [], s.sport);
  });
  test('the new categories rank with their minimums (organiser-editable)', () => {
    assert.deepEqual(minimumRows('golf').slice(3).map((r) => [r.key, r.label, r.text]), [
      ['puttsPerGir', 'Fewest putts per GIR', 'min 9 greens hit'],
      ['drivingDistance', 'Driving distance (yd)', 'min 4 drives measured'],
      ['p3Avg', 'Par 3 scoring average', 'min 8 par 3s'],
      ['p4Avg', 'Par 4 scoring average', 'min 20 par 4s'],
      ['p5Avg', 'Par 5 scoring average', 'min 8 par 5s'],
    ]);
    for (const k of ['puttsPerGir', 'drivingDistance', 'p3Avg', 'p4Avg', 'p5Avg']) assert.ok((GOLF_STROKE_LEADERS as readonly string[]).includes(k), k);
  });
  test('driving distance (highest), putts per GIR and par averages (lowest) — below the minimum is out', () => {
    const lines = [
      L('a', { rounds: 1, drives: 4, driveYds: 1000, puttsGir: 16, girPutted: 10, p3Holes: 8, p3Strokes: 26 }),
      L('b', { rounds: 1, drives: 4, driveYds: 1100, puttsGir: 15, girPutted: 9, p3Holes: 8, p3Strokes: 23 }),
      L('c', { rounds: 1, drives: 3, driveYds: 900, puttsGir: 5, girPutted: 4, p3Holes: 4, p3Strokes: 11 }),
    ];
    const cats = categoryLeaders(lines, players, 'golf');
    const top = (k: string) => cats.find((c) => c.key === k)!.leaders.map((l) => [l.name, l.display ?? String(l.value)]);
    assert.deepEqual(top('drivingDistance'), [['Bilal', '275.0'], ['Asha', '250.0']], 'Chitra measured only 3 drives');
    assert.deepEqual(top('puttsPerGir'), [['Asha', '1.60'], ['Bilal', '1.67']], 'Chitra hit only 4 greens');
    assert.deepEqual(top('p3Avg'), [['Bilal', '2.88'], ['Asha', '3.25']]);
    assert.equal(cats.some((c) => c.key === 'p4Avg'), false, 'nobody played a par 4: no category');
  });
  test('a metres tournament shows driving distance in metres (lines stay yards)', () => {
    const cats = categoryLeaders([L('a', { rounds: 1, drives: 4, driveYds: 1000 })], players, 'golf');
    const m = golfLeaderCategories(cats, { distUnit: 'm' }).find((c) => c.key === 'drivingDistance')!;
    assert.equal(m.label, 'Driving distance (m)');
    assert.equal(m.leaders[0].display, (250 * YARD_M).toFixed(1));
    const yd = golfLeaderCategories(cats, {}).find((c) => c.key === 'drivingDistance')!;
    assert.equal(yd.label, 'Driving distance (yd)');
    assert.equal(yd.leaders[0].display, '250.0');
    // stroke-play order: low round … girPct, then the round-2 figures
    const order = golfLeaderCategories([{ key: 'p5Avg' }, { key: 'drivingDistance' }, { key: 'birdies' }, { key: 'puttsPerGir' }, { key: 'holesWon' }], {}).map((c) => c.key);
    assert.deepEqual(order, ['birdies', 'puttsPerGir', 'drivingDistance', 'p5Avg']);
  });
});
