/** Live scoring, Stitch picks (docs/security/breaks/stitch-live-scoring.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../src/core/contrast.ts';
import { theme } from '../src/core/theme.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('LS1/LS3: the green panel reads in sunlight', () => {
  const bg = theme.colors.primaryDark;
  for (const fg of [theme.colors.heroText, theme.colors.lime, '#FFFFFF']) assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrastRatio(theme.colors.onLime, theme.colors.lime) >= 4.5);
});

test('LS1/LS2/LS6: the score bar is the green panel; the clock sits in a light pill; names via SideName', () => {
  const s = read('src/components/LiveScoreBar.tsx');
  assert.match(s, /backgroundColor: theme\.colors\.primaryDark/);
  assert.match(s, /clockPill/);
  assert.match(s, /<SideName/);
  assert.match(s, /accessibilityRole="summary"/, 'LS5: the summary stays');
});

test('LS4: the undo bar names the last step and Undo is its own button', () => {
  const s = read('src/screens/LiveScoringScreen.tsx');
  assert.match(s, /st\.undoLast/);
  assert.match(s, /st\.undoPill/);
  assert.match(s, /accessibilityLabel=\{`Undo\$\{undoWhat/);
});

import { footballFeed } from '../src/sports/football/feed.ts';

test('LS7/LS8: feed tags come only from what the scorer recorded', () => {
  const names = { home: 'Red', away: 'Blue' };
  const base = { half: 1, halfMinutes: 45, events: [] as unknown[], stats: [] } as never;
  const st = (events: unknown[]) => ({ ...(base as object), events }) as never;
  const goal = (extra: object) => ({ id: 1, type: 'goal', side: 'home', minute: 10, half: 1, playerName: 'Rohan', ...extra });
  const tag = (extra: object) => footballFeed(st([goal(extra)]), names)[0]?.detail;
  assert.equal(tag({ goalType: 'open', bodyPart: 'right' }), 'RIGHT FOOT');
  assert.equal(tag({ goalType: 'header' }), 'HEADER');
  assert.equal(tag({ goalType: 'penalty' }), 'PENALTY');
  assert.equal(tag({ goalType: 'open' }), undefined, 'nothing recorded, no tag');
  const card = footballFeed(st([{ id: 2, type: 'yellow', side: 'away', minute: 54, half: 1, playerName: 'David', reason: 'spa' }]), names)[0];
  assert.equal(card.detail, 'STOPPING AN ATTACK');
  for (const t of [tag({ goalType: 'freekick' }), card.detail]) assert.ok(!t || t.length <= 18, t);
  const s = read('src/sports/invasion/Commentary.tsx');
  assert.match(s, /it\.detail \? <Text style=\{st\.detail\}/);
});

const SIDE_SPORTS = ['hockey', 'handball', 'ice_hockey', 'rugby', 'rugby_league', 'american_football'];

test('LS9/LS10: the main action is the shared big team-coloured button', () => {
  const m = read('src/sports/MainAction.tsx');
  assert.match(m, /readableOn\(/);
  assert.match(m, /minHeight: 64/);
  for (const sp of SIDE_SPORTS) {
    const s = read(`src/sports/${sp}/index.tsx`);
    assert.match(s, /<MainAction /, sp);
    assert.doesNotMatch(s, /<Button variant="primary" label="(🏑 Goal|🥅 Goal|🚨 Goal|🏉 Try|🏈 Touchdown)" color=\{color\(sd\)\} (disabled|onPress)/, sp);
  }
  assert.match(read('src/sports/football/index.tsx'), /<MainAction team=\{homeName\}/);
});

test('LS11: "End period →" is lime only while the period runs, and still asks first', () => {
  for (const sp of [...SIDE_SPORTS, 'netball']) {
    const s = read(`src/sports/${sp}/index.tsx`);
    assert.match(s, /label=\{`End \$\{periodName\(s, s\.period\)\} →`\} variant=\{periodStarted\(s\) && running\(s\) \? 'primary' : 'ghost'\}/, sp);
    assert.match(s, /'⏸ Pause clock'/, sp);
    assert.match(s, /confirmMatchAction\('endPeriod'/, sp);
  }
});
