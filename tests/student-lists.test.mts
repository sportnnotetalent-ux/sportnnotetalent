/**
 * Student lists (2026-10-27, founder 1A / 2A / 3A): a school uploads its
 * students — the whole school, one class or one section — from CSV, Excel or
 * pasted rows; existing students are recognised (admission number, name + date
 * of birth, first name + a parent's contact) and moved to their new class; a
 * child already on SportnNote elsewhere is never duplicated — their parent is
 * asked by email (the school sees nothing of them); a whole-school list can
 * mark the students missing from it as left, only when the school ticks it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { parseRoster } from '../src/data/rosterImport.ts';
import {
  composeClass, matchInputs, matchLocally, membersAfter, planStudents, rowClass, rowClasses, sameClassAndSection, sortClasses, splitClassSection,
  type ListScope, type RowMatch,
} from '../src/data/studentList.ts';
import { excelDate, parseDateStyles, parseSharedStrings, parseSheet, readXlsx, rowsToTsv } from '../src/core/xlsx.ts';
import type { OrgMember } from '../src/core/types.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_student_lists'))!), 'utf8');
const today = new Date('2026-10-27T00:00:00Z');

describe('reading a list', () => {
  test('admission number and section columns; "Admission date" isn\'t the number', () => {
    const p = parseRoster('Adm No,Student Name,DOB,Class,Section,Admission Date\nA-17,Asha Rao,05/03/2014,7,B,01/06/2020\n', { today });
    assert.equal(p.rows[0].admissionNo, 'A-17');
    assert.equal(p.rows[0].section, 'B');
    assert.equal(p.rows[0].standard, '7');
    assert.notEqual(p.mapped.admissionNo, 5);
  });
  test('the same admission number twice in a file is one student', () => {
    const p = parseRoster('Admission no,Name\nA1,Asha Rao\nA1,Asha R.\n', { today });
    assert.equal(p.rows[1].dupInFile, 2);
  });
});

describe('class and section', () => {
  test('split the ways schools write them; "Class X", "Year 8" and "Pre-KG" stay whole', () => {
    const cases: [string, string, string?][] = [
      ['Class 7-B', 'Class 7', 'B'], ['7B', '7', 'B'], ['VII B', 'VII', 'B'], ['Grade 9 / C', 'Grade 9', 'C'], ['LKG-A', 'LKG', 'A'],
      ['Class 9-Rose', 'Class 9', 'Rose'], ['Class X', 'Class X'], ['Year 8', 'Year 8'], ['Pre-KG', 'Pre-KG'], ['Class X B', 'Class X', 'B'],
    ];
    for (const [label, cls, section] of cases) assert.deepEqual(splitClassSection(label), { cls, ...(section ? { section } : {}) }, label);
  });
  test('put together in the school\'s own wording', () => {
    const school = ['Class 7-A', 'Class 8-A', 'Class 10-C'];
    assert.equal(composeClass('7', 'B', school), 'Class 7-B', 'a bare number takes the school\'s word');
    assert.equal(composeClass('VII', 'b', school), 'Class 7-B', 'the same class in other words');
    assert.equal(composeClass('7B', undefined, school), 'Class 7-B');
    assert.equal(composeClass('Grade 4', undefined, ['Grade 3']), 'Grade 4');
    assert.equal(composeClass('5', undefined, []), 'Class 5');
    assert.equal(composeClass('', 'B', school), undefined);
  });
  test('same class and section — not just the same class', () => {
    assert.ok(sameClassAndSection('Class 7-B', 'Std VII B'));
    assert.ok(!sameClassAndSection('Class 7-A', 'Class 7-B'));
    assert.ok(!sameClassAndSection('Class 7', 'Class 8'));
  });
  test('one class or section: rows take it, unless a row has its own section', () => {
    const labels = ['Class 7-A'];
    const scope: ListScope = { kind: 'class', cls: 'Class 7', section: 'B' };
    assert.equal(rowClass({}, scope, labels), 'Class 7-B');
    assert.equal(rowClass({ section: 'C' }, scope, labels), 'Class 7-C');
    assert.equal(rowClass({ standard: '7-D' }, scope, labels), 'Class 7-D');
    assert.equal(rowClass({ standard: 'Class 7' }, { kind: 'class', cls: 'Class 7' }, labels), 'Class 7');
    assert.equal(rowClass({ standard: '8', section: 'A' }, { kind: 'school' }, labels), 'Class 8-A');
    assert.deepEqual(sortClasses(['Class 10-A', 'Class 2-B', 'Class 2-A']), ['Class 2-A', 'Class 2-B', 'Class 10-A']);
  });
  test('one class written two ways in one list stays one class', () => {
    const rows = parseRoster('Name,Class,Section\nIra,VIII,A\nKian,8B,\nTara,Class 8,C\n', { today }).rows;
    assert.deepEqual([...rowClasses(rows, { kind: 'school' }, []).values()], ['Class VIII-A', 'Class VIII-B', 'Class VIII-C']);
  });
});

/* ------------------------------ a small school ------------------------------ */

