/**
 * Share a match as a picture (MVP, founder 2026-10-31): the same Share tap on
 * the web sends a score card image with the text (WhatsApp status, Instagram).
 * Pure part: src/core/resultCard.ts. Drawing: src/core/resultCardImage.ts (web).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardModel, CARD_NAME_MAX } from '../src/core/resultCard.ts';

const base = { sportName: 'Football', status: 'live' as const, home: 'Panthers', away: 'Cheetahs', homeScore: '2', awayScore: '1', statusLine: '2nd Half' };

describe('the card says what happened', () => {
  test('live: LIVE, both sides, the score and where the game is', () => {
    const c = cardModel({ ...base, tournamentName: 'Inter-School Championship', venue: 'Gachibowli' });
    assert.equal(c.badge, 'LIVE');
    assert.deepEqual([c.home, c.homeScore, c.away, c.awayScore], ['Panthers', '2', 'Cheetahs', '1']);
    assert.equal(c.line, '2nd Half');
    assert.equal(c.where, 'Inter-School Championship · Gachibowli');
    assert.equal(c.footer, 'sportnnote.in');
  });
  test('a result: RESULT and who won (or drawn)', () => {
    assert.equal(cardModel({ ...base, status: 'final', winner: 'home' }).line, 'Panthers won');
    assert.equal(cardModel({ ...base, status: 'final', winner: 'draw' }).line, 'Drawn');
    assert.equal(cardModel({ ...base, status: 'final', winner: 'home' }).badge, 'RESULT');
    assert.equal(cardModel({ ...base, status: 'final', resultLine: 'Panthers won by walkover' }).line, 'Panthers won by walkover');
  });
  test('upcoming: no scores, the kick-off instead', () => {
    const c = cardModel({ ...base, status: 'upcoming', homeScore: '', awayScore: '', when: 'Sat 31 Oct, 4:00 pm' });
    assert.equal(c.badge, 'UPCOMING');
    assert.equal(c.homeScore, '');
    assert.equal(c.line, 'Sat 31 Oct, 4:00 pm');
  });
  test('long names are shortened with an ellipsis so they fit the picture', () => {
    const c = cardModel({ ...base, home: 'Hyderabad Football Club Under-19 Development Squad' });
    assert.ok(c.home.length <= CARD_NAME_MAX);
    assert.ok(c.home.endsWith('…'));
  });
});

describe('the wiring', () => {
  test('the match Share sends the card with the text; anything that can\'t share files gets the text as before', () => {
    const screen = readFileSync(new URL('../src/screens/LiveScoringScreen.tsx', import.meta.url), 'utf8');
    assert.match(screen, /shareMessageWithCard\(/);
    const share = readFileSync(new URL('../src/core/share.ts', import.meta.url), 'utf8');
    assert.match(share, /canShare\(\{ files/);
    assert.match(share, /return shareMessage\(message, what\)/);
  });
});
