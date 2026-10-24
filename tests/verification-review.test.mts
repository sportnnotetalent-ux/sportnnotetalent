/** Age & guardian verification, Phase 1: faster document review
 *  (docs/verification/fast-lanes.md, 2026-10-24). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REJECT_REASONS, isImageDoc, isOverdue, priorRejections, readableDob, waitedLabel, REVIEW_TARGET_MS } from '../src/core/verificationReview.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('review helpers', () => {
  test('how long it waited, and the 12-hour target', () => {
    const now = Date.UTC(2026, 9, 24, 12);
    assert.equal(waitedLabel(undefined, now), '—');
    assert.equal(waitedLabel(now - 30_000, now), 'just now');
    assert.equal(waitedLabel(now - 45 * 60_000, now), '45 min');
    assert.equal(waitedLabel(now - 5 * 3_600_000, now), '5 h');
    assert.equal(waitedLabel(now - 55 * 24 * 3_600_000, now), '55 d');
    assert.equal(isOverdue(now - REVIEW_TARGET_MS + 1, now), false);
    assert.equal(isOverdue(now - REVIEW_TARGET_MS, now), true);
  });
  test('images inline, everything else opened', () => {
    assert.equal(isImageDoc('birth-cert.JPG'), true);
    assert.equal(isImageDoc('scan.heic'), true);
    assert.equal(isImageDoc('certificate.pdf'), false);
    assert.equal(isImageDoc(undefined), false);
  });
  test('readable date of birth and prior rejections', () => {
    assert.equal(readableDob('2012-03-05'), '5 Mar 2012');
    assert.equal(readableDob(undefined), '—');
    assert.equal(priorRejections([{ action: 'submitted' }, { action: 'rejected' }, { action: 'submitted' }]), 1);
    assert.ok(REJECT_REASONS.some((r) => /upload it again/.test(r)));
  });
});

describe('the server side', () => {
  const dir = join(root, 'supabase', 'migrations');
  const mig = readdirSync(dir).find((f) => f.includes('verification_review'))!;
  const sql = read(`supabase/migrations/${mig}`);
  test('reviewers: support or appointed; appointing is support-only', () => {
    assert.match(sql, /create or replace function is_verification_reviewer\(\)/);
    assert.match(sql, /is_support\(\) or exists \(select 1 from verification_reviewers/);
    assert.match(sql, /function grant_verification_reviewer[\s\S]{0,300}if not is_support\(\) then/);
    assert.match(sql, /revoke all on verification_reviewers from anon, authenticated/);
  });
  test('reviewers can open documents; the queue is reviewer-only; hourly reminder', () => {
    assert.match(sql, /create policy "verif docs read own or reviewer"[\s\S]{0,300}is_verification_reviewer\(\)/);
    assert.match(sql, /function pending_verifications\(\)[\s\S]{0,900}where is_verification_reviewer\(\)/);
    assert.match(sql, /cron\.schedule\(\s*'verification-reminders'/);
  });
  test('no email ever carries the document or a link to it', () => {
    for (const f of ['verification-submit', 'verification-review', 'verification-reminders']) {
      const src = read(`supabase/functions/${f}/index.ts`);
      assert.doesNotMatch(src, /createSignedUrl/, f);
    }
    assert.doesNotMatch(read('supabase/functions/_shared/verification.ts'), /createSignedUrl|docPath/);
  });
  test('a decision: reviewers only, pending only, never your own', () => {
    const src = read('supabase/functions/verification-review/index.ts');
    assert.match(src, /if \(!reviewer\.ok\) return json/);
    assert.match(src, /status !== 'pending'/);
    assert.match(src, /p\.profile_id === caller\.user\.id \|\| p\.guardian_profile_id === caller\.user\.id/);
    assert.match(src, /\.eq\('verification->>status', 'pending'\)/);
  });
});

describe('the app', () => {
  test('a failed upload throws instead of marking the profile pending', () => {
    const src = read('src/data/repos.ts');
    const fn = src.slice(src.indexOf('export async function submitVerificationDoc'), src.indexOf('export const VERIFICATION_DOC_MAX_BYTES'));
    assert.match(fn, /if \(error\) throw new Error\(failed\)/);
    // the upload comes before the profile is marked pending
    assert.ok(fn.indexOf('.upload(') < fn.indexOf("status: 'pending'"));
    assert.doesNotMatch(fn, /console\.warn\('verification upload failed/);
  });
});

describe('reaching the queue', () => {
  test('a reviewer with no player profile still gets the button (support accounts often have none)', () => {
    const v = read('src/components/ProfileView.tsx');
    const empty = v.slice(v.indexOf("title={owner ? 'Set up your profile'"), v.indexOf('// Stats reflect the chosen scope'));
    assert.match(empty, /owner && viewerIsReviewer && onOpenVerificationReview/);
    assert.match(empty, /label="🛡️ Review verifications"/);
  });
});
