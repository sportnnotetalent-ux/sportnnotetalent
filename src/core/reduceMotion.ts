/** Tap feedback (2026-11-03): the OS "Reduce motion" / "Remove animations"
 *  setting, read once and followed live. With it on, presses and captured steps
 *  don't scale or pulse — the ✓ still shows (docs/security/breaks/tap-feedback.md T3). */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reduce = false;
let started = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  if (v === reduce) return;
  reduce = v;
  listeners.forEach((l) => l());
};

function start() {
  if (started) return;
  started = true;
  try {
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => set(!!v)).catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => set(!!v));
  } catch { /* not available here — full motion */ }
}

const subscribe = (fn: () => void) => {
  start();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
const snap = () => reduce;

export const useReduceMotion = () => useSyncExternalStore(subscribe, snap, snap);
