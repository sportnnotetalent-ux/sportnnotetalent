/** Wave 0: closing a describe step never loses the goal / try (docs/security/breaks/score-on-close.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeSaves, closeLabel } from '../src/sports/flowClose.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('SC7/SC8: Save as is only on a describe step of a new play', () => {
  assert.equal(closeSaves({ editing: false, describing: true }), true);
  assert.equal(closeSaves({ editing: false, describing: false }), false, 'defining step: Cancel backs out');
  assert.equal(closeSaves({ editing: true, describing: true }), false, 'editing keeps the original');
  assert.equal(closeLabel(true), 'Save as is');
  assert.equal(closeLabel(false), 'Cancel');
});

// describe-court-team DC1–DC3: netball left this list — its feed / rebound /
// outcome / type steps are gone, the play is logged on the tap (tested below)
const CASES: [string, RegExp[]][] = [
  ['hockey', [/flow\.mode === 'goal' && flow\.step === 'assist'[\s\S]{0,120}goal\(sd, flow\.goalType \?\? 'field', flow\.scorer \?\? null, null, flow\.pc\)/]],
  ['ice_hockey', [/flow\.step === 'onice'[\s\S]{0,80}goal\(sd, flow\.d, flow\.a2 \?\? null\)/, /flow\.step === 'a1' \|\| flow\.step === 'a2'[\s\S]{0,60}goal\(sd, flow\.d, null\)/]],
  ['rugby', [/flow\.mode === 'try' && flow\.step === 'assist'[\s\S]{0,80}scoreTry\(sd, flow\.scorer \?\? null, null\)/]],
  ['rugby_league', [/flow\.mode === 'try' && flow\.step === 'assist'[\s\S]{0,80}scoreTry\(sd, flow\.scorer \?\? null, null, flow\.bonus\)/]],
];

test('SC1–SC6: each sport saves the play when a describe step is closed', () => {
  for (const [sp, res] of CASES) {
    const s = read(`src/sports/${sp}/index.tsx`);
    assert.match(s, /closeSaves\(\{ editing: !!editAt, describing/, sp);
    assert.match(s, /closeLabel\(/, sp);
    for (const re of res) assert.match(s, re, sp);
  }
});

test('SC1–SC3 (describe-court-team DC1–DC3): netball has no describe step to close — the play logs on the tap', () => {
  const s = read('src/sports/netball/index.tsx');
  assert.doesNotMatch(s, /step: 'feed'|step: 'rebound'|step: 'outcome'/);
  assert.match(s, /if \(isMiss\) miss\(sd, pos, shooter\); else goal\(sd, pos, shooter\);/);
});

test('600 scorers: a decided play is never lost; a mis-tap never becomes a play', () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    for (let k = 0; k < 50; k++) {
      const editing = rnd() < 0.2, describing = rnd() < 0.6;
      const saves = closeSaves({ editing, describing });
      if (!editing && describing) assert.equal(saves, true, `${u}: a decided play is kept`);
      if (!describing) assert.equal(saves, false, `${u}: a defining step backs out`);
      if (editing) assert.equal(saves, false, `${u}: an edit keeps the original`);
    }
  }
});
