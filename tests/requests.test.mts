/**
 * Security Wave 2b — "Requests to confirm" (the pure part: src/data/requests.ts).
 * The server side is tests/db-wave2b.test.mts.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toPendingLink, toPendingFriendly, linkTitle, linkConsequence, notUsCopy, friendlyTitle, declineFriendlyCopy,
  requestsHeading, answerError, claimOutcomeText, maskPhone, showClaimCard, type PendingLink, type PendingFriendly,
} from '../src/data/requests.ts';

const link = (over: Partial<PendingLink> = {}): PendingLink => ({
  kind: 'team', groupId: 'g1', groupName: 'Shah U12', playerId: 'p1', playerName: 'Asha Rao', addedBy: 'Coach Shah', ...over,
});
const friendly = (over: Partial<PendingFriendly> = {}): PendingFriendly => ({
  matchId: 'm1', teamId: 't1', teamName: 'Away XI', otherTeam: 'Home XI', sport: 'football', startsAt: '2026-10-30T10:00:00Z', status: 'scheduled', hostName: 'Coach Iyer', ...over,
});

describe('reading server rows', () => {
  test('a well-formed row becomes a request', () => {
    assert.deepEqual(
      toPendingLink({ kind: 'club', group_id: 'g', group_name: 'Rao FC', player_id: 'p', player_name: 'Ira', added_by: 'Meera', at: '2026-10-28T00:00:00Z' }),
      { kind: 'club', groupId: 'g', groupName: 'Rao FC', playerId: 'p', playerName: 'Ira', addedBy: 'Meera', at: '2026-10-28T00:00:00Z' });
    assert.deepEqual(
      toPendingFriendly({ match_id: 'm', team_id: 't', team_name: 'A', other_team: null, sport: 'cricket', starts_at: null, status: 'live', host_name: null }),
      { matchId: 'm', teamId: 't', teamName: 'A', otherTeam: null, sport: 'cricket', startsAt: null, status: 'live', hostName: null });
  });
  test('unknown kinds and missing ids are dropped', () => {
    assert.equal(toPendingLink({ kind: 'tournament', group_id: 'g', player_id: 'p' }), null);
    assert.equal(toPendingLink({ kind: 'team', group_id: '', player_id: 'p' }), null);
    assert.equal(toPendingLink(null), null);
    assert.equal(toPendingFriendly({ match_id: 'm' }), null);
  });
  test('blank names get a fallback, never "undefined"', () => {
    const l = toPendingLink({ kind: 'org', group_id: 'g', player_id: 'p' })!;
    assert.deepEqual([l.groupName, l.playerName, l.addedBy], ['a community', 'your player', 'Someone']);
  });
});

describe('wording', () => {
  test('who added whom to what', () => {
    assert.equal(linkTitle(link(), false), 'Coach Shah added Asha Rao to the team Shah U12');
    assert.equal(linkTitle(link(), true), 'Coach Shah added you to the team Shah U12');
    assert.equal(linkTitle(link({ kind: 'org', groupName: 'DPS Academy' }), false), 'Coach Shah added Asha Rao to the community DPS Academy');
    assert.equal(linkTitle(link({ kind: 'field_event', groupName: '100m' }), true), 'Coach Shah entered you in the event 100m');
  });
  test('what Confirm and Not us do — names, never he/she', () => {
    assert.match(linkConsequence(link(), false), /Confirm lets the team's people see Asha's full name/);
    assert.match(linkConsequence(link(), false), /Not us takes Asha off the team/);
    assert.match(linkConsequence(link(), true), /your full name/);
    assert.match(linkConsequence(link({ kind: 'field_event' }), false), /entry stays for its results/);
    for (const l of [link(), link({ kind: 'club' }), link({ kind: 'org' }), link({ kind: 'field_event' })]) {
      assert.doesNotMatch(linkConsequence(l, false) + notUsCopy(l, false).message, /\b(he|she|him|her|his)\b/i);
    }
  });
  test('"Not us" asks first, with a safe default', () => {
    const c = notUsCopy(link(), false);
    assert.equal(c.title, 'Not Asha Rao?');
    assert.match(c.message, /off Shah U12/);
    assert.equal(c.tone, 'danger');
    assert.match(c.noLabel, /keep/i);
  });
  test('a friendly says who, against whom, and when', () => {
    assert.match(friendlyTitle(friendly()), /^Coach Iyer set up a friendly: Home XI v Away XI/);
    assert.match(friendlyTitle(friendly({ hostName: null, otherTeam: null })), /^A friendly against Away XI/);
    assert.match(declineFriendlyCopy(friendly()).message, /stay private/);
  });
  test('the heading counts both kinds', () => {
    assert.equal(requestsHeading(1, 0), '1 request to confirm');
    assert.equal(requestsHeading(2, 1), '3 requests to confirm');
  });
});

describe('errors and the link-by-phone card', () => {
  test('server messages become plain words', () => {
    assert.match(answerError({ message: 'Only the player, their parent or the person who added them can confirm this' }), /only the player/i);
    assert.match(answerError({ message: 'There\'s nothing to confirm — the link was removed' }), /already/i);
    assert.match(answerError({ message: 'function my_pending_links() does not exist' }), /update/i);
    assert.match(answerError(new Error('Failed to fetch')), /connection/i);
    assert.equal(answerError(undefined), 'Couldn’t save your answer — try again.');
  });
  test('each claim outcome has a message', () => {
    assert.match(claimOutcomeText('linked'), /now on your profile/);
    assert.match(claimOutcomeText('none'), /no profile/i);
    assert.match(claimOutcomeText('support'), /support/);
  });
  test('the number is masked except the last three digits', () => {
    assert.equal(maskPhone('+919811100001'), '+91 •••••••001');
    assert.equal(maskPhone('+447400123456'), '+44 •••••••456');
    assert.equal(maskPhone(''), '');
  });
  test('the card shows only when the sign-up number didn\'t make it onto the profile', () => {
    assert.equal(showClaimCard({ signUpPhone: '+919811100001', profilePhone: null, smsAvailable: true }), true);
    assert.equal(showClaimCard({ signUpPhone: '+919811100001', profilePhone: '+919811100001', smsAvailable: true }), false);
    assert.equal(showClaimCard({ signUpPhone: null, profilePhone: null, smsAvailable: true }), false);
    assert.equal(showClaimCard({ signUpPhone: '+919811100001', profilePhone: null, smsAvailable: false }), false);
    assert.equal(showClaimCard({ signUpPhone: '12', profilePhone: null, smsAvailable: true }), false, 'not a real number');
  });
});
