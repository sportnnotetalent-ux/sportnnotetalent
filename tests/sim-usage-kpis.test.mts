/** 600 simulated dashboards (random weeks, zeros, junk values, 0–26 weeks):
 *  always eight tiles; no NaN / Infinity / negative %; a rate is 0–100% or "—";
 *  every trend has one point per week. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageTiles } from '../src/core/usageKpis.ts';

let seed = 1108;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const KEYS = ['games_scored', 'active_users', 'sign_ups', 'cohort', 'activated', 'started', 'finished', 'shares', 'game_views', 'prev_signups', 'retained', 'sessions', 'crashed'];

test('600 dashboards', () => {
  for (let u = 0; u < 600; u++) {
    const n = rnd(27);
    const weeks = Array.from({ length: n }, () => {
      const w: Record<string, unknown> = { week: '2026-11-02' };
      for (const k of KEYS) w[k] = rnd(12) === 0 ? (rnd(2) ? 'junk' : null) : rnd(50);
      // parts never exceed their whole on the server
      for (const [part, whole] of [['activated', 'cohort'], ['finished', 'started'], ['retained', 'prev_signups'], ['crashed', 'sessions']]) {
        if (typeof w[part] === 'number' && typeof w[whole] === 'number' && (w[part] as number) > (w[whole] as number)) w[part] = w[whole];
      }
      return w;
    });
    const tiles = usageTiles(weeks as never);
    assert.equal(tiles.length, 8);
    for (const t of tiles) {
      assert.equal(t.trend.length, n);
      assert.doesNotMatch(t.value, /NaN|Infinity|-\d+%/);
      const m = /^(\d+)%$/.exec(t.value);
      if (m) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 100, `${t.key} ${t.value}`);
      for (const v of t.trend) assert.ok(v === null || (Number.isFinite(v) && v >= 0));
    }
  }
});
