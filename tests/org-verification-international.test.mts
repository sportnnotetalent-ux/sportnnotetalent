/** Organisation verification, Phase 3 (2026-10-27, migration
 *  20261027190000_org_verification_international): a community's market decides
 *  which official IDs it gives — UK, US, Singapore, Malaysia, Australia, the
 *  Gulf — with formats, checksums, record links, and the same rules in the app
 *  and the database. India is unchanged. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTL_MARKETS, LOCAL_ID_TYPES, OFFICIAL_ID_RULES, ORG_VERIFY, REGISTERED_TYPES, abnOk, idCountry, normOfficialId, orgVerifyConfig,
  validOfficialId, type OfficialIdType,
} from '../src/core/orgVerification.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_org_verification_international'))!), 'utf8');

const OK: [OfficialIdType, string][] = [
  ['urn', '100000'], ['uk_school_ref', '5244439'], ['ukprn', '10007783'], ['companies_house', '01234567'], ['companies_house', 'SC123456'],
  ['uk_charity', '1123456'], ['uk_charity', 'SC012345'], ['uk_charity', 'NIC100002'], ['nces', '062271003230'], ['nces', 'A9100123'],
  ['ipeds', '166027'], ['ein', '12-3456789'], ['us_state_entity', 'C1234567'], ['uen', '201912345K'], ['uen', '53012345D'], ['uen', 'T08SS0001A'],
  ['sg_moe', '7001'], ['ssm', '201901012345'], ['ssm', '123456-A'], ['my_moe', 'WBA0001'], ['my_ros', 'PPM-001-10-01011980'],
  ['abn', '51824753556'], ['acara', '45678'], ['teqsa', 'PRV12345'], ['au_assoc', 'A0012345B'], ['gulf_school', 'KHDA-1234'],
  ['trade_licence', '123456'], ['other_reg', 'REG/2020/77'],
];
const BAD: [OfficialIdType, string][] = [
  ['urn', '12345'], ['ukprn', '20007783'], ['companies_house', 'ABC12345'], ['uk_charity', 'X123456'], ['nces', '12345'],
  ['ipeds', '1660270'], ['ein', '1234'], ['uen', '12345'], ['sg_moe', '701'], ['my_moe', 'WB0001'], ['abn', '51824753557'],
  ['acara', '1234'], ['teqsa', 'PRV1234'], ['other_reg', 'x'],
];

describe('the new IDs', () => {
  test('valid numbers pass (as people type them)', () => {
    for (const [t, v] of OK) assert.ok(validOfficialId(t, v), `${t} ${v}`);
    assert.ok(validOfficialId('abn', '51 824 753 556'), 'spaces in an ABN');
    assert.ok(validOfficialId('ein', '123456789'), 'an EIN without its dash');
    assert.ok(validOfficialId('companies_house', '1234567'), 'a Companies House number without its leading zero');
    assert.ok(validOfficialId('uen', '201912345k'), 'lower case');
  });
  test('wrong ones don\'t, including an ABN with a bad checksum', () => {
    for (const [t, v] of BAD) assert.ok(!validOfficialId(t, v), `${t} ${v}`);
    assert.equal(abnOk('51824753556'), true);
    assert.equal(abnOk('51824753557'), false);
  });
  test('normalised the same way the database does', () => {
    assert.equal(normOfficialId('ein', '12 3456789'), '12-3456789');
    assert.equal(normOfficialId('companies_house', '1234567'), '01234567');
    assert.equal(normOfficialId('abn', '51 824 753 556'), '51824753556');
    assert.equal(normOfficialId('urn', ' 100 000 '), '100000');
  });
  test('the register\'s own page, where it has one', () => {
    assert.equal(OFFICIAL_ID_RULES.urn.record!('100000'), 'https://get-information-schools.service.gov.uk/Establishments/Establishment/Details/100000');
    assert.equal(OFFICIAL_ID_RULES.companies_house.record!('01234567'), 'https://find-and-update.company-information.service.gov.uk/company/01234567');
    assert.match(OFFICIAL_ID_RULES.uk_charity.record!('1123456')!, /charitycommission\.gov\.uk\/charity-search\/-\/charity-details\/1123456$/);
    assert.match(OFFICIAL_ID_RULES.uk_charity.record!('SC012345')!, /oscr\.org\.uk.*number=SC012345$/);
    assert.equal(OFFICIAL_ID_RULES.uk_charity.record!('NIC100002'), undefined, 'NI: search instead');
    assert.match(OFFICIAL_ID_RULES.nces.record!('062271003230')!, /ccd\/schoolsearch\/school_detail\.asp\?ID=062271003230$/);
    assert.match(OFFICIAL_ID_RULES.nces.record!('A9100123')!, /pss\/privateschoolsearch\/school_detail\.asp\?ID=A9100123$/);
    assert.equal(OFFICIAL_ID_RULES.abn.record!('51824753556'), 'https://abr.business.gov.au/ABN/View?abn=51824753556');
    assert.equal(OFFICIAL_ID_RULES.acara.record!('45678'), 'https://www.myschool.edu.au/school/45678');
  });
});

describe('each market\'s step 1', () => {
  test('India is exactly as before', () => {
    for (const t of REGISTERED_TYPES) assert.deepEqual(orgVerifyConfig(t, 'in'), ORG_VERIFY[t], t);
    assert.deepEqual(orgVerifyConfig('School', undefined), ORG_VERIFY.School);
  });
  test('a UK school gives its URN; a US college its IPEDS ID; an Australian club its ABN; a Gulf Indian school CBSE', () => {
    assert.deepEqual(orgVerifyConfig('School', 'uk').requiredAnyOf, ['urn', 'uk_school_ref', 'other_reg']);
    assert.deepEqual(orgVerifyConfig('University', 'us').requiredAnyOf, ['ipeds', 'other_reg']);
    assert.deepEqual(orgVerifyConfig('Sports club', 'au').requiredAnyOf, ['abn', 'au_assoc', 'other_reg']);
    assert.equal(orgVerifyConfig('School', 'gulf-indian').requiredAnyOf[0], 'cbse');
    assert.deepEqual(orgVerifyConfig('School', 'uk').optional, ['ib', 'cambridge']);
    assert.match(orgVerifyConfig('School', 'uk').docKinds[0], /Ofsted/);
  });
  test('every market × type has a step 1, and the head / noun words carry over', () => {
    for (const m of INTL_MARKETS) for (const t of REGISTERED_TYPES) {
      const c = orgVerifyConfig(t, m);
      assert.ok(c.requiredAnyOf.length > 0, `${m} ${t}`);
      assert.equal(c.head, ORG_VERIFY[t].head);
      assert.ok(c.docKinds.length >= 2, `${m} ${t} docs`);
    }
  });
  test('IDs are recorded under the market\'s country', () => {
    assert.deepEqual(['in', 'uk', 'us', 'sg', 'my', 'au', 'gulf-british', 'gulf-indian', undefined].map(idCountry), ['IN', 'GB', 'US', 'SG', 'MY', 'AU', 'AE', 'AE', 'IN']);
  });
});

describe('the database has the same rules', () => {
  const types = Object.keys(OFFICIAL_ID_RULES) as OfficialIdType[];
  test('every ID type is allowed and has a format', () => {
    const allowed = /add constraint org_official_ids_id_type_check check \(id_type in \(([\s\S]*?)\)\);/.exec(sql)![1];
    for (const t of types) {
      assert.ok(allowed.includes(`'${t}'`), `${t} allowed`);
      assert.ok(sql.includes(`when '${t}' then`), `${t} in valid_official_id`);
    }
  });
  test('local numbers are the same list', () => {
    const local = /org_local_id_types\(\)[\s\S]*?select array\[([\s\S]*?)\];/.exec(sql)![1].match(/'([a-z_]+)'/g)!.map((x) => x.slice(1, -1));
    assert.deepEqual([...local].sort(), [...LOCAL_ID_TYPES].sort());
  });
  test('the per-market table matches the app for every market and type', () => {
    const rows = [...sql.matchAll(/\('([a-z-]+)', '((?:[^']|'')+)', array\[([^\]]+)\]\)/g)];
    assert.equal(rows.length, INTL_MARKETS.length * REGISTERED_TYPES.length);
    for (const [, m, t, ids] of rows) {
      const want = orgVerifyConfig(t.replace(/''/g, "'") as never, m).requiredAnyOf;
      assert.deepEqual(ids.split(',').map((x) => x.trim().slice(1, -1)), [...want], `${m} ${t}`);
    }
  });
  test('submitting checks the community\'s market; India keeps its own rule', () => {
    assert.match(sql, /need := org_required_id_types_for\(o\.type, o\.market\);/);
    assert.match(sql, /when coalesce\(nullif\(p_market, ''\), 'in'\) = 'in' then org_required_id_types\(p_type\)/);
    assert.match(sql, /when 'abn' then abn_ok\(p_value\)/);
  });
});

describe('in the app', () => {
  test('the verify screen, community creation and saving all follow the market', () => {
    const verify = read('src/screens/OrgVerifyScreen.tsx');
    assert.match(verify, /orgVerifyConfig\(type, org\.market\)/);
    assert.match(verify, /setOfficialIds\(orgId, ids, org\.market\)/);
    const create = read('src/screens/CreateCommunityScreen.tsx');
    assert.match(create, /orgVerifyConfig\(resolvedType, market\)\.requiredAnyOf\[0\]/);
    assert.match(create, /lookupOfficialId\(idType, officialId, market\)/);
    assert.match(read('src/data/orgVerification.ts'), /p_country: idCountry\(market\)/);
  });
});

describe('one verified community per national number', () => {
  test('the index exempts every local number, including the new ones', () => {
    const idx = /create unique index if not exists org_official_ids_one_verified[\s\S]*?not in \(([\s\S]*?)\);/.exec(sql)![1].match(/'([a-z_]+)'/g)!.map((x) => x.slice(1, -1));
    assert.deepEqual([...idx].sort(), [...LOCAL_ID_TYPES].sort());
  });
});
