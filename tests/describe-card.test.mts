/** One describe card for every sport (docs/security/breaks/describe-card.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelMode, doneLabel } from '../src/sports/describePanel.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('CD2: string keys (cricket "2.3") and numeric ids both work', () => {
  const m = new Map<string | number, 'done' | 'skipped'>([['2.3', 'done'], [7, 'skipped']]);
  assert.equal(panelMode('2.3', m), 'saved');
  assert.equal(panelMode('2.4', m), 'open');
  assert.equal(panelMode(7, m), 'hidden');
});

test('CD1/CD3/CD4/CD6: the shared card and its parent-held marks', () => {
  const s = read('src/components/DescribeCard.tsx');
  assert.match(s, /export function useDescribeMarks/);
  assert.match(s, /export function DescribeCard/);
  assert.match(s, /label=\{doneLabel\(summary\)\}/);
  assert.match(s, /✓ Saved · /);
  assert.match(s, /accessibilityLabel="Edit the description"/);
  assert.match(s, /accessibilityLabel="Describe the last play"/);
  assert.match(s, /'Done describing' : 'Skip describing'/);
  assert.match(s, /mode === 'hidden'/);
  assert.equal(doneLabel(''), 'Skip');
});
