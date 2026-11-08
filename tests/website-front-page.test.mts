/**
 * The sportnnote.in front page, redesigned from the founder-approved Stitch picks
 * 18–24 (docs/design/stitch-picks/5-website-a.png, 6-website-b.png).
 * Breaks: docs/security/breaks/website-front-page.md (W1–W15).
 * Every build goes to its own scratch folder (WEBSITE_OUT) so test files never race.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'website/config.json'), 'utf8'));
const metaOf = (id: string) => readFileSync(join(ROOT, 'src/sports', id, 'meta.ts'), 'utf8');
const APP_SPORTS = readdirSync(join(ROOT, 'src/sports'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/sports', d.name, 'meta.ts')))
  .map((d) => ({ id: d.name, name: /^  name: '([^']+)'/m.exec(metaOf(d.name))![1], icon: /^  icon: '([^']+)'/m.exec(metaOf(d.name))![1] }));

const dirs: string[] = [];
function build(env: Record<string, string> = {}): string {
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  dirs.push(out);
  const clean = { ...process.env };
  for (const k of ['SITE_URL', 'APP_URL', 'SUPPORT_EMAIL', 'GUIDES_INCLUDE_DRAFTS', 'GUIDES_DIR']) delete clean[k];
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-website.mjs')], { cwd: ROOT, stdio: 'pipe', env: { ...clean, ...env, WEBSITE_OUT: out } });
  return out;
}
process.on('exit', () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

let OUT = '';
let html = '';
const sections = () => [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].map((m) => ({ attrs: m[1], body: m[2] }));
const sectionById = (id: string) => sections().find((s) => new RegExp(`\\bid="${id}"`).test(s.attrs));
const text = (s: string) => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');

before(() => { OUT = build(); html = readFileSync(join(OUT, 'index.html'), 'utf8'); });

describe('18 hero', () => {
  test('the headline, in two lines, the second in brand green (h1 em)', () => {
    assert.match(html, /<h1>Score any game\.<br><em>Share it live\.<\/em><\/h1>/);
  });
  test('one lime main action to the app, and an outline Android button', () => {
    const hero = sectionById('top')!;
    assert.ok(hero, 'hero section has id="top"');
    assert.match(hero.body, new RegExp(`<a class="btn btn-primary" href="${cfg.appUrl.replace(/\./g, '\\.')}">Score a game now — no sign-up <span aria-hidden="true">→</span></a>`));
    assert.match(hero.body, /<a class="btn btn-ghost" href="[^"]+">Get the Android app<\/a>/);
    assert.ok(hero.body.includes(`href="${cfg.androidApkUrl}"`));
  });
  test('a phone mock-up of a live football card built in HTML, demo names, no images', () => {
    const hero = sectionById('top')!.body;
    const phone = /<div class="phone"[\s\S]*?<!-- \/phone -->/.exec(hero)?.[0] ?? '';
    assert.ok(phone, 'phone mock-up present');
    assert.match(phone, /aria-hidden="true"/);
    for (const s of ['Red House', 'Blue House', 'LIVE', 'Goal — Rohan Nair 61’']) assert.ok(phone.includes(s), s);
    assert.doesNotMatch(phone, /<img\b|<svg\b|url\(/);
  });
});

describe('19 stat strip: only provable claims', () => {
  test('the sports count is the app registry count, not a typed number', () => {
    const strip = sectionById('facts')!.body;
    assert.match(strip, new RegExp(`<strong>${APP_SPORTS.length}</strong>`));
    assert.match(html, new RegExp(`for ${APP_SPORTS.length} sports`));
  });
  test('the price fact comes from config.pricingLine', () => {
    const strip = sectionById('facts')!.body;
    const [head, rest] = cfg.pricingLine.split(';');
    assert.ok(text(strip).includes(head.trim()), head);
    assert.ok(text(strip).includes(rest.trim()), rest);
  });
  test('the guide count is the number of published guides', () => {
    const n = readdirSync(join(ROOT, 'website/guides')).filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('_')).length;
    assert.match(sectionById('facts')!.body, new RegExp(`<strong>${n}</strong>`));
  });
});

describe('W1 no claims we cannot prove', () => {
  const BANNED: [string, RegExp][] = [
    ['COPPA', /COPPA/i], ['FERPA', /FERPA/i], ['compliant', /\bcompliant\b/i], ['telemetry', /telemetry/i],
    ['<60s', /(<|&lt;)\s*60\s*s/i], ['60 seconds', /60 seconds/i], ['0 kB', /\b0\s*kB\b/i], ['<100ms', /100\s*ms/i],
    ['Zero config', /zero config/i], ['parents watching', /parents watching/i], ['VAR', /\bVAR\b/], ['REV', /\bREV\b/],
    ['Official scorer verified', /official scorer verified/i], ['Guaranteed', /guaranteed/i],
  ];
  for (const [label, re] of BANNED) test(`no "${label}"`, () => assert.doesNotMatch(text(html), re));
});

describe('20 how it works', () => {
  test('three steps: pick a sport, tap to score, share the live link', () => {
    const how = sectionById('how')!.body;
    const steps = [...how.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    assert.deepEqual(steps, ['Pick a sport', 'Tap to score', 'Share the live link']);
    assert.match(text(how), /sign up/i, 'sharing needs a (free) account: say so');
  });
});

describe('21 audience cards', () => {
  test('organisers, players, parents, schools — each links to an existing guide', () => {
    const who = sectionById('who')!.body;
    const cards = [...who.matchAll(/<h3>([^<]+)<\/h3>[\s\S]*?<a href="\/guides\/([a-z0-9-]+)\/"/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(cards.map((c) => c[0]), ['Organisers', 'Players', 'Parents', 'Schools']);
    for (const [, slug] of cards) assert.ok(existsSync(join(ROOT, 'website/guides', `${slug}.md`)), slug);
  });
});

describe('22 sports grid (W2–W4)', () => {
  test('one tile per app sport, its emoji and name from meta.ts, nothing else', () => {
    const grid = sectionById('sports')!.body;
    const tiles = [...grid.matchAll(/<(?:a|div) class="sport"[^>]*><span class="sym" aria-hidden="true">([^<]+)<\/span><span class="nm">([^<]+)<\/span>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);
    assert.equal(tiles.length, APP_SPORTS.length);
    assert.deepEqual(tiles.map((t) => t[1]).sort(), APP_SPORTS.map((s) => s.name).sort());
    for (const s of APP_SPORTS) assert.ok(tiles.some(([i, n]) => i === s.icon && n === s.name), s.id);
    assert.match(grid, new RegExp(`<h2>${APP_SPORTS.length} sports`));
  });
  test('every rule note sits on a tile that links to that sport\'s own guide', () => {
    const grid = sectionById('sports')!.body;
    const linked = [...grid.matchAll(/<a class="sport" href="\/guides\/([a-z0-9-]+)\/">[\s\S]*?<\/a>/g)];
    for (const m of linked) assert.ok(existsSync(join(ROOT, 'website/guides', `${m[1]}.md`)), m[1]);
    const notes = [...grid.matchAll(/<span class="rule">/g)].length;
    assert.equal(notes, linked.length, 'no note without a guide behind it');
    assert.ok(notes >= APP_SPORTS.length - 3, `most sports have a note (${notes})`);
  });
});

describe('23 child safety (W9)', () => {
  test('the reworded line, a short true line and the consent guide; no law named', () => {
    const safe = sectionById('safety')!.body;
    assert.ok(safe.includes('Children’s details stay private — parents approve, names are masked.'));
    assert.match(text(safe), /initials/);
    assert.match(safe, /href="\/guides\/parent-guardian-consent\/"/);
    assert.doesNotMatch(safe, /btn-primary/);
  });
});

describe('24 final call to action + footer', () => {
  test('a green band with the one lime button, then the footer links and social', () => {
    const band = sectionById('start')!;
    assert.match(band.attrs, /class="[^"]*\bcta-band\b/);
    assert.equal([...band.body.matchAll(/btn-primary/g)].length, 1);
    const footer = /<footer>[\s\S]*<\/footer>/.exec(html)![0];
    for (const p of ['/privacy/', '/terms/', '/support/', '/guides/', '/delete-account/', '/accessibility/']) assert.ok(footer.includes(`href="${p}"`), p);
    for (const s of cfg.social) assert.ok(footer.includes(`href="${s.url}"`), s.label);
    assert.match(footer, /© \d{4} SportnNote/);
  });
});

describe('W8 one main (lime) action per section', () => {
  test('never more than one btn-primary in a section; exactly one in the hero and the final band', () => {
    for (const s of sections()) assert.ok([...s.body.matchAll(/btn-primary/g)].length <= 1, s.attrs);
    assert.equal([...sectionById('top')!.body.matchAll(/btn-primary/g)].length, 1);
  });
});

describe('W5 every link resolves', () => {
  test('local paths are built files, anchors are ids on the page, outside links come from config', () => {
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const allowed = new Set([cfg.appUrl, cfg.androidApkUrl, `mailto:${cfg.contactEmail}`, ...cfg.social.map((s: { url: string }) => s.url), `${cfg.siteUrl}/`]);
    const hrefs = [...html.matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    assert.ok(hrefs.length > 40);
    for (const h of hrefs) {
      if (h.startsWith('#') || h.startsWith('/#')) { assert.ok(ids.has(h.replace(/^\/?#/, '')), `anchor ${h}`); continue; }
      if (h.startsWith('/')) {
        const p = h.split('#')[0];
        const f = p.endsWith('/') ? join(OUT, p, 'index.html') : join(OUT, p);
        assert.ok(existsSync(f), `local ${h}`);
        continue;
      }
      assert.ok(allowed.has(h), `outside link ${h} is a config URL`);
    }
  });
});

describe('W6 SEO, sharing and structured data kept', () => {
  test('title, description, canonical, Open Graph, theme colour, icons and Organization JSON-LD', () => {
    assert.match(html, /<title>SportnNote — score every match, run any tournament<\/title>/);
    assert.match(html, new RegExp(`<meta name="description" content="Live scoring, tournaments, stats and player profiles for ${APP_SPORTS.length} sports`));
    assert.ok(html.includes(`<link rel="canonical" href="${cfg.siteUrl}/">`));
    for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image']) assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+">`), p);
    assert.match(html, /<meta name="theme-color" content="#0D5A3F">/);
    assert.match(html, /<link rel="icon" type="image\/png" sizes="48x48" href="\/favicon-v4.png">/);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
    assert.equal(ld['@type'], 'Organization');
    assert.deepEqual(ld.sameAs, cfg.social.map((s: { url: string }) => s.url));
    assert.match(html, /<a class="skip" href="#main">/);
    assert.match(html, /<main id="main">/);
  });
});

describe('W7 config values are escaped', () => {
  test('a hostile APP_URL / SUPPORT_EMAIL cannot break out of an attribute', () => {
    const out = build({ APP_URL: 'https://x.test/"><script>alert(1)</script>', SUPPORT_EMAIL: 'a"><img src=x onerror=alert(2)>@x.test' });
    for (const f of ['index.html', 'support/index.html', 'guides/index.html', '404.html']) {
      const page = readFileSync(join(out, f), 'utf8');
      assert.doesNotMatch(page, /<script>alert|<img src=x/, f);
    }
  });
});
