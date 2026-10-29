/**
 * CL-03 parental proof (design: docs/security/cl03-parental-proof-design.md;
 * founder 2026-10-28/29): every under-18 account needs a parent's photo ID and a
 * document showing the relationship, checked by a reviewer. The parent uses
 * their own account (18+), which becomes the linked guardian on approval. The
 * emailed link alone no longer confirms anything. The files are deleted 30 days
 * after the decision.
 *
 * RED=1 node --test tests/db-parental-proof.test.mts  → without the migration.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ skip: process.env.RED ? /parental_proof/ : undefined }); });

const KID = '2012-06-15';
let n = 0;
const phone = (cc = '91') => `+${cc}${String(9_000_000_000 + ++n).slice(-10)}`;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

/** An under-18 who signed up in India (+91) and named a parent's email. */
async function kid(guardianEmail = `parent${++n}@example.com`) {
  const ph = phone('91');
  const uid = await db.signUp({ dob: KID, phone: ph, name: 'Asha Rao',
    meta: { phone: ph, country: 'IN', guardian: { name: 'Meera Rao', email: guardianEmail } } });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob, guardian) values ('Asha Rao', $1, $2, $3) returning id`,
    [uid, KID, JSON.stringify({ name: 'Meera Rao', email: guardianEmail })]);
  return { uid, player: p.id, guardianEmail };
}
/** An adult account with a player row (profile_age reads it). */
async function adult(name: string, o: { email?: string; dob?: string | null } = {}) {
  const uid = await db.signUp({ name, email: o.email, dob: o.dob === null ? undefined : o.dob ?? '1984-02-02' });
  if (o.dob !== null) await db.as(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3)`, [name, uid, o.dob ?? '1984-02-02']);
  return uid;
}
async function reviewer(name = 'Support Sam') {
  const uid = await adult(name);
  await db.sql(`update profiles set role = 'support' where id = $1`, [uid]);
  return uid;
}
const codeFor = async (childUid: string) =>
  (await db.asService<{ c: { code: string } }>(`select create_guardian_consent_code($1) as c`, [childUid]))[0].c.code;
async function upload(ownerUid: string, childUid: string, file: string) {
  const path = `${ownerUid}/guardian-${childUid}/${file}`;
  await db.sql(`insert into storage.objects (bucket_id, name, owner) values ('verification-docs', $1, $2)`, [path, ownerUid]);
  return path;
}
async function submit(parentUid: string, childUid: string, o: { code?: string | null; id?: string; rel?: string; relationship?: string; name?: string; dob?: boolean } = {}) {
  const id = o.id ?? await upload(parentUid, childUid, `id-${++n}.jpg`);
  const rel = o.rel ?? await upload(parentUid, childUid, `relation-${++n}.pdf`);
  const [r] = await db.as<{ id: string }>(parentUid,
    `select guardian_proof_submit($1, $2, $3, $4, $5, $6, $7) as id`,
    [o.code === undefined ? await codeFor(childUid) : o.code, childUid, o.relationship ?? 'mother', o.name ?? 'Meera Rao', id, rel, o.dob ?? true]);
  return r.id;
}
const consent = async (uid: string) =>
  (await db.sql<{ s: string; m: string | null }>(`select guardian_consent as s, guardian_consent_method as m from profiles where id = $1`, [uid]))[0];
const decide = (revUid: string, proof: string, approve: boolean, reason: string | null = null) =>
  db.as<{ s: string }>(revUid, `select decide_guardian_proof($1, $2, $3) as s`, [proof, approve, reason]);

describe('every under-18 waits for a parent — India too', () => {
  test('an Indian (+91) under-18 starts "pending", not self-declared', async () => {
    const k = await kid();
    assert.equal((await consent(k.uid)).s, 'pending');
  });
  test('a pending child is limited', async () => {
    const k = await kid();
    const [{ l }] = await db.sql<{ l: boolean }>(`select minor_account_limited($1) as l`, [k.uid]);
    assert.equal(l, true);
  });
});

