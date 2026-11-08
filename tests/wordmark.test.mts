/** One SportnNote wordmark everywhere (docs/security/breaks/wordmark.md),
 *  now option 2d on cream (docs/security/breaks/brand-cream.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('WM1: the launch screen, Home and sign-in draw the same Wordmark; the website uses the same shapes', () => {
  for (const f of ['src/components/LaunchAnimation.tsx', 'src/screens/HomeScreen.tsx', 'src/screens/AuthScreen.tsx']) {
    assert.match(read(f), /<Wordmark /, f);
    assert.doesNotMatch(read(f), />nNote</, f);
  }
  assert.match(read('src/components/Wordmark.tsx'), /WORDMARK\.parts\.sport/);
  assert.match(read('scripts/build-website.mjs'), /assets\/brand\/sportnnote-wordmark\.svg/);
});