const m = (playerId: string, standard: string | undefined, extra: Partial<OrgMember> = {}): OrgMember =>
  ({ playerId, role: 'Member', since: '2025-06-01', ...(standard ? { grades: [{ standard, since: '2025-06-01' }] } : {}), houses: [{ house: 'Red', since: '2025-06-01' }], ...extra });
const members: OrgMember[] = [
  m('asha', 'Class 6-B'), m('ravi', 'Class 6-A'), m('meera', 'Class 6-A'), m('kabir', 'Class 6-B'),
  m('old', 'Class 6-C', { until: '2026-04-01', grades: [{ standard: 'Class 6-C', since: '2025-06-01', until: '2026-04-01' }] }),
  m('coach', undefined, { role: 'Admin' }),
];
const people = [
  { id: 'asha', fullName: 'Asha Rao', dob: '2014-03-05', contacts: ['meera.rao@example.com'], left: false },
  { id: 'ravi', fullName: 'Ravi Kumar', dob: '2014-01-10', contacts: [], left: false },
  { id: 'meera', fullName: 'Meera Shah', dob: '2014-07-07', contacts: ['+919845000001'], left: false },
  { id: 'kabir', fullName: 'Kabir Das', dob: '2014-02-02', contacts: [], left: false },
  { id: 'old', fullName: 'Old Student', dob: '2013-01-01', contacts: [], left: true },
];
const elsewhere = [{ id: 'club-kid', fullName: 'Zoya Khan', dob: '2014-09-09', contacts: ['zk.parent@example.com'] }];
const LIST = [
  'Admission no,Name,Date of birth,Class,Section,House,Guardian email,Guardian phone',
  'A17,Asha Rao,05/03/2014,7,B,Blue,,',          // admission number (moves class, changes House)
  ',Ravi Kumar,10/01/2014,7,A,Red,,',             // name + date of birth
  ',Meera Sh.,,7,A,,,+91 98450 00001',            // first name + parent phone
  ',Zoya Khan,09/09/2014,7,C,,zk.parent@example.com,', // a child elsewhere: parent asked
  ',Kabir Das,03/03/2013,7,B,,,',                 // name, another date of birth: check
  ',New Kid,01/01/2014,7,B,,,',                   // new
  ',Old Student,01/01/2013,7,C,,,',               // a past student back
  ',Bad Date,31/02/2014,7,B,,,',                  // can't be read
].join('\n');

