/** Reminder scope (2026-10-22): a device only ever produces its own viewer's
 *  reminders — never other people's (they come from the server cron). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDueReminders, computeScheduledReminders, playersInSide } from '../src/data/reminderRules.ts';

const NOW = Date.parse('2026-10-22T10:00:00Z');
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();
const team = (id: string, roster?: string[]) => ({ id, name: id.toUpperCase(), shortName: id.toUpperCase(), sport: 'football', colorHex: '#000', ...(roster ? { roster } : {}) });
const match = (id: string, over: Record<string, unknown> = {}) => ({
  id, sport: 'football', status: 'scheduled', startsAt: inMin(50),
  homeTeam: team('red'), awayTeam: team('blu'), ...over,
}) as never;

const run = (matches: unknown[], viewerId: string | null, extra: { leaders?: Record<string, unknown>; rosters?: Record<string, string[]>; follows?: string[] } = {}) =>
  computeDueReminders(matches as never, [], [], (extra.leaders ?? {}) as never, {}, NOW, new Set(), [60], viewerId, new Set(extra.follows ?? []), {}, extra.rosters);

describe('reminders: only the viewer\'s own', () => {
  test('no player row → nothing at all (used to show every match on the platform)', () => {
    assert.deepEqual(run([match('m1', { scorerId: 'p-scorer' })], null), []);
  });

  test('a stranger\'s scorer / host / squad reminders are not produced on my device', () => {
    const due = run([match('m1', { scorerId: 'p-scorer', hostIds: ['p-host'] }), match('m2', { hostIds: ['p-host'] })], 'p-me', {
      leaders: { red: { captainId: 'p-cap' } },
    });
    assert.deepEqual(due, []);
  });

  test('my scorer reminder, incl. as a co-scorer', () => {
    const due = run([match('m1', { scorerId: 'p-other', scorerIds: ['p-other', 'p-me'] })], 'p-me');
    assert.equal(due.length, 1);
    assert.equal(due[0].playerId, 'p-me');
    assert.match(due[0].title, /You're scoring/);
  });

  test('my "no scorer yet" nudge only when I host', () => {
    assert.equal(run([match('m1', { hostIds: ['p-me'] })], 'p-me').length, 1);
    assert.equal(run([match('m1', { hostIds: ['p-x'] })], 'p-me').length, 0);
  });

  test('squad nudge only for the team I captain', () => {
    const due = run([match('m1', { scorerId: 'p-s' })], 'p-me', { leaders: { red: { captainId: 'p-me' }, blu: { captainId: 'p-x' } } });
    assert.equal(due.length, 1);
    assert.match(due[0].title, /Squad needed — RED/);
  });

  test('"You play" from the team roster when no squad is saved (live match rows carry no roster)', () => {
    const due = run([match('m1', { scorerId: 'p-s' })], 'p-me', { rosters: { red: ['p-me', 'p-2'] } });
    assert.equal(due.length, 1);
    assert.match(due[0].title, /You play/);
  });

  test('a followed player\'s reminder is marked for the viewer (shown here, not pushed to them)', () => {
    const due = run([match('m1', { scorerId: 'p-s' })], 'p-me', { rosters: { blu: ['p-star'] }, follows: ['p-star'] });
    assert.equal(due.length, 1);
    assert.equal(due[0].playerId, 'p-star');
    assert.equal(due[0].forViewer, true);
  });
});

describe('playersInSide', () => {
  test('saved squad first, then the match row roster, then the gathered roster', () => {
    const m = match('m1') as unknown as Parameters<typeof playersInSide>[0];
    assert.deepEqual(playersInSide(m, 'home', { home: { starters: ['a'], subs: ['b'] } } as never, { red: ['z'] }), ['a', 'b']);
    assert.deepEqual(playersInSide(m, 'home', undefined, { red: ['z'] }), ['z']);
    assert.deepEqual(playersInSide(m, 'away', undefined, undefined), []);
  });
});

describe('scheduled (OS) reminders', () => {
  test('co-scorer gets the scorer reminders; roster player gets "You play"', () => {
    const out = computeScheduledReminders([match('m1', { startsAt: inMin(3000), scorerId: 'p-x', scorerIds: ['p-x', 'p-me'] })] as never, [], {}, NOW, 'p-me', [60], undefined, {}, { red: ['p-me'] });
    assert.ok(out.some((r) => r.id.startsWith('scorer:m1')));
    assert.ok(out.some((r) => r.id.startsWith('player:m1')));
  });
});
