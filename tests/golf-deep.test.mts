/**
 * Deep wave — golf: "Stats to track" (putts, fairways, bunkers, penalties,
 * first-putt length, measured drives), the free figures from the strokes
 * (holes in one, par-3/4/5 scoring, front / back nine, bounce back), the
 * hole-by-hole commentary (stroke play and match play), the round stats panel
 * (Out / In, vs the field) and the career sections.
 *
 * Covers: SD-45 cards keep every old key; a `track` card gets keys stat by
 * stat (no false 0s); track helpers; the commentary's sentences, running
 * score, time order and field average; match-play feed + the HOLE time stamp
 * (old logs: no new key); the stats panel's rows only when tracked; careers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { standardPar72, roundStats, type GolfCard, type GolfTrackKey } from '../src/sports/golf/engine.ts';
import { cleanTrack, roundTrackOf, driveHolesOf, effectiveTrack, withTrack, stampHole, driveMeasuredOn, LEGACY_STATS_ROW } from '../src/sports/golf/track.ts';
import { golfRoundFeed, golfMatchFeed, holeStory, scoreName, toParWords, type FeedPlayer } from '../src/sports/golf/feed.ts';
import { golfStatSheet, sliceRound } from '../src/sports/golf/statSheet.ts';
import { initGolfMatch, golfMatchReducer } from '../src/sports/golf/match.ts';
import { setupMatchStrokes } from '../src/sports/golf/matchStrokes.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

const H = standardPar72(); // pars 4 4 3 5 4 4 3 4 5 | 4 4 3 5 4 4 3 4 5
const zeros = H.map(() => 0);
const N = H.length;
const card = (deltas: (number | null)[], extra: Partial<GolfCard> = {}): GolfCard =>
  ({ strokes: H.map((h, i) => (deltas[i] == null ? null : h.par + (deltas[i] as number))), ...extra });
const arr = <T,>(vals: Record<number, T>): (T | null)[] => H.map((_, i) => (i in vals ? vals[i] : null));
const T0 = Date.UTC(2026, 9, 22, 4, 0, 0);

describe('deep wave · golf roundStats', () => {
  test('free figures: holes in one, albatross, par-3/4/5 scoring, front / back nine, bounce back', () => {
    // hole 3 (par 3) ace; hole 4 (par 5) 2 = albatross; hole 1 bogey then hole 2 birdie (bounce back)
    const c = card([1, -1, -2, -3, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    const s = roundStats(c, H, zeros);
    assert.equal(s.holesInOne, 1);
    assert.equal(s.albatrosses, 1);
    assert.equal(s.eagles, 2, 'Eagles+ still counts both');
    assert.deepEqual([s.p3Holes, s.p3Strokes, s.p4Holes, s.p5Holes, s.p5Strokes], [4, 10, 10, 4, 17]);
    assert.deepEqual([s.bounceOps, s.bounceBacks], [3, 1]); // after holes 1, 10, 11
    assert.equal(s.outStrokes + s.inStrokes, s.strokes);
    assert.deepEqual([s.outStrokes, s.inStrokes], [31, 38]);
  });
  test('front / back nine only on a complete 18-hole round with no pick-up', () => {
    assert.equal('outStrokes' in roundStats(card(H.map((_, i) => (i < 17 ? 0 : null))), H, zeros), false);
    assert.equal('outStrokes' in roundStats({ strokes: H.map((h, i) => (i === 3 ? 'P' : h.par)) }, H, zeros), false);
  });
  test('an SD-45 stats-row card (no `track`) keeps every old key, exactly as before', () => {
    const c = card([0, 1, 0, 0], { putts: arr({ 0: 2, 1: 2, 2: 1, 3: 2 }), firDir: arr<'L' | 'hit' | 'R'>({ 0: 'hit', 1: 'L', 3: 'R' }), bunker: arr({ 2: true }) });
    const s = roundStats(c, H, zeros);
    for (const k of ['firLeft', 'firRight', 'scrambles', 'scrambleHoles', 'sandSaves', 'sandHoles', 'puttsGir', 'girPutted']) assert.ok(k in s, k);
    assert.deepEqual([s.girHoles, s.girHit, s.firLeft, s.firRight, s.sandSaves, s.scrambles], [4, 2, 1, 1, 1, 1]);
  });
  test('a `track` card gets its keys stat by stat: putts only → GIR + scrambling, no fairway / sand keys', () => {
    const c = card([0, 1, 0, -1], { track: ['putts'], putts: arr({ 0: 2, 1: 2, 2: 1, 3: 1 }) });
    const s = roundStats(c, H, zeros);
    assert.equal(s.girHoles, 4);
    assert.ok('scrambles' in s && 'puttsGir' in s);
    for (const k of ['firLeft', 'firRight', 'sandSaves', 'sandHoles']) assert.equal(k in s, false, k);
    assert.deepEqual([s.onePutts, s.threePutts], [2, 0]);
    assert.equal(s.girBirdies, 1); // hole 4: birdie on a green hit (3 − 1 ≤ 5 − 2)
  });
  test('fairway only → fairway keys, no derived GIR', () => {
    const c = card([0, 0], { track: ['fairway'], firDir: arr<'L' | 'hit' | 'R'>({ 0: 'L', 1: 'hit' }), putts: arr({ 0: 2, 1: 2 }) });
    const s = roundStats(c, H, zeros);
    assert.deepEqual([s.firHoles, s.firHit, s.firLeft, s.girHoles], [2, 1, 1, 0]);
    assert.equal('scrambles' in s, false);
  });
  test('first-putt buckets and measured drives (par 4 / 5 only; silly yardages ignored)', () => {
    const c = card([0, -1, 0, 0, 0], {
      track: ['putts', 'firstPutt', 'drive'],
      putts: arr({ 0: 2, 1: 1, 2: 1, 3: 3, 4: 2 }),
      firstPutt: arr({ 0: 1, 1: 1, 2: 0, 3: 3 }),
      drive: arr({ 0: 255, 1: 280, 2: 180 /* par 3 */, 3: 999, 4: 240 }),
    });
    const s = roundStats(c, H, zeros);
    assert.deepEqual([s.fp3to10, s.fp3to10Made, s.fpUnder3, s.fpUnder3Made, s.fpOver20, s.fpOver20Made, s.fp10to20], [2, 1, 1, 1, 1, 0, 0]);
    assert.deepEqual([s.drives, s.driveYds, s.longDrive], [3, 775, 280]);
    assert.equal(s.threePutts, 1);
  });
  test('first putts / drives not tracked → no keys', () => {
    const s = roundStats(card([0], { track: ['putts'], putts: arr({ 0: 2 }), firstPutt: arr({ 0: 1 }), drive: arr({ 0: 250 }) }), H, zeros);
    assert.equal('fpUnder3' in s, false);
    assert.equal('drives' in s, false);
  });
});

