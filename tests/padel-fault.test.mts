/**
 * Padel: the 1st-serve Fault, fault types (incl. the wire mesh), serve
 * tracking on for new matches (docs/security/breaks/padel-fault.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './racketLogs.mts';
import { init, reducer, serveInfo, type PadelState } from '../src/sports/padel/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import { FAULT_KINDS, FAULT_KIND_LABEL, PADEL_FAULT_KINDS, isFaultKind } from '../src/sports/pointDetail.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { keyStats, racketExtraKeys, racketView } from '../src/sports/racketMatchStats.ts';
import { padelTotals } from '../src/sports/racketTotals.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { statDefIn } from '../src/sports/statSchema.ts';
import { trackFormatFields, detailLiveSettings } from '../src/sports/pointDetailSettings.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import { faultTyping } from '../src/sports/serveFault.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const defaultsFor = (fields: { key: string; default: unknown }[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const run = (s: PadelState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const ACE = (side: Side): ScoreAction => ({ type: 'POINT', side, payload: { pd: { how: 'ace' } } });
const DF = (server: Side): ScoreAction => ({ type: 'POINT', side: opp(server), payload: { df: true } });
const FAULT = (side: Side, kind?: string): ScoreAction => ({ type: 'FAULT', side, ...(kind ? { payload: { kind } } : {}) });
const FT = (kind: string | null): ScoreAction => ({ type: 'FAULT_TYPE', payload: { kind } });
const lastPoint = (s: PadelState) => [...s.events].reverse().find((e) => e.kind === 'point')!;
const NEW = () => init(defaultsFor(PADEL_META.formatFields ?? []));
const fresh = () => run(NEW(), FS('home'));
const SINGLES = L.ctxOf({ home: ['h1'], away: ['a1'] });
const R1 = { home: ['h1'], away: ['a1'] };
const row = (s: PadelState, key: string) => keyStats(racketView('padel', s, R1)!).find((x) => x.id === 'serve')?.rows.find((r) => r.key === key);

describe('PF7: 1st / 2nd serve is on for new padel matches', () => {
  test('the format default and the live settings', () => {
    const d = Object.fromEntries(trackFormatFields('padel').map((f) => [f.key, f.default]));
    assert.equal(d.serveDetail, true);
    assert.equal(d.pointDetail, true);
    // describe-done.md DD1: the rest are on too now
    assert.equal(d.netDetail, true);
    assert.equal(d.rallyDetail, true);
    assert.equal(detailLiveSettings('padel').defaults!.serveDetail, true);
  });
  test('a new match starts with it on; its first point is a 1st-serve point', () => {
    assert.equal(NEW().serveDetail, true);
    assert.equal(lastPoint(run(fresh(), P('home'))).serve, 1);
  });
  test('the other racket sports keep it as they were', () => {
    for (const sp of ['badminton', 'tabletennis', 'squash', 'pickleball'] as const) {
      assert.equal(trackFormatFields(sp).some((f) => f.key === 'serveDetail'), false, sp);
    }
  });
});

describe('PF8: old padel matches replay identically', () => {
  test('a format without the key: off, as before', () => {
    const s = run(init({ playersPerSide: 2 }), FS('home'), P('home'));
    assert.equal(s.serveDetail, undefined);
    assert.equal(lastPoint(s).serve, undefined);
  });
  test('a real log replays to the same state, twice, and through a correction', () => {
    const a = run(init({ playersPerSide: 2 }), ...L.PADEL_TWO_SETS);
    const b = run(init({ playersPerSide: 2 }), ...L.PADEL_TWO_SETS);
    assert.deepEqual(a, b);
    assert.equal(a.fault, undefined);
    assert.ok(a.events.every((e) => e.sf1 === undefined && e.sf2 === undefined));
    const again = reducer(a, { type: 'EDIT_LOG', payload: { points: pointInputs(a.events) } });
    assert.deepEqual([again.sets, again.games, again.pts, again.serveDetail], [a.sets, a.games, a.pts, a.serveDetail]);
  });
});

describe('PF1: the Fault button', () => {
  test('a 1st-serve fault: no point, the next point is a 2nd-serve point', () => {
    let s = run(fresh(), FAULT('home'));
    assert.equal(s.fault, true);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
    assert.equal(s.events.length, fresh().events.length, 'nothing on the timeline');
    s = run(s, P('away'));
    assert.equal(lastPoint(s).serve, 2);
    assert.equal(s.fault, undefined, 'cleared by the point');
    s = run(s, P('home'));
    assert.equal(lastPoint(s).serve, 1);
  });
  test('an ace after a fault is a 2nd-serve ace; so is a double fault', () => {
    let s = run(fresh(), FAULT('home'), ACE('home'));
    assert.equal(lastPoint(s).serve, 2);
    assert.equal(lastPoint(s).pd?.how, 'ace');
    s = run(s, FAULT('home'), DF('home'));
    assert.equal(lastPoint(s).serve, 2);
    assert.ok(lastPoint(s).df);
    assert.equal(s.fault, undefined);
  });
});

describe('PF4: a fault switches serve tracking on', () => {
  test('from that point on (earlier points stay untracked)', () => {
    let s = run(init({}), FS('home'), P('home'));
    assert.equal(lastPoint(s).serve, undefined);
    s = run(s, FAULT('home'), P('home'));
    assert.equal(s.serveDetail, true);
    assert.equal(lastPoint(s).serve, 2);
    s = run(s, P('home'));
    assert.equal(lastPoint(s).serve, 1);
    assert.equal(s.events.find((e) => e.kind === 'point')!.serve, undefined);
  });
});

describe('PF3: the fault is exact', () => {
  test('only the server; not before the toss; not after the match', () => {
    const s = fresh();
    assert.equal(reducer(s, FAULT('away')), s, 'the receiver');
    assert.equal(reducer(s, { type: 'FAULT' }), s, 'no side');
    const pre = NEW();
    assert.equal(reducer(pre, FAULT('home')), pre, 'before the toss');
    let done = run(init({ setsToWin: 1, gamesPerSet: 1 }), FS('home'));
    // a one-game "set" still needs a 2-game lead: play to 2-0
    for (let i = 0; i < 8 && !done.ended; i++) done = run(done, P('home'));
    assert.equal(done.ended, true);
    assert.equal(reducer(done, FAULT('home')), done);
  });
  test('a second Fault on the same point is ignored (the Double fault button is the 2nd-serve fault)', () => {
    const s = run(fresh(), FAULT('home'));
    assert.equal(reducer(s, FAULT('home')), s);
    assert.equal(reducer(s, FAULT('home', 'mesh')), s);
  });
  test('the fault follows the server across games, and every point clears it', () => {
    let s = run(fresh(), P('home'), P('home'), P('home'), FAULT('home'), P('home'));
    assert.equal(s.games.home, 1);
    assert.equal(s.fault, undefined);
    assert.equal(serveInfo(s).side, 'away');
    assert.equal(reducer(s, FAULT('home')), s, 'home no longer serves');
    assert.equal(run(s, FAULT('away')).fault, true);
  });
  test('doubles: the serving side faults, the serve rotates', () => {
    let s = run(init({ playersPerSide: 2, serveDetail: true }), FS('away'));
    assert.equal(reducer(s, FAULT('home')), s);
    s = run(s, FAULT('away'), P('home'));
    assert.equal(lastPoint(s).serve, 2);
  });
  test('a penalty point clears it; a warning does not', () => {
    const w = run(fresh(), FAULT('home'), { type: 'CONDUCT', side: 'home', payload: { level: 'warning' } });
    assert.equal(w.fault, true);
    const s = run(fresh(), FAULT('home'), { type: 'CONDUCT', side: 'home', payload: { level: 'point' } });
    assert.equal(s.pts.away, 1);
    assert.equal(s.fault, undefined);
  });
  test('a padel time violation is not a loss of serve (tennis only)', () => {
    const s = run(fresh(), { type: 'CONDUCT', side: 'home', payload: { level: 'fault', track: 'time' } });
    assert.equal(s.fault, undefined);
    assert.deepEqual(s.pts, { home: 0, away: 0 });
  });
  test('a timeline correction keeps a pending fault (and its type)', () => {
    let s = run(fresh(), P('home'), FAULT('home', 'mesh'));
    s = reducer(s, { type: 'EDIT_LOG', payload: { points: [{ side: 'away', kind: 'point' }] } });
    assert.deepEqual(s.pts, { home: 0, away: 1 });
    assert.equal(s.fault, true);
    assert.equal(s.faultKind, 'mesh');
    assert.equal(s.serveDetail, true);
  });
  test('Undo names it', () => {
    const prev = fresh();
    assert.equal(undoLabel({ type: 'FAULT', prev, next: reducer(prev, FAULT('home')) }, { home: 'A', away: 'B' }), '1st-serve fault');
    const f = reducer(prev, FAULT('home'));
    assert.equal(undoLabel({ type: 'FAULT_TYPE', prev: f, next: reducer(f, FT('mesh')) }, { home: 'A', away: 'B' }), 'fault type');
  });
});

describe('PF2 + PF5: fault types, the mesh in padel only', () => {
  test('the shared list: tennis unchanged, padel adds the mesh', () => {
    assert.deepEqual([...FAULT_KINDS], ['net', 'long', 'wide', 'foot']);
    assert.deepEqual([...PADEL_FAULT_KINDS], ['net', 'long', 'wide', 'foot', 'mesh']);
    assert.equal(FAULT_KIND_LABEL.mesh, 'Mesh');
    assert.equal(isFaultKind('mesh'), false, 'not a tennis type');
    assert.equal(isFaultKind('mesh', 'padel'), true);
    assert.equal(isFaultKind('__proto__', 'padel'), false);
  });
  test('typed on the Fault, retyped / cleared with FAULT_TYPE, stamped on the next point as sf1', () => {
    let s = run(fresh(), FAULT('home', 'mesh'));
    assert.equal(s.faultKind, 'mesh');
    s = run(s, FT('long'));
    assert.equal(s.faultKind, 'long');
    s = run(s, FT(null));
    assert.equal(s.faultKind, undefined);
    s = run(s, FT('mesh'), P('away'));
    assert.equal(lastPoint(s).sf1, 'mesh');
    assert.equal(lastPoint(s).serve, 2);
    assert.equal(s.faultKind, undefined);
  });
  test("the double fault's 2nd serve type (sf2), only on a double fault", () => {
    let s = run(fresh(), FAULT('home', 'net'), DF('home'), FT('mesh'));
    assert.equal(lastPoint(s).sf1, 'net');
    assert.equal(lastPoint(s).sf2, 'mesh');
    s = run(s, FT(null));
    assert.equal(lastPoint(s).sf2, undefined);
    const plain = run(fresh(), P('home'));
    assert.equal(reducer(plain, FT('net')), plain, 'not a double fault: nothing to type');
  });
  test('an unknown or hostile type stores nothing', () => {
    const s = run(fresh(), FAULT('home'));
    for (const k of ['side', '__proto__', 'constructor', 7, {}]) assert.equal(reducer(s, FT(k as never)), s, String(k));
    assert.equal(run(fresh(), FAULT('home', '__proto__')).faultKind, undefined);
  });
  test('tennis refuses the mesh everywhere', () => {
    const t = [FS('home'), FAULT('home', 'mesh')].reduce(tennis.reducer, tennis.init({ serveDetail: true }));
    assert.equal(t.fault, true);
    assert.equal(t.faultKind, undefined);
    assert.equal(tennis.reducer(t, FT('mesh')), t);
    const r = tennis.reducer(t, { type: 'EDIT_LOG', payload: { points: [{ side: 'home', kind: 'point', serve: 2, sf1: 'mesh' }] } });
    assert.equal(r.events.find((e) => e.kind === 'point')!.sf1, undefined);
  });
  test('a correction keeps the types on their points', () => {
    const s = run(fresh(), FAULT('home', 'mesh'), P('home'), FAULT('home', 'foot'), DF('home'), FT('wide'));
    const again = reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    const sig = (x: PadelState) => JSON.stringify(x.events.filter((e) => e.kind === 'point').map((e) => [e.side, e.df ? 1 : 0, e.serve, e.sf1, e.sf2]));
    assert.equal(sig(again), sig(s));
    assert.deepEqual(again.pts, s.pts);
  });
});

describe('PF6: Stats tab and careers', () => {
  const typed = () => run(fresh(), FAULT('home', 'mesh'), P('home'), FAULT('home', 'net'), DF('home'), FT('mesh'), FAULT('home', 'foot'), P('away'), FAULT('home'), P('home'));
  test('rows by type, only once recorded', () => {
    const none = run(fresh(), FAULT('home'), P('home'));
    assert.equal(row(none, 'fMesh'), undefined);
    const s = typed();
    assert.deepEqual([row(s, 'fMesh')!.home, row(s, 'fMesh')!.away], ['2', '0']);
    assert.equal(row(s, 'fNet')!.home, '1');
    assert.equal(row(s, 'fFoot')!.home, '1');
    assert.equal(row(s, 'fLong'), undefined);
    assert.ok(row(s, 's1in'), '1st serve % from real taps');
  });
  test("the serving player's career keys (keyed), declared in the schema", () => {
    const t = padelTotals(typed(), SINGLES);
    assert.deepEqual([t.h1.stats.srvFaultMesh, t.h1.stats.srvFaultNet, t.h1.stats.srvFootFaults, t.h1.stats.srvFaultLong], [2, 1, 1, 0]);
    assert.equal(t.a1.stats.srvFaultMesh, 0);
    const plain = padelTotals(run(fresh(), FAULT('home'), P('home')), SINGLES);
    for (const k of ['srvFaultNet', 'srvFaultLong', 'srvFaultWide', 'srvFootFaults', 'srvFaultMesh']) {
      assert.equal(k in plain.h1.stats, false, `untyped match: ${k} not tracked`);
      assert.ok(racketExtraKeys('padel').includes(k), k);
      assert.ok(statDefIn(STAT_SCHEMAS.padel as never, k), `stat ${k}`);
    }
    assert.equal(racketExtraKeys('badminton').includes('srvFaultMesh'), false);
  });
});

describe('PF9: the screen', () => {
  const src = read('src/sports/padel/index.tsx');
  test('a Fault button for the server, hidden on a 2nd serve; fault again = double fault', () => {
    assert.match(src, /dispatch\(\{ type: 'FAULT', side: serve\.side \}\)/);
    assert.match(src, /!s\.fault &&/);
    assert.match(src, /Fault again = double fault/);
  });
  test('the 2nd-serve banner and the type chips (with the mesh)', () => {
    assert.match(src, /2nd serve/);
    assert.match(src, /faultTyping\(s\)/);
    assert.equal(faultTyping(fresh()), null);
    assert.deepEqual(faultTyping(run(fresh(), FAULT('home', 'mesh'))), { label: '1st serve was:', cur: 'mesh' });
    assert.deepEqual(faultTyping(run(fresh(), FAULT('home'), DF('home'), FT('mesh'))), { label: 'Double fault was:', cur: 'mesh' });
    assert.match(src, /PADEL_FAULT_KINDS/);
    assert.match(src, /type: 'FAULT_TYPE'/);
    assert.doesNotMatch(read('src/sports/tennis/index.tsx'), /PADEL_FAULT_KINDS/);
  });
});
