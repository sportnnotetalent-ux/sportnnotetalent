/** 600 players with random foul sequences (FIBA 2026, basketball-rulebook.md
 *  BK-1/2): disqualification happens exactly when the rule says — a D foul, or
 *  the 2nd of {category-1 technical, flagrant, unsportsmanlike} — and never for
 *  disruptive fouls or category-2 technicals. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, disqualifyingFoul } from '../src/sports/basketball/engine.ts';
import { foulAction } from '../src/sports/basketball/actions.ts';
import type { FoulType } from '../src/sports/basketball/events.ts';

let seed = 3901;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const KINDS: [FoulType, boolean][] = [['personal', false], ['disruptive', false], ['technical', false], ['technical', true], ['flagrant', false], ['unsportsmanlike', false], ['disqualifying', false]];

test('600 players', () => {
  for (let u = 0; u < 600; u++) {
    const P = { id: `p${u}`, fullName: `Player ${u}` };
    let s = init({});
    let counted = 0;
    for (let k = 0; k < 6; k++) {
      const [type, cat2] = KINDS[rnd(KINDS.length)];
      const r = disqualifyingFoul(s, P.fullName, type, { side: 'home', pid: P.id }, cat2 ? { cat2: true } : undefined);
      const counts = (type === 'technical' && !cat2) || type === 'flagrant' || type === 'unsportsmanlike';
      const expect = type === 'disqualifying' || (counts && counted >= 1);
      assert.equal(!!r, expect, `${u}: ${type}${cat2 ? ' cat2' : ''} after ${counted}`);
      if (r) break;
      if (counts) counted += 1;
      s = reducer(s, foulAction('home', P, type, cat2 ? { cat2: true } : {}));
    }
  }
});
