/** Sign-up guard (2026-10-27, migration 20261027180000_signup_guard): accounts
 *  are hard to make in bulk — temporary inboxes refused, a daily cap per network
 *  — with no CAPTCHA and no app change; our own phone sign-in is never limited;
 *  a broken guard lets sign-ups through. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_signup_guard'))!), 'utf8');

describe('the hook', () => {
  test('a Supabase "Before User Created" Postgres hook, callable only by Auth', () => {
    assert.match(sql, /create or replace function hook_before_user_created\(event jsonb\)\s+returns jsonb/);
    assert.match(sql, /revoke all on function hook_before_user_created\(jsonb\) from public, anon, authenticated;/);
    assert.match(sql, /grant execute on function hook_before_user_created\(jsonb\) to supabase_auth_admin;/);
  });
  test('phone sign-in accounts pass; the placeholder domain can\'t be used by anyone else', () => {
    assert.match(sql, /coalesce\(u->>'phone', ''\) <> '' and domain = 'phone\.sportnnote\.in' then return '\{\}'::jsonb/);
    assert.match(sql, /if domain = 'phone\.sportnnote\.in' then\s+return jsonb_build_object\('error'/);
    // phone-login still makes accounts that way
    const fn = read('supabase/functions/phone-login/index.ts');
    assert.match(fn, /@phone\.sportnnote\.in`/);
    assert.match(fn, /phone_confirm: true/);
  });
  test('temporary inboxes refused; a daily cap per IP; both with the words the app shows', () => {
    for (const d of ['mailinator.com', 'yopmail.com', '10minutemail.com', 'guerrillamail.com', 'temp-mail.org']) assert.ok(sql.includes(`'${d}'`), d);
    assert.match(sql, /per_ip_per_day int not null default 100/);
    assert.match(sql, /rate_limit_hit\('signup-ip', ip, s\.per_ip_per_day, 86400\)/);
    assert.match(sql, /'http_code', 429/);
  });
  test('switchable, and it fails open', () => {
    assert.match(sql, /if not found or not s\.enabled then return '\{\}'::jsonb; end if;/);
    assert.match(sql, /exception when others then\s+return '\{\}'::jsonb;/);
    assert.match(sql, /alter table signup_guard_settings enable row level security;/);
  });
});

describe('in the app and the runbook', () => {
  test('the guard\'s refusals read as they should (not "too many attempts")', () => {
    const auth = read('src/core/auth.tsx');
    const at = (s: string) => auth.indexOf(s);
    assert.ok(at("m.includes('temporary inbox')") > 0);
    assert.ok(at("m.includes('new accounts from this network')") > 0);
    assert.ok(at("m.includes('new accounts from this network')") < at('/(rate limit|too many|429)/'), 'checked before the generic rate-limit words');
  });
  test('the runbook says how to switch it on, raise the cap and pause it', () => {
    const doc = read('docs/security/anti-scraping.md');
    assert.match(doc, /Authentication → Auth Hooks\*\* → \*\*Before User Created\*\* → \*\*Postgres\*\*/);
    assert.match(doc, /update signup_guard_settings set per_ip_per_day = 300;/);
    assert.match(doc, /update signup_guard_settings set enabled = false;/);
  });
});
