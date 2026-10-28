/**
 * SMS required at sign-up (2026-10-29) — simulation (quality mandate step 6),
 * against a real Postgres (PGlite). Auth is imitated the way Supabase runs it:
 * the "Before User Created" hook first, the account only if it allows it.
 *
 *   • 400 honest email sign-ups (a ticket for their own number): all made, each
 *     player starting with the mobile verified, each ticket spent once;
 *   • 100 with no ticket, 50 with someone else's ticket, 50 replaying a spent
 *     one: all refused, no account made;
 *   • 100 mobile sign-ups onto numbers a coach typed: 60 the person themselves
 *     (same first name and birth year) are linked; 40 a parent's number on a
 *     child's profile are not, and each parent gets their own profile.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => {
  db = await bootDb({ strict: true });
  // switched on after the app that sends the ticket is published
  await db.sql(`update signup_guard_settings set require_phone = true`);
});

let n = 0;
const phone = () => `+9177${String(10_000_000 + ++n).padStart(8, '0')}`;
const ticketFor = async (p: string) => (await db.asService<{ t: string }>(`select create_signup_phone_ticket($1) as t`, [p]))[0].t;
/** Auth's order: the hook, then the account. Returns the new id, or null when refused. */
async function signUpViaAuth(name: string, p: string, ticket?: string): Promise<string | null> {
  const user = { email: `s${++n}@school.in`, phone: '', user_metadata: { phone: p, ...(ticket ? { phone_ticket: ticket } : {}) } };
  const [r] = await db.sql<{ r: { error?: unknown } }>(`select hook_before_user_created($1::jsonb) as r`,
    [JSON.stringify({ metadata: { ip_address: `10.1.${n % 200}.${n % 250}` }, user })]);
  if (r.r.error) return null;
  return db.signUp({ name, dob: '1995-01-01', meta: { phone: p, ...(ticket ? { phone_ticket: ticket } : {}) } });
}

describe('600 email sign-ups and 100 mobile sign-ups', () => {
  test('honest sign-ups go through verified; every other attempt is refused', async () => {
    const t0 = Date.now();
    const spent: { p: string; t: string }[] = [];
    for (let i = 0; i < 400; i++) {
      const p = phone();
      const t = await ticketFor(p);
      const uid = await signUpViaAuth(`Player ${i}`, p, t);
      assert.ok(uid, `honest #${i} refused`);
      const [pl] = await db.sql<{ v: boolean }>(`select phone_verified as v from players where profile_id = $1`, [uid]);
      assert.equal(pl?.v, true, `honest #${i}: mobile verified`);
      spent.push({ p, t });
    }
    const before = (await db.sql<{ n: number }>(`select count(*)::int as n from profiles`))[0].n;
    for (let i = 0; i < 100; i++) assert.equal(await signUpViaAuth(`NoTicket ${i}`, phone()), null, `no ticket #${i}`);
    for (let i = 0; i < 50; i++) {
      const theirs = await ticketFor(phone());
      assert.equal(await signUpViaAuth(`Borrowed ${i}`, phone(), theirs), null, `someone else's ticket #${i}`);
    }
    for (let i = 0; i < 50; i++) {
      const s = spent[i];
      assert.equal(await signUpViaAuth(`Replay ${i}`, s.p, s.t), null, `replay #${i}`);
    }
    const after = (await db.sql<{ n: number }>(`select count(*)::int as n from profiles`))[0].n;
    assert.equal(after, before, 'no refused attempt made an account');
    const [used] = await db.sql<{ n: number }>(`select count(*)::int as n from signup_phone_tickets where used_by is not null`);
    assert.equal(used.n, 400, 'each honest ticket spent once');
    console.log(`600 email sign-ups in ${Date.now() - t0} ms`);
  });

  test('mobile sign-ups onto coach-typed numbers: the person is linked, a parent is not', async () => {
    const coach = await db.signUp({ name: 'Coach Sim', dob: '1980-01-01' });
    let linked = 0, ownProfile = 0;
    for (let i = 0; i < 100; i++) {
      const p = phone();
      const self = i < 60;
      const [row] = await db.as<{ id: string }>(coach, `insert into players (full_name, phone, dob) values ($1, $2, $3) returning id`,
        [self ? `Kiran ${i}` : `Child ${i}`, p, self ? '1995-06-01' : '2014-06-01']);
      const uid = await db.signUp({ name: self ? `Kiran ${i}` : `Parent ${i}`, dob: self ? '1995-01-01' : '1980-01-01' });
      await db.asService(`select phone_login_attach_player($1, $2)`, [uid, p]);
      const [r] = await db.sql<{ profile_id: string | null }>(`select profile_id from players where id = $1`, [row.id]);
      if (self) { assert.equal(r.profile_id, uid, `self #${i} linked`); linked++; }
      else {
        assert.equal(r.profile_id, null, `parent #${i} must not get the child's profile`);
        const own = await db.sql(`select 1 from players where profile_id = $1`, [uid]);
        assert.equal(own.length, 1, `parent #${i} has their own profile`);
        ownProfile++;
      }
    }
    assert.deepEqual([linked, ownProfile], [60, 40]);
  });
});
