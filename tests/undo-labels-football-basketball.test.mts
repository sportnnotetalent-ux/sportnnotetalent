/**
 * MVP F1 / B5 — Undo names what it will remove in football and basketball, as
 * cricket and rugby already do ("goal · Ravi (2-1)", "+3 · Arjun (54-50)").
 * Built from the newest step only; never prints "undefined"; with nothing to
 * name, null (the bar falls back to plain "Undo").
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init as fInit, reducer as fReducer, type FootballState } from '../src/sports/football/engine.ts';
import { goalAction, teamGoalAction, assistAction, statAction, cardActions } from '../src/sports/football/actions.ts';
import { footballUndoLabel } from '../src/sports/football/undoLabel.ts';
import { init as bInit, reducer as bReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { scoreAction, freeThrowAction, foulAction, missAction } from '../src/sports/basketball/actions.ts';
import { basketballUndoLabel } from '../src/sports/basketball/undoLabel.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const NAMES: Record<string, string> = { p1: 'Ravi Kumar', p2: 'Ajay Singh', b1: 'Arjun Rao' };
const nameOf = (id?: string | null, legacy?: string | null) => (id && NAMES[id]) || (legacy ?? '').trim() || 'Player';
const bad = /undefined|null|NaN/;

describe('football', () => {
  const step = (s: FootballState, a: ScoreAction) => { const next = fReducer(s, a); return { label: footballUndoLabel({ type: a.type, prev: s, next }, nameOf), next }; };
  const live = fReducer(fInit({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
  test('a goal names the scorer and the score; a team goal just the score', () => {
    const g = step(live, goalAction('home', { id: 'p1' }, 'open'));
    assert.equal(g.label, 'goal · Ravi Kumar (1-0)');
    assert.equal(step(g.next, teamGoalAction('away')).label, 'goal (1-1)');
  });
  test('an assist names the assister', () => {
    const g = step(live, goalAction('home', { id: 'p1' }, 'open')).next;
    assert.equal(step(g, assistAction('home', { id: 'p2' })).label, 'assist · Ajay Singh');
  });
  test('stats say what they were, with the player or for the team', () => {
    assert.equal(step(live, statAction('shot', 'home', { id: 'p1' }, { onTarget: true })).label, 'shot on target · Ravi Kumar');
    assert.equal(step(live, statAction('shot', 'away', undefined, { onTarget: false })).label, 'shot off target');
    assert.equal(step(live, statAction('foul', 'home', undefined)).label, 'foul');
    assert.equal(step(live, statAction('pass', 'home', { id: 'p2' }, { complete: false })).label, 'pass misplaced · Ajay Singh');
  });
  test('cards, and the quiet steps', () => {
    const [y] = cardActions(live.events, 'home', 'yellow', { id: 'p1' });
    assert.equal(step(live, y).label, 'yellow card · Ravi Kumar');
    assert.equal(footballUndoLabel({ type: 'KICKOFF', prev: fInit({}), next: live }, nameOf), 'kick-off');
    assert.equal(footballUndoLabel({ type: 'POSSESSION', prev: live, next: live }, nameOf), 'possession switch');
  });
  test('nothing to name → null, never "undefined"', () => {
    assert.equal(footballUndoLabel(null, nameOf), null);
    assert.equal(footballUndoLabel({ type: 'MYSTERY', prev: live, next: live }, nameOf), null);
  });
});

describe('basketball', () => {
  const step = (s: BasketballState, a: ScoreAction) => { const next = bReducer(s, a); return { label: basketballUndoLabel({ type: a.type, prev: s, next }, nameOf), next }; };
  const live = bReducer(bInit({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
  test('a basket: points, scorer, score; a team basket without the scorer', () => {
    const a = step(live, scoreAction('home', 3, { id: 'b1' }));
    assert.equal(a.label, '+3 · Arjun Rao (3-0)');
    assert.equal(step(a.next, scoreAction('away', 2)).label, '+2 (3-2)');
  });
  test('free throws, misses and fouls', () => {
    assert.equal(step(live, freeThrowAction('home', true, { id: 'b1' })).label, 'free throw made · Arjun Rao (1-0)');
    assert.equal(step(live, freeThrowAction('away', false)).label, 'free throw missed');
    assert.equal(step(live, missAction('home', 3, { id: 'b1' })).label, 'missed 3 · Arjun Rao');
    assert.equal(step(live, foulAction('home', { id: 'b1' }, 'shooting')).label, 'shooting foul · Arjun Rao');
    assert.equal(step(live, foulAction('away', undefined, 'personal')).label, 'team foul (personal)');
  });
  test('quiet steps, and nothing to name → null', () => {
    assert.equal(basketballUndoLabel({ type: 'KICKOFF', prev: bInit({}), next: live }, nameOf), 'tip-off');
    assert.equal(basketballUndoLabel({ type: 'MYSTERY', prev: live, next: live }, nameOf), null);
  });
  test('no label ever prints undefined / null / NaN', () => {
    for (const a of [scoreAction('home', 2), freeThrowAction('home', true), foulAction('home', undefined, 'technical'), missAction('away', 2)]) {
      const l = step(live, a).label;
      assert.ok(l && !bad.test(l), String(l));
    }
  });
});

test('both plugins use them', () => {
  for (const [f, fn] of [['src/sports/football/index.tsx', 'footballUndoLabel'], ['src/sports/basketball/index.tsx', 'basketballUndoLabel']]) {
    assert.match(readFileSync(join(import.meta.dirname, '..', f), 'utf8'), new RegExp(`undoLabel: \\(step, nameOf\\) => ${fn}\\(step, nameOf\\)`), f);
  }
});
