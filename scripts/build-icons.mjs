#!/usr/bin/env node
/**
 * Every app icon from ONE logo: the "S:N" scoreline — a lime "S:" and a white "N"
 * leaning forward like the app's italic headlines, on the pitch green (the 2026-10-29
 * design: src/core/theme.ts primary + lime; src/components/Logo.tsx draws the same).
 * Edit the glyph or colours here, then run:
 *
 *   npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-icons.mjs
 *
 * Writes the master SVGs (assets/brand/) and every PNG the app, web app and
 * website use. Sizes follow each platform's safe zone so nothing gets cropped:
 * iPhone rounds the square itself; Android adaptive icons and "maskable" web
 * icons are cut to a circle/squircle, so the mark sits smaller there.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(process.env.RESVG_DIR ?? ROOT, 'package.json'));
export let Resvg;
try { ({ Resvg } = require('@resvg/resvg-js')); } catch {
  console.error('Needs @resvg/resvg-js: npm i --no-save @resvg/resvg-js@2.6.2'); process.exit(1);
}

export const BRAND = { tile: '#0D5A3F', lime: '#C6EE3E', white: '#FFFFFF' };
/** The lean, in degrees (negative = forward, like an italic). */
export const SKEW = -8;
const SW = 16; // stroke weight on the 200 grid
const lean = Math.tan((SKEW * Math.PI) / 180);

/** The S:N mark on a 200×200 grid, centred on (100,100), scaled by `s`. The
 *  letters lean; the colon's dots stay round (moved to follow the lean). */
export function mark(s, c = { s: BRAND.lime, colon: BRAND.lime, n: BRAND.white }) {
  const dot = (cy) => `<circle cx="${(100 + lean * (cy - 100)).toFixed(2)}" cy="${cy}" r="${SW / 2 + 0.5}" fill="${c.colon}"/>`;
  return `<g transform="translate(100 100) scale(${s}) translate(-100 -100)">
  <g transform="translate(100 100) skewX(${SKEW}) translate(-100 -100)">
  <path d="M80 68 H52 a16 16 0 0 0 0 32 h12 a16 16 0 0 1 0 32 H34" fill="none" stroke="${c.s}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M122 132 V68 L166 132 V68" fill="none" stroke="${c.n}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>${dot(86)}${dot(114)}
</g>`;
}
export const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`;
export const tile = (rx = 0) => `<rect width="200" height="200" rx="${rx}" fill="${BRAND.tile}"/>`;

const out = {
  // Masters (vector) — for print, partners, the website, anything new.
  'assets/brand/sportnnote-logo.svg': svg(tile(44) + mark(0.94)),
  'assets/brand/sportnnote-icon-square.svg': svg(tile(0) + mark(0.82)),
  'assets/brand/sportnnote-mark.svg': svg(mark(1)),
};
const png = {
  // Native app icon (iPhone/Expo rounds it) and the website's logo.
  'assets/icon.png': [svg(tile(0) + mark(0.82)), 1024],
  // Android adaptive icon: background layer + mark inside the 66% safe circle.
  'assets/android-icon-background.png': [svg(tile(0)), 1024],
  'assets/android-icon-foreground.png': [svg(mark(0.68)), 1024],
  // Android 13 themed icons + the notification icon: one colour, shape only.
  'assets/android-icon-monochrome.png': [svg(mark(0.68, { s: BRAND.white, colon: BRAND.white, n: BRAND.white })), 1024],
  'assets/splash-icon.png': [svg(mark(1)), 1024],
  // Browser tab: a rounded tile reads best at 16–48 px.
  'assets/favicon.png': [svg(tile(44) + mark(0.98)), 48],
  'assets/brand/sportnnote-logo-512.png': [svg(tile(44) + mark(0.94)), 512],
  // Web app (iPhone Home Screen + Android "Add to Home screen"), maskable-safe.
  // Versioned name: browsers cache favicons by URL for weeks, so a new logo needs a new name.
  'public/favicon-v3.png': [svg(tile(44) + mark(0.98)), 48],
  'public/apple-touch-icon.png': [svg(tile(0) + mark(0.78)), 180],
  'public/icon-192.png': [svg(tile(0) + mark(0.78)), 192],
  'public/icon-512.png': [svg(tile(0) + mark(0.78)), 512],
};

// Writes only when run directly (scripts/build-brand-kit.mjs imports the drawing).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(join(ROOT, 'assets/brand'), { recursive: true });
  for (const [f, s] of Object.entries(out)) writeFileSync(join(ROOT, f), s + '\n');
  for (const [f, [s, w]] of Object.entries(png)) {
    writeFileSync(join(ROOT, f), new Resvg(s, { fitTo: { mode: 'width', value: w } }).render().asPng());
    console.log('wrote', f, `${w}px`);
  }
}
