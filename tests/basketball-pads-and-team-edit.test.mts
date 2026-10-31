/**
 * MVP B4 — the "Assist?" box opened ABOVE both score pads after every basket
 * and closed at the next play, so the pads jumped under the thumb. It now sits
 * below the pads. MVP B8 — a team basket (no scorer) can be edited to name the
 * scorer later, keeping its points, zone and clock second (Edit was offered
 * only for plays that already named a player).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/basketball/index.tsx'), 'utf8');

test('B4: the Assist box renders after both score pads', () => {
  const pads = src.indexOf('<ScoreSide side="away"');
  const box = src.indexOf('{assistFor && (() => {');
  assert.ok(pads > 0 && box > 0);
  assert.ok(box > pads, 'the Assist box must come after the pads');
});
test('B8: a team basket can be edited (Edit no longer needs a named player for a basket)', () => {
  assert.match(src, /const canEdit = \(e: BBEvent\) => \(hasPlayer\(e\) \|\| e\.type === 'score'\) && \(e\.type === 'score' \|\| !!STAT_KEY\[e\.type\]\);/);
});
