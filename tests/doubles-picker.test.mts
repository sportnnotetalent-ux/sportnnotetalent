/**
 * Doubles picker (docs/security/breaks/doubles-picker.md): doubles lists only
 * real pairs, singles only one-person entries; a person starts a new pair;
 * recent pairs; the pair type (Open / Men's / Women's / Mixed).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPair, isSingle, sidesForStructure, searchSides, searchPeople, recentPairs } from '../src/data/doublesPicker.ts';
import { PAIR_TYPE_FIELD, PAIR_TYPE_SPORTS, pairTypeOf, pairTypeFromDivisions, settlePairType } from '../src/sports/pairType.ts';
import { matchRules } from '../src/sports/matchRules.ts';
import { lineContext } from '../src/data/lineContext.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import { TABLETENNIS_META } from '../src/sports/tabletennis/meta.ts';
import { SQUASH_META } from '../src/sports/squash/meta.ts';
import { PICKLEBALL_META } from '../src/sports/pickleball/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';

const hru = { id: 't-hru', name: 'Hrudhay', roster: ['p-hru'] };
const pair = { id: 't-ab', name: 'Asha Rao / Ben Lee', roster: ['p-asha', 'p-ben'] };
const trio = { id: 't-3', name: 'A / B / C', roster: ['a', 'b', 'c'] };
const twice = { id: 't-2x', name: 'Hru / Hru', roster: ['p-hru', 'p-hru'] };
const legacy = { id: 't-old', name: 'Old Singles' };
const legacyPair = { id: 't-oldp', name: 'Old / Pair' };
const all = [hru, pair, trio, twice, legacy, legacyPair];

describe('DP1–DP3: who is a pair, who is a single', () => {
  test('a pair is exactly two different people', () => {
    assert.equal(isPair(pair), true);
    assert.equal(isPair(hru), false);
    assert.equal(isPair(trio), false);
    assert.equal(isPair(twice), false);
    assert.equal(isPair(legacy), false);
  });
  test('a single is a one-person entry (or an old name-only one that is not a pair)', () => {
    assert.equal(isSingle(hru), true);
    assert.equal(isSingle(legacy), true);
    assert.equal(isSingle(pair), false);
    assert.equal(isSingle(trio), false);
    assert.equal(isSingle(legacyPair), false);
  });
  test('the founder case: "Hru" in doubles finds no pair', () => {
    assert.deepEqual(searchSides(sidesForStructure(all, 'pair'), 'Hru').map((t) => t.id), []);
    assert.deepEqual(searchSides(sidesForStructure(all, 'single'), 'Hru').map((t) => t.id), ['t-hru']);
  });
  test('doubles search lists the pair, singles does not', () => {
    assert.deepEqual(searchSides(sidesForStructure(all, 'pair'), 'asha').map((t) => t.id), ['t-ab']);
    assert.deepEqual(searchSides(sidesForStructure(all, 'single'), 'asha'), []);
  });
});

describe('DP14: hostile search text', () => {
  test('under three letters, spaces, regex characters', () => {
    assert.deepEqual(searchSides(all, 'Hr'), []);
    assert.deepEqual(searchSides(all, '     '), []);
    assert.deepEqual(searchSides(all, '.*.'), []);
    assert.deepEqual(searchPeople([{ id: 'x', name: 'a(b' }], 'a(b').map((p) => p.id), ['x']);
    assert.deepEqual(searchSides(all, 'x'.repeat(10000)), []);
  });
  test('results are capped', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, name: `Zed ${i}`, roster: [`a${i}`, `b${i}`] }));
    assert.equal(searchSides(many, 'zed').length, 25);
    assert.equal(searchSides(many, 'zed', 4).length, 4);
    assert.equal(searchPeople(many.map((t) => ({ id: t.id, name: t.name })), 'zed', 0).length, 0);
  });
});

describe('DP6–DP7: recent pairs', () => {
  const me = 'p-me';
  const mine1 = { id: 'pr1', name: 'Me / Ravi', roster: [me, 'p-ravi'] };
  const mine2 = { id: 'pr2', name: 'Me / Kiran', roster: ['p-kiran', me] };
  const hosted = { id: 'pr3', name: 'X / Y', roster: ['x', 'y'] };
  const stranger = { id: 'pr4', name: 'S / T', roster: ['s', 't'] };
  const pairs = [mine1, mine2, hosted, stranger];
  const m = (id: string, at: string, h: string, a: string, extra: Record<string, unknown> = {}) =>
    ({ id, sport: 'badminton', startsAt: at, homeTeam: { id: h }, awayTeam: { id: a }, ...extra });
  const matches = [
    m('m1', '2026-10-01T10:00:00Z', 'pr1', 'pr4'),
    m('m2', '2026-10-05T10:00:00Z', 'pr2', 'pr4'),
    m('m3', '2026-10-03T10:00:00Z', 'pr3', 'pr4', { hostIds: [me] }),
    m('m4', '2026-10-09T10:00:00Z', 'pr4', 'pr3'),
    { ...m('m5', '2026-10-10T10:00:00Z', 'pr1', 'pr2'), sport: 'tennis' },
  ];
  test('pairs I played in or hosted, this sport, newest first', () => {
    assert.deepEqual(recentPairs({ matches, pairs, sport: 'badminton', me }).map((t) => t.id), ['pr2', 'pr3', 'pr4', 'pr1']);
  });
  test('a match I hosted lists both its pairs; a stranger match lists none', () => {
    const r = recentPairs({ matches: [m('m4', '2026-10-09T10:00:00Z', 'pr4', 'pr3')], pairs, sport: 'badminton', me });
    assert.deepEqual(r.map((t) => t.id), ['pr1', 'pr2']); // only my entries, never a stranger's pair
  });
  test('the other side is left out, at most six, no duplicates, never a single', () => {
    assert.deepEqual(recentPairs({ matches, pairs, sport: 'badminton', me, exclude: 'pr2' }).map((t) => t.id), ['pr3', 'pr4', 'pr1']);
    const lots = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, name: `q${i}`, roster: [me, `z${i}`] }));
    const ms = lots.map((t, i) => m(`x${i}`, `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`, t.id, t.id));
    const r = recentPairs({ matches: ms, pairs: [...lots, hru as never], sport: 'badminton', me });
    assert.equal(r.length, 6);
    assert.equal(new Set(r.map((t) => t.id)).size, 6);
    assert.equal(r[0].id, 'q9');
    assert.deepEqual(recentPairs({ matches: [m('h', '2026-10-01T00:00:00Z', 't-hru', 't-hru', { hostIds: [me] })], pairs: [hru as never], sport: 'badminton', me }), []);
  });
  test('signed out: nothing', () => {
    assert.deepEqual(recentPairs({ matches, pairs, sport: 'badminton', me: undefined }), []);
  });
});

describe('DP8–DP12: pair type', () => {
  test('the field: Open by default, four options, hidden in singles', () => {
    assert.equal(PAIR_TYPE_FIELD.key, 'category');
    assert.equal(PAIR_TYPE_FIELD.default, 'open');
    assert.deepEqual(PAIR_TYPE_FIELD.options?.map((o) => o.label), ['Open', 'Men’s', 'Women’s', 'Mixed']);
    assert.deepEqual(PAIR_TYPE_FIELD.hideWhen, { key: 'playersPerSide', value: 1 });
  });
  test('every racket sport with doubles carries it, right after Players', () => {
    for (const meta of [TENNIS_META, BADMINTON_META, TABLETENNIS_META, SQUASH_META, PICKLEBALL_META, PADEL_META]) {
      const keys = (meta.formatFields ?? []).map((f) => f.key);
      assert.ok(PAIR_TYPE_SPORTS.includes(meta.id), meta.id);
      assert.equal(keys.indexOf('category'), keys.indexOf('playersPerSide') + 1, meta.id);
    }
  });
  test('Info lists it in doubles only; an old format reads Open', () => {
    const fields = BADMINTON_META.formatFields ?? [];
    assert.equal(matchRules(fields, { playersPerSide: 2 }).find((r) => r.key === 'category')?.value, 'Open');
    assert.equal(matchRules(fields, { playersPerSide: 2, category: 'mixed' }).find((r) => r.key === 'category')?.value, 'Mixed');
    assert.equal(matchRules(fields, { playersPerSide: 1, category: 'mixed' }).find((r) => r.key === 'category'), undefined);
    assert.equal(matchRules(PADEL_META.formatFields ?? [], {}).find((r) => r.key === 'category')?.value, 'Open');
    assert.equal(pairTypeOf({}), 'open');
    assert.equal(pairTypeOf({ category: 'junk' }), 'open');
    assert.equal(pairTypeOf({ category: 'women' }), 'women');
  });
  test('mixed becomes the Mixed career split; Men’s / Women’s stay Doubles; old reads unchanged', () => {
    const ctx = (format: Record<string, unknown>) => lineContext({ sport: 'badminton', matchId: 'm' } as never, { id: 'm', sport: 'badminton', format, state: {}, homeTeam: { id: 'h' }, awayTeam: { id: 'a' }, startsAt: '2026-10-01T00:00:00Z' } as never).discipline?.key;
    assert.equal(ctx({ playersPerSide: 2, category: 'mixed' }), 'mixed');
    assert.equal(ctx({ playersPerSide: 2, category: 'men' }), 'doubles');
    assert.equal(ctx({ playersPerSide: 2 }), 'doubles');
    assert.equal(ctx({ playersPerSide: 1 }), 'singles');
  });
  test('DP9: a singles match never keeps a pair type', () => {
    assert.deepEqual(settlePairType({ playersPerSide: 1, category: 'mixed' }, false), { playersPerSide: 1, category: 'open' });
    assert.deepEqual(settlePairType({ playersPerSide: 2, category: 'mixed' }, true), { playersPerSide: 2, category: 'mixed' });
    assert.deepEqual(settlePairType({ playersPerSide: 2, category: 'bogus' }, true), { playersPerSide: 2, category: 'open' });
    // a format without the key (other sports) is left alone
    assert.deepEqual(settlePairType({ overs: 20 }, false), { overs: 20 });
  });
  test('DP11: the tournament division gives the pair type when they agree', () => {
    const cats = [{ id: 'c1', gender: 'mixed' as const }, { id: 'c2', gender: 'boys' as const }, { id: 'c3', gender: 'girls' as const }, { id: 'c4' }];
    assert.equal(pairTypeFromDivisions([cats[0]]), 'mixed');
    assert.equal(pairTypeFromDivisions([cats[1], cats[3]]), 'men');
    assert.equal(pairTypeFromDivisions([cats[2]]), 'women');
    assert.equal(pairTypeFromDivisions(cats), undefined); // several genders: don't guess
    assert.equal(pairTypeFromDivisions([]), undefined);
    const entries = [{ team: { id: 'h' }, categoryId: 'c1' }, { team: { id: 'a' }, categoryId: 'c1' }, { team: { id: 'g' }, categoryId: 'c3' }];
    assert.equal(pairTypeFromDivisions(cats, entries, ['h', 'a']), 'mixed');
    assert.equal(pairTypeFromDivisions(cats, entries, ['h', null]), 'mixed');
    assert.equal(pairTypeFromDivisions(cats, entries, ['h', 'g']), undefined);
  });
});

describe('the screen (source checks)', () => {
  const src = readFileSync(new URL('../src/screens/ScheduleMatchScreen.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../src/components/EntrantPicker.tsx', import.meta.url), 'utf8');
  test('DP1/DP2: singles and doubles get their own lists', () => {
    assert.match(src, /sidesForStructure\(pickTeams, 'single'\)/);
    assert.match(src, /sidesForStructure\(pickTeams, 'pair'\)/);
    assert.match(src, /noun="pair"[^\n]*teams=\{pairTeams\}/);
    assert.match(src, /noun="player"[^\n]*teams=\{singleTeams\}/);
    assert.doesNotMatch(src, /noun="(pair|player)"[^\n]*teams=\{pickTeams\}/);
  });
  test('DP4/DP5: people in doubles start a pair; Me + in doubles', () => {
    assert.match(src, /noun="pair"[^\n]*people=\{pairPeople\}/);
    assert.match(src, /👤 Me \+/);
    assert.match(src, /setSeed\(/);
    assert.match(picker, /initial\?: EntrantPerson/);
  });
  test('DP6: recent pairs shown before typing', () => {
    assert.match(src, /recentPairs\(/);
    assert.match(src, /recent=\{/);
  });
  test('DP9/DP11: the format is settled on save; the division gives the type', () => {
    assert.match(src, /settlePairType\(/);
    assert.match(src, /pairTypeFromDivisions\(/);
  });
  test('DP13: names come from the same masked sources', () => {
    assert.doesNotMatch(src, /full_name|fullNameRaw/);
  });
});
