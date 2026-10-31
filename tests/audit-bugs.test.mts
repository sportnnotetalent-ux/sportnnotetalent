/**
 * The four confirmed audit bugs (docs/security/breaks/audit-bugs-2026-10-31.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { icsText } from '../src/core/exportCells.ts';
import { classRequestNotices } from '../src/core/org.ts';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { cricketTickerDetail } from '../src/sports/cricket/ticker.ts';
import { disciplineOf, phaseDiscipline, type ResultEntry, type EntryResult } from '../src/data/results/model.ts';
import { rankEntries } from '../src/data/results/rank.ts';
import { rankFinal } from '../src/data/results/plan.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('AB-01 calendar export', () => {
  test('semicolons are escaped, like commas', () => {
    assert.equal(icsText('Ground 2; Gate B'), 'Ground 2\\; Gate B');
    assert.equal(icsText('a;b,c\\d'), 'a\\;b\\,c\\\\d');
  });
  test('the rest is unchanged: backslash first, line breaks folded', () => {
    assert.equal(icsText('Venue\r\nATTENDEE:evil'), 'Venue\\nATTENDEE:evil');
    assert.equal(icsText('plain text'), 'plain text');
  });
});

describe('AB-02 class change request', () => {
  test('one notice per admin, addressed to that admin', () => {
    const n = classRequestNotices({ orgName: 'DPS', myName: 'Asha', requested: 'Class 7B', approverIds: ['a1', 'a2'] });
    assert.deepEqual(n.map((x) => x.playerId), ['a1', 'a2']);
    assert.match(n[0].title, /Class update request — DPS/);
    assert.match(n[0].body, /Asha requests their class be set to “Class 7B”/);
  });
  test('a note is added; no admins → no notices', () => {
    assert.match(classRequestNotices({ orgName: 'DPS', myName: 'Asha', requested: '7B', note: 'moved section', approverIds: ['a1'] })[0].body, /Note: moved section/);
    assert.deepEqual(classRequestNotices({ orgName: 'DPS', myName: 'Asha', requested: '7B', approverIds: [] }), []);
  });
  test('the screen uses it (no notice addressed to the student)', () => {
    const src = read('src/screens/OrganizationScreen.tsx');
    assert.match(src, /classRequestNotices\(/);
    assert.doesNotMatch(src, /playerId: myId \?\? undefined/);
  });
});

describe('AB-03 cricket chase after a rain cut', () => {
  const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
  const chase = (): CricketState => {
    let s = init({ overs: 20, dls: true });
    s = { ...s, scores: { ...s.scores, [s.battingSide]: inn(150, 6, 120) }, ballsInOver: 6 };
    s = reducer(s, { type: 'END_INNINGS' });
    s = { ...s, scores: { ...s.scores, [s.battingSide]: inn(80, 3, 60) }, ballsInOver: 6, strikerId: 'b1' };
    return reducer(s, { type: 'RAIN', payload: { overs: 15, v: 2 } } as ScoreAction);
  };
  test('the overlay counts balls left from the cut length, as the scorer does', () => {
    const s = chase();
    assert.equal(s.oversLimit, 15);
    const left = s.oversLimit * s.ballsPerOver - s.scores[s.battingSide].balls; // 30
    const d = cricketTickerDetail(s, { home: 'A', away: 'B' });
    assert.match(d.banner ?? '', new RegExp(`off ${left}\\b`), d.banner);
  });
  test('the records block reads the same length (source)', () => {
    assert.doesNotMatch(read('src/sports/cricket/records.ts'), /inn2Overs \?\? s\.oversLimit/);
    assert.doesNotMatch(read('src/sports/cricket/ticker.ts'), /inn2Overs \?\? x\.oversLimit/);
  });
});

describe('AB-04 locking a final uses the meet’s rules', () => {
  const R70 = disciplineOf('arch.r70')!;
  const row = (i: number, result: EntryResult): ResultEntry => ({ id: `e${i}`, playerId: `p${i}`, name: `P${i}`, result } as ResultEntry);
  const rows = [row(1, { mark: 650, tens: 20, xs: 8 }), row(2, { mark: 650, tens: 18, xs: 10 })];
  const f = { rules: { archTie: 'xs' } } as never;
  test('the same order as the medal table', () => {
    const table = rankEntries(rows, phaseDiscipline(R70, f))[0].id;
    assert.equal(table, 'e2');
    assert.equal(rankFinal(f, R70, rows).rows[0].id, table);
  });
  test('default rules: unchanged', () => {
    assert.equal(rankFinal({} as never, R70, rows).rows[0].id, rankEntries(rows, R70)[0].id);
  });
  test('completeFinal and the re-sync both rank with it', () => {
    const src = read('src/data/resultsStore.ts');
    const body = (name: string) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf('\n}\n', src.indexOf(`export async function ${name}(`)));
    for (const fn of ['completeFinal', 'resyncFinalLines']) {
      assert.match(body(fn), /rankFinal\(/, fn);
      assert.doesNotMatch(body(fn), /rankEntries\(entries\.map\(\(e\) => toResultEntry\(e, nameOf\)\), def,/, fn);
    }
  });
});
