/**
 * Every sport looks like itself (founder 2026-10-29: "the logo for carrom and pool
 * shows the same"): each sport has its own emoji (rugby and rugby league share
 * one ball), its small drawn badge (components/SportArt.tsx) never looks like
 * another sport's, and the website lists the sports — names and symbols — from
 * the app itself. Later the same day the founder found the big court tiles and
 * match-card strips too playful: match cards and sport lists stay plain.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sportArtSvg, sportArtParts } from './helpers/sportArtSvg.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SPORTS = readdirSync(join(ROOT, 'src/sports'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/sports', d.name, 'meta.ts')))
  .map((d) => {
    const s = read(`src/sports/${d.name}/meta.ts`);
    return { id: /\bid: '([^']+)'/.exec(s)![1], icon: /\bicon: '([^']+)'/.exec(s)![1].replace(/️/g, '') };
  });

/** CIE76 colour distance (sRGB → Lab). */
function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + bl * 0.0722), z = f((r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe('sport symbols (plain text)', () => {
  test('no two sports share an emoji — except rugby and rugby league, which play with the same ball', () => {
    const seen = new Map<string, string>();
    for (const s of SPORTS) {
      const other = seen.get(s.icon);
      if (other) assert.deepEqual([other, s.id].sort(), ['rugby', 'rugby_league'], `${other} and ${s.id} share ${s.icon}`);
      seen.set(s.icon, s.id);
    }
    assert.notEqual(SPORTS.find((s) => s.id === 'carrom')!.icon, '🎱', 'a pool ball is not carrom');
  });
});

describe('sport drawings (app and website)', () => {
  test('every sport has its own drawing', async () => {
    for (const s of SPORTS) assert.match(await sportArtSvg(s.id), /^<svg[\s\S]+<\/svg>$/, s.id);
  });

  test('no two sports look alike: the same markings need clearly different colours', async () => {
    const parts = await Promise.all(SPORTS.map(async (s) => ({ id: s.id, ...(await sportArtParts(s.id)) })));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const [a, b] = [parts[i], parts[j]];
        if (a.markings === b.markings) assert.ok(deltaE(a.color, b.color) >= 25, `${a.id} and ${b.id} are drawn the same and coloured alike (ΔE ${deltaE(a.color, b.color).toFixed(1)})`);
      }
    }
  });

  test('the pairs people mix up are drawn differently', async () => {
    const m = async (id: string) => (await sportArtParts(id)).markings;
    assert.notEqual(await m('carrom'), await m('pool'));
    assert.notEqual(await m('rugby'), await m('rugby_league'), 'league\'s 10-metre lines, not union\'s 22 and dashed lines');
    const [sn, bi] = [await sportArtParts('snooker'), await sportArtParts('billiards')];
    assert.ok(deltaE(sn.color, bi.color) >= 25, `snooker and billiards cloth (ΔE ${deltaE(sn.color, bi.color).toFixed(1)})`);
  });
});

describe('the website lists the app\'s sports', () => {
  test('one chip per app sport, its name and symbol read from the app — nothing typed twice', () => {
    const src = read('scripts/build-website.mjs');
    const order = /const SPORT_ORDER = \[([\s\S]*?)\];/.exec(src);
    assert.ok(order, 'the site lists sport ids in order');
    const ids = [...order![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    assert.deepEqual([...ids].sort(), SPORTS.map((s) => s.id).sort());
    assert.match(src, /icon: '\(\[\^'\]\+\)'/, 'the symbol comes from the sport\'s meta.ts');
    assert.doesNotMatch(src, /\['🎱', 'Carrom'\]/);
  });
});

describe('match cards and sport lists stay plain (founder 2026-10-29: "too kiddish")', () => {
  test('a match card has no court strip, and says the kick-off time once', () => {
    const card = read('src/components/MatchCard.tsx');
    assert.doesNotMatch(card, /SportArt/);
    const foot = /const footMain[\s\S]*?;\n/.exec(card)![0];
    assert.doesNotMatch(foot, /[?:]\s*time\b|\$\{time\}/, 'the time is in the header already');
  });
  test('Your sports and Try a new sport are plain lists of sport names', () => {
    for (const f of ['src/screens/HomeScreen.tsx', 'src/screens/TryNewSportScreen.tsx']) {
      assert.doesNotMatch(read(f), /SportTile|SportArt/, f);
    }
    assert.doesNotMatch(read('src/components/SportArt.tsx'), /export function SportTile|drawStrip/, 'the big tiles and strips are gone');
  });
  test('sport chips keep the colour dot', () => {
    assert.match(read('src/components/ui.tsx'), /SPORT_COLORS\[p\.sport\]/);
  });
});
