/**
 * Talent foundations (docs/talent/schema-foundations.md, migration
 * 20261117120000_talent_foundations) — schools, licences, memberships with
 * Talent roles, seat caps, the phone allow-list and attach-on-first-login.
 * Written before the migration (quality mandate step 1).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
let support: string;
let school: string;          // Greenwood, 3 licences
let other: string;           // Riverside, 5 licences
let leader: string;          // Org Leader of Greenwood (signed in)
let admin: string;           // Admin of Greenwood (signed in)

const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
let phoneSeq = 7000000000;
const nextPhone = () => `+91${phoneSeq++}`;

/** A signed-in user whose sign-in phone SMS confirmed. */
async function phoneUser(phone: string, name = 'Someone') {
  return db.signUp({ phone, phoneConfirmed: true, name, dob: '1985-01-01' });
}
async function addMember(by: string, sch: string, phone: string, role: string, name = 'Staff') {
  const [r] = await db.as<{ id: string }>(by, `select talent_add_member($1, $2, $3, $4, null) as id`, [sch, phone, role, name]);
  return r.id;
}
async function addStudent(by: string, sch: string, name: string, parentPhone: string, parentName = 'Parent') {
  const [r] = await db.as<{ id: string }>(by,
    `select talent_add_student($1, $2, '2014-05-05', 'F', '7', 'A', $3, $4) as id`, [sch, name, parentPhone, parentName]);
  return r.id;
}
async function attach(uid: string) {
  const [r] = await db.as<{ n: number }>(uid, `select talent_attach_me() as n`);
  return Number(r.n);
}

const leaderPhone = '+919800000001';
const adminPhone = '+919800000002';

