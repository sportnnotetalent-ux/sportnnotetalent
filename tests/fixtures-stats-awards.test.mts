/** Fixture generator, Stats and Awards (docs/security/breaks/fixtures-stats-awards.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { knockoutInProgress, gamesLeft } from '../src/core/tournamentTeams.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const m = (status: string) => ({ status });

test('FA4/FA5: no medals only for a knockout with games left', () => {
  assert.equal(knockoutInProgress('knockout', [m('completed'), m('live')]), true);
  assert.equal(knockoutInProgress('knockout', []), true, 'nothing played yet');
  assert.equal(knockoutInProgress('knockout', [m('completed'), m('cancelled')]), false, 'finished');
  assert.equal(knockoutInProgress('league', [m('live')]), false);
  assert.equal(knockoutInProgress(null, [m('live')]), false);
});

test('FA8: games left ignore finished and cancelled', () => {
  assert.equal(gamesLeft([m('completed'), m('cancelled'), m('live'), m('scheduled')]), 2);
  assert.equal(gamesLeft([]), 0);
});

test('FA1/FA2/FA3: generator lists this tournament’s teams, others behind a toggle', () => {
  const g = read('src/screens/GenerateFixturesScreen.tsx');
  assert.match(g, /tournamentTeamIds\(participants, tourMatches\.filter\(\(m\) => m\.sport === sport\)\)/);
  assert.match(g, /const base = showOthers \?/);
  assert.match(g, /return divTeamIds \? base\.filter/);
  assert.match(g, /if \(!touchedSel && divParticipants\.length\)/);
  assert.match(g, /pickNames\.get\(t\.id\)/);
  assert.match(g, /⚡ Preview fixtures/);
  for (const n of ['1 · Teams', '2 · Format', '3 · When &amp; where']) assert.ok(g.includes(n), n);
});

test('Stats: bracket first for knockouts; plain ranks while in progress', () => {
  const t = read('src/screens/TournamentProfileScreen.tsx');
  const stats = t.slice(t.indexOf("{activeTab === 'Stats' && ("));
  assert.ok(stats.indexOf('Knockout bracket') < stats.indexOf('Standings & leaders'));
  assert.match(t, /noMedals=\{koInProgress\}/);
  assert.match(read('src/components/Rank.tsx'), /const tier = plain \? null : podiumColor\(index\);/);
});

test('Awards: so far while live, early publish asks, empty hidden (FA6/FA7)', () => {
  const a = read('src/components/TournamentAwardsTab.tsx');
  assert.match(a, /Publish early…/);
  assert.match(a, /Publish awards early\?/);
  assert.match(a, /if \(!has && !current\.find\(\(i\) => i\.id === awardId\(sport!, s\.slot\)\)\) return null;/);
  assert.doesNotMatch(read('src/data/ratings.ts'), /\} m`/);
});
