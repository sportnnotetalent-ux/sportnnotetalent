/** One top bar, name → Home (docs/security/breaks/brand-bar.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barPlacement, isWideWeb, TAB_ROOTS, brandHeight, BAR_ICON, BAR_GAP, BAR_PAD } from '../src/core/brandBar.ts';
import { WORDMARK } from '../src/brand/wordmark.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TAB_FILES = ['Matches', 'Organize', 'Discover', 'Profile'].map((s) => `src/screens/${s}Screen.tsx`);

test('BB1/BB11: the name is a labelled button that opens Home, and does nothing on Home', () => {
  const s = read('src/components/BrandBar.tsx');
  assert.match(s, /accessibilityLabel="SportnNote, go to Home"/);
  assert.match(s, /go\('Tabs', \{ screen: 'Home'/);
  assert.match(s, /onHome \? undefined|if \(onHome\) return/);
});

test('BB2: Home uses the same bar, with no header of its own', () => {
  const s = read('src/screens/HomeScreen.tsx');
  assert.match(s, /<BrandBar /);
  assert.doesNotMatch(s, /<Search |<Bell |<Menu /);
  for (const f of TAB_FILES) assert.match(read(f), /<BrandBar /, f);
});

test('BB3/BB4/BB5: where the bar shows', () => {
  // phones: tab screens draw it, the root never does
  for (const r of TAB_ROOTS) assert.deepEqual(barPlacement({ os: 'ios', width: 390, authed: true, route: r }), { root: false, screen: true });
  for (const r of ['LiveScoring', 'Match', 'TournamentProfile']) assert.deepEqual(barPlacement({ os: 'android', width: 390, authed: true, route: r }), { root: false, screen: false });
  // phone-width web behaves like a phone
  assert.deepEqual(barPlacement({ os: 'web', width: 390, authed: true, route: 'Match' }), { root: false, screen: false });
  // wide web: one bar, drawn by the root, on every signed-in screen
  for (const r of [...TAB_ROOTS, 'Match', 'LiveScoring']) assert.deepEqual(barPlacement({ os: 'web', width: 1280, authed: true, route: r }), { root: true, screen: false });
  // never for guests or on sign-in / first-run screens
  for (const r of ['Auth', 'Legal', 'Personalise']) assert.deepEqual(barPlacement({ os: 'web', width: 1280, authed: true, route: r }), { root: false, screen: false });
  assert.deepEqual(barPlacement({ os: 'web', width: 1280, authed: false, route: 'Match' }), { root: false, screen: false });
  assert.equal(isWideWeb('web', 1024), true);
  assert.equal(isWideWeb('web', 1023), false);
  assert.equal(isWideWeb('ios', 1366), false, 'iPad keeps the tab bar layout');
});

test('BB4: the root draws the bar on wide web', () => {
  const s = read('src/navigation/RootNavigator.tsx');
  assert.match(s, /barPlacement\(/);
  assert.match(s, /<RootBrandBar /);
});

test('BB6: the menu works away from Home', () => {
  const s = read('src/components/BrandBar.tsx');
  assert.match(s, /go\('Tabs', \{ screen: 'Home', params: \{ voice: true \} \}\)/);
  assert.match(s, /canStartFriendly/);
  assert.match(read('src/navigation/types.ts'), /Home: \{ voice\?: boolean \} \| undefined;/);
  assert.match(read('src/screens/HomeScreen.tsx'), /params\?\.voice/);
});

test('BB7/BB8: light status bar while focused; one unread count', () => {
  const s = read('src/components/BrandBar.tsx');
  assert.match(s, /setStatusBarStyle\('light'\)/);
  assert.match(s, /useNotifications\(\)/);
});

test('BB9: the top inset is added once, by the bar', () => {
  assert.match(read('src/components/BrandBar.tsx'), /insets\.top/);
  for (const f of TAB_FILES) assert.doesNotMatch(read(f), /edges=\{\['top'\]\}/, f);
});

test('BB10: the name and three buttons fit on a 320 px phone', () => {
  const h = brandHeight(320);
  assert.equal(h, 24);
  const nameW = (WORDMARK.width / WORDMARK.height) * h + 4 + 8; // badge padding
  assert.ok(nameW + 3 * BAR_ICON + 3 * BAR_GAP + 2 * BAR_PAD <= 320, `${nameW}`);
  assert.equal(brandHeight(430), 27);
});
