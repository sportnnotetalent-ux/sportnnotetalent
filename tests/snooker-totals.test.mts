/**
 * Snooker `statTotals` (src/sports/snooker/totals.ts) against the SD-19
 * contract (tests/statTotalsHarness.mts), and the career schema it feeds
 * (src/sports/snooker/stats.ts).
 *
 * Nothing is credited live in snooker (the controls send no attribution): the
 * totals own every key, all of them derived from the replayed state, and a
 * side's figures go to its one player (ctx.players). Checked: a clean log and
 * every prefix (undo), determinism, derived keys finite and ≥ 0, AMEND
 * corrections equal the clean match, quick-mode lines carry no break keys
 * ("not tracked", never 0), and the career rows.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertContract, assertSameAsClean, amendRecord, toRecords, replay, type TotalsSport } from './statTotalsHarness.mts';
import { snookerScript, SINGLES_CTX } from './cue-script.mts';
import * as S from '../src/sports/snooker/engine.ts';
import { snookerStatTotals, snookerSideRecord, SNOOKER_RECORD_KEYS, SNOOKER_SHOT_KEYS } from '../src/sports/snooker/totals.ts';
import { statSchema, STAT_SCHEMAS, lineKeys } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import type { StatLine } from '../src/core/types.ts';

const sp = (config: Record<string, unknown> = {}, ctx = SINGLES_CTX): TotalsSport<S.SnookerState> => ({
  name: 'snooker', init: S.createInitialState, reducer: S.reducer as never, statTotals: snookerStatTotals, config, ctx, derived: () => true,
});

/** best of 3, 15 reds: a 147, then a conceded frame with a foul and a safety */
function maxMatch() {
  const m = snookerScript({ bestOf: 3 });
  m.clearance(); // frame 1: home 147-0
  // frame 2: away breaks
  m.pot('red', 'black').miss(); // away 8
  m.safety(); // home
  m.foul({ value: 4, kind: 'inOff' }); // away fouls: 4 to home
  m.pot('red', 'pink', 'red', 'black', 'red', 'blue').miss(); // home 21 → 25
  m.concede('away');
  return m;
}

