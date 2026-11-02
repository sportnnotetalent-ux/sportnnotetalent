/**
 * MVP K3 (docs/security/breaks/mvp-p1-batch6.md) — a one-tap row at the top of
 * the raid panel: Empty · +1 touch · Bonus · Raider out. Each records at once
 * exactly what the full form records for the same answers (a picked raider is
 * still credited); Bonus is offered only when it would count.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, raidActions, quickRaidForm, quickBonusCounts, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const started = () => reducer(init({}), { type: 'KICKOFF', payload: { at: 1_000 } } as ScoreAction);

describe('quickRaidForm: the same answers as the full form', () => {
  const full: Record<string, Partial<RaidForm>> = {
    empty: { touches: 0, bonus: false, tackled: false },
    touch: { touches: 1, bonus: false, tackled: false },
    bonus: { touches: 0, bonus: true, tackled: false },
    out: { touches: 0, bonus: false, tackled: true },
  };
  for (const k of ['empty', 'touch', 'bonus', 'out'] as const) {
    test(k, () => {
      const raider = { id: 'p1', fullName: 'Ravi' };
      const q = quickRaidForm('home', k, raider);
      assert.deepEqual(q, { side: 'home', raider, ...full[k] });
      const s = started();
      assert.deepEqual(raidActions(s, q), raidActions(s, { side: 'home', raider, ...full[k] } as RaidForm));
    });
  }
  test('no raider: nobody credited', () => assert.equal(quickRaidForm('away', 'empty').raider, undefined));
});

test('bonus is offered only when it would count', () => {
  assert.equal(typeof quickBonusCounts(started(), 'home'), 'boolean');
});

describe('the raid panel', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/kabaddi/index.tsx'), 'utf8');
  test('a one-tap row right after the raider chips (court-team batch 1), new raids only', () => {
    const row = src.indexOf('One tap');
    assert.ok(row > 0);
    assert.ok(row > src.indexOf('Raider (optional)'), 'the raider is picked first, then one tap');
    assert.match(src, /raidFlow\.editOf == null && \(\s*<View style=\{ctrl\.quickRow\}/);
    assert.match(src, /recordForm\(quickRaidForm\(/);
  });
});
