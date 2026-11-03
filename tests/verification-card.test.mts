/**
 * The profile's "Age & guardian verification" card is compact (title, status
 * chip, one next-step line, "Details ›", the action only when needed); the full
 * explanation, actions, support note and history live on VerificationDetails.
 * Break list: docs/security/breaks/verification-card.md
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verificationSummary, historyRows, fullDate, canSeeVerification } from '../src/core/verificationReview.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const oneSentence = (s: string) => {
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 10 && s.length <= 90, `short: "${s}"`);
  assert.doesNotMatch(s, /undefined|null|NaN|\n|  /);
  assert.match(s, /^[A-Z].*\.$/);
  assert.equal(s.match(/[.!?](\s|$)/g)?.length, 1, `one sentence: "${s}"`);
};

describe('S1–S4: one line for what to do next', () => {
  test('owner: every status', () => {
    const none = verificationSummary({ status: undefined, viewer: 'owner' });
    assert.equal(none.chip, 'Not started');
    assert.match(none.next, /^Upload a birth certificate, school ID or passport/);
    assert.deepEqual(none.action, { kind: 'upload', label: '📎 Upload proof' });

    const pending = verificationSummary({ status: 'pending', viewer: 'owner' });
    assert.equal(pending.chip, 'Pending');
    assert.match(pending.next, /^We’re checking your document/);
    assert.equal(pending.action, null, 'S3: nothing pushed while a review runs');

    const rejected = verificationSummary({ status: 'rejected', viewer: 'owner' });
    assert.equal(rejected.chip, 'Rejected');
    assert.equal(rejected.next, 'Upload a clearer photo of a birth certificate, school ID or passport.');
    assert.deepEqual(rejected.action, { kind: 'resubmit', label: '📎 Re-submit proof' });

    const ok = verificationSummary({ status: 'approved', viewer: 'owner' });
    assert.equal(ok.chip, 'Verified');
    assert.equal(ok.action, null);
    for (const s of [none, pending, rejected, ok]) oneSentence(s.next);
  });
  test('fast lanes: a school or parent confirmed the age, no document needed', () => {
    const school = verificationSummary({ status: undefined, confirmedBy: 'school', viewer: 'owner' });
    assert.equal(school.chip, 'Verified');
    assert.match(school.next, /school \/ club confirmed/);
    assert.equal(school.action, null);
    const parent = verificationSummary({ status: 'rejected', confirmedBy: 'parent', viewer: 'owner' });
    assert.equal(parent.chip, 'Verified');
    assert.match(parent.next, /parent\/guardian confirmed/);
    assert.equal(parent.action, null);
    oneSentence(school.next); oneSentence(parent.next);
  });
  test('an unknown status reads as not started, never undefined', () => {
    const s = verificationSummary({ status: 'weird' as never, viewer: 'owner' });
    assert.equal(s.chip, 'Not started');
    oneSentence(s.next);
  });
  test('S4/A2: a reviewer gets a reviewer line and never the owner\'s upload button', () => {
    for (const status of [undefined, 'pending', 'rejected', 'approved'] as const) {
      const s = verificationSummary({ status, viewer: 'reviewer' });
      assert.equal(s.action, null, String(status));
      assert.doesNotMatch(s.next, /^Upload/);
      oneSentence(s.next);
    }
  });
});

describe('H1: the history rows', () => {
  test('submitted / approved / rejected, with dates and reasons, never the file name', () => {
    const at = new Date(2026, 2, 5, 10).getTime();
    const rows = historyRows([
      { action: 'submitted', at, docName: 'IMG_2026_birth_cert_Ravi.jpg' },
      { action: 'rejected', at, byName: 'Asha', note: 'Blurry' },
      { action: 'submitted', at, docName: 'cert.pdf' },
      { action: 'approved', at },
    ]);
    assert.deepEqual(rows.map((r) => r.line), ['Photo submitted', 'Rejected by Asha', 'PDF submitted', 'Approved by support']);
    assert.equal(rows[1].note, 'Blurry');
    assert.equal(rows[0].note, undefined);
    assert.equal(rows[0].when, '5 Mar 2026');
    assert.ok(rows.every((r) => !/Ravi|IMG_/.test(JSON.stringify(r))));
  });
  test('a bad timestamp or no history', () => {
    assert.equal(fullDate(Number.NaN), '—');
    assert.equal(fullDate(undefined), '—');
    assert.deepEqual(historyRows(undefined), []);
  });
});

describe('P1/P2: who may see it', () => {
  test('the owner, or support — nobody else', () => {
    assert.equal(canSeeVerification({ playerId: 'p1', myPlayerId: 'p1', viewerIsSupport: false }), true);
    assert.equal(canSeeVerification({ playerId: 'p1', myPlayerId: 'p2', viewerIsSupport: false }), false);
    assert.equal(canSeeVerification({ playerId: 'p1', myPlayerId: null, viewerIsSupport: false }), false);
    assert.equal(canSeeVerification({ playerId: 'p1', myPlayerId: null, viewerIsSupport: true }), true);
    assert.equal(canSeeVerification({ playerId: '', myPlayerId: '', viewerIsSupport: false }), false);
  });
});

describe('the compact card (ProfileView)', () => {
  const pv = read('src/components/ProfileView.tsx');
  const card = pv.slice(pv.indexOf('function VerificationCard('), pv.indexOf('const st = StyleSheet.create'));
  test('title, chip, one line, Details link, the action only when needed', () => {
    assert.match(card, /verificationSummary\(/);
    assert.match(card, /<Text style=\{\[textStyles\.h3, st\.headTitle\]\}>Age & guardian verification<\/Text>/);
    assert.match(card, /<Pill label=\{summary\.chip\}/);
    assert.match(card, /summary\.next/);
    assert.match(card, /Details ›/);
    assert.match(card, /accessibilityRole="link"/);
    assert.match(card, /accessibilityLabel="Verification details"/);
    assert.match(card, /navigate\('VerificationDetails', \{ playerId: player\.id \}\)/);
    assert.match(card, /summary\.action \?/);
  });
  test('H1: no history, support note or long explanation on the profile', () => {
    assert.doesNotMatch(pv, /Verification history/);
    assert.doesNotMatch(pv, /Support note/);
    assert.doesNotMatch(pv, /historyBox|historyRow/);
    assert.doesNotMatch(pv, /Our support team reviews and approves it/);
    assert.doesNotMatch(pv, /TextField label="Reason/);
  });
  test('P2: the gate is unchanged', () => {
    assert.match(pv, /\{\(onEditProfile \|\| \(player\.verification && isSupport\(viewer\?\.role\)\)\) && \(\s*<VerificationCard/);
  });
});

describe('the details screen', () => {
  const scr = read('src/screens/VerificationDetailsScreen.tsx');
  test('route registered like the other stack screens', () => {
    assert.match(read('src/navigation/types.ts'), /VerificationDetails: \{ playerId: string \};/);
    const nav = read('src/navigation/RootNavigator.tsx');
    assert.match(nav, /const VerificationDetailsScreen = lazyScreen\(\(\) => import\('\.\.\/screens\/VerificationDetailsScreen'\)\);/);
    assert.match(nav, /name="VerificationDetails"/);
    assert.match(nav, /'VerificationDetails'/, 'in STACK_SCREENS');
  });
  test('P1: gated to the owner or support', () => {
    assert.match(scr, /canSeeVerification\(/);
    assert.match(scr, /getMyPlayerId\(/);
  });
  test('A1/H1/K1: explanation, upload, note, history, reviewer tools; keyboard-safe', () => {
    assert.match(scr, /KeyboardAwareScrollView/);
    assert.match(scr, /birth certificate, school ID or passport/);
    assert.match(scr, /useVerificationUpload\(/);
    assert.match(read('src/data/useVerificationUpload.ts'), /await submitVerificationDoc\(player\.id, doc\)/);
    assert.match(read('src/components/ProfileView.tsx'), /useVerificationUpload\(player, setV\)/,'A1: the card\'s action is the same upload');
    assert.match(scr, /Re-submit proof/);
    assert.match(scr, /Support note/);
    assert.match(scr, /historyRows\(/);
    assert.match(scr, /Verification history/);
    assert.match(scr, /reviewVerification\(/);
    assert.match(scr, /verificationDocUrl\(/);
  });
  test('P3: the document opens only for a reviewer', () => {
    const viewIdx = scr.indexOf('View document');
    assert.ok(viewIdx > 0);
    const before = scr.slice(0, viewIdx);
    assert.ok(before.lastIndexOf('{reviewer && (') > before.lastIndexOf('</Card>'), 'View document sits inside the reviewer block');
  });
});
