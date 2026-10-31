/**
 * The racket "Match stats" panels share one StatBar, one team header and one
 * style sheet (src/sports/StatBar.tsx). Tennis and the shared racket panel
 * used to carry identical copies; this keeps them from drifting apart again.
 * The shared file stays light: it must not pull either sport's stats engine
 * into the other's on-demand download.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(`../src/sports/${p}`, import.meta.url), 'utf8');
const PANELS = ['MatchStatsPanel.tsx', 'tennis/StatsPanel.tsx'];

test('StatBar, the team header and the styles are defined once, in StatBar.tsx', () => {
  const shared = src('StatBar.tsx');
  assert.match(shared, /export function StatBar\(/);
  assert.match(shared, /export function StatsHead\(/);
  assert.match(shared, /export const statStyles = StyleSheet\.create\(/);
  for (const p of PANELS) {
    const s = src(p);
    assert.doesNotMatch(s, /function StatBar\(/, `${p}: own StatBar copy`);
    assert.doesNotMatch(s, /StyleSheet\.create\(/, `${p}: own style sheet copy`);
    assert.match(s, /from '(\.\.\/|\.\/)StatBar'/, `${p}: uses the shared StatBar`);
  }
});

test('the shared file imports no sport stats engine', () => {
  assert.doesNotMatch(src('StatBar.tsx'), /racketMatchStats|tennis\/matchStats|from '\.\/tennis/);
});
