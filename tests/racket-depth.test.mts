/**
 * Racket sports (badminton, table tennis, squash, padel, pickleball):
 * forced-error types, lost by rule, doubles winner credit (new matches only)
 * — docs/security/breaks/racket-depth.md.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { badmintonTotals, padelTotals, rallyTotals } from '../src/sports/racketTotals.ts';
import {
  DEPTH_SPORTS, DETAIL_HOWS, applyPointDetail, creditsOf, detailKeys, detailPlayerCredits, detailRows, errTypeOf, howDef, pdText,
} from '../src/sports/pointDetail.ts';
import { errorTypeRows, keyStats, racketView } from '../src/sports/racketMatchStats.ts';
import { racketSentence } from '../src/sports/racketCommentaryModel.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { statDefIn } from '../src/sports/statSchema.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';

type Side = 'home' | 'away';
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const P = (side: Side, id?: string): ScoreAction => ({ type: 'POINT', side, ...(id ? { attribution: { playerId: id, stat: 'points' } } : {}) });
const D = (pd: unknown): ScoreAction => ({ type: 'POINT_DETAIL', payload: { pd } });
const FS = (side: Side, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side, ...extra } });
const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(reducer, s0);
const PB = makeRallyEngine({ id: 'pickleball', icon: '', sideOutValue: 'sideout', sideOutLabel: 'x', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const TT = makeRallyEngine({ id: 'tabletennis', icon: '', sideOutValue: '__none__', sideOutLabel: 'x', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SINGLES = L.ctxOf({ home: ['h1'], away: ['a1'] });
const DOUBLES = L.ctxOf({ home: ['h1', 'h2'], away: ['a1', 'a2'] });
const UE_TYPES: Record<string, string[]> = {
  badminton: ['net', 'out', 'fault'], tabletennis: ['net', 'out'], squash: ['tin', 'out'], padel: ['net', 'out'], pickleball: ['net', 'out', 'kitchen', 'foot'],
};
const lastPd = (s: { events: LiveEvent[] }) => [...s.events].reverse().find((e) => e.kind === 'point' || e.kind === 'rally')?.pd;
const nameOf = (id?: string, legacy?: string) => (id === 'h1' ? 'Hana' : id === 'h2' ? 'Hiro' : id === 'a1' ? 'Asha' : legacy || 'Player');

describe('RD1: forced errors take the sport\'s error types', () => {
  test('every sport: Forced error offers exactly its Unforced error types', () => {
    for (const sp of DEPTH_SPORTS) {
      assert.deepEqual(howDef(sp, 'ue')!.strokes, UE_TYPES[sp], `${sp} ue`);
      assert.deepEqual(howDef(sp, 'fe')!.strokes, UE_TYPES[sp], `${sp} fe`);
    }
  });
  test('credits, keys and career stats', () => {
    assert.deepEqual(creditsOf('badminton', { how: 'fe', wing: 'fh', shot: 'smash', stroke: 'net' }),
      [['loser', 'forcedErrors'], ['loser', 'feFh'], ['loser', 'feSmash'], ['loser', 'feNet']]);
    for (const sp of DEPTH_SPORTS) {
      for (const t of UE_TYPES[sp]) {
        const k = `fe${t.charAt(0).toUpperCase()}${t.slice(1)}`;
        assert.ok(detailKeys(sp).includes(k), `${sp} ${k}`);
        assert.ok(statDefIn(STAT_SCHEMAS[sp] as never, k), `${sp} stat ${k}`);
      }
    }
    assert.equal(errTypeOf('squash', { how: 'fe', stroke: 'tin' }), 'tin');
    assert.equal(errTypeOf('badminton', { how: 'fe', stroke: 'tin' }), undefined, 'not a badminton type');
  });
  test('timeline, commentary, Stats tab', () => {
    assert.equal(pdText({ how: 'fe', wing: 'bh', shot: 'push', stroke: 'out' }, false, 'tabletennis'), 'Forced error (backhand push, out)');
    assert.equal(pdText({ how: 'fe', stroke: 'tin' }, false, 'squash'), 'Forced error (tin)');
    const who = { winner: 'Hana', loser: 'Asha', server: 'Hana' };
    assert.equal(racketSentence('squash', { side: 'home', kind: 'point', pd: { how: 'fe', stroke: 'tin' } } as never, who), 'Asha loses the point with a Forced Error (tin)');
    const s = run(badminton.reducer, badminton.init({ pointDetail: true }), [FS('home'), P('home'), D({ how: 'fe', stroke: 'net' }), P('away'), D({ how: 'fe', stroke: 'out' })]);
    const v = racketView('badminton', s, { home: ['h1'], away: ['a1'] })!;
    const rows = errorTypeRows(v);
    assert.deepEqual(rows.find((r) => r.key === 'fe-net') && [rows.find((r) => r.key === 'fe-net')!.label, rows.find((r) => r.key === 'fe-net')!.away], ['Forced errors · into the net', '1']);
    assert.equal(rows.find((r) => r.key === 'fe-out')!.home, '1');
  });
  test('RD10: the detail panel labels a typed forced error as forced', () => {
    const s = run(badminton.reducer, badminton.init({ pointDetail: true }), [FS('home'), P('home'), D({ how: 'fe', stroke: 'net' })]);
    assert.equal(detailRows('badminton', s.events).find((r) => r.key === 'feNet')?.label, 'FE · into the net');
  });
});

describe('RD2 / RD3: lost by rule', () => {
  test('every sport offers it, charged to the player who broke the rule, with its own rule examples', () => {
    const words: Record<string, string[]> = {
      badminton: ['net touch', 'double hit', 'obstruction', 'receiver fault'],
      tabletennis: ['obstruction', 'free hand', 'moved the table', 'double hit'],
      squash: ['double hit', 'carry'],
      padel: ['net touch', 'before it crossed', 'double hit'],
      pickleball: ['two-bounce', 'momentum', 'net touch'],
    };
    for (const sp of DEPTH_SPORTS) {
      const d = howDef(sp, 'rule');
      assert.ok(d, sp);
      assert.equal(d!.credit, 'loser');
      assert.equal(d!.label, 'Lost by rule');
      for (const w of words[sp]) assert.ok(d!.hint?.toLowerCase().includes(w), `${sp}: ${w}`);
      assert.deepEqual(creditsOf(sp, { how: 'rule' }), [['loser', 'ruleLosses']]);
      assert.ok(detailKeys(sp).includes('ruleLosses'), sp);
      assert.ok(statDefIn(STAT_SCHEMAS[sp] as never, 'ruleLosses'), sp);
    }
    assert.equal(howDef('tennis', 'rule')!.hint, undefined, 'tennis unchanged');
  });
  test('counted apart from errors: Stats tab row, careers, commentary', () => {
    const s = run(badminton.reducer, badminton.init({ pointDetail: true }), [FS('home'), P('home'), D({ how: 'rule' }), P('home'), D({ how: 'ue', stroke: 'net' })]);
    const v = racketView('badminton', s, { home: ['h1'], away: ['a1'] })!;
    const shots = keyStats(v).find((x) => x.id === 'shots')!.rows;
    assert.deepEqual([shots.find((r) => r.key === 'rule')?.label, shots.find((r) => r.key === 'rule')?.away], ['Points lost by rule', '1']);
    assert.equal(shots.find((r) => r.key === 'ue')!.away, '1', 'a rule loss is not an unforced error');
    const t = badmintonTotals(s, SINGLES);
    assert.deepEqual([t.a1.stats.ruleLosses, t.a1.stats.unforcedErrors, t.h1.stats.ruleLosses], [1, 1, 0]);
    const who = { winner: 'Hana', loser: 'Asha', server: 'Hana' };
    assert.equal(racketSentence('badminton', { side: 'home', kind: 'point', pd: { how: 'rule' } } as never, who), 'Asha loses the point by rule');
    assert.equal(racketSentence('pickleball', { side: 'home', kind: 'rally', pd: { how: 'rule' } } as never, who, 'rally'), 'Asha loses the rally by rule');
    assert.equal(pdText({ how: 'rule', err: { playerId: 'a1' } }, true, 'squash', nameOf), 'Lost by rule · Asha');
  });
  test('no rule row on a match that never recorded one', () => {
    const s = run(badminton.reducer, badminton.init({ pointDetail: true }), [FS('home'), P('home'), D({ how: 'winner' })]);
    const shots = keyStats(racketView('badminton', s, { home: ['h1'], away: ['a1'] })!).find((x) => x.id === 'shots')!.rows;
    assert.equal(shots.find((r) => r.key === 'rule'), undefined);
  });
  test('RD9: an old badminton "Unforced error · fault" still reads and counts as before', () => {
    assert.equal(pdText({ how: 'ue', stroke: 'fault' }, false, 'badminton'), 'Unforced error (fault (touch / double hit))');
    assert.deepEqual(creditsOf('badminton', { how: 'ue', stroke: 'fault' }), [['loser', 'unforcedErrors'], ['loser', 'ueFault']]);
  });
});

describe('RD4: doubles winner credit (new matches: "By:")', () => {
  test('side-out doubles: a winner by the partner goes to the partner, not the server', () => {
    const s = run(PB.reducer, PB.init({ scoring: 'sideout', pointDetail: true }), [FS('home', { alt: true, pos: 2 }), P('home', 'h1'), D({ how: 'winner', by: 'h2' })]);
    assert.deepEqual(lastPd(s), { how: 'winner', by: 'h2' });
    const t = rallyTotals(s, DOUBLES, 'pickleball');
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners], [0, 1]);
  });
  test('rally-scoring doubles: a winner by a named player reaches that player', () => {
    const s = run(badminton.reducer, badminton.init({ playersPerSide: 2, pointDetail: true }), [FS('home'), P('away'), D({ how: 'winner', shot: 'smash', by: 'a2' })]);
    const t = badmintonTotals(s, DOUBLES);
    assert.deepEqual([t.a1.stats.winners, t.a2.stats.winners, t.a2.stats.winnersSmash], [0, 1, 1]);
  });
  test('padel doubles too', () => {
    const s = run(padel.reducer, padel.init({ playersPerSide: 2, pointDetail: true }), [FS('home'), P('home'), D({ how: 'winner', by: 'h2' })]);
    assert.equal(padelTotals(s, DOUBLES).h2.stats.winners, 1);
  });
  test('the timeline and commentary name the hitter', () => {
    assert.equal(pdText({ how: 'winner', shot: 'dink', by: 'h2' }, true, 'pickleball', nameOf), 'Dink winner · Hiro');
    const who = { winner: 'Hana', loser: 'Asha', server: 'Hana' };
    assert.equal(racketSentence('pickleball', { side: 'home', kind: 'point', pd: { how: 'winner', by: 'h2' } } as never, who, 'point', nameOf), 'Hiro wins the point with a Winner');
  });
});

describe('RD5: without "By:" everything credits exactly as before', () => {
  test('side-out doubles: the server keeps the winner (old matches)', () => {
    const s = run(PB.reducer, PB.init({ scoring: 'sideout', pointDetail: true }), [FS('home', { alt: true, pos: 2 }), P('home', 'h1'), D({ how: 'winner' })]);
    const t = rallyTotals(s, DOUBLES, 'pickleball');
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners], [1, 0]);
  });
  test('rally-scoring doubles with nobody named: side level (no player credited)', () => {
    const s = run(badminton.reducer, badminton.init({ playersPerSide: 2, pointDetail: true }), [FS('home'), P('away'), D({ how: 'winner' })]);
    const t = badmintonTotals(s, DOUBLES);
    assert.deepEqual([t.a1.stats.winners, t.a2.stats.winners], [0, 0]);
  });
});

describe('RD6: hostile values', () => {
  const ev = (): LiveEvent[] => [{ id: 1, kind: 'point', side: 'home' } as LiveEvent];
  const put = (pd: unknown, sport: 'badminton' | 'tabletennis' | undefined = 'badminton') => applyPointDetail(ev(), { pd }, sport)?.[0].pd;
  test('a bad by is dropped', () => {
    for (const by of [1, '', null, {}, ['h1'], 'x'.repeat(200)]) assert.deepEqual(put({ how: 'winner', by }), { how: 'winner' }, String(by));
    assert.deepEqual(put({ how: 'ue', by: 'h1' }), { how: 'ue' }, 'an error has no hitter');
    assert.deepEqual(applyPointDetail(ev(), { pd: { how: 'winner', by: 'h1' } })?.[0].pd, { how: 'winner' }, 'tennis unchanged');
    const proto = JSON.parse('{"how":"winner","__proto__":{"by":"h1"}}');
    assert.deepEqual(put(proto), { how: 'winner' });
  });
  test('an unknown type on a forced error is never credited or printed', () => {
    assert.deepEqual(put({ how: 'fe', stroke: '__proto__' }), { how: 'fe' });
    assert.deepEqual(creditsOf('badminton', { how: 'fe', stroke: 'kitchen' }), [['loser', 'forcedErrors']]);
    assert.equal(pdText({ how: 'fe', stroke: 'kitchen' }, false, 'badminton'), 'Forced error');
  });
  test('a by naming the other side (or nobody known) falls back to the old credit', () => {
    const s = run(PB.reducer, PB.init({ scoring: 'sideout', pointDetail: true }), [FS('home', { alt: true, pos: 2 }), P('home', 'h1'), D({ how: 'winner', by: 'a1' })]);
    const t = rallyTotals(s, DOUBLES, 'pickleball');
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners, t.a1.stats.winners], [1, 0, 0]);
    const c = detailPlayerCredits('pickleball', s.events, (side, p) => (p?.playerId && ['h1', 'h2'].includes(p.playerId) && side === 'home' ? p.playerId : undefined));
    assert.equal(c.get('h1')?.winners, 1);
  });
});

describe('RD7: other sports and the tennis lists unchanged', () => {
  test('tennis keeps its own lists', () => {
    assert.deepEqual(DETAIL_HOWS.tennis.map((h) => h.how), ['sw', 'winner', 'fe', 'ue', 'rule']);
    assert.deepEqual(howDef('tennis', 'fe')!.strokes, ['net', 'long', 'wide']);
  });
  test('an old table tennis log replays to the same events', () => {
    const log = [FS('home'), ...L.TT_LOG];
    const a = run(TT.reducer, TT.init({}), log);
    assert.deepEqual(pointInputs(a.events).length, a.events.filter((e) => e.kind === 'point').length);
  });
});

describe('RD8: the capture stays optional and after the rally', () => {
  const src = read('src/sports/PointDetailRow.tsx');
  test('type chips for forced errors; "By:" for winners; the rule hint', () => {
    assert.match(src, /pd\.how === 'fe'/);
    assert.match(src, /sel\?\.credit === 'winner'/);
    assert.match(src, /sel\?\.hint/);
  });
  test('switching unforced ↔ forced keeps the error type', () => {
    assert.match(src, /keepType/);
  });
});
