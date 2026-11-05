/** iPad: content sits in a readable column on wide screens; wide tables keep
 *  the full width (docs/security/breaks/ipad.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READABLE_MAX_WIDTH, FULL_WIDTH_SCREENS, readableContentStyle, stackContentStyle, columnWidth } from '../src/core/readableWidth.ts';

test('IP1: ordinary screens get a centred column capped at the readable width', () => {
  assert.deepEqual(readableContentStyle('Tournament'), { width: '100%', maxWidth: READABLE_MAX_WIDTH, alignSelf: 'center' });
  assert.deepEqual(readableContentStyle('EditProfile'), readableContentStyle('Tournament'));
});

test('IP1/IP5: phones, iPad portrait and Split View are untouched (the cap is wider than them)', () => {
  for (const w of [320, 375, 430, 507, 744, 768, 820, 834]) assert.equal(columnWidth(w, 'Tournament'), w, `${w} pt`);
  assert.equal(columnWidth(1180, 'Tournament'), READABLE_MAX_WIDTH, 'iPad Air landscape');
  assert.equal(columnWidth(1366, 'Home'), READABLE_MAX_WIDTH, 'iPad Pro landscape');
});

test('IP2: wide screens keep the full width', () => {
  for (const s of ['Bracket', 'MeetTimetable', 'GolfRound', 'SupportConsole', 'UsageDashboard']) {
    assert.ok(FULL_WIDTH_SCREENS.has(s), s);
    assert.equal(readableContentStyle(s), undefined, s);
    assert.equal(columnWidth(1180, s), 1180, s);
  }
});

test('IP2: every full-width name is a real screen (a rename cannot silently drop one)', () => {
  const nav = readFileSync(new URL('../src/navigation/RootNavigator.tsx', import.meta.url), 'utf8');
  for (const s of FULL_WIDTH_SCREENS) assert.match(nav, new RegExp(`name="${s}"`), `${s} is not a stack screen`);
});

test('IP1: the stack and the tabs both apply the column', () => {
  const nav = readFileSync(new URL('../src/navigation/RootNavigator.tsx', import.meta.url), 'utf8');
  assert.match(nav, /contentStyle: stackContentStyle\(route\.name\)/, 'stack screens');
  assert.match(nav, /sceneStyle: readableContentStyle\('Tabs'\)/, 'tab screens');
});

test('IP1: the tab bar stays full width — the tab host is not narrowed, its scenes are', () => {
  assert.equal(stackContentStyle('Tabs'), undefined);
  assert.deepEqual(readableContentStyle('Tabs'), readableContentStyle('Tournament'));
  assert.deepEqual(stackContentStyle('Tournament'), readableContentStyle('Tournament'));
  assert.equal(stackContentStyle('Bracket'), undefined);
});

test('IP3: standings sit in the column and size from their own box, not the window', () => {
  assert.ok(readableContentStyle('Standings'));
  const src = readFileSync(new URL('../src/screens/StandingsScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /onLayout=\{\(e\) => \{ const w = Math\.round\(e\.nativeEvent\.layout\.width\); if \(w && w !== boxW\) setBoxW\(w\)/);
});

test('IP3: the golf leaderboard fits inside the column', () => {
  const inner = READABLE_MAX_WIDTH - 32; // the screen's own side padding
  assert.ok(760 <= inner, 'golf detail cap (760) fits in the column');
});
