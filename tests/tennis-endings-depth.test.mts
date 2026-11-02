/**
 * Tennis: error direction, fault type, lost by rule
 * (docs/security/breaks/tennis-endings-depth.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, type TennisState } from '../src/sports/tennis/engine.ts';
import { DETAIL_HOWS, STROKES, creditsOf, detailKeys, pdText, type PointDetail } from '../src/sports/pointDetail.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { keyStats, tennisCareerKeys, tennisView, TENNIS_EXTRA_KEYS } from '../src/sports/tennis/matchStats.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { statDefIn } from '../src/sports/statSchema.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
type Side = 'home' | 'away';
const run = (s: TennisState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const DF = (server: Side): ScoreAction => ({ type: 'POINT', side: server === 'home' ? 'away' : 'home', payload: { df: true } });
const FAULT = (side: Side, kind?: string): ScoreAction => ({ type: 'FAULT', side, ...(kind ? { payload: { kind } } : {}) });
const FT = (kind: string | null): ScoreAction => ({ type: 'FAULT_TYPE', payload: { kind } });
const PD = (pd: PointDetail): ScoreAction => ({ type: 'POINT_DETAIL', payload: { pd } });
const lastPoint = (s: TennisState) => [...s.events].reverse().find((e) => e.kind === 'point' || e.kind === 'ace')!;
const fresh = () => run(init({ pointDetail: true, serveDetail: true }), FS('home'));
const row = (s: TennisState, sec: string, key: string) => keyStats(tennisView(s)!).find((x) => x.id === sec)?.rows.find((r) => r.key === key);

describe('ED1: which way an error went', () => {
  test('tennis errors offer net / long / wide; winners don\'t', () => {
    const t = Object.fromEntries(DETAIL_HOWS.tennis.map((h) => [h.how, h]));
    assert.deepEqual(t.ue.strokes, ['net', 'long', 'wide']);
    assert.deepEqual(t.fe.strokes, ['net', 'long', 'wide']);
    assert.equal(t.winner.strokes, undefined);
    assert.equal(STROKES.long.label, 'Long');
    assert.equal(STROKES.wide.label, 'Wide');
  });
  test('credits and keys', () => {
    assert.deepEqual(creditsOf('tennis', { how: 'ue', wing: 'fh', shot: 'gs', stroke: 'net' }), [['loser', 'unforcedErrors'], ['loser', 'ueFh'], ['loser', 'ueGs'], ['loser', 'ueNet']]);
    assert.ok(creditsOf('tennis', { how: 'fe', stroke: 'wide' }).some(([, k]) => k === 'feWide'));
    for (const k of ['ueNet', 'ueLong', 'ueWide', 'feNet', 'feLong', 'feWide']) {
      assert.ok(detailKeys('tennis').includes(k), k);
      assert.ok(statDefIn(STAT_SCHEMAS.tennis as never, k), `stat ${k}`);
    }
  });
  test('the timeline reads it', () => {
    assert.equal(pdText({ how: 'ue', wing: 'bh', stroke: 'long' }, false, 'tennis'), 'Unforced error (backhand, long)');
    assert.equal(pdText({ how: 'fe', stroke: 'net' }, false, 'tennis'), 'Forced error (into the net)');
  });
  test('the Stats tab: unforced errors by direction, once recorded', () => {
    let s = run(fresh(), P('home'));
    assert.equal(row(s, 'shots', 'ueNet'), undefined, 'nothing recorded: no row');
    s = run(s, PD({ how: 'ue', wing: 'fh', stroke: 'net' }), P('home'), PD({ how: 'ue', stroke: 'long' }), P('away'), PD({ how: 'ue', stroke: 'net' }));
    assert.deepEqual([row(s, 'shots', 'ueNet')!.home, row(s, 'shots', 'ueNet')!.away], ['1', '1']);
    assert.equal(row(s, 'shots', 'ueLong')!.away, '1');
  });
});

describe('ED2: older details stay as they were', () => {
  test('a legacy stroke id is never a direction; a direction never a shot; a winner has none', () => {
    assert.deepEqual(creditsOf('tennis', { how: 'ue', stroke: 'fh' }).map(([, k]) => k).sort(), ['ueFh', 'ueGs', 'unforcedErrors']);
    assert.ok(!creditsOf('tennis', { how: 'winner', stroke: 'net' }).some(([, k]) => k === 'winnersNet'));
    assert.equal(pdText({ how: 'ue', stroke: 'fh' }, false, 'tennis'), 'Unforced error (forehand)');
  });
  test('a hostile direction is dropped', () => {
    const s = run(fresh(), P('home'), PD({ how: 'ue', stroke: '__proto__' } as never));
    assert.equal(lastPoint(s).pd!.stroke, undefined);
  });
  test('badminton keeps its own error types', () => {
    const b = DETAIL_HOWS.badminton.find((h) => h.how === 'ue')!;
    assert.deepEqual(b.strokes, ['net', 'out', 'fault']);
  });
});

describe('FT1 + FT2: the fault\'s type', () => {
  test('a typed 1st-serve fault rides on the next point', () => {
    let s = run(fresh(), FAULT('home', 'net'));
    assert.equal(s.faultKind, 'net');
    s = run(s, P('home'));
    assert.equal(lastPoint(s).sf1, 'net');
    assert.equal(s.faultKind, undefined);
  });
  test('typed after the Fault tap, changed, or cleared', () => {
    let s = run(fresh(), FAULT('home'), FT('long'));
    assert.equal(s.faultKind, 'long');
    s = run(s, FT('wide'));
    assert.equal(s.faultKind, 'wide');
    s = run(s, FT(null));
    assert.equal(s.faultKind, undefined);
    assert.equal(s.fault, true, 'still a fault');
  });
  test('a double fault: the 1st serve\'s type, and its own', () => {
    let s = run(fresh(), FAULT('home', 'net'), DF('home'));
    assert.equal(lastPoint(s).sf1, 'net');
    s = run(s, FT('foot'));
    assert.equal(lastPoint(s).sf2, 'foot');
  });
  test('nothing to type: no fault and no double fault just played', () => {
    const s = run(fresh(), P('home'));
    assert.equal(reducer(s, FT('net')), s);
    const s2 = run(fresh(), FAULT('home'));
    assert.equal(reducer(s2, FT('sideways')), s2, 'unknown type');
    assert.equal(reducer(s2, { type: 'FAULT', side: 'home', payload: { kind: 'x' } }), s2, 'a 2nd Fault is still ignored');
    const s3 = run(fresh(), FAULT('home', 'bogus'));
    assert.equal(s3.fault, true);
    assert.equal(s3.faultKind, undefined, 'an unknown type on the Fault is dropped');
  });
  test('both survive a timeline correction', () => {
    let s = run(fresh(), FAULT('home', 'wide'), P('away'), FAULT('home', 'net'), DF('home'), FT('long'), P('home'));
    const inputs = pointInputs(s.events);
    assert.equal(inputs[0].sf1, 'wide');
    assert.equal(inputs[1].sf1, 'net');
    assert.equal(inputs[1].sf2, 'long');
    s = reducer(s, { type: 'EDIT_LOG', payload: { points: inputs } });
    const pts = s.events.filter((e) => e.kind === 'point');
    assert.deepEqual(pts.map((e) => [e.sf1, e.sf2]), [['wide', undefined], ['net', 'long'], [undefined, undefined]]);
  });
  test('Undo names it', () => {
    const prev = run(fresh(), FAULT('home'));
    assert.equal(undoLabel({ type: 'FAULT_TYPE', prev, next: reducer(prev, FT('net')) }, { home: 'A', away: 'B' }), 'fault type');
  });
  test('the Stats tab and the career: the server\'s faults by type', () => {
    const s = run(fresh(), FAULT('home', 'net'), P('home'), FAULT('home', 'net'), DF('home'), FT('foot'), FAULT('home', 'long'), P('home'));
    assert.equal(row(s, 'service', 'fNet')!.home, '2');
    assert.equal(row(s, 'service', 'fLong')!.home, '1');
    assert.equal(row(s, 'service', 'fFoot')!.home, '1');
    assert.equal(row(s, 'service', 'fWide'), undefined, 'no wide faults: no row');
    const v = tennisView(s, { home: ['p1'], away: ['p2'] })!;
    const k = tennisCareerKeys(v, 'home', 'p1');
    assert.deepEqual([k.srvFaultNet, k.srvFaultLong, k.srvFaultWide, k.srvFootFaults], [2, 1, 0, 1]);
    for (const key of ['srvFaultNet', 'srvFaultLong', 'srvFaultWide', 'srvFootFaults']) {
      assert.ok(TENNIS_EXTRA_KEYS.includes(key), key);
      assert.ok(statDefIn(STAT_SCHEMAS.tennis as never, key), `stat ${key}`);
    }
    assert.equal(tennisCareerKeys(tennisView(run(fresh(), P('home')))!, 'home', 'p1').srvFaultNet, undefined, 'untyped match: not tracked');
  });
});

describe('LR1: lost by rule', () => {
  test('a tennis ending of its own, charged to the player who broke the rule', () => {
    const r = DETAIL_HOWS.tennis.find((h) => h.how === 'rule')!;
    assert.equal(r.credit, 'loser');
    assert.equal(r.label, 'Lost by rule');
    assert.deepEqual(creditsOf('tennis', { how: 'rule' }), [['loser', 'ruleLosses']]);
    assert.ok(detailKeys('tennis').includes('ruleLosses'));
    assert.ok(statDefIn(STAT_SCHEMAS.tennis as never, 'ruleLosses'));
    assert.equal(pdText({ how: 'rule' }, false, 'tennis'), 'Lost by rule');
    assert.equal(DETAIL_HOWS.badminton.some((h) => h.how === 'rule'), false);
  });
  test('the Stats tab counts it apart from errors', () => {
    const s = run(fresh(), P('home'), PD({ how: 'rule' }));
    assert.equal(row(s, 'shots', 'rule')!.away, '1');
    assert.equal(row(s, 'shots', 'ue')!.away, '0');
  });
});

describe('the screen', () => {
  test('error direction chips', () => assert.match(read('src/sports/tennis/PointCapture.tsx'), /sel\?\.strokes/));
  test('fault type chips after a Fault and after a double fault', () => {
    const src = read('src/sports/tennis/index.tsx');
    assert.match(src, /type: 'FAULT_TYPE'/);
    assert.match(src, /FAULT_KINDS/);
  });
});
