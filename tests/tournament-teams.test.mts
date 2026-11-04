/** One tournament team list (docs/security/breaks/tournament-teams.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tournamentTeamIds } from '../src/core/tournamentTeams.ts';

const m = (h: string, a: string) => ({ homeTeam: { id: h }, awayTeam: { id: a } });

test('registered first, then teams only in fixtures; no repeats (TT1)', () => {
  assert.deepEqual(tournamentTeamIds([{ id: 'r1' }, { id: 'a' }], [m('a', 'b'), m('b', 'c')]), ['r1', 'a', 'b', 'c']);
  assert.deepEqual(tournamentTeamIds([], [m('a', 'b'), m('c', 'd')]).length, 4, 'the demo case: 4 teams, none registered');
});

test('TT2: junk rows add nothing', () => {
  assert.deepEqual(tournamentTeamIds([{ id: '' } as any, null as any], [{ homeTeam: null, awayTeam: { id: 'x' } } as any, {} as any]), ['x']);
});

test('wiring: checklist, Manage row and Teams tab share the list (TT3)', () => {
  const s = readFileSync(join(import.meta.dirname, '..', 'src/screens/TournamentProfileScreen.tsx'), 'utf8');
  assert.match(s, /setupChecklist\(tournament, allTeamIds\.length,/);
  assert.match(s, /only in fixtures/);
  assert.match(s, /const tourneyTeams = allTeamIds\.map/);
});
