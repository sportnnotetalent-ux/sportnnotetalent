/**
 * DLS v3 (2026-10-27): the full ICC D/L Standard Edition over-by-over table
 * (every over 0–50 × wickets 0–9) replaces the v2 anchors + interpolation for
 * matches whose first overs / target / rain event carries `t: 3` (engine
 * `dlsT`). Every earlier log — legacy or v2 — replays exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, dlsResources, rainStopPar, withNewDlsTable, type CricketState } from '../src/sports/cricket/engine.ts';
import { resourcePct, resourcePctV3 } from '../src/sports/cricket/dls.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const root = join(import.meta.dirname, '..');
const T20 = { overs: 20, dls: true };
const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
const seed = (s: CricketState, runs: number, wickets: number, balls: number): CricketState =>
  ({ ...s, scores: { ...s.scores, [s.battingSide]: inn(runs, wickets, balls) }, ballsInOver: balls % s.ballsPerOver === 0 && balls > 0 ? s.ballsPerOver : balls % s.ballsPerOver });
const go = (s: CricketState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const END_INN: ScoreAction = { type: 'END_INNINGS' };
const chaseOf = (runs: number): CricketState => { const s = init(T20); return reducer(seed(s, runs, 6, s.oversLimit * s.ballsPerOver), END_INN); };
const rain = (overs: number, t?: 3): ScoreAction => ({ type: 'RAIN', payload: { overs, v: 2, ...(t ? { t } : {}) } });

describe('the official table', () => {
  test('rows as the ICC prints them', () => {
    assert.deepEqual([...Array(10).keys()].map((w) => resourcePctV3(50, w)), [100, 93.4, 85.1, 74.9, 62.7, 49, 34.9, 22, 11.9, 4.7]);
    assert.deepEqual([...Array(10).keys()].map((w) => resourcePctV3(37, w)), [85.4, 80.9, 75, 67.6, 58.2, 46.9, 34.4, 21.9, 11.9, 4.7]);
    assert.deepEqual([...Array(10).keys()].map((w) => resourcePctV3(10, w)), [32.1, 31.6, 30.8, 29.8, 28.3, 26.1, 22.8, 17.9, 11.4, 4.7]);
    assert.deepEqual([...Array(10).keys()].map((w) => resourcePctV3(1, w)), [3.6, 3.6, 3.6, 3.6, 3.6, 3.5, 3.5, 3.4, 3.2, 2.5]);
    for (let w = 0; w < 10; w++) assert.equal(resourcePctV3(0, w), 0);
  });
  test('never more resources with a wicket down or an over fewer; between whole overs, linear', () => {
    for (let u = 0; u <= 50; u++) for (let w = 1; w < 10; w++) assert.ok(resourcePctV3(u, w) <= resourcePctV3(u, w - 1), `u ${u} w ${w}`);
    for (let w = 0; w < 10; w++) for (let u = 1; u <= 50; u++) assert.ok(resourcePctV3(u, w) >= resourcePctV3(u - 1, w), `u ${u} w ${w}`);
    assert.ok(Math.abs(resourcePctV3(9.5, 0) - (29.3 + 32.1) / 2) < 1e-9);
    assert.equal(resourcePctV3(60, 0), 100);
  });
  test('v2 kept its anchors; the full table corrects them in between (and at 10 overs, 8 down)', () => {
    assert.equal(resourcePct(10, 8), 10.9);
    assert.equal(resourcePctV3(10, 8), 11.4);
    assert.equal(resourcePct(50, 3), resourcePctV3(50, 3));
  });
});

describe('the engine', () => {
  // T20 chase of 150 at 10.0 ov for 8 down; rain cuts it to 15 overs.
  const at = () => seed(chaseOf(150), 50, 8, 60);
  test('a match whose first event carries t: 3 uses the full table', () => {
    const s = go(at(), rain(15, 3));
    assert.equal(s.dlsT, 3);
    assert.equal(dlsResources(s).r2, 54.6); // 56.6 − (11.4 − 9.4)
    assert.equal(s.target, 145);
  });
  test('without t (every earlier log) the v2 maths are unchanged', () => {
    const s = go(at(), rain(15));
    assert.equal(s.dlsT, undefined);
    assert.equal(dlsResources(s).r2, 55.1); // 56.6 − (10.9 − 9.4)
    assert.equal(s.target, 147);
  });
  test('the table is fixed by the first event — a match already on v2 stays on v2', () => {
    const v2 = go(chaseOf(150), { type: 'SET_OVERS', payload: { overs: 19, v: 2 } });
    const later = go(seed(v2, 50, 8, 60), rain(15, 3));
    assert.equal(later.dlsT, undefined, 'units never mix within a match');
    const v3 = go(chaseOf(150), { type: 'SET_OVERS', payload: { overs: 19, v: 2, t: 3 } }, { type: 'SET_OVERS', payload: { overs: 18, v: 2 } });
    assert.equal(v3.dlsT, 3, 'and stays v3 once fixed');
  });
  test('the screen\'s previews and live par use the table a new event would', () => {
    const s = at();
    assert.equal(withNewDlsTable(s).dlsT, 3);
    assert.equal(withNewDlsTable(go(chaseOf(150), { type: 'SET_OVERS', payload: { overs: 19, v: 2 } })).dlsT, undefined);
    // par if play stopped now (no rain yet): v3 vs the v2 anchors differ
    const parV3 = rainStopPar(withNewDlsTable(s));
    const parV2 = rainStopPar(s);
    assert.notEqual(parV3, null);
    assert.ok(parV3 !== parV2, `${parV3} vs ${parV2}`);
    // the RAIN_STOP the screen sends gets the same par it previewed
    const stopped = go(s, { type: 'RAIN_STOP', payload: { v: 2, t: 3, minOvers: 5 } });
    assert.equal(stopped.rainStop?.par, parV3);
  });
});

describe('the app sends t: 3', () => {
  test('every overs / target / rain event, and the previews use the same table', () => {
    const src = readFileSync(join(root, 'src/sports/cricket/index.tsx'), 'utf8');
    for (const re of [/type: 'SET_OVERS', payload: \{ overs: n, v: 2, t: 3 \}/, /type: 'RAIN', payload: \{ overs: n, v: 2, t: 3 \}/,
      /type: 'RAIN_END_INNINGS', payload: \{ v: 2, t: 3, chaseOvers: n \}/, /type: 'SET_TARGET', payload: \{ runs: runsN, overs: n, v: 2, t: 3 \}/,
      /type: 'RAIN_STOP', payload: \{ v: 2, t: 3, minOvers: minN/]) assert.match(src, re);
    assert.equal((src.match(/rainStopPar\(withNewDlsTable\(/g) ?? []).length, 3);
  });
});
