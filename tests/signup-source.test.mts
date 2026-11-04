/** Sign-up source — which link a new user came from (docs/security/breaks/signup-source.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFromUrl, landingToKeep, landingToSend, sourceLabel, LANDING_TTL_DAYS } from '../src/core/signupSource.ts';

const ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const DAY = 86_400_000;

test('a game, tournament, invite or profile link keeps which one', () => {
  assert.deepEqual(sourceFromUrl(`https://app.sportnnote.in/m/${ID}?sport=football`), { kind: 'game', ref: ID });
  assert.deepEqual(sourceFromUrl(`https://app.sportnnote.in/t/${ID}`), { kind: 'tournament', ref: ID });
  assert.deepEqual(sourceFromUrl(`https://app.sportnnote.in/i/${ID}`), { kind: 'invite', ref: ID });
  assert.deepEqual(sourceFromUrl(`https://app.sportnnote.in/get/${ID}`), { kind: 'invite', ref: ID });
  assert.deepEqual(sourceFromUrl(`https://app.sportnnote.in/p/${ID}/`), { kind: 'profile', ref: ID });
});

test('native, Expo dev and bare-path forms read the same', () => {
  assert.deepEqual(sourceFromUrl(`sportnnote://m/${ID}`), { kind: 'game', ref: ID });
  assert.deepEqual(sourceFromUrl(`exp://192.168.1.4:8081/--/t/${ID}`), { kind: 'tournament', ref: ID });
  assert.deepEqual(sourceFromUrl(`/get/${ID}`), { kind: 'invite', ref: ID });
});

test('SS1: secret tokens and codes are never kept — only the kind', () => {
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/join/SECRETTOKEN123'), { kind: 'team' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/join-club/SECRETTOKEN123'), { kind: 'team' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/join-tournament/SECRETTOKEN123'), { kind: 'tournament' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/guardian-consent?c=ABCDEF'), { kind: 'parent' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/school-request?c=ABCDEF'), { kind: 'parent' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/org-confirm?c=ABCDEF'), { kind: 'school' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/c/CERT01'), { kind: 'results' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/pp/PASS01'), { kind: 'profile' });
  for (const u of ['join/SECRETTOKEN123', 'guardian-consent?c=ABCDEF']) assert.doesNotMatch(JSON.stringify(sourceFromUrl(`https://x.in/${u}`)), /SECRET|ABCDEF/);
});

test('the home page, tabs and unknown paths are not a link source', () => {
  for (const u of ['https://app.sportnnote.in/', 'https://app.sportnnote.in', 'https://app.sportnnote.in/Tabs/Matches', 'https://app.sportnnote.in/privacy', 'sportnnote://', '', 'not a url']) {
    assert.equal(sourceFromUrl(u), null, u);
  }
});

test('SS5: a ref that doesn’t look like an id is dropped, the kind kept', () => {
  assert.deepEqual(sourceFromUrl(`https://app.sportnnote.in/m/${'x'.repeat(80)}`), { kind: 'game' });
  assert.deepEqual(sourceFromUrl("https://app.sportnnote.in/m/1';drop%20table"), { kind: 'game' });
  assert.deepEqual(sourceFromUrl('https://app.sportnnote.in/m/'), { kind: 'game' });
});

test('SS8: first link wins for 30 days; stale, future-dated or corrupt ones are replaced', () => {
  const now = 1_800_000_000_000;
  const a = { kind: 'game', ref: ID, at: now - 2 * DAY };
  assert.equal(landingToKeep(a, { kind: 'invite', ref: 'p1' }, now), null, 'keep the earlier fresh link');
  assert.deepEqual(landingToKeep(null, { kind: 'invite', ref: 'p1' }, now), { kind: 'invite', ref: 'p1', at: now });
  assert.deepEqual(landingToKeep({ ...a, at: now - (LANDING_TTL_DAYS + 1) * DAY }, { kind: 'team' }, now), { kind: 'team', at: now });
  assert.deepEqual(landingToKeep({ ...a, at: now + DAY }, { kind: 'team' }, now), { kind: 'team', at: now });
  assert.deepEqual(landingToKeep('garbage', { kind: 'team' }, now), { kind: 'team', at: now });
  assert.equal(landingToKeep(null, null, now), null, 'not a link: nothing to remember');
});

test('SS8: only a fresh, well-formed landing is sent', () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(landingToSend({ kind: 'game', ref: ID, at: now - DAY }, now), { kind: 'game', ref: ID, at: now - DAY });
  assert.deepEqual(landingToSend({ kind: 'team', at: now - DAY }, now), { kind: 'team', at: now - DAY });
  assert.equal(landingToSend({ kind: 'game', at: now - 31 * DAY }, now), null);
  assert.equal(landingToSend({ kind: 'hacker', at: now }, now), null);
  assert.deepEqual(landingToSend({ kind: 'game', ref: 'bad ref!', at: now }, now), { kind: 'game', at: now });
  assert.equal(landingToSend(null, now), null);
});

test('labels read plainly, with "Direct / unknown" for no source', () => {
  assert.equal(sourceLabel('invite'), 'Friend invite');
  assert.equal(sourceLabel('game'), 'Game link');
  assert.equal(sourceLabel(null), 'Direct / unknown');
  assert.equal(sourceLabel('zzz'), 'Direct / unknown');
});
