/** A held result finishes on the server (docs/security/breaks/held-result-server.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
let a: string, b: string, scorer: string;
async function match(held: object | null, status = 'live') {
  const [m] = await db.sql<{ id: string }>(`insert into matches (sport, home_team_id, away_team_id, status) values ('pickleball', $1, $2, 'live') returning id`, [a, b]);
  if (held) await db.sql(`update matches set held_result = $2::jsonb where id = $1`, [m.id, JSON.stringify(held)]);
  if (status !== 'live') await db.sql(`update matches set status = $2 where id = $1`, [m.id, status]);
  return m.id;
}
const row = async (id: string) => (await db.sql<{ status: string; winner: string | null; held_result: unknown; completed_at: string | null }>(`select status, winner, held_result, completed_at from matches where id = $1`, [id]))[0];
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

before(async () => {
  db = await bootDb({ strict: true });
  scorer = await db.signUp({ name: 'Sam Scorer' });
  [{ id: a }] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('A', 'A', 'pickleball') returning id`);
  [{ id: b }] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('B', 'B', 'pickleball') returning id`);
});

describe('the job finishes held results whose hold ran out', () => {
  test('past due (30 s after until) → completed with the held winner; held_result cleared', async () => {
    const id = await match({ winner: 'home', until: ago(40) });
    const [{ n }] = await db.sql<{ n: number }>(`select finish_held_results() as n`);
    assert.ok(n >= 1);
    const r = await row(id);
    assert.equal(r.status, 'completed');
    assert.equal(r.winner, 'home');
    assert.equal(r.held_result, null);
    assert.ok(r.completed_at, 'completed_at stamped by the existing trigger');
  });
  test('HR2: still inside the window (or the 30 s grace) → untouched', async () => {
    const id = await match({ winner: 'away', until: ago(10) });
    await db.sql(`select finish_held_results()`);
    assert.equal((await row(id)).status, 'live');
  });
  test('HR1: Undo cleared it → untouched', async () => {
    const id = await match({ winner: 'home', until: ago(90) });
    await db.sql(`update matches set held_result = null where id = $1`, [id]);
    await db.sql(`select finish_held_results()`);
    assert.equal((await row(id)).status, 'live');
  });
  test('a draw is kept as a draw', async () => {
    const id = await match({ winner: 'draw', until: ago(60) });
    await db.sql(`select finish_held_results()`);
    assert.deepEqual([(await row(id)).status, (await row(id)).winner], ['completed', 'draw']);
  });
});

describe('HR7: one odd row never blocks the others', () => {
  test("a held winner of 'none' (allowed by the shape check, not by matches.winner) finishes with no winner, and the other due matches still finish", async () => {
    const odd = await match({ winner: 'none', until: ago(45) });
    const fine = await match({ winner: 'away', until: ago(45) });
    await db.sql(`select finish_held_results()`);
    const o = await row(odd);
    assert.equal(o.status, 'completed');
    assert.equal(o.winner, null);
    assert.equal((await row(fine)).winner, 'away');
  });
});

describe('guards', () => {
  test('HR4: a completed match never keeps a held result', async () => {
    const id = await match({ winner: 'home', until: ago(5) });
    await db.sql(`update matches set status = 'completed' where id = $1`, [id]);
    assert.equal((await row(id)).held_result, null);
  });
  test('HR3/HR6: bad shapes are refused (winner, until far in the future)', async () => {
    const id = await match(null);
    assert.ok(await errOf(() => db.sql(`update matches set held_result = '{"winner":"me","until":"2026-01-01T00:00:00Z"}' where id = $1`, [id])));
    assert.ok(await errOf(() => db.sql(`update matches set held_result = $2::jsonb where id = $1`, [id, JSON.stringify({ winner: 'home', until: new Date(Date.now() + 3600e3).toISOString() })])));
    assert.ok(await errOf(() => db.sql(`update matches set held_result = '"x"' where id = $1`, [id])));
  });
  test('HR5: the app (or anon) cannot call the job; it is scheduled every minute', async () => {
    assert.ok(await errOf(() => db.as(scorer, `select finish_held_results()`)));
    assert.ok(await errOf(() => db.asAnon(`select finish_held_results()`)));
    const [j] = await db.sql<{ schedule: string }>(`select schedule from cron.job where jobname = 'finish-held-results'`);
    assert.equal(j.schedule, '* * * * *');
  });
});
