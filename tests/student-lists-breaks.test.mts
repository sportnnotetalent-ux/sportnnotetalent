/**
 * Student lists — the "break it" pass (quality mandate, 2026-10-27). One test
 * per point in docs/security/breaks/student-lists.md, written BEFORE its fix.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { parseRoster, MAX_ROSTER_ROWS } from '../src/data/rosterImport.ts';
import {
  matchLocally, needsLeaverConfirm, planStudents, MATCH_CHUNK, PARENT_CHUNK, type MatchInput, type RowMatch,
} from '../src/data/studentList.ts';
import { readXlsx, parseSheet, XLSX_LIMITS } from '../src/core/xlsx.ts';
import type { OrgMember } from '../src/core/types.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_student_lists'))!), 'utf8');
const store = read('src/data/studentListStore.ts');
const fn = read('supabase/functions/school-parent-request/index.ts');
const today = new Date('2026-10-27T00:00:00Z');

const asha = { id: 'asha', fullName: 'Asha Rao', dob: '2014-03-05', contacts: ['p@example.com'] };
const row = (x: Partial<MatchInput> = {}): MatchInput => ({ i: 2, name: 'Asha Rao', dob: '2014-03-05', email: 'p@example.com', ...x });

describe('SL-01 a fake school can\'t reach parents (outside matches only for verified schools)', () => {
  test('server: step d only when the school is verified', () => {
    assert.match(sql, /verified := exists \(select 1 from organizations o where o\.id = p_org and o\.verified_at is not null\);/);
    assert.match(sql, /outside := case when verified then roster_outside_match\(p_org, k, d, em, ph\) end;/);
    assert.match(sql, /where k is not null and d is not null and \(em is not null or ph is not null\)/);
  });
  test('demo matcher: the same rule', () => {
    assert.equal(matchLocally([row()], [], [asha], {}, { verified: false })[0].kind, 'new');
    assert.equal(matchLocally([row()], [], [asha], {}, { verified: true })[0].kind, 'parent');
  });
});

describe('SL-02 no re-asking a parent who said no (180 days)', () => {
  test('server: a declined request comes back as "declined"', () => {
    assert.match(sql, /q\.status = 'rejected' and q\.decided_at > now\(\) - interval '180 days'\) then 'declined'/);
  });
  test('plan: nothing is done, and the school is told why', () => {
    const rows = parseRoster('Name,Date of birth\nAsha Rao,05/03/2014\n', { today }).rows;
    const p = planStudents({ rows, matches: [{ i: 2, kind: 'declined', why: 'elsewhere' }], members: [], admission: {}, scope: { kind: 'school' }, labels: [] });
    assert.equal(p.rows[0].action, 'invited');
    assert.match(p.rows[0].note!, /said no/);
  });
});

describe('SL-03 email volume is capped', () => {
  test('per call and per school per day', () => {
    assert.match(sql, /continue when sent_now >= 100;/);
    assert.match(sql, /today_count >= 500/);
  });
});

describe('SL-04 a child can\'t answer for their parent (accept or decline)', () => {
  test('both decisions are blocked for a possible minor', () => {
    assert.match(sql, /and new\.status in \('accepted', 'rejected'\)\s+and old\.details->>'source' = 'student_list'/);
  });
});

describe('SL-05 anonymous tries are rate-limited per network address', () => {
  test('the subject is the caller\'s IP, not the code', () => {
    assert.match(sql, /create or replace function request_subject\(\)/);
    assert.match(sql, /rate_limit_hit\('school-request', request_subject\(\), 60, 3600\)/);
    assert.ok(!/left\(p_code, 4\)/.test(sql));
  });
});

describe('SL-06 the parent\'s email address isn\'t kept after the answer', () => {
  test('cleared on a decision; old codes purged', () => {
    assert.match(sql, /update org_parent_requests set target_email = null where request_id = q\.id;/);
    assert.match(sql, /delete from org_parent_requests where expires_at < now\(\) - interval '30 days'/);
    assert.match(sql, /target_email text,\n/);
  });
});

describe('SL-07 a big school\'s first list doesn\'t time out', () => {
  test('rows go to the server 500 at a time; first names are indexed', () => {
    assert.equal(MATCH_CHUNK, 500);
    assert.match(store, /rows\.length; k \+= MATCH_CHUNK/);
    assert.match(sql, /create index if not exists players_roster_first_idx on players \(split_part\(coalesce\(roster_name_key\(full_name\), ''\), ' ', 1\)\);/);
  });
});

describe('SL-08 / SL-09 saving never deletes members and survives a failure part-way', () => {
  test('the import only upserts, and each new student joins the school as soon as they\'re created', () => {
    assert.ok(!/setOrgMembers\(/.test(store), 'setOrgMembers deletes members missing from its list');
    assert.match(store, /await upsertOrgMembers\(org\.id, \[\{ playerId: pl\.id/);
    assert.match(read('src/data/repos.ts'), /export async function upsertOrgMembers\(orgId: string, members: Organization\['members'\]\): Promise<void>/);
  });
});

describe('SL-10 / SL-11 files can\'t freeze the browser', () => {
  test('too many rows are refused, not parsed', () => {
    const big = 'Name\n' + Array.from({ length: MAX_ROSTER_ROWS + 1 }, (_, k) => `Kid ${k}`).join('\n');
    const p = parseRoster(big, { today });
    assert.equal(p.tooMany, true);
    assert.equal(p.rows.length, 0);
  });
  test('a zip bomb stops at the size limit', async () => {
    const huge = new Uint8Array(XLSX_LIMITS.entryBytes + 1024);
    const body = new Uint8Array(deflateRawSync(huge));
    const name = new TextEncoder().encode('xl/worksheets/sheet1.xml');
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(8, 8, true); h.setUint32(18, body.length, true); h.setUint32(22, 100, true); h.setUint16(26, name.length, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(10, 8, true); c.setUint32(20, body.length, true); c.setUint32(24, 100, true); c.setUint16(28, name.length, true);
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, 1, true); e.setUint16(10, 1, true); e.setUint32(12, 46 + name.length, true); e.setUint32(16, 30 + name.length + body.length, true);
    const parts = [new Uint8Array(h.buffer), name, body, new Uint8Array(c.buffer), name, new Uint8Array(e.buffer)];
    const zip = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let p = 0; for (const x of parts) { zip.set(x, p); p += x.length; }
    await assert.rejects(readXlsx(zip), /too big/i);
  });
  test('a malformed sheet stays linear (unclosed cells, a giant row)', () => {
    const bad = '<worksheet><sheetData><row r="1">' + '<c r="A1" t="s"><v>0'.repeat(20000) + '</row></sheetData></worksheet>';
    const t = Date.now();
    parseSheet(bad, ['x']);
    assert.ok(Date.now() - t < 1500, `took ${Date.now() - t} ms`);
  });
});

describe('SL-12 the school\'s text can\'t smuggle links into the email', () => {
  test('links stripped from the school name and class', () => {
    assert.match(fn, /const school = stripLinks\(clip\(inv\.school, 80\)\);/);
    assert.match(fn, /stripLinks\(clip\(inv\.standard, 40\)\)/);
  });
});

describe('SL-13 marking many students as left asks first', () => {
  test('20 or more, or a quarter of the school', () => {
    assert.equal(needsLeaverConfirm(19, 400), false);
    assert.equal(needsLeaverConfirm(20, 400), true);
    assert.equal(needsLeaverConfirm(10, 40), true);
    assert.equal(needsLeaverConfirm(3, 40), false);
    assert.match(read('src/screens/StudentImportScreen.tsx'), /needsLeaverConfirm\(plan\.leavers\.length/);
  });
});

describe('SL-14 an admission number on someone else\'s name is a check, not a move', () => {
  const members = [{ id: 'tara', fullName: 'Tara Menon', dob: '2014-02-14', contacts: [], left: false }];
  test('demo matcher', () => {
    assert.deepEqual(matchLocally([row({ name: 'Rahul Shah', adm: 'L101', dob: undefined, email: undefined })], members, [], { tara: 'L101' })[0],
      { i: 2, kind: 'check', playerId: 'tara', why: 'admission_name', left: false });
    assert.equal(matchLocally([row({ name: 'Tara M.', adm: 'L101' })], members, [], { tara: 'L101' })[0].kind, 'member', 'a shortened name is still her');
  });
  test('server', () => {
    assert.match(sql, /why := 'admission_name'/);
  });
});

describe('SL-15 Excel 1904 dates', () => {
  test('a workbook in the 1904 system reads the right date of birth', async () => {
    const enc = new TextEncoder();
    const files = [
      ['xl/workbook.xml', '<workbook><workbookPr date1904="1"/><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/styles.xml', '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>40241</v></c></row></sheetData></worksheet>'],
    ] as const;
    let off = 0; const chunks: Uint8Array[] = []; const cds: Uint8Array[] = [];
    for (const [n, d] of files) {
      const name = enc.encode(n), body = enc.encode(d);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint32(18, body.length, true); h.setUint32(22, body.length, true); h.setUint16(26, name.length, true);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint32(20, body.length, true); c.setUint32(24, body.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      chunks.push(new Uint8Array(h.buffer), name, body); cds.push(new Uint8Array(c.buffer), name); off += 30 + name.length + body.length;
    }
    const cdLen = cds.reduce((n, x) => n + x.length, 0);
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdLen, true); e.setUint32(16, off, true);
    const all = [...chunks, ...cds, new Uint8Array(e.buffer)];
    const zip = new Uint8Array(all.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of all) { zip.set(x, p); p += x.length; }
    // 40241 in the 1904 system = 2014-03-05 (in the 1900 system it would be 2010-03-04)
    assert.deepEqual(await readXlsx(zip), [['2014-03-05']]);
  });
});

describe('SL-16 a name with no date of birth on either side only counts in the expected class', () => {
  const members: OrgMember[] = [
    { playerId: 'rahul', role: 'Member', since: '2025-06-01', grades: [{ standard: 'Class 3-A', since: '2025-06-01' }] },
  ];
  const plan = (cls: string) => planStudents({
    rows: parseRoster(`Name,Class\nRahul Kumar,${cls}\n`, { today }).rows,
    matches: [{ i: 2, kind: 'member', playerId: 'rahul', why: 'name' }], members, admission: {}, scope: { kind: 'school' }, labels: ['Class 3-A'],
  }).rows[0];
  test('the same class or the next one up: the same student', () => {
    assert.equal(plan('Class 3').action, 'move');
    assert.equal(plan('Class 4').action, 'move');
    assert.equal(plan('Class 3-A').action, 'same');
  });
  test('any other class: the school decides', () => {
    const p = plan('Class 9');
    assert.equal(p.action, 'check');
    assert.equal(p.canBeSame, true);
  });
});

describe('SL-17 length limits', () => {
  test('a very long name can\'t be read; other cells are cut', () => {
    const p = parseRoster(`Name,House\n${'A'.repeat(121)},${'R'.repeat(500)}\n`, { today });
    assert.match(p.rows[0].errors.join(), /too long/);
    assert.equal(parseRoster(`Name,House\nAsha Rao,${'R'.repeat(500)}\n`, { today }).rows[0].house!.length, 60);
  });
  test('server: names are cut before matching', () => {
    assert.match(sql, /k := roster_name_key\(left\(r\.rname, 200\)\);/);
  });
});

describe('SL-18 emails go out in batches the function can finish', () => {
  test('the app sends children found elsewhere 100 at a time', () => {
    assert.equal(PARENT_CHUNK, 100);
    assert.match(store, /k \+= PARENT_CHUNK/);
  });
});

describe('SL-20 swapping two admission numbers works', () => {
  test('numbers being moved are freed first (server path) — demo store does the same', () => {
    assert.match(store, /\.delete\(\)\.eq\('org_id', orgId\)\.in\('player_id', moving\)/);
  });
});

describe('SL-24 (found by the simulation) two children with the same name are two rows', () => {
  test('different admission numbers, no dates of birth: both imported', () => {
    const p = parseRoster('Admission no,Name\nA1,Asha Singh\nA2,Asha Singh\n', { today });
    assert.equal(p.rows[1].dupInFile, undefined);
  });
  test('the same child twice with a mistyped number is still caught (same name and date of birth)', () => {
    const p = parseRoster('Admission no,Name,Date of birth\nA1,Asha Singh,05/03/2014\nA7,Asha Singh,05/03/2014\n', { today });
    assert.equal(p.rows[1].dupInFile, 2);
  });
  test('a name alone, twice, with nothing else: imported once', () => {
    const p = parseRoster('Name\nAsha Singh\nAsha Singh\n', { today });
    assert.equal(p.rows[1].dupInFile, 2);
  });
});

describe('SL-25 (found by the simulation) a child elsewhere isn\'t duplicated when a classmate shares their name', () => {
  const classmate = [{ id: 'other-arjun', fullName: 'Arjun Rao', dob: '2011-03-28', contacts: [], left: false }];
  const elsewhereArjun = [{ id: 'ext', fullName: 'Arjun Rao', dob: '2013-01-13', contacts: ['p@example.com'] }];
  test('same name + date of birth + parent contact elsewhere beats "same name, other date of birth" here', () => {
    assert.equal(matchLocally([row({ name: 'Arjun Rao', dob: '2013-01-13' })], classmate, elsewhereArjun, {}, { verified: true })[0].kind, 'parent');
  });
  test('…and beats an admission number that belongs to someone else', () => {
    const tara = [{ id: 'tara', fullName: 'Tara Menon', dob: '2014-02-14', contacts: [], left: false }];
    assert.equal(matchLocally([row({ name: 'Arjun Rao', dob: '2013-01-13', adm: 'L101' })], tara, elsewhereArjun, { tara: 'L101' }, { verified: true })[0].kind, 'parent');
  });
  test('server: the outside check runs before a check is returned', () => {
    assert.match(sql, /-- SL-25: a child elsewhere/);
  });
});
