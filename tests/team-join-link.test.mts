/** Team join link — app side (docs/security/breaks/team-join-link.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('TJ3: the join screen shows only the team name and sport — no squad, no contacts', () => {
  const s = read('src/screens/TeamJoinScreen.tsx');
  assert.doesNotMatch(s, /getRoster|getTeamSummary|phone|email/i);
  assert.match(s, /previewTeamJoin\(token\)/);
});

test('TJ4: a teen is told to ask a parent; a parent can ask for each child', () => {
  const s = read('src/screens/TeamJoinScreen.tsx');
  assert.match(s, /w\.me && !w\.adult \?/);
  assert.match(s, /getGuardianChildren\(\)/);
});

test('TJ2: the link card is for the team\'s managers only', () => {
  assert.match(read('src/screens/SquadScreen.tsx'), /\{canManage && <TeamJoinCard /);
});

test('the tj/ link opens the join screen', () => {
  const nav = read('src/navigation/RootNavigator.tsx');
  assert.match(nav, /TeamJoin: 'tj\/:token'/);
  assert.match(nav, /name="TeamJoin"/);
  assert.match(nav, /'TeamJoin'/);
});
