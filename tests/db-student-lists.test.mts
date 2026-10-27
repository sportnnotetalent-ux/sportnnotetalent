/**
 * Student lists (migration 20261028100000_student_lists) — integration tests
 * against a real Postgres (PGlite, every migration applied). The functions were
 * reviewed by hand when written (no database then); these run them for real.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
let admin: { uid: string; player: string };
let org: string;
let tara: string;                       // a student already at the school (admission L101)
let ext: string;                         // a child elsewhere (another coach added her, parent email on file)
let outsiderCoach: string;

async function person(name: string, dob = '1985-01-01') {
  const uid = await db.signUp({ name, dob });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
  return { uid, player: p.id };
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

before(async () => {
  db = await bootDb({ strict: true });
  admin = await person('Principal Rao');
  const [o] = await db.as<{ id: string }>(admin.uid, `insert into organizations (name, type, created_by) values ('Greenwood High', 'School', auth.uid()) returning id`);
  org = o.id;
  await db.as(admin.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [org, admin.player]);
  const [t] = await db.as<{ id: string }>(admin.uid, `insert into players (full_name, dob) values ('Tara Menon', '2014-02-14') returning id`);
  tara = t.id;
  await db.as(admin.uid, `insert into org_members (org_id, player_id, role, since, grades) values ($1, $2, 'Member', current_date, '[{"standard":"Class 7-A","since":"2026-06-01"}]')`, [org, tara]);
  await db.as(admin.uid, `insert into org_member_ids (org_id, player_id, admission_no) values ($1, $2, 'L101')`, [org, tara]);
  outsiderCoach = (await person('Club Coach')).uid;
  const [e] = await db.as<{ id: string }>(outsiderCoach,
    `insert into players (full_name, dob, guardian) values ('Zoya Khan', '2014-09-09', '{"name":"Parent","email":"zoya.parent@example.com"}') returning id`);
  ext = e.id;
});

describe('admission numbers: the school\'s admins only', () => {
  test('a stranger can neither read nor write them', async () => {
    const stranger = await person('Stranger');
    assert.deepEqual(await db.as(stranger.uid, `select * from org_member_ids`), []);
    const err = await errOf(() => db.as(stranger.uid, `insert into org_member_ids (org_id, player_id, admission_no) values ($1, $2, 'X1')`, [org, tara]));
    assert.match(err ?? '', /row-level security/);
    assert.deepEqual(await db.asAnon(`select * from org_member_ids`).catch(() => []), []);
  });
});

describe('org_roster_match', () => {
  const rows = (x: object[]) => JSON.stringify(x);
  test('owners/admins only', async () => {
    const stranger = await person('Stranger 2');
    const err = await errOf(() => db.as(stranger.uid, `select org_roster_match($1, $2::jsonb)`, [org, rows([{ i: 2, name: 'Tara Menon' }])]));
    assert.match(err ?? '', /owners and admins/);
  });
  test('admission number, name + DOB, an admission number on another name, new', async () => {
    const [r] = await db.as<{ m: Array<{ i: number; kind: string; playerId?: string; why?: string }> }>(admin.uid, `select org_roster_match($1, $2::jsonb) as m`, [org, rows([
      { i: 2, name: 'Tara M.', adm: 'L101' },
      { i: 3, name: 'Tara Menon', dob: '2014-02-14' },
      { i: 4, name: 'Rahul Shah', adm: 'L101' },
      { i: 5, name: 'New Kid', dob: '2014-01-01' },
    ])]);
    const by = new Map(r.m.map((x) => [x.i, x]));
    assert.deepEqual([by.get(2)?.kind, by.get(2)?.playerId, by.get(2)?.why], ['member', tara, 'admission']);
    assert.deepEqual([by.get(3)?.kind, by.get(3)?.why], ['member', 'name_dob']);
    assert.deepEqual([by.get(4)?.kind, by.get(4)?.why], ['check', 'admission_name']);
    assert.equal(by.get(5)?.kind, 'new');
  });
  test('a child elsewhere: unverified school → "new"; verified → "parent", never with an id', async () => {
    const zoya = rows([{ i: 9, name: 'Zoya Khan', dob: '2014-09-09', email: 'zoya.parent@example.com' }]);
    const [u] = await db.as<{ m: Array<{ kind: string; playerId?: string }> }>(admin.uid, `select org_roster_match($1, $2::jsonb) as m`, [org, zoya]);
    assert.equal(u.m[0].kind, 'new', 'SL-01: an unverified school never reaches children elsewhere');
    await db.sql(`update organizations set verified_at = now() where id = $1`, [org]);
    const [v] = await db.as<{ m: Array<{ kind: string; playerId?: string }> }>(admin.uid, `select org_roster_match($1, $2::jsonb) as m`, [org, zoya]);
    assert.equal(v.m[0].kind, 'parent');
    assert.equal(v.m[0].playerId, undefined, 'no id for a child elsewhere');
  });
});

describe('asking the parent, and the parent\'s page', () => {
  let code = '';
  test('org_roster_invite (service role): one invite + one code, emailed to the parent on file', async () => {
    const [r] = await db.asService<{ res: Array<{ code: string; email: string; school: string; childFirstName: string; standard: string }> }>(
      `select org_roster_invite($1, $2, $3::jsonb) as res`,
      [org, admin.uid, JSON.stringify([{ i: 9, name: 'Zoya Khan', dob: '2014-09-09', email: 'typed.by.school@example.com', standard: 'Class 7-C', house: 'Red', adm: 'L200' }])]);
    // the school typed another address, but the match needs the one on file — so: no match, no invite
    assert.equal(r.res.length, 0, 'the parent contact must match the one on file');
    const [r2] = await db.asService<{ res: Array<{ code: string; email: string; school: string; childFirstName: string; standard: string }> }>(
      `select org_roster_invite($1, $2, $3::jsonb) as res`,
      [org, admin.uid, JSON.stringify([{ i: 9, name: 'Zoya Khan', dob: '2014-09-09', email: 'zoya.parent@example.com', standard: 'Class 7-C', house: 'Red', adm: 'L200' }])]);
    assert.equal(r2.res.length, 1);
    assert.deepEqual([r2.res[0].email, r2.res[0].school, r2.res[0].childFirstName, r2.res[0].standard], ['zoya.parent@example.com', 'Greenwood High', 'Zoya', 'Class 7-C']);
    code = r2.res[0].code;
    // asked again: no second invite
    const [m] = await db.as<{ m: Array<{ kind: string }> }>(admin.uid, `select org_roster_match($1, $2::jsonb) as m`, [org, JSON.stringify([{ i: 9, name: 'Zoya Khan', dob: '2014-09-09', email: 'zoya.parent@example.com' }])]);
    assert.equal(m.m[0].kind, 'invited');
  });
  test('only the service role can mint invites', async () => {
    const err = await errOf(() => db.as(admin.uid, `select org_roster_invite($1, $2, '[]'::jsonb)`, [org, admin.uid]));
    assert.match(err ?? '', /permission denied/);
  });
  test('a child can\'t accept or decline for herself, nor join through the membership table', async () => {
    const zoyaUid = await db.signUp({ name: 'Zoya Khan', dob: '2014-09-09' });
    await db.sql(`update players set profile_id = $1 where id = $2`, [zoyaUid, ext]);
    const [q] = await db.sql<{ id: string }>(`select id from org_requests where org_id = $1 and player_id = $2 and status = 'pending'`, [org, ext]);
    const err = await errOf(() => db.as(zoyaUid, `update org_requests set status = 'accepted' where id = $1`, [q.id]));
    assert.match(err ?? '', /parent or guardian approves/);
    const err2 = await errOf(() => db.as(zoyaUid, `update org_requests set status = 'rejected' where id = $1`, [q.id]));
    assert.match(err2 ?? '', /parent or guardian approves/, 'SL-04: nor decline');
    const err3 = await errOf(() => db.as(zoyaUid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [org, ext]));
    assert.ok(err3, 'nor join through the membership table');
  });
  test('the parent previews and agrees — anonymously, by code', async () => {
    const [p] = await db.asAnon<{ v: { school: string; childFirstName: string; standard: string; status: string } }>(`select school_request_preview($1) as v`, [code]);
    assert.deepEqual([p.v.school, p.v.childFirstName, p.v.standard, p.v.status], ['Greenwood High', 'Zoya', 'Class 7-C', 'pending']);
    const [d] = await db.asAnon<{ s: string }>(`select school_request_decide($1, true) as s`, [code]);
    assert.equal(d.s, 'accepted');
    const [m] = await db.sql<{ grades: Array<{ standard: string }>; houses: Array<{ house: string }> }>(`select grades, houses from org_members where org_id = $1 and player_id = $2`, [org, ext]);
    assert.equal(m.grades[0].standard, 'Class 7-C');
    assert.equal(m.houses[0].house, 'Red');
    const [a] = await db.sql<{ admission_no: string }>(`select admission_no from org_member_ids where org_id = $1 and player_id = $2`, [org, ext]);
    assert.equal(a.admission_no, 'L200');
    const [pr] = await db.sql<{ target_email: string | null }>(`select target_email from org_parent_requests pr join org_requests q on q.id = pr.request_id where q.player_id = $1`, [ext]);
    assert.equal(pr.target_email, null, 'SL-06: the address is cleared once answered');
    const [again] = await db.asAnon<{ s: string }>(`select school_request_decide($1, false) as s`, [code]);
    assert.equal(again.s, 'accepted', 'a decided request stays decided');
  });
  test('a wrong code is refused', async () => {
    const err = await errOf(() => db.asAnon(`select school_request_preview('NOT-A-REAL-CODE')`));
    assert.match(err ?? '', /isn.t valid/);
  });
});
