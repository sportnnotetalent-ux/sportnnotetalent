/**
 * Security Wave 3E — the app's findings (CL-05 to CL-18), the pure parts.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownsQueue, setQueueAccount, queueAccount } from '../src/core/queueAccount.ts';
import { signOutSafely, cleanupFor } from '../src/core/signOutSafely.ts';
import { metadataToClear } from '../src/core/authMetadata.ts';
import { recentSignIn } from '../supabase/functions/_shared/reauth.ts';
import { safeAppPath, androidIntentUrl } from '../src/core/inviteText.ts';
import { streamHost, isKnownStreamHost } from '../src/core/safeUrl.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('CL-07 — an offline queue belongs to the account that made it', () => {
  test('sent and shown only to that account; untagged (older) queues as before', () => {
    assert.equal(ownsQueue('u1', 'u1'), true);
    assert.equal(ownsQueue('u1', 'u2'), false);
    assert.equal(ownsQueue('u1', null), false, 'nobody signed in: park it');
    assert.equal(ownsQueue(undefined, 'u2'), true);
    setQueueAccount('u9');
    assert.equal(queueAccount(), 'u9');
    setQueueAccount(null);
  });
  test('the three queues use it', () => {
    for (const f of ['src/data/matchOutbox.ts', 'src/data/pendingResults.ts', 'src/data/golf.ts']) assert.match(read(f), /ownsQueue\(/, f);
    assert.match(read('src/data/golf.ts'), /\.select\('id'\)/, 'an update that touched no row isn\'t "synced"');
  });
});

describe('CL-05 / CL-06 — signing out', () => {
  test('a failed sign-out (offline) still removes the session from this device', async () => {
    const calls: string[] = [];
    const auth = { signOut: async (o?: { scope?: string }) => { calls.push(o?.scope ?? 'global'); return { error: o?.scope ? null : new Error('network') }; } };
    assert.equal(await signOutSafely(auth), 'local');
    assert.deepEqual(calls, ['global', 'local']);
    const ok = { signOut: async () => ({ error: null }) };
    assert.equal(await signOutSafely(ok), 'global');
  });
  test('every way the session ends cleans the device; a switch cleans only what\'s local', () => {
    assert.equal(cleanupFor('signed-out', 'u1', null), 'full');
    assert.equal(cleanupFor('switch', 'u1', 'u2'), 'local');
    assert.equal(cleanupFor('switch', null, 'u2'), 'none');
    assert.equal(cleanupFor('switch', 'u1', 'u1'), 'none');
    assert.equal(cleanupFor('ignore', 'u1', 'u1'), 'none');
  });
});

describe('CL-09 — sign-up details leave the session token', () => {
  test('date of birth, phone and guardian are cleared; the name stays', () => {
    assert.deepEqual(metadataToClear({ full_name: 'A', dob: '2012-01-01', phone: '+91…', guardian: { email: 'g@x.in' }, country: 'IN' }), { dob: null, phone: null, guardian: null });
    assert.equal(metadataToClear({ full_name: 'A' }), null);
    assert.equal(metadataToClear({ full_name: 'A', dob: null }), null, 'already cleared');
  });
});

describe('CL-18 — deleting an account needs a fresh sign-in', () => {
  test('within 10 minutes', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    assert.equal(recentSignIn('2026-10-28T11:55:00Z', now), true);
    assert.equal(recentSignIn('2026-10-28T11:45:00Z', now), false);
    assert.equal(recentSignIn(undefined, now), false);
    assert.equal(recentSignIn('not a date', now), false);
  });
  test('the function asks for it', () => {
    assert.match(read('supabase/functions/delete-account/index.ts'), /recentSignIn\(/);
  });
});

describe('CL-10 — Android backups', () => {
  test('the session and offline data stay out of device backups', () => {
    const app = JSON.parse(read('app.json'));
    assert.equal(app.expo.android.allowBackup, false);
  });
});

describe('CL-11 — "Open in the app" builds only app paths', () => {
  test('a crafted token can\'t become another intent or a redirect', () => {
    assert.equal(safeAppPath('join-club/ABC123'), 'join-club/ABC123');
    assert.equal(safeAppPath('join-club/X#Intent;scheme=https;package=evil;end'), null);
    assert.equal(safeAppPath('join-club/../../x'), null);
    assert.equal(safeAppPath('https://evil.example'), null);
    assert.ok(!androidIntentUrl('join-club/X#Intent;end').includes('#Intent;end'));
  });
});

describe('CL-12 — stream links on an unknown site ask first', () => {
  test('known stream hosts', () => {
    assert.equal(isKnownStreamHost('https://www.youtube.com/watch?v=x'), true);
    assert.equal(isKnownStreamHost('https://youtu.be/x'), true);
    assert.equal(isKnownStreamHost('https://www.twitch.tv/x'), true);
    assert.equal(isKnownStreamHost('https://youtube.com.evil.example/x'), false);
    assert.equal(isKnownStreamHost('https://evil.example/youtube.com'), false);
    assert.equal(streamHost('https://Live.Example.org/x'), 'live.example.org');
  });
});

describe('CL-16 — web photos are re-encoded (no EXIF / GPS)', async () => {
  const { reencodeAs, fitSize } = await import('../src/core/imageMeta.ts');
  test('the format', () => {
    assert.equal(reencodeAs('image/jpeg'), 'image/jpeg');
    assert.equal(reencodeAs('image/heic'), 'image/jpeg');
    assert.equal(reencodeAs(undefined), 'image/jpeg');
    assert.equal(reencodeAs('image/png'), 'image/png');
    assert.equal(reencodeAs('image/gif'), null);
  });
  test('the size', () => {
    assert.deepEqual(fitSize(4032, 3024), { w: 2048, h: 1536 });
    assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 });
    assert.deepEqual(fitSize(0, 10), { w: 0, h: 0 });
  });
  test('the picker uses it on the web', () => {
    assert.match(read('src/core/photo.ts'), /reencodeAs\(/);
  });
});
