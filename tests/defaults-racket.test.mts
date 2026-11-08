/**
 * Racket sports: point detail on for new matches (docs/security/breaks/defaults-racket.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { trackFormatFields, detailLiveSettings } from '../src/sports/pointDetailSettings.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';

const SPORTS = ['badminton', 'tabletennis', 'squash', 'padel', 'pickleball'] as const;
const defaults = (sp: (typeof SPORTS)[number]) => Object.fromEntries(trackFormatFields(sp).map((f) => [f.key, f.default]));

describe('DR1 + DR4: new matches', () => {
  for (const sp of SPORTS) {
    test(sp, () => {
      const d = defaults(sp);
      assert.equal(d.pointDetail, true, 'point detail on');
      // founder 2026-11-08 (describe-done.md DD1): every stat to track is on for a new match
      for (const [k, v] of Object.entries(d)) if (typeof v === 'boolean') assert.equal(v, true, `${sp}.${k} on`);
      assert.equal(detailLiveSettings(sp).defaults!.pointDetail, true);
    });
  }
  test('a new badminton match asks how each rally ended', () => {
    assert.equal(badminton.init(defaults('badminton')).pointDetail, true);
  });
});

describe('DR2: old matches unchanged', () => {
  test('no key: off, as before', () => {
    assert.equal(badminton.init({}).pointDetail, undefined);
    assert.equal(padel.init({}).pointDetail, undefined);
  });
});

// DR3 pinned padel's serve tracking OFF until it had a Fault button; Batch 4a
// (docs/security/breaks/padel-fault.md PF7) added the button and turned it on.
describe('DR3: padel serve tracking is on now that it has a Fault button (padel-fault PF7)', () => {
  test('on for new padel matches; an old match without the key stays off', () => {
    assert.equal(defaults('padel').serveDetail, true);
    assert.equal(padel.init(defaults('padel')).serveDetail, true);
    assert.equal(padel.init({}).serveDetail, undefined);
  });
});
