/** Match-day roles in the app (docs/security/breaks/match-roles.md). The
 *  database side is in db-match-roles.test.mts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keeperLabel, cleanSquadRoles, pickRole } from '../src/core/matchRoles.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('MR6: keeper roles only where the sport has one, in its own words', () => {
  assert.equal(keeperLabel('cricket'), 'Wicket-keeper');
  assert.equal(keeperLabel('football'), 'Goalkeeper');
  assert.equal(keeperLabel('ice_hockey'), 'Goalie');
  for (const s of ['basketball', 'kabaddi', 'volleyball', 'badminton', 'tennis', 'chess'] as const) assert.equal(keeperLabel(s), null, s);
});

test('MR5: roles whose player left the squad are dropped; tapping again clears', () => {
  assert.deepEqual(cleanSquadRoles({ starters: ['a'], subs: ['b'], captainId: 'b', keeperId: 'a' }), { starters: ['a'], subs: ['b'], captainId: 'b', keeperId: 'a' });
  assert.deepEqual(cleanSquadRoles({ starters: ['a'], subs: [], captainId: 'gone', keeperId: 'gone' }), { starters: ['a'], subs: [] });
  assert.equal(pickRole(undefined, 'a'), 'a');
  assert.equal(pickRole('a', 'a'), undefined);
  assert.equal(pickRole('a', 'b'), 'b');
});

test('MR3: squads still read and save before the SQL is run (no captain_id column yet)', () => {
  const r = read('src/data/repos.ts');
  assert.match(r, /const noCaptainCol = /);
  assert.match(r, /if \(!noCaptainCol\(first\.error\)\) return/);
  assert.match(r, /if \(noCaptainCol\(error\)\) await supabase\.from\('match_squads'\)\.upsert\(row\)/);
  assert.match(r, /const sq = cleanSquadRoles\(squad\);/);
});

test('MR4: the Matchday Squad screen keeps the keeper (and captain) when it saves', () => {
  const s = read('src/screens/MatchSquadScreen.tsx');
  assert.match(s, /await setMatchSquad\(matchId, side, \{ starters, subs, keeperId, captainId \}\)/);
  assert.match(s, /setKeeperId\(sq\.keeperId\)/);
  assert.match(s, /<MatchRolesPicker/);
});

test('C6: roles at setup travel with the draft and are saved with the squad', () => {
  assert.match(read('src/components/WhoPlaysSheet.tsx'), /<MatchRolesPicker/);
  assert.match(read('src/data/draftSquad.ts'), /captainId: d\.captainId, keeperId: d\.keeperId/);
  assert.match(read('src/screens/LiveScoringScreen.tsx'), /const role = p\.id === \(matchCap \?\? L\.captainId\)/);
});

test('MR8: no new public data — captain_id sits on match_squads, already readable like the squad', () => {
  const sql = read('supabase/migrations/20261111120000_match_roles.sql');
  assert.doesNotMatch(sql, /create policy|grant /i, 'no new policies or grants');
  assert.match(sql, /add column if not exists captain_id uuid/);
});
