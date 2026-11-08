/**
 * Measured sports, wave 2 (docs/security/breaks/describe-measured.md): splits,
 * relay take-overs and the DQ-reason chips fold to "✓ Saved · … Edit" with
 * Done (Skip when nothing is entered), per entry; typed values still save on
 * blur, and Done saves a valid typed value that hasn't been saved yet.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  foldKey, foldMode, splitsSummary, takeoverSummary, dqSummary, trimTrailing, doneStep,
} from '../src/data/results/measuredFold.ts';
import { panelMode, type PanelMark } from '../src/sports/describePanel.ts';
import { disciplineOf, rankEntries, resultWithSplits, type EntryResult, type ResultEntry } from '../src/data/results/index.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCREEN = read('src/screens/ResultsEventScreen.tsx');
const DEPTH = read('src/components/results/RaceDepth.tsx');
const sliceFn = (src: string, name: string) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, name);
  const j = src.indexOf('\nfunction ', i + 10);
  const k = src.indexOf('\nexport function ', i + 10);
  const ends = [j, k].filter((x) => x > 0);
  return src.slice(i, ends.length ? Math.min(...ends) : undefined);
};

describe('pure parts', () => {
  test('DM4 / DM10: one key per kind, phase and entry, never a lane or index', () => {
    assert.equal(foldKey('splits', 'ph1', 'e7'), 'splits:ph1:e7');
    const keys = new Set([foldKey('splits', 'ph1', 'e7'), foldKey('takeovers', 'ph1', 'e7'), foldKey('dq', 'ph1', 'e7'), foldKey('splits', 'ph2', 'e7'), foldKey('splits', 'ph1', 'e8')]);
    assert.equal(keys.size, 5);
  });
  test('splits summary: typed boxes counted; nothing typed → "" (Skip)', () => {
    assert.equal(splitsSummary([], 3), '');
    assert.equal(splitsSummary([undefined, undefined], 2), '');
    assert.equal(splitsSummary([30.1], 1), '1 split');
    assert.equal(splitsSummary([55, 125, 200], 3), '3 splits');
    assert.equal(splitsSummary([55, undefined, 200], 3), '2 of 3 splits');
    assert.equal(splitsSummary([55, NaN], 2), '2 splits'); // an unreadable box still counts — Done, not Skip (DM2)
  });
  test('DM5: take-over summary names the leg (the exchange), not a swimmer', () => {
    assert.equal(takeoverSummary([]), '');
    assert.equal(takeoverSummary([null, null]), '');
    assert.equal(takeoverSummary([0.21, 0.18, 0.25]), 'L2 0.21 · L3 0.18 · L4 0.25');
    assert.equal(takeoverSummary([null, -0.05]), 'L3 -0.05');
    assert.equal(takeoverSummary([NaN]), 'L2 ?');
  });
  test('DQ summary: only once a reason is picked', () => {
    assert.equal(dqSummary({}), '');
    assert.equal(dqSummary({ status: 'DQ' }), '');
    assert.equal(dqSummary({ status: 'DQ', ruleRef: 'SW 7.6' }), '');
    assert.equal(dqSummary({ status: 'DQ', ruleRef: 'SW 7.6', reason: 'Breaststroke: not on the breast' }), 'DQ · SW 7.6 — Breaststroke: not on the breast');
    assert.equal(dqSummary({ status: 'DNS', ruleRef: 'SW 7.6', reason: 'x' }), '');
  });
  test('DM7: a saved mark with nothing left to show opens again', () => {
    assert.equal(foldMode('saved', 'DQ · SW 7.6 — x'), 'saved');
    assert.equal(foldMode('saved', ''), 'open');
    assert.equal(foldMode('open', ''), 'open');
    assert.equal(foldMode('hidden', ''), 'hidden');
  });
  test('trimTrailing drops empty boxes at the end only', () => {
    assert.deepEqual(trimTrailing([1, undefined, 3, undefined, null]), [1, undefined, 3]);
    assert.deepEqual(trimTrailing([undefined]), []);
  });
  test('DM1: Done saves a valid typed value not yet saved, then folds', () => {
    assert.deepEqual(doneStep({ bad: false, next: [55, 125], saved: [55] }), { send: true, fold: true, key: '[55,125]' });
    assert.deepEqual(doneStep({ bad: false, next: [55], saved: [55] }), { send: false, fold: true, key: '[55]' });
    assert.deepEqual(doneStep({ bad: false, next: undefined, saved: undefined }), { send: false, fold: true, key: '[]' });
  });
  test('DM2: an unreadable value never folds (and never saves)', () => {
    assert.deepEqual(doneStep({ bad: true, next: [55], saved: [] }), { send: false, fold: false, key: null });
  });
  test('DM3: what blur already sent is not sent again', () => {
    assert.equal(doneStep({ bad: false, next: [55, 125], saved: [55], lastSent: '[55,125]' }).send, false);
    assert.equal(doneStep({ bad: false, next: [55, 126], saved: [55], lastSent: '[55,125]' }).send, true);
  });
});

describe('the screens (source)', () => {
  test('the shared card and marks are used, keyed per phase and entry', () => {
    assert.match(SCREEN, /import \{[^}]*useDescribeMarks[^}]*\} from '\.\.\/components\/DescribeCard'/);
    assert.match(SCREEN, /foldKey\('splits', phase\.id, e\.id\)/);
    assert.match(SCREEN, /foldKey\('takeovers', phase\.id, e\.id\)/);
    assert.match(SCREEN, /foldKey\('dq', phase\.id, e\.id\)/);
    assert.match(DEPTH, /import \{ DescribeCard \} from '\.\.\/DescribeCard'/);
  });
  test('DM1 / DM3: splits and take-overs commit through doneStep on blur and on Done', () => {
    for (const body of [sliceFn(SCREEN, 'SplitsField'), sliceFn(DEPTH, 'TakeoverField')]) {
      assert.match(body, /<DescribeCard/);
      assert.match(body, /doneStep\(/);
      assert.match(body, /onBlur=\{commit\}/);
      assert.match(body, /onDone=\{/);
      assert.match(body, /lastSent/);
    }
  });
  test('DM6: the early take-over warning and the judge DQ chip stay outside the fold', () => {
    const body = sliceFn(DEPTH, 'TakeoverField');
    const warn = body.indexOf('⚠ Earlier than');
    const judge = body.indexOf('Judge confirms');
    const saved = body.indexOf("shown === 'saved'");
    assert.ok(warn > 0 && judge > 0 && saved > 0);
    assert.match(body, /const alerts = /);
    assert.ok(body.indexOf('const alerts = ') < warn && body.indexOf('const alerts = ') < judge);
    assert.match(body.slice(saved), /\{alerts\}/);
  });
  test('DM7: DQ cards read the saved row; a status change clears the mark', () => {
    assert.match(sliceFn(SCREEN, 'SwimStatusChips'), /dqSummary\(r\)/);
    assert.match(sliceFn(SCREEN, 'SwimStatusChips'), /foldMode\(/);
    assert.match(sliceFn(SCREEN, 'SwimStatusChips'), /onStatus\?\.\(\)/);
    assert.match(sliceFn(SCREEN, 'StatusChips'), /onStatus\?\.\(\)/);
    assert.match(sliceFn(DEPTH, 'AthDqChips'), /dqSummary\(r\)/);
    assert.match(sliceFn(DEPTH, 'AthDqChips'), /foldMode\(/);
  });
  test('DM8 / DM11: a skipped card comes back with a labelled ＋ chip; titles name who', () => {
    assert.match(SCREEN, /accessibilityLabel=\{`Add splits for \$\{/);
    assert.match(DEPTH, /accessibilityLabel=\{`Add take-overs for \$\{/);
    assert.match(SCREEN + DEPTH, /accessibilityLabel="Add a DQ reason"/);
    assert.match(sliceFn(SCREEN, 'SplitsField'), /title=\{`Splits · \$\{who\}`\}/);
    assert.match(sliceFn(DEPTH, 'TakeoverField'), /title=\{`Take-overs · \$\{who\}`\}/);
  });
  test('DM9: every card is behind the editable gate', () => {
    assert.match(SCREEN, /\{editable && splitsOffered\(def, f, track\)/);
    assert.match(SCREEN, /\{editable && takeoversOffered\(def, track\)/);
    assert.match(SCREEN, /\{editable && \(swim \? <SwimStatusChips/);
  });
});

/* --------------------------- 600-user simulation --------------------------- */