describe('the emailed link alone confirms nothing (audit CL-03)', () => {
  test('"Approve" through the link asks for documents and changes nothing', async () => {
    const k = await kid();
    const stranger = await adult('Anyone With The Link');
    const [{ r }] = await db.as<{ r: { status: string } }>(stranger, `select guardian_consent_decide($1, true, 'Me', true) as r`, [await codeFor(k.uid)]);
    assert.equal(r.status, 'documents_needed');
    assert.equal((await consent(k.uid)).s, 'pending');
    const [pl] = await db.sql<{ g: string | null; dc: unknown }>(`select guardian_profile_id as g, dob_confirmations as dc from players where id = $1`, [k.player]);
    assert.equal(pl.g, null, 'not linked as guardian');
    assert.equal((pl.dc as Record<string, unknown> | null)?.parent, undefined, 'no parent-confirmed date of birth');
  });
  test('declining through the link still works (it only limits the child more)', async () => {
    const k = await kid();
    const [{ r }] = await db.asAnon<{ r: { status: string } }>(`select guardian_consent_decide($1, false) as r`, [await codeFor(k.uid)]);
    assert.equal(r.status, 'withdrawn');
  });
});

describe('the parent submits proof', () => {
  test('the link tells a signed-in parent which child it is for (to upload into the right folder) — nobody signed out', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const code = await codeFor(k.uid);
    const [{ c }] = await db.as<{ c: string }>(mum, `select guardian_proof_child($1) as c`, [code]);
    assert.equal(c, k.uid);
    assert.match(await errOf(() => db.asAnon(`select guardian_proof_child($1)`, [code])) ?? '', /sign in|permission/i);
    assert.match(await errOf(() => db.as(mum, `select guardian_proof_child('NOPE')`)) ?? '', /link|code/i);
  });
  test('a signed-in adult with the link submits; the child is "in review", still limited', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid);
    const [row] = await db.sql<{ status: string; relationship: string; name_on_id: string }>(`select status, relationship, name_on_id from guardian_proofs where id = $1`, [proof]);
    assert.deepEqual(row, { status: 'pending', relationship: 'mother', name_on_id: 'Meera Rao' });
    assert.equal((await consent(k.uid)).s, 'pending');
    const [{ st }] = await db.as<{ st: { status: string } }>(k.uid, `select my_guardian_proof_status() as st`);
    assert.equal(st.status, 'pending');
  });
  test('refused: signed out, the child themself, an account under 18, an account with no age', async () => {
    const k = await kid();
    const code = await codeFor(k.uid);
    const anonErr = await errOf(() => db.asAnon(`select guardian_proof_submit($1, $2, 'mother', 'X', 'a', 'b', true)`, [code, k.uid]));
    assert.match(anonErr ?? '', /sign in/i);
    assert.match(await errOf(() => submit(k.uid, k.uid, { code })) ?? '', /parent or guardian/i);
    const teen = await adult('Teen Sibling', { dob: '2010-01-01' });
    assert.match(await errOf(() => submit(teen, k.uid, { code })) ?? '', /18 or over/i);
    const noAge = await adult('No Age', { dob: null });
    assert.match(await errOf(() => submit(noAge, k.uid, { code })) ?? '', /18 or over/i);
  });
  test('refused: no valid link, a file outside the parent\'s own folder, a file that wasn\'t uploaded, a bad relationship, no name', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    assert.match(await errOf(() => submit(mum, k.uid, { code: 'NOTAREALCODE1234' })) ?? '', /link|code/i);
    const other = await adult('Someone Else');
    const theirs = await upload(other, k.uid, 'id.jpg');
    assert.match(await errOf(() => submit(mum, k.uid, { id: theirs })) ?? '', /upload/i);
    assert.match(await errOf(() => submit(mum, k.uid, { id: `${mum}/guardian-${k.uid}/never-uploaded.jpg` })) ?? '', /upload/i);
    assert.match(await errOf(() => submit(mum, k.uid, { relationship: 'neighbour' })) ?? '', /relationship/i);
    assert.match(await errOf(() => submit(mum, k.uid, { name: '  ' })) ?? '', /name/i);
  });
  test('one open proof per child', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    await submit(mum, k.uid);
    const dad = await adult('Ravi Rao');
    assert.match(await errOf(() => submit(dad, k.uid)) ?? '', /already being checked/i);
  });
});

