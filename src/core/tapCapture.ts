/**
 * Tap feedback (2026-11-03, founder) — the pure rules behind "the scorer can
 * see (and feel) that a step was captured". No React Native here, so it is
 * unit-tested and simulated (tests/tap-feedback, tests/sim-tap-feedback).
 * Break list: docs/security/breaks/tap-feedback.md.
 */

/** Press state: a quick scale-down (and dim) while a finger is on a control. */
export const PRESS_SCALE = 0.97;
export const PRESS_IN_MS = 80;
export const PRESS_OUT_MS = 120;
/** Undo bar pulse (in + out) and the scoreboard number pop (up + back). */
export const PULSE_MS = 220;
export const POP_MS = 200;
/** How long the ✓ stays on the Undo bar after a captured step. */
export const TICK_MS = 1200;

/**
 * A step counts as captured only when the reducer changed the state. A refused
 * tap (match over, wrong phase) returns the same state — or, in some reducers, a
 * copy with nothing changed (a "clear the detail" on a point that had none
 * rebuilds the events list) — and must never confirm (T1/T2).
 * A structural compare that stops at shared references: reducers keep every
 * unchanged branch, so only the rebuilt path is walked (cheap on a big state).
 */
export function stepCaptured(prev: unknown, next: unknown): boolean {
  return !same(prev, next, 0);
}

function same(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (depth > 64) return false; // never walk a pathological state forever: count it as changed
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const kx = Object.keys(x);
  if (kx.length !== Object.keys(y).length) return false;
  for (const k of kx) {
    if (!Object.prototype.hasOwnProperty.call(y, k) || !same(x[k], y[k], depth + 1)) return false;
  }
  return true;
}

/** The captured buzz: phones only (never web), the haptics preference on, a
 *  scorer (not a viewer), and only for a step that was captured (T4–T6). */
export function shouldBuzz(o: { captured: boolean; hapticsOn: boolean; platform: string; canScore: boolean }): boolean {
  return o.captured && o.hapticsOn && o.canScore && o.platform !== 'web';
}

/** Reduced motion (T3): no scale, no pulse — the ✓ still shows, without moving. */
export function motionPlan(reduceMotion: boolean): { pressScale: number; popScale: number; pulse: boolean; tick: true } {
  return reduceMotion
    ? { pressScale: 1, popScale: 1, pulse: false, tick: true }
    : { pressScale: PRESS_SCALE, popScale: 1.12, pulse: true, tick: true };
}

/** Native driver on phones; react-native-web has none (T12). */
export const nativeDriver = (platform: string) => platform !== 'web';

/** A scoreboard number pops when it changed — never on its first draw. */
export const scorePopped = (prev: string | undefined, next: string) => prev !== undefined && prev !== next;

/** A tiny pub/sub so the Undo bar can pulse without re-rendering the screen (T8). */
export function createCaptureBus() {
  const listeners = new Set<() => void>();
  let last = 0;
  return {
    /** when the last step was captured (a bar mounting on that step still shows it) */
    lastAt: () => last,
    emit() {
      last = Date.now();
      for (const l of [...listeners]) {
        try { l(); } catch { /* an animation on an unmounted view never breaks scoring (T11) */ }
      }
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
/** The live scoring screen's bus (one scoring screen at a time). */
export const captureBus = createCaptureBus();

/**
 * Wrap a dispatch so each step that changed the state calls `onCaptured`
 * (synchronously: `getState` reads the state ref the dispatch just wrote).
 * Returns whether the step was captured. A throwing `onCaptured` is swallowed —
 * the step is already applied (T11).
 */
export function captureDispatch<A>(
  getState: () => unknown,
  dispatch: (a: A) => void,
  onCaptured: (a: A, prev: unknown, next: unknown) => void,
): (a: A) => boolean {
  return (a: A) => {
    const prev = getState();
    dispatch(a);
    const next = getState();
    const captured = stepCaptured(prev, next);
    if (captured) {
      try { onCaptured(a, prev, next); } catch { /* feedback only */ }
    }
    return captured;
  };
}
