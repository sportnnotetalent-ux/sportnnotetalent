/**
 * MVP B2 — a running game clock for basketball friendlies. The stoppable clock
 * stops itself on every foul and late basket and waits for a Start tap; a lone
 * scorer forgets, and the clock sits still. "Running" stops only for time-outs
 * (and holds at 0:00 at the end of a period). It's the friendly default;
 * tournaments keep the stoppable clock. Saved matches (no `clockMode`) run as
 * before.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, clockRunning, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, scoreAction } from '../src/sports/basketball/actions.ts';
import { BASKETBALL_META } from '../src/sports/basketball/meta.ts';
import { formatDefaults } from '../src/sports/formatPick.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const T0 = 1_700_000_000_000;
const run = (s: BasketballState, ...a: ScoreAction[]) => a.reduce(reducer, s);
const at = (a: ScoreAction, t: number, sec?: number): ScoreAction => ({ ...a, payload: { ...a.payload, at: t, ...(sec != null ? { sec } : {}) } });
const tip: ScoreAction = { type: 'KICKOFF', payload: { at: T0 } };
const CFG = { regPeriods: 4, periodMinutes: 10, gameClock: true };

describe('running clock', () => {
  const s0 = run(init({ ...CFG, clockMode: 'run' }), tip);
  test('a foul does not stop it', () => {
    assert.equal(clockRunning(run(s0, at(foulAction('home', undefined, 'personal'), T0 + 60_000))), true);
  });
  test('a basket in the last two minutes does not stop it', () => {
    const q4 = run(init({ ...CFG, clockMode: 'run' }), { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, tip);
    assert.equal(clockRunning(run(q4, at(scoreAction('home', 2), T0 + 9 * 60_000, 540))), true);
  });
  test('a time-out still stops it', () => {
    assert.equal(clockRunning(run(s0, at({ type: 'TIMEOUT', side: 'home', payload: {} }, T0 + 60_000))), false);
  });
});

describe('stoppable clock and saved matches: unchanged', () => {
  test('no clockMode (every saved match): a foul stops the clock, as before', () => {
    const s = run(init(CFG), tip, at(foulAction('home', undefined, 'personal'), T0 + 60_000));
    assert.equal(clockRunning(s), false);
  });
  test('clockMode "stop": a foul stops it', () => {
    const s = run(init({ ...CFG, clockMode: 'stop' }), tip, at(foulAction('home', undefined, 'personal'), T0 + 60_000));
    assert.equal(clockRunning(s), false);
  });
});

describe('the format', () => {
  const f = BASKETBALL_META.formatFields!.find((x) => x.key === 'clockMode')!;
  test('Running is the friendly default; tournaments keep Stoppable; hidden with no game clock', () => {
    assert.equal(f.default, 'run');
    assert.equal(f.tournamentDefault, 'stop');
    assert.deepEqual(f.hideWhen, { key: 'gameClock', value: false });
  });
  test('defaultsFor honours a field\'s own tournament default', () => {
    // defaultsFor = formatPick.ts formatDefaults (badminton-3x15 moved it there)
    const fields = BASKETBALL_META.formatFields!;
    const f = fields.find((x) => x.tournamentDefault != null && x.type !== 'preset')!;
    assert.equal(formatDefaults(fields, 'tournament')[f.key], f.tournamentDefault);
    assert.equal(formatDefaults(fields)[f.key], f.default);
  });
});
