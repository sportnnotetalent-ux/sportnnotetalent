/**
 * MVP F9 — "Kondapur FC" and "Kukatpally FC" both got the code "KF", so both
 * Goal buttons read "Goal — KF". A new side's code is now kept different from
 * the other side's (KF / KUK), and it takes a palette colour the other side
 * isn't using. A match whose two codes already match shows the full team
 * names on the scoring controls instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shortFrom, uniqueShort } from '../src/core/teamShort.ts';

test('the code from a name, as before', () => {
  assert.equal(shortFrom('Kondapur FC'), 'KF');
  assert.equal(shortFrom('Lions'), 'LION');
  assert.equal(shortFrom('  '), 'TM');
  assert.equal(shortFrom('K'), 'KX', 'at least 2 characters');
});
test('kept different from the other side', () => {
  assert.equal(uniqueShort('Kukatpally FC', ['KF']), 'KUK');
  assert.equal(uniqueShort('Kondapur FC', []), 'KF');
  assert.equal(uniqueShort('Kranti Foundation', ['KF']), 'KRA');
  const third = uniqueShort('Kukatpally FC', ['KF', 'KUK']);
  assert.ok(third && !['KF', 'KUK'].includes(third), third);
  assert.ok(third.length >= 2 && third.length <= 4);
});
test('the friendly screen uses it, and the scorer shows full names when codes match', () => {
  const sched = readFileSync(join(import.meta.dirname, '..', 'src/screens/ScheduleMatchScreen.tsx'), 'utf8');
  assert.match(sched, /uniqueShort\(name, /);
  const live = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
  assert.match(live, /homeName === awayName/);
});
