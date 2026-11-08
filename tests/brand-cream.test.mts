/** The cream logo, option 2d (docs/security/breaks/brand-cream.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { contrastRatio } from '../src/core/contrast.ts';
import { WORDMARK } from '../src/brand/wordmark.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const CREAM = '#F3F0E8', KEY = '#0A3A2B', INK = '#14181D';

test('BC1: the outline and the black colon/n read on cream', () => {
  assert.ok(contrastRatio(KEY, CREAM) >= 4.5);
  assert.ok(contrastRatio(INK, CREAM) >= 4.5);
});

test('BC3/BC7: the wordmark shapes come from the brand font, in three parts', () => {
  assert.equal(WORDMARK.font, 'BarlowCondensed_800ExtraBold_Italic');
  for (const k of ['sport', 'n', 'note'] as const) assert.ok(WORDMARK.parts[k].length > 50, k);
  assert.ok(WORDMARK.width > WORDMARK.height * 3, 'a long word');
  assert.ok(existsSync(new URL('../assets/brand/sportnnote-wordmark.svg', import.meta.url)));
});

test('BC2: outlines underneath, letters on top, no outline on the n', () => {
  const w = read('src/components/Wordmark.tsx');
  const under = w.indexOf('stroke={KEY}'), top = w.indexOf('fill={INK}');
  assert.ok(under > 0 && top > under, 'outline layer first, then the letters');
  assert.match(w, /<Path d=\{WORDMARK\.parts\.n\} fill=\{INK\} \/>/, 'the n is plain');
  assert.doesNotMatch(w, /parts\.n\}[^/]*stroke/, 'no stroke on the n');
});

test('the mark: cream tile, outlined lime S and white N, black colon — everywhere', () => {
  const icons = read('scripts/build-icons.mjs');
  assert.match(icons, /tile: '#F3F0E8'/);
  assert.match(icons, /key: '#0A3A2B'/);
  assert.match(icons, /colon: BRAND\.ink/);
  const logo = read('src/components/Logo.tsx').toUpperCase();
  for (const c of [CREAM, KEY, '#C6EE3E', '#FFFFFF', INK]) assert.ok(logo.includes(c), c);
});

test('BC4/BC5: launch on cream (matching the splash); Home on a cream badge; sign-in and website use the same name', () => {
  const app = JSON.parse(read('app.json')).expo;
  const sp = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.equal(sp[1].backgroundColor, CREAM);
  assert.equal(app.android.adaptiveIcon.backgroundColor, CREAM);
  const la = read('src/components/LaunchAnimation.tsx');
  assert.match(la, /const TILE = '#F3F0E8'/);
  assert.match(la, /<Wordmark /);
  const home = read('src/screens/HomeScreen.tsx');
  assert.match(home, /st\.brandBadge/);
  assert.match(home, /<Wordmark /);
  assert.match(read('src/screens/AuthScreen.tsx'), /<Wordmark /);
  assert.match(read('scripts/build-website.mjs'), /src="\/wordmark\.svg"/);
});