describe('recognising students', () => {
  const parsed = parseRoster(LIST, { today });
  const inputs = matchInputs(parsed.rows, { kind: 'school' }, ['Class 6-A', 'Class 6-B']);
  const matches = matchLocally(inputs, people, elsewhere, { asha: 'A17' });
  const kindOf = (name: string) => matches.find((x) => x.i === parsed.rows.find((r) => r.fullName === name)!.line);
  test('admission number → name + date of birth → first name + parent contact → elsewhere → new', () => {
    assert.deepEqual(kindOf('Asha Rao'), { i: 2, kind: 'member', playerId: 'asha', why: 'admission', left: false });
    assert.equal(kindOf('Ravi Kumar')?.why, 'name_dob');
    assert.deepEqual([kindOf('Meera Sh.')?.kind, kindOf('Meera Sh.')?.playerId, kindOf('Meera Sh.')?.why], ['member', 'meera', 'contact']);
    assert.deepEqual(kindOf('Zoya Khan'), { i: 5, kind: 'parent', why: 'elsewhere' }, 'no id for a child elsewhere');
    assert.deepEqual([kindOf('Kabir Das')?.kind, kindOf('Kabir Das')?.why], ['check', 'dob_differs']);
    assert.equal(kindOf('New Kid')?.kind, 'new');
    assert.deepEqual([kindOf('Old Student')?.kind, kindOf('Old Student')?.left], ['member', true]);
    assert.equal(inputs.some((x) => x.name === 'Bad Date'), false, 'rows that can\'t be read aren\'t sent');
  });
  test('the server is asked with the class and House each row ends up with', () => {
    assert.deepEqual(inputs.find((x) => x.name === 'Asha Rao'), { i: 2, name: 'Asha Rao', dob: '2014-03-05', adm: 'A17', standard: 'Class 7-B', house: 'Blue' });
  });

  const plan = (choices = {}, scope: ListScope = { kind: 'school' }, ms: RowMatch[] = matches) =>
    planStudents({ rows: parsed.rows, matches: ms, members, admission: { asha: 'A17' }, scope, labels: ['Class 6-A', 'Class 6-B'], choices });
  test('what happens to each row', () => {
    const p = plan();
    const act = (name: string) => p.rows.find((r) => r.row.fullName === name)!;
    assert.deepEqual([act('Asha Rao').action, act('Asha Rao').fromStandard, act('Asha Rao').standard], ['move', 'Class 6-B', 'Class 7-B']);
    assert.equal(act('Ravi Kumar').action, 'move');
    assert.equal(act('Zoya Khan').action, 'parent');
    assert.deepEqual([act('Kabir Das').action, act('Kabir Das').canBeSame], ['check', true]);
    assert.equal(act('New Kid').action, 'new');
    assert.equal(act('Old Student').action, 'rejoin');
    assert.equal(act('Bad Date').action, 'skip');
    assert.deepEqual(p.counts, { new: 1, move: 3, update: 0, same: 0, rejoin: 1, parent: 1, invited: 0, check: 1, skip: 1 });
  });
  test('the school answers a check: the same student, a new one, or skip', () => {
    const line = parsed.rows.find((r) => r.fullName === 'Kabir Das')!.line;
    assert.equal(plan({ [line]: 'same' }).rows.find((r) => r.row.line === line)!.action, 'move');
    assert.equal(plan({ [line]: 'new' }).rows.find((r) => r.row.line === line)!.action, 'new');
    assert.equal(plan({ [line]: 'skip' }).rows.find((r) => r.row.line === line)!.action, 'skip');
  });
  test('nothing changes for a student already in that class and House; a new admission number is an update', () => {
    const same = planStudents({ rows: parseRoster('Name,Date of birth,Class,House\nRavi Kumar,10/01/2014,Class 6-A,Red\n', { today }).rows,
      matches: [{ i: 2, kind: 'member', playerId: 'ravi', why: 'name_dob' }], members, admission: {}, scope: { kind: 'school' }, labels: [] });
    assert.equal(same.rows[0].action, 'same');
    const upd = planStudents({ rows: parseRoster('Admission no,Name,Class\nB9,Ravi Kumar,Class 6-A\n', { today }).rows,
      matches: [{ i: 2, kind: 'member', playerId: 'ravi', why: 'name' }], members, admission: {}, scope: { kind: 'school' }, labels: [] });
    assert.equal(upd.rows[0].action, 'update');
  });
  test('whole school: current students with a class who aren\'t on it may be marked as left — staff never', () => {
    assert.deepEqual(plan().leavers, [], 'everyone is on the list (Kabir is a check)');
    const fewer = planStudents({ rows: parsed.rows.slice(0, 2), matches, members, admission: { asha: 'A17' }, scope: { kind: 'school' }, labels: [] });
    assert.deepEqual(fewer.leavers.map((l) => l.playerId).sort(), ['kabir', 'meera'], 'Asha and Ravi are on it; the past student and the coach aren\'t counted');
    assert.deepEqual(plan({}, { kind: 'class', cls: 'Class 7' }).leavers, [], 'one class: no leavers');
  });

  test('the member list after saving', () => {
    const p = plan();
    const after = membersAfter(members, p, [{ line: parsed.rows.find((r) => r.fullName === 'New Kid')!.line, playerId: 'newkid' }], '2026-10-27', false);
    const by = (id: string) => after.find((x) => x.playerId === id)!;
    assert.deepEqual(by('asha').grades, [{ standard: 'Class 6-B', since: '2025-06-01', until: '2026-10-27' }, { standard: 'Class 7-B', since: '2026-10-27' }]);
    assert.deepEqual(by('asha').houses, [{ house: 'Red', since: '2025-06-01', until: '2026-10-27' }, { house: 'Blue', since: '2026-10-27' }]);
    assert.deepEqual([by('old').until, by('old').since, by('old').grades!.at(-1)], [undefined, '2026-10-27', { standard: 'Class 7-C', since: '2026-10-27' }]);
    assert.deepEqual(by('newkid'), { playerId: 'newkid', role: 'Member', since: '2026-10-27', grades: [{ standard: 'Class 7-B', since: '2026-10-27' }] });
    assert.equal(after.some((x) => x.playerId === 'club-kid'), false, 'a child elsewhere joins only when the parent agrees');
    const fewer = planStudents({ rows: parsed.rows.slice(0, 2), matches, members, admission: {}, scope: { kind: 'school' }, labels: [] });
    const gone = membersAfter(members, fewer, [], '2026-10-27', true).find((x) => x.playerId === 'meera')!;
    assert.deepEqual([gone.until, gone.grades!.at(-1)!.until, gone.houses!.at(-1)!.until], ['2026-10-27', '2026-10-27', '2026-10-27']);
    assert.equal(membersAfter(members, fewer, [], '2026-10-27', false).find((x) => x.playerId === 'meera')!.until, undefined, 'only when ticked');
  });
});

