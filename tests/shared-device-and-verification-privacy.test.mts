/** Found in the founder's verification test on a shared phone (2026-10-26):
 *  a friend's pushes and in-app alert followed the phone to the next account;
 *  status labels were cut off; raw file names were shown; and the verification
 *  status (not just "verified") was readable by other users through the API.
 *  Migration 20261026120000_device_account_and_verification_privacy. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { docKindLabel } from '../src/core/verificationReview.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_device_account_and_verification_privacy'))!), 'utf8');

describe('one phone, one account', () => {
  test('a device token belongs to one account, the latest to sign in on it', () => {
    assert.match(sql, /delete from push_tokens a\s+using push_tokens b\s+where a\.token = b\.token\s+and \(a\.updated_at, a\.ctid\) < \(b\.updated_at, b\.ctid\);/);
    assert.match(sql, /create unique index if not exists push_tokens_token_key on push_tokens \(token\);/);
    assert.match(sql, /on conflict \(token\) do update\s+set profile_id = excluded\.profile_id, updated_at = now\(\);/);
    assert.match(sql, /grant execute on function claim_push_token\(text\) to authenticated;/);
  });
  test('sign-in claims the token (falls back to the old save until the migration runs)', () => {
    const repos = read('src/data/repos.ts');
    assert.match(repos, /const \{ error \} = await supabase\.rpc\('claim_push_token', \{ p_token: token \}\);\s*if \(error\) await supabase\.from\('push_tokens'\)\.upsert/);
    assert.match(read('src/navigation/RootNavigator.tsx'), /m\.resaveWebPushIfOn\(\)/);
  });
  test('sign-out releases the device before the session ends', () => {
    const auth = read('src/core/auth.tsx');
    const body = auth.slice(auth.indexOf('signOut: async () => {'));
    const i = body.indexOf('await releaseDeviceForSignOut();');
    // Security W3 (CL-05): the sign-out falls back to a local one when offline
    const j = body.indexOf('await signOutSafely(supabase.auth);');
    assert.ok(i > 0 && j > i, 'release runs first');
    const dev = read('src/core/deviceSignOut.ts');
    assert.match(dev, /m\.disableWebPush\(\)/); // browser: unsubscribe
    assert.match(dev, /r\.releasePushToken\(token\)/); // phone: drop its own row
    assert.match(dev, /n\.forgetAccountOnDevice\(\)/);
    assert.match(dev, /setTimeout\(resolve, 3000\)/); // never holds sign-out up for long
    const repos = read('src/data/repos.ts');
    assert.match(repos, /\.from\('push_tokens'\)\.delete\(\)\.eq\('profile_id', data\.user\.id\)\.eq\('token', token\)/);
  });
  test('the in-app alerts and scheduled reminders go with the account', () => {
    const n = read('src/core/notifications.ts');
    assert.match(n, /notifyStore\.clear\(\);\s*currentPlayerId = null;\s*await syncScheduledLocal\(\[\]\);/);
    assert.match(n, /deviceToken = token\.data;/);
    assert.match(read('src/data/notifyStore.ts'), /clear\(\) \{\s*if \(items\.length\) \{ items = \[\]; emit\(\); \}/);
  });
});

describe('other people see "verified" only', () => {
  test('the view: everything for the person / support, "approved" or nothing for anyone else', () => {
    assert.match(sql, /case when a\.priv then p\.verification\s+when v\.full and p\.verification->>'status' = 'approved' then '\{"status":"approved"\}'::jsonb\s+end as verification,/);
    assert.doesNotMatch(sql, /jsonb_build_object\('status', p\.verification->>'status'\)/);
    assert.match(sql, /grant select on players_view to anon, authenticated;/);
  });
  test('no other-player check in the app needs anything but "approved"', () => {
    for (const f of ['src/core/eligibility.ts', 'src/data/repos.ts']) {
      const s = read(f);
      for (const m of s.matchAll(/verification\?\.status (===|!==) '(\w+)'/g)) {
        if (f === 'src/data/repos.ts' && m[2] === 'pending') continue; // demo review queue (own data)
        assert.equal(m[2], 'approved', `${f}: ${m[0]}`);
      }
    }
  });
  test('only the person (and support) see the verification card', () => {
    assert.match(read('src/components/ProfileView.tsx'), /\{\(onEditProfile \|\| \(player\.verification && isSupport\(viewer\?\.role\)\)\) && \(\s*<VerificationCard/);
  });
});

describe('no raw file names', () => {
  test('the kind of file, never its name', () => {
    assert.equal(docKindLabel('Screenshot_2026-08-30-23-50-13-17_75179bddced04e8f227cc2ee613a67f8.jpg'), 'Photo');
    assert.equal(docKindLabel('affiliation letter FINAL v2.PDF'), 'PDF');
    assert.equal(docKindLabel('scan.heic'), 'Photo');
    assert.equal(docKindLabel('notes.docx'), 'File');
    assert.equal(docKindLabel(undefined), 'File');
  });
  test('profile history, reviewer card and school screen use it', () => {
    const pv = read('src/components/ProfileView.tsx');
    assert.match(pv, /`\$\{e\.docName \? docKindLabel\(e\.docName\) : 'Proof'\} submitted`/);
    assert.doesNotMatch(pv, /Submitted\$\{e\.docName \? ` · \$\{e\.docName\}`/);
    const rv = read('src/screens/VerificationReviewScreen.tsx');
    assert.doesNotMatch(rv, /Open \$\{docName/);
    assert.doesNotMatch(rv, /full size · \{docName\}/);
    assert.match(rv, /'📄 Open the PDF' : '📄 Open the file'/);
    const ov = read('src/screens/OrgVerifyScreen.tsx');
    assert.doesNotMatch(ov, /\{v\.docName \?\? 'Document'\}/);
    assert.doesNotMatch(ov, /\{v\.letterName \?\? 'Signed letter'\}/);
  });
});

describe('status labels wrap instead of being cut off', () => {
  test('verification + review headers: the title shrinks, the row wraps', () => {
    const pv = read('src/components/ProfileView.tsx');
    assert.match(pv, /verifyHead: \{ flexDirection: 'row', flexWrap: 'wrap'/);
    assert.match(pv, /reviewCardRow: \{ flexDirection: 'row', flexWrap: 'wrap'/);
    assert.match(pv, /headTitle: \{ flexShrink: 1 \}/);
    assert.match(pv, /<Text style=\{\[textStyles\.h3, st\.headTitle\]\}>Age & guardian verification<\/Text>/); // 2026-10-29: headings drop their emoji
    const ls = read('src/screens/LiveScoringScreen.tsx');
    assert.match(ls, /header: \{ flexDirection: 'row', flexWrap: 'wrap'/);
    assert.match(ls, /sportName: \{[^}]*flexShrink: 1 \}/);
  });
});
