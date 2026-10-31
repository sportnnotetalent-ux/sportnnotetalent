/**
 * MVP K4 — kabaddi's Pause and Timeout buttons sat just above the raid
 * buttons; a timeout was two steps (TIMEOUT, then PAUSE) and both undid as a
 * bare "Undo". Now a timeout pauses the clock in the same step (new logs:
 * `pauseAt`), the clock row sits below the raid buttons, and PAUSE / RESUME
 * have their own Undo labels. Older logs (TIMEOUT then PAUSE) replay the same.
 * MVP PB3 — pickleball doubles no longer waits for "Who starts on the right?":
 * the roster order is used until someone picks (the picker is optional).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, timeoutsUsed, type KabaddiState } from '../src/sports/kabaddi/engine.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const run = (s: KabaddiState, ...a: ScoreAction[]) => a.reduce(reducer, s);
const live = () => run(init({}), { type: 'KICKOFF', payload: { at: 1_000 } } as ScoreAction);

describe('kabaddi timeout', () => {
  test('a new timeout pauses the clock in the same step and counts', () => {
    const s = run(live(), { type: 'TIMEOUT', side: 'home', payload: { pauseAt: 60_000 } } as ScoreAction);
    assert.equal(s.pausedAt, 60_000);
    assert.equal(timeoutsUsed(s, 'home'), 1);
  });
  test('already paused: the timeout counts, the pause time stays', () => {
    const s = run(live(), { type: 'PAUSE', payload: { at: 30_000 } } as ScoreAction, { type: 'TIMEOUT', side: 'away', payload: { pauseAt: 60_000 } } as ScoreAction);
    assert.equal(s.pausedAt, 30_000);
    assert.equal(timeoutsUsed(s, 'away'), 1);
  });
  test('an older log (TIMEOUT, then PAUSE) replays as before', () => {
    const t = run(live(), { type: 'TIMEOUT', side: 'home' } as ScoreAction);
    assert.equal(t.pausedAt, undefined);
    assert.equal(run(t, { type: 'PAUSE', payload: { at: 50_000 } } as ScoreAction).pausedAt, 50_000);
  });
  test('Undo names the clock steps', () => {
    const s = live();
    assert.equal(undoLabel({ type: 'PAUSE', prev: s, next: s }, { home: 'A', away: 'B' }), 'clock pause');
    assert.equal(undoLabel({ type: 'RESUME', prev: s, next: s }, { home: 'A', away: 'B' }), 'clock restart');
  });
  test('the screen: one-step timeout, and the clock row below the raid buttons', () => {
    const src = read('src/sports/kabaddi/index.tsx');
    assert.match(src, /type: 'TIMEOUT', side, payload: \{ pauseAt: Date\.now\(\) \}/);
    assert.ok(src.indexOf("{!raidFlow ? (") < src.indexOf('SD-117b: pause the clock'), 'clock row after the raid buttons');
  });
});

describe('pickleball start-right', () => {
  const src = read('src/sports/rallyCore.tsx');
  test('scoring waits only for "who serves first", not "who starts on the right"', () => {
    assert.match(src, /const blocked = needsServer;/);
  });
  test('the picker is optional and folded away', () => {
    assert.match(src, /optional — roster order/);
  });
});
