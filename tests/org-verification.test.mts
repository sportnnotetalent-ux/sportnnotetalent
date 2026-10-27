/** School & college verification, Phase 1 (migration 20261025190000_org_verification;
 *  docs/verification/org-verification.md). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  OFFICIAL_ID_RULES, REGISTERED_TYPES, UNREGISTERED_TYPES, authorisationLetterHtml, isFreeMail, normOfficialId,
  reviewChecks, validOfficialId, verificationProgress, type OfficialIdType, type OrgVerificationState,
} from '../src/core/orgVerification.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_org_verification'))!), 'utf8');
const fn = (name: string) => sql.slice(sql.indexOf(`create or replace function ${name}(`), sql.indexOf('$$;', sql.indexOf(`create or replace function ${name}(`)));

describe('official IDs', () => {
  test('valid and invalid codes', () => {
    assert.equal(validOfficialId('udise', '3601 0100 101'), true);
    assert.equal(normOfficialId('udise', '3601-0100-101'), '36010100101');
    assert.equal(validOfficialId('udise', '3601010010'), false);
    assert.equal(validOfficialId('aishe', 'c-12345'), true);
    assert.equal(normOfficialId('aishe', ' c-12345 '), 'C-12345');
    assert.equal(validOfficialId('aishe', 'X-12345'), false);
    assert.equal(validOfficialId('cbse', '1930123'), true);
    assert.equal(validOfficialId('cbse', '19A0123'), false);
    assert.equal(validOfficialId('cisce', 'ka071'), true);
  });
  test('the client rules match the server’s valid_official_id', () => {
    // the newest definition (Phase 2 added types: 20261027100000)
    const latest = readdirSync(dir).sort().reverse().map((f) => readFileSync(join(dir, f), 'utf8')).find((t) => t.includes('create or replace function valid_official_id('))!;
    const body = latest.slice(latest.indexOf('create or replace function valid_official_id('), latest.indexOf('$$;', latest.indexOf('create or replace function valid_official_id(')));
    for (const [type, rule] of Object.entries(OFFICIAL_ID_RULES) as [OfficialIdType, { pattern: RegExp }][]) {
      const m = new RegExp(`when '${type}' then p_value ~ '([^']+)'`).exec(body);
      assert.ok(m, `server rule for ${type}`);
      assert.equal(m![1], rule.pattern.source, type);
    }
  });
});

describe('the three steps', () => {
  const base: OrgVerificationState = { registered: true, type: 'School', verified: false, ids: [], verification: null };
  test('nothing done → three things to do', () => {
    const p = verificationProgress(base);
    assert.deepEqual([p.ids, p.doc, p.authority, p.ready], [false, false, false, false]);
    assert.equal(p.todo.length, 3);
    assert.match(p.todo[0], /UDISE\+ code/);
  });
  test('ready only when the ID, a document and a finished proof of authority are there', () => {
    const v = { status: 'draft' as const, hasDoc: true, docKind: 'Board affiliation letter', emailVerified: false, hasLetter: false };
    const s = { ...base, ids: [{ type: 'udise' as const, value: '36010100101' }] };
    assert.equal(verificationProgress({ ...s, verification: { ...v, authority: 'email' } }).ready, false); // code not confirmed
    assert.equal(verificationProgress({ ...s, verification: { ...v, authority: 'email', emailVerified: true } }).ready, true);
    assert.equal(verificationProgress({ ...s, verification: { ...v, authority: 'letter', hasLetter: true } }).ready, true);
    assert.equal(verificationProgress({ ...s, verification: { ...v, authority: 'head', headRequestedAt: 'x' } }).ready, true);
    assert.equal(verificationProgress({ ...s, verification: { ...v, authority: 'head', headRequestedAt: 'x', headDeclinedAt: 'y' } }).ready, false);
    assert.equal(verificationProgress({ ...base, type: 'College', ids: [{ type: 'udise', value: '36010100101' }] }).ids, false); // a college needs AISHE
  });
  test('support’s checklist names the authority check', () => {
    assert.match(reviewChecks('letter')[2].label, /called the school’s published office number/);
    assert.match(reviewChecks('email')[2].label, /email matches/);
    assert.equal(reviewChecks('head').length, 3);
  });
  test('free mailboxes are flagged, not refused; the letter template is escaped', () => {
    assert.equal(isFreeMail('greenwood.school@gmail.com'), true);
    assert.equal(isFreeMail('principal@greenwood.edu.in'), false);
    const html = authorisationLetterHtml({ orgName: 'Green & <Wood>', personName: 'A. Rao', ids: [{ type: 'udise', value: '36010100101' }] });
    assert.match(html, /Green &amp; &lt;Wood&gt;/);
    assert.match(html, /UDISE\+ code: 36010100101/);
    assert.match(html, /published phone number/);
  });
  test('informal groups can’t be a school or college', () => {
    for (const t of UNREGISTERED_TYPES) assert.ok(!['School', 'College'].includes(t));
    assert.ok(REGISTERED_TYPES.includes('School') && REGISTERED_TYPES.includes('College'));
  });
});

describe('the server rules', () => {
  test('an informal group can’t be a school / college; renaming, retyping or re-registering removes the ✓', () => {
    const g = fn('guard_org_verification');
    assert.match(g, /new\.registered is false and new\.type in \('School', 'College'\)/);
    assert.match(g, /new\.name is distinct from old\.name or new\.type is distinct from old\.type\s+or new\.registered is distinct from old\.registered/);
  });
  test('one verified community per official ID; unverifying unlocks it', () => {
    assert.match(sql, /create unique index if not exists org_official_ids_one_verified on org_official_ids \(country, id_type, id_value\) where locked;/);
    assert.match(fn('org_after_verification_change'), /update org_official_ids set locked = false where org_id = new\.id;/);
    assert.match(fn('set_org_official_ids'), /is already verified on SportnNote — ask its admins to add you/);
    assert.match(fn('decide_org_verification'), /update org_official_ids set locked = true where org_id = p_org;/);
  });
  test('organisations are reviewed by support only', () => {
    for (const f of ['org_verification_queue', 'decide_org_verification', 'review_org_verification']) assert.match(fn(f), /is_support\(\)/, f);
    assert.match(fn('pending_org_verifications'), /where is_support\(\)/);
    assert.doesNotMatch(fn('decide_org_verification'), /is_verification_reviewer/);
  });
  test('only Owners / Admins fill it in; uploads must be their own files', () => {
    for (const f of ['set_org_official_ids', 'save_org_verification', 'verify_org_email_code', 'submit_org_verification']) assert.match(fn(f), /perform org_admin_or_raise\(p_org\)/, f);
    assert.match(fn('save_org_verification'), /folder text := auth\.uid\(\)::text \|\| '\/org-' \|\| p_org::text \|\| '\/'/);
  });
  test('codes: hashed, short-lived, limited tries; the Head’s page works without an account', () => {
    assert.match(fn('create_org_code'), /encode\(sha256\(convert_to\(code, 'UTF8'\)\), 'hex'\)/);
    assert.match(fn('create_org_code'), /interval '30 minutes' else interval '14 days'/);
    assert.match(fn('verify_org_email_code'), /if r\.attempts >= 5 then/);
    assert.match(sql, /grant execute on function org_head_decide\(text, boolean, text\) to anon, authenticated;/);
    assert.match(sql, /grant execute on function create_org_code\(uuid, text, text, uuid\) to service_role;/);
    assert.doesNotMatch(sql, /grant execute on function create_org_code\(uuid, text, text, uuid\) to (anon|authenticated)/);
  });
  test('submitting needs the right ID, a document and a finished proof of authority', () => {
    const s = fn('submit_org_verification');
    assert.match(s, /need := case o\.type when 'School' then 'udise' when 'College' then 'aishe' end;/);
    assert.match(s, /v\.doc_path is null/);
    assert.match(s, /v\.authority = 'email' and v\.email_verified_at is null/);
  });
  test('tables are closed to clients; documents are deleted after the decision', () => {
    for (const t of ['org_official_ids', 'org_verifications', 'org_verification_codes']) assert.match(sql, new RegExp(`revoke all on ${t} from anon, authenticated;`));
    assert.match(sql, /grant execute on function due_org_verification_docs\(int\) to service_role;/);
    assert.match(read('supabase/functions/privacy-retention/index.ts'), /due_org_verification_docs/);
  });
});

describe('the app', () => {
  test('creating asks registered or informal first, and checks the ID isn’t already verified', () => {
    const s = read('src/screens/CreateCommunityScreen.tsx');
    assert.match(s, /Is it a registered organisation\?/);
    assert.match(s, /\(registered \? REGISTERED_TYPES : UNREGISTERED_TYPES\)/);
    assert.match(s, /lookupOfficialId\(idType, officialId\)/);
    assert.match(s, /is already verified on SportnNote — ask its admins to add you/);
  });
  test('routes: the three steps for admins, the Head’s page public', () => {
    const nav = read('src/navigation/RootNavigator.tsx');
    assert.match(nav, /OrgConfirm: 'org-confirm'/);
    const pub = nav.slice(nav.indexOf('const publicScreens'), nav.indexOf('</>', nav.indexOf('const publicScreens')));
    assert.match(pub, /name="OrgConfirm"/);
    assert.match(nav, /'OrgVerify'/);
  });
  test('support approves only after ticking all three (and the Head has confirmed when that route is used)', () => {
    const s = read('src/screens/VerificationReviewScreen.tsx');
    assert.match(s, /disabled=\{busy \|\| !allTicked \|\| !!clash \|\| \(v\?\.authority === 'head' && !v\.headConfirmedAt\)\}/);
  });
  test('the org request alerts support only; the email function checks the caller as an admin', () => {
    assert.match(read('supabase/functions/verification-submit/index.ts'), /\{ supportOnly: true \}/);
    const ef = read('supabase/functions/org-verify/index.ts');
    assert.match(ef, /caller\.asUser\.rpc\('org_is_admin'/);
    assert.match(ef, /rateLimit\('org-verify', orgId, 5, 3600\)/);
  });
});