describe('deep wave · golf track helpers', () => {
  test('cleanTrack: known keys, standard order, first-putt brings putts', () => {
    assert.deepEqual(cleanTrack(['drive', 'firstPutt', 'bogus']), ['putts', 'firstPutt', 'drive']);
    assert.deepEqual(cleanTrack('nope'), []);
  });
  test('round setting wins over the phone; null round = the phone', () => {
    assert.deepEqual(roundTrackOf({ track: ['fairway'] }), ['fairway']);
    assert.equal(roundTrackOf({}), null);
    assert.deepEqual(effectiveTrack(null, LEGACY_STATS_ROW), ['putts', 'fairway', 'bunker', 'penalties']);
    assert.deepEqual(effectiveTrack([], ['putts']), []);
    assert.deepEqual(driveHolesOf({ driveHoles: [9, '18', 0, 9, 40] }), [9, 18]);
    assert.equal(driveMeasuredOn(H[0], []), true);
    assert.equal(driveMeasuredOn(H[2], []), false); // par 3
    assert.equal(driveMeasuredOn(H[0], [9, 18]), false);
  });
  test('withTrack: strokes-only leaves the card as it was; tracked adds arrays + a `track` union', () => {
    const c = card([0]);
    assert.equal(withTrack(c, N, []), c);
    const t = withTrack(c, N, ['fairway', 'putts']);
    assert.deepEqual(t.track, ['putts', 'fairway']);
    assert.equal(t.firDir?.length, N);
    assert.equal(t.bunker, undefined);
    const t2 = withTrack(t, N, ['bunker']);
    assert.deepEqual(t2.track, ['putts', 'fairway', 'bunker']);
  });
  test('stampHole: a time per hole; a cleared hole loses it; an unstamped card stays untouched when clearing', () => {
    const c = card([0]);
    assert.equal(stampHole(c, N, 0, null), c);
    const s = stampHole(c, N, 2, T0);
    assert.equal(s.holeAt?.[2], T0);
    assert.equal(stampHole(s, N, 2, null).holeAt?.[2], null);
  });
});

