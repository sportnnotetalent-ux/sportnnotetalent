/**
 * 2026-10-29 (live error log: "cannot execute INSERT in a read-only transaction",
 * ×4): PostgREST runs an rpc declared STABLE or IMMUTABLE inside a READ ONLY
 * transaction. find_player_by_phone / find_player_by_email record a rate-limit
 * hit (an INSERT). 20261017120000_contact_lookup_volatile made them VOLATILE;
 * security Wave 1 (20261028120000) recreated them STABLE from an older body, so
 * "add a player by phone / email" failed on live. The other tests call rpcs in
 * a read-write transaction, so they never saw it — these call them the way
 * PostgREST does, and check no read-only function ever writes.
 *
 * RED=1 node --test tests/db-readonly-rpc.test.mts  → shows the bug (leaves the fix out).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ skip: process.env.RED ? /readonly_rpc_volatile/ : undefined }); });

test('no function PostgREST would run read-only writes — directly or through another function', async () => {
  const offenders = await db.sql<{ proname: string; vol: string }>(`
    with recursive fns as (
      select p.proname, p.provolatile::text as vol, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ), writers(name) as (
      select proname from fns where prosrc ~* '\\minsert\\s+into'
      union
      select f.proname from fns f join writers w on f.prosrc ~* ('\\m' || w.name || '\\s*\\(') and f.proname <> w.name
    )
    select distinct f.proname, f.vol from fns f join writers w on w.name = f.proname where f.vol in ('s', 'i') order by 1`);
  assert.deepEqual(offenders, []);
});

/** Call like PostgREST: READ ONLY when the function is declared STABLE / IMMUTABLE. */
async function rpcLikePostgrest(uid: string, fn: string, arg: string): Promise<unknown[]> {
  const [{ vol }] = await db.sql<{ vol: string }>(`select provolatile::text as vol from pg_proc where proname = $1`, [fn]);
  return db.pg.transaction(async (tx) => {
    if (vol === 's' || vol === 'i') await tx.query('set transaction read only');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    return (await tx.query(`select * from ${fn}($1)`, [arg])).rows;
  });
}

test('"add a player by phone / email" works the way the live API calls it', async () => {
  const uid = await db.signUp({ name: 'Looker' });
  await assert.doesNotReject(rpcLikePostgrest(uid, 'find_player_by_phone', '+919845000123'));
  await assert.doesNotReject(rpcLikePostgrest(uid, 'find_player_by_email', 'someone@example.com'));
  const [{ hits }] = await db.sql<{ hits: number }>(`select count(*)::int as hits from rate_limit_hits`).catch(() => [{ hits: -1 }]);
  assert.notEqual(hits, 0, 'the lookups still count towards the rate limit');
});

test('break it: the rate limit still holds — the 61st lookup in an hour is refused', async () => {
  const uid = await db.signUp({ name: 'Hammer' });
  for (let i = 0; i < 60; i++) await rpcLikePostgrest(uid, 'find_player_by_phone', `+9198450${String(10000 + i)}`);
  await assert.rejects(rpcLikePostgrest(uid, 'find_player_by_phone', '+919845099999'), /Too many lookups/);
  await assert.rejects(rpcLikePostgrest(uid, 'find_player_by_email', 'late@example.com'), /Too many lookups/, 'phone and email share the budget');
});

test('500 users each add someone by phone, the way the live app does — none fails', async () => {
  const uids: string[] = [];
  for (let i = 0; i < 500; i++) uids.push(await db.signUp({ name: `User ${i}` }));
  let failed = 0;
  for (const [i, uid] of uids.entries()) {
    await rpcLikePostgrest(uid, i % 2 ? 'find_player_by_phone' : 'find_player_by_email', i % 2 ? `+9198460${String(10000 + i)}` : `u${i}@example.com`).catch(() => { failed += 1; });
  }
  assert.equal(failed, 0);
  const [{ n }] = await db.sql<{ n: number }>(`select count(distinct subject)::int as n from rate_limit_hits where bucket = 'contact-lookup' and subject = any($1)`, [uids]);
  assert.equal(n, 500, 'each one counted against its own budget');
});
