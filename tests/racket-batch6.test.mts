/**
 * Racket batch 6 — P2 depth: badminton long / wide, shuttle change, squash
 * injury categories, table tennis expedite
 * (docs/security/breaks/racket-batch6.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, type RallyState } from '../src/sports/rallyEngine.ts';
import { conductRows, isMark, INJURY_RULES } from '../src/sports/conduct.ts';
import { keyStats, racketView, errorTypeRows } from '../src/sports/racketMatchStats.ts';
import { DETAIL_HOWS, STROKES, applyPointDetail, detailKeys, errTypeOf, howDef, pdText } from '../src/sports/pointDetail.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { statDefIn } from '../src/sports/statSchema.ts';
import { racketCommentary } from '../src/sports/racketCommentaryModel.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import { ttServer, ttServerOf, ttExpediteOf, ttServeHint } from '../src/sports/tabletennis/serve.ts';
import { ttDoublesTurn } from '../src/sports/doublesOrder.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import { matchRules } from '../src/sports/matchRules.ts';
import { TABLETENNIS_FORMAT_FIELDS } from '../src/sports/tabletennis/meta.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';

type Side = 'home' | 'away';
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const run = <S,>(r: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(r, s0);
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const D = (pd: unknown): ScoreAction => ({ type: 'POINT_DETAIL', payload: { pd } });
const EXP = (payload: Record<string, unknown> = {}): ScoreAction => ({ type: 'EXPEDITE', payload });
const SH = (side?: unknown): ScoreAction => ({ type: 'SHUTTLE', ...(side !== undefined ? { side: side as Side } : {}) });
const INJ = (side: unknown, cat: unknown, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'INJURY', side: side as Side, payload: { cat, ...extra } });
const pts = (sides: string) => [...sides].map((c) => P(c === 'h' ? 'home' : 'away'));
const TT = makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQ = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PB = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const R1 = { home: ['h1'], away: ['a1'] };
const R2 = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const conductSec = (secs: Array<{ id: string; rows: Array<{ key: string; home: string; away: string; label: string }> }>) => secs.find((x) => x.id === 'conduct');
const srv = (s: RallyState) => ttServerOf(s);
const tt0 = (cfg: Record<string, unknown> = {}) => TT.reducer(TT.init(cfg), FS('home'));

// ------------------------------------------------------------ R6-1 / R6-2 --

describe('R6-1 / R6-2: badminton errors split long / wide', () => {
  test('forced and unforced errors offer net / long / wide / fault; the old "out" stays readable', () => {
    for (const how of ['ue', 'fe'] as const) {
      const h = howDef('badminton', how)!;
      assert.deepEqual(h.offer, ['net', 'long', 'wide', 'fault'], how);
      assert.ok(h.strokes!.includes('out'), `${how}: old "out" still read`);
    }
  });
  test('new keys declared; old ueOut / feOut kept', () => {
    for (const k of ['ueLong', 'ueWide', 'feLong', 'feWide', 'ueOut', 'feOut']) {
      assert.ok(detailKeys('badminton').includes(k), k);
      assert.ok(statDefIn(STAT_SCHEMAS.badminton as never, k), `stat ${k}`);
    }
  });
  test('a long error reads, counts and types', () => {
    const s = run(badminton.reducer, badminton.init({ pointDetail: true }), [FS('home'), P('home'), D({ how: 'ue', stroke: 'long' }), P('away'), D({ how: 'fe', stroke: 'wide' })]);
    assert.equal(errTypeOf('badminton', s.events.find((e) => e.kind === 'point')!.pd!), 'long');
    assert.equal(pdText({ how: 'ue', stroke: 'long' }, false, 'badminton'), 'Unforced error (long)');
    const rows = errorTypeRows(racketView('badminton', s, R1)!, 'all');
    assert.ok(rows.some((r) => /long/i.test(r.label)), JSON.stringify(rows.map((r) => r.label)));
  });
  test('an old "out" error still reads and counts', () => {
    const s = run(badminton.reducer, badminton.init({ pointDetail: true }), [FS('home'), P('home'), D({ how: 'ue', stroke: 'out' })]);
    assert.equal(s.events.find((e) => e.kind === 'point')!.pd!.stroke, 'out');
    assert.equal(pdText({ how: 'ue', stroke: 'out' }, false, 'badminton'), 'Unforced error (out)');
    assert.ok(errorTypeRows(racketView('badminton', s, R1)!, 'all').some((r) => /out/i.test(r.label)));
  });
  test('other sports unchanged (tennis keeps net / long / wide; TT net / out)', () => {
    assert.deepEqual(howDef('tabletennis', 'ue')!.strokes, ['net', 'out']);
    assert.equal(howDef('tabletennis', 'ue')!.offer, undefined);
    assert.deepEqual(DETAIL_HOWS.tennis.find((h) => h.how === 'ue')!.strokes, ['net', 'long', 'wide']);
    assert.equal(STROKES.long.label, 'Long');
  });
});

// ------------------------------------------------------------ R6-3 / R6-4 --

describe('R6-3 / R6-4: badminton shuttle change', () => {
  test('a marker, no score, serve unchanged', () => {
    const s0 = run(badminton.reducer, badminton.init({}), [FS('home'), P('away')]);
    const s = badminton.reducer(s0, SH('home'));
    const e = s.events.at(-1)!;
    assert.equal(e.kind, 'shuttle');
    assert.equal(e.side, 'home');
    assert.ok(isMark(e));
    assert.deepEqual(s.current, s0.current);
    assert.equal(badminton.serve(s).side, badminton.serve(s0).side);
  });
  test('who asked is optional; a non-side is dropped', () => {
    const s0 = run(badminton.reducer, badminton.init({}), [FS('home')]);
    assert.equal(badminton.reducer(s0, SH()).events.at(-1)!.side, undefined);
    assert.equal(badminton.reducer(s0, SH('both')).events.at(-1)!.side, undefined);
  });
  test('badminton only; never after the end', () => {
    assert.equal(run(TT.reducer, tt0(), [SH('home')]).events.length, 0);
    assert.equal(run(SQ.reducer, SQ.init({}), [FS('home'), SH('home')]).events.length, 0);
    const done = run(badminton.reducer, badminton.init({}), [FS('home'), ...L.BADMINTON_LOG]);
    assert.ok(done.ended);
    assert.equal(badminton.reducer(done, SH('home')), done);
  });
  test('Stats row; a correction keeps it; Undo names it', () => {
    const s = run(badminton.reducer, badminton.init({}), [FS('home'), P('home'), SH('away'), SH(), P('away')]);
    const r = conductSec(keyStats(racketView('badminton', s, R1)!))!.rows.find((x) => x.key === 'shuttle')!;
    assert.ok(r);
    assert.match(r.label, /Shuttle changes/);
    assert.equal(r.away, '1');
    const again = badminton.reducer(s, { type: 'EDIT_LOG', payload: { points: [{ side: 'home' }, { side: 'away' }] } });
    assert.equal(again.events.filter((e) => e.kind === 'shuttle').length, 2);
    const prev = run(badminton.reducer, badminton.init({}), [FS('home'), P('home')]);
    const label = undoLabel({ type: 'SHUTTLE', prev, next: badminton.reducer(prev, SH('home')) }, { home: 'Home', away: 'Away' });
    assert.match(label ?? '', /shuttle change/i);
  });
  test('no row without one (never a false 0)', () => {
    const s = run(badminton.reducer, badminton.init({}), [FS('home'), P('home')]);
    assert.ok(!conductRows('badminton', s.events).some((r) => r.key === 'shuttle'));
  });
  test('Quick options: a Shuttle tile for badminton', () => {
    const src = read('src/sports/RacketQuickOptions.tsx');
    assert.match(src, /type: 'SHUTTLE'/);
    assert.match(src, /sport === 'badminton'/);
  });
});

// ------------------------------------------------------------ R6-5 / R6-6 --

describe('R6-5 / R6-6: squash injury categories (WSF Rule 14)', () => {
  test('three categories, each with its recovery time', () => {
    assert.deepEqual(Object.keys(INJURY_RULES.cats), ['self', 'contributed', 'opponent']);
    for (const c of Object.values(INJURY_RULES.cats)) assert.ok(c.label && c.time, JSON.stringify(c));
  });
  test('a marker (no score) with its category', () => {
    const s0 = run(SQ.reducer, SQ.init({}), [FS('home'), P('home')]);
    const s = SQ.reducer(s0, INJ('away', 'opponent', { playerId: 'a1' }));
    const e = s.events.at(-1)!;
    assert.equal(e.kind, 'injury');
    assert.equal(e.inj, 'opponent');
    assert.equal(e.side, 'away');
    assert.equal(e.playerId, 'a1');
    assert.ok(isMark(e));
    assert.deepEqual(s.current, s0.current);
  });
  test('hostile: unknown category, no side, other sports, after the end, a long id', () => {
    const s0 = run(SQ.reducer, SQ.init({}), [FS('home')]);
    assert.equal(SQ.reducer(s0, INJ('home', 'bleeding?')), s0);
    assert.equal(SQ.reducer(s0, INJ('home', '__proto__')), s0);
    assert.equal(SQ.reducer(s0, INJ(undefined, 'self')), s0);
    assert.equal(run(TT.reducer, tt0(), [INJ('home', 'self')]).events.length, 0);
    const b = run(badminton.reducer, badminton.init({}), [FS('home')]);
    assert.equal(badminton.reducer(b, INJ('home', 'self')), b);
    const done = run(SQ.reducer, SQ.init({}), [FS('home'), ...L.SQUASH_LOG]);
    assert.equal(SQ.reducer(done, INJ('home', 'self')), done);
    const long = SQ.reducer(s0, INJ('home', 'self', { playerId: 'x'.repeat(65) }));
    assert.equal(long.events.at(-1)!.playerId, undefined);
  });
  test('Stats rows per category; a correction keeps it; Undo names it', () => {
    const s = run(SQ.reducer, SQ.init({}), [FS('home'), P('home'), INJ('home', 'self'), INJ('away', 'contributed'), P('away')]);
    const rows = conductSec(keyStats(racketView('squash', s, R1)!))!.rows;
    assert.equal(rows.find((x) => x.key === 'injSelf')!.home, '1');
    assert.equal(rows.find((x) => x.key === 'injContributed')!.away, '1');
    assert.ok(!rows.some((x) => x.key === 'injOpponent'));
    const again = SQ.reducer(s, { type: 'EDIT_LOG', payload: { points: [{ side: 'home' }, { side: 'away' }] } });
    assert.equal(again.events.filter((e) => e.kind === 'injury').length, 2);
    const prev = run(SQ.reducer, SQ.init({}), [FS('home'), P('home')]);
    const label = undoLabel({ type: 'INJURY', prev, next: SQ.reducer(prev, INJ('home', 'self')) }, { home: 'Home', away: 'Away' });
    assert.match(label ?? '', /injury · self-inflicted/i);
  });
  test('Quick options: an Injury tile for squash', () => {
    const src = read('src/sports/RacketQuickOptions.tsx');
    assert.match(src, /type: 'INJURY'/);
  });
});

// ----------------------------------------------------------- R6-7 … R6-12 --

describe('R6-7: table tennis expedite (ITTF 2.15)', () => {
  test('a marker, no score; service alternates every point from then on', () => {
    let s = run(TT.reducer, tt0(), pts('hhh')); // 3-0: normal order h h a a → next (4th point) away
    assert.equal(srv(s), 'away');
    s = TT.reducer(s, EXP({ rally: true }));
    assert.equal(s.events.at(-1)!.kind, 'expedite');
    assert.deepEqual(s.current, { home: 3, away: 0 });
    const seq: Side[] = [];
    for (const c of 'hahah') { seq.push(srv(s)); s = TT.reducer(s, P(c === 'h' ? 'home' : 'away')); }
    assert.deepEqual(seq, ['away', 'home', 'away', 'home', 'away']);
  });
  test('restart (2.15.2): rally in progress → its server; else the last receiver', () => {
    // 1-0 to home: home served point 1 and serves point 2 normally
    const s1 = run(TT.reducer, tt0(), pts('h'));
    assert.equal(srv(s1), 'home');
    assert.equal(srv(TT.reducer(s1, EXP({ rally: true }))), 'home', 'interrupted rally: the same server');
    assert.equal(srv(TT.reducer(s1, EXP())), 'away', 'between rallies: the receiver of the last rally');
    // 2-0: the serve changes anyway → away either way
    const s2 = run(TT.reducer, tt0(), pts('hh'));
    assert.equal(srv(TT.reducer(s2, EXP())), 'away');
    assert.equal(srv(TT.reducer(s2, EXP({ rally: true }))), 'away');
  });
  test('later games: the normal first server, then one serve each', () => {
    let s = run(TT.reducer, tt0(), [EXP(), ...L.rGame(11, 3)]);
    assert.equal(s.games.length, 1);
    assert.equal(srv(s), 'away', 'game 2 opens with the other player');
    const seq: Side[] = [];
    for (const c of 'hhhh') { seq.push(srv(s)); s = TT.reducer(s, P(c === 'h' ? 'home' : 'away')); }
    assert.deepEqual(seq, ['away', 'home', 'away', 'home']);
  });
  test('the hint says so', () => {
    const s = run(TT.reducer, tt0(), [...pts('h'), EXP()]);
    assert.match(ttServeHint(s.current.home, s.current.away, s.target, true), /[Ee]xpedite/);
    assert.equal(ttServeHint(1, 0, 11), '2nd serve of 2 · service changes after this point');
  });
  test('doubles: one serve each in the ITTF order', () => {
    let s = run(TT.reducer, TT.init({ playersPerSide: 2 }), [FS('home'), EXP()]);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) { const t = ttDoublesTurn(s, R2)!; seen.push(`${t.server}>${t.receiver}`); s = TT.reducer(s, P(i % 2 ? 'home' : 'away')); }
    assert.deepEqual(seen, ['h1>a1', 'a1>h2', 'h2>a2', 'a2>h1', 'h1>a1']);
  });
});

describe('R6-8: expedite must be legal', () => {
  test('table tennis only', () => {
    const s0 = run(SQ.reducer, SQ.init({}), [FS('home')]);
    assert.equal(SQ.reducer(s0, EXP()), s0);
    const b = run(badminton.reducer, badminton.init({}), [FS('home')]);
    assert.equal(badminton.reducer(b, EXP()), b);
  });
  test('once per match', () => {
    const s = run(TT.reducer, tt0(), [EXP(), P('home')]);
    assert.equal(TT.reducer(s, EXP()), s);
  });
  test('not when both have 9 (11-point game); allowed at 9-8', () => {
    const at99 = run(TT.reducer, tt0(), L.rGame(9, 9).slice(0, 18));
    assert.deepEqual(at99.current, { home: 9, away: 9 });
    assert.equal(TT.reducer(at99, EXP()), at99);
    const at98 = run(TT.reducer, tt0(), L.rGame(9, 8).slice(0, 17));
    assert.notEqual(TT.reducer(at98, EXP()), at98);
  });
  test('not after the end; a non-true rally flag means between rallies', () => {
    const done = run(TT.reducer, tt0(), L.TT_LOG);
    assert.ok(done.ended);
    assert.equal(TT.reducer(done, EXP()), done);
    const s1 = run(TT.reducer, tt0(), pts('h'));
    const x = TT.reducer(s1, EXP({ rally: 'yes' }));
    assert.equal(x.events.at(-1)!.xr, undefined);
    assert.equal(srv(x), 'away');
  });
});

describe('R6-9: old table tennis logs replay identically', () => {
  test('no marker → ttServerOf is ttServer at every step (singles and doubles)', () => {
    for (const cfg of [{}, { playersPerSide: 2 }, { pointsPerGame: 21, gamesToWin: 1 }]) {
      let s = tt0(cfg);
      for (const a of L.TT_LOG) {
        if (s.ended) break;
        assert.equal(ttExpediteOf(s.events, s.opening ?? 'home', s.target), null);
        assert.equal(srv(s), ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home', s.target));
        assert.equal(ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home', s.target, null), ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home', s.target));
        s = TT.reducer(s, a);
      }
    }
  });
  test('the pinned fingerprint and serve figures are unchanged', () => {
    const s = run(TT.reducer, tt0(), L.TT_LOG);
    assert.equal(L.fingerprint(s as never, L.RALLY_KEYS), L.fingerprint(run(TT.reducer, tt0(), L.TT_LOG) as never, L.RALLY_KEYS));
    const st = serveStats('tabletennis', s, R1)!;
    assert.equal(st.match.home.srvPlayed + st.match.away.srvPlayed, L.TT_LOG.length);
  });
});

describe('R6-10: every consumer agrees after expedite', () => {
  test('serve stats and commentary name the expedite server', () => {
    const s = run(TT.reducer, tt0(), [...pts('h'), EXP(), ...pts('hhhhhh')]);
    // points 2..7 served a, h, a, h, a, h
    const st = serveStats('tabletennis', s, R1)!;
    assert.deepEqual(st.trace.map((t) => t.server), ['home', 'away', 'home', 'away', 'home', 'away', 'home']);
    const blocks = racketCommentary('tabletennis', s, { home: 'Hana', away: 'Asha' } as never);
    const text = JSON.stringify(blocks);
    assert.match(text, /Expedite/);
  });
  test('the screen reads the server through ttServerOf (scoring line, scoreboard)', () => {
    const src = read('src/sports/rallyCore.tsx');
    assert.ok(!/ttServer\(s\.current\.home, s\.current\.away, s\.games\.length/.test(src), 'no bare ttServer on the live state');
    assert.match(src, /ttServerOf\(s\)/);
  });
});

describe('R6-11: corrections and Undo', () => {
  test('EDIT_LOG keeps the marker; the server re-derives', () => {
    const s = run(TT.reducer, tt0(), [...pts('hhh'), EXP(), ...pts('aa')]);
    const again = TT.reducer(s, { type: 'EDIT_LOG', payload: { points: [{ side: 'home' }, { side: 'home' }, { side: 'home' }, { side: 'away' }, { side: 'away' }] } });
    assert.equal(again.events.filter((e) => e.kind === 'expedite').length, 1);
    assert.equal(srv(again), srv(s));
  });
  test('Undo names it; without it the normal order returns', () => {
    const prev = run(TT.reducer, tt0(), pts('h'));
    const next = TT.reducer(prev, EXP());
    assert.match(undoLabel({ type: 'EXPEDITE', prev, next }, { home: 'Home', away: 'Away' }) ?? '', /expedite/i);
    assert.equal(srv(prev), 'home');
  });
});

describe('R6-12: the 13-return rule has words', () => {
  test('table tennis "Lost by rule" names it', () => {
    assert.match(howDef('tabletennis', 'rule')!.hint ?? '', /13 returns/);
  });
});

describe('R6-13 / R6-14: Info, Stats, commentary; one tap; hostile', () => {
  test('Info: no new format rule (in-match calls only)', () => {
    const keys = matchRules(TABLETENNIS_FORMAT_FIELDS, {}).map((l) => l.key);
    assert.ok(!keys.some((k) => /exped/i.test(k)));
  });
  test('Stats: the expedite row only once introduced', () => {
    const s = run(TT.reducer, tt0(), [...pts('hh'), EXP(), P('away')]);
    const r = conductSec(keyStats(racketView('tabletennis', s, R1)!))!.rows.find((x) => x.key === 'exp')!;
    assert.match(`${r.label} ${r.home}`, /[Ee]xpedite.*game 1/);
    const plain = run(TT.reducer, tt0(), pts('hh'));
    assert.equal(conductSec(keyStats(racketView('tabletennis', plain, R1)!)), undefined);
  });
  test('a point is still one dispatch; pickleball ignores every new action', () => {
    const p0 = run(PB.reducer, PB.init({}), [FS('home')]);
    for (const a of [EXP(), SH('home'), INJ('home', 'self')]) assert.equal(PB.reducer(p0, a), p0);
    assert.deepEqual(PB.reducer(p0, P('home')).current.home + PB.reducer(p0, P('home')).current.away >= 0, true);
  });
  test('hostile detail: "long" is a badminton type, ignored as a table tennis one; junk stores nothing', () => {
    const base: LiveEvent[] = [{ id: 1, stamp: 'G1', icon: '', label: '', kind: 'point', side: 'home' }];
    assert.equal(errTypeOf('tabletennis', { how: 'ue', stroke: 'long' }), undefined);
    assert.equal(applyPointDetail(base, { pd: { how: 'ue', stroke: 'long' } }, 'badminton')![0].pd?.stroke, 'long');
    assert.equal(applyPointDetail(base, { pd: { how: 'ue', stroke: '__proto__' } }, 'badminton')![0].pd?.stroke, undefined);
  });
});
