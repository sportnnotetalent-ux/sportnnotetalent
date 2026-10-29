/**
 * CL-04 — the country that decides an under-18's consent route comes from the
 * phone number, not the device (founder 2026-10-28: "for India by default it's
 * +91 … if one verifies their phone number, means they are from that country").
 *
 *   • sign-up: the mobile's dial code decides; when it and the device disagree
 *     on India, the stricter route applies (the guardian confirms);
 *   • a verified phone (SMS) records that country; the route only gets stricter.
 *
 * Against a real Postgres (PGlite, every migration applied).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const KID = '2012-03-03';
const SMALL = '2016-03-03';
const GUARDIAN = { name: 'Mum', email: 'mum@x.in', consentedAt: '2026-10-28T10:00:00Z' };
let n = 0;
const phone = (cc: string, len = 10) => `+${cc}${String(9_000_000_000 + ++n).slice(-len)}`;

type Prof = { signup_country: string | null; guardian_consent: string | null; guardian_consent_method: string | null };
async function signUp(o: { dob?: string; phone?: string; country?: string; guardian?: unknown }): Promise<string> {
  return db.signUp({
    dob: o.dob, phone: o.phone,
    meta: { ...(o.phone ? { phone: o.phone } : {}), ...(o.country ? { country: o.country } : {}), ...(o.guardian ? { guardian: o.guardian } : {}) },
  });
}
const prof = async (uid: string) =>
  (await db.sql<Prof>(`select signup_country, guardian_consent, guardian_consent_method from profiles where id = $1`, [uid]))[0];
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

describe('country_of_phone', () => {
  test('the dial code; +1 is shared (null); another code is "outside India" (ZZ); junk is null', async () => {
    const c = async (p: string | null) => (await db.sql<{ c: string | null }>(`select country_of_phone($1) as c`, [p]))[0].c;
    assert.equal(await c('+919812345678'), 'IN');
    assert.equal(await c('+447400123456'), 'GB');
    assert.equal(await c('+971501234567'), 'AE');
    assert.equal(await c('+97455123456'), 'QA');
    assert.equal(await c('+6591234567'), 'SG');
    assert.equal(await c('+60123456789'), 'MY');
    assert.equal(await c('+61412345678'), 'AU');
    assert.equal(await c('+12025550100'), null);
    assert.equal(await c('+33612345678'), 'ZZ');
    for (const junk of [null, '', '9812345678', 'abc', '+', '+91', '+91 98123 45678x']) assert.equal(await c(junk), null, String(junk));
  });
});

describe('sign-up: the phone decides, the stricter route wins', () => {
  test('the CL-04 attack: a UK child sets the device to India — the +44 number still says GB', async () => {
    const p = await prof(await signUp({ dob: KID, phone: phone('44'), country: 'IN', guardian: GUARDIAN }));
    assert.deepEqual([p.signup_country, p.guardian_consent], ['GB', 'pending']);
  });
  test('India: a +91 number says IN, and the child waits for a parent too (CL-03 parental proof, 2026-10-29: the sign-up checkbox ended)', async () => {
    for (const country of ['IN', undefined]) {
      const p = await prof(await signUp({ dob: KID, phone: phone('91'), country, guardian: GUARDIAN }));
      assert.deepEqual([p.signup_country, p.guardian_consent, p.guardian_consent_method], ['IN', 'pending', 'parental_proof_required'], String(country));
    }
  });
  test('a +91 number on a device set elsewhere: the stricter route (the guardian confirms)', async () => {
    const p = await prof(await signUp({ dob: KID, phone: phone('91'), country: 'GB', guardian: GUARDIAN }));
    assert.deepEqual([p.signup_country, p.guardian_consent], ['GB', 'pending']);
  });
  test('an under-18 with no phone has proven no country: the guardian confirms', async () => {
    const p = await prof(await signUp({ dob: KID, country: 'IN', guardian: GUARDIAN }));
    assert.deepEqual([p.signup_country, p.guardian_consent], ['IN', 'pending']);
  });
  test('a code outside the list: the device country if it isn\'t India, else ZZ; the guardian confirms', async () => {
    const fr = await prof(await signUp({ dob: KID, phone: '+33612345001', country: 'FR', guardian: GUARDIAN }));
    assert.deepEqual([fr.signup_country, fr.guardian_consent], ['FR', 'pending']);
    const zz = await prof(await signUp({ dob: KID, phone: '+33612345002', country: 'IN', guardian: GUARDIAN }));
    assert.deepEqual([zz.signup_country, zz.guardian_consent], ['ZZ', 'pending']);
  });
  test('a US (+1) under-13 is refused whatever the device says', async () => {
    const e = await errOf(() => signUp({ dob: SMALL, phone: '+12025550123', country: 'IN', guardian: GUARDIAN }));
    assert.match(e ?? '', /US_UNDER_13/);
    const ca = await prof(await signUp({ dob: KID, phone: '+14165550123', country: 'CA', guardian: GUARDIAN }));
    assert.deepEqual([ca.signup_country, ca.guardian_consent], ['CA', 'pending']);
  });
  test('adults: the phone\'s country is recorded; no consent state', async () => {
    const p = await prof(await signUp({ dob: '1990-01-01', phone: phone('44'), country: 'IN' }));
    assert.deepEqual([p.signup_country, p.guardian_consent], ['GB', null]);
    const none = await prof(await signUp({ dob: '1990-01-01', country: 'AE' }));
    assert.equal(none.signup_country, 'AE', 'no phone: the device country, as before');
  });
});

describe('a verified phone records its country; the route only gets stricter', () => {
  const verify = (uid: string, p: string) => db.asService(`select apply_verified_phone_country($1, $2)`, [uid, p]);
  test('only the server (the SMS check) can call it', async () => {
    const kid = await signUp({ dob: KID, phone: phone('91'), country: 'IN', guardian: GUARDIAN });
    assert.ok(await errOf(() => db.as(kid, `select apply_verified_phone_country($1, '+447400123999')`, [kid])), 'the child');
    assert.ok(await errOf(() => db.asAnon(`select apply_verified_phone_country($1, '+447400123999')`, [kid])), 'anyone');
  });
  test('an Indian sign-up that verifies a +44 number: GB, and still waiting for a parent', async () => {
    const kid = await signUp({ dob: KID, phone: phone('91'), country: 'IN', guardian: GUARDIAN });
    await verify(kid, '+447400123998');
    const p = await prof(kid);
    assert.deepEqual([p.signup_country, p.guardian_consent], ['GB', 'pending']);
  });
  test('verifying a +91 number never loosens a waiting account; a confirmed or withdrawn one is kept', async () => {
    const waiting = await signUp({ dob: KID, phone: phone('44'), country: 'GB', guardian: GUARDIAN });
    await verify(waiting, '+919812345998');
    assert.deepEqual([(await prof(waiting)).signup_country, (await prof(waiting)).guardian_consent], ['IN', 'pending']);
    const confirmed = await signUp({ dob: KID, phone: phone('44'), country: 'GB', guardian: GUARDIAN });
    await db.sql(`update profiles set guardian_consent = 'confirmed' where id = $1`, [confirmed]);
    await verify(confirmed, '+33612345999');
    assert.equal((await prof(confirmed)).guardian_consent, 'confirmed', 'a guardian already confirmed');
    const withdrawn = await signUp({ dob: KID, phone: phone('91'), country: 'IN', guardian: GUARDIAN });
    await db.sql(`update profiles set guardian_consent = 'withdrawn' where id = $1`, [withdrawn]);
    await verify(withdrawn, '+447400123997');
    assert.equal((await prof(withdrawn)).guardian_consent, 'withdrawn');
  });
  test('adults and junk: the country follows a valid number only', async () => {
    const adult = await signUp({ dob: '1990-01-01', phone: phone('91'), country: 'IN' });
    await verify(adult, '+971501234998');
    assert.deepEqual([(await prof(adult)).signup_country, (await prof(adult)).guardian_consent], ['AE', null]);
    await verify(adult, 'not a number');
    assert.equal((await prof(adult)).signup_country, 'AE');
    await verify(adult, '+12025550999');
    assert.equal((await prof(adult)).signup_country, 'US', '+1 verified: US unless the device said Canada');
  });
});

describe('the wiring', () => {
  test('verify-phone-firebase records the country for the caller\'s own number (and on a claim)', () => {
    const src = read('supabase/functions/verify-phone-firebase/index.ts');
    assert.match(src, /admin\.rpc\('apply_verified_phone_country', \{ p_profile: profileId, p_phone: phone \}\)/);
    assert.match(src, /outcome = [^\n]+\n\s+await recordCountry\(caller\.user\.id, phone\);/, 'on a claim');
    assert.match(src, /if \(channel === 'phone'\) await recordCountry\(caller\.user\.id, phone\);/, 'the own number, not a guardian\'s');
  });
  test('the app sends the number\'s country, and the sign-up screen follows it', () => {
    assert.match(read('src/core/auth.tsx'), /const country = phoneCountry\(normPhone \?\? ''\) \?\? privacyCountry\(\);/);
    assert.match(read('src/screens/AuthScreen.tsx'), /const country = phoneCountry\(mobile\) \?\? privacyCountry\(\);/);
  });
});
