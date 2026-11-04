/** Table tennis — ITTF Laws 2026 (docs/sport-expert/tabletennis-rulebook.md TT-1):
 *  the expedite system "shall not be introduced in a game if at least 18 points
 *  have been scored" (2.15.2). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ttExpediteAllowed } from '../src/sports/tabletennis/serve.ts';

test('TT-1: blocked once 18 points are played in the game (games to 11)', () => {
  assert.equal(ttExpediteAllowed(9, 8), true, '17 played');
  assert.equal(ttExpediteAllowed(10, 8), false, '18 played — the old "both on 9" rule allowed this');
  assert.equal(ttExpediteAllowed(9, 9), false);
  assert.equal(ttExpediteAllowed(17, 0), true, 'impossible in play, but the count is what matters');
  assert.equal(ttExpediteAllowed(0, 0), true);
});

test('other game lengths scale the same way (2 × (target − 2))', () => {
  assert.equal(ttExpediteAllowed(5, 3, 7), true, '8 of 10');
  assert.equal(ttExpediteAllowed(6, 4, 7), false, '10 of 10');
  assert.equal(ttExpediteAllowed(13, 12, 21), true, '25 of 38');
  assert.equal(ttExpediteAllowed(20, 18, 21), false);
});
