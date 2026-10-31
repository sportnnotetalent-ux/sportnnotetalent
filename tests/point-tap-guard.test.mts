/**
 * MVP PB4 / PD4 (all racket sports share PointButtons): two quick taps logged
 * two rallies. A second tap on either point button within 400 ms is ignored,
 * and the button that counted flashes a tick.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tapGuard, TAP_GUARD_MS } from '../src/core/tapGuard.ts';

test('a second tap inside 400 ms is ignored; after it, taps count again', () => {
  const ok = tapGuard();
  assert.equal(TAP_GUARD_MS, 400);
  assert.equal(ok(1000), true);
  assert.equal(ok(1100), false);
  assert.equal(ok(1399), false);
  assert.equal(ok(1400), true);
  assert.equal(ok(5000), true);
});
test('real rallies (seconds apart) all count', () => {
  const ok = tapGuard();
  let n = 0;
  for (let t = 0; t < 60_000; t += 1500) if (ok(t)) n++;
  assert.equal(n, 40);
});
test('PointButtons uses it on both big buttons and shows a tick', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/PointButtons.tsx'), 'utf8');
  assert.match(src, /tapGuard\(\)/);
  assert.match(src, /if \(!guard\(\)\) return;/);
  assert.match(src, /flash === s/);
});
