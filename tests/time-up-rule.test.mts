/**
 * MVP (founder 2026-10-31): the "Time up" tiebreak is the organiser's option
 * (docs/security/breaks/mvp-time-up-rule.md): all games (points) played, or
 * only the set (game) in play. Default: all games played.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { timeUpLeader, timeUpRuleOf, TIME_UP_RULE_KEY } from '../src/core/timeUp.ts';
import type { LineScore } from '../src/sports/scoreline.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import { PICKLEBALL_META } from '../src/sports/pickleball/meta.ts';
import { SQUASH_META } from '../src/sports/squash/meta.ts';
import { TABLETENNIS_META } from '../src/sports/tabletennis/meta.ts';

const ls = (won: [number, number], done: [number, number][], current: [number, number] | null): LineScore => ({
  unit: 'set', won: { home: won[0], away: won[1] }, done: done.map(([home, away]) => ({ home, away })),
  current: current ? { home: current[0], away: current[1] } : null, ended: false, toWin: 2,
});

describe('TR1: the two rules', () => {
  const s = ls([1, 1], [[6, 0], [4, 6]], [1, 3]);
  test('all games played (default)', () => {
    assert.equal(timeUpLeader(s), 'home');
    assert.equal(timeUpLeader(s, 'games'), 'home');
  });
  test('the set in play', () => assert.equal(timeUpLeader(s, 'set'), 'away'));
  test('sets still come first under both', () => {
    assert.equal(timeUpLeader(ls([1, 0], [[6, 4]], [0, 5]), 'set'), 'home');
  });
  test('no set in play yet: level', () => {
    assert.equal(timeUpLeader(ls([1, 1], [[6, 0], [4, 6]], [0, 0]), 'set'), null);
    assert.equal(timeUpLeader(ls([1, 1], [[6, 0], [4, 6]], null), 'set'), null);
  });
});

describe('TR2: the organiser chooses it with the format', () => {
  test('read from the format; anything else is the default', () => {
    assert.equal(timeUpRuleOf({ [TIME_UP_RULE_KEY]: 'set' }), 'set');
    assert.equal(timeUpRuleOf({ [TIME_UP_RULE_KEY]: 'games' }), 'games');
    assert.equal(timeUpRuleOf({}), 'games');
    assert.equal(timeUpRuleOf(undefined), 'games');
    assert.equal(timeUpRuleOf({ [TIME_UP_RULE_KEY]: 'nonsense' }), 'games');
  });
  for (const m of [TENNIS_META, PADEL_META, BADMINTON_META, PICKLEBALL_META, SQUASH_META, TABLETENNIS_META]) {
    test(`${m.id}: an advanced format option, default all games`, () => {
      const f = m.formatFields!.find((x) => x.key === TIME_UP_RULE_KEY)!;
      assert.ok(f, 'has the option');
      assert.equal(f.default, 'games');
      assert.equal(f.advanced, true);
      assert.deepEqual(f.options!.map((o) => o.value), ['games', 'set']);
    });
  }
});

test('TR2 / TR3: the end sheet uses the match\'s rule and says it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
  assert.match(src, /timeUpLeader\(timeUpLs, timeUpRule\)/);
  assert.match(src, /const timeUpRule = timeUpRuleOf\(meta\.config/);
  assert.match(src, /in the \$\{timeUpLs\.unit\} in play/);
});
