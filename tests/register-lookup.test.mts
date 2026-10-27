/** Register lookup (2026-10-27): support checks a school's CBSE affiliation
 *  number against the public register (CBSE SARAS) without retyping it — the
 *  record is read on demand, compared with what the school entered, and every
 *  other register gets a one-tap copy + link. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSaras, sarasUrl } from '../supabase/functions/_shared/saras.ts';
import { affiliationCurrent, compareHeads, compareNames } from '../src/core/registerLookup.ts';
import { OFFICIAL_ID_RULES } from '../src/core/orgVerification.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** A record laid out like SARAS's "AfflicationDetails" page (made-up school). */
const row = (label: string, value: string) => `<tr>\n <td valign="top" height="8" width="433">\n  <b>${label}</b>\n </td>\n <td height="8" width="494">\n  ${value}\n </td>\n</tr>`;
const PAGE = `<html><body><table>
${row('Name of Institution', 'ST. ANNE&#39;S SR. SEC. SCHOOL')}
${row('Affiliation Number', '2130456')}
${row('State', 'KARNATAKA')}
${row('District', 'BENGALURU URBAN')}
${row('Postal Address', '12 MG ROAD &amp; 3RD CROSS')}
${row('Pin Code', '560001')}
${row('Name of Principal/ Head of Institution', 'Sr. Mary Thomas')}
${row('Status of The School', 'Senior Secondary Level')}
${row('School Type', 'INDEPENDENT')}
<tr style="display:none;"><td><b>Type of affiliation</b></td><td> </td></tr>
<tr><td width="433" valign="top" align="left"><b>Affiliation Period </b></td><td><p><b>From :</b> &nbsp;01/04/2021&nbsp; <b> To :</b> &nbsp;31/03/2026&nbsp; </p></td></tr>
${row('Name of Trust/ Society/ Managing Committee', 'ST ANNE EDUCATION SOCIETY')}
</table></body></html>`;

describe('reading a CBSE SARAS record', () => {
  test('every field, entities decoded, the period as dates', () => {
    assert.deepEqual(parseSaras(PAGE), {
      name: "ST. ANNE'S SR. SEC. SCHOOL", affiliation: '2130456', state: 'KARNATAKA', district: 'BENGALURU URBAN',
      address: '12 MG ROAD & 3RD CROSS', pin: '560001', head: 'Sr. Mary Thomas', status: 'Senior Secondary Level',
      schoolType: 'INDEPENDENT', trust: 'ST ANNE EDUCATION SOCIETY', from: '2021-04-01', to: '2026-03-31',
    });
  });
  test('a number with no school → null; the record\'s address', () => {
    assert.equal(parseSaras('<html><body><h1>SARAS</h1></body></html>'), null);
    assert.equal(sarasUrl('1930001'), 'https://saras.cbse.gov.in/SARAS/AffiliatedList/AfflicationDetails/1930001');
    assert.equal(OFFICIAL_ID_RULES.cbse.record!('1930001'), sarasUrl('1930001'), 'the card links to the same record');
  });
});

describe('comparing with what the school entered', () => {
  test('names: filler words, case and punctuation don\'t count', () => {
    assert.equal(compareNames("St Anne's School", "ST. ANNE'S SR. SEC. SCHOOL"), 'match');
    assert.equal(compareNames('The Lawrence School Lovedale', 'THE LAWRENCE SCHOOL'), 'close');
    assert.equal(compareNames('Delhi Public School, R.K. Puram', 'DELHI PUBLIC SCHOOL R K PURAM'), 'match');
    assert.equal(compareNames('Greenwood High', 'NATIONAL PUBLIC SCHOOL'), 'differs');
  });
  test('the Head who confirmed vs the register\'s principal (titles and initials ignored)', () => {
    assert.equal(compareHeads('Dr. Vikram Rao', 'Vikram Rao'), 'match');
    assert.equal(compareHeads('Dr. V. Rao', 'Dr. Vikram Rao'), 'close');
    assert.equal(compareHeads('Anita Sharma', 'Dhavala Venkata Someswara Rao'), 'differs');
    assert.equal(compareHeads(undefined, 'Someone'), undefined);
  });
  test('is the affiliation current?', () => {
    assert.equal(affiliationCurrent({ to: '2026-03-31' }, '2026-10-27'), false);
    assert.equal(affiliationCurrent({ to: '2029-03-31' }, '2026-10-27'), true);
    assert.equal(affiliationCurrent({}, '2026-10-27'), undefined);
  });
});

describe('the server function and the card', () => {
  test('support only, rate-limited, one CBSE record per request', () => {
    const fn = read('supabase/functions/register-lookup/index.ts');
    assert.match(fn, /role !== 'support' && role !== 'admin'[\s\S]*SportnNote support only/);
    assert.match(fn, /rateLimit\('register-lookup', caller\.user\.id, 120, 3600\)/);
    assert.match(fn, /raw\.type !== 'cbse'/);
    assert.match(fn, /\/\^\\d\{4,8\}\$\/\.test\(value\)/);
    assert.match(fn, /AbortSignal\.timeout\(12_000\)/);
  });
  test('the review card: the record link, copy on the web, the register panel for CBSE', () => {
    const card = read('src/screens/VerificationReviewScreen.tsx');
    assert.match(card, /rule\?\.record \? <Text style=\{st\.link\}/);
    assert.match(card, /Platform\.OS === 'web' \? <CopyText value=\{i\.value\} \/>/);
    assert.match(card, /canLookUp\(i\.type\) \? <RegisterCheck value=\{i\.value\} orgName=\{o\.name\}/);
  });
});
