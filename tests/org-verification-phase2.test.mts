/** Organisation verification, Phase 2 (migration 20261027100000_org_verification_phase2):
 *  every registered community type gets the three steps. The client rules in
 *  src/core/orgVerification.ts must match the SQL. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOB_CONFIRM_TYPES, LOCAL_ID_TYPES, OFFICIAL_ID_RULES, ORG_VERIFY, REGISTERED_TYPES, authorisationLetterHtml, authorityOptions,
  canConfirmDobs, normOfficialId, reviewChecks, validOfficialId, verifiableType, verificationProgress,
  type OfficialIdType, type OrgVerificationState,
} from '../src/core/orgVerification.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_org_verification_phase2'))!), 'utf8');
const fn = (name: string) => sql.slice(sql.indexOf(`create or replace function ${name}(`), sql.indexOf('$$;', sql.indexOf(`create or replace function ${name}(`)));
const arr = (s: string) => [...s.matchAll(/'(\w+)'/g)].map((m) => m[1]);

describe('the new official IDs', () => {
  const ok: [OfficialIdType, string, string][] = [
    ['cin', 'u92490ka2019ptc123456', 'U92490KA2019PTC123456'],
    ['llpin', 'aab 1234', 'AAB-1234'],
    ['llpin', 'AAB-1234', 'AAB-1234'],
    ['gstin', '29abcde1234f1z5', '29ABCDE1234F1Z5'],
    ['udyam', 'udyam ka 03 0012345', 'UDYAM-KA-03-0012345'],
    ['udyam', 'UDYAM-KA-03-0012345', 'UDYAM-KA-03-0012345'],
    ['ngo_darpan', 'ka-2019-0123456', 'KA/2019/0123456'],
    ['society_reg', ' s/123 of 2015 ', 'S/123OF2015'],
    ['coop_reg', 'HSG/PNA/1234', 'HSG/PNA/1234'],
  ];
  for (const [t, raw, norm] of ok) {
    test(`${t}: "${raw}" → ${norm}`, () => {
      assert.equal(normOfficialId(t, raw), norm);
      assert.equal(validOfficialId(t, raw), true);
    });
  }
  test('wrong shapes are refused', () => {
    assert.equal(validOfficialId('cin', 'U92490KA2019PTC12345'), false); // 20 chars
    assert.equal(validOfficialId('gstin', '29ABCDE1234F1X5'), false); // no Z
    assert.equal(validOfficialId('udyam', 'UDYAM-KA-3-0012345'), false);
    assert.equal(validOfficialId('ngo_darpan', 'KA/19/0123456'), false);
    assert.equal(validOfficialId('society_reg', 'ab'), false);
  });
  test('the server has the same formats and the same clean-up', () => {
    const v = fn('valid_official_id');
    for (const [type, rule] of Object.entries(OFFICIAL_ID_RULES) as [OfficialIdType, { pattern: RegExp }][]) {
      const m = new RegExp(`when '${type}' then p_value ~ '([^']+)'`).exec(v);
      assert.ok(m, `server rule for ${type}`);
      assert.equal(m![1], rule.pattern.source, type);
    }
    const n = fn('norm_official_id');
    assert.match(n, /when 'llpin' then regexp_replace\(x, '\^\(\[A-Z\]\{3\}\)-\?\(\\d\{4\}\)\$', '\\1-\\2'\)/);
    assert.match(n, /when 'udyam' then regexp_replace\(x, '\^UDYAM-\?\(\[A-Z\]\{2\}\)-\?\(\\d\{2\}\)-\?\(\\d\{7\}\)\$', 'UDYAM-\\1-\\2-\\3'\)/);
    assert.match(n, /when 'ngo_darpan' then regexp_replace\(x, '\^\(\[A-Z\]\{2\}\)\[\/-\]\(\\d\{4\}\)\[\/-\]\(\\d\{7\}\)\$', '\\1\/\\2\/\\3'\)/);
    assert.match(sql, /add constraint org_official_ids_id_type_check check \(id_type in \([\s\S]*'cin', 'llpin', 'gstin', 'udyam', 'ngo_darpan', 'society_reg', 'trust_reg', 'coop_reg'\)\);/);
  });
});

describe('what each type needs', () => {
  test('every registered type is verifiable, with its own options', () => {
    for (const t of REGISTERED_TYPES) {
      assert.ok(verifiableType(t), t);
      assert.ok(ORG_VERIFY[t].requiredAnyOf.length > 0 && ORG_VERIFY[t].docKinds.length > 0, t);
    }
    assert.equal(verifiableType('Gymkhana'), false); // a custom type keeps the simple request
  });
  test('step 1 options match org_required_id_types()', () => {
    const body = fn('org_required_id_types');
    for (const t of REGISTERED_TYPES) {
      const m = new RegExp(`when '${t}' then array\\[([^\\]]+)\\]`).exec(body);
      assert.ok(m, `server options for ${t}`);
      assert.deepEqual(arr(m![1]), [...ORG_VERIFY[t].requiredAnyOf], t);
    }
  });
  test('any one of the options satisfies step 1', () => {
    const club: OrgVerificationState = { registered: true, type: 'Sports club', verified: false, ids: [{ type: 'gstin', value: '29ABCDE1234F1Z5' }], verification: null };
    const p = verificationProgress(club);
    assert.equal(p.ids, true);
    assert.deepEqual(p.todo, ['Upload a registration document', 'Show you’re authorised by the club']);
    const company = { ...club, type: 'Company', ids: [{ type: 'gstin' as const, value: '29ABCDE1234F1Z5' }] };
    assert.equal(verificationProgress(company).ids, false, 'a company needs a CIN or LLPIN; GSTIN is extra');
    assert.match(verificationProgress(company).todo[0], /registration number/);
  });
  test('submitting checks the type’s options on the server too', () => {
    const s = fn('submit_org_verification');
    assert.match(s, /need := org_required_id_types\(o\.type\);/);
    assert.match(s, /id_type = any\(need\)/);
    assert.doesNotMatch(s, /'udise' when 'College'/);
  });
});

describe('local registrars’ numbers never block another community', () => {
  test('the same list in the app, the index and the functions', () => {
    assert.deepEqual(arr(fn('org_local_id_types')), [...LOCAL_ID_TYPES]);
    assert.match(sql, /where locked and id_type not in \('state_board', 'society_reg', 'trust_reg', 'coop_reg'\);/);
    assert.match(fn('set_org_official_ids'), /if not \(t = any\(org_local_id_types\(\)\)\) then/);
    assert.match(fn('org_id_lookup'), /if not \(p_type = any\(org_local_id_types\(\)\)\) then/);
    assert.match(fn('decide_org_verification'), /and not \(i\.id_type = any\(org_local_id_types\(\)\)\) limit 1;/);
  });
  test('the reviewer is told there’s no public search, and a local match doesn’t block Approve', () => {
    assert.match(reviewChecks('email', { type: 'Housing society', idTypes: ['coop_reg'] })[0].label, /no public search/);
    assert.match(reviewChecks('email', { type: 'Company', idTypes: ['cin'] })[0].label, /public register/);
    const r = read('src/screens/VerificationReviewScreen.tsx');
    assert.match(r, /const clash = o\.ids\.find\(\(i\) => i\.verifiedElsewhere && !LOCAL_ID_TYPES\.includes\(i\.type\)\);/);
  });
});

describe('dates of birth: schools, colleges and sports bodies only', () => {
  test('the same list on both sides', () => {
    assert.deepEqual([...DOB_CONFIRM_TYPES], ['School', 'College', 'Sports club', 'Sports academy', 'Sports association']);
    assert.match(fn('org_dob_access_or_raise'), /type in \('School', 'College', 'Sports club', 'Sports academy', 'Sports association'\)/);
    assert.equal(canConfirmDobs('Company'), false);
    assert.equal(canConfirmDobs('Sports academy'), true);
    assert.match(read('src/components/OrgVerificationCard.tsx'), /canManage && canConfirmDobs\(org\.type\) \?/);
  });
});

describe('the words fit the organisation', () => {
  test('authority options, checklist and letter', () => {
    const club = authorityOptions('Sports club');
    assert.equal(club.email.title, '✉️ Official club email');
    assert.equal(club.letter.title, '📄 Letter signed by the President / Secretary');
    assert.equal(club.head.title, '👤 The President / Secretary confirms');
    assert.equal(authorityOptions('School').email.title, '✉️ Official school email');
    assert.match(reviewChecks('letter', { type: 'Company' })[2].label, /company’s published office number/);
    const html = authorisationLetterHtml({ orgName: 'Rovers FC', personName: 'A. Rao', ids: [{ type: 'society_reg', value: 'S/123' }], type: 'Sports club' });
    assert.match(html, /role at the club/);
    assert.match(html, /Name and title \(President \/ Secretary\)/);
    assert.match(html, /Society registration number: S\/123/);
    assert.doesNotMatch(html, /school/i);
  });
  test('the emails use the same nouns and titles as the app', () => {
    const f = read('supabase/functions/org-verify/index.ts');
    for (const t of REGISTERED_TYPES) {
      const m = new RegExp(`'?${t}'?: \\{ noun: '([^']+)', head: '([^']+)' \\}`).exec(f);
      assert.ok(m, `email words for ${t}`);
      assert.equal(m![1], ORG_VERIFY[t].noun, t);
      assert.equal(m![2], ORG_VERIFY[t].head, t);
    }
    assert.doesNotMatch(f, /an official school email|the Head of the school/);
  });
  test('the screens no longer assume a school', () => {
    const v = read('src/screens/OrgVerifyScreen.tsx');
    assert.doesNotMatch(v, /REQUIRED_ID|Official school email|Principal \/ Head’s name/);
    assert.match(v, /cfg\.requiredAnyOf\.map\(\(t\) => <SelectChip/);
    assert.match(read('src/screens/OrgConfirmScreen.tsx'), /named you as the \{cfg\.head\}/);
    assert.match(read('src/screens/VerificationReviewScreen.tsx'), /🏛️ Organisations · \{orgs\.length\}/);
  });
});
