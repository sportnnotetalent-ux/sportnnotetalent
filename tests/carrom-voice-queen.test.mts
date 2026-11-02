/**
 * Carrom voice under ICF rules: the Queen is always covered (or returned)
 * before a board ends, so a spoken board must say who covered it — the same
 * rule the buttons follow (docs/security/breaks/cue-board-batch1.md, follow-on).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromVoice } from '../src/sports/voiceParsers.ts';
import type { VoiceContext } from '../src/sports/voiceParsers.ts';

const ctx = (state: unknown): VoiceContext => ({ state, homeName: 'Hawks', awayName: 'Owls', homeRoster: [], awayRoster: [] } as VoiceContext);
const payload = (t: string, s: unknown) => carromVoice(t, ctx(s))?.[0]?.payload;

describe('carrom voice: the Queen under ICF rules', () => {
  const icf = carrom.init({ preset: 'icf' });
  test('a board that doesn\'t say who covered the Queen is not taken', () => {
    assert.equal(carromVoice('board Hawks 3', ctx(icf)), null);
  });
  test('"queen": the winner covered it; "no queen": the loser did', () => {
    assert.equal(payload('board Hawks 3 queen', icf)!.queenBy, 'winner');
    assert.equal(payload('board Hawks 3 no queen', icf)!.queenBy, 'loser');
    assert.equal(payload('board Hawks 3 no queen', icf)!.queen, false);
  });
  test('a penalty needs no Queen', () => {
    assert.equal(payload('penalty Hawks', icf)!.penalty, true);
  });
  test('other rules: unchanged (no Queen word = not covered by the winner)', () => {
    const club = carrom.init({});
    assert.equal(payload('board Hawks 3', club)!.queen, false);
    assert.equal(payload('board Hawks 3 queen', club)!.queenBy, 'winner');
  });
});
