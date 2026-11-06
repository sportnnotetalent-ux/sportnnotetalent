/** Main job first (docs/security/breaks/main-job-first.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextGame } from '../src/core/nextGame.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const NOW = Date.parse('2026-11-05T12:00:00Z');
const g = (status: string, startsAt: string | null) => ({ status, startsAt });

test('MJ4: live first, else the soonest still ahead (3 h grace)', () => {
  assert.equal(nextGame([g('scheduled', '2026-11-06T10:00:00Z'), g('live', null)], NOW)!.status, 'live');
  assert.equal(nextGame([g('scheduled', '2026-11-08T10:00:00Z'), g('scheduled', '2026-11-06T10:00:00Z')], NOW)!.startsAt, '2026-11-06T10:00:00Z');
  assert.equal(nextGame([g('scheduled', '2026-11-05T10:00:00Z')], NOW)!.startsAt, '2026-11-05T10:00:00Z', 'started 2 h ago');
  assert.equal(nextGame([g('scheduled', '2026-11-01T10:00:00Z'), g('completed', '2026-11-06T10:00:00Z')], NOW), null);
});

test('MJ1/MJ3: tournaments open on Matches when live; no Follow for hosts', () => {
  const t = read('src/screens/TournamentProfileScreen.tsx');
  assert.match(t, /const opensOn: Tab = !\(params as \{ tab\?: string \}\)\.tab && matches\.some\(\(m\) => m\.status === 'live'\) \? 'Matches' : 'Info';/);
  assert.match(t, /\{!canManageHosts \? \(\s*<View style=\{st\.followRow\}>/);
  const manage = t.slice(t.indexOf("{activeTab === 'Settings' && canManageHosts && ("));
  assert.ok(manage.indexOf('title="Teams"') < manage.indexOf('title="Tournament"'), 'everyday jobs first');
});

test('MJ6: Profile leads with the record; nothing dropped', () => {
  const p = read('src/components/ProfileView.tsx');
  assert.ok(p.indexOf('title="By sport"') < p.indexOf('<VerificationChecklist'), 'record before to-dos');
  for (const k of ['<VerificationChecklist', '<MyCertificatesCard', '<CareerPassportCard', 'player.guardian', '{ownProfile && mine}']) assert.ok(p.includes(k), k);
});

test('MJ2/MJ5: folds keep values and the voice privacy note', () => {
  assert.match(read('src/screens/ScheduleMatchScreen.tsx'), /More options — rules, venue, stream, officials ▾\{venue\.trim\(\)/);
  assert.match(read('src/screens/CreateTournamentScreen.tsx'), /More options — co-hosts, divisions, organiser contact, reminders/);
  const v = read('src/sports/VoiceScorer.tsx');
  assert.match(v, /const shown = open \|\| speech\.listening \|\| !!pending \|\| log\.length > 0;/);
  assert.match(v, /speech\.listening \? speech\.stop\(\) : \(setOpen\(true\), speech\.supported\)/);
});

test('team page, parent screen, Organize, football possession', () => {
  assert.match(read('src/screens/TeamProfileScreen.tsx'), /const upNext = nextGame\(teamMatches\)/);
  const gl = read('src/screens/GuardianLinkScreen.tsx');
  assert.ok(gl.indexOf('children.length > 0 && (') < gl.indexOf('Code from the email'), 'child first');
  assert.match(read('src/screens/OrganizeScreen.tsx'), /<ActionTile label="Start a session"/);
  assert.match(read('src/sports/football/index.tsx'), /const early = tracked\.home \+ tracked\.away < 60_000;/);
});