describe('deep wave · golf commentary (stroke play)', () => {
  const asha: FeedPlayer = {
    id: 'a', name: 'Asha Rao', holes: H, received: zeros,
    card: card([0, -1, -2, 1, null], {
      track: ['putts', 'fairway', 'bunker', 'firstPutt', 'drive'] as GolfTrackKey[],
      putts: arr({ 0: 2, 1: 1, 2: 0, 3: 1 }),
      firDir: arr<'L' | 'hit' | 'R'>({ 0: 'hit', 1: 'hit', 3: 'L' }),
      bunker: arr({ 3: true }),
      firstPutt: arr({ 1: 1 }),
      drive: arr({ 1: 268 }),
      holeAt: arr({ 0: T0, 1: T0 + 600_000, 2: T0 + 1_200_000, 3: T0 + 1_800_000 }),
    }),
  };
  const ravi: FeedPlayer = { id: 'r', name: 'Ravi K', holes: H, received: zeros, card: card([1, 0, 0, 2]) };
  test('words: score names and to par', () => {
    assert.deepEqual([scoreName(1, 3), scoreName(2, 5), scoreName(3, 5), scoreName(3, 4), scoreName(5, 4), scoreName(7, 4), scoreName(8, 4)],
      ['hole in one', 'albatross', 'eagle', 'birdie', 'bogey', 'triple bogey', '4 over par']);
    assert.deepEqual([toParWords(-3), toParWords(0), toParWords(2)], ['3 under', 'level par', '2 over']);
  });
  test('hole story from the captured detail', () => {
    assert.equal(holeStory(asha.card, 1, H[1]), '268-yd drive · found the fairway · green in regulation · 1 putt from 3–10 ft');
    assert.equal(holeStory(asha.card, 3, H[3]), 'Missed the fairway left · missed the green into a greenside bunker · 1 putt · sand save');
    assert.equal(holeStory(asha.card, 2, H[2]), 'Green in regulation · holed out from off the green');
    assert.equal(holeStory(ravi.card, 0, H[0]), '', 'nothing tracked → no detail line');
  });
  test('grouped by hole (newest first), the running score, the field average, the ace / eagle highlighted', () => {
    const feed = golfRoundFeed([asha, ravi], { scoring: 'stroke' });
    assert.deepEqual(feed.map((g) => g.title), ['Hole 4 · par 5', 'Hole 3 · par 3', 'Hole 2 · par 4', 'Hole 1 · par 4']);
    const h3 = feed[1];
    assert.equal(h3.subtitle, 'SI 15 · field avg 2.00');
    assert.equal(h3.items[0].text, 'Asha Rao — hole in one 1');
    assert.equal(h3.items[0].big, true);
    assert.equal(h3.items[0].score, '3 under through 3');
    assert.equal(h3.items[0].at, T0 + 1_200_000);
    assert.equal(h3.items[1].text, 'Ravi K — par 3');
    assert.equal(h3.items[1].score, '1 over through 3');
    const h4 = feed[0];
    assert.equal(h4.items[0].text, 'Asha Rao — bogey 6');
    assert.equal(h4.items[0].score, '2 under through 4');
  });
  test('one player only; Stableford points; net with a shot; a pick-up', () => {
    assert.deepEqual(golfRoundFeed([asha, ravi], { scoring: 'stroke', only: 'r' }).flatMap((g) => g.items.map((i) => i.id)), ['r-3', 'r-2', 'r-1', 'r-0']);
    const st = golfRoundFeed([ravi], { scoring: 'stableford' });
    assert.equal(st[st.length - 1].items[0].score, '1 pts through 1');
    const shot: FeedPlayer = { ...ravi, received: H.map((_, i) => (i === 0 ? 1 : 0)) };
    assert.equal(golfRoundFeed([shot], { scoring: 'stroke', net: true }).at(-1)!.items[0].text, 'Ravi K — bogey 5 (net 4)');
    assert.equal(golfRoundFeed([shot], { scoring: 'stroke', net: true }).at(-1)!.items[0].score, 'net level par through 1');
    const pu: FeedPlayer = { ...ravi, card: { strokes: H.map((h, i) => (i === 0 ? 'P' : null)) } };
    assert.equal(golfRoundFeed([pu], { scoring: 'stroke' })[0].items[0].text, 'Ravi K picked up (no return)');
  });
  test('stamped entries come first in a hole, newest first', () => {
    const late: FeedPlayer = { ...ravi, card: { ...ravi.card, holeAt: arr({ 0: T0 + 60_000 }) } };
    const h1 = golfRoundFeed([asha, late], { scoring: 'stroke' }).at(-1)!;
    assert.deepEqual(h1.items.map((i) => i.id), ['r-0', 'a-0']);
  });
});

