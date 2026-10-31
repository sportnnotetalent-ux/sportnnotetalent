/**
 * MVP B2/T8 — in doubles a press longer than 350 ms opened "credit a player"
 * and scored nothing, silently. The hold is now 600 ms, buzzes with its own
 * pattern, and the chips say "Not scored yet". A quick tap still scores.
 * MVP B5/T7 — when the two sides' colours are too close to tell apart, the
 * scorer's view gives the away side a clearly different colour (the saved
 * colours don't change).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { distinctSideColors, colorGap } from '../src/core/contrast.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('long press', () => {
  const src = read('src/sports/PointButtons.tsx');
  test('waits 600 ms, buzzes, and says nothing was scored yet', () => {
    assert.match(src, /delayLongPress=\{600\}/);
    assert.match(src, /holdFeedback\(\)/);
    assert.match(src, /Not scored yet/);
  });
  test('a hold buzz exists on web and phone', () => {
    assert.match(read('src/core/haptics.ts'), /export const holdFeedback/);
    assert.match(read('src/core/haptics.native.ts'), /export function holdFeedback/);
  });
});

describe('side colours', () => {
  test('two clearly different colours are left alone', () => {
    assert.deepEqual(distinctSideColors('#FF5C5C', '#4DA3FF'), ['#FF5C5C', '#4DA3FF']);
  });
  test('the same or a near colour: away gets one far from home', () => {
    for (const [h, a] of [['#FF5C5C', '#FF5C5C'], ['#FF5C5C', '#FF6060'], ['#4DA3FF', '#5AC8FA']]) {
      const [h2, a2] = distinctSideColors(h, a);
      assert.equal(h2, h, 'home keeps its colour');
      assert.notEqual(a2, a);
      assert.ok(colorGap(h2, a2) > colorGap(h, a) && colorGap(h2, a2) >= 120, `${h} vs ${a2}`);
    }
  });
  test('unknown colours pass through', () => {
    assert.deepEqual(distinctSideColors(undefined, '#4DA3FF'), [undefined, '#4DA3FF']);
  });
  test('the scorer screen applies it once for every button and board', () => {
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /distinctSideColors\(homeColorIn, awayColorIn\)/);
  });
});
