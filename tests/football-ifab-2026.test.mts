/** Football — IFAB Laws of the Game 2026/27 (docs/sport-expert/football-rulebook.md FB-1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDefaults } from '../src/sports/formatPick.ts';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';

test('FB-1: 11-a-side (the tournament default) is up to 5 substitutes with no return (Law 3)', () => {
  const t = formatDefaults(FOOTBALL_META.formatFields!, 'tournament');
  assert.equal(t.preset, 'eleven');
  assert.equal(t.subType, 'fixed');
  assert.equal(t.substitutes, 5);
});

test('small-sided games and futsal keep rolling substitutions', () => {
  const opts = FOOTBALL_META.formatFields!.find((f) => f.key === 'preset')!.options!;
  for (const v of ['sevens', 'fives', 'futsal']) assert.equal(opts.find((o) => o.value === v)!.set!.subType, 'rolling', v);
  assert.equal(formatDefaults(FOOTBALL_META.formatFields!).preset, 'fives');
  assert.equal(formatDefaults(FOOTBALL_META.formatFields!).subType, 'rolling');
});
