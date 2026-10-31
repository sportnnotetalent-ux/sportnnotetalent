/**
 * Quality mandate step 6 for the audit security fixes (AS-01, AS-02, AS-04 —
 * docs/security/breaks/audit-security-2026-10-31.md):
 *  - 500 people verify a contact: each makes 0–4 mistakes then types the right
 *    code (all verified); 500 attackers each fire 2,000 guesses in waves of 100
 *    at once (none ever gets more than 5 compared);
 *  - 500 disputes on a real Postgres, driven by their match managers through
 *    every allowed path, then every attempt to reopen or skip is refused;
 *  - 1,000 random phone sign-ups (ages 5–60, +1 / +91 / +44 numbers, partial
 *    guardian details) all get the answer the rule says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOtp, MAX_OTP_ATTEMPTS, type OtpRow } from '../supabase/functions/_shared/otpCheck.ts';
import { minorSignupProblem, US_UNDER_13 } from '../supabase/functions/_shared/minorSignup.ts';
import { bootDb } from './helpers/pgdb.mts';

const tick = () => new Promise<void>((r) => setImmediate(r));
function otpStore() {
  const row: OtpRow = { code_hash: 'right', attempts: 0, expires_at: new Date(Date.now() + 600_000).toISOString() };
  let compared = 0;
  return {
    row, get compared() { return compared; },
    read: async () => { await tick(); return { ...row }; },
    claim: async (n: number) => { await tick(); if (row.attempts !== n) return false; row.attempts = n + 1; return true; },
    seen: () => { compared++; },
  };
}

test('AS-01: 500 honest people verify; 500 attackers never pass 5 compared guesses', async () => {
  let verified = 0;
  for (let u = 0; u < 500; u++) {
    const s = otpStore();
    for (let m = 0; m < u % MAX_OTP_ATTEMPTS; m++) await checkOtp(await s.read(), 'typo', Date.now(), s.claim);
    if ((await checkOtp(await s.read(), 'right', Date.now(), s.claim)) === 'ok') verified++;
  }
  assert.equal(verified, 500);

  let worst = 0, cracked = 0;
  for (let a = 0; a < 500; a++) {
    const s = otpStore();
    for (let wave = 0; wave < 20; wave++) {
      const outs = await Promise.all(Array.from({ length: 100 }, async (_, i) =>
        checkOtp(await s.read(), (a * 7 + wave * 100 + i) % 900_000 === 4242 ? 'right' : `g${wave}-${i}`, Date.now(), s.claim, s.seen)));
      cracked += outs.filter((o) => o === 'ok').length;
    }
    worst = Math.max(worst, s.compared);
  }
  assert.ok(worst <= MAX_OTP_ATTEMPTS, `an attacker got ${worst} guesses compared`);
  assert.ok(cracked <= 1, 'at most a lucky guess inside the 5 allowed');
});

test('AS-02: 500 disputes through every allowed path; no reopen or skip gets through', async () => {
  const db = await bootDb();
  const host = await db.signUp({ name: 'Host', dob: '1980-01-01' });
  const [hp] = await db.as<{ id: string }>(host, `insert into players (full_name, profile_id) values ('Host', $1) returning id`, [host]);
  const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Home XI', 'HOM', 'football') returning id`);
  const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Away XI', 'AWA', 'football') returning id`);
  const paths = [['open', 'resolved'], ['open', 'dismissed'], ['dismissed']];
  const tryMove = async (id: string, to: string) => { try { await db.as(host, `update match_disputes set status = $2 where id = $1`, [id, to]); return true; } catch { return false; } };
  let done = 0, blocked = 0, leaked = 0;
  for (let i = 0; i < 500; i++) {
    const [m] = await db.sql<{ id: string }>(`insert into matches (sport, status, home_team_id, away_team_id, host_ids) values ('football', 'completed', $1, $2, $3) returning id`, [h.id, a.id, [hp.id]]);
    const [d] = await db.sql<{ id: string }>(`insert into match_disputes (match_id, side, player_name, kind, status) values ($1, 'home', 'P', 'report', 'reported') returning id`, [m.id]);
    for (const to of paths[i % 3]) assert.ok(await tryMove(d.id, to), `allowed move to ${to}`);
    done++;
    for (const to of ['reported', 'open', 'resolved', 'dismissed']) {
      const [{ status }] = await db.sql<{ status: string }>(`select status from match_disputes where id = $1`, [d.id]);
      if (to === status) continue;
      if (await tryMove(d.id, to)) leaked++; else blocked++;
    }
  }
  assert.equal(done, 500);
  assert.equal(leaked, 0);
  assert.equal(blocked, 1500);
});

test('AS-04: 1,000 random phone sign-ups get exactly the rule', () => {
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const counts = { us13: 0, minorOk: 0, minorRefused: 0, adult: 0 };
  for (let i = 0; i < 1000; i++) {
    const age = 5 + rnd(56);
    const phone = ['+12025550', '+9198765', '+447700900'][rnd(3)] + String(100 + rnd(900));
    const guardian = { name: rnd(5) ? 'Parent' : '', email: [`p${i}@mail.in`, '', 'bad@', 42][rnd(4)], phone: rnd(2) ? '+919812345678' : '', consent: rnd(6) !== 0 };
    const got = minorSignupProblem(age, phone, guardian);
    const complete = guardian.name && typeof guardian.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian.email) && guardian.consent;
    if (age < 13 && phone.startsWith('+1')) { assert.equal(got, US_UNDER_13); counts.us13++; }
    else if (age >= 18) { assert.equal(got, null); counts.adult++; }
    else if (complete) { assert.equal(got, null); counts.minorOk++; }
    else { assert.match(got!, /email and consent/); counts.minorRefused++; }
  }
  for (const [k, n] of Object.entries(counts)) assert.ok(n > 20, `${k} was exercised (${n})`);
});
