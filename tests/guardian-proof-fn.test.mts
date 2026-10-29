/**
 * CL-03 parental proof — the edge function guardian-proof (alerts reviewers when
 * a parent submits; tells the parent and the child when a reviewer decides) and
 * the privacy-retention step that deletes the files 30 days after the decision.
 * The wording is pure (supabase/functions/_shared/guardianProofText.ts); the
 * function's own rules are checked on its source (Deno code isn't run here).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewerAlert, decidedMessages } from '../supabase/functions/_shared/guardianProofText.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('what people are told', () => {
  test('reviewers: no names, no document — they open it in the app', () => {
    const a = reviewerAlert();
    assert.match(a.title, /parental proof/i);
    assert.doesNotMatch(a.body, /http|@/);
  });
  test('approved: the parent is now linked; the child is all set', () => {
    const m = decidedMessages({ approved: true, reason: null, childName: 'Asha Rao' });
    assert.match(m.parent.body, /Asha/);
    assert.match(m.parent.body, /linked/i);
    assert.match(m.child.title, /approved/i);
  });
  test('not accepted: the parent gets the reason and the next step; the child is told to ask again', () => {
    const m = decidedMessages({ approved: false, reason: 'The ID is unreadable', childName: 'Asha Rao' });
    assert.match(m.parent.body, /The ID is unreadable/);
    assert.match(m.parent.body, /new/i);
    assert.match(m.child.body, /ask/i);
  });
  test('a reviewer\'s reason can\'t smuggle a link into the message', () => {
    const m = decidedMessages({ approved: false, reason: 'Fix it at https://evil.example now', childName: 'Asha' });
    assert.doesNotMatch(m.parent.body, /https?:\/\//);
  });
});

describe('the edge function guardian-proof', () => {
  const src = read('supabase/functions/guardian-proof/index.ts');
  test('only a signed-in caller, rate-limited', () => {
    assert.match(src, /requireUser\(req\)/);
    assert.match(src, /rateLimit\('guardian-proof'/);
  });
  test('"submitted" alerts reviewers only for the parent\'s own, still-open proof', () => {
    assert.match(src, /g\.guardian_profile_id !== caller\.user\.id \|\| g\.status !== 'pending'/);
    assert.match(src, /alertReviewers\(/);
  });
  test('"decided" only by the reviewer who decided it, within 10 minutes', () => {
    assert.match(src, /g\.reviewed_by !== caller\.user\.id/);
    assert.match(src, /10 \* 60_?000/);
  });
});

describe('privacy-retention deletes the parental-proof files 30 days after the decision', () => {
  const src = read('supabase/functions/privacy-retention/index.ts');
  test('asks the database what is due, deletes the exact files (not the folder — a newer proof may sit there), then marks them', () => {
    assert.match(src, /due_guardian_proof_docs/);
    assert.match(src, /storage\.from\(DOCS_BUCKET\)\.remove\(/);
    assert.match(src, /mark_guardian_proof_docs_deleted/);
    const block = src.slice(src.indexOf('due_guardian_proof_docs'), src.indexOf('mark_guardian_proof_docs_deleted'));
    assert.doesNotMatch(block, /removePrefix|docFolder/);
  });
});
