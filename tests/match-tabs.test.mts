/**
 * Match tabs (2026-10-22, the founder's decision) — every head-to-head match
 * shows Info · Commentary · Stats · Summary · Scoring, one purpose per tab and
 * no piece of information in two of them. Source guards (the screen and the
 * plugins are React Native, so they are read, not rendered):
 *  - every head-to-head sport fills `matchTabs` (at least Commentary) and no
 *    longer composes the old Score tab (LiveExtras / liveViews);
 *  - "Key moments" is a filter inside Commentary, never its own view;
 *  - the screen's Summary holds no stats tables, Scoring / Summary no match
 *    identity card, and old tab names map to the new ones.
 * Contract: docs/sport-depth/deep-wave/match-tabs.md.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Head-to-head sports scored on LiveScoringScreen (their own index.tsx). */
const OWN_PLUGIN = [
  'football', 'cricket', 'basketball', 'netball', 'volleyball', 'kabaddi', 'hockey', 'handball', 'ice_hockey',
  'rugby', 'rugby_league', 'american_football', 'baseball', 'tennis', 'badminton', 'padel', 'chess', 'carrom', 'golf',
];

describe('match tabs — the plugins', () => {
  for (const sp of OWN_PLUGIN) {
    test(`${sp}: fills matchTabs, no old Score-tab composition`, () => {
      const src = read(`src/sports/${sp}/index.tsx`);
      assert.match(src, /matchTabs: \{[^}]*Commentary: /, 'matchTabs with a Commentary slot');
      assert.ok(!/^\s+LiveExtras[,:]/m.test(src), 'no LiveExtras on the plugin');
      assert.ok(!/liveViews:|lineupsInExtras:|hideScoreboard: true/.test(src), 'no liveViews / lineupsInExtras / hidden header');
      assert.ok(!/label: 'Key moments' \}/.test(src), 'Key moments is a feed filter, not a view');
    });
  }
  test('table tennis / squash / pickleball (rallyCore): Commentary + Stats', () => {
    const src = read('src/sports/rallyCore.tsx');
    assert.match(src, /matchTabs: \{ Commentary, Stats \}/);
    assert.ok(!/^\s+LiveExtras,/m.test(src));
  });
  test('Stats never repeats the commentary; Commentary never repeats the box score', () => {
    for (const sp of OWN_PLUGIN) {
      const src = read(`src/sports/${sp}/index.tsx`);
      const slot = (name: string) => {
        const m = new RegExp(`matchTabs: \\{[^}]*${name}: (\\w+)`).exec(src);
        if (!m) return '';
        const at = src.search(new RegExp(`(const|function) ${m[1]}\\b`));
        assert.ok(at >= 0, `${sp}: ${m[1]} defined`);
        // the component body: up to the next top-level declaration
        const rest = src.slice(at + 1);
        const end = rest.search(/\n(const|function|export|type|\/\*\*) /);
        return rest.slice(0, end < 0 ? undefined : end);
      };
      const commentary = slot('Commentary');
      const stats = slot('Stats');
      assert.ok(!/MatchBoxScore|MatchCentre|StatSheetView|CategoryStatsPanel/.test(commentary), `${sp}: no stats in Commentary`);
      assert.ok(!/GroupedFeed|PlayFeed|FeedView|RacketCommentary|TennisCommentary|CommentaryFeed|<Commentary /.test(stats), `${sp}: no feed in Stats`);
    }
  });
  test('the invasion sports show their match facts with the result, not in the feed', () => {
    for (const sp of ['football', 'hockey', 'handball']) {
      const src = read(`src/sports/${sp}/index.tsx`);
      assert.ok(!/<Commentary [^>]*facts=/.test(src), `${sp}: no facts on the Commentary`);
      assert.match(src, /SummaryExtras: \w+/, `${sp}: facts on Summary`);
      assert.match(src, /resultFacts\(/, `${sp}: possession (a stat) left out of the facts`);
    }
  });
});

describe('match tabs — the screen', () => {
  const screen = read('src/screens/LiveScoringScreen.tsx');
  const section = (key: string) => {
    const at = screen.indexOf(`{activeTab === '${key}' && (`);
    assert.ok(at >= 0, `${key} section`);
    const next = screen.slice(at + 10).search(/\{activeTab === '\w+' && \(|\{noteNode\}/);
    return screen.slice(at, at + 10 + next);
  };

  test('five tabs in order: Info · Commentary · Stats · Summary · Scoring', () => {
    const tabs = screen.slice(screen.indexOf('const TABS'), screen.indexOf('];', screen.indexOf('const TABS')));
    const order = ['info', 'commentary', 'stats', 'summary', 'scoring'].map((k) => tabs.indexOf(`key: '${k}'`));
    assert.ok(order.every((i) => i >= 0), 'all five declared');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order');
    assert.ok(!/key: 'score'/.test(tabs), 'no Score tab');
  });

  test('Summary: the result and the people only', () => {
    const s = section('summary');
    for (const banned of ['MatchBoxScore', 'GameFlowCard', 'MatchHeader', 'officialsLine']) assert.ok(!s.includes(banned), `Summary has no ${banned}`);
    assert.ok(s.includes('<MatchSummary') && s.includes('AwardPickerSheet'));
  });

  test('Stats: the sport\'s stats + Game flow; Commentary: the feed + situation', () => {
    const st = section('stats');
    assert.ok(st.includes('tabSlots.Stats') && st.includes('GameFlowCard'));
    const c = section('commentary');
    assert.ok(c.includes('serveCourtNode') && c.includes('tabSlots.Situation') && c.includes('tabSlots.Commentary'));
    assert.ok(!c.includes('MatchBoxScore') && !c.includes('GameFlowCard'));
  });

  test('match identity and the result line each live on one tab', () => {
    assert.ok(!section('scoring').includes('MatchHeader'), 'no MatchHeader on Scoring');
    assert.ok(section('info').includes('MatchHeader'), 'MatchHeader on Info');
    assert.ok(!section('scoring').includes('{retiredBanner}') && !section('info').includes('retiredBanner'), 'result line only on Summary');
    assert.ok(section('info').includes('{lineupsNode}'), 'lineups on Info');
  });

  test('old tab names still open the right tab', () => {
    const m = /const LEGACY_TABS[^{]*\{([^}]*)\}/.exec(screen);
    assert.ok(m, 'LEGACY_TABS');
    const map = Object.fromEntries([...m[1].matchAll(/(\w+): '(\w+)'/g)].map((x) => [x[1], x[2]]));
    assert.equal(map.score, 'stats');
    assert.equal(map.scorecard, 'stats');
    assert.equal(map.lineups, 'info');
    assert.equal(map.timeline, 'commentary');
  });
});
