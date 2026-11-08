/** One SportnNote wordmark, as on the launch screen (docs/security/breaks/wordmark.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../src/core/contrast.ts';
import { theme } from '../src/core/theme.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('WM1: the launch screen, Home and sign-in draw the same Wordmark', () => {
  const w = read('src/components/Wordmark.tsx');
  assert.match(w, /dark: \{ word: theme\.colors\.lime, n: '#FFFFFF' \}/, 'the launch look');
  assert.match(w, /light: \{ word: theme\.colors\.primary, n: theme\.colors\.text \}/);
  assert.match(w, /accessibilityLabel="SportnNote"/);
  assert.match(read('src/components/LaunchAnimation.tsx'), /<Wordmark tone="dark"/);
  assert.match(read('src/screens/HomeScreen.tsx'), /<Wordmark tone="dark"/);
  assert.match(read('src/screens/AuthScreen.tsx'), /<Wordmark tone="light"/);
  for (const f of ['src/screens/HomeScreen.tsx', 'src/screens/AuthScreen.tsx']) assert.doesNotMatch(read(f), />nNote</, f);
});

test('WM1: the website header uses the same pattern', () => {
  assert.match(read('scripts/build-website.mjs'), /<span class="word">Sport<\/span><span class="n">n<\/span><span class="word">Note<\/span>/);
  const css = read('website/styles.css');
  assert.match(css, /\.brand \.word \{ color: var\(--primary\); \}/);
  assert.match(css, /\.brand \.n \{ color: var\(--text\); \}/);
});

test('WM2: both tones read on their backgrounds', () => {
  assert.ok(contrastRatio(theme.colors.lime, theme.colors.primaryDark) >= 4.5);
  assert.ok(contrastRatio('#FFFFFF', theme.colors.primaryDark) >= 4.5);
  assert.ok(contrastRatio(theme.colors.primary, theme.colors.bg) >= 4.5);
  assert.ok(contrastRatio(theme.colors.text, theme.colors.bg) >= 4.5);
});
