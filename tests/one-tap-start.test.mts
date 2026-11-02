/**
 * One-tap start (docs/security/breaks/one-tap-start.md): "Start the match"
 * asks the sport's first question itself — racket sports "▶ X serves",
 * kabaddi starts its clock — so the match starts in one tap, logging exactly
 * what the two taps logged.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startStep, startActions } from '../src/core/startStep.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import * as kabaddi from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

describe('which first question', () => {
  for (const s of ['badminton', 'tennis', 'padel', 'pickleball', 'squash', 'tabletennis'] as const) test(`${s}: who serves`, () => assert.equal(startStep(s), 'serve'));
  test('kabaddi: the clock', () => assert.equal(startStep('kabaddi'), 'clock'));
  for (const s of ['football', 'basketball', 'cricket', 'volleyball'] as const) test(`${s}: unchanged`, () => assert.equal(startStep(s), 'plain'));
});

describe('the same events as the two taps', () => {
  test('serve: exactly SET_FIRST_SERVER for the side', () => {
    assert.deepEqual(startActions('serve', { side: 'away', now: 5 }), [{ type: 'SET_FIRST_SERVER', payload: { side: 'away' } }]);
  });
  test('clock: exactly KICKOFF at now', () => {
    assert.deepEqual(startActions('clock', { now: 5 }), [{ type: 'KICKOFF', payload: { at: 5 } }]);
  });
  test('plain: nothing (the sport asks its own step)', () => assert.deepEqual(startActions('plain', { now: 5 }), []));
  const rally = makeRallyEngine({ icon: '', sideOutValue: '__n/a__', sideOutLabel: '', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
  for (const [name, e] of [['badminton', badminton], ['tennis', tennis], ['padel', padel], ['rally (pickleball/squash/TT)', rally]] as const) {
    test(`${name}: the pick unlocks scoring with that server`, () => {
      const r = (e as { reducer: (s: unknown, a: ScoreAction) => Record<string, unknown> }).reducer;
      const s0 = (e as { init: (c?: object) => unknown }).init({});
      const s = startActions('serve', { side: 'away', now: 1 }).reduce((x, a) => r(x, a), s0) as Record<string, unknown>;
      assert.equal(s.serverPicked, true);
    });
  }
  test('kabaddi: the clock runs', () => {
    const s = startActions('clock', { now: 1000 }).reduce((x, a) => kabaddi.reducer(x, a), kabaddi.init({}));
    assert.equal(s.startedAt, 1000);
  });
});

test('the screen: one tap starts and answers (also after "Start anyway")', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
  assert.match(src, /const firstStep = startStep\(sport\)/);
  assert.match(src, /accessibilityLabel=\{`Start the match: \$\{side === 'home' \? homeShown : awayShown\} \$\{firstStep === 'breaks' \? 'breaks' : 'serves'\} first`\}/);
  assert.match(src, /const beginMatch = \(side\?: 'home' \| 'away'\) => \{/);
  assert.match(src, /onPress=\{\(\) => \{ setUnevenAsk\(null\); beginMatch\(unevenSide\); \}\}/);
});
