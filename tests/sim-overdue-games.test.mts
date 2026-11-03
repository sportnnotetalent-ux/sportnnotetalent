/** 600 simulated fixture lists (all statuses, times from 60 days ago to 30 days
 *  ahead, some bad dates): nothing is lost or doubled; every overdue game is a
 *  scheduled one 12 h+ past its start, newest first; nothing in Upcoming is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue, splitOverdue, OVERDUE_MS } from '../src/core/overdue.ts';
import { matchesView } from '../src/core/myMatches.ts';

let seed = 1105;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const STATUSES = ['scheduled', 'scheduled', 'scheduled', 'postponed', 'cancelled', 'live', 'completed'];
const NOW = Date.parse('2026-11-05T12:00:00Z');

test('600 fixture lists', () => {
  for (let u = 0; u < 600; u++) {
    const list = Array.from({ length: 1 + rnd(25) }, (_, i) => {
      const off = (rnd(90 * 24) - 60 * 24) * 3600_000 + rnd(3600) * 1000;
      const startsAt = rnd(20) === 0 ? 'bad' : new Date(NOW + off).toISOString();
      return { id: `u${u}g${i}`, status: STATUSES[rnd(STATUSES.length)], startsAt, sport: 'tennis', homeTeam: { id: 'h', roster: ['me'] }, awayTeam: { id: 'a' } };
    });
    const pre = list.filter((m) => ['scheduled', 'postponed', 'cancelled'].includes(m.status));
    const s = splitOverdue(pre, NOW);
    assert.equal(s.upcoming.length + s.overdue.length, pre.length);
    for (const m of s.overdue) {
      assert.equal(m.status, 'scheduled');
      assert.ok(NOW - Date.parse(m.startsAt) > OVERDUE_MS);
    }
    for (const m of s.upcoming) assert.equal(isOverdue(m, NOW), false);
    for (let i = 1; i < s.overdue.length; i++) assert.ok(s.overdue[i - 1].startsAt >= s.overdue[i].startsAt);
    const v = matchesView(list as any, { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
    const seen = [...v.live, ...v.upcoming, ...v.overdue, ...v.completed, ...v.notFinished].map((m) => m.id);
    assert.equal(new Set(seen).size, list.length, 'a game lost or doubled');
    assert.equal(v.tabCounts.upcoming, pre.length);
  }
});