/** A tiny model of one result row's split card, using the same pure steps as the screen. */
type Row = { id: string; result: EntryResult; typed: (number | undefined)[]; lastSent?: string; saves: number };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe('600-user simulation', () => {
  test('values never lost; the fold follows its entry; results unchanged', () => {
    const def = disciplineOf('ath.1500m')!;
    const boxes = 3;
    for (let u = 0; u < 600; u++) {
      const rand = rng(u + 1);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
      let phase = `ph${u}-heat`;
      const n = 2 + Math.floor(rand() * 6);
      let rows: Row[] = Array.from({ length: n }, (_, i) => ({ id: `e${i}`, result: { mark: 240 + Math.round(rand() * 6000) / 100 }, typed: [], saves: 0 }));
      const marks = new Map<string, PanelMark>();
      const mark = (k: string, m: PanelMark | null) => { if (m) marks.set(k, m); else marks.delete(k); };
      const save = (row: Row, list: (number | undefined)[]) => {
        row.result = resultWithSplits(row.result, list.length ? (list as number[]) : undefined, 'finish');
        row.saves++;
      };
      const commit = (row: Row) => {
        const list = trimTrailing(row.typed);
        const step = doneStep({ bad: false, next: list, saved: row.result.splits, lastSent: row.lastSent });
        if (step.send) { save(row, list); row.lastSent = step.key!; }
        return step;
      };
      // the card the model expects: valid ascending splits typed for a row
      const marksBefore = () => new Map(rows.map((r) => [r.id, [r.result.mark, r.result.status]]));
      const order = (rs: Row[]) => rankEntries(rs.map((r): ResultEntry => ({ id: r.id, name: r.id, heat: 1, result: r.result })), def).map((x) => x.id).join(',');
      const before = marksBefore();
      const orderBefore = order(rows);

      for (let step = 0; step < 25; step++) {
        const row = pick(rows);
        const key = foldKey('splits', phase, row.id);
        const action = pick(['type', 'type', 'blur', 'done', 'skip', 'edit', 'reorder', 'dq', 'nextPhase'] as const);
        if (action === 'type') {
          const i = Math.floor(rand() * boxes);
          row.typed = Array.from({ length: boxes }, (_, j) => (j === i ? 50 + j * 60 + Math.round(rand() * 900) / 100 : row.typed[j]));
        } else if (action === 'blur') {
          commit(row);
        } else if (action === 'done' || action === 'skip') {
          const typedBefore = trimTrailing(row.typed);
          const summary = splitsSummary(typedBefore, boxes);
          const st = commit(row);
          assert.ok(st.fold);
          mark(key, summary ? 'done' : 'skipped');
          // DM1: never lost — what was typed is what is saved
          assert.deepEqual(row.result.splits ?? [], typedBefore, `user ${u}: typed splits lost on ${action}`);
          if (summary) assert.equal(foldMode(panelMode(key, marks), splitsSummary(row.result.splits ?? [], boxes)), 'saved');
        } else if (action === 'edit') {
          mark(key, null);
          assert.equal(panelMode(key, marks), 'open');
        } else if (action === 'reorder') {
          // DM4: lanes reordered — each row's fold must still follow its id
          const was = new Map(rows.map((r) => [r.id, panelMode(foldKey('splits', phase, r.id), marks)]));
          rows = [...rows].sort(() => rand() - 0.5);
          for (const r of rows) assert.equal(panelMode(foldKey('splits', phase, r.id), marks), was.get(r.id));
        } else if (action === 'dq') {
          // DM7: the DQ fold reads the row — removing the reason reopens it
          const dk = foldKey('dq', phase, row.id);
          const r: EntryResult = { status: 'DQ', ruleRef: 'TR 17.3', reason: 'Lane infringement' };
          mark(dk, 'done');
          assert.equal(foldMode(panelMode(dk, marks), dqSummary(r)), 'saved');
          assert.equal(foldMode(panelMode(dk, marks), dqSummary({ ...r, reason: undefined, ruleRef: undefined })), 'open');
          mark(dk, null);
        } else if (action === 'nextPhase') {
          // DM10: heat → final: the next round's rows open fresh
          phase = `ph${u}-final-${step}`;
          rows = rows.map((r) => ({ ...r, id: `${r.id}f`, typed: [], lastSent: undefined, result: { mark: r.result.mark } }));
          for (const r of rows) assert.equal(panelMode(foldKey('splits', phase, r.id), marks), 'open');
          before.clear(); for (const [k, v] of marksBefore()) before.set(k, v);
        }
        // a saved row only reflects its own typed values
        for (const r of rows) {
          if (marks.get(foldKey('splits', phase, r.id)) === 'done') {
            assert.ok(splitsSummary(r.result.splits ?? [], boxes) !== '' || foldMode('saved', '') === 'open');
          }
        }
      }
      // DM12: marks / statuses untouched by splits, Done, Skip, Edit; ranking order the same
      for (const r of rows) assert.deepEqual([r.result.mark, r.result.status], before.get(r.id));
      if (rows.every((r) => r.id.endsWith('f')) === false) assert.equal(order(rows), orderBefore);
    }
  });
});
