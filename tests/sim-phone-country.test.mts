/**
 * CL-04 simulation (quality mandate step 6): 600 sign-ups with a mix of
 * numbers, device countries and ages, then 300 SMS verifications, against a
 * real Postgres (PGlite). Every outcome is checked against an independent
 * model of the rule written here, not read from the migration.
 *
 * Invariants:
 *   • a US (+1) under-13 is refused; nobody else is;
 *   • an under-18 gets India's sign-up checkbox only with a +91 number on an
 *     Indian device (or one that sent no country); every other under-18 waits
 *     for a guardian;
 *   • the stored country is the number's (the stricter one when the device
 *     says otherwise on India);
 *   • a verification never loosens a route, tightens exactly the India
 *     checkboxes whose verified number isn't Indian, and logs each one.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

// a small seeded generator: the run is the same every time
let seed = 20261028;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

const CODES = ['91', '91', '91', '44', '971', '1', '33', ''] as const;
const DEVICES = ['IN', 'IN', 'GB', 'AE', 'US', 'CA', undefined] as const;
const MAPPED: Record<string, string> = { '91': 'IN', '44': 'GB', '971': 'AE' };
let n = 0;
const numberFor = (code: string) => (code === '' ? undefined : code === '1' ? `+1202555${String(1000 + (++n % 9000))}` : `+${code}${String(800_000_000 + ++n)}`.slice(0, code.length + 11));
/** A date of birth `age` and a half years ago (exactly `age` whatever today is). */
const dobFor = (age: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 12 * age - 6);
  return d.toISOString().slice(0, 10);
};

/** The rule, written independently of the SQL. */
function model(code: string, device: string | undefined, age: number) {
  const nanp = code === '1';
  const pc = code === '' ? null : nanp ? null : MAPPED[code] ?? 'ZZ';
  let cc: string | null;
  if (nanp) cc = device === 'US' || device === 'CA' ? device : null;
  else if (pc === 'IN' || pc === 'ZZ') cc = device && device !== 'IN' ? device : pc;
  else if (pc) cc = pc;
  else cc = device ?? null;
  const refused = age < 13 && (cc === 'US' || device === 'US' || nanp);
  // CL-03 parental proof (2026-10-29): every under-18 waits for a parent — India too.
  const consent = age >= 18 ? null : 'pending';
  const indiaKid = age < 18 && pc === 'IN' && cc === 'IN' && !nanp;
  return { cc, refused, consent, indiaKid };
}

type Row = { id: string; age: number; dob: string };
const accounts: Row[] = [];

describe('600 sign-ups', () => {
  test('every outcome matches the model', async () => {
    let refused = 0, india = 0, waiting = 0, adults = 0;
    for (let i = 0; i < 600; i++) {
      const code = pick(CODES);
      const device = pick(DEVICES);
      const age = pick([9, 11, 12, 14, 15, 16, 17, 25, 40]);
      const phone = numberFor(code);
      const want = model(code, device, age);
      let id: string | null = null;
      try {
        id = await db.signUp({ dob: dobFor(age), phone, meta: { ...(phone ? { phone } : {}), ...(device ? { country: device } : {}), guardian: { name: 'G', email: `g${i}@x.in` } } });
      } catch (e) {
        assert.ok(want.refused, `#${i} refused but shouldn't be: ${code} ${device} ${age}: ${(e as Error).message}`);
        assert.match((e as Error).message, /US_UNDER_13/);
        refused++;
        continue;
      }
      assert.ok(!want.refused, `#${i} accepted but should be refused: ${code} ${device} ${age}`);
      const [p] = await db.sql<{ signup_country: string | null; guardian_consent: string | null }>(
        `select signup_country, guardian_consent from profiles where id = $1`, [id]);
      assert.equal(p.signup_country, want.cc, `#${i} country: ${code} ${device}`);
      assert.equal(p.guardian_consent, want.consent, `#${i} consent: ${code} ${device} ${age}`);
      if (want.indiaKid) india++; else if (want.consent === 'pending') waiting++; else adults++;
      accounts.push({ id, age, dob: dobFor(age) });
    }
    // the mix exercised every branch
    assert.ok(refused > 10 && india > 50 && waiting > 100 && adults > 50, `${refused} refused, ${india} India, ${waiting} waiting, ${adults} adults`);
  });
});

describe('300 verifications', () => {
  test('never looser; nothing to tighten any more — every under-18 already waits for a parent', async () => {
    const before = await db.sql<{ n: number }>(`select count(*)::int as n from consent_log where method = 'phone_country'`);
    let tightened = 0;
    for (let i = 0; i < 300; i++) {
      const a = pick(accounts);
      const code = pick(['91', '44', '971', '1', '33', 'junk'] as const);
      const phone = code === 'junk' ? 'not a number' : numberFor(code);
      const [was] = await db.sql<{ c: string | null; g: string | null }>(`select signup_country as c, guardian_consent as g from profiles where id = $1`, [a.id]);
      await db.asService(`select apply_verified_phone_country($1, $2)`, [a.id, phone]);
      const [now] = await db.sql<{ c: string | null; g: string | null }>(`select signup_country as c, guardian_consent as g from profiles where id = $1`, [a.id]);
      if (code === 'junk') { assert.deepEqual(now, was, `#${i} junk changes nothing`); continue; }
      const wantC = code === '1' ? (was.c === 'US' || was.c === 'CA' ? was.c : 'US')
        : code === '33' ? (was.c && was.c !== 'IN' && was.c !== 'ZZ' ? was.c : 'ZZ') : MAPPED[code];
      assert.equal(now.c, wantC, `#${i} country`);
      const tighten = was.g === 'self_declared' && a.age < 18 && wantC !== 'IN';
      assert.equal(now.g, tighten ? 'pending' : was.g, `#${i} consent ${was.g} → ${now.g}`);
      assert.ok(!(was.g === 'pending' && now.g === 'self_declared'), 'never looser');
      if (tighten) tightened++;
    }
    const after = await db.sql<{ n: number }>(`select count(*)::int as n from consent_log where method = 'phone_country'`);
    assert.equal(after[0].n - before[0].n, tightened, 'one log row per tightening');
    assert.equal(tightened, 0, 'no self-declared accounts are left to tighten');
    const [{ sd }] = await db.sql<{ sd: number }>(`select count(*)::int as sd from profiles where guardian_consent = 'self_declared'`);
    assert.equal(sd, 0);
  });
});
