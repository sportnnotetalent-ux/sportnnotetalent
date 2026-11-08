/** UI audit step 3: lime marks one main action per screen
 *  (docs/design/ui-audit.md #16, #20, #23, #28, #34). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

test('a match card’s own button is an outline, and no "Tap to score" beside it', () => {
  const c = read('src/components/MatchCard.tsx');
  assert.doesNotMatch(c, /startBtn: \{ backgroundColor: theme\.colors\.lime/);
  assert.match(c, /live && !onStart \? <Text style=\{s\.cta\}>Live scorecard/); // TP6 (stitch-tournament-page.md)
});

test('Follow, Post a listing and Continue your game are outline buttons', () => {
  assert.doesNotMatch(read('src/screens/TeamProfileScreen.tsx'), /variant=\{following \? 'ghost' : 'primary'\}/);
  assert.doesNotMatch(read('src/screens/TournamentProfileScreen.tsx'), /variant=\{following \? 'ghost' : 'primary'\}/);
  assert.doesNotMatch(read('src/screens/ClubHomeScreen.tsx'), /variant=\{follow\.following \? 'ghost' : 'primary'\}/);
  assert.match(read('src/components/ConnectBoard.tsx'), /Post a listing" variant="ghost"/);
  const a = read('src/screens/AuthScreen.tsx');
  assert.match(a, /<Button variant="ghost" label=\{`Continue your game/);
  assert.match(a, /Score a game now, no sign-up" variant="ghost"/);
});

test('sign-in: with phone on, the email form uses the secondary style', () => {
  const a = read('src/screens/AuthScreen.tsx');
  assert.match(a, /const emailSecondary = phoneLoginAvailable\(\) \? \('brand' as const\) : undefined;/);
  assert.equal((a.match(/variant=\{emailSecondary\}/g) ?? []).length, 3);
});
