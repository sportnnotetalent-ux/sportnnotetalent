/**
 * MVP PD2 / PB6 — a "Time up" ending (docs/security/breaks/mvp-time-up.md).
 * The leader on sets (games), then on all games (points) played, wins; level
 * is a draw (and can't end a knockout). It counts with the real score, never
 * as a forfeit, and needs no migration (matches.winner carries it).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { timeUpLeader } from '../src/core/timeUp.ts';
import { manualResultLine } from '../src/core/matchResult.ts';
import { resultMark, markedLine } from '../src/sports/scoreline.ts';
import { sideResults } from '../src/data/appearances.ts';
import type { LineScore } from '../src/sports/scoreline.ts';

const ls = (won: [number, number], done: [number, number][], current: [number, number] | null): LineScore => ({
  unit: 'set', won: { home: won[0], away: won[1] }, done: done.map(([home, away]) => ({ home, away })),
  current: current ? { home: current[0], away: current[1] } : null, ended: false, toWin: 2,
});
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('TU2: the leader wins', () => {
  test('ahead on sets', () => assert.equal(timeUpLeader(ls([1, 0], [[6, 4]], [2, 3])), 'home'));
  test('level on sets: ahead on all games', () => assert.equal(timeUpLeader(ls([1, 1], [[4, 6], [6, 2]], [3, 1])), 'home'));
  test('level on sets, games decide even against the current set', () => assert.equal(timeUpLeader(ls([1, 1], [[6, 0], [4, 6]], [1, 3])), 'home'));
  test('away can lead', () => assert.equal(timeUpLeader(ls([0, 0], [], [2, 4])), 'away'));
  test('level on both: no leader', () => assert.equal(timeUpLeader(ls([1, 1], [[6, 4], [4, 6]], [2, 2])), null));
  test('nothing known: no leader', () => assert.equal(timeUpLeader(null), null));
});

describe('TU1: how it reads', () => {
  test('result line', () => {
    assert.equal(manualResultLine({ kind: 'time_up', winner: 'home', reason: 'Time up' }, 'Asha', 'Bina'), 'Asha won on time');
    assert.equal(manualResultLine({ kind: 'time_up', winner: 'away', reason: 'Court booking ended' }, 'Asha', 'Bina'), 'Bina won on time — Court booking ended');
    assert.equal(manualResultLine({ kind: 'time_up', reason: 'Time up' }, 'Asha', 'Bina'), 'Level when time ran out — match drawn');
    assert.equal(manualResultLine({ kind: 'time_up', winner: 'home', reason: 'Time up' }, 'Asha', 'Bina', { retireTerms: true }), 'Asha won on time');
  });
  test('scoreline mark', () => {
    assert.equal(resultMark({ result: { kind: 'time_up', winner: 'home' } }), '(time)');
    assert.equal(resultMark({ result: { kind: 'time_up', winner: 'home' } }, 'generic'), '(time)');
    assert.equal(markedLine('6-4, 3-2', '(time)'), '6-4, 3-2 (time)');
  });
});

describe('TU3 / TU5: how it counts', () => {
  const m = (winner: 'home' | 'away' | 'draw', r: { kind: 'time_up'; winner?: 'home' | 'away' }) =>
    ({ sport: 'padel', status: 'completed', winner, result: { ...r, reason: 'Time up' } }) as never;
  test('profiles: W / L, or D when level', () => {
    assert.deepEqual(sideResults(m('home', { kind: 'time_up', winner: 'home' })), { home: 'W', away: 'L' });
    assert.deepEqual(sideResults(m('draw', { kind: 'time_up' })), { home: 'D', away: 'D' });
  });
  test('saving: winner is the leader, or a draw; never a forfeit score', () => {
    const src = read('src/data/repos.ts');
    assert.match(src, /r\.kind === 'time_up' \? r\.winner \?\? 'draw'/);
    assert.match(src, /if \(\(r\.kind === 'conceded' \|\| r\.kind === 'awarded'\) && r\.winner && r\.forfeit === undefined\)/);
  });
});

describe('TU1 / TU4: the end sheet', () => {
  const src = read('src/screens/LiveScoringScreen.tsx');
  test('racket set / game sports get a "Time up" chip', () => {
    assert.match(src, /kind: 'time_up' as ResultKind, label: 'Time up'/);
    assert.match(src, /plugin\.retireTerms && plugin\.lineScore/);
  });
  test('the winner comes from the score, not a pick', () => assert.match(src, /timeUpLeader\(/));
  test('a level knockout cannot end on time', () => assert.match(src, /endKind === 'time_up' && knockout && !timeUpWinner/));
});
