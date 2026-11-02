/**
 * Pool scotch doubles: who shoots, who breaks, a wrong ball first
 * (docs/security/breaks/pool-scotch-rotation.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as M from '../src/sports/pool/match.ts';
import * as C from '../src/sports/pool/controls.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const HOME = ['likhi', 'hrudhay'];
const AWAY = ['ashok', 'kartheek'];
const next = (s: M.PoolMatch, side: 'home' | 'away') => C.shooterPick(s, side, side === 'home' ? HOME : AWAY).suggested;

describe('SR1: the organiser picks how partners take turns', () => {
  test('a scotch-doubles setting, world rules by default, hidden in singles', () => {
    const f = POOL_META.formatFields!.find((x) => x.key === 'scotchTurns')!;
    assert.ok(f, 'the field exists');
    assert.equal(f.default, 'shot');
    assert.deepEqual(f.options!.map((o) => o.value), ['shot', 'turn']);
    assert.deepEqual(f.hideWhen, { key: 'playersPerSide', value: 1 });
  });
  test('the match keeps the setting; anything else means world rules', () => {
    assert.equal(M.poolInit({ playersPerSide: 2, scotchTurns: 'turn' }).opt!.turns, 'turn');
    for (const v of [undefined, 'shot', 'TURN', 1, true, { turn: 1 }]) {
      assert.equal(M.poolInit({ playersPerSide: 2, scotchTurns: v }).opt!.turns, undefined, String(v));
    }
    assert.equal(C.scotchTurns(M.poolInit({ playersPerSide: 2, scotchTurns: 'turn' })), 'turn');
    assert.equal(C.scotchTurns(M.poolInit({ playersPerSide: 2 })), 'shot');
    assert.equal(C.scotchTurns({ opt: { turns: '__proto__' } } as never), 'shot');
  });

  test('world rules: partners alternate every shot, the break included', () => {
    let s = M.poolInit({ game: 'eight', playersPerSide: 2 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [4], side: 'home' }, { pid: 'hrudhay' }));
    assert.equal(next(s, 'home'), 'likhi', 'the partner shoots after the break');
    s = M.poolReducer(s, C.potAction(s, [12], {}, { pid: 'likhi' }));
    assert.equal(next(s, 'home'), 'hrudhay');
  });

  test('full turn: the founder\'s match, shot by shot', () => {
    let s = M.poolInit({ game: 'eight', raceTo: 5, playersPerSide: 2, scotchTurns: 'turn' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [4], side: 'home' }, { pid: 'hrudhay' }));
    assert.equal(next(s, 'home'), 'hrudhay', 'a ball in on the break: Hrudhay keeps shooting');
    assert.equal(C.shooterPick(s, 'home', HOME).keeps, true);
    s = M.poolReducer(s, C.potAction(s, [12], {}, { pid: 'hrudhay' }));
    assert.equal(next(s, 'home'), 'hrudhay', 'still at the table');
    s = M.poolReducer(s, C.missAction(s, { pid: 'hrudhay' }));
    assert.equal(s.rack!.shooter, 'away');
    s = M.poolReducer(s, C.missAction(s, { pid: 'kartheek' })); // the scorer picked Kartheek
    assert.equal(next(s, 'home'), 'likhi', 'the team\'s next turn: the partner');
    assert.equal(C.shooterPick(s, 'home', HOME).keeps, false);
    s = M.poolReducer(s, C.potAction(s, [10], {}, { pid: 'likhi' }));
    assert.equal(next(s, 'home'), 'likhi');
    s = M.poolReducer(s, C.foulAction(s, 'scratch', {}, { pid: 'likhi' }));
    assert.equal(next(s, 'away'), 'ashok', 'a foul ends the turn; the other team\'s partner comes next');
    s = M.poolReducer(s, C.safetyAction(s, [], { pid: 'ashok' }));
    assert.equal(next(s, 'home'), 'hrudhay', 'a safety ends the turn');
  });

  test('a dry break: the other team shoots, and the breaker\'s partner plays the team\'s next turn', () => {
    let s = M.poolInit({ game: 'eight', playersPerSide: 2, scotchTurns: 'turn' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [], side: 'home' }, { pid: 'hrudhay' }));
    s = M.poolReducer(s, C.missAction(s, { pid: 'kartheek' }));
    assert.equal(next(s, 'home'), 'likhi');
  });

  test('the scorer can credit the other partner, and the rotation follows who was credited', () => {
    let s = M.poolInit({ game: 'nine', playersPerSide: 2, scotchTurns: 'turn' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [2], side: 'home' }, { pid: 'hrudhay' }));
    s = M.poolReducer(s, C.potAction(s, [1], {}, { pid: 'likhi' })); // changed: Likhi took this one
    assert.equal(next(s, 'home'), 'likhi');
  });
});

describe('SR3: break order follows who played first', () => {
  for (const rule of ['shot', 'turn'] as const) {
    test(`${rule}: Hrudhay, Kartheek, Likhi, Ashok`, () => {
      let s = M.poolInit({ game: 'eight', raceTo: 9, playersPerSide: 2, scotchTurns: rule });
      s = M.poolReducer(s, C.lagAction(s, 'home'));
      s = M.poolReducer(s, C.breakAction(s, { pots: [], side: 'home' }, { pid: 'hrudhay' }));
      s = M.poolReducer(s, C.missAction(s, { pid: 'kartheek' }));
      s = M.poolReducer(s, C.rackAction(s, 'home'));
      assert.equal(s.rack!.breaker, 'away');
      assert.equal(next(s, 'away'), 'kartheek', 'the team\'s first break: who played first for them');
      s = M.poolReducer(s, C.breakAction(s, { pots: [], side: 'away' }, { pid: 'kartheek' }));
      s = M.poolReducer(s, C.rackAction(s, 'home'));
      assert.equal(next(s, 'home'), 'likhi');
      s = M.poolReducer(s, C.breakAction(s, { pots: [], side: 'home' }, { pid: 'likhi' }));
      s = M.poolReducer(s, C.rackAction(s, 'home'));
      assert.equal(next(s, 'away'), 'ashok');
    });
  }
  test('nobody has played for a team yet: the first of the pair', () => {
    let s = M.poolInit({ game: 'eight', playersPerSide: 2 });
    s = M.poolReducer(s, C.lagAction(s, 'away'));
    assert.equal(next(s, 'away'), 'ashok');
  });
});

describe('SR4: an opponent\'s ball hit first is a foul', () => {
  const grouped = () => {
    let s = M.poolInit({ game: 'eight', playersPerSide: 2 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [4], side: 'home' }, { pid: 'hrudhay' }));
    s = M.poolReducer(s, C.potAction(s, [12], {}, { pid: 'likhi' })); // home: stripes
    return s;
  };
  test('only the other group in: ask what the cue ball hit first', () => {
    const s = grouped();
    assert.equal(s.rack!.solids, 'away');
    assert.equal(C.otherGroupOnly(s, [6]), 'solids');
    assert.equal(C.otherGroupOnly(s, [6, 3]), 'solids');
    for (const b of [[], [10], [6, 10], [8], [6, 8]]) assert.equal(C.otherGroupOnly(s, b), null, JSON.stringify(b));
  });
  test('open table, 9-ball and 10-ball: never asked', () => {
    let s = M.poolInit({ game: 'eight' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [] }));
    assert.equal(C.otherGroupOnly(s, [6]), null);
    let n = M.poolInit({ game: 'nine' });
    n = M.poolReducer(n, C.lagAction(n, 'home'));
    n = M.poolReducer(n, C.breakAction(n, { pots: [] }));
    assert.equal(C.otherGroupOnly(n, [6]), null);
    assert.equal(C.otherGroupOnly(null as never, [6]), null);
  });
  test('"their ball first" records a wrong-ball foul with ball in hand; the 6 stays down', () => {
    let s = grouped();
    s = M.poolReducer(s, C.foulAction(s, 'wrongBall', { balls: [6] }, { pid: 'hrudhay' }));
    assert.equal(s.rack!.shooter, 'away');
    assert.equal(s.rack!.bih, true);
    assert.ok(!s.rack!.table.includes(6));
    assert.equal(M.playerCounts(s, 'hrudhay').foulWrongBall, 1);
  });
  test('"own ball first" passes the turn with no foul', () => {
    let s = grouped();
    s = M.poolReducer(s, C.potAction(s, [6], {}, { pid: 'hrudhay' }));
    assert.equal(s.rack!.shooter, 'away');
    assert.notEqual(s.rack!.bih, true);
  });
});

describe('SR2 + SR4: the screen', () => {
  const src = read('src/sports/pool/index.tsx');
  test('the next shooter is a line with "Change", not a question', () => {
    assert.match(src, /\{' · '\}[\s\S]{0,300}>Change<\/Text>/);
    assert.match(src, /shoots next|keeps shooting/);
  });
  test('only their balls in: two buttons, own group first / their ball first (foul)', () => {
    assert.match(src, /otherGroupOnly\(s, picked\)/);
    assert.match(src, /foulAction\(s, 'wrongBall', \{ balls: picked \}, o\)/);
  });
});
