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

const run = (matches: unknown[], viewerId: string | null, extra: { rosters?: Record<string, string[]>; follows?: string[] } = {}) =>
  computeDueReminders(matches as never, [], {}, NOW, new Set(), [60], viewerId, new Set(extra.follows ?? []), {}, extra.rosters);

describe('reminders: only the viewer\'s own', () => {
  test('no player row → nothing at all (used to show every match on the platform)', () => {
    assert.deepEqual(run([match('m1', { scorerId: 'p-scorer' })], null), []);
  });

  test('a stranger\'s scorer / host / squad reminders are not produced on my device', () => {
    const due = run([match('m1', { scorerId: 'p-scorer', hostIds: ['p-host'] }), match('m2', { hostIds: ['p-host'] })], 'p-me');
    assert.deepEqual(due, []);
  });

  test('my scorer reminder, incl. as a co-scorer', () => {
    const due = run([match('m1', { scorerId: 'p-other', scorerIds: ['p-other', 'p-me'] })], 'p-me');
    assert.equal(due.length, 1);
    assert.equal(due[0].playerId, 'p-me');
    assert.match(due[0].title, /You're scoring/);
  });

  test('"No scorer yet" / "Squad needed" are never computed on a device — the server cron owns them (2026-10-23)', () => {
    // I host a scorer-less match and play for RED, which has no saved squad: my
    // own "You play" only — notify-upcoming pushes the prep nudges (once, via the
    // ledger), so a device copy would show each twice.
    const due = run([match('m1', { hostIds: ['p-me'] })], 'p-me', { rosters: { red: ['p-me'] } });
    assert.deepEqual(due.map((d) => d.title), ['⏰ You play in 1 hour — RED vs BLU']);
    const sched = computeScheduledReminders([match('m1', { startsAt: inMin(3000), hostIds: ['p-me'] })] as never, [], {}, NOW, 'p-me', [60], undefined, {}, { red: ['p-me'] });
    assert.ok(sched.length > 0 && sched.every((r) => r.id.startsWith('player:')));
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
