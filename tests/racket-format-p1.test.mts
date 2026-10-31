/**
 * MVP racket P1s in the format editor (new matches; saved matches keep their
 * stored rules):
 *  - PB1 pickleball: a single game to 11 (rally / side-out) exists and is the
 *    friendly default; the best-of-3 "Rec" presets say so; Match length shows
 *    without Customize.
 *  - PD1 padel (and tennis): a single set can't silently become one 10-point
 *    tiebreak — choosing "Single set" resets the deciding set, and "Deciding
 *    set" hides while the match is one set.
 *  - B7 badminton: "Points per game" left blank or out of range is fixed when
 *    you leave the box (blank → default, else clamped); changing the points
 *    moves the deuce cap to points + 9.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fieldChanges, clampNumber, isHidden } from '../src/sports/formatPick.ts';
import { PICKLEBALL_FORMAT_FIELDS } from '../src/sports/pickleball/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import type { FormatField } from '../src/sports/types.ts';

const fld = (fields: FormatField[], k: string) => fields.find((f) => f.key === k)!;
const changes = (f: FormatField, v: number | string | boolean) => Object.fromEntries(fieldChanges(f, v));

describe('PB1 pickleball', () => {
  const preset = fld(PICKLEBALL_FORMAT_FIELDS, 'preset');
  test('one game to 11 (rally) is the friendly default; tournaments keep best of 3', () => {
    const def = preset.options!.find((o) => o.value === preset.default)!;
    assert.deepEqual(def.set, { scoring: 'rally', pointsPerGame: 11, winBy: 2, gamesToWin: 1 });
    assert.match(def.label, /1 game/);
    assert.equal(preset.tournamentDefault, 'traditional');
    assert.ok(preset.options!.some((o) => o.set?.scoring === 'sideout' && o.set?.pointsPerGame === 11 && o.set?.gamesToWin === 1), 'side-out single game to 11');
  });
  test('the best-of-3 rec presets say "best of 3" (values unchanged for saved matches)', () => {
    for (const v of ['rec', 'rec1']) {
      const o = preset.options!.find((x) => x.value === v)!;
      assert.equal(o.set?.gamesToWin, 2);
      assert.match(o.label, /best of 3/i, v);
    }
  });
  test('Match length is shown without Customize', () => {
    assert.ok(!fld(PICKLEBALL_FORMAT_FIELDS, 'gamesToWin').advanced);
  });
});

describe('PD1 padel / tennis: a single set stays a set', () => {
  test('padel: Single set resets the decider; the decider hides for one set', () => {
    const f = PADEL_META.formatFields!;
    assert.equal(changes(fld(f, 'setsToWin'), 1).decider, 'set');
    assert.equal(isHidden(fld(f, 'decider'), { setsToWin: 1 }), true);
    assert.equal(isHidden(fld(f, 'decider'), { setsToWin: 2 }), false);
  });
  test('tennis: Single set clears the deciding-set tiebreaks; they hide for one set', () => {
    const f = TENNIS_META.formatFields!;
    const c = changes(fld(f, 'setsToWin'), 1);
    assert.equal(c.finalSetTiebreak, 0);
    assert.equal(c.finalSetTBAt, 0);
    assert.equal(isHidden(fld(f, 'finalSetTiebreak'), { setsToWin: 1 }), true);
    assert.equal(isHidden(fld(f, 'finalSetTiebreak'), { setsToWin: 2 }), false);
  });
  test('tennis "Match tiebreak (to 10)" preset still sets its 10-point tiebreak', () => {
    const p = fld(TENNIS_META.formatFields!, 'preset').options!.find((o) => o.value === 'match_tb')!;
    assert.equal(p.set?.finalSetTiebreak, 10);
  });
});

describe('B7 badminton numbers', () => {
  const f = BADMINTON_META.formatFields!;
  const pts = fld(f, 'pointsPerGame');
  const cap = fld(f, 'cap');
  test('blank (0) → the default; out of range → clamped', () => {
    assert.equal(clampNumber(pts, 0), 21);
    assert.equal(clampNumber(pts, 3), 5);
    assert.equal(clampNumber(pts, 99), 30);
    assert.equal(clampNumber(pts, 15), 15);
    assert.equal(clampNumber(cap, 50), 40);
  });
  test('changing the points moves the cap to points + 9', () => {
    assert.equal(changes(pts, 21).cap, 30);
    assert.equal(changes(pts, 15).cap, 24);
    assert.equal(changes(pts, 11).cap, 20);
    assert.equal(changes(pts, 30).cap, 39);
  });
});

describe('the editor uses them', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/components/FormatEditor.tsx'), 'utf8');
  test('hidden fields are skipped, and a number is clamped when you leave the box', () => {
    assert.match(src, /isHidden\(field, value\)/);
    assert.match(src, /onBlur=\{\(\) => onChange\(clampNumber\(field, Number\(value\)\)\)\}/);
  });
});
