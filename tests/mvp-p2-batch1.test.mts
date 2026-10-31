/**
 * MVP P2 batch 1 (docs/security/breaks/mvp-p2-batch1.md): L9 full names on
 * the spectator board, L10 the sign-up email example, L11 stale "live"
 * matches, QT-04 "Today" fixtures, QG-01 placeholder sides in pickers.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardName } from '../src/core/teamShort.ts';
import { isStaleLive, STALE_LIVE_MS } from '../src/core/staleLive.ts';
import { quickKickoff } from '../src/data/fixtureSchedule.ts';
import { isQuickPlaceholder } from '../src/core/quickGame.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const H = 3_600_000;

describe('L9: full names when they fit', () => {
  test('wide screen: the full name', () => assert.equal(boardName('Panthers FC', 'PAN', 420), 'Panthers FC'));
  test('too long for the width: the code', () => assert.equal(boardName('Royal Challengers Bengaluru', 'RCB', 360), 'RCB'));
  test('a tablet fits longer names', () => assert.equal(boardName('Royal Challengers Bengaluru', 'RCB', 800), 'Royal Challengers Bengaluru'));
  test('narrow phone: the code', () => assert.equal(boardName('Panthers', 'PAN', 320), 'PAN'));
  test('no full name: the code', () => assert.equal(boardName(undefined, 'PAN', 800), 'PAN'));
  test('the spectator board uses it; the scoring tab keeps codes', () => {
    const src = read('src/screens/LiveScoringScreen.tsx');
    assert.match(src, /const homeBoard = individualSport \|\| sameCode \? homeShown : boardName\(homeTeamName, homeShown, boardW\)/);
    assert.match(src, /<plugin\.Scoreboard state=\{state\} homeName=\{homeBoard\} awayName=\{awayBoard\}/);
  });
});

test('L10: the email example', () => {
  const src = read('src/screens/AuthScreen.tsx');
  assert.ok(!src.includes('you@school.edu'));
  assert.match(src, /placeholder="you@example\.com"/);
});

describe('L11: stale live matches', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const at = (h: number) => new Date(now - h * H).toISOString();
  test('12 hours', () => assert.equal(STALE_LIVE_MS, 12 * H));
  test('no activity for 13 hours: stale', () => assert.equal(isStaleLive({ status: 'live', updatedAt: at(13) }, now), true));
  test('active an hour ago: live', () => assert.equal(isStaleLive({ status: 'live', updatedAt: at(1) }, now), false));
  test('unknown activity: shown as before', () => assert.equal(isStaleLive({ status: 'live' }, now), false));
  test('only live matches', () => assert.equal(isStaleLive({ status: 'scheduled', updatedAt: at(100) }, now), false));
  test('Home and the sport hub skip them', () => {
    assert.match(read('src/screens/HomeScreen.tsx'), /m\.status === 'live' && !isStaleLive\(m, now\)/);
    assert.match(read('src/screens/SportHubScreen.tsx'), /!isStaleLive\(m, now\)/);
    assert.match(read('src/data/repos.ts'), /updatedAt: r\.updated_at \?\? undefined/);
  });
});

describe('QT-04: "Today" fixtures start today', () => {
  const now = Date.parse('2026-10-31T09:10:00Z');
  test('today: the next half hour, at least 15 minutes ahead', () => {
    assert.equal(quickKickoff('today', now, 'Asia/Kolkata'), '2026-10-31T09:30:00.000Z');
    assert.equal(quickKickoff('today', Date.parse('2026-10-31T09:20:00Z'), 'Asia/Kolkata'), '2026-10-31T10:00:00.000Z');
  });
  test('tomorrow: 10:00 tomorrow in the zone, as before', () => {
    assert.equal(quickKickoff('tomorrow', now, 'Asia/Kolkata'), '2026-11-01T04:30:00.000Z');
  });
  test('the quick form passes the day; the fixtures screen uses it', () => {
    assert.match(read('src/screens/QuickTournamentScreen.tsx'), /nav\.navigate\('GenerateFixtures', \{ tournamentId: created\.id, sport, structure: fmt, day,/);
    assert.match(read('src/screens/GenerateFixturesScreen.tsx'), /params\.day \? quickKickoff\(params\.day, Date\.now\(\), fixtureZone\)/);
  });
});

describe('QG-01: placeholder sides stay out of the pickers', () => {
  test('untouched placeholders', () => {
    for (const name of ['Team A', 'Team B', 'Player A', 'Player B', 'Pair A', 'Pair B']) assert.equal(isQuickPlaceholder({ name, adhoc: true }), true, name);
  });
  test('renamed, real, or not ad hoc: shown', () => {
    assert.equal(isQuickPlaceholder({ name: 'Team A Kondapur', adhoc: true }), false);
    assert.equal(isQuickPlaceholder({ name: 'Team A', adhoc: false }), false);
    assert.equal(isQuickPlaceholder({ name: 'Team A' }), false);
    assert.equal(isQuickPlaceholder({ name: 'Lions', adhoc: true }), false);
  });
  test('the friendly form hides them (but keeps a side already picked)', () => {
    const src = read('src/screens/ScheduleMatchScreen.tsx');
    assert.match(src, /teams\.filter\(\(t\) => !isQuickPlaceholder\(t\) \|\| t\.id === home \|\| t\.id === away\)/);
    assert.ok(!/teams=\{teams\}/.test(src), 'every picker gets the filtered list');
  });
});
