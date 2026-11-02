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
      for (const [k, v] of Object.entries(d)) if (typeof v === 'boolean' && k !== 'pointDetail') assert.equal(v, false, `${sp}.${k} stays off`);
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

describe('DR3: padel serve tracking waits for the Fault button', () => {
  test('off for new padel matches', () => {
    assert.equal(defaults('padel').serveDetail, false);
    assert.notEqual(padel.init(defaults('padel')).serveDetail, true);
  });
});
