/** Sign-in and reset codes (2026-10-26). Supabase emails 8-digit codes on this
 *  project; the app said "6-digit code", so people typed 6 and were told the
 *  code had expired. Messages are checked against what the live auth API
 *  actually returns (probed 2026-10-26 with a made-up address). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const auth = read('src/core/auth.tsx');
const screen = read('src/screens/AuthScreen.tsx');
const body = auth.slice(auth.indexOf('export function friendlyAuthError'), auth.indexOf('/** Is this error the'));
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const friendly = new Function(body.replace('export function friendlyAuthError(raw?: string): string', 'return function(raw)'))() as (m?: string) => string;
const helper = (name: string) => {
  const i = screen.indexOf(`export function ${name}`);
  const src = screen.slice(i, screen.indexOf('\n}\n', i) + 2).replace(/export function (\w+)\(([^)]*)\): string/, 'return function($2)').replace(/: string/g, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(src)() as (...a: string[]) => string;
};

describe('the code box takes the whole code', () => {
  test('no "6-digit" promise for Supabase email codes, and no length cut', () => {
    assert.doesNotMatch(screen, /label="6-digit code"/);
    assert.doesNotMatch(screen, /We emailed a 6-digit code/);
    assert.match(screen, /label=\{otpChannel === 'phone' \? 'Code from the SMS' : 'Code from the email'\}/);
    assert.match(screen, /placeholder="Type every digit"/);
  });
  test('spaces and dashes in a pasted code are ignored', () => {
    const cleanCode = helper('cleanCode');
    assert.equal(cleanCode('1234 5678'), '12345678');
    assert.equal(cleanCode(' 1234-5678 '), '12345678');
    assert.equal(cleanCode('123456'), '123456');
    assert.match(screen, /const c = cleanCode\(code\);[\s\S]*?verifySignInOtp\(email\.trim\(\), c\)/);
    assert.match(screen, /confirmPasswordReset\(email\.trim\(\), c, newPassword\)/);
  });
  test('after sending: it can take a minute, check spam, newest code wins', () => {
    const note = helper('codeSentNote');
    assert.match(note('a sign-in code', 'a@b.co'), /check spam too\. Type every digit; a new code replaces the last one\./);
  });
  test('"Resend code" waits out Supabase\'s 60 s instead of failing', () => {
    assert.match(screen, /const RESEND_WAIT_S = 60;/);
    assert.match(screen, /Resend code in \{waitS\}s/);
    assert.equal((screen.match(/<ResendLink waitS=\{resendIn\}/g) ?? []).length, 2);
  });
});

describe('every message the live auth API returns reads clearly', () => {
  const cases: [string, RegExp][] = [
    ['Signups not allowed for otp', /no account with this email/],
    ['Token has expired or is invalid', /Type every digit from the newest email/],
    ['Invalid login credentials', /Wrong email or password/],
    ['Password should be at least 6 characters.', /at least 6 characters/],
    ['Unable to validate email address: invalid format', /valid email address/],
    ['For security purposes, you can only request this after 47 seconds.', /wait a minute/],
    ['Error sending magic link email', /couldn’t send the email/],
    ['User already registered', /already exists/],
    ['Signups not allowed for this instance', /Sign-ups are currently disabled/],
  ];
  for (const [raw, want] of cases) test(raw, () => assert.match(friendly(raw), want));
});

describe('forgotten password from mobile sign-in', () => {
  test('the unverified-number step offers an email code', () => {
    assert.match(read('src/components/PhoneLoginCard.tsx'), /Forgot the password\? Email me a sign-in code/);
    assert.match(screen, /onUseEmailCode=\{\(\) => \{ setMode\('in'\); switchFlow\('otp'\); \}\}/);
  });
});