describe('the contract (clean log, every undo prefix, determinism, derived ≥ 0)', () => {
  test('a maximum and a concession', () => {
    const m = maxMatch();
    assert.equal(m.state.ended, true);
    const t = assertContract(sp({ bestOf: 3 }), toRecords(m.actions), { every: 1 });
    assert.deepEqual(t.h1, {
      side: 'home',
      stats: {
        framesWon: 2, framesLost: 0, points: 172, pointsAgainst: 8,
        shotFrames: 2, highestBreak: 147, fiftyPlus: 1, centuries: 1, maximums: 1, potted: 168, pots: 42, missedPots: 1, safeties: 1, visits: 3,
        fouls: 0, foulPoints: 0, penaltyPoints: 4, foulMisses: 0, freeBalls: 0,
      },
    });
    assert.deepEqual(t.a1.stats, {
      framesWon: 0, framesLost: 2, points: 8, pointsAgainst: 172,
      shotFrames: 2, highestBreak: 8, fiftyPlus: 0, centuries: 0, maximums: 0, potted: 8, pots: 2, missedPots: 1, safeties: 0, visits: 2,
      fouls: 1, foulPoints: 4, penaltyPoints: 0, foulMisses: 0, freeBalls: 0,
    });
  });

  test('quick frames only: the record keys, no break keys (not tracked, never 0)', () => {
    const m = snookerScript({ bestOf: 3, scoringMode: 'quick' }).quick(72, 30).quick(10, 80).quick(65, 40);
    const t = assertContract(sp({ bestOf: 3, scoringMode: 'quick' }), toRecords(m.actions), { every: 1 });
    assert.deepEqual(t.h1.stats, { framesWon: 2, framesLost: 1, points: 147, pointsAgainst: 150 });
    assert.deepEqual(t.a1.stats, { framesWon: 1, framesLost: 2, points: 150, pointsAgainst: 147 });
  });

  test('mixed frames, six reds: a free ball, several reds, foul and a miss, a re-rack', () => {
    const m = snookerScript({ reds: 6, bestOf: 3 });
    m.quick(50, 20); // frame 1 quick, home
    // frame 2: away breaks
    m.reds(2).pot('black').miss(); // away 9
    m.foul({ value: 4, miss: true, freeBall: true }); // home fouls: 4 to away, free ball
    m.reds(1, true).pot('pink').miss(); // away: free ball as a red + a red (2) + pink 6 = 8 → 21
    m.rerack(); // stalemate: the frame starts again (scores nullified)
    m.pot('red', 'black', 'red', 'black').miss(); // away breaks again (the same player): 16
    m.pot('red', 'yellow').safety(); // home 3
    m.concede('home'); // 1-1
    m.quick(10, 60); // frame 3, quick: away
    assert.equal(m.state.ended, true);
    const t = assertContract(sp({ reds: 6, bestOf: 3 }), toRecords(m.actions), { every: 1 });
    assert.equal(t.a1.stats.framesWon, 2);
    assert.equal(t.a1.stats.shotFrames, 1); // only frame 2 was shot by shot
    assert.equal(t.a1.stats.highestBreak, 16); // the re-racked frame's breaks are gone (S3 R17)
    assert.equal(t.a1.stats.freeBalls, 0);
    assert.equal(t.h1.stats.fouls, 0);
    assert.equal(t.h1.stats.points, 50 + 3 + 10);
  });

  test('a re-spotted black, a penalty by the player not at the table, play again', () => {
    const m = snookerScript({ reds: 6, bestOf: 1 });
    m.pot('red', 'black', 'red', 'black', 'red', 'black').miss();
    m.pot('red', 'black', 'red', 'black', 'red', 'pink', 'yellow', 'green', 'brown', 'blue').miss();
    m.pot('pink', 'black'); // 37-37: re-spotted
    m.lots('home').foul({ value: 7, byOther: true }); // away commits a penalty on the re-spot: home wins it
    assert.equal(m.state.ended, true);
    const t = assertContract(sp({ reds: 6, bestOf: 1 }), toRecords(m.actions), { every: 1 });
    assert.deepEqual([t.h1.stats.framesWon, t.h1.stats.points, t.h1.stats.penaltyPoints], [1, 44, 7]);
    assert.equal(t.a1.stats.fouls, 1);
  });
});

