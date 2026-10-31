/**
 * MVP B4 / T6 — racket point buttons always put home on the left, but players
 * change ends (every game in badminton, every odd game in tennis), so the
 * button for the player on your left flipped. A per-device "⇄ Swap sides"
 * toggle now swaps the two buttons' places. It never changes which side a
 * button scores for, and it is never logged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sideOrder } from '../src/sports/courtCues.ts';

test('the order on screen: home first, or away first when swapped', () => {
  assert.deepEqual(sideOrder(false), ['home', 'away']);
  assert.deepEqual(sideOrder(true), ['away', 'home']);
});
test('PointButtons: a swap toggle that only reorders the buttons (local state, no dispatch)', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/PointButtons.tsx'), 'utf8');
  assert.match(src, /const \[swapped, setSwapped\] = useState\(false\)/);
  assert.match(src, /sideOrder\(swapped\)\.map\(big\)/);
  assert.match(src, /⇄ Swap sides/);
  const toggle = src.slice(src.indexOf('⇄ Swap sides') - 400, src.indexOf('⇄ Swap sides'));
  assert.doesNotMatch(toggle, /onPoint\(|dispatch/, 'swapping never scores or logs');
});
