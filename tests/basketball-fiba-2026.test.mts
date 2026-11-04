/** Basketball — FIBA Official Basketball Rules 2026 (in force 1 Oct 2026;
 *  docs/sport-expert/basketball-rulebook.md BK-1/BK-2): disruptive and flagrant
 *  fouls replace the unsportsmanlike foul; technical fouls are category 1
 *  (count towards disqualification) or category 2 (don't). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, disqualifyingFoul, freeThrowsFor, ballAfterFoul } from '../src/sports/basketball/engine.ts';
import { foulAction } from '../src/sports/basketball/actions.ts';
import { FOUL_LABEL, DQ_LABEL } from '../src/sports/basketball/events.ts';

const P = { id: 'p1', fullName: 'Arjun' };
const after = (...acts: Parameters<typeof foulAction>[]) => acts.reduce((s, a) => reducer(s, foulAction(...a)), init({}));
const dq = (s: ReturnType<typeof init>, type: Parameters<typeof disqualifyingFoul>[2], cat2 = false) =>
  disqualifyingFoul(s, P.fullName, type, { side: 'home', pid: P.id }, cat2 ? { cat2: true } : undefined);

test('BK-1: a disruptive foul = 2 free throws and the ball, a team foul, never towards disqualification', () => {
  const s0 = init({});
  assert.equal(freeThrowsFor(s0, 'away', 'disruptive'), 2);
  assert.equal(ballAfterFoul('disruptive'), true);
  const s = after(['home', P, 'disruptive'], ['home', P, 'disruptive'], ['home', P, 'disruptive']);
  assert.equal(dq(s, 'disruptive'), undefined, 'any number of disruptive fouls');
  assert.match(FOUL_LABEL.disruptive, /Disruptive/);
});

test('BK-1: flagrant fouls count: 2 flagrant, or a category-1 technical + a flagrant, disqualify (Art. 38.2.3)', () => {
  assert.equal(dq(after(['home', P, 'flagrant']), 'flagrant'), '2U');
  assert.equal(dq(after(['home', P, 'technical']), 'flagrant'), 'T+U');
  assert.equal(dq(after(['home', P, 'flagrant']), 'technical'), 'T+U');
  assert.match(DQ_LABEL['2U'], /flagrant/);
});

test('BK-2: category-2 technicals (delay, hanging on the ring…) never count towards disqualification', () => {
  const s = reducer(init({}), foulAction('home', P, 'technical', { cat2: true }));
  const ev = s.events.find((e) => e.type === 'foul')!;
  assert.equal((ev as { techCat?: number }).techCat, 2);
  assert.equal(dq(s, 'technical', true), undefined, '2 × category 2');
  assert.equal(dq(s, 'technical'), undefined, 'category 2 + category 1 = only one that counts');
  assert.equal(dq(after(['home', P, 'technical']), 'technical'), '2T', '2 × category 1');
  assert.equal(freeThrowsFor(s, 'away', 'technical'), 1);
});

test('older logs: 2 unsportsmanlike fouls still disqualify', () => {
  assert.equal(dq(after(['home', P, 'unsportsmanlike']), 'unsportsmanlike'), '2U');
});