describe('deep wave · golf match play commentary', () => {
  test('HOLE `at` stamps the hole; an old log (no at) gets no holeAt', () => {
    let s = initGolfMatch({ holes: '18' });
    s = golfMatchReducer(s, { type: 'HOLE', side: 'home', payload: { winner: 'home' } });
    assert.equal(s.holeAt, undefined);
    s = golfMatchReducer(s, { type: 'HOLE', payload: { winner: 'halved', at: T0 } });
    assert.deepEqual(s.holeAt, [null, T0]);
    s = golfMatchReducer(s, { type: 'HOLE', side: 'away', payload: { winner: 'away' } });
    assert.deepEqual(s.holeAt, [null, T0, null]);
  });
  test('sentences with strokes (score names, net), the state after each hole, newest first', () => {
    let s = initGolfMatch({ holes: '18' });
    s = golfMatchReducer(s, { type: 'SET_STROKES', payload: { strokes: setupMatchStrokes({ holes: H, homeIndex: 0, awayIndex: 0 }) } });
    s = golfMatchReducer(s, { type: 'HOLE', side: 'home', payload: { winner: 'home', home: 3, away: 4, at: T0 } });
    s = golfMatchReducer(s, { type: 'HOLE', payload: { winner: 'halved', home: 4, away: 4 } });
    s = golfMatchReducer(s, { type: 'HOLE', side: 'home', payload: { winner: 'home' } });
    const feed = golfMatchFeed(s, { home: 'Asha', away: 'Ravi' });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].title, 'Front nine');
    const [h3, h2, h1] = feed[0].items;
    assert.equal(h1.text, "Hole 1 (par 4): Asha wins with a birdie 3 to Ravi's par 4");
    assert.equal(h1.score, 'Asha 1 UP thru 1');
    assert.equal(h1.at, T0);
    assert.equal(h2.text, 'Hole 2 (par 4): halved — Asha par 4, Ravi par 4');
    assert.equal(h3.text, 'Hole 3 (par 3): Asha wins the hole');
    assert.equal(h3.score, 'Asha 2 UP thru 3');
  });
  test('dormie, the winning hole, a concession', () => {
    let s = initGolfMatch({ holes: 'front9' });
    for (let i = 0; i < 5; i++) s = golfMatchReducer(s, { type: 'HOLE', side: 'home', payload: { winner: 'home' } });
    let feed = golfMatchFeed(s, { home: 'Asha', away: 'Ravi' });
    assert.equal(feed[0].items[0].score, 'Asha wins 5&4');
    assert.equal(feed[0].items[0].icon, '🏆');
    let t = initGolfMatch({ holes: 'front9' });
    t = golfMatchReducer(t, { type: 'HOLE', side: 'home', payload: { winner: 'home' } });
    t = golfMatchReducer(t, { type: 'CONCEDE', side: 'away', payload: { at: T0 } });
    feed = golfMatchFeed(t, { home: 'Asha', away: 'Ravi' });
    assert.equal(feed[0].items[0].text, 'Ravi concedes the match (1 down thru 1)');
    assert.equal(feed[0].items[0].at, T0);
    assert.equal(t.concededAt, T0);
  });
  test('dormie wording before the end', () => {
    let s = initGolfMatch({ holes: 'front9' });
    for (let i = 0; i < 6; i++) s = golfMatchReducer(s, { type: 'HOLE', payload: { winner: i < 3 ? 'home' : 'halved' } });
    // 3 up with 3 to play = dormie 3
    assert.equal(golfMatchFeed(s, { home: 'Asha', away: 'Ravi' })[0].items[0].score, 'Asha dormie 3 thru 6');
  });
});

