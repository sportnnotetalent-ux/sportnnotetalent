/**
 * The result picture at full time (docs/security/breaks/full-time-share.md):
 * a "Share the result" prompt when the match ends, and Player of the match on
 * the card and in the message, by its PUBLIC name (a possible minor by
 * initials; a disputed player not at all).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardModel, cardStar } from '../src/core/resultCard.ts';
import { matchShareText } from '../src/core/shareText.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const players = [{ id: 'a', fullName: 'Ravi Kumar', age: 31 }, { id: 'k', fullName: 'Meera Rao', age: 14 }, { id: 'u', fullName: 'Arjun Das' }];

describe('R2 / R3 / R4: who is named', () => {
  test('an adult by name', () => assert.equal(cardStar({ id: 'a', name: 'Ravi Kumar' }, players, new Set()), 'Ravi Kumar'));
  test('a child by initials, even if this viewer sees the full name', () => assert.equal(cardStar({ id: 'k', name: 'Meera Rao' }, players, new Set()), 'M. R.'));
  test('age unknown: initials', () => assert.equal(cardStar({ id: 'u', name: 'Arjun Das' }, players, new Set()), 'A. D.'));
  test('not on the rosters: initials', () => assert.equal(cardStar({ name: 'Someone Else' }, players, new Set()), 'S. E.'));
  test('a disputed player: nobody', () => assert.equal(cardStar({ id: 'a', name: 'Ravi Kumar' }, players, new Set(['a'])), undefined));
  test('no player of the match: nothing', () => assert.equal(cardStar(undefined, players, new Set()), undefined));
});

describe('R2: on the card and in the message', () => {
  const base = { sportName: 'Football', status: 'final' as const, home: 'Panthers', away: 'Cheetahs', homeScore: '2', awayScore: '1', winner: 'home' as const };
  test('the card carries it on a result; not on live / upcoming', () => {
    assert.equal(cardModel({ ...base, star: 'Ravi Kumar' }).star, 'Player of the match: Ravi Kumar');
    assert.equal(cardModel({ ...base, status: 'live', star: 'Ravi Kumar' }).star, '');
    assert.equal(cardModel(base).star, '');
  });
  test('long names are shortened', () => assert.ok(cardModel({ ...base, star: 'A'.repeat(80) }).star.length <= 48));
  test('the message says it, after the result', () => {
    const t = matchShareText({ sportIcon: '⚽', status: 'final', home: 'Panthers', away: 'Cheetahs', homeScore: '2', awayScore: '1', winner: 'home', star: 'Ravi Kumar', matchId: 'm1' });
    const lines = t.split('\n');
    assert.equal(lines[lines.indexOf('🏆 Panthers won') + 1], '🏅 Player of the match: Ravi Kumar');
    assert.ok(!matchShareText({ sportIcon: '⚽', status: 'live', home: 'P', away: 'C', homeScore: '1', awayScore: '0', star: 'Ravi', matchId: 'm1' }).includes('Player of the match'));
  });
  test('the picture draws it', () => assert.match(read('src/core/resultCardImage.ts'), /if \(m\.star\)/));
});

describe('R1: the prompt at full time', () => {
  const src = read('src/screens/LiveScoringScreen.tsx');
  test('a "Share the result" button where the match-complete line was', () => {
    assert.match(src, /accessibilityLabel="Share the result" onPress=\{\(\) => shareRef\.current\(\)\}/);
  });
  test('guests are asked to save first (no share of an unsaved game)', () => {
    assert.match(src, /complete && !guestMode \? \(/);
  });
  test('the share uses the public name', () => {
    assert.match(src, /cardStar\(storedPotm \? \{ id: storedPotm\.playerId, name: storedPotm\.name \} : autoPotmNow\(\), \[\.\.\.homeFull, \.\.\.awayFull\], disputedOpenIds\)/);
  });
});
