/** Android nav keys never cover the tab bar (docs/security/breaks/android-nav-overlap.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tabBarBottom, TAB_BAR_BODY } from '../src/core/tabBarInset.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('AN1: Android uses the larger of the live and launch insets', () => {
  assert.equal(tabBarBottom('android', 0, 48), 48, 'live inset lost: the launch one is used');
  assert.equal(tabBarBottom('android', 48, 0), 48);
  assert.equal(tabBarBottom('android', 16, 16), 16, 'gesture handle: a small band (AN4)');
});

test('AN3: iPhone and web unchanged', () => {
  assert.equal(tabBarBottom('ios', 34, 34), null, 'iOS: React Navigation handles it');
  assert.equal(tabBarBottom('web', 0, 0), null);
});

test('AN1/AN2: Tabs sets height and padding explicitly on Android', () => {
  const s = read('src/navigation/RootNavigator.tsx');
  assert.match(s, /tabBarBottom\(Platform\.OS, insets\.bottom, initialWindowMetrics\?\.insets\.bottom \?\? 0\)/);
  assert.match(s, /height: TAB_BAR_BODY \+ navBottom, paddingBottom: navBottom/);
  assert.ok(TAB_BAR_BODY >= 56);
});
