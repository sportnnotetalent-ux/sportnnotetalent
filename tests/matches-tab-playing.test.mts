import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playsIn, matchesView, normalView } from '../src/core/myMatches.ts';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const team = (id: string, roster?: string[]) => ({ id, roster });
const m = (id: string, o: Record<string, unknown> = {}) => ({
  id, sport: 'football', status: 'scheduled', startsAt: '2026-11-05T10:00:00Z',
  homeTeam: team(`${id}-h`), awayTeam: team(`${id}-a`), ...o,
}) as any;

test('MM1: a game I only host or score is Running, not Playing', () => {
  const fnatic = m('f', { hostIds: ['me'], scorerIds: ['me'] });
  const v = matchesView([fnatic], { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
  assert.equal(v.counts.playing, 0);
  assert.equal(v.counts.running, 1);
  assert.deepEqual(v.upcoming, []);
  const r = matchesView([fnatic], { playingTeamIds: new Set(), playerId: 'me', view: 'running', sport: 'all', now: NOW });
  assert.deepEqual(r.upcoming.map((x) => x.id), ['f']);
});

test('MM2: a game I play and host sits only in Playing', () => {
  const g = m('g', { hostIds: ['me'], homeTeam: team('t1', ['me', 'x']) });
  const p = matchesView([g], { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
  const r = matchesView([g], { playingTeamIds: new Set(), playerId: 'me', view: 'running', sport: 'all', now: NOW });
  assert.equal(p.upcoming.length, 1);
  assert.equal(r.upcoming.length, 0);
});

test('MM3/MM4: playing = side roster or a playing team, nothing else', () => {
  assert.equal(playsIn(m('a', { awayTeam: team('t2', ['me']) }), new Set(), 'me'), true);
  assert.equal(playsIn(m('b', { homeTeam: team('t9') }), new Set(['t9']), 'me'), true);
  assert.equal(playsIn(m('c', { hostIds: ['me'], scorerId: 'me' }), new Set(), 'me'), false);
  assert.equal(playsIn(m('d'), new Set(['other']), 'me'), false);
});

test('MM5: a live game idle 12h+ leaves Live and shows as Not finished', () => {
  const fresh = m('live1', { status: 'live', updatedAt: '2026-11-04T11:00:00Z', homeTeam: team('t', ['me']) });
  const stale = m('live2', { status: 'live', updatedAt: '2026-11-01T09:00:00Z', homeTeam: team('t', ['me']) });
  const v = matchesView([fresh, stale], { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
  assert.deepEqual(v.live.map((x) => x.id), ['live1']);
  assert.deepEqual(v.notFinished.map((x) => x.id), ['live2']);
  assert.equal(v.tabCounts.live, 1);
  assert.equal(v.tabCounts.completed, 1);
});

test('MM7: junk view falls back to playing', () => {
  assert.equal(normalView('running'), 'running');
  assert.equal(normalView('playing'), 'playing');
  assert.equal(normalView('admin' as any), 'playing');
  assert.equal(normalView(undefined), 'playing');
});

test('MM8: no player id → nothing playing, no throw', () => {
  const v = matchesView([m('a', { homeTeam: team('t', ['me']) }), null as any], { playingTeamIds: new Set(), playerId: null, view: 'playing', sport: 'all', now: NOW });
  assert.equal(v.counts.playing, 0);
  assert.equal(v.counts.running, 1);
});

test('MM9: the sport filter feeds both views and the counts', () => {
  const list = [m('a', { homeTeam: team('t', ['me']) }), m('b', { sport: 'tennis', homeTeam: team('t', ['me']) }), m('c', { sport: 'tennis', hostIds: ['me'] })];
  const v = matchesView(list, { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'tennis', now: NOW });
  assert.deepEqual(v.counts, { playing: 1, running: 1 });
  assert.deepEqual(v.upcoming.map((x) => x.id), ['b']);
});

test('sorting: upcoming soonest first, completed newest first', () => {
  const list = [
    m('u2', { startsAt: '2026-11-07T10:00:00Z', homeTeam: team('t', ['me']) }),
    m('u1', { startsAt: '2026-11-06T10:00:00Z', homeTeam: team('t', ['me']) }),
    m('c1', { status: 'completed', startsAt: '2026-10-01T10:00:00Z', homeTeam: team('t', ['me']) }),
    m('c2', { status: 'completed', startsAt: '2026-10-02T10:00:00Z', homeTeam: team('t', ['me']) }),
    m('p', { status: 'postponed', startsAt: '2026-11-08T10:00:00Z', homeTeam: team('t', ['me']) }),
  ];
  const v = matchesView(list, { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
  assert.deepEqual(v.upcoming.map((x) => x.id), ['u1', 'u2', 'p']);
  assert.deepEqual(v.completed.map((x) => x.id), ['c2', 'c1']);
});

test('MM6: repos reads a cached scope without playingTeams as empty', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/data/repos.ts', import.meta.url), 'utf8');
  assert.match(src, /playingTeamIds: new Set\(raw\.playingTeams \?\? \[\]\)/);
});

// Founder 2026-11-06: tabs read "Player" / "Organizer"; a game I play in AND host
// stays under Player, tagged "You're hosting" (one list per game, no duplicates).
import { VIEW_LABEL, hostingNote } from '../src/core/myMatches.ts';

test('MM9: the two views are labelled Player and Organizer', () => {
  assert.deepEqual(VIEW_LABEL, { playing: 'Player', running: 'Organizer' });
});

test('MM10: a game I play in and host is under Player only, tagged "You\'re hosting"', () => {
  const g = m('g1', { homeTeam: team('g1-h', ['me']), hostIds: ['me'] });
  const v = matchesView([g], { playingTeamIds: new Set(), playerId: 'me', view: 'playing', sport: 'all', now: NOW });
  assert.deepEqual(v.counts, { playing: 1, running: 0 });
  assert.equal(hostingNote(g, 'me', 'playing'), 'You’re hosting');
});

test('MM11: no tag when I only play, in the Organizer view, or signed out', () => {
  const g = m('g2', { homeTeam: team('g2-h', ['me']), hostIds: ['someone'] });
  assert.equal(hostingNote(g, 'me', 'playing'), null);
  const h = m('g3', { hostIds: ['me'] });
  assert.equal(hostingNote(h, 'me', 'running'), null, 'Organizer already means you run it');
  assert.equal(hostingNote(h, null, 'playing'), null);
  assert.equal(hostingNote(m('g4'), 'me', 'playing'), null, 'no hostIds');
});

test('MM12: the screen uses the labels and the tag', () => {
  const src = readFileSync(new URL('../src/screens/MatchesScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /VIEW_LABEL\.playing/);
  assert.match(src, /VIEW_LABEL\.running/);
  assert.match(src, /note=\{hostingNote\(m, myPlayerId, view\)\}/);
  assert.doesNotMatch(src, /label=\{`(Playing|Running)/);
  assert.doesNotMatch(src, /under Running/);
});
