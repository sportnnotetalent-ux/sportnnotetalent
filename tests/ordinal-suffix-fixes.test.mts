/**
 * Audit C items: places past 20 printed "21th", "22th", "23th".
 *  - team lifting's tie-break line (results/liftingTeam.ts placesText)
 *  - the road-race team tie-break hint (RoadPanel, "separated by the last scorer")
 *  - a custom team tie with 21+ rubbers of one kind (teamTie.ts customSpec)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placesText } from '../src/data/results/liftingTeam.ts';
import { customSpec } from '../src/data/teamTie.ts';

test('team lifting places: 21st, 22nd, 23rd, 11th–13th', () => {
  const at = (pos: number) => { const a = Array(pos).fill(0); a[pos - 1] = 1; return placesText(a); };
  assert.equal(at(21), '21st ×1');
  assert.equal(at(22), '22nd ×1');
  assert.equal(at(23), '23rd ×1');
  assert.equal(at(11), '11th ×1');
  assert.equal(at(12), '12th ×1');
  assert.equal(placesText([2, 1, 0, 1]), '1st ×2, 2nd ×1, 4th ×1', 'unchanged for the usual case');
});

test('a custom tie with 23 singles names them 21st, 22nd, 23rd', () => {
  const names = customSpec('badminton', Array(23).fill('S')).rubbers.map((r) => r.l);
  assert.equal(names[20], '21st singles');
  assert.equal(names[21], '22nd singles');
  assert.equal(names[22], '23rd singles');
  assert.equal(names[10], '11th singles');
  assert.equal(names[0], '1st singles');
});

test('the road-race hint uses the shared suffix', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/components/results/RoadPanel.tsx'), 'utf8');
  assert.match(src, /ordSuffix\(t\.last( \?\? 0)?\)/);
  assert.doesNotMatch(src, /t\.last === 3 \? 'rd' : 'th'/);
});
