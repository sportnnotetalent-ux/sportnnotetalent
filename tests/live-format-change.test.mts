/**
 * MVP B6 / T9 — change the format of a live friendly
 * (docs/security/breaks/mvp-live-format.md). The format stays in
 * matches.format; a FORMAT marker row in the log tells viewers to reload it
 * and lets Undo revert it. No reducer ever sees the marker.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { effectiveLog, FORMAT_TYPE } from '../src/sports/amend.ts';
import { deriveLog } from '../src/data/eventLog.ts';
import { formatChangePreview, canChangeLiveFormat } from '../src/data/formatChange.ts';
import { init, reducer, type BadmintonState } from '../src/sports/badminton/engine.ts';
import type { MatchEventRecord } from '../src/core/types.ts';

const plugin = { createInitialState: init, reducer: reducer as never, isComplete: (s: BadmintonState) => s.ended };
let seq = 0;
const pt = (side: 'home' | 'away'): MatchEventRecord => ({ seq: ++seq, type: 'POINT', side, payload: {}, attribution: null });
const fmt = (patch: Record<string, unknown>): MatchEventRecord => ({ seq: ++seq, type: FORMAT_TYPE, side: null, payload: { patch, prev: {} }, attribution: null });
const rally = (h: number, a: number) => [...Array(h)].map(() => pt('home')).concat([...Array(a)].map(() => pt('away')));
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('LF3 / LF4: the marker row', () => {
  test('effectiveLog drops it, so no replay ever reduces it', () => {
    const log = [...rally(2, 1), fmt({ pointsPerGame: 11 }), ...rally(1, 0)];
    assert.deepEqual(effectiveLog(log).map((e) => e.type), ['POINT', 'POINT', 'POINT', 'POINT']);
  });
  test('a log with a marker replays to the same board as without it', () => {
    const base = rally(5, 3);
    const withMark = [...base, fmt({ pointsPerGame: 15 })];
    assert.deepEqual(deriveLog(plugin, { pointsPerGame: 15 }, withMark).state, deriveLog(plugin, { pointsPerGame: 15 }, base).state);
  });
  test('Undo of the marker: the last step names it and changes no score', () => {
    const d = deriveLog(plugin, undefined, [...rally(2, 0), fmt({ pointsPerGame: 15 })]);
    assert.equal(d.lastStep?.type, FORMAT_TYPE);
    assert.equal(d.lastStep?.prev, d.lastStep?.next);
  });
});

describe('LF2: the preview', () => {
  test('a change that keeps the match going: allowed, with the new board', () => {
    const p = formatChangePreview(plugin, { pointsPerGame: 11 }, [...rally(0, 4), ...rally(13, 0)]);
    assert.equal(p.ok, true);
    const s = p.state as BadmintonState;
    assert.deepEqual(s.games, [[11, 4]], 'game 1 now ends at 11-4');
    assert.deepEqual(s.current, { home: 2, away: 0 });
  });
  test('a change that would end the match or drop taps is refused', () => {
    // 2 games to 11: 11-0, 11-0 ends it; 5 more taps would be lost
    const p = formatChangePreview(plugin, { pointsPerGame: 11 }, rally(27, 0));
    assert.equal(p.ok, false);
    assert.equal(p.dropped, 5);
    const q = formatChangePreview(plugin, { pointsPerGame: 11 }, rally(22, 0));
    assert.equal(q.ok, false, 'over exactly at the last tap: end it instead');
    assert.equal(q.dropped, 0);
  });
});

describe('LF5: who and where', () => {
  test('friendlies only, not cricket, hosts only, while live', () => {
    const ok = { canManage: true, tournamentId: undefined, sport: 'badminton', live: true, complete: false };
    assert.equal(canChangeLiveFormat(ok), true);
    assert.equal(canChangeLiveFormat({ ...ok, tournamentId: 't1' }), false);
    assert.equal(canChangeLiveFormat({ ...ok, sport: 'cricket' }), false);
    assert.equal(canChangeLiveFormat({ ...ok, canManage: false }), false);
    assert.equal(canChangeLiveFormat({ ...ok, complete: true }), false);
  });
});

describe('wiring', () => {
  test('the hook never reduces the marker and tells the screen to reload the format', () => {
    const src = read('src/data/useLiveMatch.ts');
    assert.match(src, /action\.type === FORMAT_TYPE \? prevState : plugin\.reducer\(prevState, action\)/);
    assert.match(src, /e\.type === FORMAT_TYPE\) \{ onFormatRef\.current\?\.\(\)/);
  });
  test('the screen: preview, save, marker, undo restores', () => {
    const src = read('src/screens/LiveScoringScreen.tsx');
    assert.match(src, /formatChangePreview\(/);
    assert.match(src, /type: FORMAT_TYPE, payload: \{ patch: changed, prev \}/);
    assert.match(src, /lastStep\?\.type === FORMAT_TYPE/);
    assert.match(src, /canManage: canManage && scoringHere/);
  });
});
