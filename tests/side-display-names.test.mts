/**
 * MVP B3 / T5 — racket sides showed as initials ("RKAS" for a pair, "RK" for a
 * player) on the point buttons, the toss chips, the board and the game-point
 * chips. For singles and pairs the scorer now shows names: the player's name,
 * or the pair's first names ("Ravi / Arjun"). Team sports, and sides of 3+ or
 * with an unknown player, keep the stored side name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { entryDisplayName } from '../src/data/participantEntry.ts';

test('a player: their name; a pair: first names', () => {
  assert.equal(entryDisplayName(['Ravi Kumar']), 'Ravi Kumar');
  assert.equal(entryDisplayName(['Ravi Kumar', 'Arjun Singh']), 'Ravi / Arjun');
  assert.equal(entryDisplayName(['  Asha  Rao ', 'Ben Lee']), 'Asha / Ben');
});
test('same first names: add the surname initial', () => {
  assert.equal(entryDisplayName(['Ravi Kumar', 'Ravi Sharma']), 'Ravi K / Ravi S');
});
test('nothing usable, or 3+ players: undefined (keep the stored name)', () => {
  assert.equal(entryDisplayName([]), undefined);
  assert.equal(entryDisplayName(['', 'Arjun']), undefined);
  assert.equal(entryDisplayName(['A B', 'C D', 'E F']), undefined);
});
test('the scorer screen uses it for individual / pair sports only', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
  assert.match(src, /entryDisplayName\(/);
  // an omitted participantKind means a team sport (types.ts) — football, basketball, cricket… keep team names
  assert.match(src, /\(getSport\(sport\)\.participantKind \?\? 'team'\) !== 'team'/);
  // a disputed player's name stays masked: names go through the mask-aware lookup
  assert.match(src, /entryDisplayName\(homeScoreRoster\.map\(\(p\) => shownNameOf\(p\.id, p\.fullName\)\)\)/);
  assert.match(src, /makeNameOf\(people, maskValue\)/);
  assert.match(src, /plugin\.ScoringControls\s+state=\{state\} dispatch=\{dispatch\} homeName=\{homeShown\} awayName=\{awayShown\}/);
  assert.match(src, /<plugin\.Scoreboard state=\{state\} homeName=\{homeShown\} awayName=\{awayShown\}/);
});
