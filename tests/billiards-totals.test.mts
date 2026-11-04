/**
 * English billiards `statTotals` (src/sports/billiards/totals.ts) against the
 * SD-19 contract, and its career schema (src/sports/billiards/stats.ts).
 * Nothing is credited live: every key is derived from the replayed state; a
 * side's figures go to its one player (ctx.players).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import { billiardsScript, SINGLES_CTX } from './cue-script.mts';
import * as B from '../src/sports/billiards/engine.ts';
import { billiardsStatTotals, billiardsSideRecord, BILLIARDS_RECORD_KEYS, BILLIARDS_SHOT_KEYS } from '../src/sports/billiards/totals.ts';
import { statSchema, STAT_SCHEMAS, lineKeys } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import type { StatLine } from '../src/core/types.ts';

const sp = (config: Record<string, unknown> = {}): TotalsSport<B.BilliardsState> => ({
  name: 'billiards', init: B.createInitialState, reducer: B.reducer as never, statTotals: billiardsStatTotals, config, ctx: SINGLES_CTX, derived: () => true,
});

/** 50-up, best of 3: two frames shot by shot, one quick */
function match() {
  const m = billiardsScript({ target: 50, bestOf: 3 });
  m.stroke({ potRed: true }, 10).miss(); // home 30
  m.stroke({ cannon: true }, 5).stroke({ inOffRed: true }).safety(); // away 13
  m.foul('push'); // home: 2 to away
  m.stroke({ potRed: true, cannon: true }, 7); // away 15 + 35 = 50: frame 1
  m.miss(); // frame 2: away breaks, misses
  m.stroke({ potWhite: true }, 10).stroke({ cannon: true }).stroke({ potRed: true }, 9).stroke({ cannon: true }); // home 51 → recorded 50
  m.quick(50, 48); // frame 3
  return m;
}

describe('the contract', () => {
  test('two shot-by-shot frames and a quick one', () => {
    const m = match();
    assert.equal(m.state.ended, true);
    assert.deepEqual(m.state.frames[1].score, [50, 0]);
    assert.deepEqual(m.state.frames[1].raw, [51, 0]);
    const t = assertContract(sp({ target: 50, bestOf: 3 }), toRecords(m.actions), { every: 1 });
    assert.deepEqual(t.h1.stats, {
      framesWon: 2, framesLost: 1, points: 130, pointsAgainst: 98,
      shotFrames: 2, highestBreak: 51, fiftyPlus: 1, centuries: 0, doubleCenturies: 0, scored: 81, visits: 3, scoringStrokes: 31,
      potRed: 19, potWhite: 10, inOffRed: 0, inOffWhite: 0, cannons: 2, misses: 1, safeties: 0, fouls: 1, foulPoints: 2, penaltyPoints: 0,
      // cue batch 6: the foul kinds (0 when none)
      foulNoContact: 0, foulCoup: 0, foulInHand: 0, foulPush: 1, foulJump: 0, foulTouch: 0, foulOffTable: 0, foulHazards: 0, foulCannons: 0, foulBaulkLine: 0, foulOther: 0,
    });
    assert.deepEqual(t.a1.stats, {
      framesWon: 1, framesLost: 2, points: 98, pointsAgainst: 130,
      shotFrames: 2, highestBreak: 35, fiftyPlus: 0, centuries: 0, doubleCenturies: 0, scored: 48, visits: 3, scoringStrokes: 13,
      potRed: 7, potWhite: 0, inOffRed: 1, inOffWhite: 0, cannons: 12, misses: 1, safeties: 1, fouls: 0, foulPoints: 0, penaltyPoints: 2,
      foulNoContact: 0, foulCoup: 0, foulInHand: 0, foulPush: 0, foulJump: 0, foulTouch: 0, foulOffTable: 0, foulHazards: 0, foulCannons: 0, foulBaulkLine: 0, foulOther: 0,
    });
  });

  test('the 16th hazard becomes a foul (S3 R15(k)); it counts as a foul, not as points', () => {
    const m = billiardsScript({ target: 200, bestOf: 1 });
    m.stroke({ potRed: true }, 16); // the 16th is the foul
    const t = assertContract(sp({ target: 200, bestOf: 1 }), toRecords(m.actions), { every: 1 });
    assert.deepEqual([t.h1.stats.scored, t.h1.stats.fouls, t.h1.stats.potRed, t.a1.stats.penaltyPoints], [45, 1, 15, 2]);
  });

  test('timed: sudden death, and a drawn game (neither side wins a frame)', () => {
    const m = billiardsScript({ format: 'timed' });
    m.stroke({ potRed: true }).miss().stroke({ potRed: true }).time(); // 3-3 at time: sudden death
    m.stroke({ cannon: true }); // away scores first: wins
    const t = assertContract(sp({ format: 'timed' }), toRecords(m.actions), { every: 1 });
    assert.deepEqual([t.a1.stats.framesWon, t.h1.stats.framesLost, t.a1.stats.points], [1, 1, 5]);
    const d = billiardsScript({ format: 'timed', timedTie: 'draw' }).stroke({ potRed: true }).miss().stroke({ potRed: true }).time();
    const td = assertContract(sp({ format: 'timed', timedTie: 'draw' }), toRecords(d.actions), { every: 1 });
    assert.deepEqual([td.h1.stats.framesWon, td.h1.stats.framesLost, td.a1.stats.framesWon], [0, 0, 0]);
  });

  test('quick only: record keys, no break keys', () => {
    const m = billiardsScript({ target: 100, bestOf: 3, scoringMode: 'quick' }).quick(100, 40).quick(100, 99);
    const t = assertContract(sp({ target: 100, bestOf: 3, scoringMode: 'quick' }), toRecords(m.actions), { every: 1 });
    assert.deepEqual(t.h1.stats, { framesWon: 2, framesLost: 0, points: 200, pointsAgainst: 139 });
  });

  test('AMEND: replace a game score = the clean match', () => {
    const m = billiardsScript({ target: 100, bestOf: 3, scoringMode: 'quick' }).quick(100, 40).quick(30, 100).quick(100, 99);
    const recs = toRecords(m.actions);
    const fixed = { type: 'FRAME_SCORE', payload: { home: 100, away: 70, frame: 2 } };
    const corrected = [...recs, amendRecord(recs, [{ seq: 2, op: 'replace', action: fixed }])];
    assertSameAsClean(sp({ target: 100, bestOf: 3, scoringMode: 'quick' }), corrected, toRecords([m.actions[0], fixed]), 'AMEND');
  });
});

