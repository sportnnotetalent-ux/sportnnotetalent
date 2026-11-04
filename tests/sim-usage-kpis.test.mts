/** 600 simulated dashboards (random periods, filters, zeros, junk values):
 *  always eight tiles; no NaN / Infinity / negative %; a rate is 0–100% or "—";
 *  every trend has one point per bucket. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportTiles } from '../src/core/usageKpis.ts';
import { periodRange, PERIOD_PRESETS } from '../src/core/usageFilters.ts';

let seed = 1108;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const KEYS = ['games_scored', 'active_users', 'sign_ups', 'cohort', 'activated', 'started', 'finished', 'shares', 'game_views', 'ret_base', 'retained', 'sessions', 'crashed', 'from_links', 'tournaments'];
const totals = () => {
  const w: Record<string, unknown> = {};
  for (const k of KEYS) w[k] = rnd(12) === 0 ? (rnd(2) ? 'junk' : null) : rnd(50);
  // parts never exceed their whole on the server
  for (const [part, whole] of [['activated', 'cohort'], ['finished', 'started'], ['retained', 'ret_base'], ['crashed', 'sessions']]) {
    if (typeof w[part] === 'number' && typeof w[whole] === 'number' && (w[part] as number) > (w[whole] as number)) w[part] = w[whole];
  }
  return w;
};

test('600 dashboards', () => {
  for (let u = 0; u < 600; u++) {
    const preset = PERIOD_PRESETS[rnd(PERIOD_PRESETS.length - 1)].key;
    const { from, to } = periodRange(preset, '2026-11-04');
    const n = rnd(32);
    const r = { from, to, bucket: 'day' as const, period: totals(), previous: totals(),
      buckets: Array.from({ length: n }, () => ({ start: from, ...totals() })) } as never;
    const tiles = reportTiles(r, rnd(2) === 0);
    assert.equal(tiles.length, 8);
    for (const t of tiles) {
      assert.equal(t.trend.length, n);
      assert.doesNotMatch(t.value, /NaN|Infinity|-\d+%/);
      assert.doesNotMatch(t.delta ?? '', /NaN|undefined/);
      const m = /^(\d+)%$/.exec(t.value);
      if (m) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 100, `${t.key} ${t.value}`);
      for (const v of t.trend) assert.ok(v === null || (Number.isFinite(v) && v >= 0));
    }
  }
});
