/** Volleyball — FIVB Official Rules 2025–2028 (docs/sport-expert/volleyball-rulebook.md VB-1):
 *  only the RECEIVING team can commit a positional (rotation) fault at the serve. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vbErrorTypesFor, VB_ERROR_TYPES } from '../src/sports/volleyball/engine.ts';

const keys = (x: { key: string }[]) => x.map((t) => t.key);

test('the winner served → the opponent was receiving → a rotation fault is possible', () => {
  assert.ok(keys(vbErrorTypesFor(true)).includes('rotation'));
});
test('the winner was receiving → the opponent served → no rotation fault (FIVB 2025)', () => {
  assert.ok(!keys(vbErrorTypesFor(false)).includes('rotation'));
  assert.equal(vbErrorTypesFor(false).length, VB_ERROR_TYPES.length - 1);
});
test('server unknown → every fault offered', () => {
  assert.deepEqual(keys(vbErrorTypesFor(null)), keys(VB_ERROR_TYPES));
});