describe('deep wave · golf round stats panel', () => {
  const me = { card: card([0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { track: ['putts', 'fairway'] as GolfTrackKey[], putts: H.map(() => 2), firDir: H.map((h) => (h.par >= 4 ? 'hit' : null)) as GolfCard['firDir'] }), holes: H, received: zeros };
  const other = { card: card(H.map(() => 1)), holes: H, received: zeros };
  test('categories only for what was tracked; the field column beside', () => {
    const cats = golfStatSheet(me, [other]);
    assert.deepEqual(cats.map((c) => c.id), ['scoring', 'tee', 'approach', 'around', 'putting']);
    const score = cats[0].rows.find((r) => r.key === 'score')!;
    assert.deepEqual([score.home, score.away], ['72 (E)', '90.0']);
    const fir = cats[1].rows.find((r) => r.key === 'fir')!;
    assert.equal(fir.home, '14/14 (100%)');
    assert.equal(fir.away, '–', 'the other card tracked no fairways');
    assert.ok(!cats[1].rows.some((r) => r.key === 'dd'), 'no drive row when drives were not tracked');
  });
  test('a strokes-only card: scoring only (no false 0s); alone = no field column', () => {
    const cats = golfStatSheet(other, []);
    assert.deepEqual(cats.map((c) => c.id), ['scoring']);
    assert.ok(cats[0].rows.every((r) => r.away === ''));
  });
  test('Out / In slice the card', () => {
    const out = sliceRound(me, 'out');
    assert.equal(out.holes.length, 9);
    assert.equal(out.card.putts?.length, 9);
    const cats = golfStatSheet(me, [], 'in');
    assert.equal(cats[0].rows.find((r) => r.key === 'score')!.home, '36 (E)');
  });
});

describe('deep wave · golf career sections', () => {
  const line = (id: string, stats: Record<string, number>): StatLine =>
    ({ id: `l${id}`, matchId: '', eventId: id, playerId: 'p', sport: 'golf', stats, won: false, opponent: 'Club', date: '2026-10-01' } as StatLine);
  test('par scoring, nines, putting splits, drives — with coverage over older rounds', () => {
    const old = line('e1', roundStats(card(H.map(() => 0)), H, zeros));
    for (const k of ['holesInOne', 'p3Holes', 'outStrokes', 'onePutts', 'drives']) delete old.stats[k];
    for (const k of ['albatrosses', 'p3Strokes', 'p4Holes', 'p4Strokes', 'p5Holes', 'p5Strokes', 'inStrokes', 'bounceOps', 'bounceBacks']) delete old.stats[k];
    const fresh = line('e2', roundStats(card(H.map((_, i) => (i === 2 ? -1 : 0)), { track: ['putts', 'drive'], putts: H.map(() => 2), drive: arr({ 0: 250, 1: 270 }) }), H, zeros));
    const secs = Object.fromEntries(careerSections(statSchema('golf')!, [old, fresh]).map((s) => [s.id, s]));
    const row = (sec: string, label: string) => secs[sec]?.rows.find((r) => r.label === label);
    assert.equal(row('byPar', 'Par 3 scoring avg')?.value, '2.75');
    assert.deepEqual(row('byPar', 'Par 3 scoring avg')?.coverage, { tracked: 1, total: 2 });
    assert.equal(row('byPar', 'Front nine scoring avg')?.value, '35.0');
    assert.equal(row('driving', 'Driving distance (yd)')?.value, '260.0');
    assert.equal(row('driving', 'Longest drive (yd)')?.value, '270');
    assert.equal(row('putting', 'One-putt %')?.value, '0%');
    assert.equal(row('byPar', 'Holes in one'), undefined, 'hideZero');
  });
  test('the golf schema is valid', () => assert.deepEqual(validateSchema(STAT_SCHEMAS.golf), []));
});
