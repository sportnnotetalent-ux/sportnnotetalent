/**
 * The chain, link 1: Info shows every rule and every capture, in every sport
 * (docs/security/breaks/info-chain.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SportMeta } from '../src/sports/types.ts';
import { matchRules, matchCaptures, liveOwnedKeys, settingsUnit } from '../src/sports/matchRules.ts';
import { hideRuleHolds } from '../src/sports/formatPick.ts';
import { detailLiveSettings } from '../src/sports/pointDetailSettings.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import type { FormatField, LiveSettings } from '../src/sports/types.ts';

// every sport's metadata (its meta.ts; the registry pulls in app-only modules)
const SPORTS = join(import.meta.dirname, '..', 'src', 'sports');
const SPORT_LIST: SportMeta[] = [];
for (const d of readdirSync(SPORTS)) {
  const f = join(SPORTS, d, 'meta.ts');
  if (!existsSync(f)) continue;
  for (const v of Object.values(await import(f))) if (v && typeof v === 'object' && 'id' in v && 'name' in v) SPORT_LIST.push(v as SportMeta);
}
const getSportMeta = (id: string) => SPORT_LIST.find((m) => m.id === id)!;
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const defaults = (fields: readonly FormatField[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));
const BAD = /undefined|NaN|\[object|Infinity|^\s*$/;
const isCapture = (f: FormatField) => f.type === 'toggle' && /stat/i.test(f.group ?? '');

describe('IC1: the rules, every sport', () => {
  for (const m of SPORT_LIST) {
    test(m.id, () => {
      const fields = m.formatFields ?? [];
      const fmt = defaults(fields);
      const lines = matchRules(fields, fmt);
      for (const l of lines) assert.ok(!BAD.test(l.label) && !BAD.test(l.value), `${m.id}.${l.key}: "${l.label}" = "${l.value}"`);
      const hidden = (f: FormatField) => !!f.hideWhen && hideRuleHolds(f.hideWhen, fmt[f.hideWhen.key] ?? null); // cue batch 5: `unless` too
      const want = fields.filter((f) => !isCapture(f) && !hidden(f)).map((f) => f.key);
      assert.deepEqual(lines.map((l) => l.key), want, m.id);
    });
  }
  test('an option reads by its label; a switch On / Off; a number as is', () => {
    const pool = getSportMeta('pool').formatFields!;
    const lines = Object.fromEntries(matchRules(pool, { ...defaults(pool), game: 'nine', raceTo: 7, tenEarly: true }).map((l) => [l.key, l.value]));
    assert.equal(lines.game, '9-Ball');
    assert.equal(lines.raceTo, '7');
    assert.equal(lines.threeBallRule, 'On');
    // cue batch 5: the 10-ball option shows only in a 10-ball match
    assert.equal(lines.tenEarly, undefined);
    const ten = Object.fromEntries(matchRules(pool, { ...defaults(pool), game: 'ten', tenEarly: true }).map((l) => [l.key, l.value]));
    assert.equal(ten.tenEarly, 'On');
  });
  test('hideWhen: scotch-doubles turns only in doubles', () => {
    const pool = getSportMeta('pool').formatFields!;
    assert.ok(!matchRules(pool, { ...defaults(pool), playersPerSide: 1 }).some((l) => l.key === 'scotchTurns'));
    assert.equal(matchRules(pool, { ...defaults(pool), playersPerSide: 2, scotchTurns: 'turn' }).find((l) => l.key === 'scotchTurns')!.value, 'Each player plays a full turn');
  });
  test('an older match without a field reads its standard', () => {
    const pool = getSportMeta('pool').formatFields!;
    assert.equal(matchRules(pool, { game: 'eight' }).find((l) => l.key === 'raceTo')!.value, '5');
  });
  test('a value outside the options still reads (never blank)', () => {
    const pool = getSportMeta('pool').formatFields!;
    assert.equal(matchRules(pool, { game: 'twelve' }).find((l) => l.key === 'game')!.value, 'twelve');
  });
  test('owned keys (Scoring settings) are left out', () => {
    const t = getSportMeta('tennis').formatFields!;
    const own = liveOwnedKeys(detailLiveSettings('tennis'));
    const keys = matchRules(t, defaults(t), { omit: own }).map((l) => l.key);
    for (const k of own) assert.ok(!keys.includes(k), k);
  });
});

describe('IC2: what the match captures', () => {
  test('tennis: every stats-to-track switch, on or off as the match has it', () => {
    const ls = detailLiveSettings('tennis') as LiveSettings<unknown>;
    const s = tennis.init({ pointDetail: true });
    const { captures, rules } = matchCaptures(ls, s);
    assert.deepEqual(captures.map((c) => [c.key, c.on]), [['pointDetail', true], ['serveDetail', false], ['netDetail', false], ['rallyDetail', false], ['speedDetail', false]]);
    assert.ok(rules.some((r) => r.key === 'speedUnit' && r.value === 'km/h'));
  });
  test('no settings: nothing to list', () => {
    assert.deepEqual(matchCaptures(undefined, {}), { captures: [], rules: [] });
  });
  test('a broken read never throws', () => {
    const ls = { title: 'x', fields: [{ key: 'a', label: 'A', type: 'toggle', default: false }], read: () => { throw new Error('x'); }, mode: 'config' } as unknown as LiveSettings<unknown>;
    assert.deepEqual(matchCaptures(ls, null).captures, [{ key: 'a', label: 'A', on: false }]);
  });
  test('format-field stats switches (e.g. measured sports) count as captures', () => {
    const fields: FormatField[] = [{ key: 'x', label: 'Splits', type: 'toggle', default: false, group: 'Stats to track' }, { key: 'y', label: 'Laps', type: 'number', default: 4 }];
    assert.deepEqual(matchRules(fields, { x: true, y: 4 }).map((l) => l.key), ['y']);
    assert.deepEqual(matchCaptures(undefined, {}, fields, { x: true }).captures, [{ key: 'x', label: 'Splits', on: true }]);
  });
});

describe('IC3 + IC4', () => {
  test('Edit format leaves out every key Scoring settings owns', () => {
    assert.deepEqual(liveOwnedKeys(detailLiveSettings('badminton')), detailLiveSettings('badminton').fields.map((f) => f.key));
    assert.deepEqual(liveOwnedKeys(undefined), []);
  });
  test('the settings card speaks the sport\'s words', () => {
    assert.deepEqual(settingsUnit('cricket'), { one: 'ball', many: 'Balls', done: 'bowled' });
    assert.equal(settingsUnit('tennis').one, 'point');
    assert.equal(settingsUnit('carrom').one, 'board');
    assert.equal(settingsUnit('kabaddi').one, 'raid');
    assert.equal(settingsUnit('volleyball').one, 'rally');
  });
});

describe('the screen', () => {
  const src = read('src/screens/LiveScoringScreen.tsx');
  test('Info lists the rules and the captures, for everyone', () => {
    assert.match(src, /matchRules\(/);
    assert.match(src, /matchCaptures\(/);
    assert.match(src, /<RulesCard /);
  });
  test('Edit format omits every owned key', () => assert.match(src, /\.\.\.liveOwnedKeys\(plugin\.liveSettings( as never)?\)/));
  test('the card uses the sport\'s unit', () => {
    const card = read('src/components/LiveSettingsCard.tsx');
    assert.ok(!/next ball|Balls already bowled|No balls yet/.test(card));
    assert.match(card, /unit\.one/);
  });
});