describe('inputs and wiring', () => {
  test('hostile snapshots never throw; no ctx credits nobody', () => {
    assert.deepEqual(billiardsStatTotals(match().state), {});
    for (const bad of [null, {}, { sport: 'billiards', frames: [{ score: [1, 2], visits: [{ side: 'constructor', pts: 5 }] }] }]) {
      assert.doesNotThrow(() => billiardsStatTotals(bad as never, SINGLES_CTX));
    }
    assert.deepEqual(billiardsSideRecord(B.createInitialState(), 'away'), { framesWon: 0, framesLost: 0, points: 0, pointsAgainst: 0 });
  });
  test('the plugin is wired to these totals', () => {
    const src = readFileSync(new URL('../src/sports/billiards/index.tsx', import.meta.url), 'utf8');
    // 2026-11-06: through the doubles layer (singles hands straight back to billiardsStatTotals)
    assert.match(src, /statTotals: doublesStatTotals\(billiardsStatTotals as never/);
    assert.match(src, /statTotalsNeedsPlayers: true/);
    assert.doesNotMatch(src, /attribution/);
  });
});

describe('the career schema', () => {
  test('valid; every key the totals write is declared', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.billiards), []);
    const keys = lineKeys('billiards');
    for (const k of [...BILLIARDS_RECORD_KEYS, ...BILLIARDS_SHOT_KEYS]) assert.ok(keys.has(k), k);
  });
  test('the billiards average, centuries, highest break', () => {
    const line = (id: string, stats: Record<string, number>): StatLine =>
      ({ id: `l${id}`, matchId: id, playerId: 'p1', sport: 'billiards', stats, won: true, result: 'W', opponent: 'Ravi', date: '2026-10-01' } as StatLine);
    const shot = (id: string, hb: number, scored: number, visits: number) => line(id, {
      framesWon: 3, framesLost: 2, points: 600, pointsAgainst: 500, shotFrames: 5, highestBreak: hb, fiftyPlus: 2, centuries: hb >= 100 ? 1 : 0, doubleCenturies: 0,
      scored, visits, scoringStrokes: 200, potRed: 80, potWhite: 20, inOffRed: 40, inOffWhite: 10, cannons: 50, misses: 30, safeties: 5, fouls: 3, foulPoints: 6, penaltyPoints: 4,
    });
    const c = Object.fromEntries(careerSections(statSchema('billiards')!, [shot('m1', 132, 590, 40), shot('m2', 77, 410, 60)]).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));
    assert.equal(c.breaks['Highest break'], '132');
    assert.equal(c.breaks['Century breaks'], '1');
    assert.equal(c.breaks.Average, '10.0'); // 1000 / 100 visits
    assert.equal(c.match['Frames W-L'], '6-4');
  });
});
