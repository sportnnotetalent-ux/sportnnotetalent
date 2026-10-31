/**
 * MVP F5 — a pickup football game with no players listed dead-ended: 12 of the
 * 13 stat buttons, the foul and the penalty opened "No players on the field."
 * with only Cancel. Now, when the side has no players, the "who?" step is
 * skipped and the stat is logged for the team (as corners and team goals
 * already were). Cards still need a person (a second yellow is per player), so
 * they keep the "Team official" option.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterTeamPick, statAction } from '../src/sports/football/actions.ts';

describe('what comes after picking the team', () => {
  test('with players listed: unchanged — ask who', () => {
    for (const k of ['shot', 'pass', 'tackle', 'interception', 'cross', 'dribble', 'offside', 'handball', 'card'] as const) assert.equal(afterTeamPick(k, true), 'player', k);
    for (const k of ['corner', 'goalKick', 'throwIn'] as const) assert.equal(afterTeamPick(k, true), 'record', k);
  });
  test('no players: shots and passes go straight to their outcome; the rest is logged for the team', () => {
    assert.equal(afterTeamPick('shot', false), 'detail');
    assert.equal(afterTeamPick('pass', false), 'detail');
    for (const k of ['tackle', 'interception', 'cross', 'dribble', 'offside', 'handball', 'clearance', 'corner'] as const) assert.equal(afterTeamPick(k, false), 'record', k);
  });
  test('no players: a card still asks (team official only)', () => {
    assert.equal(afterTeamPick('card', false), 'player');
  });
});

describe('a team-level stat', () => {
  test('a team foul / shot carries no player and hands possession as a player\'s would', () => {
    const f = statAction('foul', 'home', undefined, {}, { possSide: 'away' });
    assert.equal(f.attribution, undefined);
    assert.equal((f.payload as { kind: string; possSide: string }).possSide, 'away');
    const s = statAction('shot', 'away', undefined, { onTarget: true });
    assert.equal(s.attribution, undefined);
    assert.equal((s.payload as { onTarget: boolean }).onTarget, true);
  });
});

describe('the screen wires it in', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/football/index.tsx'), 'utf8');
  test('team pick, foul and penalty skip the player step when the side has no players', () => {
    assert.match(src, /afterTeamPick\(kind, xi\(side\)\.length > 0\)/);
    assert.match(src, /recordTeamFoul\(/);
    assert.match(src, /xi\(side\)\.length === 0 \? setFlow\(\{ mode: 'pen', step: 'outcome', side \}\)/);
  });
});
