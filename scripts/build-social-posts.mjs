#!/usr/bin/env node
/**
 * Social post images from one brand template (Design, 2026-11-06): the hero
 * green, the S:N mark, Barlow Condensed ExtraBold Italic headlines in capitals,
 * lime for the key words, and REAL app screenshots from the marketing demo
 * account (docs/org/marketing/assets/screens/) in a phone frame, with a lime
 * ring on the control the post talks about and a "Demo data" tag. Exact pixel
 * sizes per platform. Run:
 *
 *   npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-social-posts.mjs
 *
 * Output: docs/org/marketing/assets/posts/*.png
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg, mark, BRAND } from './build-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'docs/org/marketing/assets/screens');
const OUT = join(ROOT, 'docs/org/marketing/assets/posts');
const HERO = '#0A3A2B';
const SOFT = '#CFE3D6';
const FONT_DIR = join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed');
const fontOpts = {
  fontFiles: [join(FONT_DIR, '800ExtraBold_Italic/BarlowCondensed_800ExtraBold_Italic.ttf'), join(FONT_DIR, '700Bold/BarlowCondensed_700Bold.ttf')],
  loadSystemFonts: true,
  defaultFontFamily: 'Helvetica Neue',
};
const SHOT_W = 750; // screenshots are 750×1624

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** A headline: lines of [text, lime?] runs, in capitals. */
function headline(x, y, size, lines, gap = 0.92) {
  return lines.map((runs, i) => `<text x="${x}" y="${y + i * size * gap}" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="${size}" fill="${BRAND.white}">${
    runs.map(([t, lime]) => `<tspan${lime ? ` fill="${BRAND.lime}"` : ''}>${esc(t.toUpperCase())}</tspan>`).join('')}</text>`).join('');
}
const body = (x, y, size, lines, fill = SOFT, anchor = 'start') => lines.map((t, i) =>
  `<text x="${x}" y="${y + i * size * 1.35}" text-anchor="${anchor}" font-family="Helvetica Neue" font-weight="600" font-size="${size}" fill="${fill}">${t}</text>`).join('');
/** S:N mark + wordmark. */
const brand = (x, y, h) => `<g transform="translate(${x} ${y}) scale(${h / 200})">${mark(1.15)}</g>
  <text x="${x + h * 1.08}" y="${y + h * 0.72}" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="${h * 0.62}" fill="${BRAND.white}">Sport<tspan fill="${BRAND.lime}">nNote</tspan></text>`;
/** The app hero's court lines and lime ball. */
const court = (W, H) => `<g fill="none" stroke="#FFFFFF" stroke-opacity="0.07" stroke-width="3">
  <rect x="${W * 0.62}" y="${-H * 0.1}" width="${W * 0.5}" height="${H * 0.55}" rx="4"/><line x1="${W * 0.62}" y1="${H * 0.2}" x2="${W * 1.2}" y2="${H * 0.2}"/>
  <circle cx="${W * 0.87}" cy="${H * 0.2}" r="${W * 0.07}"/></g>
  <circle cx="${W * 1.02}" cy="${W * 0.06}" r="${W * 0.17}" fill="${BRAND.lime}"/>`;
/** A phone with a screenshot (cropped from `top`), a lime ring on `hl`, and the Demo data tag. */
function phone(id, x, y, w, h, file, top = 0, hl = null) {
  const pad = w * 0.032, sw = w - 2 * pad, sh = h - 2 * pad, k = sw / SHOT_W, r = w * 0.115;
  const img = readFileSync(join(SHOTS, file)).toString('base64');
  // a dark outline under the lime ring, so it shows on lime chips too
  const ringBox = hl ? `x="${x + pad + hl[0] * k - 7}" y="${y + pad + (hl[1] - top) * k - 7}" width="${hl[2] * k + 14}" height="${hl[3] * k + 14}" rx="${18 * (w / 300)}" fill="none"` : '';
  const ring = hl ? `<rect ${ringBox} stroke="#0F1A14" stroke-width="${Math.max(9, w / 34)}"/><rect ${ringBox} stroke="${BRAND.lime}" stroke-width="${Math.max(5, w / 60)}"/>` : '';
  return `<defs><clipPath id="${id}"><rect x="${x + pad}" y="${y + pad}" width="${sw}" height="${sh}" rx="${r - pad}"/></clipPath>
    <filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${w * 0.05}" stdDeviation="${w * 0.06}" flood-color="#000" flood-opacity="0.45"/></filter></defs>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#07150F" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="2" filter="url(#${id}s)"/>
  <g clip-path="url(#${id})"><rect x="${x + pad}" y="${y + pad}" width="${sw}" height="${sh}" fill="#F3F0E8"/>
    <image href="data:image/jpeg;base64,${img}" x="${x + pad}" y="${y + pad - top * k}" width="${sw}" height="${1624 * k}"/></g>
  ${ring}
  <!-- "Demo data" sits just above the phone's top-left corner, never over the app or the lime ball -->
  <rect x="${x + w * 0.03}" y="${y - w * 0.075}" width="${w * 0.22}" height="${w * 0.055}" rx="${w * 0.0275}" fill="#FFFFFF" fill-opacity="0.12"/>
  <text x="${x + w * 0.14}" y="${y - w * 0.036}" text-anchor="middle" font-family="Helvetica Neue" font-weight="700" font-size="${w * 0.028}" fill="${SOFT}" letter-spacing="1.5">DEMO DATA</text>`;
}
const dots = (W, H, n) => [1, 2, 3, 4, 5].map((i) =>
  `<circle cx="${W * 0.82 + i * 26}" cy="${H * 0.945}" r="7" fill="${i === n ? BRAND.lime : '#FFFFFF'}" fill-opacity="${i === n ? 1 : 0.3}"/>`).join('');
