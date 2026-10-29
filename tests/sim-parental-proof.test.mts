/**
 * CL-03 parental proof — 500 families (quality mandate step 6). Random journeys:
 * parents send documents (some from the wrong account: the child, a teenager,
 * an account with no age), reviewers approve or reject, rejected parents resend,
 * some parents decline, some children delete their account, certificates are
 * issued to everyone, and 30 days later the files are deleted. Then every rule
 * is checked for all of them at once.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb(); });

let seed = 20261029;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const chance = (p: number) => rnd() < p;
let n = 0;
const err = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

type Family = { kid: string; player: string; parent: string; fate: 'approved' | 'rejected' | 'waiting' | 'declined' | 'deleted' | 'none' };

test('500 families: every rule holds for everyone', { timeout: 600_000 }, async () => {
  const reviewers: string[] = [];
  for (let i = 0; i < 3; i++) {
    const uid = await db.signUp({ name: `Reviewer ${i}`, dob: '1980-01-01' });
    await db.as(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1980-01-01')`, [`Reviewer ${i}`, uid]);
    await db.sql(`update profiles set role = 'support' where id = $1`, [uid]);
    reviewers.push(uid);
  }
  const families: Family[] = [];
  let refusedImposters = 0;

  for (let i = 0; i < 500; i++) {
    const ph = `+91${String(8_000_000_000 + ++n)}`;
    const email = `p${i}@example.com`;
    const kid = await db.signUp({ dob: '2011-05-05', phone: ph, name: `Kid ${i}`, meta: { phone: ph, country: 'IN', guardian: { email } } });
    const [p] = await db.as<{ id: string }>(kid, `insert into players (full_name, profile_id, dob, guardian) values ($1, $2, '2011-05-05', $3) returning id`,
      [`Kid ${i}`, kid, JSON.stringify({ email })]);
    const parent = await db.signUp({ name: `Parent ${i}`, dob: '1982-02-02' });
    await db.as(parent, `insert into players (full_name, profile_id, dob) values ($1, $2, '1982-02-02')`, [`Parent ${i}`, parent]);
    const fam: Family = { kid, player: p.id, parent, fate: 'none' };
    families.push(fam);

    const code = (await db.asService<{ c: { code: string } }>(`select create_guardian_consent_code($1) as c`, [kid]))[0].c.code;
    const upload = async (owner: string, f: string) => {
      const path = `${owner}/guardian-${kid}/${f}-${++n}.jpg`;
      await db.sql(`insert into storage.objects (bucket_id, name, owner) values ('verification-docs', $1, $2)`, [path, owner]);
      return path;
    };
    const submit = async (who: string, c: string | null) => (await db.as<{ id: string }>(who,
      `select guardian_proof_submit($1, $2, 'mother', $3, $4, $5, true) as id`,
      [c, kid, `Parent ${i}`, await upload(who, 'id'), await upload(who, 'rel')]))[0].id;

    // Imposters first: the child, a teenager, an account with no age — all refused.
    if (chance(0.15)) {
      const who = chance(0.34) ? kid : await db.signUp({ name: 'Imposter', ...(chance(0.5) ? { dob: '2009-09-09' } : {}) });
      if (await err(() => submit(who, code))) refusedImposters++;
      else assert.fail(`family ${i}: an imposter's proof was accepted`);
    }

    if (chance(0.08)) { await db.asAnon(`select guardian_consent_decide($1, false)`, [code]); fam.fate = 'declined'; continue; }
    if (chance(0.1)) continue; // never answered
    const proof = await submit(parent, code);
    fam.fate = 'waiting';
    if (chance(0.15)) continue; // still being checked
    const rev = reviewers[i % reviewers.length];
    if (chance(0.25)) {
      await db.as(rev, `select decide_guardian_proof($1, false, 'The ID is hard to read')`, [proof]);
      fam.fate = 'rejected';
      if (chance(0.6)) {
        const again = await submit(parent, null);
        await db.as(reviewers[(i + 1) % reviewers.length], `select decide_guardian_proof($1, true)`, [again]);
        fam.fate = 'approved';
      }
    } else {
      await db.as(rev, `select decide_guardian_proof($1, true)`, [proof]);
      fam.fate = 'approved';
    }
    if (fam.fate !== 'approved' && chance(0.3)) { await db.sql(`delete from auth.users where id = $1`, [kid]); fam.fate = 'deleted'; }
  }

  // Certificates go to everyone still here; only approved children get one.
  for (const f of families.filter((x) => x.fate !== 'deleted')) {
    await db.sql(`insert into certificates (code, player_id, kind, title) values ($1, $2, 'participation', 'Sports day')`, [`S${++n}`, f.player]);
  }

  const alive = families.filter((f) => f.fate !== 'deleted');
  const states = new Map((await db.sql<{ id: string; s: string; m: string | null; limited: boolean }>(
    `select id, guardian_consent as s, guardian_consent_method as m, minor_account_limited(id) as limited from profiles where id = any($1::uuid[])`,
    [alive.map((f) => f.kid)])).map((r) => [r.id, r]));
  const hidden = new Set((await db.asAnon<{ ids: string[] }>(`select limited_player_ids($1::uuid[]) as ids`, [alive.map((f) => f.player)]))[0].ids);
  const links = new Map((await db.sql<{ id: string; g: string | null }>(`select id, guardian_profile_id as g from players where id = any($1::uuid[])`,
    [alive.map((f) => f.player)])).map((r) => [r.id, r.g]));
  const certs = new Set((await db.sql<{ p: string }>(`select distinct player_id as p from certificates`)).map((r) => r.p));

  for (const f of alive) {
    const st = states.get(f.kid)!;
    if (f.fate === 'approved') {
      assert.deepEqual([st.s, st.m, st.limited], ['confirmed', 'documents', false], `approved ${f.kid}`);
      assert.equal(links.get(f.player), f.parent, 'the parent who sent the documents is linked');
      assert.ok(!hidden.has(f.player), 'approved children are listed');
      assert.ok(certs.has(f.player), 'approved children get certificates');
    } else {
      assert.equal(st.limited, true, `${f.fate} ${f.kid} stays limited`);
      assert.ok(['pending', 'withdrawn'].includes(st.s), `${f.fate}: ${st.s}`);
      assert.notEqual(links.get(f.player), f.parent, `${f.fate}: nobody linked without approval`);
      assert.ok(hidden.has(f.player), `${f.fate}: hidden from public lists`);
      assert.ok(!certs.has(f.player), `${f.fate}: no certificate`);
    }
  }
  const [{ doubles }] = await db.sql<{ doubles: number }>(`select count(*)::int as doubles from (select child_profile_id from guardian_proofs
    where status = 'pending' and child_profile_id is not null group by 1 having count(*) > 1) x`);
  assert.equal(doubles, 0, 'never two open proofs for one child');

  // 30 days later: the decided proofs' files (and the deleted children's) are due; once marked, nothing is.
  await db.sql(`update guardian_proofs set reviewed_at = now() - interval '31 days' where reviewed_at is not null`);
  const due = await db.asService<{ proof_id: string }>(`select * from due_guardian_proof_docs(30)`);
  const [{ want }] = await db.sql<{ want: number }>(`select count(*)::int as want from guardian_proofs
    where docs_deleted_at is null and (status in ('approved', 'rejected') or child_profile_id is null)`);
  assert.equal(due.length, Math.min(want, 500));
  for (const d of due) await db.asService(`select mark_guardian_proof_docs_deleted($1)`, [d.proof_id]);
  const [{ left }] = await db.sql<{ left: number }>(`select count(*)::int as left from guardian_proofs
    where docs_deleted_at is null and (status in ('approved', 'rejected') or child_profile_id is null) and (id_path is not null or relation_path is not null)`);
  assert.equal(left, Math.max(0, want - 500), 'the rest go in the next daily run');

  const tally = families.reduce<Record<string, number>>((t, f) => ({ ...t, [f.fate]: (t[f.fate] ?? 0) + 1 }), {});
  assert.ok(tally.approved > 200 && tally.rejected > 10 && tally.waiting > 20 && tally.declined > 10 && tally.deleted > 3 && refusedImposters > 40,
    JSON.stringify({ ...tally, refusedImposters }));
});
