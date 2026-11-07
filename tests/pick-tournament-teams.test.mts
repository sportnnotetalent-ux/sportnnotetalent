/** Pick tournament teams (docs/security/breaks/pick-tournament-teams.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchPickTeams, newTeamProblem, sameNameTeam } from '../src/core/teamPick.ts';

const T = (id: string, name: string, o: Record<string, unknown> = {}) => ({ id, name, shortName: name.slice(0, 3), sport: 'football', ...o }) as any;
const teams = [
  T('1', 'Lions FC'), T('2', 'Sea Lions'), T('3', 'Lions', { sport: 'cricket' }), T('4', 'Lions 2', { adhoc: true }),
  T('5', 'A1', { slotTournamentId: 't' }), T('6', 'Tigers'), T('7', 'lions united'),
];

test('PK2/PK3: real teams of this sport, starts-with first, picked hidden', () => {
  assert.deepEqual(searchPickTeams(teams, 'lio', 'football', []).map((t) => t.id), ['1', '7', '2']);
  assert.deepEqual(searchPickTeams(teams, 'lio', 'football', ['1']).map((t) => t.id), ['7', '2']);
  assert.deepEqual(searchPickTeams(teams, 'l', 'football', []), [], 'two letters at least');
  assert.deepEqual(searchPickTeams(teams, 'a1', 'football', []), [], 'slots never');
});

test('PK4: a new team named like an existing one is caught', () => {
  assert.equal(sameNameTeam(teams, ' lions fc ', 'football')?.id, '1');
  assert.equal(sameNameTeam(teams, 'Lions', 'football'), undefined, 'other sport / one-offs ignored');
});

test('PK5/PK6: a new team needs a name and a valid captain mobile', () => {
  assert.equal(newTeamProblem('', 'Ravi', '9876543210'), 'Type the team’s name.');
  assert.equal(newTeamProblem('Falcons', '', '9876543210'), 'Type the captain’s name.');
  assert.equal(newTeamProblem('Falcons', 'Ravi', ''), 'Add the captain’s mobile — they get the invite to add players.');
  assert.equal(newTeamProblem('Falcons', 'Ravi', '12'), 'That mobile number doesn’t look right.');
  assert.equal(newTeamProblem('Falcons', 'Ravi', '+91 98765 43210'), null);
});

test('PK1/PK8: Quick tournament picks teams; Fill slot invites a captain', () => {
  const quick = readFileSync(new URL('../src/screens/QuickTournamentScreen.tsx', import.meta.url), 'utf8');
  assert.match(quick, /TournamentTeamPicker/);
  const teamsScreen = readFileSync(new URL('../src/screens/TournamentTeamsScreen.tsx', import.meta.url), 'utf8');
  // the fill panel is shared with the fixture map (fixture-map.md)
  assert.match(teamsScreen, /<SlotFillPanel/);
  assert.match(readFileSync(new URL('../src/components/SlotFillPanel.tsx', import.meta.url), 'utf8'), /inviteCaptain\(/);
});
