/** App issues found while recording the marketing demo
 *  (docs/security/breaks/demo-recording-bugs.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inRosterOrder } from '../src/core/teamPage.ts';
import { ensureContrast, contrastRatio } from '../src/core/contrast.ts';
import { slotsInOrder } from '../src/core/slots.ts';
import { nameColumnWidth } from '../src/components/lineScoreLayout.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('DR1: a squad comes back in the team\'s own order (a pair keeps "Meera / Arjun")', () => {
  const players = [{ id: 'arjun', fullName: 'Arjun' }, { id: 'meera', fullName: 'Meera' }, { id: 'z', fullName: 'Zed' }];
  assert.deepEqual(inRosterOrder(players, ['meera', 'arjun', 'z']).map((p) => p.id), ['meera', 'arjun', 'z']);
  assert.deepEqual(inRosterOrder(players, ['meera']).map((p) => p.id), ['meera', 'arjun', 'z'], 'anyone not in the list keeps their place after');
  assert.deepEqual(inRosterOrder(players, ['gone', 'arjun']).map((p) => p.id), ['arjun', 'meera', 'z'], 'an id that can\'t be read is skipped, nobody lost');
});

test('DR1: getRoster uses the team order (live and demo)', () => {
  const r = read('src/data/repos.ts');
  const fn = r.slice(r.indexOf('export async function getRoster('), r.indexOf('export async function getTeamRouteRow'));
  assert.ok((fn.match(/inRosterOrder\(/g) ?? []).length >= 3, 'demo by id, demo by name, and live');
});

test('DR2: team colours used as text are readable on the light card; dark colours unchanged', () => {
  for (const c of ['#FFD60A', '#FFB454', '#C6EE3E', '#B98AFF', '#4DA3FF']) {
    assert.ok(contrastRatio(ensureContrast(c, '#F3F0E8'), '#F3F0E8') >= 4.5, c);
  }
  assert.equal(ensureContrast('#1D56C9', '#F3F0E8'), '#1D56C9', 'already readable: untouched');
  for (const f of ['src/components/LineScoreboard.tsx', 'src/sports/CommentaryFeed.tsx', 'src/sports/StatSheetView.tsx', 'src/sports/CategoryStatsPanel.tsx']) {
    assert.match(read(f), /ensureContrast\(/, f);
  }
});

test('DR2: the losing side dims its numbers, not its name', () => {
  const s = read('src/components/LineScoreboard.tsx');
  assert.doesNotMatch(s, /style=\{\[st\.row, lost && st\.rowLost\]\}/);
});

test('DR3: the undo button names the sides as the screen shows them, not by code', () => {
  const s = read('src/screens/LiveScoringScreen.tsx');
  const i = s.indexOf('const undoWhat = useMemo(');
  const block = s.slice(i, i + 700);
  assert.match(block, /home: homeShown, away: awayShown/);
  assert.doesNotMatch(block, /home: homeName, away: awayName/);
});

test('DR4: filling a slot leads with "a team already on SportnNote", as rows that say where they go', () => {
  // the fill panel is shared with the fixture map (fixture-map.md)
  assert.match(read('src/screens/TournamentTeamsScreen.tsx'), /<SlotFillPanel/);
  const s = read('src/components/SlotFillPanel.tsx');
  const box = s.slice(s.indexOf('<View style={st.box}>'));
  assert.ok(box.indexOf('Or a team already on SportnNote') < box.indexOf('A new team: its name'), 'existing teams first');
  assert.match(box, /<ListRow/);
  assert.doesNotMatch(box, /<SelectChip key=\{t\.id\}/);
});

test('DR5: slots read Team 1, Team 2 … Team 10; real teams keep their places', () => {
  const e = (name: string, slot = true) => ({ team: { id: name, name }, slot });
  const out = slotsInOrder([e('Rovers', false), e('Team 3'), e('Team 10'), e('Eagles', false), e('Team 1'), e('Team 2')], (x) => x.slot);
  assert.deepEqual(out.map((x) => x.team.name), ['Rovers', 'Team 1', 'Team 2', 'Eagles', 'Team 3', 'Team 10']);
});

test('DR6: the name column grows into free room, never squeezes the scores', () => {
  assert.equal(nameColumnWidth(0, 2, false), 120, 'before measuring: the old width');
  assert.ok(nameColumnWidth(330, 2, false) > 150, 'two halves on a phone: room for "Demo Panthers"');
  assert.equal(nameColumnWidth(330, 5, false), 120, 'five sets: no room to spare, stays at the minimum');
  assert.ok(nameColumnWidth(900, 2, false) <= 220, 'capped on wide screens');
  const s = read('src/components/LineScoreboard.tsx');
  assert.match(s, /nameColumnWidth\(/);
});

test('DR2 sweep: team colours used as text go through ensureContrast on the result and team screens too', () => {
  const files: Record<string, number> = {
    'src/components/MatchSummary.tsx': 5, 'src/screens/LiveScoringScreen.tsx': 2, 'src/sports/cricket/index.tsx': 7,
    'src/screens/TeamProfileScreen.tsx': 2, 'src/screens/SquadScreen.tsx': 1,
  };
  for (const [f, n] of Object.entries(files)) assert.ok((read(f).match(/ensureContrast\(/g) ?? []).length >= n, f);
  assert.match(read('src/components/LineScoreboard.tsx'), /numberOfLines=\{2\}>\{r\.name\}/, 'DR6: names wrap instead of being cut');
});
