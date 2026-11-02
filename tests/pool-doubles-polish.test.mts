/**
 * Pool scotch doubles polish (docs/security/breaks/pool-doubles-polish.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { poolStats } from '../src/sports/pool/stats.ts';
import { boxColumns, boxLegend } from '../src/sports/boxScore.ts';
import { startStep } from '../src/core/startStep.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('PP1: pair names on the tabs', () => {
  for (const f of ['src/sports/pool/index.tsx', 'src/sports/carrom/index.tsx']) {
    test(f, () => assert.match(read(f), /roster\.length === 2 \? entryDisplayName\(roster\.map\(\(p\) => who\(p\.id, p\.fullName\)\)\) \?\? team/));
  }
});

describe('PP2: short headers that fit a phone', () => {
  test('every pool box column has a short header (≤ 4 letters)', () => {
    for (const c of boxColumns(poolStats)) assert.ok(c.abbr.length <= 4 && c.abbr !== c.label, `${c.key}: "${c.abbr}"`);
  });
});

describe('PP3: the key never repeats a word', () => {
  test('abbr + label when they differ; the label alone when a column has no short header', () => {
    assert.equal(boxLegend([{ abbr: 'RW', label: 'Racks won' }, { abbr: 'Pots', label: 'Pots' }]), 'RW Racks won · Pots');
  });
  test('the box draws its key with it', () => assert.match(read('src/components/BoxScore.tsx'), /boxLegend\(table\.columns\)/));
});

describe('PP4: one tap to start pool', () => {
  test('pool asks who breaks', () => assert.equal(startStep('pool'), 'breaks'));
  test('the sport logs its own first action (the stamped LAG)', () => {
    assert.match(read('src/sports/pool/index.tsx'), /startAction: \(state, side\) => lagAction\(state as PoolMatch, side, \{ at: Date\.now\(\) \}\)/);
    const src = read('src/screens/LiveScoringScreen.tsx');
    assert.match(src, /firstStep === 'breaks' && side && plugin\.startAction/);
    assert.match(src, /\$\{side === 'home' \? homeShown : awayShown\} \$\{firstStep === 'breaks' \? 'breaks' : 'serves'\}/);
  });
});
