/** Padel — FIP Rules of Padel 2026 (docs/sport-expert/padel-rulebook.md PD-1/PD-2). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDefaults } from '../src/sports/formatPick.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';

test('PD-1: a new tournament starts on the Star Point (FIP events from 2026); friendlies keep golden point', () => {
  assert.equal(formatDefaults(PADEL_META.formatFields!, 'tournament').deuce, 'star');
  assert.equal(formatDefaults(PADEL_META.formatFields!).deuce, 'golden');
});

test('PD-2: the golden point cue says the receiving pair chooses (Rule 1, option 3.2)', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/padel/index.tsx'), 'utf8');
  assert.match(src, /Golden point — next point wins the game\. The receiving pair chooses who receives\./);
});
