#!/usr/bin/env node
/**
 * Link-preview pictures for the live score link (MVP, founder 2026-10-31):
 * one 1200×630 card per sport (website/share/<sport>.png), shown big in
 * WhatsApp / Facebook / X previews of app.sportnnote.in/m/<match> next to
 * the score text (worker/matchPage.ts). Drawn like the social brand kit: the
 * hero green, the S:N mark, Barlow Condensed ExtraBold Italic. Plus
 * website/share/sportnnote.png for a link with no sport. Run:
 *
 *   npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-share-images.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg, mark, BRAND } from './build-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'website/share');
const HERO = '#0A3A2B';
const SOFT = '#CFE3D6';
const FONT_DIR = join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed');
const font = {
  fontFiles: [join(FONT_DIR, '800ExtraBold_Italic/BarlowCondensed_800ExtraBold_Italic.ttf'), join(FONT_DIR, '700Bold/BarlowCondensed_700Bold.ttf')],
  loadSystemFonts: false,
  defaultFontFamily: 'Barlow Condensed',
};
const { SPORTS } = await import(join(ROOT, 'worker/sports.ts'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The widest font size (≤ max) at which the text fits `room` pixels. */
function fit(text, max, room) {
  const probe = (size) => {
    const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400"><text x="10" y="300" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="${size}">${esc(text)}</text></svg>`, { font });
    return r.getBBox()?.width ?? 0;
  };
  let size = max;
  while (size > 40 && probe(size) > room) size -= 6;
  return size;
}

function card(label, big) {
  const size = fit(big, 170, 900);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${HERO}"/>
  <circle cx="1130" cy="140" r="250" fill="${BRAND.lime}"/>
  <g stroke="${SOFT}" stroke-opacity="0.18" stroke-width="4" fill="none">
    <rect x="640" y="250" width="620" height="460" rx="6"/><line x1="950" y1="250" x2="950" y2="710"/><circle cx="950" cy="480" r="90"/>
  </g>
  <g transform="translate(64 56) scale(0.62)"><rect width="200" height="200" rx="44" fill="${BRAND.tile}"/>${mark(1.02)}</g>
  <text x="206" y="150" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="64" fill="${BRAND.white}">Sport<tspan fill="${BRAND.lime}">nNote</tspan></text>
  <text x="72" y="320" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="52" letter-spacing="3" fill="${BRAND.lime}">${esc(label)}</text>
  <text x="66" y="${320 + size * 0.95}" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="${size}" fill="${BRAND.white}">${esc(big)}</text>
  <text x="72" y="578" font-family="Barlow Condensed" font-weight="700" font-size="38" fill="${SOFT}">Live scores, results and stats · sportnnote.in</text>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
const write = (file, s) => writeFileSync(join(OUT, file), new Resvg(s, { font, fitTo: { mode: 'width', value: 1200 } }).render().asPng());
for (const [id, { name }] of Object.entries(SPORTS)) write(`${id}.png`, card('LIVE SCORE', name.toUpperCase()));
write('sportnnote.png', card('SCORE YOUR GAMES', 'EVERY SPORT'));
console.log(`${Object.keys(SPORTS).length + 1} cards → website/share/`);
// keep the build script's import list honest
readFileSync(join(ROOT, 'scripts/build-website.mjs'), 'utf8');
