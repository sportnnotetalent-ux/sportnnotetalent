/**
 * MVP T1 — a custom "Games per set" must move the tiebreak with it. Before the
 * fix, `tiebreakAt` / `setWinByTwo` / `tiebreakPoints` kept the preset's
 * values, so "4 (short)" broke at 6-6 and "8 (pro set)" ended 7-6.
 * The fix lives in the format editor (a choice option can snap siblings, like
 * a preset), so matches already saved keep the rules they were created with.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { init, reducer, inTiebreak, type TennisState } from '../src/sports/tennis/engine.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { fieldChanges } from '../src/sports/formatPick.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const run = (s: TennisState, log: ScoreAction[]) => log.reduce(reducer, s);
const fields = TENNIS_META.formatFields!;
const field = (k: string) => fields.find((f) => f.key === k)!;
const presetSet = (v: string) => ({ ...field('preset').options!.find((o) => o.value === v)!.set! });

/** Start from a preset, then pick "Games per set" = n the way the editor does. */
const pick = (preset: string, n: number) => {
  const f: Record<string, number | string | boolean> = { preset, ...presetSet(preset) };
  for (const [k, v] of fieldChanges(field('gamesPerSet'), n)) f[k] = v;
  return f;
};
/** Games alternate so the set reaches n-n without either side going clear. */
const toAll = (n: number): ScoreAction[] => Array.from({ length: n }, () => [...L.tGame('home'), ...L.tGame('away')]).flat();

describe('custom games per set moves the tiebreak', () => {
  test('picking a games option snaps tiebreakAt, win-by-2 and a 7-point tiebreak', () => {
    for (const n of [4, 6, 8]) {
      const ch = Object.fromEntries(fieldChanges(field('gamesPerSet'), n));
      assert.equal(ch.gamesPerSet, n);
      assert.equal(ch.tiebreakAt, n);
      assert.equal(ch.setWinByTwo, true);
      assert.equal(ch.tiebreakPoints, 7);
      assert.equal(ch.tbSuddenDeathAt, 0);
    }
  });

  test('Best of 3 → 4 games: tiebreak at 4-4, not 6-6', () => {
    const s = run(init(pick('bo3', 4)), toAll(4));
    assert.deepEqual(s.games, { home: 4, away: 4 });
    assert.equal(inTiebreak(s), true);
  });

  test('Best of 3 → 4 games: 5-3 wins the set (win by 2)', () => {
    const s = run(init(pick('bo3', 4)), [...toAll(3), ...L.tGame('home'), ...L.tGame('home')]);
    assert.deepEqual(s.sets, [[5, 3]]);
  });

  test('Best of 3 → 8 games: 7-6 is not a set; tiebreak at 8-8', () => {
    const at76 = run(init(pick('bo3', 8)), [...toAll(6), ...L.tGame('home')]);
    assert.deepEqual(at76.sets, []);
    assert.equal(inTiebreak(at76), false);
    const at88 = run(init(pick('bo3', 8)), toAll(8));
    assert.equal(inTiebreak(at88), true);
  });

  test('Fast4 → 6 games: no tiebreak at 3-3; tiebreak at 6-6', () => {
    const at33 = run(init(pick('fast4', 6)), toAll(3));
    assert.equal(inTiebreak(at33), false);
    const at66 = run(init(pick('fast4', 6)), toAll(6));
    assert.equal(inTiebreak(at66), true);
  });

  test('a preset option still snaps its own siblings (unchanged)', () => {
    const ch = Object.fromEntries(fieldChanges(field('preset'), 'fast4'));
    assert.equal(ch.preset, 'fast4');
    assert.equal(ch.tiebreakAt, 3);
    assert.equal(ch.tiebreakPoints, 5);
  });

  test('a choice without `set` changes only itself', () => {
    assert.deepEqual(fieldChanges(field('noAd'), true), [['noAd', true]]);
  });
});