describe('a reviewer decides', () => {
  test('approve: confirmed by documents, the parent linked, date of birth parent-confirmed, coach threads to the parent', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid, { dob: true });
    const rev = await reviewer();
    const [{ s }] = await decide(rev, proof, true);
    assert.equal(s, 'approved');
    assert.deepEqual(await consent(k.uid), { s: 'confirmed', m: 'documents' });
    const [pl] = await db.sql<{ g: string; guardian: Record<string, unknown>; dc: Record<string, { method: string }> }>(
      `select guardian_profile_id as g, guardian, dob_confirmations as dc from players where id = $1`, [k.player]);
    assert.equal(pl.g, mum);
    assert.equal(pl.guardian.relationship, 'mother');
    assert.equal(pl.guardian.confirmedName, 'Meera Rao');
    assert.equal(pl.dc.parent.method, 'documents');
    const [{ l }] = await db.sql<{ l: boolean }>(`select minor_account_limited($1) as l`, [k.uid]);
    assert.equal(l, false, 'no longer limited');
    const [{ c }] = await db.sql<{ c: number }>(`select count(*)::int as c from guardian_consent_requests where profile_id = $1`, [k.uid]);
    assert.equal(c, 0, 'the link is used up');
  });
  test('reject needs a reason; the child stays limited; the same parent can send new documents without a new link', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid);
    const rev = await reviewer();
    assert.match(await errOf(() => decide(rev, proof, false, null)) ?? '', /reason/i);
    await decide(rev, proof, false, 'The ID is unreadable');
    assert.equal((await consent(k.uid)).s, 'pending');
    const [{ st }] = await db.as<{ st: { status: string; reason: string } }>(k.uid, `select my_guardian_proof_status() as st`);
    assert.deepEqual([st.status, st.reason], ['rejected', 'The ID is unreadable']);
    const again = await submit(mum, k.uid, { code: null });
    assert.ok(again);
    const stranger = await adult('Not The Parent');
    assert.match(await errOf(() => submit(stranger, k.uid, { code: null })) ?? '', /link|code/i, 'without a link only the same parent may resend');
  });
  test('only reviewers decide; nobody reviews their own child; a decided proof can\'t be decided again', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid);
    assert.match(await errOf(() => decide(mum, proof, true)) ?? '', /reviewer/i);
    await db.sql(`update profiles set role = 'support' where id = $1`, [mum]);
    assert.match(await errOf(() => decide(mum, proof, true)) ?? '', /own/i, 'a reviewer who submitted it');
    const rev = await reviewer();
    await decide(rev, proof, true);
    assert.match(await errOf(() => decide(rev, proof, false, 'changed mind')) ?? '', /already/i);
  });
  test('the reviewer queue shows open proofs to reviewers only', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid);
    const rev = await reviewer();
    const rows = await db.as<{ id: string; child_name: string; id_path: string }>(rev, `select * from pending_guardian_proofs()`);
    assert.ok(rows.some((r) => r.id === proof && r.child_name === 'Asha Rao' && r.id_path.startsWith(`${mum}/guardian-${k.uid}/`)));
    assert.match(await errOf(() => db.as(mum, `select * from pending_guardian_proofs()`)) ?? '', /reviewer/i);
  });
  test('nobody reads or writes the proofs table directly', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    await submit(mum, k.uid);
    assert.match(await errOf(() => db.as(mum, `select * from guardian_proofs`)) ?? '', /permission/i);
    assert.match(await errOf(() => db.as(mum, `update guardian_proofs set status = 'approved'`)) ?? '', /permission/i);
  });
});

describe('the other doors to "confirmed" and "guardian" (audit CL-03)', () => {
  test('a linked guardian can\'t set "confirmed" without an approved proof — but can withdraw', async () => {
    const k = await kid();
    const linked = await adult('Linked Before');
    await db.sql(`update players set guardian_profile_id = $1 where id = $2`, [linked, k.player]);
    assert.match(await errOf(() => db.as(linked, `select guardian_set_consent($1, true)`, [k.player])) ?? '', /documents/i);
    const [{ s }] = await db.as<{ s: string }>(linked, `select guardian_set_consent($1, false) as s`, [k.player]);
    assert.equal(s, 'withdrawn');
  });
  test('an invite code links only the account whose email it was sent to, and never an account with no age', async () => {
    const k = await kid('meera.verified@example.com');
    const mk = async () => (await db.asService<{ c: string }>(`select create_guardian_link_code($1) as c`, [k.player]))[0].c;
    const wrong = await adult('Wrong Email', { email: 'someone.else@example.com' });
    const c1 = await mk();
    assert.match(await errOf(() => db.as(wrong, `select claim_guardian_link($1)`, [c1])) ?? '', /email/i);
    const noAge = await adult('No Age', { email: 'meera.verified@example.com', dob: null });
    const c2 = await mk();
    assert.match(await errOf(() => db.as(noAge, `select claim_guardian_link($1)`, [c2])) ?? '', /adult/i);
  });
});

