/**
 * Quality mandate step 6 for Talent foundations (docs/talent/schema-foundations.md):
 * 520 people on a real Postgres (PGlite, every migration) at 4 schools — support,
 * Org Leaders, Admins, Organizers, Scorers, parents and strangers — make 2,000
 * random and adversarial calls (wrong school, junk phones, Org Leader grabs,
 * oversized names, removing other people's memberships). After every call:
 *  - a call that succeeded was allowed for that caller's roles at that moment;
 *  - caps hold: students and parent logins ≤ licences, staff people ≤ seats;
 *  - no phone holds the same active role twice at a school;
 *  - a school never loses its last Org Leader except by support;
 *  - people move to new sign-in numbers mid-run and lose the old number's roles;
 *  - a burst of 30 parallel adds at a school with 5 licences lands exactly 5.
 * At the end every signed-in person sees exactly what their roles allow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let seed = 20261109;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(a: T[]) => a[rnd(a.length)];

const STAFF = ['org_leader', 'admin', 'organizer', 'scorer'];
const junkPhones = ['', '12345', 'abc', '+0000', '9'.repeat(40), "'); drop table talent_memberships; --", '+91 98x'];

test('520 people, 2,000 random calls: permissions, caps and visibility hold', { timeout: 600_000 }, async () => {
  const db: TestDb = await bootDb({ strict: true });
  const support = await db.signUp({ name: 'Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);

  // 520 people, each with a confirmed sign-in phone.
  const people: { uid: string; phone: string }[] = [];
  for (let i = 0; i < 520; i++) {
    const phone = `+9190${String(10000000 + i).padStart(8, '0')}`;
    people.push({ uid: await db.signUp({ phone, phoneConfirmed: true, name: `P${i}` }), phone });
  }
  const schools: string[] = [];
  for (const [i, lic] of [40, 25, 60, 15].entries()) {
    const [{ id }] = await db.as<{ id: string }>(support, `select talent_create_school($1, $2) as id`, [`School ${i}`, lic]);
    schools.push(id);
    // Two Org Leaders and an Admin to start, from the pool.
    for (const [j, role] of ['org_leader', 'org_leader', 'admin'].entries()) {
      await db.as(support, `select talent_add_member($1, $2, $3, 'Seed', null)`, [id, people[i * 3 + j].phone, role]);
    }
  }
  const attachAll = async () => { for (const p of people) await db.as(p.uid, `select talent_attach_me()`); };
  await attachAll();

  // Roles count only while the membership's number is still the person's sign-in number.
  const rolesOf = async (uid: string, school: string) =>
    (await db.sql<{ role: string }>(`select m.role from talent_memberships m join auth.users u on u.id = m.profile_id
      where m.school_id = $1 and m.profile_id = $2 and m.removed_at is null and m.phone = '+' || regexp_replace(u.phone, '\\D', '', 'g')`, [school, uid])).map((r) => r.role);

  const checkInvariants = async (ctx: string) => {
    const caps = await db.sql<{ org_id: string; lic: number; seats: number; students: number; parents: number; staff: number; leaders: number }>(`
      select t.org_id, t.student_licences lic, t.staff_seats seats,
        (select count(*) from talent_students s where s.school_id = t.org_id)::int students,
        (select count(distinct phone) from talent_memberships m where m.school_id = t.org_id and m.role = 'parent' and m.removed_at is null)::int parents,
        (select count(distinct phone) from talent_memberships m where m.school_id = t.org_id and m.role <> 'parent' and m.removed_at is null)::int staff,
        (select count(*) from talent_memberships m where m.school_id = t.org_id and m.role = 'org_leader' and m.removed_at is null)::int leaders
      from talent_schools t`);
    for (const c of caps) {
      assert.ok(c.students <= c.lic, `${ctx}: students ${c.students} > ${c.lic}`);
      assert.ok(c.parents <= c.lic, `${ctx}: parents ${c.parents} > ${c.lic}`);
      assert.ok(c.staff <= c.seats, `${ctx}: staff ${c.staff} > ${c.seats}`);
      assert.ok(c.leaders >= 1, `${ctx}: a school lost its last Org Leader`);
    }
    const dup = await db.sql(`select 1 from talent_memberships where removed_at is null group by school_id, phone, role having count(*) > 1`);
    assert.equal(dup.length, 0, `${ctx}: duplicate active role`);
  };

  let ok = 0, refused = 0;
  for (let step = 0; step < 2000; step++) {
    const actor = rnd(20) === 0 ? { uid: support, phone: '' } : pick(people);
    const isSupport = actor.uid === support;
    const school = rnd(10) === 0 ? '00000000-0000-0000-0000-000000000000' : pick(schools);
    const mine = isSupport ? [] : await rolesOf(actor.uid, school);
    const manager = isSupport || mine.includes('org_leader') || mine.includes('admin');
    const op = rnd(7);
    const ctx = `step ${step} op ${op}`;
    try {
      if (op === 0) {                                     // add staff
        const role = rnd(12) === 0 ? pick(['parent', 'Owner', '']) : pick(STAFF);
        const phone = rnd(8) === 0 ? pick(junkPhones) : pick(people).phone;
        const name = rnd(15) === 0 ? 'x'.repeat(5000) : 'Staff';
        await db.as(actor.uid, `select talent_add_member($1, $2, $3, $4, null)`, [school, phone, role, name]);
        assert.ok(STAFF.includes(role), `${ctx}: added role ${role}`);
        assert.ok(isSupport || (role === 'org_leader' ? mine.includes('org_leader') : manager), `${ctx}: ${mine} added ${role}`);
      } else if (op === 1) {                              // remove a membership
        const [m] = await db.sql<{ id: string; role: string; profile_id: string | null; school_id: string }>(
          `select id, role, profile_id, school_id from talent_memberships where removed_at is null and school_id = $1 order by random() limit 1`, [school]);
        if (!m) continue;
        const leadersBefore = (await db.sql(`select 1 from talent_memberships where school_id = $1 and role = 'org_leader' and removed_at is null`, [school])).length;
        if (isSupport && m.role === 'org_leader' && leadersBefore === 1) continue;   // support may; keep the invariant simple
        await db.as(actor.uid, `select talent_remove_member($1)`, [m.id]);
        if (m.role === 'org_leader') assert.ok(isSupport || (m.profile_id === actor.uid && leadersBefore > 1), `${ctx}: Org Leader removed by ${mine}`);
        else assert.ok(manager, `${ctx}: ${mine} removed a ${m.role}`);
      } else if (op === 2) {                              // add a student
        const parent = rnd(8) === 0 ? pick(junkPhones) : pick(people).phone;
        await db.as(actor.uid, `select talent_add_student($1, $2, '2013-03-03', 'M', '6', 'B', $3, 'Parent')`, [school, rnd(20) === 0 ? '' : `Kid ${step}`, parent]);
        assert.ok(manager, `${ctx}: ${mine} added a student`);
      } else if (op === 3) {                              // remove a student
        const [s] = await db.sql<{ id: string }>(`select id from talent_students where school_id = $1 order by random() limit 1`, [school]);
        if (!s) continue;
        await db.as(actor.uid, `select talent_remove_student($1)`, [s.id]);
        assert.ok(manager, `${ctx}: ${mine} removed a student`);
      } else if (op === 4) {                              // licences
        await db.as(actor.uid, `select talent_set_licences($1, $2)`, [school, rnd(70)]);
        assert.ok(isSupport, `${ctx}: non-support changed licences`);
      } else if (op === 5) {                              // first login
        await db.as(actor.uid, `select talent_attach_me()`);
      } else {                                            // someone moves to a new sign-in number (TF9)
        if (isSupport || rnd(4) !== 0) continue;
        actor.phone = `+9189${String(10000000 + step).padStart(8, '0')}`;
        await db.sql(`update auth.users set phone = $2 where id = $1`, [actor.uid, actor.phone]);
      }
      ok++;
    } catch (e) {
      if (e instanceof assert.AssertionError) throw e;
      refused++;
    }
    await checkInvariants(ctx);
  }
  assert.ok(ok > 300 && refused > 300, `a real mix: ${ok} ok, ${refused} refused`);

  // A burst of 30 adds at a school with 5 licences left: exactly 5 land.
  const [{ id: burst }] = await db.as<{ id: string }>(support, `select talent_create_school('Burst School', 5) as id`);
  await db.as(support, `select talent_add_member($1, '+918700000000', 'org_leader', 'Lead', null)`, [burst]);
  const settled = await Promise.allSettled(Array.from({ length: 30 }, (_, i) =>
    db.as(support, `select talent_add_student($1, $2, '2012-02-02', 'F', '8', 'C', $3, 'P')`, [burst, `Burst ${i}`, `+9188${String(10000000 + i).padStart(8, '0')}`])));
  assert.equal(settled.filter((r) => r.status === 'fulfilled').length, 5);
  await checkInvariants('burst');

  // Visibility: everyone sees exactly what their roles allow.
  await attachAll();
  for (const p of people.slice(0, 520)) {
    const seen = new Set((await db.as<{ id: string }>(p.uid, `select id from talent_students`)).map((r) => r.id));
    const expected = new Set((await db.sql<{ id: string }>(`
      select s.id from talent_students s
       where exists (select 1 from talent_memberships m where m.school_id = s.school_id and m.profile_id = $1
                       and m.phone = $2 and m.removed_at is null and m.role in ('org_leader', 'admin', 'organizer', 'scorer'))
          or (exists (
               select 1 from talent_student_guardians g join talent_memberships m on m.id = g.membership_id
                where g.student_id = s.id and m.profile_id = $1 and m.phone = $2 and m.removed_at is null))`, [p.uid, p.phone])).map((r) => r.id));
    assert.deepEqual([...seen].sort(), [...expected].sort(), `students seen by ${p.phone}`);
    const ms = await db.as<{ profile_id: string; school_id: string }>(p.uid, `select profile_id, school_id from talent_memberships`);
    for (const m of ms) {
      if (m.profile_id === p.uid) continue;
      const r = await rolesOf(p.uid, m.school_id);
      assert.ok(r.includes('org_leader') || r.includes('admin'), `${p.phone} saw someone else's membership`);
    }
  }
});
