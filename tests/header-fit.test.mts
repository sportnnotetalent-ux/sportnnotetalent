/** Web header fit (2026-10-27): on a phone, a long screen title ran underneath
 *  the header's text buttons ("⚙ Manage  Share" on a tournament, "Share" on a
 *  match or golf round). React Navigation's JS header (web) sizes the title for
 *  one ~52 px icon and lets the right side shrink to nothing; every stack screen
 *  now keeps the right side's own width and shrinks the title instead. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the stack header fits its buttons on the web', () => {
  const nav = read('src/navigation/RootNavigator.tsx');
  test('every stack screen gets the web-only fit', () => {
    assert.match(nav, /export const webHeaderFit = \(Platform\.OS === 'web'/);
    assert.match(nav, /headerTitleContainerStyle: \{ flexShrink: 1, minWidth: 0 \}/);
    assert.match(nav, /headerRightContainerStyle: \{ flexBasis: 'auto', flexShrink: 0 \}/);
    // (iPad: the same options also carry the readable column — readable-width.test.mts)
    assert.match(nav, /<Stack\.Navigator[\s\S]{0,200}?screenOptions=\{\(\{ route \}\) => \(\{ \.\.\.webHeaderFit,/);
  });
  test('the library still lets these styles win (re-check after a React Navigation upgrade)', () => {
    const header = read('node_modules/@react-navigation/elements/src/Header/Header.tsx');
    // our title style comes after the library's maxWidth, and the right side's after its flexBasis: 0
    assert.match(header, /maxWidth:[\s\S]*?titleContainerStyle,\s*\]/);
    assert.match(header, /styles\.end,\s*styles\.expand,[\s\S]*?rightContainerStyle,\s*\]/);
    assert.match(header, /expand: \{\s*flexGrow: 1,\s*flexBasis: 0,\s*\}/);
    // web native-stack hands every other option straight to that Header
    assert.match(read('node_modules/@react-navigation/native-stack/src/views/NativeStackView.tsx'), /<Header\s+\{\.\.\.rest\}/);
  });
  test('the screens with header buttons', () => {
    for (const f of ['src/screens/TournamentProfileScreen.tsx', 'src/screens/LiveScoringScreen.tsx', 'src/screens/GolfRoundScreen.tsx']) {
      assert.match(read(f), /headerRight: \(\) => \(/, f);
    }
  });
});