before(async () => {
  db = await bootDb({ strict: true });
  support = await db.signUp({ name: 'SportnNote Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);
  [{ id: school }] = await db.as<{ id: string }>(support, `select talent_create_school('Greenwood High', 3) as id`);
  [{ id: other }] = await db.as<{ id: string }>(support, `select talent_create_school('Riverside School', 5) as id`);
  await addMember(support, school, leaderPhone, 'org_leader', 'Principal Rao');
  await addMember(support, school, adminPhone, 'admin', 'Ms Iyer');
  leader = await phoneUser(leaderPhone, 'Principal Rao');
  admin = await phoneUser(adminPhone, 'Ms Iyer');
  assert.equal(await attach(leader), 1);
  assert.equal(await attach(admin), 1);
});

describe('schools and licences: SportnNote support only', () => {
  test('creates an organizations row of type School with its licences and 10 staff seats', async () => {
    const [o] = await db.sql<{ type: string; name: string }>(`select type, name from organizations where id = $1`, [school]);
    assert.deepEqual(o, { type: 'School', name: 'Greenwood High' });
    const [t] = await db.sql<{ student_licences: number; staff_seats: number }>(`select student_licences, staff_seats from talent_schools where org_id = $1`, [school]);
    assert.deepEqual(t, { student_licences: 3, staff_seats: 10 });
  });
  test('an Org Leader, an Admin, a stranger and anon cannot create a school or change licences', async () => {
    const stranger = await phoneUser(nextPhone());
    for (const u of [leader, admin, stranger]) {
      assert.match(await errOf(() => db.as(u, `select talent_create_school('X', 100)`)) ?? '', /support/);
      assert.match(await errOf(() => db.as(u, `select talent_set_licences($1, 100)`, [school])) ?? '', /support/);
    }
    assert.ok(await errOf(() => db.asAnon(`select talent_create_school('X', 100)`)));
  });
  test('licences cannot be negative or set below what is in use', async () => {
    assert.ok(await errOf(() => db.as(support, `select talent_create_school('Neg', -1)`)));
    const [{ id: s }] = await db.as<{ id: string }>(support, `select talent_create_school('Small School', 2) as id`);
    await addMember(support, s, nextPhone(), 'org_leader');
    await addStudent(support, s, 'Kid One', nextPhone());
    await addStudent(support, s, 'Kid Two', nextPhone());
    assert.match(await errOf(() => db.as(support, `select talent_set_licences($1, 1)`, [s])) ?? '', /in use/);
    await db.as(support, `select talent_set_licences($1, 4)`, [s]);
    const [t] = await db.sql<{ n: number }>(`select student_licences as n from talent_schools where org_id = $1`, [s]);
    assert.equal(t.n, 4);
  });
});

describe('no direct writes', () => {
  test('authenticated users cannot insert, update or delete talent rows directly', async () => {
    for (const q of [
      [`insert into talent_schools (org_id, student_licences) values ($1, 999)`, [school]],
      [`update talent_schools set student_licences = 999 where org_id = $1`, [school]],
      [`insert into talent_memberships (school_id, phone, role) values ($1, '+919811111111', 'org_leader')`, [school]],
      [`update talent_memberships set role = 'org_leader' where school_id = $1`, [school]],
      [`delete from talent_memberships where school_id = $1`, [school]],
      [`delete from talent_students where school_id = $1`, [school]],
    ] as const) {
      const before = await db.sql(`select (select count(*) from talent_memberships) m, (select sum(student_licences) from talent_schools) l, (select count(*) from talent_students) s`);
      await errOf(() => db.as(leader, q[0], [...q[1]]));
      const after = await db.sql(`select (select count(*) from talent_memberships) m, (select sum(student_licences) from talent_schools) l, (select count(*) from talent_students) s`);
      assert.deepEqual(after, before, q[0]);
    }
  });
});

describe('adding staff', () => {
  test('an Admin adds Admins, Organizers and Scorers but never an Org Leader', async () => {
    await addMember(admin, school, nextPhone(), 'organizer');
    await addMember(admin, school, nextPhone(), 'scorer');
    await addMember(admin, school, nextPhone(), 'admin');
    assert.match(await errOf(() => addMember(admin, school, nextPhone(), 'org_leader')) ?? '', /Org Leader/);
  });
  test('an Org Leader can add another Org Leader', async () => {
    await addMember(leader, school, '+919800000003', 'org_leader', 'Vice Principal');
  });
  test('Organizers, Scorers, parents and strangers cannot add anyone', async () => {
    const orgPhone = nextPhone();
    await addMember(leader, school, orgPhone, 'organizer');
    const organizer = await phoneUser(orgPhone);
    await attach(organizer);
    const stranger = await phoneUser(nextPhone());
    for (const u of [organizer, stranger]) {
      assert.ok(await errOf(() => addMember(u, school, nextPhone(), 'scorer')));
    }
  });
  test('an Admin of one school cannot add staff to another school', async () => {
    assert.ok(await errOf(() => addMember(admin, other, nextPhone(), 'scorer')));
  });
  test('parents are not added as staff, and unknown roles are refused', async () => {
    assert.ok(await errOf(() => addMember(leader, school, nextPhone(), 'parent')));
    assert.ok(await errOf(() => addMember(leader, school, nextPhone(), 'Owner')));
  });
  test('phones are stored as E.164 and junk numbers are refused', async () => {
    const id = await addMember(leader, school, '98765 43210', 'scorer');
    const [m] = await db.sql<{ phone: string }>(`select phone from talent_memberships where id = $1`, [id]);
    assert.equal(m.phone, '+919876543210');
    assert.match(await errOf(() => addMember(leader, school, '12345', 'scorer')) ?? '', /phone/i);
  });
  test('the same phone cannot hold the same active role twice at a school', async () => {
    const p = nextPhone();
    await addMember(leader, school, p, 'scorer');
    assert.ok(await errOf(() => addMember(leader, school, p, 'scorer')));
    await addMember(leader, school, p, 'organizer');   // a second role is fine
  });
});

describe('staff seats: 10 per school, counted per person', () => {
  test('the 11th staff person is refused; a second role for an existing person is not', async () => {
    const [{ id: s }] = await db.as<{ id: string }>(support, `select talent_create_school('Seat School', 50) as id`);
    const phones = Array.from({ length: 10 }, nextPhone);
    await addMember(support, s, phones[0], 'org_leader');
    for (const p of phones.slice(1)) await addMember(support, s, p, 'scorer');
    assert.match(await errOf(() => addMember(support, s, nextPhone(), 'scorer')) ?? '', /staff seats/);
    await addMember(support, s, phones[3], 'organizer');           // same person, extra role
    const [{ id: m }] = await db.sql<{ id: string }>(`select id from talent_memberships where school_id = $1 and phone = $2 and role = 'scorer'`, [s, phones[9]]);
    await db.as(support, `select talent_remove_member($1)`, [m]);
    await addMember(support, s, nextPhone(), 'scorer');               // a freed seat can be reused
  });
});

describe('removing staff and the Org Leader protection', () => {
  test('an Admin cannot remove an Org Leader', async () => {
    const [{ id }] = await db.sql<{ id: string }>(`select id from talent_memberships where school_id = $1 and phone = $2 and role = 'org_leader'`, [school, leaderPhone]);
    assert.match(await errOf(() => db.as(admin, `select talent_remove_member($1)`, [id])) ?? '', /Org Leader/);
  });
  test('an Org Leader cannot remove another Org Leader', async () => {
    const [{ id }] = await db.sql<{ id: string }>(`select id from talent_memberships where school_id = $1 and phone = '+919800000003' and role = 'org_leader'`, [school]);
    assert.match(await errOf(() => db.as(leader, `select talent_remove_member($1)`, [id])) ?? '', /Org Leader/);
  });
  test('the last Org Leader cannot remove themselves; with another one they can', async () => {
    const [{ id: s }] = await db.as<{ id: string }>(support, `select talent_create_school('Solo School', 5) as id`);
    const p1 = nextPhone(); const p2 = nextPhone();
    const m1 = await addMember(support, s, p1, 'org_leader');
    const u1 = await phoneUser(p1); await attach(u1);
    assert.match(await errOf(() => db.as(u1, `select talent_remove_member($1)`, [m1])) ?? '', /another Org Leader/);
    await addMember(u1, s, p2, 'org_leader');
    const u2 = await phoneUser(p2); await attach(u2);                // the other leader has signed in (TF7)
    await db.as(u1, `select talent_remove_member($1)`, [m1]);
    const [r] = await db.sql<{ removed_at: string | null }>(`select removed_at from talent_memberships where id = $1`, [m1]);
    assert.ok(r.removed_at);
  });
  test('an Admin removes an Organizer; the removed person loses access at once', async () => {
    const p = nextPhone();
    const m = await addMember(admin, school, p, 'organizer');
    const u = await phoneUser(p); await attach(u);
    assert.ok((await db.as(u, `select * from talent_students`)).length >= 0);
    assert.equal((await db.as(u, `select * from talent_schools`)).length, 1);
    await db.as(admin, `select talent_remove_member($1)`, [m]);
    assert.equal((await db.as(u, `select * from talent_schools`)).length, 0);
    assert.equal((await db.as(u, `select * from talent_students`)).length, 0);
  });
  test('support can remove an Org Leader', async () => {
    const [{ id }] = await db.sql<{ id: string }>(`select id from talent_memberships where school_id = $1 and phone = '+919800000003' and role = 'org_leader'`, [school]);
    await db.as(support, `select talent_remove_member($1)`, [id]);
  });
});

describe('students, parents and student licences', () => {
  let small: string; let lead: string;
  before(async () => {
    [{ id: small }] = await db.as<{ id: string }>(support, `select talent_create_school('Licence School', 2) as id`);
    const p = nextPhone();
    await addMember(support, small, p, 'org_leader');
    lead = await phoneUser(p); await attach(lead);
  });
  test('adding a student creates the student row, the parent membership and the link', async () => {
    const parent = nextPhone();
    const st = await addStudent(lead, small, 'Asha Rao', parent, 'Mr Rao');
    const [row] = await db.sql<{ full_name: string; dob: string; class: string; section: string }>(
      `select full_name, dob::text as dob, class, section from talent_students where id = $1`, [st]);
    assert.deepEqual(row, { full_name: 'Asha Rao', dob: '2014-05-05', class: '7', section: 'A' });
    const ms = await db.sql<{ role: string; display_name: string }>(`select role, display_name from talent_memberships where school_id = $1 and phone = $2`, [small, parent]);
    assert.deepEqual(ms, [{ role: 'parent', display_name: 'Mr Rao' }]);
    const links = await db.sql(`select 1 from talent_student_guardians g join talent_memberships m on m.id = g.membership_id where g.student_id = $1 and m.phone = $2`, [st, parent]);
    assert.equal(links.length, 1);
  });
  test('a student over the licence count is refused', async () => {
    await addStudent(lead, small, 'Second Kid', nextPhone());
    assert.match(await errOf(() => addStudent(lead, small, 'Third Kid', nextPhone())) ?? '', /licences/);
  });
  test('removing a student frees the licence and removes a parent with no other child', async () => {
    const [{ id: st, phone }] = await db.sql<{ id: string; phone: string }>(
      `select s.id, m.phone from talent_students s join talent_student_guardians g on g.student_id = s.id join talent_memberships m on m.id = g.membership_id
        where s.school_id = $1 and s.full_name = 'Second Kid'`, [small]);
    await db.as(lead, `select talent_remove_student($1)`, [st]);
    const active = await db.sql(`select 1 from talent_memberships where school_id = $1 and phone = $2 and removed_at is null`, [small, phone]);
    assert.equal(active.length, 0);
    await addStudent(lead, small, 'Replacement Kid', nextPhone());
  });
  test('siblings share one parent membership', async () => {
    const [{ id: s }] = await db.as<{ id: string }>(support, `select talent_create_school('Sibling School', 5) as id`);
    const p = nextPhone();
    await addStudent(support, s, 'Big Sis', p);
    await addStudent(support, s, 'Little Bro', p);
    const ms = await db.sql(`select 1 from talent_memberships where school_id = $1 and phone = $2 and role = 'parent' and removed_at is null`, [s, p]);
    assert.equal(ms.length, 1);
  });
  test('parent logins never exceed the licence count', async () => {
    // Direct (service-role) inserts still hit the cap trigger.
    const [{ id: s }] = await db.as<{ id: string }>(support, `select talent_create_school('Parent Cap School', 1) as id`);
    await db.asService(`insert into talent_memberships (school_id, phone, role) values ($1, '+919822222221', 'parent')`, [s]);
    assert.match(await errOf(() => db.asService(`insert into talent_memberships (school_id, phone, role) values ($1, '+919822222222', 'parent')`, [s])) ?? '', /licences/);
  });
  test('Organizers, Scorers and parents cannot add or remove students', async () => {
    const p = nextPhone();
    await addMember(admin, school, p, 'scorer');
    const scorer = await phoneUser(p); await attach(scorer);
    assert.ok(await errOf(() => addStudent(scorer, school, 'Sneaky', nextPhone())));
  });
});

describe('phone allow-list and first login', () => {
  test('talent_phone_allowed: true for an active membership, false otherwise; service role only', async () => {
    const [a] = await db.asService<{ ok: boolean }>(`select talent_phone_allowed($1) as ok`, ['98000 00001']);
    assert.equal(a.ok, true);
    const [b] = await db.asService<{ ok: boolean }>(`select talent_phone_allowed($1) as ok`, ['+919999999999']);
    assert.equal(b.ok, false);
    assert.ok(await errOf(() => db.asAnon(`select talent_phone_allowed('+919800000001')`)));
    assert.ok(await errOf(() => db.as(admin, `select talent_phone_allowed('+919800000001')`)));
  });
  test('a removed membership no longer allows login', async () => {
    const p = nextPhone();
    const m = await addMember(support, other, p, 'scorer');
    await db.as(support, `select talent_remove_member($1)`, [m]);
    const [r] = await db.asService<{ ok: boolean }>(`select talent_phone_allowed($1) as ok`, [p]);
    assert.equal(r.ok, false);
  });
  test('attach uses the confirmed sign-in phone only, never a typed one', async () => {
    const p = nextPhone();
    await addMember(support, other, p, 'scorer');
    const unconfirmed = await db.signUp({ phone: p, phoneConfirmed: false });
    assert.equal(await attach(unconfirmed), 0);
    const typed = await db.signUp({ name: 'Typer' });
    await db.sql(`update profiles set phone = $2 where id = $1`, [typed, p]);
    assert.equal(await attach(typed), 0);
    const real = await phoneUser(p);
    assert.equal(await attach(real), 1);
    assert.equal(await attach(real), 0);                             // idempotent
  });
  test('one phone, several roles and schools: all attach to one login', async () => {
    const p = nextPhone();
    await addMember(admin, school, p, 'organizer');
    await addStudent(admin, school, 'Own Kid', p);
    await addStudent(support, other, 'Kid Elsewhere', p);
    const u = await phoneUser(p);
    assert.equal(await attach(u), 3);
    const mine = await db.as<{ school_id: string; role: string }>(u, `select school_id, role from talent_memberships order by role`);
    assert.equal(mine.length, 3);
  });
});

describe('who sees what', () => {
  let parentA: string; let kidA: string; let kidB: string; let otherKid: string;
  before(async () => {
    const p = nextPhone();
    kidA = await addStudent(admin, school, 'Child A', p, 'Parent A');
    kidB = await addStudent(support, other, 'Child B', p, 'Parent A at Riverside');
    otherKid = await addStudent(admin, school, 'Not My Child', nextPhone());
    parentA = await phoneUser(p); await attach(parentA);
  });
  test('a parent sees only their own children, at both schools', async () => {
    const seen = (await db.as<{ id: string }>(parentA, `select id from talent_students`)).map((r) => r.id).sort();
    assert.deepEqual(seen, [kidA, kidB].sort());
    assert.ok(!seen.includes(otherKid));
  });
  test('a parent sees their own memberships only, not other staff or parents', async () => {
    const rows = await db.as<{ profile_id: string }>(parentA, `select profile_id from talent_memberships`);
    assert.ok(rows.length >= 2 && rows.every((r) => r.profile_id === parentA));
  });
  test('an Admin of school A sees school A students but nothing of school B', async () => {
    const seen = (await db.as<{ id: string; school_id: string }>(admin, `select id, school_id from talent_students`));
    assert.ok(seen.some((r) => r.id === kidA));
    assert.ok(seen.every((r) => r.school_id === school));
    const ms = await db.as<{ school_id: string }>(admin, `select school_id from talent_memberships`);
    assert.ok(ms.every((r) => r.school_id === school));
    assert.equal((await db.as(admin, `select * from talent_schools where org_id = $1`, [other])).length, 0);
  });
  test('a signed-in stranger and anon see nothing', async () => {
    const stranger = await phoneUser(nextPhone());
    for (const t of ['talent_schools', 'talent_memberships', 'talent_students', 'talent_student_guardians']) {
      assert.deepEqual(await db.as(stranger, `select * from ${t}`), [], t);
      assert.deepEqual(await db.asAnon(`select * from ${t}`).catch(() => []), [], t);
    }
  });
});

// Fixes for docs/security/breaks/talent-foundations.md — each written failing first.
describe('break fixes', () => {
  let s: string; let lead: string; let leadM: string; let adm: string; let admM: string;
  const nameSeen = async (uid: string, name: string) => {
    const a = await db.as(uid, `select 1 from talent_students where full_name = $1`, [name]).catch(() => []);
    const b = await db.as(uid, `select 1 from players where full_name = $1`, [name]).catch(() => []);
    const c = await db.as(uid, `select 1 from players_view where full_name = $1`, [name]).catch(() => []);
    return a.length + b.length + c.length;
  };
  before(async () => {
    [{ id: s }] = await db.as<{ id: string }>(support, `select talent_create_school('Break School', 20) as id`);
    const p1 = nextPhone(); const p2 = nextPhone();
    leadM = await addMember(support, s, p1, 'org_leader', 'Lead');
    admM = await addMember(support, s, p2, 'admin', 'Adm');
    lead = await phoneUser(p1); await attach(lead);
    adm = await phoneUser(p2); await attach(adm);
  });

  test('TF1/TF15: a Talent student is not a SportnNote players row; a removed Admin loses the child', async () => {
    const st = await addStudent(adm, s, 'Aarav Kumar', nextPhone());
    assert.equal((await db.sql(`select 1 from players where full_name = 'Aarav Kumar'`)).length, 0);
    assert.ok(await nameSeen(adm, 'Aarav Kumar') > 0);
    await db.as(lead, `select talent_remove_member($1)`, [admM]);
    assert.equal(await nameSeen(adm, 'Aarav Kumar'), 0);
    assert.ok(await errOf(() => db.as(adm, `update talent_students set full_name = 'Changed' where id = $1`, [st])) !== undefined);
    const [r] = await db.sql<{ full_name: string }>(`select full_name from talent_students where id = $1`, [st]);
    assert.equal(r.full_name, 'Aarav Kumar');
  });

  test('TF2: nobody can attach a phone or guardian to a student and claim it', async () => {
    const [{ id: st }] = await db.sql<{ id: string }>(`select id from talent_students where full_name = 'Aarav Kumar'`);
    const before = await db.sql(`select * from talent_students where id = $1`, [st]);
    await errOf(() => db.as(lead, `update talent_students set full_name = 'Mine' where id = $1`, [st]));
    assert.deepEqual(await db.sql(`select * from talent_students where id = $1`, [st]), before);
  });

  test('TF3: an 18-year-old student\'s name is not visible to a signed-in stranger; DOBs must be school age', async () => {
    const [{ id: st }] = await db.as<{ id: string }>(lead,
      `select talent_add_student($1, 'Senior Rohan', '2007-01-01', 'M', '12', 'A', $2, 'P') as id`, [s, nextPhone()]);
    assert.ok(st);
    const stranger = await phoneUser(nextPhone());
    assert.equal(await nameSeen(stranger, 'Senior Rohan'), 0);
    assert.match(await errOf(() => db.as(lead, `select talent_add_student($1, 'Old', '1990-01-01', 'M', '7', 'A', $2, 'P')`, [s, nextPhone()])) ?? '', /date of birth/);
  });

  test('TF4: the school\'s staff and the child\'s parent can read the name; another parent cannot', async () => {
    const pp = nextPhone(); const other = nextPhone();
    await addStudent(lead, s, 'Meera Shah', pp);
    await addStudent(lead, s, 'Someone Else', other);
    const sp = nextPhone(); await addMember(lead, s, sp, 'scorer');
    const scorer = await phoneUser(sp); await attach(scorer);
    const parent = await phoneUser(pp); await attach(parent);
    const otherParent = await phoneUser(other); await attach(otherParent);
    assert.ok(await nameSeen(scorer, 'Meera Shah') > 0);
    assert.ok(await nameSeen(parent, 'Meera Shah') > 0);
    assert.equal(await nameSeen(otherParent, 'Meera Shah'), 0);
  });

  test('TF10: removing a student erases the child\'s details', async () => {
    const st = await addStudent(lead, s, 'Gone Child', nextPhone());
    await db.as(lead, `select talent_remove_student($1)`, [st]);
    assert.equal((await db.sql(`select 1 from talent_students where full_name = 'Gone Child'`)).length, 0);
    assert.equal((await db.sql(`select 1 from players where full_name = 'Gone Child'`)).length, 0);
  });

  test('TF8: a school over its cap does not block login at the person\'s other schools', async () => {
    const p = nextPhone();
    const [{ id: a }] = await db.as<{ id: string }>(support, `select talent_create_school('Cap A', 5) as id`);
    await addMember(support, a, p, 'scorer');
    await addStudent(support, s, 'Child Of Scorer', p);
    await db.sql(`alter table talent_schools disable trigger user`);
    await db.sql(`update talent_schools set staff_seats = 0 where org_id = $1`, [a]);
    await db.sql(`alter table talent_schools enable trigger user`);
    const u = await phoneUser(p);
    assert.equal(await attach(u), 2);
  });

  test('TF19: seats and licences cannot be lowered below what is in use, by any path', async () => {
    const [{ id: a }] = await db.as<{ id: string }>(support, `select talent_create_school('Cap B', 5) as id`);
    await addMember(support, a, nextPhone(), 'org_leader');
    await addStudent(support, a, 'Kid B', nextPhone());
    assert.match(await errOf(() => db.asService(`update talent_schools set staff_seats = 0 where org_id = $1`, [a])) ?? '', /in use/);
    assert.match(await errOf(() => db.asService(`update talent_schools set student_licences = 0 where org_id = $1`, [a])) ?? '', /in use/);
  });

  test('TF7: an Org Leader cannot leave while the only other Org Leader has never signed in', async () => {
    await addMember(lead, s, nextPhone(), 'org_leader', 'Ghost');
    assert.match(await errOf(() => db.as(lead, `select talent_remove_member($1)`, [leadM])) ?? '', /another Org Leader/);
  });

  test('TF11: a double submit of the same student returns the same student and uses one licence', async () => {
    const pp = nextPhone();
    const a = await addStudent(lead, s, 'Twice Added', pp);
    const b = await addStudent(lead, s, ' twice added ', pp);
    assert.equal(a, b);
  });

  test('TF5: only Indian mobile numbers are accepted', async () => {
    for (const bad of ['98000000012', '+98000000012', '+14155550123', '+915123456789']) {
      assert.match(await errOf(() => addMember(lead, s, bad, 'scorer')) ?? '', /phone/i, bad);
    }
  });

  test('TF6: attach compares the full sign-in number, not a 10-digit guess', async () => {
    const p = nextPhone();
    await addMember(lead, s, p, 'scorer');
    const foreign = await db.signUp({ phone: p.slice(3), phoneConfirmed: true });   // 10 digits, no country code
    assert.equal(await attach(foreign), 0);
  });

  test('TF9: changing the sign-in phone ends the old number\'s roles', async () => {
    const p = nextPhone();
    await addMember(lead, s, p, 'organizer');
    const u = await phoneUser(p); await attach(u);
    assert.equal((await db.as(u, `select * from talent_schools`)).length, 1);
    await db.sql(`update auth.users set phone = $2 where id = $1`, [u, nextPhone()]);
    assert.equal((await db.as(u, `select * from talent_schools`)).length, 0);
    assert.equal((await db.as(u, `select * from talent_memberships`)).length, 0);
  });

  test('TF13: control and direction characters in names, and junk emails, are refused', async () => {
    assert.match(await errOf(() => db.as(lead, `select talent_add_member($1, $2, 'scorer', $3, null)`, [s, nextPhone(), 'Evil‮gnp.exe'])) ?? '', /character/);
    assert.match(await errOf(() => db.as(lead, `select talent_add_member($1, $2, 'scorer', 'Ok', 'not-an-email<script>')`, [s, nextPhone()])) ?? '', /email/);
    assert.match(await errOf(() => addStudent(lead, s, 'Bad\u0007Name', nextPhone())) ?? '', /character/);
  });

  test('TF16: a stranger gets the same answer for a real Org Leader id and a made-up id', async () => {
    const stranger = await phoneUser(nextPhone());
    const real = await errOf(() => db.as(stranger, `select talent_remove_member($1)`, [leadM]));
    const fake = await errOf(() => db.as(stranger, `select talent_remove_member($1)`, ['00000000-0000-0000-0000-000000000001']));
    assert.equal(real, fake);
  });
});
