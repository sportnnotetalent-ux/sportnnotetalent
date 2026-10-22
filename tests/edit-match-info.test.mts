/** "Edit match info" saves only what the host changed — re-saving an older
 *  match must not stamp it with defaults it never had. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedFormatKeys } from '../src/core/matchConfig.ts';

test('untouched form saves nothing (no newer defaults written)', () => {
  const shown = { quarters: 4, trackZones: true, cpr: 4 };
  assert.deepEqual(changedFormatKeys(shown, { ...shown }), {});
});

test('only the edited keys are saved', () => {
  const shown = { quarters: 4, trackZones: true, quarterMins: 10 };
  assert.deepEqual(changedFormatKeys(shown, { ...shown, quarterMins: 12, trackZones: false }), { quarterMins: 12, trackZones: false });
});