/* ---------------------------------- Excel ---------------------------------- */

function zip(files: { name: string; data: Uint8Array; deflate?: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(8, f.deflate ? 8 : 0, true);
    h.setUint32(18, body.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, f.deflate ? 8 : 0, true);
    c.setUint32(20, body.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    chunks.push(new Uint8Array(h.buffer), name, body);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, x) => n + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

describe('Excel files', () => {
  const sst = '<sst><si><t>Name</t></si><si><t>Date of birth</t></si><si><r><t>Asha </t></r><r><t>Rao</t></r></si><si><t>Admission no</t></si></sst>';
  const styles = '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>';
  const sheet = '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>3</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2"><v>1017</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" s="1"><v>41703</v></c></row>'
    + '<row r="3"><c r="B3" t="inlineStr"><is><t>Ravi &amp; Co</t></is></c><c r="D3"><v>9845000001</v></c></row>'
    + '</sheetData></worksheet>';
  test('shared strings, date cells, inline strings, gaps and long numbers', () => {
    assert.deepEqual(parseSharedStrings(sst), ['Name', 'Date of birth', 'Asha Rao', 'Admission no']);
    assert.deepEqual([...parseDateStyles(styles)], [1]);
    assert.equal(excelDate(41703), '2014-03-05');
    assert.deepEqual(parseSheet(sheet, parseSharedStrings(sst), parseDateStyles(styles)), [
      ['Admission no', 'Name', 'Date of birth'], ['1017', 'Asha Rao', '2014-03-05'], ['', 'Ravi & Co', '', '9845000001'],
    ]);
  });
  test('a whole workbook — zipped, compressed, the first sheet in the workbook\'s order — reads like a CSV', async () => {
    const enc = new TextEncoder();
    const book = zip([
      { name: 'xl/workbook.xml', data: enc.encode('<workbook><sheets><sheet name="Students" sheetId="1" r:id="rId3"/><sheet name="Notes" sheetId="2" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Target="worksheets/sheet2.xml"/></Relationships>') },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>notes</t></is></c></row></sheetData></worksheet>'), deflate: true },
      { name: 'xl/worksheets/sheet2.xml', data: enc.encode(sheet), deflate: true },
      { name: 'xl/sharedStrings.xml', data: enc.encode(sst), deflate: true },
      { name: 'xl/styles.xml', data: enc.encode(styles) },
    ]);
    const rows = await readXlsx(book);
    assert.equal(rows[1][1], 'Asha Rao');
    const parsed = parseRoster(rowsToTsv(rows), { today });
    assert.deepEqual([parsed.rows[0].fullName, parsed.rows[0].dob, parsed.rows[0].admissionNo], ['Asha Rao', '2014-03-05', '1017']);
  });
});

/* -------------------------------- the server -------------------------------- */

describe('the database', () => {
  test('admission numbers: the school\'s Owners / Admins only, one student per number', () => {
    assert.match(sql, /create unique index if not exists org_member_ids_admission_uk on org_member_ids \(org_id, upper\(btrim\(admission_no\)\)\)/);
    assert.match(sql, /create policy org_member_ids_admins on org_member_ids for all to authenticated\s+using \(has_org_role\(org_id, array\['Owner', 'Admin'\]\)\)/);
    assert.match(sql, /revoke all on org_member_ids from anon;/);
  });
  test('matching: Owners / Admins, rate-limited; a child elsewhere never comes back with an id', () => {
    assert.match(sql, /if not has_org_role\(p_org, array\['Owner', 'Admin'\]\) then/);
    assert.match(sql, /rate_limit_hit\('roster-match', auth\.uid\(\)::text, 120, 3600\)/);
    assert.match(sql, /'playerId', case when x\.kind in \('member', 'check'\) then x\.player_id end/);
    assert.match(sql, /grant execute on function org_roster_match\(uuid, jsonb\) to authenticated;/);
    // the outside match needs the same name, date of birth AND a parent contact
    assert.match(sql, /and roster_name_key\(p\.full_name\) = k and p\.dob = d\s+and not exists \(select 1 from org_members m where m\.org_id = p_org and m\.player_id = p\.id\)\s+and exists \(select 1 from player_contact_keys\(p\.id\)/);
  });
  test('the email goes to the parent ON FILE (or the adult student) — never an address the school typed', () => {
    assert.match(sql, /email := lower\(roster_request_email\(x\.player_id\)\);/);
    assert.match(sql, /when player_is_known_adult\(p\.dob, p\.profile_id\)\s+then coalesce\(\(select u\.email from auth\.users u where u\.id = p\.profile_id\)/);
    assert.match(sql, /grant execute on function org_roster_invite\(uuid, uuid, jsonb\) to service_role;/);
    assert.match(sql, /revoke all on function org_roster_invite\(uuid, uuid, jsonb\) from public, anon, authenticated;/);
    const fn = read('supabase/functions/school-parent-request/index.ts');
    assert.match(fn, /admin\.rpc\('org_roster_invite', \{ p_org: orgId, p_by: uid, p_rows: rows \}\)/);
    assert.match(fn, /await sendEmail\(\s+inv\.email,/);
    assert.match(fn, /rateLimit\('school-parent-request', uid, 20, 3600\)/);
  });
  test('the parent decides on a public page; codes hashed, 30 days', () => {
    assert.match(sql, /grant execute on function school_request_preview\(text\) to anon, authenticated;/);
    assert.match(sql, /grant execute on function school_request_decide\(text, boolean\) to anon, authenticated;/);
    assert.match(sql, /encode\(sha256\(convert_to\(code, 'UTF8'\)\), 'hex'\), email, now\(\) \+ interval '30 days'/);
    assert.match(sql, /revoke all on org_parent_requests from anon, authenticated;/);
  });
  test('a child can\'t accept the school\'s request themselves (membership or the request)', () => {
    assert.match(sql, /create trigger apply_roster_invite_details before insert on org_members/);
    assert.match(sql, /create trigger guard_roster_invite_answer before update on org_requests/);
    assert.equal((sql.match(/A parent or guardian approves this/g) ?? []).length, 2);
  });
});

describe('in the app', () => {
  test('a school\'s Members tab opens "Add students"; other communities keep the CSV import', () => {
    assert.match(read('src/screens/OrganizationScreen.tsx'), /academic \? nav\.navigate\('StudentImport', \{ orgId: org\.id \}\) : nav\.navigate\('RosterImport', \{ orgId: org\.id \}\)/);
    const navSrc = read('src/navigation/RootNavigator.tsx');
    assert.match(navSrc, /name="StudentImport"/);
    assert.match(navSrc, /SchoolRequest: 'school-request',/);
  });
  test('the parent\'s link opens the app on Android (from the next APK) and is pinned near the database', () => {
    assert.match(read('src/core/androidAppLinks.ts'), /'\/school-request'/);
    assert.match(read('app.json'), /"pathPrefix": "\/school-request"/);
    assert.match(read('src/core/functionRegion.ts'), /'school-parent-request'/);
  });
  test('leavers are marked only when the school ticks it', () => {
    const screen = read('src/screens/StudentImportScreen.tsx');
    assert.match(screen, /useState\(false\);\n  const \[open/);
    assert.match(screen, /applyStudentList\(org, plan, inputs, \{ today: todayIn\(\), markLeft \}\)/);
  });
});
