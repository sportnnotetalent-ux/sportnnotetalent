#!/usr/bin/env node
/**
 * The social brand kit (docs/marketing/brand-kit/): profile pictures and covers
 * for Instagram, Facebook, LinkedIn, YouTube and X, drawn from the same S:N
 * mark as every app icon (scripts/build-icons.mjs) and the 2026-10-29 design —
 * the hero green, a lime "S:" + white "N", the wordmark in Barlow Condensed
 * ExtraBold Italic ("Sport" white, "nNote" lime). Run:
 *
 *   npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-brand-kit.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg, mark, svg, tile, BRAND } from './build-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/marketing/brand-kit');
const HERO = '#0A3A2B'; // theme primaryDark — the app's hero panels
const SOFT = '#CFE3D6'; // the sub-line on the hero green
const FONT_DIR = join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed');
const fontOpts = {
  fontFiles: [join(FONT_DIR, '800ExtraBold_Italic/BarlowCondensed_800ExtraBold_Italic.ttf'), join(FONT_DIR, '700Bold/BarlowCondensed_700Bold.ttf')],
  loadSystemFonts: true,
  defaultFontFamily: 'Helvetica Neue',
};

// The same count as the website's headline.
const site = readFileSync(join(ROOT, 'scripts/build-website.mjs'), 'utf8');
const SPORT_COUNT = [.../const SPORTS = \[([\s\S]*?)\n\];/.exec(site)[1].matchAll(/\['[^']+', '[^']+'\]/g)].length;
const TAGLINE = 'Live scoring, results and records for school and club sport';
const SUBLINE = `${SPORT_COUNT} sports · each scored by its own international rules`;

const wordmark = (size) =>
  `<text font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="${size}" fill="${BRAND.white}">Sport<tspan fill="${BRAND.lime}">nNote</tspan></text>`;
/** A drawing's rendered width (resvg measures the text with the real font). */
function widthOf(body, h = 400) {
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${h}"><g transform="translate(10 ${h * 0.8})">${body}</g></svg>`, { font: fontOpts });
  const b = r.getBBox();
  return b ? b.width : 0;
}
/** The S:N mark (no tile) with its glyphs `h` px tall, centred on (x, y). */
const glyph = (x, y, h) => `<g transform="translate(${x} ${y}) scale(${h / 80}) translate(-100 -100)">${mark(1)}</g>`;
const GLYPH_W = 141 / 80; // the leaning mark's width : height

/** Mark + wordmark + tagline + sub-line. `align` 'middle' centres on cx; 'end' right-aligns at cx. */
function lockup({ cx, top, size, align = 'middle', withMark = true }) {
  const wm = widthOf(wordmark(size));
  const markH = size * 0.62;
  const gap = size * 0.28;
  const rowW = (withMark ? markH * GLYPH_W + gap : 0) + wm;
  const left = align === 'middle' ? cx - rowW / 2 : cx - rowW;
  const base = top + size * 0.78;
  const mk = withMark ? glyph(left + (markH * GLYPH_W) / 2, base - size * 0.36, markH) : '';
  const wx = left + (withMark ? markH * GLYPH_W + gap : 0);
  const tag = size * 0.3;
  const sub = size * 0.235;
  const anchor = align === 'middle' ? 'middle' : 'end';
  return `${mk}<g transform="translate(${wx} ${base})">${wordmark(size)}</g>
  <text x="${cx}" y="${base + size * 0.62}" text-anchor="${anchor}" font-family="Helvetica Neue" font-weight="700" font-size="${tag}" fill="${BRAND.white}">${TAGLINE}</text>
  <text x="${cx}" y="${base + size * 0.62 + sub * 1.7}" text-anchor="${anchor}" font-family="Helvetica Neue" font-size="${sub}" fill="${SOFT}">${SUBLINE}</text>`;
}
/** Faint pitch lines (the Home hero's motif), centred on (cx, cy). */
const pitch = (w, h, cx, cy, r) => `<g stroke="${BRAND.white}" stroke-opacity="0.07" stroke-width="${Math.max(2, r / 40)}" fill="none">
  <circle cx="${cx}" cy="${cy}" r="${r}"/><line x1="${cx}" y1="0" x2="${cx}" y2="${h}"/><rect x="${r * 0.2}" y="${r * 0.2}" width="${w - r * 0.4}" height="${h - r * 0.4}"/></g>`;
const canvas = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${HERO}"/>${body}</svg>`;

const files = {
  // Round crops everywhere: the mark sits at ~62% of the square.
  'profile-1080.png': [svg(tile(0) + mark(0.88)), 1080],
  'linkedin-logo-400.png': [svg(tile(0) + mark(0.82)), 400],
  // The logo overlaps the cover's left side, so the words sit right.
  'linkedin-cover-1128x191.png': [canvas(1128, 191, pitch(1128, 191, 300, 96, 70) + lockup({ cx: 1080, top: 22, size: 54, align: 'end', withMark: false })), 1128],
  // Everything inside the 1546×423 area every device shows.
  'youtube-banner-2560x1440.png': [canvas(2560, 1440, pitch(2560, 1440, 1280, 720, 300) + lockup({ cx: 1280, top: 560, size: 150 })), 2560],
  // Centred — phones crop the sides.
  'facebook-cover-1640x624.png': [canvas(1640, 624, pitch(1640, 624, 820, 312, 150) + lockup({ cx: 820, top: 190, size: 120 })), 1640],
  // Centred, clear of the profile picture at bottom left.
  'x-header-1500x500.png': [canvas(1500, 500, pitch(1500, 500, 750, 250, 130) + lockup({ cx: 750, top: 140, size: 116 })), 1500],
};
for (const [f, [s, w]] of Object.entries(files)) {
  writeFileSync(join(OUT, f), new Resvg(s, { fitTo: { mode: 'width', value: w }, font: fontOpts }).render().asPng());
  console.log('wrote', `docs/marketing/brand-kit/${f}`);
}
