/**
 * MVP F4 — a single-period football game ("Periods: 1 period"). The first
 * period's button is the full-time one; extra time (if any) starts after the
 * single period; two-half games and saved matches are unchanged.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, startOffset, halfBase, halfEndOf, halfOfMinute, type FootballState } from '../src/sports/football/engine.ts';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const run = (s: FootballState, ...a: ScoreAction[]) => a.reduce(reducer, s);

describe('two halves (and every saved match): unchanged', () => {
  const s = init({ halfMinutes: 20, extraTimeMinutes: 5 });
  test('offsets and bases as before', () => {
    assert.equal(s.onePeriod, undefined);
    assert.deepEqual([1, 2, 3, 4].map((h) => halfEndOf(h as 1, s)), [20, 40, 45, 50]);
    assert.deepEqual([10, 30, 42, 48].map((m) => halfOfMinute(m, s)), [1, 2, 3, 4]);
    assert.equal(startOffset({ ...s, half: 3 }), 40);
    assert.equal(halfBase({ ...s, half: 4 }), 50);
  });
});

describe('one period', () => {
  const cfg = { halfMinutes: 40, extraTimeMinutes: 5, periods: 1 };
  const s = init(cfg);
  test('the state knows it', () => assert.equal(s.onePeriod, true));
  test('extra time starts after the single period', () => {
    assert.equal(startOffset({ ...s, half: 3 }), 40);
    assert.equal(halfBase({ ...s, half: 3 }), 45);
    assert.equal(halfEndOf(4, s), 50);
    assert.equal(halfOfMinute(30, s), 1);
    assert.equal(halfOfMinute(43, s), 3, 'past the period is extra time, never a "2nd half"');
  });
  test('a level knockout can start extra time straight from the period', () => {
    const ko = init({ ...cfg, decider: 'extra_time', knockout: true });
    const ended = run(ko, { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction, { type: 'END', payload: { at: 2 } } as ScoreAction);
    const et = run(ended, { type: 'START_EXTRA_TIME' } as ScoreAction);
    assert.equal(et.half, 3);
  });
  test('the format offers it, and the screen ends the match from the period', () => {
    const f = FOOTBALL_META.formatFields!.find((x) => x.key === 'periods')!;
    assert.equal(f.default, 2);
    assert.deepEqual(f.options!.map((o) => o.value), [2, 1]);
    const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/football/index.tsx'), 'utf8');
    assert.match(src, /if \(state\.half === 1 && !state\.onePeriod\) return <Button (?:variant="primary" )?label="End 1st Half →"/);
  });
});
