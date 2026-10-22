/** Keyboard-safe fields (2026-10-22): the arithmetic behind keeping a focused
 *  field above the on-screen keyboard (src/components/keyboardMath.ts). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldOrder, keyboardTopOf, revealTarget, sheetPlacement, REVEAL_MARGIN } from '../src/components/keyboardMath.ts';

const ev = (screenY: number, height: number) => ({ endCoordinates: { screenY, height } });

describe('keyboard top', () => {
  test('iOS: the reported top; a keyboard leaving the screen is down', () => {
    assert.equal(keyboardTopOf(ev(508, 336), 'ios', 844), 508);
    assert.equal(keyboardTopOf(ev(844, 336), 'ios', 844), null);
  });
  test('Android: the visible area bottom; if it reads as the whole screen, from the height', () => {
    assert.equal(keyboardTopOf(ev(470, 300), 'android', 840), 470);
    assert.equal(keyboardTopOf(ev(840, 300), 'android', 840), 540);
  });
  test('Android: in the coordinates views are measured in (from under the status bar)', () => {
    // a 36 dp status bar: the keyboard's top at 470 on screen is 434 for measureInWindow
    assert.equal(keyboardTopOf(ev(470, 300), 'android', 840, 36), 434);
    assert.equal(keyboardTopOf(ev(840, 300), 'android', 840, 36), 504);
    assert.equal(keyboardTopOf(ev(508, 336), 'ios', 844, 36), 508); // iOS measures from the screen top
  });
  test('no height = no keyboard', () => {
    assert.equal(keyboardTopOf(ev(500, 0), 'android', 840), null);
    assert.equal(keyboardTopOf({}, 'ios', 844), null);
  });
});

describe('reveal the focused field', () => {
  const M = REVEAL_MARGIN;
  test('a field under the keyboard scrolls up to sit just above it', () => {
    // visible 400 px from offset 0; field at 500..548
    assert.equal(revealTarget(500, 48, 0, 400), 500 + 48 + M - 400);
  });
  test('a field already in view stays put', () => {
    assert.equal(revealTarget(100, 48, 0, 400), null);
  });
  test('a field scrolled above the view comes back down into it', () => {
    assert.equal(revealTarget(100, 48, 300, 400), 100 - M);
  });
  test('a field taller than the space shows from its top', () => {
    assert.equal(revealTarget(500, 380, 0, 400), 500 - M);
    assert.equal(revealTarget(500, 380, 480, 400), null); // its top already shows
  });
  test('no scroll when the answer is where it already is', () => {
    assert.equal(revealTarget(10, 48, 0, 400), null);
  });
});

describe('pop-up sheets', () => {
  const base = { winH: 844, safeTop: 47 };
  test('nothing while no field in the sheet is focused, and nothing on web', () => {
    assert.deepEqual(sheetPlacement({ ...base, os: 'ios', focused: false, top: 508 }), {});
    assert.deepEqual(sheetPlacement({ ...base, os: 'web', focused: true, top: 508 }), {});
  });
  test('iOS: lifted onto the keyboard, no taller than the space above it', () => {
    const p = sheetPlacement({ ...base, os: 'ios', focused: true, top: 508 });
    assert.equal(p.backdrop?.paddingBottom, 844 - 508 + 8);
    assert.equal(p.sheet?.maxHeight, 508 - 47 - 24);
  });
  test('Android (a Modal reports no keyboard): pinned to the top and short enough to clear it', () => {
    const p = sheetPlacement({ winH: 800, safeTop: 24, os: 'android', focused: true, top: null });
    assert.equal(p.backdrop?.justifyContent, 'flex-start');
    assert.equal(p.backdrop?.paddingTop, 32);
    assert.equal(p.sheet?.maxHeight, 320);
    // even a tall keyboard (45% of the screen, under the status bar) clears it
    assert.ok(32 + 320 <= 800 * 0.55);
  });
});

describe('keyboard "Next" order', () => {
  test('top to bottom, then left to right on the same row', () => {
    const fields = [
      { id: 'phone', x: 16, y: 640 },
      { id: 'city', x: 16, y: 420 },
      { id: 'pin', x: 200, y: 421 }, // beside City (1 px off the row)
      { id: 'name', x: 16, y: 120 },
    ];
    assert.deepEqual([...fields].sort(fieldOrder).map((f) => f.id), ['name', 'city', 'pin', 'phone']);
  });
});
