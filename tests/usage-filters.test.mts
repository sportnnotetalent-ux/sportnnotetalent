/** Usage dashboard filters — periods, trend buckets, tiles, summary
 *  (docs/security/breaks/usage-filters.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, rangeProblem, bucketFor, previousLabel, daysIn, toggleIn, filterSummary, todayIST, PERIOD_PRESETS } from '../src/core/usageFilters.ts';
import { reportTiles, rate } from '../src/core/usageKpis.ts';

const T = '2026-11-04'; // a Wednesday

test('presets → inclusive date ranges (IST days)', () => {
  assert.deepEqual(periodRange('today', T), { from: T, to: T });
  assert.deepEqual(periodRange('7d', T), { from: '2026-10-29', to: T });
  assert.deepEqual(periodRange('week', T), { from: '2026-11-02', to: T }, 'Monday start');
  assert.deepEqual(periodRange('30d', T), { from: '2026-10-06', to: T });
  assert.deepEqual(periodRange('month', T), { from: '2026-11-01', to: T });
  assert.deepEqual(periodRange('3m', T), { from: '2026-08-07', to: T });
  assert.deepEqual(periodRange('custom', T, { from: '2026-10-01', to: '2026-10-15' }), { from: '2026-10-01', to: '2026-10-15' });
  assert.deepEqual(periodRange('week', '2026-11-02'), { from: '2026-11-02', to: '2026-11-02' }, 'on a Monday');
  assert.deepEqual(periodRange('week', '2026-11-08'), { from: '2026-11-02', to: '2026-11-08' }, 'on a Sunday');
  assert.ok(PERIOD_PRESETS.some((p) => p.key === 'custom'));
});

test('UF9: today in India, not UTC', () => {
  assert.equal(todayIST(new Date('2026-11-04T20:00:00Z')), '2026-11-05', '01:30 IST next day');
  assert.equal(todayIST(new Date('2026-11-04T18:00:00Z')), '2026-11-04');
});

test('UF2: bad ranges are named before asking the server', () => {
  assert.equal(rangeProblem('2026-10-01', '2026-10-15', T), null);
  assert.match(rangeProblem('2026-10-15', '2026-10-01', T) ?? '', /before/);
  assert.match(rangeProblem('2025-01-01', '2026-10-01', T) ?? '', /400 days/);
  assert.match(rangeProblem('2026-11-01', '2026-11-09', T) ?? '', /future/);
  assert.match(rangeProblem('2026-13-01', '2026-11-01', T) ?? '', /date/);
  assert.match(rangeProblem('', T, T) ?? '', /date/);
});

test('days, buckets and the comparison label (UF7)', () => {
  assert.equal(daysIn(T, T), 1);
  assert.equal(daysIn('2026-10-06', T), 30);
  assert.equal(bucketFor(T, T), 'day');
  assert.equal(bucketFor('2026-10-06', T), 'day');
  assert.equal(bucketFor('2026-08-07', T), 'week');
  assert.equal(bucketFor('2025-11-01', '2026-11-01'), 'month');
  assert.equal(previousLabel(T, T), 'vs yesterday');
  assert.equal(previousLabel('2026-10-29', T), 'vs previous 7 days');
});

test('multi-select toggling and the summary line', () => {
  assert.deepEqual(toggleIn(['pool'], 'snooker'), ['pool', 'snooker']);
  assert.deepEqual(toggleIn(['pool', 'snooker'], 'pool'), ['snooker']);
  assert.equal(filterSummary([], []), 'All sports · All places');
  assert.equal(filterSummary(['Pool', 'Snooker'], ['Hyderabad']), 'Pool, Snooker · Hyderabad');
  assert.equal(filterSummary(['Pool', 'Snooker', 'Tennis', 'Padel'], ['Hyderabad', 'Pune', 'Delhi']), 'Pool, Snooker +2 · Hyderabad, Pune +1');
});

const tot = (o: Record<string, number> = {}) => ({ games_scored: 0, active_users: 0, sign_ups: 0, cohort: 0, activated: 0, started: 0, finished: 0,
  shares: 0, game_views: 0, ret_base: 0, retained: 0, sessions: 0, crashed: 0, from_links: 0, tournaments: 0, ...o });

test('tiles: the period, the change vs the period before, a trend per bucket', () => {
  const r = { from: '2026-10-29', to: T, bucket: 'day' as const,
    period: tot({ games_scored: 12, active_users: 9, sign_ups: 4, cohort: 4, activated: 3, started: 10, finished: 8, shares: 6, game_views: 30, ret_base: 5, retained: 2, sessions: 50, crashed: 1, from_links: 3 }),
    previous: tot({ games_scored: 8, active_users: 6, cohort: 4, activated: 2 }),
    buckets: [{ start: '2026-10-29', ...tot({ games_scored: 5 }) }, { start: '2026-10-30', ...tot({ games_scored: 7 }) }] };
  const t = reportTiles(r, false);
  assert.deepEqual(t.map((x) => x.key), ['games', 'wau', 'signups', 'activation', 'finish', 'shares', 'retention', 'crashfree']);
  assert.equal(t[0].value, '12');
  assert.deepEqual(t[0].trend, [5, 7]);
  assert.equal(t[0].delta, '+4 vs previous 7 days');
  assert.equal(t[1].label, 'Active users');
  assert.equal(t[3].value, '75%');
  assert.equal(t[3].delta, '+25 pts vs previous 7 days');
  assert.equal(t[4].value, '80%');
  assert.equal(t[5].value, '6 → 30 → 3');
  assert.equal(t[5].note, '3 of 4 sign-ups came from a link');
  assert.equal(t[6].value, '40%');
  assert.equal(t[7].value, '98%');
});

test('UF4: under a filter, the unsplittable tiles say so', () => {
  const r = { from: T, to: T, bucket: 'day' as const, period: tot({ shares: 2 }), previous: tot(), buckets: [] };
  const plain = reportTiles(r, false), f = reportTiles(r, true);
  assert.equal(plain.find((x) => x.key === 'crashfree')!.note, undefined);
  assert.match(f.find((x) => x.key === 'crashfree')!.note ?? '', /All sports and places/);
  assert.match(f.find((x) => x.key === 'shares')!.note ?? '', /shared: all sports and places/);
  assert.match(f.find((x) => x.key === 'wau')!.note ?? '', /Signed-in people/);
  assert.equal(f.find((x) => x.key === 'retention')!.value, '—', 'UF8: no one old enough');
});

test('no base reads "—", never 0%', () => {
  assert.equal(rate(0, 0), null);
  const t = reportTiles({ from: T, to: T, bucket: 'day', period: tot(), previous: tot(), buckets: [] }, false);
  assert.equal(t.find((x) => x.key === 'activation')!.value, '—');
  assert.equal(t.find((x) => x.key === 'activation')!.delta, null);
});
