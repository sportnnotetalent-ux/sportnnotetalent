/**
 * Tennis: the 1st-serve fault, and point detail by default
 * (docs/security/breaks/tennis-serve-and-endings.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, serveInfo, type TennisState } from '../src/sports/tennis/engine.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { trackFormatFields, detailLiveSettings } from '../src/sports/pointDetailSettings.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import type { ScoreAction } from '../src/sports/types.ts';

/** what a new match's format gets (FormatEditor.defaultsFor, one-off match) */
const defaultsFor = (fields: { key: string; default: unknown }[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
type Side = 'home' | 'away';
const run = (s: TennisState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const ACE = (side: Side): ScoreAction => ({ type: 'ACE', side });
const DF = (server: Side): ScoreAction => ({ type: 'POINT', side: server === 'home' ? 'away' : 'home', payload: { df: true } });
const FAULT = (side: Side): ScoreAction => ({ type: 'FAULT', side });
const lastPoint = (s: TennisState) => [...s.events].reverse().find((e) => e.kind === 'point' || e.kind === 'ace')!;
const fresh = () => run(init(defaultsFor(TENNIS_META.formatFields ?? [])), FS('home'));

describe('TF2 + TF3: point detail and 1st / 2nd serve are on for new tennis matches', () => {
  test('the format defaults', () => {
    const d = Object.fromEntries(trackFormatFields('tennis').map((f) => [f.key, f.default]));
    assert.equal(d.pointDetail, true);
    assert.equal(d.serveDetail, true);
    assert.equal(d.netDetail, false);
    assert.equal(d.rallyDetail, false);
    assert.equal(d.speedDetail, false);
    assert.equal(detailLiveSettings('tennis').defaults.pointDetail, true);
  });
  test('a new match starts with both on', () => {
    const s = init(defaultsFor(TENNIS_META.formatFields ?? []));
    assert.equal(s.pointDetail, true);
    assert.equal(s.serveDetail, true);
  });
  test('the other racket sports: point detail on (Batch 3, defaults-racket.md), the rest off', () => {
    for (const sp of ['badminton', 'tabletennis', 'squash', 'padel', 'pickleball'] as const) {
      for (const f of trackFormatFields(sp)) if (f.type === 'toggle') assert.equal(f.default, f.key === 'pointDetail', `${sp} ${f.key}`);
    }
  });
});

describe('TF6: old matches are unchanged', () => {
  test('a format without the keys: both off, as before', () => {
    const s = init({ setsToWin: 2 });
    assert.equal(s.pointDetail, undefined);
    assert.equal(s.serveDetail, undefined);
    const after = run(s, FS('home'), P('home'));
    assert.equal(lastPoint(after).serve, undefined);
  });
});

describe('TF1: the Fault button', () => {
  test('a 1st-serve fault: no point, the next point is a 2nd-serve point', () => {
    let s = fresh();
    s = run(s, FAULT('home'));
    assert.equal(s.fault, true);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
    s = run(s, P('away'));
    assert.equal(lastPoint(s).serve, 2);
    assert.equal(s.fault, undefined, 'cleared by the point');
    s = run(s, P('home'));
    assert.equal(lastPoint(s).serve, 1);
  });
  test('an ace after a fault is a 2nd-serve ace; so is a double fault', () => {
    let s = run(fresh(), FAULT('home'), ACE('home'));
    assert.equal(lastPoint(s).serve, 2);
    s = run(s, FAULT('home'), DF('home'));
    assert.equal(lastPoint(s).serve, 2);
    assert.equal(lastPoint(s).df !== undefined, true);
    assert.equal(s.fault, undefined);
  });
  test('a fault on a match with serve tracking off switches it on from there', () => {
    let s = run(init({}), FS('home'), P('home'));
    assert.equal(lastPoint(s).serve, undefined);
    s = run(s, FAULT('home'), P('home'));
    assert.equal(s.serveDetail, true);
    assert.equal(lastPoint(s).serve, 2);
    s = run(s, P('home'));
    assert.equal(lastPoint(s).serve, 1);
  });
});

describe('TF5: the fault is exact', () => {
  test('only the server can fault; not before the toss; not after the match', () => {
    const s = fresh();
    assert.equal(reducer(s, FAULT('away')), s, 'the receiver');
    assert.equal(reducer(s, { type: 'FAULT' }), s, 'no side');
    const pre = init(defaultsFor(TENNIS_META.formatFields ?? []));
    assert.equal(reducer(pre, FAULT('home')), pre, 'before the toss');
    let done = run(init({ setsToWin: 1, gamesPerSet: 1, setWinByTwo: false }), FS('home'));
    done = run(done, P('home'), P('home'), P('home'), P('home'));
    assert.equal(done.ended, true);
    assert.equal(reducer(done, FAULT('home')), done);
  });
  test('a second Fault on the same point is ignored (the Double fault button is the 2nd-serve fault)', () => {
    const s = run(fresh(), FAULT('home'));
    assert.equal(reducer(s, FAULT('home')), s);
  });
  test('the fault follows the server across games, and every point clears it', () => {
    let s = run(fresh(), P('home'), P('home'), P('home'), FAULT('home'), P('home'));
    assert.equal(s.games.home, 1);
    assert.equal(s.fault, undefined);
    assert.equal(serveInfo(s).side, 'away');
    assert.equal(reducer(s, FAULT('home')), s, 'home no longer serves');
    s = run(s, FAULT('away'));
    assert.equal(s.fault, true);
  });
  test('a penalty point clears it', () => {
    const s = run(fresh(), FAULT('home'), { type: 'CONDUCT', side: 'home', payload: { level: 'point' } });
    assert.equal(s.pts.away, 1);
    assert.equal(s.fault, undefined);
  });
  test('a timeline correction keeps a pending fault', () => {
    let s = run(fresh(), P('home'), FAULT('home'));
    s = reducer(s, { type: 'EDIT_LOG', payload: { points: [{ side: 'away', kind: 'point' }] } });
    assert.deepEqual(s.pts, { home: 0, away: 1 });
    assert.equal(s.fault, true);
  });
  test('Undo names it', () => {
    const prev = fresh();
    const next = reducer(prev, FAULT('home'));
    assert.equal(undoLabel({ type: 'FAULT', prev, next }, { home: 'Hrudhay', away: 'Likhi' }), '1st-serve fault');
  });
  test('a log replays to the same match', () => {
    const log: ScoreAction[] = [FS('away'), FAULT('away'), P('away'), FAULT('away'), DF('away'), ACE('away'), FAULT('away')];
    assert.deepEqual(run(init(defaultsFor(TENNIS_META.formatFields ?? [])), ...log), run(init(defaultsFor(TENNIS_META.formatFields ?? [])), ...log));
  });
});

describe('TF4: a time-violation fault costs the serve', () => {
  const tv = (side: Side): ScoreAction => ({ type: 'CONDUCT', side, payload: { level: 'fault', track: 'time' } });
  test('on the 1st serve: a fault (2nd serve next)', () => {
    const s = run(fresh(), tv('home'));
    assert.equal(s.fault, true);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
    assert.ok(s.events.some((e) => e.kind === 'conduct'), 'still on the timeline');
  });
  test('on the 2nd serve: a double fault, the point to the receiver', () => {
    const s = run(fresh(), FAULT('home'), tv('home'));
    assert.deepEqual(s.pts, { home: 0, away: 1 });
    assert.equal(s.fault, undefined);
    assert.ok(lastPoint(s).df);
    assert.equal(lastPoint(s).serve, 2);
  });
  test('the receiver can\'t be given a loss of serve', () => {
    const s = run(fresh(), tv('away'));
    assert.equal(s.fault, undefined);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
  });
});

describe('TF1: the screen', () => {
  const src = read('src/sports/tennis/index.tsx');
  test('a Fault button for the server, hidden on a 2nd serve', () => {
    assert.match(src, /dispatch\(\{ type: 'FAULT', side: serve\.side \}\)/);
    assert.match(src, /!s\.fault &&/);
  });
  test('the serve banner says 2nd serve', () => assert.match(src, /2nd serve/));
});
