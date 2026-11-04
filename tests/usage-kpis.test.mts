/** Usage dashboard — the tiles (docs/security/breaks/usage-dashboard.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageTiles, rate } from '../src/core/usageKpis.ts';

const wk = (o: Record<string, number | string>) => ({
  week: '2026-11-02', games_scored: 0, active_users: 0, sign_ups: 0, cohort: 0, activated: 0, started: 0, finished: 0,
  shares: 0, game_views: 0, prev_signups: 0, retained: 0, sessions: 0, crashed: 0, from_links: 0, ...o,
}) as any;

test('UD5: a rate with no base is null, never 0%', () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(1, 4), 25);
  assert.equal(rate(2, 3), 67);
});

test('eight tiles, this week first, with a trend oldest → newest and the change', () => {
  const weeks = [wk({ week: '2026-11-02', games_scored: 12, active_users: 9, sign_ups: 4, cohort: 4, activated: 3, started: 10, finished: 8, shares: 6, game_views: 30, prev_signups: 5, retained: 2, sessions: 50, crashed: 1, from_links: 3 }),
    wk({ week: '2026-10-26', games_scored: 8, active_users: 6 })];
  const t = usageTiles(weeks);
  assert.deepEqual(t.map((x) => x.key), ['games', 'wau', 'signups', 'activation', 'finish', 'shares', 'retention', 'crashfree']);
  const g = t[0];
  assert.equal(g.value, '12');
  assert.deepEqual(g.trend, [8, 12]);
  assert.equal(g.delta, '+4 vs last week');
  assert.equal(t[3].value, '75%');
  assert.equal(t[4].value, '80%');
  assert.equal(t[5].value, '6 → 30 → 3');
  assert.equal(t[5].label, 'Links shared → views → sign-ups');
  assert.equal(t[5].note, '3 of 4 sign-ups came from a link');
  assert.deepEqual(t[5].trend, [0, 3], 'trend = sign-ups from links');
  assert.equal(t[6].value, '40%');
  assert.equal(t[7].value, '98%');
});

test('UD5: no data reads "—"', () => {
  const t = usageTiles([wk({})]);
  assert.equal(t.find((x) => x.key === 'activation')!.value, '—');
  assert.equal(t.find((x) => x.key === 'crashfree')!.value, '—');
  assert.equal(usageTiles([]).length, 8);
});

test('SS10: the link tile with no sign-ups says so, and old weeks without from_links read 0', () => {
  const t = usageTiles([wk({ shares: 2, game_views: 5, sign_ups: 0 }), { week: '2026-10-26' } as any]);
  assert.equal(t[5].value, '2 → 5 → 0');
  assert.equal(t[5].note, 'No sign-ups this week');
});
