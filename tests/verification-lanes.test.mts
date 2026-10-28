/** Age & guardian verification, Phase 2: parent confirms, school confirms
 *  (docs/verification/fast-lanes.md, 2026-10-24). The rules live in the
 *  migration; these tests pin them so a later edit can't loosen them. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const mig = readdirSync(dir).find((f) => f.includes('verification_lanes'))!;
const sql = read(`supabase/migrations/${mig}`);
const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2));
};

describe('confirmations: only server functions write them, and only for the date they confirmed', () => {
  test('a client write can\'t set or change dob_confirmations', () => {
    assert.match(fn('guard_dob_confirmations'), /if is_client_request\(\) then\s+new\.dob_confirmations := case when tg_op = 'INSERT' then null else old\.dob_confirmations end/);
    assert.match(sql, /create trigger players_dob_confirmations_guard before insert or update on players/);
  });
  test('players_view.age_verified_by counts a confirmation only while the date of birth matches', () => {
    const view = sql.slice(sql.indexOf('create or replace view players_view'));
    assert.match(view, /when p\.dob is not null and p\.dob_confirmations->'org'->>'dob' = p\.dob::text then 'school'/);
    assert.match(view, /when p\.dob is not null and p\.dob_confirmations->'parent'->>'dob' = p\.dob::text then 'parent'/);
    assert.match(view, /when p\.verification->>'status' = 'approved' then 'document'/);
    // the privacy rules from minor_names_signed_in are kept
    assert.doesNotMatch(view.replace(/--.*$/gm, ''), /or not me\.anon/);
  });
});

describe('parent confirms', () => {
  test('the consent link: one function (old 3-argument one dropped), confirmation only when approving', () => {
    assert.match(sql, /drop function if exists guardian_consent_decide\(text, boolean, text\)/);
    const d = fn('guardian_consent_decide');
    assert.match(d, /p_dob_confirmed boolean default null/);
    assert.match(d, /if p_approve then[\s\S]*if coalesce\(p_dob_confirmed, false\) then[\s\S]*'parent'/);
    assert.match(fn('guardian_consent_preview'), /'dob', child_dob/);
  });
  test('later, only the linked parent', () => {
    assert.match(fn('guardian_confirm_dob'), /pl := guardian_child_or_raise\(p_player\)/);
    assert.match(fn('guardian_child_dob'), /pl := guardian_child_or_raise\(p_player\)/);
  });
});

describe('school / club confirms', () => {
  test('only Owners / Admins of a VERIFIED organisation, only its active members', () => {
    const gate = fn('org_dob_access_or_raise');
    assert.match(gate, /has_org_role\(p_org, array\['Owner', 'Admin'\]\)/);
    assert.match(gate, /verified_at is not null/);
    for (const f of ['org_member_dobs', 'org_confirm_dobs']) assert.match(fn(f), /perform org_dob_access_or_raise\(p_org\)/, f);
    assert.match(fn('org_confirm_dobs'), /m\.until is null or m\.until >= current_date/);
  });
  test('verifying an organisation is reviewer-only; clients can\'t set it; a rename clears it', () => {
    assert.match(fn('review_org_verification'), /if not is_verification_reviewer\(\) then/);
    const g = fn('guard_org_verification');
    assert.match(g, /new\.verified_at := old\.verified_at/);
    assert.match(g, /if new\.name is distinct from old\.name then new\.verified_at := null/);
    assert.match(fn('request_org_verification'), /has_org_role\(p_org, array\['Owner', 'Admin'\]\)/);
  });
});

describe('the app', () => {
  test('the consent call sends the date-of-birth answer only when there is one (older servers keep working)', () => {
    const src = read('src/data/privacy.ts');
    assert.match(src, /\.\.\.\(dobConfirmed !== undefined \? \{ p_dob_confirmed: dobConfirmed \} : \{\}\)/);
  });
  test('players are read with age_verified_by, dropped first on an older view', () => {
    const src = read('src/data/repos.ts');
    assert.match(src, /restricted\$\{viewHasAgeLevel \? ', age_verified_by' : ''\}/);
    assert.match(src, /if \(viewHasRestricted && viewHasAgeLevel && isMissingAgeLevel\(res\.error\)\)/);
  });
  test('a school\'s request alerts reviewers, only from its Owners / Admins', () => {
    const src = read('supabase/functions/verification-submit/index.ts');
    // Security W4 (EF-19): the database decides (org_is_admin, as the caller)
    assert.match(src, /caller\.asUser\.rpc\('org_is_admin', \{ p_org: orgId \}\)/);
    assert.match(src, /if \(isAdmin !== true\) return json\(\{ delivered: false, error: 'not an owner or admin' \}, 403\)/);
  });
});
