/**
 * MVP B7 (basketball) — with no roster, fouls couldn't be logged at all, so
 * team fouls, the bonus and bonus free throws never worked in a pickup game.
 * Now each side has a "Team foul" button: the foul is the team's (no player),
 * counts toward the team-foul limit and the bonus. MVP B3 — a drawn game no
 * longer shows the home team as the winner on the line score.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, teamFoulsThisQuarter, freeThrowsFor, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction } from '../src/sports/basketball/actions.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const run = (s: BasketballState, ...a: ScoreAction[]) => a.reduce(reducer, s);

describe('a team foul (no player)', () => {
  test('is logged and counts as a team foul', () => {
    const s = run(init({ regPeriods: 4 }), foulAction('home', undefined, 'personal'));
    assert.equal(teamFoulsThisQuarter(s, 'home'), 1);
    assert.equal(s.events.filter((e) => e.type === 'foul').length, 1);
  });
  test('the 5th team foul puts the other side in the bonus (FIBA, 4 per quarter)', () => {
    let s = init({ regPeriods: 4, foulsForBonus: 4 });
    for (let i = 0; i < 4; i++) s = run(s, foulAction('home', undefined, 'personal'));
    assert.equal(freeThrowsFor(s, 'home', 'personal'), 2);
  });
  test('the action carries no player credit', () => {
    const a = foulAction('away', undefined, 'shooting');
    assert.equal(a.attribution, undefined);
    assert.equal((a.payload as { pid?: string }).pid, undefined);
  });
});

describe('the screen', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/basketball/index.tsx'), 'utf8');
  test('a Team foul button per side, and the foul step handles a team fouler', () => {
    assert.match(src, /Team foul — \$\{homeName\}/);
    assert.match(src, /Team foul — \$\{awayName\}/);
    assert.match(src, /TEAM_FOUL_TYPES/);
  });
  test('B3: a draw has no winner on the line score', () => {
    assert.doesNotMatch(src, /s\.home >= s\.away \? 'home' : 'away'/);
    assert.match(src, /winner=\{s\.ended && s\.home !== s\.away \? \(s\.home > s\.away \? 'home' : 'away'\) : undefined\}/);
  });
});
