/**
 * Billiards league tables count points (founder 2026-10-28): the winner is
 * still whoever won the match on frames, but for / against, the difference
 * and the tie-breaks read every frame's points.
 */
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as B from '../src/sports/billiards/engine.ts';
import {
  scoreUnit, standingsPresets, standingsConfigFromFormat, teamStandings, tieBreakerLabel, availableTieBreakers,
  setStandingsScoreProvider, setStandingsUnitsProvider, setStandingsPointsProvider, tiePointsPreset,
} from '../src/data/standings.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import type { Match, SportId } from '../src/core/types.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const BIL = 'billiards' as SportId;

/** A short-format match (150-up, best of 5) from its frame scores. */
function framesMatch(frames: Array<[number, number]>): B.BilliardsState {
  let s = B.createInitialState({ format: 'points', target: 150, bestOf: 5, scoringMode: 'quick' });
  for (const [home, away] of frames) s = B.reducer(s, { type: 'FRAME_SCORE', payload: { home, away, frame: s.frame?.n } } as never);
  return s;
}
let mn = 0;
function M(h: string, a: string, st: B.BilliardsState): Match {
  const r = B.result(st)!;
  return {
    id: `bl${++mn}`, sport: 'billiards', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner,
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st,
  } as unknown as Match;
}

describe('billiards: the league table counts points', () => {
  // what the registry wires (plugin.standingsScore / standingsUnits)
  setStandingsPointsProvider(null);
  setStandingsScoreProvider((sport, st) => (sport === 'billiards' ? B.standingsScore(st as B.BilliardsState) : null));
  setStandingsUnitsProvider((sport, st) => (sport === 'billiards' ? B.standingsUnits(st as B.BilliardsState) : null));
  after(() => { setStandingsScoreProvider(null); setStandingsUnitsProvider(null); });

  test('the unit is points; snooker and pool still count frames / racks', () => {
    assert.equal(scoreUnit('billiards'), 'points');
    assert.equal(scoreUnit('snooker'), 'games');
    assert.equal(scoreUnit('pool'), 'games');
  });

  test('standingsScore: every frame\'s points (a match ended by hand: the frames so far)', () => {
    const s = framesMatch([[150, 90], [120, 150], [150, 40]]);
    assert.equal(B.isComplete(s), false);
    assert.deepEqual(B.standingsScore(s), { home: 420, away: 280 });
    const done = framesMatch([[150, 90], [120, 150], [150, 40], [150, 149]]);
    assert.equal(B.isComplete(done), true);
    assert.deepEqual(B.standingsScore(done), { home: 570, away: 429 });
    assert.equal(B.standingsScore(null as never), null);
    assert.equal(B.standingsScore({ frames: '__proto__' } as never), null);
  });

  test('a match won on frames with fewer points: still a win; for / against are points', () => {
    // A beats B 3-2 on frames but scores fewer points (540 to 680)
    const close = framesMatch([[150, 140], [0, 150], [150, 100], [90, 150], [150, 140]]);
    assert.deepEqual(B.result(close), { winner: 'home', home: 3, away: 2 });
    const cfg = standingsConfigFromFormat(BIL, standingsPresets(BIL)[0].set);
    const t = teamStandings([M('A', 'B', close)], BIL, cfg);
    const a = t.find((r) => r.teamId === 'A')!;
    assert.deepEqual([a.won, a.points, a.for, a.against, a.diff], [1, 2, 540, 680, -140]);
  });

  test('break-it: a match ended by hand stores frames won, but the table still counts its points', () => {
    const st = framesMatch([[150, 90], [120, 150], [150, 40]]);  // 2-1 in frames when it was stopped
    const m = {
      id: 'bl-hand', sport: 'billiards', status: 'completed', startsAt: '', score: { home: 2, away: 1 }, winner: 'home',
      homeTeam: { id: 'A', name: 'A' }, awayTeam: { id: 'B', name: 'B' }, state: st,
      result: { kind: 'awarded', winner: 'home', score: { home: 2, away: 1 } },
    } as unknown as Match;
    const cfg = standingsConfigFromFormat(BIL, standingsPresets(BIL)[0].set);
    const a = teamStandings([m], BIL, cfg).find((r) => r.teamId === 'A')!;
    assert.deepEqual([a.won, a.for, a.against], [1, 420, 280]);
  });

  test('the preset: wins, then points difference, then points scored', () => {
    const p = standingsPresets(BIL)[0];
    assert.equal(p.set.tieBreak, 'diff,for,lots');
    assert.match(p.note ?? p.label, /points difference/i);
    assert.doesNotMatch(JSON.stringify(p), /frame/i);
    // A and B each win once, both +150 on points: B scored more (599 to 450), so B goes first
    const cfg = standingsConfigFromFormat(BIL, p.set);
    const ms = [
      M('A', 'C', framesMatch([[150, 100], [150, 100], [150, 100]])),
      M('B', 'D', framesMatch([[150, 100], [150, 100], [149, 150], [150, 99]])),
    ];
    const rows = teamStandings(ms, BIL, cfg);
    assert.deepEqual(rows.slice(0, 2).map((r) => [r.teamId, r.diff, r.for]), [['B', 150, 599], ['A', 150, 450]]);
  });

  test('the labels say points, not frames', () => {
    assert.equal(tieBreakerLabel('diff', 'billiards'), 'points difference');
    assert.equal(tieBreakerLabel('for', 'billiards'), 'points scored');
    assert.equal(tieBreakerLabel('pointsDiff', 'billiards'), 'points difference');
    assert.equal(tieBreakerLabel('diff', 'snooker'), 'frame difference', 'snooker unchanged');
    assert.ok(availableTieBreakers(BIL).includes('for'));
  });

  test('the table\'s columns: points for, against and the difference (no F± column)', () => {
    const cfg = standingsConfigFromFormat(BIL, standingsPresets(BIL)[0].set);
    const labels = tableColumns(BIL, cfg, 'individual').columns.map((c) => c.label);
    assert.ok(labels.includes('PF') && labels.includes('PA') && labels.includes('±'), labels.join(' '));
    assert.ok(!labels.includes('F±'), labels.join(' '));
    const snooker = tableColumns('snooker', standingsConfigFromFormat('snooker' as SportId, standingsPresets('snooker')[0].set), 'individual').columns.map((c) => c.label);
    assert.ok(snooker.includes('F±'), 'snooker keeps frames');
  });

  test('team ties: rubbers, then points difference', () => {
    const tie = tiePointsPreset(BIL)!;
    assert.equal(tie.set.tieBreak, 'rubbersDiff,pointsDiff,lots');
    assert.doesNotMatch(tie.note ?? '', /frame/i);
  });

  test('the plugin hands the table its points', () => {
    assert.match(read('src/sports/billiards/index.tsx'), /standingsScore,/);
  });
});
