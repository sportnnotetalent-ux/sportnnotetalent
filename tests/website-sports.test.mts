/**
 * The marketing site (sportnnote.in) lists every sport the app scores — the
 * count in its headline and the chip list come from one SPORTS array in
 * scripts/build-website.mjs. Pool, snooker and billiards went live 2026-10-29.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

test('the site lists one chip per sport in the app', () => {
  const src = readFileSync(join(ROOT, 'scripts/build-website.mjs'), 'utf8');
  const ids = [.../const SPORT_ORDER = \[([\s\S]*?)\];/.exec(src)![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const names = ids.map((id) => /^  name: '([^']+)'/m.exec(readFileSync(join(ROOT, 'src/sports', id, 'meta.ts'), 'utf8'))![1]);
  const appSports = readdirSync(join(ROOT, 'src/sports'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/sports', d.name, 'meta.ts'))).length;
  assert.equal(names.length, appSports, names.join(', '));
  for (const n of ['Pool', 'Snooker', 'Billiards']) assert.ok(names.includes(n), n);
});

test('the features grid lists features people use, not a sport (founder 2026-10-29: "Real golf" → finding a game)', () => {
  const src = readFileSync(join(ROOT, 'scripts/build-website.mjs'), 'utf8');
  const grid = /<section id="features">([\s\S]*?)<\/section>/.exec(src)![1];
  assert.doesNotMatch(grid, /Real golf/);
  assert.match(grid, /<h3>Find a game<\/h3>/);
  assert.equal([...grid.matchAll(/<div class="card">/g)].length, 6, 'still six cards');
});
