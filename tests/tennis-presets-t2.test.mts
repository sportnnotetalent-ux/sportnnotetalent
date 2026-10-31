/**
 * MVP T2 — tennis presets in the order club players need them, with the
 * common formats one tap away: Best of 3 · 2 sets + match tiebreak · One set ·
 * Short sets (to 4) · Fast4 · Pro set · doubles · Match tiebreak only · Best
 * of 5 · Grand Slam. Stored preset values keep working (none removed).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { init, reducer, inTiebreak, type TennisState } from '../src/sports/tennis/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const preset = TENNIS_META.formatFields!.find((f) => f.key === 'preset')!;
const opt = (v: string) => preset.options!.find((o) => o.value === v)!;
const run = (s: TennisState, log: ScoreAction[]) => log.reduce(reducer, s);

describe('the list', () => {
  test('club formats first, the big ones last', () => {
    assert.deepEqual(preset.options!.map((o) => o.value),
      ['bo3', 'two_sets_mtb', 'one_set', 'short4', 'fast4', 'proset', 'itf_dbl', 'match_tb', 'bo5', 'gs5', 'custom']);
    assert.equal(preset.default, 'bo3');
  });
  test('labels say what they play', () => {
    assert.match(opt('two_sets_mtb').label, /2 sets.*match tiebreak/i);
    assert.match(opt('one_set').label, /one set/i);
    assert.match(opt('short4').label, /to 4/);
    assert.match(opt('match_tb').label, /only/i);
  });
});

describe('they play right', () => {
  test('2 sets + match tiebreak: at one set all, the decider is a 10-point tiebreak, with advantage games', () => {
    const cfg = opt('two_sets_mtb').set!;
    assert.equal(cfg.noAd, false);
    const s = run(init(cfg), [...L.tSet(6, 3), ...L.tSet(3, 6)]);
    assert.deepEqual(s.setsWon, { home: 1, away: 1 });
    assert.equal(inTiebreak(s), true);
    const done = run(s, L.tbPts('home', 10));
    assert.equal(done.ended, true);
  });
  test('One set: one 6-game set (tiebreak at 6-6) ends the match', () => {
    const s = run(init(opt('one_set').set!), L.tSet(6, 4));
    assert.equal(s.ended, true);
    assert.equal(inTiebreak(run(init(opt('one_set').set!), Array.from({ length: 6 }, () => [...L.tGame('home'), ...L.tGame('away')]).flat())), true);
  });
  test('Short sets: tiebreak at 4-4, best of 3', () => {
    const cfg = opt('short4').set!;
    assert.equal(cfg.gamesPerSet, 4);
    assert.equal(cfg.tiebreakAt, 4);
    assert.equal(cfg.setsToWin, 2);
  });
});
