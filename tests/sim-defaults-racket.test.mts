/**
 * Quality mandate step 6 for racket defaults (docs/security/breaks/defaults-racket.md):
 * 1,000 random old and new badminton / padel matches. A new match tracks point
 * detail (and, since Batch 4a / padel-fault PF7, padel's 1st / 2nd serve); an old one keeps exactly the
 * switches it was saved with; the switch never changes the score.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackFormatFields } from '../src/sports/pointDetailSettings.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 607;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const ENGINES = { badminton, padel } as const;

test('1,000 random old and new racket matches', () => {
  for (let i = 0; i < 1000; i++) {
    const sp = rnd(2) ? 'badminton' : 'padel';
    const E = ENGINES[sp] as unknown as { init: (c?: Record<string, unknown>) => Record<string, unknown>; reducer: (s: unknown, a: ScoreAction) => Record<string, unknown> };
    const isNew = rnd(2) === 1;
    const old: Record<string, unknown> = {};
    for (const k of ['pointDetail', 'serveDetail', 'rallyDetail']) { const r = rnd(3); if (r === 1) old[k] = true; else if (r === 2) old[k] = false; }
    const cfg = isNew ? Object.fromEntries(trackFormatFields(sp).map((f) => [f.key, f.default])) : old;
    const s0 = E.init(cfg);
    if (isNew) { assert.equal(s0.pointDetail, true); assert.equal(s0.serveDetail === true, sp === 'padel'); }
    else for (const k of ['pointDetail', 'serveDetail', 'rallyDetail']) assert.equal(s0[k] === true, old[k] === true, `${sp}.${k}`);
    // the same rallies score the same with or without detail tracking
    const plain = E.init({});
    let a = s0, b = plain;
    for (let n = 0; n < 40; n++) {
      const act: ScoreAction = { type: 'POINT', side: rnd(2) ? 'home' : 'away' };
      a = E.reducer(a, act); b = E.reducer(b, act);
    }
    assert.deepEqual(JSON.stringify([a.games ?? a.sets, a.pts ?? a.points]), JSON.stringify([b.games ?? b.sets, b.pts ?? b.points]));
  }
});
