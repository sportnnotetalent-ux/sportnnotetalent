/**
 * 2026-10-29 redesign: the S:N logo moves onto the new palette — a lime "S:"
 * and a white "N" leaning forward (like the italic headlines) on pitch green.
 * One drawing everywhere: the icon script (every app / web / website icon),
 * the in-app <Logo>, the web app's colours, and a new favicon name so
 * browsers drop the cached old one.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '../src/core/contrast.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const theme = read('src/core/theme.ts');
const token = (k: string) => new RegExp(`\\b${k}: '(#[0-9A-F]{6})'`, 'i').exec(theme)![1].toUpperCase();
const GREEN = token('primary');
const LIME = token('lime');
const OLD = ['#0E1116', '#3DDC97', '#FFB454'];

describe('the logo', () => {
  // 2026-11-08 (brand-cream.md, option 2d): a cream tile, outlined lime S and white N, a near-black colon
  test('the icon script draws it in the design tokens: lime S, white N, outlined, near-black colon, on cream, leaning forward', () => {
    const icons = read('scripts/build-icons.mjs');
    const brand = /export const BRAND = \{([^}]*)\}/.exec(icons)![1].toUpperCase();
    assert.ok(brand.includes(`TILE: '${token('bg')}'`) && brand.includes(`LIME: '${LIME}'`) && brand.includes(`WHITE: '#FFFFFF'`) && brand.includes(`KEY: '${token('primaryDark')}'`), brand);
    assert.match(icons, /skewX\(\$\{SKEW\}\)/);
    for (const c of OLD) assert.ok(!icons.toUpperCase().includes(c), `no ${c} in the icon script`);
  });

  test('the in-app <Logo> is the same drawing', () => {
    const logo = read('src/components/Logo.tsx').toUpperCase();
    for (const c of [token('bg'), token('primaryDark'), LIME, '#FFFFFF']) assert.ok(logo.includes(c), c);
    for (const c of OLD) assert.ok(!logo.includes(c), `no ${c} in Logo.tsx`);
    const skew = (s: string) => /SKEW = (-?\d+)/i.exec(s)?.[1];
    assert.equal(skew(read('src/components/Logo.tsx')), skew(read('scripts/build-icons.mjs')), 'the same lean');
  });

  test('the letters stand out on the tile (graphics need 3:1)', () => {
    // on cream the letters read through their dark green outline; the colon is near-black
    assert.ok(contrastRatio(token('primaryDark'), token('bg')) >= 3);
    assert.ok(contrastRatio(token('text'), token('bg')) >= 3);
  });

  test('every icon file is written, and the favicon has a new name (browsers cache the old one for weeks)', () => {
    const icons = read('scripts/build-icons.mjs');
    for (const f of ['assets/icon.png', 'assets/android-icon-foreground.png', 'assets/android-icon-background.png', 'assets/android-icon-monochrome.png', 'assets/favicon.png', 'public/favicon-v4.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png']) {
      assert.ok(icons.includes(`'${f}'`), `${f} is generated`);
      assert.ok(existsSync(join(import.meta.dirname, '..', f)), `${f} exists`);
    }
    assert.ok(!existsSync(join(import.meta.dirname, '..', 'public/favicon-v2.png')), 'the old favicon is gone');
    for (const f of ['public/index.html', 'scripts/build-website.mjs']) {
      assert.ok(read(f).includes('/favicon-v4.png') || read(f).includes("'favicon-v4.png'"), `${f} links favicon-v4`);
      assert.ok(!read(f).includes('favicon-v2') && !read(f).includes('favicon-v3'), `${f} no longer links an old favicon`);
    }
  });

  test('the app, web app and website chrome use the new colours', () => {
    const app = JSON.parse(read('app.json')).expo;
    assert.equal(app.android.adaptiveIcon.backgroundColor.toUpperCase(), token('bg'), 'the cream tile (brand-cream.md)');
    assert.equal(app.web.themeColor.toUpperCase(), GREEN);
    const manifest = JSON.parse(read('public/manifest.json'));
    assert.equal(manifest.theme_color.toUpperCase(), GREEN);
    for (const f of ['app.json', 'public/manifest.json', 'public/index.html', 'scripts/build-website.mjs']) {
      for (const c of OLD) assert.ok(!read(f).toUpperCase().includes(c), `no ${c} in ${f}`);
    }
  });

  test('the printable pages\' toolbars (certificate, passport, hall of fame, verification pack) are on-brand', () => {
    for (const f of ['src/core/certificates.ts', 'src/core/passport.ts', 'src/core/hallOfFame.ts', 'src/core/orgVerification.ts']) {
      const s = read(f).toUpperCase();
      for (const c of OLD) assert.ok(!s.includes(c), `no ${c} in ${f}`);
      assert.ok(s.includes(GREEN) && s.includes(LIME), `${f} uses the brand green and lime`);
    }
  });
});
