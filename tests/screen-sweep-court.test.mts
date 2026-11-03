/**
 * Screen sweep, court sports (docs/security/breaks/screen-sweep-court.md):
 * chess second-illegal-move pre-select, handball "Not sure" / Breakthrough,
 * volleyball fault chips without a roster, netball toss-up before play.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreAction } from '../src/sports/types.ts';
import * as ch from '../src/sports/chess/engine.ts';
import * as hb from '../src/sports/handball/engine.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import * as nb from '../src/sports/netball/engine.ts';

const root = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

/* ================================= chess ================================= */
describe('chess · second illegal move pre-selects the loss', () => {
  test('C1: the pre-select effect overrides an earlier pick (no `pick == null` guard)', () => {
    const t = src('src/sports/chess/index.tsx');
    const eff = t.slice(t.indexOf('const presetKey'), t.indexOf('}, [presetKey]);'));
    assert.doesNotMatch(eff, /pick == null/);
    assert.match(eff, /if \(preset\) \{ setPick\(presetPick\(/);
  });
  test('C2: it runs once per new illegal move (keyed), so a later pick stands', () => {
    const t = src('src/sports/chess/index.tsx');
    assert.match(t, /\}, \[presetKey\]\);/);
  });
  test('C3: the pre-selected tile is the winner’s colour, also with the colour changed', () => {
    let s = ch.init({});
    for (let i = 0; i < 2; i++) s = ch.reducer(s, ch.arbiterAction(s, 'illegal', 'home') as ScoreAction);
    const p = ch.arbiterPreset(s)!;
    assert.equal(p.winner, 'away');
    assert.equal(ch.presetPick(p, 'home'), 'black');
    assert.equal(ch.presetPick(p, 'away'), 'white');
    assert.equal(ch.presetPick(null, 'home'), null);
  });
});

/* ================================ handball ================================ */
describe('handball · "Not sure" and the position grid', async () => {
  const sp = await import('../src/sports/handball/shotPick.ts');
  test('H1: "Not sure" advances like a position (shot → result, goal → scorer)', () => {
    const shot = { mode: 'shot' as const, side: 'home' as const, step: 'type' as string };
    const goal = { mode: 'goal' as const, side: 'home' as const, step: 'type' as string };
    assert.deepEqual(sp.afterPosition(shot, hb.UNSURE_SHOT), { ...shot, shotType: 'unknown', step: 'result' });
    assert.deepEqual(sp.afterPosition(shot, 'sixM'), { ...shot, shotType: 'sixM', step: 'result' });
    assert.deepEqual(sp.afterPosition(goal, hb.UNSURE_SHOT), { ...goal, shotType: 'unknown', step: 'scorer' });
    assert.equal(sp.pickLabel(hb.UNSURE_SHOT), 'position not sure');
  });
  test('H1: both flows use the shared step; the grid offers "Not sure"', () => {
    const t = src('src/sports/handball/index.tsx');
    assert.equal((t.match(/typeGrid\(\(t\) => setFlow\(afterPosition\(flow, t\)\)\)/g) ?? []).length, 2);
    assert.match(t, /label="Not sure"[^\n]*onPress=\{\(\) => pick\(UNSURE_SHOT\)\}/);
  });
  test('H2: a "Not sure" miss stores no position', () => {
    const s = [{ type: 'MISS', side: 'home', payload: { shotType: 'unknown', result: 'missed', uid: 'm1' } }].reduce(hb.reducer as never, hb.init({})) as hb.HandballState;
    assert.equal(s.events[0].unsure, true);
    assert.equal(s.events[0].shotType, undefined);
  });
  test('H3: the grid is two a row with tighter padding (Breakthrough fits at 375 px)', () => {
    assert.equal(sp.GRID_BTN.flexBasis, '45%');
    assert.ok(sp.GRID_BTN.paddingHorizontal <= 8);
    // 375 − 2×16 gutter − 2×13 panel − 8 gap → each ~150 px; "Breakthrough" ≈ 12 × 9 px + 16 padding
    const each = (375 - 32 - 26 - 8) / 2;
    assert.ok(12 * 9 + 2 * sp.GRID_BTN.paddingHorizontal < each);
    assert.match(src('src/sports/handball/index.tsx'), /typeBtn: GRID_BTN/);
  });
});

/* =============================== volleyball =============================== */
describe('volleyball · fault-type chips without a roster', () => {
  const t = src('src/sports/volleyball/index.tsx');
  test('V1: the no-roster branch offers the fault types (optional)', () => {
    const noRoster = t.slice(t.indexOf('screen sweep V1'), t.indexOf('/** SD-117b: the side\'s court'));
    assert.match(noRoster, /VB_ERROR_TYPES\.map/);
    assert.match(noRoster, /Opp\. fault type \(optional\)/);
    for (const k of ['handling', 'backrow', 'foot']) assert.ok(vb.VB_ERROR_TYPES.some((e) => e.key === k));
  });
  test('V2: a plain Opp. fault tap is still one tap with no payload', () => {
    const a = vb.outcomeAction('opperror', 'home', undefined, { err: undefined });
    assert.equal(a.type, 'OPP_ERROR');
    assert.equal(a.payload, undefined);
    const b = vb.outcomeAction('opperror', 'home', undefined, { err: 'handling' });
    assert.deepEqual(b.payload, { err: 'handling' });
  });
  test('V3: the picked type clears after every point', () => {
    assert.match(t, /const reset = \(\) => \{ setHow\('attack'\); setErr\(undefined\); \};/);
    assert.match(t, /dispatch\(outcomeAction\(kind, side, kind === 'opperror' \? undefined : p, fault\)\);\n\s*reset\(\);/);
  });
});

/* ================================ netball ================================ */
describe('netball · toss-up before play', () => {
  test('N1: before the first centre pass the reason is the World Netball one', () => {
    const s = nb.init({});
    assert.equal(nb.tossUpBlocked(s), 'Start play first (pick the first centre pass)');
    const s2 = nb.reducer(s, { type: 'FIRST_CENTRE', side: 'home' } as ScoreAction);
    assert.equal(s2.firstCentre, 'home');
    assert.equal(nb.tossUpBlocked(s2), 'Start play first (start the clock)');
    assert.equal(nb.tossUpBlocked({ ...s, clock: { ...s.clock, ms: 1000 } }), null);
  });
  test('N1/N2: the button is not silently disabled; before play it shows the reason and dispatches nothing', () => {
    const t = src('src/sports/netball/index.tsx');
    const line = t.split('\n').find((l) => l.includes('label="🙌 Toss-up won"'))!;
    assert.doesNotMatch(line, /disabled=/);
    assert.match(line, /periodStarted\(s\) \? fire\(\{ type: 'TOSS_UP', side: sd \}\) : setTossWhy\(sd\)/);
    assert.match(t, /\{tossUpBlocked\(s\)\}/);
  });
});
