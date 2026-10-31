/**
 * AS-04 (docs/security/breaks/audit-security-2026-10-31.md) — phone sign-up
 * asks minors for what email sign-up asks:
 *  - a US child under 13 (a +1 number, as the profile trigger decides) is told
 *    plainly instead of getting "couldn't create your account" (the database
 *    already refuses the account: privacy_on_new_profile);
 *  - an under-18 must give a guardian EMAIL, because the parent's approval link
 *    is emailed (guardian-consent). With only a phone the child was stuck.
 * The server rule is supabase/functions/_shared/minorSignup.ts; the function
 * and the phone card are checked on their source.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { minorSignupProblem, US_UNDER_13 } from '../supabase/functions/_shared/minorSignup.ts';
import { US_UNDER_13_MESSAGE } from '../src/core/privacyRegion.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const g = (o: Partial<{ name: string; email: string; phone: string; consent: boolean }> = {}) => ({ name: 'Asha Rao', email: 'asha@x.in', consent: true, ...o });

describe('the server rule', () => {
  test('adults: nothing to ask', () => {
    assert.equal(minorSignupProblem(18, '+919876543210', {}), null);
    assert.equal(minorSignupProblem(40, '+12025550123', {}), null);
  });
  test('a US (+1) child under 13: the plain US message, same words as email sign-up', () => {
    assert.equal(US_UNDER_13, US_UNDER_13_MESSAGE);
    assert.equal(minorSignupProblem(12, '+12025550123', g()), US_UNDER_13);
    assert.equal(minorSignupProblem(13, '+12025550123', g()), null);
    assert.equal(minorSignupProblem(12, '+919876543210', g()), null, 'an Indian 12-year-old with a guardian is fine');
  });
  test('an under-18 needs a guardian name, a real email and consent', () => {
    assert.equal(minorSignupProblem(15, '+919876543210', g()), null);
    assert.match(minorSignupProblem(15, '+919876543210', g({ email: '' }))!, /email/i);
    assert.match(minorSignupProblem(15, '+919876543210', g({ email: 'not-an-email' }))!, /email/i);
    assert.ok(minorSignupProblem(15, '+919876543210', g({ email: '', phone: '+919812345678' })), 'a phone alone is not enough');
    assert.ok(minorSignupProblem(15, '+919876543210', g({ name: '' })));
    assert.ok(minorSignupProblem(15, '+919876543210', g({ consent: false })));
  });
});

describe('wiring', () => {
  test('phone-login uses the shared rule before creating the account', () => {
    const src = read('supabase/functions/phone-login/index.ts');
    assert.match(src, /from '\.\.\/_shared\/minorSignup\.ts'/);
    assert.ok(src.indexOf('minorSignupProblem(') < src.indexOf('admin.auth.admin.createUser('));
    assert.doesNotMatch(src, /\(!gPhone && !gEmail\)/, 'the phone-or-email rule is gone');
  });
  test('the phone card asks the same before calling the server', () => {
    const src = read('src/components/PhoneLoginCard.tsx');
    assert.match(src, /usUnder13Blocked\(/);
    assert.match(src, /US_UNDER_13_MESSAGE/);
    assert.match(src, /guardian’s email|guardian's email/i);
  });
});

test('junk from a script (numbers, objects) is refused, not a crash', () => {
  assert.ok(minorSignupProblem(15, '+919876543210', { name: 42, email: { a: 1 }, consent: true }));
  assert.ok(minorSignupProblem(15, '+919876543210', { name: 'A', email: 'a@x.in', consent: 'yes' }));
});
