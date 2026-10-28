/**
 * Billiards league tables count points (founder 2026-10-28) — simulation
 * (quality mandate step 6): 500 players in 50 groups of 10, a full round robin
 * each (2,250 matches, best of 5 at 150-up, about 1 in 12 ended by hand).
 *
 * Invariants, checked against sums made here from the frame scores:
 *   • wins and losses are decided on frames;
 *   • a player's for / against are every frame's points (a hand-ended match:
 *     the frames played), and each group's difference sums to zero;
 *   • the order is points (2 a win), then the points difference, then the
 *     points scored; nothing prints NaN.
 */
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/sports/billiards/engine.ts';
import {
  standingsPresets, standingsConfigFromFormat, teamStandings,
  setStandingsScoreProvider, setStandingsUnitsProvider, setStandingsPointsProvider,
} from '../src/data/standings.ts';
import type { Match, SportId } from '../src/core/types.ts';

const BIL = 'billiards' as SportId;
let seed = 1028;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

/** A frame: the winner reaches 150, the loser 0–149. */
const frame = (): [number, number] => {
  const lo = Math.floor(rnd() * 150);
  return rnd() < 0.5 ? [150, lo] : [lo, 150];
};

describe('billiards league: 500 players, 2,250 matches', () => {
  setStandingsPointsProvider(null);
  setStandingsScoreProvider((sport, st) => (sport === 'billiards' ? B.standingsScore(st as B.BilliardsState) : null));
  setStandingsUnitsProvider((sport, st) => (sport === 'billiards' ? B.standingsUnits(st as B.BilliardsState) : null));
  after(() => { setStandingsScoreProvider(null); setStandingsUnitsProvider(null); });

  test('every group: frames decide, points count, the order holds', () => {
    const cfg = standingsConfigFromFormat(BIL, standingsPresets(BIL)[0].set);
    let matches = 0, hand = 0;
    for (let g = 0; g < 50; g++) {
      const ids = Array.from({ length: 10 }, (_, i) => `g${g}p${i}`);
      const ms: Match[] = [];
      const want = new Map(ids.map((id) => [id, { won: 0, lost: 0, for: 0, against: 0 }]));
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        let s = B.createInitialState({ format: 'points', target: 150, bestOf: 5, scoringMode: 'quick' });
        const byHand = rnd() < 1 / 12;
        const stopAfter = byHand ? 1 + Math.floor(rnd() * 3) : 99;
        let played = 0;
        while (!B.isComplete(s) && played < stopAfter) {
          const [h, a] = frame();
          s = B.reducer(s, { type: 'FRAME_SCORE', payload: { home: h, away: a, frame: s.frame?.n } } as never);
          played++;
        }
        const won = B.standingsUnits(s)!;
        const frames = s.framesWon;
        let winner: 'home' | 'away';
        let result: unknown;
        if (byHand && !B.isComplete(s)) {
          // the scorer stops it and awards it to whoever leads on frames (home when level)
          winner = frames.away > frames.home ? 'away' : 'home';
          result = { kind: 'awarded', winner, score: { home: frames.home, away: frames.away } };
          hand++;
        } else {
          winner = B.result(s)!.winner as 'home' | 'away';
        }
        ms.push({
          id: `m${g}-${i}-${j}`, sport: 'billiards', status: 'completed', startsAt: '', winner,
          score: { home: frames.home, away: frames.away }, homeTeam: { id: ids[i], name: ids[i] }, awayTeam: { id: ids[j], name: ids[j] },
          state: s, ...(result ? { result } : {}),
        } as unknown as Match);
        const H = want.get(ids[i])!, A = want.get(ids[j])!;
        (winner === 'home' ? H : A).won++; (winner === 'home' ? A : H).lost++;
        H.for += won.points.home; H.against += won.points.away;
        A.for += won.points.away; A.against += won.points.home;
        matches++;
      }
      const rows = teamStandings(ms, BIL, cfg);
      assert.equal(rows.length, 10);
      assert.equal(rows.reduce((t, r) => t + r.diff, 0), 0, `group ${g}: the difference sums to zero`);
      for (const r of rows) {
        const w = want.get(r.teamId)!;
        assert.deepEqual([r.won, r.lost, r.for, r.against, r.diff], [w.won, w.lost, w.for, w.against, w.for - w.against], `group ${g} ${r.teamId}`);
        assert.equal(r.points, 2 * w.won);
        assert.ok(!/NaN|undefined/.test(JSON.stringify(r)));
      }
      for (let k = 1; k < rows.length; k++) {
        const [a, b] = [rows[k - 1], rows[k]];
        const key = (r: typeof a) => [r.points, r.diff, r.for];
        const [x, y] = [key(a), key(b)];
        const before = x[0] > y[0] || (x[0] === y[0] && (x[1] > y[1] || (x[1] === y[1] && x[2] >= y[2])));
        assert.ok(before, `group ${g}: ${a.teamId} ${x} above ${b.teamId} ${y}`);
      }
    }
    assert.equal(matches, 2250);
    assert.ok(hand > 100, `${hand} ended by hand`);
  });
});
