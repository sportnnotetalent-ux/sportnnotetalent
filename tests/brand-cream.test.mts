/** The cream logo, option 2d (docs/security/breaks/brand-cream.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { contrastRatio } from '../src/core/contrast.ts';
import { WORDMARK } from '../src/brand/wordmark.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const CREAM = '#F3F0E8', KEY = '#0A3A2B', INK = '#14181D', MID = '#1F7A50';

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

test('BC2/BC8: outlines underneath for all ten letters (the n too), letters on top; the n is green #1F7A50', () => {
  const w = read('src/components/Wordmark.tsx');
  for (const k of ['sport', 'n', 'note']) assert.match(w, new RegExp(`parts\\.${k}\\} fill=\\{KEY\\} stroke=\\{KEY\\}`), `${k} outlined`);
  const under = w.lastIndexOf('stroke={KEY}'), top = w.indexOf('fill={MID}');
  assert.ok(under > 0 && top > under, 'outline layer first, then the letters');
  assert.match(w, /const MID = '#1F7A50'/);
  assert.ok(contrastRatio(MID, CREAM) >= 4.5, 'the green n reads on cream on its own too');
});

test('the mark: cream tile, outlined lime S and white N, black colon — everywhere', () => {
  const icons = read('scripts/build-icons.mjs');
  assert.match(icons, /tile: '#F3F0E8'/);
  assert.match(icons, /key: '#0A3A2B'/);
  assert.match(icons, /colon: BRAND\.mid/);
  assert.match(icons, /mid: '#1F7A50'/);
  const logo = read('src/components/Logo.tsx').toUpperCase();
  for (const c of [CREAM, KEY, '#C6EE3E', '#FFFFFF', MID]) assert.ok(logo.includes(c), c);
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
