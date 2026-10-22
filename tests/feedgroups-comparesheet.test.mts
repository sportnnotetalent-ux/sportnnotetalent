/**
 * Deep wave — the shared pure helpers behind the grouped commentary
 * (src/sports/feedGroups.ts) and the broadcast match-stats sheet
 * (src/sports/compareSheet.ts): grouping in game order, newest first, the
 * scope / tag filters, and rows that never show a false 0 (null = no row).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  andList, feedScopes, feedTags, filterFeed, groupLines, newestFirst, nth, plural, scoreText, type FeedGroup,
} from '../src/sports/feedGroups.ts';
import {
  clockText, countRow, decRow, madeRow, pctText, pickCategory, rateRow, rowLeader, rowShares, section, shareRow, sheet, sheetCategories, textRow, timeRow,
} from '../src/sports/compareSheet.ts';

describe('feedGroups', () => {
  const items = [
    { p: 1, id: 'a', key: false }, { p: 1, id: 'b', key: true }, { p: 2, id: 'c', key: false }, { p: 2, id: 'd', key: true },
  ];
  const groups = groupLines(items, (x) => String(x.p), (first, xs) => ({
    key: `p${first.p}`, title: `P${first.p}`, scope: first.p,
    lines: xs.map((x) => ({ id: x.id, text: x.id, ...(x.key ? { key: true, tags: ['goal'] } : { tags: ['shot'] }) })),
  }));
  test('groups in the order they started, lines in order', () => {
    assert.deepEqual(groups.map((g) => g.key), ['p1', 'p2']);
    assert.deepEqual(groups[0].lines.map((l) => l.id), ['a', 'b']);
  });
  test('newest first: last group on top, last line first', () => {
    const nf = newestFirst(groups);
    assert.deepEqual(nf.map((g) => g.key), ['p2', 'p1']);
    assert.deepEqual(nf[0].lines.map((l) => l.id), ['d', 'c']);
    assert.deepEqual(groups[0].lines.map((l) => l.id), ['a', 'b'], 'input untouched');
  });
  test('a group key that comes back later starts a new group', () => {
    const g = groupLines([1, 1, 2, 1], (x) => String(x), (f, xs) => ({ key: `${f}-${xs.length}`, title: '', lines: [] }));
    assert.deepEqual(g.map((x) => x.key), ['1-2', '2-1', '1-1']);
  });
  test('a maker may drop a group', () => {
    assert.equal(groupLines([1, 2], String, (f) => (f === 1 ? null : { key: 'x', title: '', lines: [] })).length, 1);
  });
  test('filters: scope, tag, key moments; empty groups drop out', () => {
    assert.deepEqual(filterFeed(groups, { scope: 2 }).map((g) => g.key), ['p2']);
    assert.deepEqual(filterFeed(groups, { tag: 'key' }).flatMap((g) => g.lines.map((l) => l.id)), ['b', 'd']);
    assert.deepEqual(filterFeed(groups, { tag: 'goal', scope: 1 }).flatMap((g) => g.lines.map((l) => l.id)), ['b']);
    assert.deepEqual(filterFeed(groups, { tag: 'pen' }), []);
    assert.equal(filterFeed(groups, { tag: 'all' }).length, 2);
  });
  test('scope and tag chips only for what the feed has', () => {
    assert.deepEqual(feedScopes(newestFirst(groups), (p) => `P${p}`), [{ value: 1, label: 'P1' }, { value: 2, label: 'P2' }]);
    const tags = feedTags(groups, [{ key: 'key', label: 'Key' }, { key: 'goal', label: 'Goals' }, { key: 'pen', label: 'Penalties' }]);
    assert.deepEqual(tags.map((t) => t.key), ['key', 'goal']);
  });
  test('words', () => {
    assert.equal(scoreText(2, 1), '2–1');
    assert.deepEqual([nth(1), nth(2), nth(3), nth(4), nth(11), nth(12), nth(13), nth(21), nth(22)], ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
    assert.deepEqual([plural(1, 'run'), plural(3, 'run'), plural(2, 'entry', 'entries')], ['1 run', '3 runs', '2 entries']);
    assert.deepEqual([andList([]), andList(['A']), andList(['A', 'B']), andList(['A', '', 'B', 'C'])], ['', 'A', 'A and B', 'A, B and C']);
  });
});

describe('compareSheet', () => {
  test('count / made / rate / share / time / dec / text rows', () => {
    assert.deepEqual(countRow('x', 'X', 3, 1), { key: 'x', label: 'X', home: '3', away: '1', h: 3, a: 1 });
    const m = madeRow('pp', 'Power plays', 1, 4, 0, 2)!;
    assert.deepEqual([m.home, m.away, m.h, m.a], ['1/4 (25%)', '0/2 (0%)', 0.25, 0]);
    assert.equal(madeRow('pp', 'PP', 0, 0, 0, 0), null, 'nothing attempted = no row');
    assert.equal(madeRow('pp', 'PP', 1, 3, 0, 0)!.away, '0/0');
    assert.equal(madeRow('c', 'C', 2, 3, 1, 1, { noPct: true })!.home, '2/3');
    assert.equal(rateRow('r', 'R', 1, 0, 0, 0), null);
    assert.deepEqual([rateRow('r', 'R', 1, 3, 2, 4, { dp: 1 })!.home, rateRow('r', 'R', 1, 3, 2, 4)!.away], ['33.3%', '50%']);
    assert.equal(shareRow('poss', 'Possession', 0, 0), null);
    assert.deepEqual([shareRow('poss', 'Possession', 90, 30)!.home, shareRow('poss', 'Possession', 90, 30)!.away], ['75%', '25%']);
    assert.equal(timeRow('t', 'T', 0, 0), null);
    assert.equal(timeRow('t', 'T', 0, 0, { keepZero: true })!.home, '0:00');
    assert.deepEqual([clockText(245), clockText(-3), pctText(1, 0)], ['4:05', '0:00', '–']);
    assert.equal(decRow('d', 'D', undefined, undefined), null);
    assert.deepEqual([decRow('d', 'D', 5.44, undefined)!.home, decRow('d', 'D', 5.44, undefined)!.away], ['5.4', '–']);
    assert.equal(textRow('t', 'T', 'Own 25', 'Opp 40').plain, true);
  });
  test('leader respects lower-is-better and plain rows; bar shares', () => {
    assert.equal(rowLeader(countRow('a', 'A', 3, 1)), 'home');
    assert.equal(rowLeader(countRow('p', 'P', 3, 1, { lowerBetter: true })), 'away');
    assert.equal(rowLeader(countRow('p', 'P', 2, 2)), null);
    assert.equal(rowLeader(countRow('t', 'T', 3, 1, { plain: true })), null);
    assert.deepEqual(rowShares({ h: 0, a: 0 }), { home: 0.5, away: 0.5 });
    assert.deepEqual(rowShares({ h: 3, a: 1 }), { home: 0.75, away: 0.25 });
  });
  test('empty rows and sections drop out; categories and picking', () => {
    const sh = sheet([
      section('a', 'A', [countRow('x', 'X', 1, 2), null, false, 0]),
      section('b', 'B', [null, undefined]),
      section('c', 'C', [countRow('y', 'Y', 0, 0)], 'note'),
      false,
    ]);
    assert.deepEqual(sh.sections.map((s) => s.key), ['a', 'c']);
    assert.equal(sh.sections[1].note, 'note');
    assert.deepEqual(sheetCategories(sh).map((c) => c.key), ['all', 'a', 'c']);
    assert.deepEqual(pickCategory(sh, 'c').sections.map((s) => s.key), ['c']);
    assert.equal(pickCategory(sh, 'zzz'), sh);
    assert.deepEqual(sheetCategories(sheet([section('a', 'A', [countRow('x', 'X', 1, 2)])])), [], 'one section: no chips');
  });
});

/** compile-time: a FeedGroup's optional fields */
const _g: FeedGroup = { key: 'k', title: 't', lines: [{ id: '1', text: 'x', side: 'home', score: '1–0', when: '1:00', icon: '·' }] };
void _g;
