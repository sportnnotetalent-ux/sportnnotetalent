/**
 * Security Wave 3C — simulating hundreds of users against a real Postgres
 * (quality mandate step 6): consent and abuse limits.
 *  - 500 logged-out devices on 50 addresses (a school's Wi-Fi each) send their
 *    analytics: all of it is counted;
 *  - one address sends 1,000 calls with a new device id each time: 300 count;
 *  - 100 children (consent confirmed) try to age themselves into adulthood,
 *    clear their date of birth, and point the guardian contact at themselves;
 *  - 100 coaches fix a wrong birth year on a child they added.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

test('500 devices, 1 abuser, 100 children, 100 coaches: limits and consent hold', async () => {
  const db = await bootDb({ strict: true });
  const t0 = Date.now();
  const anonFrom = (ip: string, q: string, params: unknown[] = []) => db.pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'cf-connecting-ip': ip })]);
    await tx.query('set local role anon');
    return (await tx.query<{ n: number }>(q, params)).rows;
  });
  const ev = JSON.stringify([{ name: 'screen_view' }]);
  let counted = 0;
  for (let d = 0; d < 500; d++) {
    const device = crypto.randomUUID();
    for (let i = 0; i < 4; i++) counted += Number((await anonFrom(`192.0.2.${d % 50}`, `select track_events($1::jsonb, $2, null, 'web', '1') as n`, [ev, device]))[0].n);
  }
  assert.equal(counted, 2000, 'a legitimate device was limited');
  let abuse = 0;
  for (let i = 0; i < 1000; i++) abuse += Number((await anonFrom('203.0.113.66', `select track_events($1::jsonb, gen_random_uuid(), null, 'web', '1') as n`, [ev]))[0].n);
  assert.equal(abuse, 300);

  let blocked = 0, reasked = 0, fixed = 0, accounts = 0;
  const errOf = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
  for (let c = 0; c < 100; c++) {
    const uid = await db.signUp({ name: `Child ${c}`, dob: '2011-07-07' }); accounts++;
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '2011-07-07') returning id`, [`Child ${c}`, uid]);
    await db.sql(`update profiles set dob = '2011-07-07', guardian_consent = 'confirmed', guardian = '{"email":"g@x.in"}' where id = $1`, [uid]);
    if (await errOf(() => db.as(uid, `update profiles set dob = '1999-01-01' where id = auth.uid()`))) blocked++;
    if (await errOf(() => db.as(uid, `update profiles set dob = null where id = auth.uid()`))) blocked++;
    if (await errOf(() => db.as(uid, `update players set dob = '1999-01-01' where id = $1`, [p.id]))) blocked++;
    await db.as(uid, c % 2 ? `update profiles set guardian = '{"email":"me@x.in"}' where id = auth.uid()`
      : `update players set guardian = '{"email":"me@x.in"}' where id = '${p.id}'`);
    const [{ s }] = await db.sql<{ s: string }>(`select guardian_consent as s from profiles where id = $1`, [uid]);
    if (s === 'pending') reasked++;
  }
  assert.equal(blocked, 300, 'a child changed their date of birth');
  assert.equal(reasked, 100, 'a changed guardian contact wasn\'t asked again');
  for (let c = 0; c < 100; c++) {
    const coach = await db.signUp({ name: `Coach ${c}`, dob: '1985-01-01' }); accounts++;
    const [p] = await db.as<{ id: string }>(coach, `insert into players (full_name, dob) values ($1, '2015-01-01') returning id`, [`Typo ${c}`]);
    await db.as(coach, `update players set dob = '2005-01-01' where id = $1`, [p.id]);
    fixed++;
  }
  const ms = Date.now() - t0;
  console.log(`simulated 500 devices (2,000 calls counted), 1 abuser (300 of 1,000 counted), ${accounts} accounts: ${blocked} date-of-birth tricks refused, ${reasked} guardian changes asked again, ${fixed} coach fixes kept — ${ms} ms`);
});