describe('the documents are deleted 30 days after the decision', () => {
  test('due only after 30 days; marking clears the paths and keeps the outcome', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid);
    const rev = await reviewer();
    await decide(rev, proof, true);
    const due = async () => (await db.asService<{ proof_id: string }>(`select * from due_guardian_proof_docs(30)`)).map((r) => r.proof_id);
    assert.ok(!(await due()).includes(proof), 'not before 30 days');
    await db.sql(`update guardian_proofs set reviewed_at = now() - interval '31 days' where id = $1`, [proof]);
    assert.ok((await due()).includes(proof));
    await db.asService(`select mark_guardian_proof_docs_deleted($1)`, [proof]);
    const [row] = await db.sql<{ id_path: string | null; relation_path: string | null; docs_deleted_at: string | null; status: string }>(
      `select id_path, relation_path, docs_deleted_at, status from guardian_proofs where id = $1`, [proof]);
    assert.equal(row.id_path, null);
    assert.equal(row.relation_path, null);
    assert.ok(row.docs_deleted_at);
    assert.equal(row.status, 'approved');
    assert.ok(!(await due()).includes(proof));
  });
  test('only the service role runs the deletion helpers', async () => {
    const mum = await adult('Meera Rao');
    assert.match(await errOf(() => db.as(mum, `select * from due_guardian_proof_docs(0)`)) ?? '', /permission/i);
  });
});

describe('existing accounts', () => {
  test('a self-declared under-18 already on file waits for a parent after the migration', async () => {
    const fresh = await bootDb({ skip: /parental_proof/ });
    const ph = phone('91');
    const uid = await fresh.signUp({ dob: KID, phone: ph, meta: { phone: ph, country: 'IN', guardian: { email: 'p@example.com' } } });
    const before = (await fresh.sql<{ s: string }>(`select guardian_consent as s from profiles where id = $1`, [uid]))[0].s;
    assert.equal(before, 'self_declared');
    const file = readFileSync(join(import.meta.dirname, '..', 'supabase/migrations/20261029140000_parental_proof.sql'), 'utf8');
    await fresh.pg.exec(file);
    const after = (await fresh.sql<{ s: string }>(`select guardian_consent as s from profiles where id = $1`, [uid]))[0].s;
    assert.equal(after, 'pending');
  });
});

describe('break it (docs/security/breaks/parental-proof.md)', () => {
  test('PP-11: the child deletes their account while the proof waits — the parent\'s files are still deleted (at once)', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    const proof = await submit(mum, k.uid);
    await db.sql(`delete from auth.users where id = $1`, [k.uid]);
    const rows = await db.sql<{ child: string | null; id_path: string | null }>(`select child_profile_id as child, id_path from guardian_proofs where id = $1`, [proof]);
    assert.equal(rows.length, 1, 'the row stays until the files are gone');
    assert.equal(rows[0].child, null);
    const due = (await db.asService<{ proof_id: string }>(`select * from due_guardian_proof_docs(30)`)).map((r) => r.proof_id);
    assert.ok(due.includes(proof), 'due straight away, not 30 days after a decision that will never come');
  });
  test('PP-16: once approved by documents, nobody else can send a proof (withdraw first)', async () => {
    const k = await kid();
    const mum = await adult('Meera Rao');
    await decide(await reviewer(), await submit(mum, k.uid), true);
    const other = await adult('Another Adult');
    const code = await db.asService<{ c: { code: string } }>(`select create_guardian_consent_code($1) as c`, [k.uid]).then((r) => r[0].c.code).catch(() => null);
    const err = await errOf(() => submit(other, k.uid, { code: code ?? 'NONE' }));
    assert.match(err ?? '', /already approved|isn.t valid|no guardian confirmation/i);
    const [pl] = await db.sql<{ g: string }>(`select guardian_profile_id as g from players where id = $1`, [k.player]);
    assert.equal(pl.g, mum, 'the approved parent stays linked');
  });
  test('PP-16b: a parent rejected earlier can\'t resend once the other parent is approved', async () => {
    const k = await kid();
    const rev = await reviewer();
    const dad = await adult('Ravi Rao');
    await decide(rev, await submit(dad, k.uid, { relationship: 'father', name: 'Ravi Rao' }), false, 'Unreadable');
    const mum = await adult('Meera Rao');
    await decide(rev, await submit(mum, k.uid), true);
    assert.match(await errOf(() => submit(dad, k.uid, { code: null, relationship: 'father', name: 'Ravi Rao' })) ?? '', /already approved/i);
  });
  test('PP-21: an email sign-up with no valid date of birth is refused by the sign-up guard', async () => {
    const hook = async (meta: Record<string, unknown>) => (await db.sql<{ r: { error?: { message: string } } }>(
      `select hook_before_user_created($1::jsonb) as r`,
      [JSON.stringify({ metadata: { ip_address: `10.9.${++n % 250}.1` }, user: { email: `x${++n}@school.in`, phone: '', user_metadata: meta } })]))[0].r;
    assert.match((await hook({}))?.error?.message ?? '', /date of birth/i);
    assert.match((await hook({ dob: 'yesterday' }))?.error?.message ?? '', /date of birth/i);
    const ok = await hook({ dob: '2001-04-05' });
    assert.doesNotMatch(ok?.error?.message ?? '', /date of birth/i);
  });
  test('PP-23: each proof alerts reviewers once and tells the family once', async () => {
    const [cols] = await db.sql<{ a: number; b: number }>(`select
      count(*) filter (where column_name = 'reviewers_alerted_at')::int as a,
      count(*) filter (where column_name = 'family_told_at')::int as b
      from information_schema.columns where table_name = 'guardian_proofs'`);
    assert.deepEqual([cols.a, cols.b], [1, 1]);
    const src = readFileSync(join(import.meta.dirname, '..', 'supabase/functions/guardian-proof/index.ts'), 'utf8');
    assert.match(src, /reviewers_alerted_at/);
    assert.match(src, /family_told_at/);
  });
});

