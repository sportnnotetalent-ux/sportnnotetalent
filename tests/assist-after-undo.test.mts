/**
 * MVP F2 / B6 — an assist picked from the "Assist?" prompt after an Undo
 * removed its goal / basket must do nothing. Before: football attached it to
 * the side's latest remaining goal (its real assister silently lost the
 * assist); basketball logged a phantom assist with no basket.
 * Now the prompt's assist carries its goal / basket id (`ref`) and the engine
 * attaches it only to that one. An assist without `ref` (older logs, and
 * basketball's player-row Assist button) works exactly as before.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init as fInit, reducer as fReducer, type FootballState } from '../src/sports/football/engine.ts';
import { goalAction, assistAction } from '../src/sports/football/actions.ts';
import { init as bInit, reducer as bReducer } from '../src/sports/basketball/engine.ts';
import { scoreAction, statAction } from '../src/sports/basketball/actions.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const run = <S,>(r: (s: S, a: ScoreAction) => S, s: S, ...a: ScoreAction[]) => a.reduce(r, s);

describe('football', () => {
  const live = fReducer(fInit({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
  const goals = (s: FootballState) => s.events.filter((e) => e.type === 'goal').map((e) => ({ id: e.id, by: e.playerId, ast: e.secondId }));
  test('the bug: goal 1 (assist p2), goal 2, Undo goal 2, then the stale prompt picks p4', () => {
    const g1 = run(fReducer, live, goalAction('home', { id: 'p1' }, 'open'));
    const g1id = g1.events.at(-1)!.id;
    const withAssist = run(fReducer, g1, assistAction('home', { id: 'p2' }, undefined, g1id));
    const g2 = run(fReducer, withAssist, goalAction('home', { id: 'p3' }, 'open'));
    const g2id = g2.events.at(-1)!.id;
    const undone = withAssist; // Undo removed goal 2
    const after = run(fReducer, undone, assistAction('home', { id: 'p4' }, undefined, g2id));
    assert.deepEqual(goals(after), [{ id: g1id, by: 'p1', ast: 'p2' }], 'goal 1 keeps p2; p4 goes nowhere');
    assert.ok(g2);
  });
  test('the normal path: the assist lands on its own goal even with a later goal on the board', () => {
    const g1 = run(fReducer, live, goalAction('home', { id: 'p1' }, 'open'));
    const g1id = g1.events.at(-1)!.id;
    const g2 = run(fReducer, g1, goalAction('home', { id: 'p3' }, 'open'));
    const after = run(fReducer, g2, assistAction('home', { id: 'p2' }, undefined, g1id));
    assert.equal(goals(after)[0].ast, 'p2');
    assert.equal(goals(after)[1].ast, undefined);
  });
  test('an older assist (no ref) still goes to the latest goal', () => {
    const s = run(fReducer, live, goalAction('home', { id: 'p1' }, 'open'), goalAction('home', { id: 'p3' }, 'open'), assistAction('home', { id: 'p2' }));
    assert.equal(goals(s)[1].ast, 'p2');
  });
});

describe('basketball', () => {
  const live = bReducer(bInit({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
  const assists = (s: ReturnType<typeof bInit>) => s.events.filter((e) => e.type === 'assist').length;
  test('the prompt\'s assist after Undo removed its basket: ignored', () => {
    const made = run(bReducer, live, scoreAction('home', 2, { id: 'b1' }));
    const basketId = made.events.at(-1)!.id;
    const after = run(bReducer, live /* Undo */, statAction('home', 'ASSIST', { id: 'b2' }, basketId));
    assert.equal(assists(after), 0);
  });
  test('the prompt\'s assist with its basket on the board: logged', () => {
    const made = run(bReducer, live, scoreAction('home', 2, { id: 'b1' }));
    const after = run(bReducer, made, statAction('home', 'ASSIST', { id: 'b2' }, made.events.at(-1)!.id));
    assert.equal(assists(after), 1);
  });
  test('the player-row Assist button (no ref) works as before', () => {
    assert.equal(assists(run(bReducer, live, statAction('home', 'ASSIST', { id: 'b2' }))), 1);
  });
});

describe('the screens', () => {
  const fb = readFileSync(join(import.meta.dirname, '..', 'src/sports/football/index.tsx'), 'utf8');
  const bb = readFileSync(join(import.meta.dirname, '..', 'src/sports/basketball/index.tsx'), 'utf8');
  test('the prompts pass their goal / basket id and close when it is gone', () => {
    assert.match(fb, /assistAction\(side, p, trackedKeys\(\), goalId\)/);
    assert.match(fb, /goalId/);
    assert.match(bb, /statAction\(assistFor\.side, 'ASSIST', p, assistFor\.ref\)/);
    assert.match(bb, /assistFor && assistFor\.ref != null && !state\.events\.some\(\(e\) => e\.id === assistFor\.ref\)/);
  });
});
