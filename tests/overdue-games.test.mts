/** Overdue games (docs/security/breaks/overdue-games.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue, splitOverdue, OVERDUE_MS } from '../src/core/overdue.ts';
import { matchesView } from '../src/core/myMatches.ts';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const g = (id: string, status: string, startsAt: string) => ({ id, status, startsAt, sport: 'football', homeTeam: { id: 'h', roster: ['me'] }, awayTeam: { id: 'a' } }) as any;

test('OD4/OD5/OD6: only scheduled games 12 h+ past their start', () => {
  assert.equal(OVERDUE_MS, 12 * 3600_000);
  assert.equal(isOverdue(g('a', 'scheduled', '2026-10-08T16:30:00Z'), NOW), true);
  assert.equal(isOverdue(g('b', 'scheduled', '2026-11-05T11:00:00Z'), NOW), false);
  assert.equal(isOverdue(g('c', 'scheduled', '2026-11-05T00:30:00Z'), NOW), false);
  assert.equal(isOverdue(g('d', 'postponed', '2026-10-08T16:30:00Z'), NOW), false);
  assert.equal(isOverdue(g('e', 'cancelled', '2026-10-08T16:30:00Z'), NOW), false);
  assert.equal(isOverdue(g('f', 'scheduled', 'not a date'), NOW), false);
  assert.equal(isOverdue(g('h', 'scheduled', ''), NOW), false);
});

test('OD1/OD3: split keeps order; overdue most recently missed first', () => {
  const list = [g('old', 'scheduled', '2026-10-01T10:00:00Z'), g('missed', 'scheduled', '2026-11-01T10:00:00Z'), g('soon', 'scheduled', '2026-11-06T10:00:00Z'), g('pp', 'postponed', '2026-10-02T10:00:00Z')];
  const s = splitOverdue(list, NOW);
  assert.deepEqual(s.upcoming.map((x) => x.id), ['soon', 'pp']);
  assert.deepEqual(s.overdue.map((x) => x.id), ['missed', 'old']);
});

test('OD2/OD7: Matches → Upcoming lists overdue apart, counted in the tab', () => {
  const v = matchesView([g('old', 'scheduled', '2026-10-08T16:30:00Z'), g('soon', 'scheduled', '2026-11-06T10:00:00Z')],
    { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
  assert.deepEqual(v.upcoming.map((x) => x.id), ['soon']);
  assert.deepEqual(v.overdue.map((x) => x.id), ['old']);
  assert.equal(v.tabCounts.upcoming, 2);
});
