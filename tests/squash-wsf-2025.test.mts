/** Squash — World Squash Singles Rules 2025, Appendix 3 video review
 *  (docs/sport-expert/squash-rulebook.md SQ-1): best of 5 = 2 reviews a match
 *  plus 1 fresh in the 5th game; best of 3 = 1 a match plus 1 in the 3rd; a
 *  review is kept when the decision is overruled, lost when it is upheld. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsLeft } from '../src/sports/conduct.ts';

const lost = (game: number, side = 'home') => ({ id: game * 10, stamp: '', icon: '', label: '', kind: 'review', side, rev: 'rejected', game });
const kept = (game: number, side = 'home') => ({ id: game * 10 + 1, stamp: '', icon: '', label: '', kind: 'review', side, rev: 'upheld', game });

test('best of 5: 2 per match across games 1–4', () => {
  assert.equal(reviewsLeft([], 'home', 1, 3), 2);
  assert.equal(reviewsLeft([lost(1)] as never, 'home', 2, 3), 1, 'a lost review in game 1 counts in game 2');
  assert.equal(reviewsLeft([lost(1), lost(3)] as never, 'home', 4, 3), 0);
  assert.equal(reviewsLeft([kept(1), kept(2), kept(3)] as never, 'home', 4, 3), 2, 'successful reviews are kept');
  assert.equal(reviewsLeft([lost(1), lost(2)] as never, 'away', 3, 3), 2, 'per player');
});

test('best of 5: one fresh review in the 5th game, unused ones not carried', () => {
  assert.equal(reviewsLeft([lost(1), lost(2)] as never, 'home', 5, 3), 1);
  assert.equal(reviewsLeft([] as never, 'home', 5, 3), 1, 'unused not carried');
  assert.equal(reviewsLeft([lost(5)] as never, 'home', 5, 3), 0);
});

test('best of 3: 1 per match, plus 1 in the 3rd game', () => {
  assert.equal(reviewsLeft([], 'home', 1, 2), 1);
  assert.equal(reviewsLeft([lost(1)] as never, 'home', 2, 2), 0);
  assert.equal(reviewsLeft([lost(1)] as never, 'home', 3, 2), 1);
});
