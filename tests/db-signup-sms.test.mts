/**
 * SMS verification is required at sign-up (founder 2026-10-29). The mobile is
 * proven by a Firebase SMS code first; `phone-login` swaps the proof for a
 * one-time ticket; the Auth "Before User Created" hook refuses an email sign-up
 * whose ticket doesn't match its number; the new profile redeems the ticket,
 * and its player starts with the mobile verified (no second SMS).
 *
 * Against a real Postgres (PGlite, every migration applied).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => {
  db = await bootDb({ strict: true });
  // switched on after the app that sends the ticket is published
  await db.sql(`update signup_guard_settings set require_phone = true`);
});

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
let n = 0;
const phone = () => `+9198${String(10_000_000 + ++n).padStart(8, '0')}`;
const ticketFor = async (p: string) => (await db.asService<{ t: string }>(`select create_signup_phone_ticket($1) as t`, [p]))[0].t;
type Hook = { error?: { http_code: number; message: string } };
const hook = async (user: Record<string, unknown>, ip = `10.0.${n % 250}.${++n % 250}`) =>
  (await db.sql<{ r: Hook }>(`select hook_before_user_created($1::jsonb) as r`, [JSON.stringify({ metadata: { ip_address: ip }, user })]))[0].r;
const emailUser = (p: string, ticket?: string, email = `u${++n}@school.in`) =>
  ({ email, phone: '', user_metadata: { phone: p, dob: '2000-01-01', ...(ticket ? { phone_ticket: ticket } : {}) } });

describe('the ticket', () => {
  test('only the server makes one (after the SMS check); a new one replaces the last for that number', async () => {
    const p = phone();
    await assert.rejects(db.asAnon(`select create_signup_phone_ticket($1)`, [p]));
    await assert.rejects(db.as(await db.signUp({}), `select create_signup_phone_ticket($1)`, [p]));
    const a = await ticketFor(p);
    const b = await ticketFor(p);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
    const rows = await db.sql<{ h: string }>(`select token_hash as h from signup_phone_tickets where phone = $1`, [p]);
    assert.equal(rows.length, 1, 'one live ticket per number');
    assert.notEqual(rows[0].h, b, 'only the hash is kept');
    for (const who of ['anon', 'authenticated']) {
      const [g] = await db.sql<{ ok: boolean }>(`select has_table_privilege($1, 'signup_phone_tickets', 'select') as ok`, [who]);
      assert.equal(g.ok, false, who);
    }
  });
});

describe('the sign-up hook', () => {
  test('an email sign-up with no ticket is refused, with words the app shows', async () => {
    const r = await hook(emailUser(phone()));
    assert.equal(r.error?.http_code, 400);
    assert.match(r.error?.message ?? '', /verify your mobile/i);
  });
  test('a ticket for this number lets it through; another number\'s, an expired or a used one doesn\'t', async () => {
    const p = phone();
    const t = await ticketFor(p);
    assert.deepEqual(await hook(emailUser(p, t)), {});
    assert.ok((await hook(emailUser(phone(), t))).error, 'another number');
    const old = phone();
    const te = await ticketFor(old);
    await db.sql(`update signup_phone_tickets set expires_at = now() - interval '1 minute' where phone = $1`, [old]);
    assert.ok((await hook(emailUser(old, te))).error, 'expired');
    const used = phone();
    const tu = await ticketFor(used);
    await db.sql(`update signup_phone_tickets set used_at = now() where phone = $1`, [used]);
    assert.ok((await hook(emailUser(used, tu))).error, 'used');
    assert.ok((await hook(emailUser(p, 'f'.repeat(64)))).error, 'a made-up ticket');
  });
  test('the number may be written differently (spaces): the same number', async () => {
    const p = phone();
    const t = await ticketFor(p);
    assert.deepEqual(await hook(emailUser(`${p.slice(0, 3)} ${p.slice(3, 8)} ${p.slice(8)}`, t)), {});
  });
  test('our own mobile sign-in (phone-login) needs no ticket', async () => {
    assert.deepEqual(await hook({ email: `${crypto.randomUUID()}@phone.sportnnote.in`, phone: phone(), user_metadata: {} }), {});
  });
  test('support can switch the requirement off (an SMS outage); the other guards stay', async () => {
    await db.sql(`update signup_guard_settings set require_phone = false`);
    assert.deepEqual(await hook(emailUser(phone())), {});
    assert.match((await hook({ ...emailUser(phone()), email: 'x@mailinator.com' })).error?.message ?? '', /temporary inbox/);
    await db.sql(`update signup_guard_settings set require_phone = true`);
  });
});

describe('the new account redeems the ticket', () => {
  test('the player starts with the mobile verified; the ticket is spent', async () => {
    const p = phone();
    const t = await ticketFor(p);
    const uid = await db.signUp({ dob: '1990-01-01', meta: { phone: p, phone_ticket: t } });
    const [pl] = await db.sql<{ phone: string; phone_verified: boolean }>(`select phone, phone_verified from players where profile_id = $1`, [uid]);
    assert.deepEqual(pl, { phone: p, phone_verified: true });
    const [tk] = await db.sql<{ used_by: string; used_at: string | null }>(`select used_by, used_at from signup_phone_tickets where phone = $1`, [p]);
    assert.equal(tk.used_by, uid);
    assert.ok(tk.used_at);
    const [pr] = await db.sql<{ c: string }>(`select signup_country as c from profiles where id = $1`, [uid]);
    assert.equal(pr.c, 'IN');
  });
  test('a coach-made profile with that number is linked to the new account (same first name and birth year)', async () => {
    const p = phone();
    const coach = await db.signUp({ dob: '1985-01-01' });
    const [kid] = await db.as<{ id: string }>(coach, `insert into players (full_name, phone, dob) values ('Asha Rao', $1, '2001-01-01') returning id`, [p]);
    const t = await ticketFor(p);
    const uid = await db.signUp({ name: 'Asha Rao', dob: '2001-01-01', meta: { phone: p, phone_ticket: t } });
    const [pl] = await db.sql<{ profile_id: string; phone_verified: boolean }>(`select profile_id, phone_verified from players where id = $1`, [kid.id]);
    assert.deepEqual(pl, { profile_id: uid, phone_verified: true });
  });
  test('break-it: a parent\'s number on a child\'s profile — the parent signing up doesn\'t get the child\'s profile', async () => {
    const p = phone();
    const coach = await db.signUp({ dob: '1985-01-01' });
    const [kid] = await db.as<{ id: string }>(coach, `insert into players (full_name, phone) values ('Kabir Shah', $1) returning id`, [p]);
    const t = await ticketFor(p);
    const parent = await db.signUp({ name: 'Meera Shah', dob: '1984-01-01', meta: { phone: p, phone_ticket: t } });
    const [k] = await db.sql<{ profile_id: string | null }>(`select profile_id from players where id = $1`, [kid.id]);
    assert.equal(k.profile_id, null, 'the child\'s profile stays unlinked (support links by hand)');
    const own = await db.sql<{ id: string }>(`select id from players where profile_id = $1`, [parent]);
    assert.equal(own.length, 1, 'the parent gets their own profile');
  });
  test('break-it: the mobile sign-in route (phone-login) uses the same checks', async () => {
    const p = phone();
    const coach = await db.signUp({ dob: '1985-01-01' });
    const [kid] = await db.as<{ id: string }>(coach, `insert into players (full_name, phone) values ('Kabir Shah', $1) returning id`, [p]);
    const parent = await db.signUp({ name: 'Meera Shah', dob: '1984-01-01' });
    await db.asService(`select phone_login_attach_player($1, $2)`, [parent, p]);
    const [k] = await db.sql<{ profile_id: string | null }>(`select profile_id from players where id = $1`, [kid.id]);
    assert.equal(k.profile_id, null);
  });
  test('a ticket can\'t be spent twice, or for another number', async () => {
    const p = phone();
    const t = await ticketFor(p);
    const first = await db.signUp({ dob: '1990-01-01', meta: { phone: p, phone_ticket: t } });
    const second = await db.signUp({ dob: '1990-01-01', meta: { phone: phone(), phone_ticket: t } });
    const [tk] = await db.sql<{ used_by: string }>(`select used_by from signup_phone_tickets where phone = $1`, [p]);
    assert.equal(tk.used_by, first);
    const rows = await db.sql(`select 1 from players where profile_id = $1 and phone_verified`, [second]);
    assert.deepEqual(rows, [], 'nothing verified for the second account');
  });
  test('a sign-up with no ticket (the hook off, or a test) still creates the profile, unverified', async () => {
    const uid = await db.signUp({ dob: '1990-01-01', meta: { phone: phone() } });
    const rows = await db.sql(`select 1 from profiles where id = $1`, [uid]);
    assert.equal(rows.length, 1);
  });
});

describe('the rollout', () => {
  test('the requirement ships off, so the app already out there keeps signing people up', () => {
    assert.match(read('supabase/migrations/20261029100000_signup_sms.sql'), /require_phone boolean not null default false/);
  });
});

describe('the wiring', () => {
  test('phone-login hands out a ticket for a proven number that has no account', () => {
    const src = read('supabase/functions/phone-login/index.ts');
    assert.match(src, /purpose === 'signup-ticket'/);
    assert.match(src, /admin\.rpc\('create_signup_phone_ticket', \{ p_phone: phone \}\)/);
  });
  test('the app proves the mobile before "Create account", and sends the ticket', () => {
    const auth = read('src/core/auth.tsx');
    assert.match(auth, /phone_ticket: phoneTicket/);
    const screen = read('src/screens/AuthScreen.tsx');
    assert.match(screen, /if \(!phoneTicket\) return setError\(/);
    assert.match(read('src/core/phoneLogin.ts'), /export async function proveSignupPhone\(/);
  });
  test('the spent ticket is cleared from the account\'s sign-up metadata', async () => {
    const { metadataToClear } = await import('../src/core/authMetadata.ts');
    assert.deepEqual(metadataToClear({ full_name: 'A', phone_ticket: 'abc' }), { phone_ticket: null });
  });
  test('the sign-in check makes sure the app explains the refusal clearly', () => {
    assert.match(read('scripts/auth-smoke.mjs'), /verify your mobile/i);
    assert.match(read('src/core/auth.tsx'), /verify your mobile/i);
  });
});