describe('limited until approved: hidden publicly (founder 2026-10-29)', () => {
  const approve = async (k: { uid: string }) => decide(await reviewer(), await submit(await adult('Meera Rao'), k.uid), true);
  test('which players are hidden — anyone may ask (search, Discover and leaderboards leave them out)', async () => {
    const k = await kid();
    const grown = await adult('Grown Up');
    const [g] = await db.sql<{ id: string }>(`select id from players where profile_id = $1`, [grown]);
    const ask = async () => (await db.asAnon<{ ids: string[] }>(`select limited_player_ids($1::uuid[]) as ids`, [[k.player, g.id]]))[0].ids;
    assert.deepEqual(await ask(), [k.player]);
    await approve(k);
    assert.deepEqual(await ask(), []);
  });
  test('no certificate is issued to a hidden child; once approved, it is', async () => {
    const k = await kid();
    const cert = async () => db.sql(`insert into certificates (code, player_id, kind, title) values ($1, $2, 'participation', 'Took part') returning id`, [`C${++n}`, k.player]);
    assert.equal((await cert()).length, 0);
    await approve(k);
    assert.equal((await cert()).length, 1);
  });
  test('no career passport link while hidden; withdrawing consent later takes the link down', async () => {
    const k = await kid();
    assert.match(await errOf(() => db.as(k.uid, `select passport_code($1)`, [k.player])) ?? '', /parent/i);
    await approve(k);
    const [{ c }] = await db.as<{ c: string }>(k.uid, `select passport_code($1) as c`, [k.player]);
    assert.ok(c);
    const [{ g }] = await db.sql<{ g: string }>(`select guardian_profile_id as g from players where id = $1`, [k.player]);
    await db.as(g, `select guardian_set_consent($1, false)`, [k.player]);
    const [pl] = await db.sql<{ code: string | null }>(`select passport_code as code from players where id = $1`, [k.player]);
    assert.equal(pl.code, null);
  });
  test('a hidden child is left out of Hall of Fame honours', async () => {
    const k = await kid();
    const head = await adult('Head Teacher');
    const [g] = await db.sql<{ id: string }>(`select id from players where profile_id = $1`, [head]);
    const [o] = await db.as<{ id: string }>(head, `insert into organizations (name, type, created_by) values ('School', 'School', auth.uid()) returning id`);
    const [h] = await db.sql<{ ids: string[] }>(`insert into org_honours (org_id, year, title, player_ids) values ($1, 2026, 'Sports day champions', $2::uuid[]) returning player_ids as ids`, [o.id, [k.player, g.id]]);
    assert.deepEqual(h.ids, [g.id]);
  });
});
