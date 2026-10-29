/**
 * Every sport looks like itself, and the same everywhere (founder 2026-10-29:
 * "carrom and pool show the same"; then "Start a friendly and Explore a sport
 * should show the same kind of icons"). A sport is shown by its own emoji — one
 * per sport (rugby and rugby league share the ball) — in every list, chip,
 * picker and heading; the drawn court badges and tiles are gone ("too kiddish").
 * The website lists the sports from the app itself.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SPORTS = readdirSync(join(ROOT, 'src/sports'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/sports', d.name, 'meta.ts')))
  .map((d) => {
    const s = read(`src/sports/${d.name}/meta.ts`);
    return { id: /\bid: '([^']+)'/.exec(s)![1], icon: /\bicon: '([^']+)'/.exec(s)![1].replace(/️/g, '') };
  });

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

describe('one kind of sport symbol everywhere: its emoji', () => {
  test('SportBadge and SportLine draw the sport\'s emoji — no drawings', () => {
    const sym = read('src/components/SportSymbol.tsx');
    assert.match(sym, /getSportMeta\([^)]*\)\.icon/);
    assert.doesNotMatch(sym, /react-native-svg/);
    assert.ok(!existsSync(join(ROOT, 'src/components/SportArt.tsx')), 'the court drawings are gone');
  });
  test('sport chips show the label\'s emoji, like every other sport list (no colour dot)', () => {
    const ui = read('src/components/ui.tsx');
    assert.doesNotMatch(ui, /SPORT_COLORS|sportChip/);
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

  });
});
