/**
 * AS-01 (docs/security/breaks/audit-security-2026-10-31.md) — the 5-guess cap
 * on contact verification codes must hold when guesses arrive at the same
 * moment. Every guess first claims one attempt atomically (attempts n → n+1,
 * only if it is still n); a guess that loses the race is not compared at all.
 * The rule lives in supabase/functions/_shared/otpCheck.ts (Deno code isn't
 * run here); the function's wiring is checked on its source, and the database
 * half of the claim (UPDATE … WHERE attempts = n) on a real Postgres.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkOtp, MAX_OTP_ATTEMPTS, type OtpRow } from '../supabase/functions/_shared/otpCheck.ts';
import { bootDb } from './helpers/pgdb.mts';

const RIGHT = 'hash-of-right-code';
const future = () => new Date(Date.now() + 10 * 60_000).toISOString();
const tick = () => new Promise<void>((r) => setImmediate(r));

/** An in-memory row with the same compare-and-swap the function does in SQL. */
function store(attempts = 0) {
  const row: OtpRow = { code_hash: RIGHT, attempts, expires_at: future() };
  let compared = 0;
  return {
    row,
    get compared() { return compared; },
    read: async (): Promise<OtpRow> => { await tick(); return { ...row }; },
    claim: async (n: number) => { await tick(); if (row.attempts !== n) return false; row.attempts = n + 1; return true; },
    onCompare: () => { compared++; },
  };
}

describe('one guess at a time', () => {
  test('5 wrong guesses, then even the right code is refused', async () => {
    const s = store();
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) assert.equal(await checkOtp(await s.read(), 'wrong', Date.now(), s.claim), 'mismatch');
    assert.equal(await checkOtp(await s.read(), RIGHT, Date.now(), s.claim), 'too_many');
  });
  test('4 wrong guesses, then the right code still works (5th try)', async () => {
    const s = store();
    for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i++) await checkOtp(await s.read(), 'wrong', Date.now(), s.claim);
    assert.equal(await checkOtp(await s.read(), RIGHT, Date.now(), s.claim), 'ok');
  });
  test('no code, and an expired code', async () => {
    const s = store();
    assert.equal(await checkOtp(null, RIGHT, Date.now(), s.claim), 'none');
    assert.equal(await checkOtp({ ...s.row, expires_at: new Date(Date.now() - 1).toISOString() }, RIGHT, Date.now(), s.claim), 'expired');
  });
});

describe('many guesses at the same moment', () => {
  test('1,000 parallel guesses: at most 5 are ever compared', async () => {
    const s = store();
    const guess = async (h: string) => {
      const row = await s.read(); // every request reads before any writes
      return checkOtp(row, h, Date.now(), s.claim, s.onCompare);
    };
    const outcomes = await Promise.all(Array.from({ length: 1000 }, (_, i) => guess(`wrong-${i}`)));
    assert.ok(s.compared <= MAX_OTP_ATTEMPTS, `compared ${s.compared} guesses`);
    assert.equal(outcomes.filter((o) => o === 'ok').length, 0);
    assert.equal(s.row.attempts, s.compared);
  });
  test('waves of parallel guesses never pass the cap in total', async () => {
    const s = store();
    for (let wave = 0; wave < 20; wave++) {
      await Promise.all(Array.from({ length: 50 }, async (_, i) => checkOtp(await s.read(), `w${wave}-${i}`, Date.now(), s.claim, s.onCompare)));
    }
    assert.equal(s.compared, MAX_OTP_ATTEMPTS);
    assert.equal(await checkOtp(await s.read(), RIGHT, Date.now(), s.claim), 'too_many');
  });
});

describe('the function and the database', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'supabase/functions/verify-contact-otp/index.ts'), 'utf8');
  test('verify-contact-otp uses the shared check with an atomic claim and a rate limit', () => {
    assert.match(src, /from '\.\.\/_shared\/otpCheck\.ts'/);
    assert.match(src, /\.eq\('attempts', n\)/);
    assert.match(src, /rateLimit\('contact-otp-verify'/);
    assert.doesNotMatch(src, /otp\.attempts \?\? 0\) \+ 1/, 'the old read-then-write increment is gone');
  });
  test('Postgres: a claim on a stale count changes nothing', async () => {
    const db = await bootDb();
    const uid = await db.signUp({ name: 'Otp Tester', dob: '1990-01-01' });
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id) values ('Otp Tester', $1) returning id`, [uid]);
    await db.sql(`insert into contact_otps (player_id, channel, code_hash, target, attempts, expires_at) values ($1, 'email', 'h', 't@x.in', 0, now() + interval '10 minutes')`, [p.id]);
    const claim = (n: number) => db.sql(`update contact_otps set attempts = $2 + 1 where player_id = $1 and channel = 'email' and attempts = $2 returning player_id`, [p.id, n]);
    assert.equal((await claim(0)).length, 1);
    assert.equal((await claim(0)).length, 0, 'the second request with the same count loses');
    assert.equal((await claim(1)).length, 1);
  });
});
