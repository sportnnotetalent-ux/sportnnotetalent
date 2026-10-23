/** "Join me on SportnNote" (2026-10-23): the friend invite link, its message
 *  and the remembered inviter (core/inviteText.ts, core/referralRules.ts). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { friendInviteLink, friendInviteText } from '../src/core/inviteText.ts';
import { REFERRAL_TTL_DAYS, isInviterId, referralToApply } from '../src/core/referralRules.ts';

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const DAY = 86_400_000;

describe('the invite', () => {
  test('a personal /get/ link on the app host', () => {
    assert.match(friendInviteLink(ID), new RegExp(`/get/${ID}$`));
  });
  test('the message greets the friend, names the inviter and ends with the link', () => {
    const t = friendInviteText({ link: 'https://app.sportnnote.in/get/x', inviterName: 'Rudy', friendName: 'Asha' });
    assert.match(t, /^Hi Asha! It's Rudy\. /);
    assert.match(t, /free while it's new/);
    assert.ok(t.endsWith('\nhttps://app.sportnnote.in/get/x'));
  });
  test('no names: still reads well', () => {
    assert.match(friendInviteText({ link: 'L' }), /^Hi! I'm using SportnNote/);
    // a placeholder name ("Invited (…)") isn't used as a greeting
    assert.match(friendInviteText({ link: 'L', friendName: 'Invited (98765)' }), /^Hi! /);
  });
});

describe('the remembered inviter', () => {
  const now = Date.UTC(2026, 9, 23);
  test('fresh and well-formed: followed', () => {
    assert.equal(referralToApply({ from: ID, at: now - DAY }, now, 'me'), ID);
  });
  test('older than the window, from the future, malformed or yourself: ignored', () => {
    assert.equal(referralToApply({ from: ID, at: now - (REFERRAL_TTL_DAYS + 1) * DAY }, now), null);
    assert.equal(referralToApply({ from: ID, at: now + DAY }, now), null);
    assert.equal(referralToApply({ from: 'x"; drop table', at: now }, now), null);
    assert.equal(referralToApply(null, now), null);
    assert.equal(referralToApply({ from: ID, at: now }, now, ID), null);
  });
  test('ids: uuids and demo ids only', () => {
    assert.ok(isInviterId(ID));
    assert.ok(isInviterId('p12'));
    assert.ok(isInviterId('local-player-3'));
    assert.ok(!isInviterId('../../etc'));
    assert.ok(!isInviterId(42));
  });
});
