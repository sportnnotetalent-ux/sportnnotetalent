/**
 * The keyboard-safe fields' arithmetic (pure — see components/keyboard.tsx).
 */
import type { ViewStyle } from 'react-native';
import { theme } from '../core/theme.ts';

/** Space kept between a revealed field and the keyboard. */
export const REVEAL_MARGIN = 24;

/** The keyboard's top from an event, in the coordinates measureInWindow
 *  uses. iOS reports a keyboard leaving the screen as one that ends below it.
 *  Android reports the visible area's bottom from the very top of the screen
 *  (if that reads as the whole screen, fall back to the keyboard's height),
 *  but measures views from the top of the visible area — just under the
 *  status bar (RootViewUtil.getViewportOffset) — so `androidTopOffset` (the
 *  status bar's height) is taken off; without it the keyboard read one status
 *  bar too low and a field stopped half under it. */
export function keyboardTopOf(e: { endCoordinates?: { screenY: number; height: number } }, os: string, screenH: number, androidTopOffset = 0): number | null {
  const { screenY, height } = e.endCoordinates ?? { screenY: 0, height: 0 };
  if (!height || height <= 0) return null;
  if (os === 'ios') return screenY < screenH - 1 ? screenY : null;
  const top = screenY > 0 && screenY < screenH - 1 ? screenY : screenH - height;
  return top - androidTopOffset;
}

/** Where to scroll so a field at content y..y+h shows inside `visible` px of a
 *  scroll area scrolled to `offset` — or null when it already shows. A field
 *  taller than the space shows from its top. */
export function revealTarget(y: number, h: number, offset: number, visible: number, margin = REVEAL_MARGIN): number | null {
  let target: number | null = null;
  if (h + 2 * margin > visible) target = y >= offset && y + margin <= offset + visible ? null : Math.max(0, y - margin);
  else if (y + h + margin > offset + visible) target = y + h + margin - visible;
  else if (y - margin < offset) target = Math.max(0, y - margin);
  return target === offset ? null : target;
}

/** Where a sheet goes while one of its fields is focused (pure). */
export function sheetPlacement({ os, focused, top, winH, safeTop }: { os: string; focused: boolean; top: number | null; winH: number; safeTop: number }): {
  backdrop?: ViewStyle; sheet?: ViewStyle;
} {
  if (os === 'web' || !focused) return {};
  if (os === 'ios' && top != null && top < winH) {
    // lifted to sit on the keyboard, and no taller than the space above it
    return { backdrop: { paddingBottom: winH - top + 8 }, sheet: { maxHeight: Math.max(160, top - safeTop - 24) } };
  }
  if (os === 'android') {
    // a Modal window reports no keyboard: pin to the top, short enough to clear it
    return {
      backdrop: { justifyContent: 'flex-start', paddingTop: safeTop + 8 },
      sheet: { maxHeight: Math.round(winH * 0.4), borderRadius: theme.radius.lg },
    };
  }
  return {};
}

/** Reading order of two fields on screen: top to bottom, then left to right
 *  on the same row (within 4 px). */
export function fieldOrder(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.y - b.y) <= 4 ? a.x - b.x : a.y - b.y;
}
