/**
 * Tap feedback simulation (quality mandate step 6): 600 scorers each tap a
 * random sequence of steps — points, aces, faults, detail chips, kick-offs,
 * goals, plus refused ones (junk types, no side, taps after the end, double
 * taps) — through the real tennis / badminton / football reducers and the
 * screen's capture wrapper. Invariant: a step is captured (and confirmed)
 * exactly when the state changed; the buzz follows the platform / preference /
 * scorer rules. docs/security/breaks/tap-feedback.md
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as football from '../src/sports/football/engine.ts';
import { captureDispatch, shouldBuzz, createCaptureBus, motionPlan } from '../src/core/tapCapture.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: readonly T[]) => xs[rnd(xs.length)];
const SIDES = ['home', 'away', undefined] as const;

type Engine = { init: (c?: Record<string, unknown>) => unknown; reducer: (s: never, a: ScoreAction) => unknown };
const ENGINES: Array<{ name: string; e: Engine; step: () => ScoreAction }> = [
  {
    name: 'tennis', e: tennis as unknown as Engine,
    step: () => pick<() => ScoreAction>([
      () => ({ type: 'POINT', side: pick(SIDES) }),
      () => ({ type: 'POINT', side: pick(SIDES) }),
      () => ({ type: 'ACE', side: pick(SIDES) }),
      () => ({ type: 'FAULT', side: pick(SIDES) }),
      () => ({ type: 'SET_FIRST_SERVER', payload: { side: pick(SIDES) } }),
      () => ({ type: 'POINT_DETAIL', payload: { pd: pick([{ how: 'w' }, { how: 'ue' }, null]) } }),
      () => ({ type: 'NOPE' }),
      () => ({ type: 'STAT_ADJUST' }),
    ])(),
  },
  {
    name: 'badminton', e: badminton as unknown as Engine,
    step: () => pick<() => ScoreAction>([
      () => ({ type: 'POINT', side: pick(SIDES) }),
      () => ({ type: 'POINT', side: pick(SIDES) }),
      () => ({ type: 'SET_FIRST_SERVER', payload: { side: pick(SIDES) } }),
      () => ({ type: 'POINT_DETAIL', payload: { pd: pick([{ how: 'w' }, null]) } }),
      () => ({ type: 'JUNK', side: 'home' }),
    ])(),
  },
  {
    name: 'football', e: football as unknown as Engine,
    step: () => pick<() => ScoreAction>([
      () => ({ type: 'KICKOFF' }),
      () => ({ type: 'GOAL', side: pick(SIDES) }),
      () => ({ type: 'END' }),
      () => ({ type: 'NOPE' }),
    ])(),
  },
];

test('600 scorers: captured exactly when the state changed; the buzz follows its rules', () => {
  const bus = createCaptureBus();
  let heard = 0;
  bus.subscribe(() => { heard += 1; });
  let steps = 0, captured = 0, refused = 0, buzzes = 0, emitted = 0;
  for (let u = 0; u < 600; u++) {
    const { e, step } = ENGINES[u % ENGINES.length];
    const platform = pick(['ios', 'android', 'web'] as const);
    const hapticsOn = rnd(4) > 0;
    const canScore = rnd(10) > 0;
    let state = e.init();
    let confirmedThisStep = false;
    const d = captureDispatch(() => state, (a: ScoreAction) => { state = e.reducer(state as never, a); }, () => {
      confirmedThisStep = true;
      emitted += 1;
      bus.emit();
      if (shouldBuzz({ captured: true, hapticsOn, platform, canScore })) buzzes += 1;
    });
    const n = 20 + rnd(60);
    for (let i = 0; i < n; i++) {
      const a = step();
      const reps = rnd(8) === 0 ? 2 : 1; // a double tap sends the same step twice
      for (let r = 0; r < reps; r++) {
        const before = JSON.stringify(state);
        confirmedThisStep = false;
        const got = d(a);
        const changed = JSON.stringify(state) !== before;
        assert.equal(got, changed, `user ${u} step ${i} ${a.type}: captured ${got} but changed ${changed}`);
        assert.equal(confirmedThisStep, changed, 'confirmed only when captured');
        if (!changed && platform !== 'web' && hapticsOn && canScore) {
          assert.equal(shouldBuzz({ captured: false, hapticsOn, platform, canScore }), false, 'a refused tap never buzzes');
        }
        steps += 1;
        if (got) captured += 1; else refused += 1;
      }
    }
    if (platform === 'web' || !hapticsOn || !canScore) {
      assert.equal(shouldBuzz({ captured: true, hapticsOn, platform, canScore }), false);
    }
  }
  assert.equal(heard, emitted, 'every captured step reached the Undo bar');
  assert.ok(steps > 20000, `steps ${steps}`);
  assert.ok(captured > 1000 && refused > 1000, `a real mix: ${captured} captured, ${refused} refused`);
  assert.ok(buzzes > 0 && buzzes < captured, 'some captured steps buzz, never on web / preference off / viewer');
  // reduced motion keeps the tick for everyone, never the motion
  for (let i = 0; i < 500; i++) {
    const m = motionPlan(rnd(2) === 0);
    assert.equal(m.tick, true);
    if (!m.pulse) assert.equal(m.popScale * m.pressScale, 1);
  }
});
