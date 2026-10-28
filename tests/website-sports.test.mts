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
  const list = /const SPORTS = \[([\s\S]*?)\n\];/.exec(src)![1];
  const names = [...list.matchAll(/\['[^']+', '([^']+)'\]/g)].map((m) => m[1]);
  const appSports = readdirSync(join(ROOT, 'src/sports'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/sports', d.name, 'meta.ts'))).length;
  assert.equal(names.length, appSports, names.join(', '));
  for (const n of ['Pool', 'Snooker', 'Billiards']) assert.ok(names.includes(n), n);
});
