#!/usr/bin/env node
// Pre-release sign-in check (2026-10-26). Asks the LIVE Supabase Auth for its
// settings and for the real error each common sign-in situation returns, and
// checks the app turns every one into a clear message (friendlyAuthError in
// src/core/auth.tsx). It uses a made-up address, so no account is created and
// no email is sent. Exit code 1 if anything would show users a generic or wrong
// message, or a setting the app depends on changed.
//   node scripts/auth-smoke.mjs
// Inbox and SMS steps (does the email arrive, does the code work) still need a
// person: see docs/testing/sign-in-test-script.md.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = ['.env.local', '.env.local.bak'].map((f) => join(ROOT, f)).find(existsSync);
if (!envFile) { console.error('No .env.local / .env.local.bak with the live keys.'); process.exit(1); }
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
  .map((l) => l.match(/^(EXPO_PUBLIC_(?:SUPABASE_(?:URL|ANON_KEY)|FIREBASE_API_KEY))=["']?([^"'\n]*)["']?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL; const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) { console.error('Supabase URL / anon key missing.'); process.exit(1); }

// The app's own mapping, taken from the source so this checks what ships.
const src = readFileSync(join(ROOT, 'src/core/auth.tsx'), 'utf8');
const body = src.slice(src.indexOf('export function friendlyAuthError'), src.indexOf('/** Is this error the'));
const friendly = new Function(body.replace('export function friendlyAuthError(raw?: string): string', 'return function(raw)'))();
const GENERIC = 'Something went wrong. Please try again.';

const auth = (path, init = {}) => fetch(`${URL_}/auth/v1/${path}`, {
  ...init, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const msgOf = (b) => b.msg ?? b.error_description ?? b.message ?? b.error ?? '';

let failed = 0;
const row = (ok, what, detail) => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${what.padEnd(44)} ${detail}`); };

// 1. Settings the app relies on.
const s = (await auth('settings')).body;
row(s.external?.email === true, 'email sign-in enabled', String(s.external?.email));
row(s.disable_signup === false, 'sign-ups open', `disable_signup=${s.disable_signup}`);
row(s.mailer_autoconfirm === true, 'email confirmation off (pilot)', `mailer_autoconfirm=${s.mailer_autoconfirm} — if this changes, see docs/email-verification.md`);
row(s.external?.phone === false, 'Supabase SMS off (the app uses Firebase)', `phone=${s.external?.phone} — AuthScreen SMS_LOGIN_ENABLED must match`);

// 1b. Web phone sign-in (Firebase) works only on domains Firebase lists. The web
// app moved to app.sportnnote.in on 2026-11-01 without it: every web phone
// sign-in there failed the robot check. Every host the web app runs on must be listed.
const WEB_HOSTS = ['app.sportnnote.in', 'sportnnote.expo.app'];
if (env.EXPO_PUBLIC_FIREBASE_API_KEY) {
  const pc = await fetch(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${env.EXPO_PUBLIC_FIREBASE_API_KEY}`).then((r) => r.json()).catch(() => ({}));
  const listed = pc.authorizedDomains ?? [];
  for (const h of WEB_HOSTS) row(listed.includes(h), `Firebase allows web phone sign-in on ${h}`, listed.includes(h) ? 'listed' : 'NOT listed: Firebase → Authentication → Settings → Authorized domains');
} else {
  row(false, 'Firebase web key present', 'EXPO_PUBLIC_FIREBASE_API_KEY missing');
}

// 2. Real errors → the app's message. Each must be specific, never the generic one.
const email = `smoke-${Date.now()}@example.com`;
const probes = [
  ['code sign-in, no such account', () => auth('otp', { method: 'POST', body: JSON.stringify({ email, create_user: false }) }), /no account with this email/],
  ['wrong / short sign-in code', () => auth('verify', { method: 'POST', body: JSON.stringify({ type: 'email', email, token: '123456' }) }), /Type every digit/],
  ['wrong reset code', () => auth('verify', { method: 'POST', body: JSON.stringify({ type: 'recovery', email, token: '123456' }) }), /Type every digit/],
  ['wrong password', () => auth('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: 'wrong-password-1' }) }), /Wrong email or password/],
  ['sign-up, short password', () => auth('signup', { method: 'POST', body: JSON.stringify({ email, password: '123' }) }), /at least 6 characters/],
  ['sign-up, bad email', () => auth('signup', { method: 'POST', body: JSON.stringify({ email: 'not-an-email', password: 'longenough1' }) }), /valid email address/],
];
for (const [what, call, want] of probes) {
  const r = await call();
  const raw = msgOf(r.body);
  const shown = friendly(raw);
  row(r.status >= 400 && shown !== GENERIC && want.test(shown), what, `${r.status} "${raw}" → "${shown}"`);
}
// The sign-up hook's own refusals (migrations 20261027180000_signup_guard and
// 20261029100000_signup_sms): checked offline, so no account is ever made here.
// Whether the hook is switched on is a dashboard setting: try one sign-up by
// hand without verifying the mobile (docs/testing/sign-in-test-script.md).
for (const [what, raw, want] of [
  ['sign-up without SMS proof', 'Verify your mobile number first — we text you a code, then you can create your account.', /verify your mobile/i],
  ['sign-up, temporary inbox', 'Please use your own email address — a temporary inbox can’t be used for SportnNote.', /temporary inbox/],
]) {
  const shown = friendly(raw);
  row(shown !== GENERIC && want.test(shown), what, `"${shown}"`);
}
// A reset for an unknown address must not reveal that it's unknown.
const rec = await auth('recover', { method: 'POST', body: JSON.stringify({ email }) });
row(rec.status === 200, 'reset, unknown email: no account leak', `${rec.status}`);

console.log(failed ? `\n${failed} problem(s) — fix before publishing.` : '\nAll sign-in checks passed.');
process.exit(failed ? 1 : 0);