describe('corrections and inputs', () => {
  test('AMEND: replace a frame score and void the last frame = the same match scored cleanly', () => {
    const m = snookerScript({ bestOf: 5, scoringMode: 'quick' }).quick(72, 30).quick(10, 80).quick(65, 40).quick(70, 1);
    const recs = toRecords(m.actions);
    const fixed = { type: 'FRAME_SCORE', payload: { home: 5, away: 90, frame: 2 } };
    const corrected = [...recs, amendRecord(recs, [{ seq: 2, op: 'replace', action: fixed }, { seq: 4, op: 'void' }])];
    const clean = toRecords([m.actions[0], fixed, m.actions[2]]);
    assertSameAsClean(sp({ bestOf: 5, scoringMode: 'quick' }), corrected, clean, 'AMEND');
    const t = snookerStatTotals(replay(sp({ bestOf: 5, scoringMode: 'quick' }), corrected), SINGLES_CTX);
    assert.deepEqual(t.h1.stats, { framesWon: 2, framesLost: 1, points: 142, pointsAgainst: 160 });
  });

  test('ctx: one player per side; the first when a side lists more; none without ctx', () => {
    const s = maxMatch().state;
    assert.deepEqual(snookerStatTotals(s), {});
    const two = { players: { home: [{ id: 'h1' }, { id: 'h2' }], away: [{ id: 'a1' }] } };
    assert.deepEqual(Object.keys(snookerStatTotals(s, two)).sort(), ['a1', 'h1']);
    assert.deepEqual(Object.keys(snookerStatTotals(s, { players: { home: [], away: [{ id: 'a1' }] } })), ['a1']);
  });

  test('hostile and old snapshots never throw', () => {
    for (const bad of [null, undefined, {}, { sport: 'snooker' }, { frames: 'x' }, { ...S.createInitialState(), frames: [{ score: [1, 'x'] }, null, { n: 1, score: [3, 1], visits: [{ side: '__proto__', pts: 9, pots: 1, shots: 1 }] }] }]) {
      assert.doesNotThrow(() => snookerStatTotals(bad as never, SINGLES_CTX));
      for (const t of Object.values(snookerStatTotals(bad as never, SINGLES_CTX))) for (const v of Object.values(t.stats)) assert.ok(Number.isFinite(v) && v >= 0);
    }
    assert.equal(({} as Record<string, unknown>).visits, undefined);
    assert.deepEqual(snookerSideRecord(S.createInitialState(), 'home'), { framesWon: 0, framesLost: 0, points: 0, pointsAgainst: 0 });
  });

  test('the plugin is wired to these totals', () => {
    const src = readFileSync(new URL('../src/sports/snooker/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /statTotals: snookerStatTotals,/);
    assert.match(src, /statTotalsNeedsPlayers: true/);
    assert.doesNotMatch(src, /attribution/); // nothing credited live: the totals own every key
  });
});

describe('the career schema', () => {
  test('valid; every key the totals write is declared', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.snooker), []);
    const keys = lineKeys('snooker');
    for (const k of [...SNOOKER_RECORD_KEYS, ...SNOOKER_SHOT_KEYS]) assert.ok(keys.has(k), k);
  });

  const line = (id: string, stats: Record<string, number>, result: 'W' | 'L' = 'W'): StatLine =>
    ({ id: `l${id}`, matchId: id, playerId: 'p1', sport: 'snooker', stats, won: result === 'W', result, opponent: 'Ravi', date: '2026-10-01' } as StatLine);
  const rows = (lines: StatLine[]) =>
    Object.fromEntries(careerSections(statSchema('snooker')!, lines).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));

  test('frames W-L, the highest break is a max, quick lines stay out of the break rows', () => {
    const shot = (id: string, hb: number, cent: number, fifty: number, pots: number, missed: number) => line(id, {
      framesWon: 3, framesLost: 1, points: 300, pointsAgainst: 120, shotFrames: 4, highestBreak: hb, fiftyPlus: fifty, centuries: cent, maximums: 0,
      potted: 260, pots, missedPots: missed, safeties: 10, visits: 40, fouls: 4, foulPoints: 16, penaltyPoints: 20, foulMisses: 1, freeBalls: 0,
    });
    const c = rows([shot('m1', 104, 1, 2, 60, 20), shot('m2', 72, 0, 1, 40, 40), line('m3', { framesWon: 1, framesLost: 3, points: 150, pointsAgainst: 260 }, 'L')]);
    assert.equal(c.match['Frames W-L'], '7-5');
    assert.equal(c.match['Frames won %'], '58%');
    assert.equal(c.breaks['Highest break'], '104');
    assert.equal(c.breaks['Century breaks'], '1');
    assert.equal(c.breaks['50+ breaks'], '3');
    assert.equal(c.potting['Pot success'], '63%'); // 100 / 160
    assert.equal(c.scoring['Points per frame'], '62.5'); // 750 / 12 frames, quick included
    // quick-only: no break rows at all ("not tracked")
    const q = rows([line('m4', { framesWon: 2, framesLost: 0, points: 140, pointsAgainst: 60 })]);
    assert.equal(q.breaks, undefined);
    assert.equal(q.potting, undefined);
    assert.equal(q.match['Frames W-L'], '2-0');
  });
});
