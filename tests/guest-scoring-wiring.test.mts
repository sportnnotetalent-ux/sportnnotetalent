/**
 * Score first, sign up later — the wiring (docs/security/breaks/guest-scoring.md).
 * The claim logic itself is tested in guest-match.test.mts.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('G1: a way in without an account', () => {
  test('the sign-in screen offers "Score a game now" and resumes an unsaved game', () => {
    const src = read('src/screens/AuthScreen.tsx');
    assert.match(src, /label="Score a game now, no sign-up"/);
    assert.match(src, /nav\.navigate\('GuestGame'\)/);
    assert.match(src, /Continue your game: /);
  });
  test('the guest setup screen is public (signed in or out)', () => {
    const nav = read('src/navigation/RootNavigator.tsx');
    const pub = nav.slice(nav.indexOf('const publicScreens = ('), nav.indexOf('</>', nav.indexOf('const publicScreens = (')));
    assert.match(pub, /name="GuestGame"/);
  });
  test('only the MVP sports, and the game goes straight to scoring with a guest id (no match id)', () => {
    const src = read('src/screens/GuestGameScreen.tsx');
    assert.match(src, /GUEST_SPORTS: SportId\[\] = \['football', 'basketball', 'kabaddi', 'badminton', 'tennis', 'pickleball', 'padel'\]/);
    assert.match(src, /nav\.replace\('LiveScoring', \{ guestId: g\.id,/);
    assert.ok(!/matchId/.test(src));
  });
});

describe('G2 / G5: taps stay on the phone', () => {
  const hook = read('src/data/useLiveMatch.ts');
  test('a guest tap is saved on the device and returns before any server work', () => {
    const at = hook.indexOf('if (!matchId && guestId && guestRef.current');
    assert.ok(at > 0);
    const tail = hook.slice(at, hook.indexOf('if (!matchId || !canWrite) return;', at));
    assert.match(tail, /saveGuest\(appendGuestEvent\(/);
    assert.match(tail, /return;/);
    for (const server of ['recordStatLine', 'notify(', 'matchOutbox', 'pendingResults']) assert.ok(!tail.includes(server), server);
  });
  test('Undo and Restart work on the guest log', () => {
    assert.match(hook, /saveGuest\(popGuestEvent\(guestRef\.current\)\)/);
    assert.match(hook, /saveGuest\(\{ \.\.\.guestRef\.current, events: \[\], result: null \}\)/);
  });
  test('the screen never passes a guest id with a real match id', () => {
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /const guestId = matchId \? undefined : guestIdParam;/);
  });
});

describe('G4 / G6 / G7: saving it', () => {
  const src = read('src/screens/LiveScoringScreen.tsx');
  test('Share (header) and the bar both lead to Save & share as a guest', () => {
    assert.match(src, /onPress=\{\(\) => \(guestMode \? guestSaveRef\.current\(\) : shareRef\.current\(\)\)\}/);
    assert.match(src, /label=\{guestSaving \? 'Saving…' : authed \? 'Save to my account' : 'Save & share'\}/);
  });
  test('signed out: ask for an account; back signed in: claim only a game this person asked to save', () => {
    assert.match(src, /if \(!authed \|\| !profile\?\.id\) \{ promptSignIn\('up'\); return; \}/);
    assert.match(src, /if \(g\?\.id === guestId && g\.claimRequested\) void guestSaveRef\.current\(\)/);
  });
  test('after the claim: the real match, in place', () => {
    assert.match(src, /navigation\.replace\('LiveScoring', \{\s*matchId: id,/);
  });
  test('a hand-ended guest game keeps its result for the upload', () => {
    assert.match(src, /guestStore\.set\(\{ \.\.\.g, result: r \}\)/);
  });
  test('the claim creates by id (retry-safe) and uploads through the idempotent append', () => {
    const c = read('src/data/guestClaim.ts');
    assert.match(c, /createTeam: \(t\) => ensureTeamWithId\(t\)/);
    assert.match(c, /ensureFriendlyWithId\(/);
    assert.match(c, /uploadOne: \(id, e\) => appendMatchEvent\(id, e\)/);
    const r = read('src/data/repos.ts');
    assert.match(r, /const isDuplicate = \(e: \{ code\?: string \} \| null\) => e\?\.code === '23505';/);
  });
});
