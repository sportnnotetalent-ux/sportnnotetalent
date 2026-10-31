/**
 * Quick game (MVP, founder 2026-10-31): a doubles friendly took 12–14 taps and
 * three typed names before the first point. Now the sport is already picked
 * (the last one used, else the first from the first-run questions), and a side
 * left empty starts as "Team A" / "Player A" / "Pair A" — names and players
 * can be added any time. Tournament matches still need both sides.
 * Pure part: src/core/quickGame.ts; wiring: ScheduleMatchScreen.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickSideName, quickSideShort, startSport, LAST_SPORT_KEY } from '../src/core/quickGame.ts';

describe('empty sides get plain names', () => {
  test('teams, singles and doubles', () => {
    assert.deepEqual([quickSideName('team', 'home'), quickSideName('team', 'away')], ['Team A', 'Team B']);
    assert.deepEqual([quickSideName('individual', 'home'), quickSideName('individual', 'away')], ['Player A', 'Player B']);
    assert.deepEqual([quickSideName('pairs', 'home'), quickSideName('pairs', 'away')], ['Pair A', 'Pair B']);
    assert.deepEqual([quickSideShort('home'), quickSideShort('away')], ['A', 'B']);
  });
});

describe('the sport is already picked', () => {
  const known = ['football', 'tennis', 'pickleball'];
  test('the last sport used comes first', () => {
    assert.equal(startSport({ last: 'pickleball', mine: ['football'], known }), 'pickleball');
  });
  test('else the first sport from the first-run questions', () => {
    assert.equal(startSport({ last: null, mine: ['tennis', 'football'], known }), 'tennis');
  });
  test('nothing known, or something that isn\'t a sport: the picker stays empty', () => {
    assert.equal(startSport({ last: null, mine: [], known }), null);
    assert.equal(startSport({ last: 'not-a-sport', mine: [], known }), null);
  });
});

describe('the wiring', () => {
  const src = readFileSync(new URL('../src/screens/ScheduleMatchScreen.tsx', import.meta.url), 'utf8');
  test('a friendly with an empty side creates it instead of refusing; a tournament match still needs both', () => {
    assert.match(src, /quickSideName\(mode, 'home'\)/);
    assert.match(src, /quickSideName\(mode, 'away'\)/);
    assert.match(src, /if \(isFriendly && \(!h \|\| !a\)\)/);
  });
  test('the sport is pre-picked for a new friendly and remembered after it starts', () => {
    assert.match(src, /startSport\(/);
    assert.match(src, /setItem\(LAST_SPORT_KEY, sport\)/);
    assert.equal(LAST_SPORT_KEY, 'sn.friendly.lastSport');
  });
  test('the two quick sides never share a colour', () => {
    assert.match(src, /colorHex: TEAM_PALETTE\[0\]/);
    assert.match(src, /colorHex: TEAM_PALETTE\[1\]/);
  });
});
