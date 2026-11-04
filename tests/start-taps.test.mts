/** Fewer taps to start (docs/security/breaks/start-taps.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoStartOnArrival, startStep } from '../src/core/startStep.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const ok = { asked: true, canScore: true, started: false, complete: false };

test('ST1/ST2: auto-start only when asked, for a scorer, before play, for plain / clock starts', () => {
  assert.equal(autoStartOnArrival(startStep('snooker' as any), ok), true);
  assert.equal(autoStartOnArrival(startStep('cricket' as any), ok), true);
  assert.equal(autoStartOnArrival(startStep('kabaddi' as any), ok), true);
  assert.equal(autoStartOnArrival(startStep('badminton' as any), ok), false, 'asks who serves');
  assert.equal(autoStartOnArrival(startStep('pool' as any), ok), false, 'asks who breaks');
  for (const k of ['asked', 'canScore'] as const) assert.equal(autoStartOnArrival('plain', { ...ok, [k]: false }), false, k);
  for (const k of ['started', 'complete'] as const) assert.equal(autoStartOnArrival('plain', { ...ok, [k]: true }), false, k);
});

test('wiring: create-and-score asks; the screen waits for load, guards once, clears the flag', () => {
  assert.match(read('src/screens/ScheduleMatchScreen.tsx'), /canScore: true, startNow: true/);
  const live = read('src/screens/LiveScoringScreen.tsx');
  assert.match(live, /if \(autoStarted\.current \|\| !loaded\) return;/);
  assert.match(live, /navigation\.setParams\(\{ startNow: undefined \}\)/);
});

test('ST5: cricket opens scoring after the toss; captain & keeper optional and reachable', () => {
  const c = read('src/sports/cricket/index.tsx');
  assert.match(c, /if \(!configured && \(!state\.toss \|\| setupOpen\)\)/);
  assert.match(c, /Set captain & keeper/);
});

test('ST6: an answered serve question folds to one line with Change', () => {
  assert.match(read('src/sports/PointButtons.tsx'), /if \(!started && picked && !open\)/);
});

test('#5: the "me" shortcut reads as an action, not a filled slot', () => {
  assert.match(read('src/screens/ScheduleMatchScreen.tsx'), /label=\{`＋ Me \(\$\{meFirst\}\)`\}/);
});
