/**
 * Tap feedback (2026-11-03, founder): every press responds; every scoring step
 * the reducer accepted is visibly (and on phones, physically) captured; a refused
 * tap never is. Break list: docs/security/breaks/tap-feedback.md.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  stepCaptured, shouldBuzz, motionPlan, nativeDriver, createCaptureBus, captureDispatch,
  scorePopped, PRESS_SCALE, PRESS_IN_MS, PRESS_OUT_MS, PULSE_MS, POP_MS,
} from '../src/core/tapCapture.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('T1/T2 stepCaptured: prev vs next', () => {
  test('the same state object is refused', () => {
    const s = { home: 1, away: 0 };
    assert.equal(stepCaptured(s, s), false);
  });
  test('a copy with every field unchanged is refused', () => {
    const pts = [1, 2];
    const s = { home: 1, away: 0, pts };
    assert.equal(stepCaptured(s, { ...s }), false);
  });
  test('a rebuilt list with nothing changed is refused (clearing a detail that was never set)', () => {
    const s = { home: 1, events: [{ id: 1, side: 'home' }] };
    assert.equal(stepCaptured(s, { ...s, events: s.events.map((e) => ({ ...e })) }), false);
  });
  test('a changed field, an added or removed key is captured', () => {
    const s = { home: 1, away: 0 };
    assert.equal(stepCaptured(s, { ...s, home: 2 }), true);
    assert.equal(stepCaptured(s, { ...s, pd: { how: 'w' } }), true);
    assert.equal(stepCaptured({ ...s, x: 1 }, s), true);
  });
  test('a new nested object (a detail chip) is captured', () => {
    const s = { home: 1, events: [{ id: 1 }] };
    assert.equal(stepCaptured(s, { ...s, events: [{ id: 1, pd: { how: 'fh' } }] }), true);
  });
  test('primitives and null', () => {
    assert.equal(stepCaptured(null, null), false);
    assert.equal(stepCaptured(1, 1), false);
    assert.equal(stepCaptured(1, 2), true);
    assert.equal(stepCaptured(null, {}), true);
    assert.equal(stepCaptured(NaN, NaN), false);
  });
});

describe('T4/T5/T6 shouldBuzz', () => {
  const base = { captured: true, hapticsOn: true, platform: 'ios', canScore: true } as const;
  test('a captured step on a phone buzzes', () => {
    assert.equal(shouldBuzz(base), true);
    assert.equal(shouldBuzz({ ...base, platform: 'android' }), true);
  });
  test('never on web, never with the preference off, never for a viewer, never when refused', () => {
    assert.equal(shouldBuzz({ ...base, platform: 'web' }), false);
    assert.equal(shouldBuzz({ ...base, hapticsOn: false }), false);
    assert.equal(shouldBuzz({ ...base, canScore: false }), false);
    assert.equal(shouldBuzz({ ...base, captured: false }), false);
  });
});

describe('T3/T8/T12 motion', () => {
  test('reduced motion: no scale, no pulse, a static tick', () => {
    const m = motionPlan(true);
    assert.equal(m.pressScale, 1);
    assert.equal(m.popScale, 1);
    assert.equal(m.pulse, false);
    assert.equal(m.tick, true);
  });
  test('full motion: a ~0.97 press, a pop and a pulse', () => {
    const m = motionPlan(false);
    assert.ok(m.pressScale >= 0.95 && m.pressScale < 1);
    assert.ok(m.popScale > 1 && m.popScale <= 1.2);
    assert.equal(m.pulse, true);
    assert.equal(m.tick, true);
  });
  test('timings stay quick (press 80–120 ms; everything under 250 ms)', () => {
    assert.equal(PRESS_SCALE, 0.97);
    for (const ms of [PRESS_IN_MS, PRESS_OUT_MS]) assert.ok(ms >= 80 && ms <= 120);
    for (const ms of [PULSE_MS, POP_MS]) assert.ok(ms > 0 && ms < 250);
  });
  test('native driver on phones, JS driver on web', () => {
    assert.equal(nativeDriver('ios'), true);
    assert.equal(nativeDriver('android'), true);
    assert.equal(nativeDriver('web'), false);
  });
  test('a score pops only when it changed (not on first draw)', () => {
    assert.equal(scorePopped(undefined, '0'), false);
    assert.equal(scorePopped('15', '15'), false);
    assert.equal(scorePopped('15', '30'), true);
  });
});

describe('T7/T11 captureDispatch + bus', () => {
  const reducer = (s: { n: number; over: boolean }, a: { type: string }) =>
    s.over ? s : a.type === 'PT' ? { ...s, n: s.n + 1 } : a.type === 'END' ? { ...s, over: true } : a.type === 'COPY' ? { ...s } : s;
  const make = () => {
    let state = { n: 0, over: false };
    const caps: string[] = [];
    const d = captureDispatch(() => state, (a: { type: string }) => { state = reducer(state, a); }, (a) => caps.push(a.type));
    return { d, caps, get: () => state };
  };
  test('an accepted step is captured once; refused ones never', () => {
    const { d, caps } = make();
    assert.equal(d({ type: 'PT' }), true);
    assert.equal(d({ type: 'NOPE' }), false);
    assert.equal(d({ type: 'COPY' }), false);
    assert.equal(d({ type: 'END' }), true);
    assert.equal(d({ type: 'PT' }), false, 'after the match is over');
    assert.deepEqual(caps, ['PT', 'END']);
  });
  test('two accepted fast taps confirm twice', () => {
    const { d, caps } = make();
    d({ type: 'PT' }); d({ type: 'PT' });
    assert.deepEqual(caps, ['PT', 'PT']);
  });
  test('a throwing confirm never breaks the step', () => {
    let state = { n: 0, over: false };
    const d = captureDispatch(() => state, (a: { type: string }) => { state = reducer(state, a); }, () => { throw new Error('unmounted'); });
    assert.equal(d({ type: 'PT' }), true);
    assert.equal(state.n, 1);
  });
  test('the bus: listeners hear each emit; a throwing one does not stop the others; unsubscribe works', () => {
    const bus = createCaptureBus();
    const got: number[] = [];
    const off = bus.subscribe(() => got.push(1));
    bus.subscribe(() => { throw new Error('x'); });
    bus.subscribe(() => got.push(2));
    bus.emit();
    off();
    bus.emit();
    assert.deepEqual(got, [1, 2, 2]);
  });
});

describe('source checks', () => {
  test('T8/T9 Button and SelectChip have the shared press state, respecting disabled', () => {
    const ui = read('src/components/ui.tsx');
    assert.match(ui, /usePressFeedback\(\{ disabled \}\)/);
    assert.equal(ui.match(/usePressFeedback\(/g)?.length, 2, 'Button and SelectChip');
    assert.match(ui, /useSelectAnim\(active/, 'a chip animates into its selected look');
  });
  test('PointButtons and SecondaryAction use it too', () => {
    const pb = read('src/sports/PointButtons.tsx');
    assert.ok((pb.match(/usePressFeedback\(/g)?.length ?? 0) >= 2);
    assert.doesNotMatch(pb, /pressed && pb\.pressed/, 'no hard press switch left');
  });
  test('the press hook: timing, reduced motion, native driver per platform', () => {
    const f = read('src/components/pressFeedback.tsx');
    assert.match(f, /useReduceMotion\(\)/);
    assert.match(f, /nativeDriver\(Platform\.OS\)/);
    assert.match(f, /if \(disabled\) return/);
  });
  test('reduced motion is read from AccessibilityInfo and followed live', () => {
    const r = read('src/core/reduceMotion.ts');
    assert.match(r, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
    assert.match(r, /reduceMotionChanged/);
  });
  test('T1/T6 LiveScoringScreen wraps the scoring dispatch in one place', () => {
    const live = read('src/screens/LiveScoringScreen.tsx');
    assert.match(live, /const scoreDispatch = useMemo\(\(\) => captureDispatch\(/);
    assert.match(live, /shouldBuzz\(\{ captured: true, hapticsOn: hapticsPref\.get\(\), platform: Platform\.OS, canScore/);
    assert.match(live, /captureBus\.emit\(\)/);
    assert.match(live, /<CapturedFlash/, 'the Undo bar pulses');
    assert.match(live, /state=\{state\} dispatch=\{scoreDispatch\}/, 'the sport controls get the wrapped dispatch');
    assert.match(live, /dispatch=\{quickDispatch\}/);
    assert.match(live, /quickDispatch = useCallback\(\(a: Parameters<typeof dispatch>\[0\]\) => \{ scoreDispatch\(a\)/);
  });
  test('T1 useLiveMatch no longer buzzes every dispatch (refused taps were felt)', () => {
    assert.doesNotMatch(read('src/data/useLiveMatch.ts'), /tapFeedback\(\)/);
  });
  test('the scoreboards pop the number that changed', () => {
    assert.match(read('src/components/Scoreboard.tsx'), /<PopNumber /);
    assert.match(read('src/components/LineScoreboard.tsx'), /<PopNumber /);
  });
  test('T10 the detail summary fades in', () => {
    assert.match(read('src/sports/PointDetailRow.tsx'), /<FadeInLine /);
    assert.match(read('src/sports/tennis/PointCapture.tsx'), /<FadeInLine /);
  });
});
