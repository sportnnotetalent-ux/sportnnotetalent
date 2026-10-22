/**
 * Deep wave (invasion-goal family) — the shared commentary model
 * (src/sports/invasion/feed.ts) and the match-centre categories
 * (src/sports/invasion/centre.ts), sport-agnostic.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { feedSections, feedCounts, groupByScorer, scoreText, SHOOTOUT_PERIOD, emptyFacts, type FeedItem } from '../src/sports/invasion/feed.ts';
import { centreComparison, visibleCategories, centreKeys, pct, putIf, type CentreCategory } from '../src/sports/invasion/centre.ts';
import type { BoxData } from '../src/sports/boxScore.ts';
import type { SportStatSchema } from '../src/sports/statSchema.ts';

const item = (id: string, period: number, t: number, home: number, away: number, major = false, extra: Partial<FeedItem> = {}): FeedItem =>
  ({ id, period, t, stamp: `${t}'`, icon: '•', text: id, score: { home, away }, ...(major ? { major: true } : {}), ...extra });

describe('deep wave · commentary sections', () => {
  const items: FeedItem[] = [
    item('a', 1, 1, 0, 0), item('g1', 1, 2, 1, 0, true), item('b', 1, 3, 1, 0),
    item('c', 2, 4, 1, 0), item('g2', 2, 5, 1, 1, true),
    item('p1', SHOOTOUT_PERIOD, 1e6, 1, 1, true, { scoreText: '1–0' }), item('p2', SHOOTOUT_PERIOD, 1e6 + 1, 1, 1, true, { scoreText: '1–1' }),
  ];
  const label = (p: number) => (p === SHOOTOUT_PERIOD ? 'Shoot-out' : `P${p}`);
  test('newest unit first, newest item first; score at the end of each; goals in the unit', () => {
    const s = feedSections(items, label);
    assert.deepEqual(s.map((x) => x.label), ['Shoot-out', 'P2', 'P1']);
    assert.deepEqual(s[1].items.map((i) => i.id), ['g2', 'c']);
    assert.deepEqual([s[1].score, s[1].goals], [{ home: 1, away: 1 }, { home: 0, away: 1 }]);
    assert.deepEqual([s[2].score, s[2].goals], [{ home: 1, away: 0 }, { home: 1, away: 0 }]);
    assert.equal(s[0].scoreText, '1–1', 'the shoot-out section shows its own tally');
  });
  test('key events only; an empty unit in play still heads the feed', () => {
    const s = feedSections(items, label, { majorOnly: true, periods: [1, 2, 3] });
    assert.deepEqual(s.map((x) => [x.label, x.items.map((i) => i.id)]), [['Shoot-out', ['p2', 'p1']], ['P3', []], ['P2', ['g2']], ['P1', ['g1']]]);
    assert.deepEqual(s[1].score, { home: 1, away: 1 }, 'P3 starts from the score so far');
    assert.deepEqual(feedCounts(items), { all: 7, major: 4 });
  });
  test('facts helpers', () => {
    assert.deepEqual(groupByScorer([
      { side: 'home', who: 'A', stamp: "3'" }, { side: 'away', who: 'B', stamp: "9'", tag: 'pen' }, { side: 'home', who: 'A', stamp: "70'" }, { side: 'home', who: 'C', stamp: "80'", tag: 'OG' },
    ]), { home: ["A 3', 70'", "C 80' (OG)"], away: ["B 9' (pen)"] });
    assert.equal(scoreText({ home: 2, away: 1 }), '2–1');
    assert.deepEqual(emptyFacts(), { home: [], away: [], notes: [] });
  });
});

describe('deep wave · match-centre categories', () => {
  const schema = {
    sport: 'demo',
    stats: [
      { key: 'shots', label: 'Shots' },
      { key: 'goals', label: 'Goals' },
      { key: 'conv', label: 'Conversion', source: 'derived', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0 } },
      { key: 'poss', label: 'Possession', source: 'team', format: { unit: 'percent' } },
      { key: 'big', label: 'Big chances', source: 'team' },
      { key: 'cards', label: 'Cards' },
    ],
    leaders: ['goals'], headline: ['goals'], awards: [],
  } as unknown as SportStatSchema<string>;
  const cats: CentreCategory[] = [
    { id: 'top', label: 'Top', rows: ['poss', 'shots', 'conv'] },
    { id: 'att', label: 'Attack', rows: ['big', 'goals'] },
    { id: 'disc', label: 'Discipline', rows: ['cards'] },
  ];
  const data: BoxData = {
    home: { rows: [{ name: 'A', stats: { shots: 0, goals: 0 } }], teamStats: { poss: 55 } },
    away: { rows: [{ name: 'B', stats: { shots: 0, goals: 0 } }], teamStats: { poss: 45 } },
    untracked: ['big'],
  };
  test('a rate neither side has ("–" v "–") drops; team figures and sums show', () => {
    const top = centreComparison(schema, data, 'all', cats[0]);
    assert.deepEqual(top.rows.map((r) => [r.key, r.home, r.away]), [['poss', '55%', '45%'], ['shots', '0', '0']]);
  });
  test('untracked rows are listed, a category with nothing at all hides', () => {
    const att = centreComparison(schema, data, 'all', cats[1]);
    assert.deepEqual(att.untracked, ['Big chances']);
    assert.deepEqual(visibleCategories(schema, data, 'all', cats).map((c) => c.id), ['top', 'att']);
    assert.deepEqual(centreKeys(cats), ['poss', 'shots', 'conv', 'big', 'goals', 'cards']);
  });
  test('pct / putIf: no figure for a 0 denominator', () => {
    assert.equal(pct(1, 3), 33);
    assert.equal(pct(0, 0), undefined);
    const o: Record<string, number> = {};
    putIf(o, 'a', undefined); putIf(o, 'b', 0);
    assert.deepEqual(o, { b: 0 });
  });
});
