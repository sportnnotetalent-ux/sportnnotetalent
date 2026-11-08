/** Live scoring, Stitch picks (docs/security/breaks/stitch-live-scoring.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../src/core/contrast.ts';
import { theme } from '../src/core/theme.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('LS1/LS3: the green panel reads in sunlight', () => {
  const bg = theme.colors.primaryDark;
  for (const fg of [theme.colors.heroText, theme.colors.lime, '#FFFFFF']) assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrastRatio(theme.colors.onLime, theme.colors.lime) >= 4.5);
});

test('LS1/LS2/LS6: the score bar is the green panel; the clock sits in a light pill; names via SideName', () => {
  const s = read('src/components/LiveScoreBar.tsx');
  assert.match(s, /backgroundColor: theme\.colors\.primaryDark/);
  assert.match(s, /clockPill/);
  assert.match(s, /<SideName/);
  assert.match(s, /accessibilityRole="summary"/, 'LS5: the summary stays');
});

test('LS4: the undo bar names the last step and Undo is its own button', () => {
  const s = read('src/screens/LiveScoringScreen.tsx');
  assert.match(s, /st\.undoLast/);
  assert.match(s, /st\.undoPill/);
  assert.match(s, /accessibilityLabel=\{`Undo\$\{undoWhat/);
});
