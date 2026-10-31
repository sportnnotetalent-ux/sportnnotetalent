/**
 * MVP F7 — with no lineup, the whole football squad counted as on the pitch,
 * so "Player ON (from the bench)" was empty and rolling subs couldn't be
 * logged. Now, with no lineup, everyone in the squad except the player going
 * off can come on (still never a player sent off; fixed subs still exclude
 * withdrawn players). With a lineup: unchanged.
 * MVP F8 (part) — Goal comes first on the scoring screen, above the voice
 * bar, the possession bar and Stoppage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchFor } from '../src/sports/football/actions.ts';

const squad = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
const none = new Set<string>();

test('no lineup: everyone but the player going off', () => {
  assert.deepEqual(benchFor({ squad, onIds: new Set(squad.map((p) => p.id)), hasLineup: false, offId: 'b', sentOff: none, withdrawn: none }).map((p) => p.id), ['a', 'c', 'd', 'e']);
});
test('no lineup: never a player sent off; fixed subs skip the withdrawn', () => {
  const b = benchFor({ squad, onIds: new Set(), hasLineup: false, offId: 'a', sentOff: new Set(['c']), withdrawn: new Set(['d']) });
  assert.deepEqual(b.map((p) => p.id), ['b', 'e']);
});
test('with a lineup: unchanged — squad minus those on the pitch', () => {
  const b = benchFor({ squad, onIds: new Set(['a', 'b', 'c']), hasLineup: true, offId: 'a', sentOff: none, withdrawn: none });
  assert.deepEqual(b.map((p) => p.id), ['d', 'e']);
});

const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/football/index.tsx'), 'utf8');
test('the screen uses it', () => {
  assert.match(src, /benchFor\(\{/);
});
test('F8: Goal comes before the voice bar, possession and Stoppage on the live screen', () => {
  const main = src.slice(src.lastIndexOf('  return (\n    <View style={{ gap: theme.spacing(4) }}>\n      {backfillBar}'));
  const goal = main.indexOf('<Text style={ctrl.label}>Goal</Text>');
  for (const later of ['{voiceBar}', '<PossessionBar', 'Stoppage / injury']) assert.ok(goal >= 0 && goal < main.indexOf(later), later);
});
