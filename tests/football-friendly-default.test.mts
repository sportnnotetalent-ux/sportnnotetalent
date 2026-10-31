/**
 * MVP F3 (founder, 2026-10-31: 5-a-side): a football friendly defaulted to
 * 11-a-side with 45-minute halves, so turf games got wrong minutes played,
 * goals per 90 and stamps from 46'. Friendlies now start on "5s turf"
 * (5 a side, 20-minute halves); tournaments keep 11-a-side. Saved matches
 * keep the format they were created with.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';

const preset = FOOTBALL_META.formatFields!.find((f) => f.key === 'preset')!;
test('friendlies start on 5s turf; tournaments on 11-a-side', () => {
  assert.equal(preset.default, 'fives');
  assert.equal(preset.tournamentDefault, 'eleven');
  const fives = preset.options!.find((o) => o.value === 'fives')!.set!;
  assert.equal(fives.playersPerSide, 5);
  assert.equal(fives.halfMinutes, 20);
});
test('editing a tournament match fills missing keys with the tournament default', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
  assert.match(src, /defaultsFor\(getSport\(sport\)\.formatFields \?\? \[\], meta\.tournamentId \? 'tournament' : undefined\)/);
});
