/**
 * Stale "Live now" on Home (founder 2026-11-04): home_feed must return each
 * match's last activity so a live match idle for 12 hours drops out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isStaleLive } from '../src/core/staleLive.ts';

const MIG = join(import.meta.dirname, '..', 'supabase', 'migrations');
const latestHomeFeed = () => {
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  let body = '';
  for (const f of files) {
    const s = readFileSync(join(MIG, f), 'utf8');
    const i = s.search(/create or replace function (public\.)?home_feed\(/);
    if (i >= 0) body = s.slice(i);
  }
  return body;
};

test('the newest home_feed returns matches.updated_at', () => {
  const b = latestHomeFeed();
  assert.ok(b, 'home_feed found');
  assert.match(b.slice(0, b.indexOf('$$;', b.indexOf('$$') + 2) + 3), /m\.updated_at/);
});
test('the same function still keeps every other match column (no column lost)', () => {
  const b = latestHomeFeed();
  for (const c of ['m.status', 'm.starts_at', 'm.state', 'm.result', 'm.host_ids', 'm.scorer_ids', 'm.format']) assert.ok(b.includes(c), c);
});
test('with updated_at, a live match idle since 1 Nov is stale on 4 Nov', () => {
  assert.equal(isStaleLive({ status: 'live', updatedAt: '2026-11-01T07:26:57Z' }, Date.parse('2026-11-04T06:00:00Z')), true);
  assert.equal(isStaleLive({ status: 'live', updatedAt: '2026-11-04T05:00:00Z' }, Date.parse('2026-11-04T06:00:00Z')), false);
});
