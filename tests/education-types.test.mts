/** More educational institutions (2026-10-27, migration 20261027120000_more_education_types):
 *  junior / PU colleges, universities, polytechnics / institutes and ITIs set up
 *  communities, verify like schools and colleges, keep class / year timelines and
 *  confirm members' dates of birth. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COMMUNITY_TYPES, EDUCATION_TYPES, isAcademicCommunity, suggestedGraduatingStandard } from '../src/core/org.ts';
import {
  DOB_CONFIRM_TYPES, EDUCATION_VERIFY_TYPES, OFFICIAL_ONLY_TYPES, ORG_VERIFY, REGISTERED_TYPES, authorityOptions, isEducation,
  normOfficialId, reviewChecks, validOfficialId, verificationProgress, type OrgVerificationState,
} from '../src/core/orgVerification.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_more_education_types'))!), 'utf8');
const NEW = ['Junior / PU college', 'University', 'Polytechnic / institute', 'ITI'] as const;

describe('the new institution types', () => {
  test('one list everywhere: academic, registered-only, verifiable, may confirm ages', () => {
    assert.deepEqual([...EDUCATION_VERIFY_TYPES], [...EDUCATION_TYPES]);
    assert.deepEqual([...OFFICIAL_ONLY_TYPES], [...EDUCATION_TYPES]);
    for (const t of EDUCATION_TYPES) {
      assert.ok(isAcademicCommunity(t), `${t} keeps class / year timelines`);
      assert.ok(isEducation(t), t);
      assert.ok((REGISTERED_TYPES as readonly string[]).includes(t), `${t} is a registered type`);
      assert.ok(COMMUNITY_TYPES.includes(t), `${t} can be picked when creating a community`);
      assert.ok((DOB_CONFIRM_TYPES as readonly string[]).includes(t), `${t} may confirm members' dates of birth`);
    }
    assert.equal(isAcademicCommunity('Sports club'), false);
  });
  test('what each new type verifies with', () => {
    assert.deepEqual([...ORG_VERIFY['Junior / PU college'].requiredAnyOf], ['udise']);
    assert.deepEqual([...ORG_VERIFY.University.requiredAnyOf], ['aishe']);
    assert.deepEqual([...ORG_VERIFY['Polytechnic / institute'].requiredAnyOf], ['aishe']);
    assert.deepEqual([...ORG_VERIFY.ITI.requiredAnyOf], ['iti']);
    const uni: OrgVerificationState = { registered: true, type: 'University', verified: false, ids: [{ type: 'aishe', value: 'U-0306' }], verification: null };
    assert.deepEqual(verificationProgress(uni).todo, ['Upload a recognition document', 'Show you’re authorised by the university']);
    assert.equal(authorityOptions('University').letter.title, '📄 Letter signed by the Vice-Chancellor / Registrar');
    assert.match(reviewChecks('head', { type: 'ITI' })[2].label, /^The Head confirmed/);
    assert.match(reviewChecks('email', { type: 'Polytechnic / institute' })[1].label, /recognition document for this institute/);
  });
  test('the ITI code (NCVT MIS): two letters, state, six digits', () => {
    assert.equal(normOfficialId('iti', 'gu 29000014'), 'GU29000014');
    assert.equal(validOfficialId('iti', 'gu 29000014'), true);
    assert.equal(validOfficialId('iti', 'PR28000115'), true);
    assert.equal(validOfficialId('iti', 'G29000014'), false);
    assert.equal(validOfficialId('iti', 'GU2900001'), false);
    assert.equal(validOfficialId('aishe', 'U-0306'), true); // universities
    assert.equal(validOfficialId('aishe', 'S-797'), true); // standalone polytechnic
  });
});

describe('graduating year follows the type', () => {
  test('school, junior college, after school', () => {
    assert.equal(suggestedGraduatingStandard('in', 'School'), 'Grade 10');
    assert.equal(suggestedGraduatingStandard('in', 'Junior / PU college'), 'Grade 12');
    assert.equal(suggestedGraduatingStandard('sg', 'Junior / PU college'), 'JC2');
    for (const t of ['College', 'University', 'Polytechnic / institute', 'ITI']) assert.equal(suggestedGraduatingStandard('in', t), 'Final year', t);
    assert.match(read('src/screens/CreateCommunityScreen.tsx'), /setGradStd\(suggestedGraduatingStandard\(market, resolvedType\)\)/);
  });
  test('educational institutions give their code when creating the community', () => {
    assert.match(read('src/screens/CreateCommunityScreen.tsx'), /registered && isEducation\(resolvedType\) && verifiableType\(resolvedType\) \? orgVerifyConfig\(resolvedType, market\)\.requiredAnyOf\[0\] : null/);
  });
});

describe('the server agrees', () => {
  test('ITI format, step-1 options, registered-only and the age rule', () => {
    assert.match(sql, /when 'iti' then p_value ~ '\^\[A-Z\]\{2\}\\d\{8\}\$'/);
    assert.match(sql, /'coop_reg', 'iti'\)\);/);
    for (const t of NEW) {
      const m = new RegExp(`when '${t.replace(/[/]/g, '\\/')}' then array\\[([^\\]]+)\\]`).exec(sql);
      assert.ok(m, `server options for ${t}`);
      assert.deepEqual([...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]), [...ORG_VERIFY[t].requiredAnyOf], t);
    }
    const list = "('School', 'Junior / PU college', 'College', 'University', 'Polytechnic / institute', 'ITI')";
    assert.ok(sql.includes(`if new.registered is false and new.type in ${list} then`), 'guard');
    assert.match(sql, /type in \('School', 'Junior \/ PU college', 'College', 'University', 'Polytechnic \/ institute', 'ITI',\s+'Sports club', 'Sports academy', 'Sports association'\)\)/);
  });
  test('the emails know the new types', () => {
    const f = read('supabase/functions/org-verify/index.ts');
    for (const t of NEW) assert.ok(f.includes(`'${t}': { noun: '${ORG_VERIFY[t].noun}', head: '${ORG_VERIFY[t].head}' }`) || f.includes(`${t}: { noun: '${ORG_VERIFY[t].noun}', head: '${ORG_VERIFY[t].head}' }`), t);
    assert.match(read('supabase/functions/verification-submit/index.ts'), /Verification request — \$\{o\.type/);
  });
});