const stepBadge = (x, y, r, n) => `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${BRAND.lime}"/>
  <text x="${x + r}" y="${y + r * 1.42}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="${r * 1.25}" fill="#0F1A14">${n}</text>`;

const POSTS = [];
// Post 2 — LinkedIn, 1200×1200
POSTS.push(['2026-11-11-linkedin-scoreboard.png', 1200, 1200, (W, H) =>
  phone('p', W * 0.07, H * 0.08, W * 0.4, H * 0.84, 'badminton-doubles-4-2.jpg', 0) +
  headline(W * 0.535, H * 0.33, W * 0.086, [[['Every game']], [['deserves a']], [['scoreboard.', true]]]) +
  body(W * 0.54, H * 0.66, W * 0.03, ['Score it live on your phone.', 'Everyone follows from one link.']) +
  brand(W * 0.54, H * 0.83, W * 0.06)]);
// Post 3 — X + Threads, 1600×900: the result and the table, side by side
POSTS.push(['2026-11-11-x-threads-table.png', 1600, 900, (W, H) =>
  headline(W * 0.06, H * 0.3, W * 0.058, [[['Score it.']], [['The table', true]], [['does itself.', true]]]) +
  body(W * 0.06, H * 0.66, W * 0.019, ['Result, standings and stats —', 'no spreadsheet after the game.']) +
  brand(W * 0.06, H * 0.82, W * 0.038) +
  // the result page is cropped above its footer line ("Score your own game, free →"): house rule on "free"
  phone('r', W * 0.43, H * 0.24, W * 0.25, H * 0.5, 'kabaddi-result-5-3.jpg', 0) +
  phone('t', W * 0.71, H * 0.24, W * 0.25, H * 0.5, 'kabaddi-standings.jpg', 690, [64, 804, 620, 284])]);
// Post 4 — Instagram carousel, 1080×1350
const SLIDES = [
  { text: [[['Open Home, tap']], [['Score a match', true]]], shot: ['home.jpg', 0, [32, 455, 218, 215]] },
  { text: [[['Pick the sport,']], [['tap '], ['Doubles', true], [',']], [['add the pairs']]], shot: ['pickleball-doubles-setup.jpg', 0, [248, 452, 212, 70]] },
  { text: [[['Tap the side']], [['that '], ['won the point', true]]], shot: ['pickleball-scoring-3-4.jpg', 192, [66, 916, 618, 154]] },
  { text: [[['Tap '], ['Share.', true]], [['Send the link.']]], shot: ['football-scoring-2-1.jpg', 0, [640, 34, 104, 62]],
    foot: ['Anyone can follow live in a browser · app.sportnnote.in'] },
];
POSTS.push(['2026-11-12-instagram-carousel-1.png', 1080, 1350, (W, H) =>
  headline(W * 0.08, H * 0.36, W * 0.2, [[['Score your']], [['next game.']], [['Live.', true]]], 0.88) +
  body(W * 0.08, H * 0.8, W * 0.045, ['4 steps · save this →'], BRAND.lime) +
  brand(W * 0.08, H * 0.895, W * 0.075) + dots(W, H, 1)]);
SLIDES.forEach((s, i) => POSTS.push([`2026-11-12-instagram-carousel-${i + 2}.png`, 1080, 1350, (W, H) => {
  const lines = s.text.length, size = W * (lines > 2 ? 0.075 : 0.085);
  const pw = W * 0.6, top = H * (lines > 2 ? 0.3 : 0.26), ph = H * (s.foot ? 0.865 : 0.9) - top;
  return stepBadge(W * 0.08, H * 0.065, W * 0.045, i + 1) +
    headline(W * 0.2, H * 0.065 + size * 0.86, size, s.text) +
    phone(`s${i}`, (W - pw) / 2, top, pw, ph, ...s.shot) +
    (s.foot ? body(W / 2, H * 0.905, W * 0.032, s.foot, SOFT, 'middle') : '') +
    brand(W * 0.08, H * 0.925, W * 0.05) + dots(W, H, i + 2);
}]));

// Post 6 — Instagram + Facebook, 1080×1350: captains pick on one phone
POSTS.push(['2026-11-14-instagram-captains-pick.png', 1080, 1350, (W, H) =>
  headline(W * 0.08, H * 0.12, W * 0.1, [[['Captains pick.']], [['Teams play', true]], [['in turns.', true]]], 0.9) +
  phone('c', W * 0.2, H * 0.355, W * 0.6, H * 0.56, 'squad-session-captains-pick.jpg', 210, [34, 246, 682, 440]) +
  brand(W * 0.08, H * 0.925, W * 0.05)]);

mkdirSync(OUT, { recursive: true });
for (const [name, W, H, draw] of POSTS) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${HERO}"/>${court(W, H)}${draw(W, H)}</svg>`;
  const png = new Resvg(doc, { font: fontOpts, fitTo: { mode: 'width', value: W } }).render().asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`${name}  ${W}×${H}`);
}
