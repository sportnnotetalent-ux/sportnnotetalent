/** Pickleball: USA Pickleball 2026 round-robin standings (15.B.4) and plain
 *  rally labels (docs/security/breaks/pickleball-usap-2026.md). */
import { describe, test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamStandings, defaultStandingsConfig, standingsConfigFromFormat, standingsPresets, setStandingsUnitsProvider,
  tieBreakerLabel, availableTieBreakers,
} from '../src/data/standings.ts';
import { PICKLEBALL_FORMAT_FIELDS } from '../src/sports/pickleball/meta.ts';
import type { Match, SportId } from '../src/core/types.ts';

const PB = 'pickleball' as SportId;
let n = 0;
/** one game to 11: winner 11, loser `l` */
const M = (h: string, a: string, hp: number, ap: number): Match => ({
  id: `m${++n}`, sport: 'pickleball', status: 'completed', startsAt: '', score: { home: hp > ap ? 1 : 0, away: ap > hp ? 1 : 0 },
  winner: hp > ap ? 'home' : 'away', homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: { pts: [hp, ap] },
} as unknown as Match);
const order = (ms: Match[], teams?: { id: string; name: string; withdrawn?: boolean }[]) =>
  teamStandings(ms, PB, defaultStandingsConfig(PB), undefined, teams).map((t) => t.teamId);

before(() => setStandingsUnitsProvider((sport, st) => {
  const p = (st as { pts?: [number, number] })?.pts;
  return sport === 'pickleball' && p ? { points: { home: p[0], away: p[1] } } : null;
}));
after(() => setStandingsUnitsProvider(null));

describe('PU-1/PU-2/PU-3 tie-break order (15.B.4)', () => {
  test('the default order', () => {
    const c = defaultStandingsConfig(PB);
    assert.deepEqual(c.order, ['h2h', 'pointsDiff', 'h2hRallyDiff', 'vsAbove', 'rallyFor', 'lots']);
    assert.ok(!c.restart, 'PU-2: no restart');
    assert.equal(c.dropWithdrawn, true);
    const pool = standingsPresets(PB)[0];
    assert.equal(pool.set.tieBreak, 'h2h,pointsDiff,h2hRallyDiff,vsAbove,rallyFor,lots');
    assert.equal(standingsConfigFromFormat(PB, pool.set).order.join(), c.order.join());
  });
  test('USAP example: A, B, C all 1-1 → point difference decides (A +10−? …)', () => {
    // A v B 11-5, B v C 11-1, C v A 11-2 (USAP #2073 example)
    const ms = [M('A', 'B', 11, 5), M('B', 'C', 11, 1), M('C', 'A', 11, 2)];
    // diffs: A +6−9 = −3, B −6+10 = +4, C −10+9 = −1
    assert.deepEqual(order(ms), ['B', 'C', 'A']);
  });
  test('head-to-head point difference, then vs the team above, then total points', () => {
    // T is clear first; X and Y level on wins and overall point difference, and drew the h2h diff
    const ms = [M('T', 'X', 11, 9), M('T', 'Y', 11, 5), M('X', 'Y', 11, 9), M('Y', 'X', 11, 9),
      M('X', 'Z', 11, 5), M('Y', 'Z', 11, 9), M('T', 'Z', 11, 0)];
    // X: −2 +2 −2 +6 = +4 ; Y: −6 −2 +2 +2 = −4 → pointsDiff already separates
    assert.deepEqual(order(ms).slice(0, 2), ['T', 'X']);
  });
  test('PU-3 vs the team above separates when everything else is level; no team above → skipped', () => {
    // X and Y: same wins, same overall diff, h2h split evenly; X lost to T by less
    const ms = [M('T', 'X', 11, 9), M('T', 'Y', 11, 7), M('X', 'Y', 11, 7), M('Y', 'X', 11, 7),
      M('X', 'W', 11, 9), M('Y', 'W', 11, 7)];
    // X: −2 +4 −4 +2 = 0 ; Y: −4 −4 +4 +4 = 0 ; h2h diff 0 each ; vs T: X −2, Y −4
    const o = order(ms);
    assert.deepEqual(o.slice(0, 3), ['T', 'X', 'Y']);
  });
  test('labels and availability', () => {
    assert.equal(tieBreakerLabel('h2hRallyDiff', PB), 'head-to-head point difference');
    assert.equal(tieBreakerLabel('vsAbove', PB), 'point difference vs the team above');
    assert.equal(tieBreakerLabel('rallyFor', PB), 'total points scored');
    for (const k of ['h2hRallyDiff', 'vsAbove', 'rallyFor']) assert.ok(availableTieBreakers(PB).includes(k));
    assert.ok(!availableTieBreakers('football' as SportId).includes('vsAbove'), 'PU-6');
    assert.deepEqual(defaultStandingsConfig('badminton' as SportId).order, ['h2h', 'diff', 'for'], 'PU-6');
  });
});

describe('PU-4 withdrawn teams (15.B.4.a)', () => {
  test('their results are left out and they rank last', () => {
    const ms = [M('A', 'W', 11, 0), M('B', 'W', 5, 11), M('A', 'B', 11, 9)];
    const rows = teamStandings(ms, PB, defaultStandingsConfig(PB), undefined,
      [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'W', name: 'W', withdrawn: true }]);
    assert.deepEqual(rows.map((r) => r.teamId), ['A', 'B', 'W']);
    const b = rows.find((r) => r.teamId === 'B')!;
    assert.equal(b.played, 1, 'B’s loss to W does not count');
    assert.equal(b.lost, 1);
    assert.equal(rows[2].withdrawn, true);
    assert.equal(rows[2].played, 0);
  });
  test('an organiser who turns it off keeps the results', () => {
    const cfg = { ...defaultStandingsConfig(PB), dropWithdrawn: false };
    const ms = [M('B', 'W', 5, 11)];
    const rows = teamStandings(ms, PB, cfg, undefined, [{ id: 'B', name: 'B' }, { id: 'W', name: 'W', withdrawn: true }]);
    assert.equal(rows.find((r) => r.teamId === 'B')!.played, 1);
  });
});

test('PU-7 plain rally labels; best of 3 to 15 added', () => {
  const opts = PICKLEBALL_FORMAT_FIELDS.find((f) => f.key === 'preset')!.options!;
  const lab = (v: string) => opts.find((o) => o.value === v)?.label;
  assert.equal(lab('rec11'), 'Rally · 1 game to 11');
  assert.equal(lab('rec'), 'Rally · best of 3 to 11');
  assert.equal(lab('rec1'), 'Rally · best of 3 to 11 · win by 1');
  const r15 = opts.find((o) => o.value === 'rally15')!;
  assert.equal(r15.label, 'Rally · best of 3 to 15');
  assert.deepEqual(r15.set, { scoring: 'rally', pointsPerGame: 15, winBy: 2, gamesToWin: 2 });
  assert.ok(!opts.some((o) => /\bRec\b/.test(o.label)));
});
