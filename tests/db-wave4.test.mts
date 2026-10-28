/**
 * Security Wave 4 (low findings, docs/security/audit-2026-10-27/PLAN.md),
 * against a real Postgres (PGlite, every migration applied).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

type Who = { uid: string; player: string };
async function person(name: string, dob = '1985-01-01'): Promise<Who> {
  const uid = await db.signUp({ name, dob });
  await db.sql(`update profiles set dob = $2 where id = $1`, [uid, dob]);
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
  return { uid, player: p.id };
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

describe('DB-20 — only someone the child plays or trains with can message their guardian', () => {
  test('a stranger is refused the same way whether or not a guardian email is on file; the coach gets through', async () => {
    const coach = await person('Msg Coach');
    const [withMail] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob, guardian) values ('Kid Mail', '2014-01-01', '{"email":"mum@x.in"}') returning id`);
    const [noMail] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ('Kid NoMail', '2014-01-01') returning id`);
    const stranger = await person('Msg Stranger');
    const a = await errOf(() => db.as(stranger.uid, `select * from send_message($1, 'hello')`, [withMail.id]));
    const b = await errOf(() => db.as(stranger.uid, `select * from send_message($1, 'hello')`, [noMail.id]));
    assert.ok(a && b && a === b, `${a} | ${b}`);
    assert.match(a!, /play|coach|team/i);
    await db.as(coach.uid, `select * from send_message($1, 'Training moved to 5 pm')`, [withMail.id]);
  });
});

describe('DB-23 — a submitted document can\'t be swapped afterwards', () => {
  test('no update rule on the verification documents', async () => {
    const rows = await db.sql(`select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'verif docs update own'`);
    assert.deepEqual(rows, []);
  });
});

describe('DB-24 — editing a course doesn\'t change other organisers\' rounds', () => {
  test('their finished and open rounds keep the course as it was; the creator\'s own open round follows the edit', async () => {
    const owner = await person('Course Owner');
    const other = await person('Other Organiser');
    const holes = (par: number) => JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ n: i + 1, par, si: i + 1 })));
    const [c] = await db.as<{ id: string }>(owner.uid, `insert into golf_courses (name, holes_data) values ('Lakeside', $1) returning id`, [holes(4)]);
    const round = async (who: Who, status: string) => (await db.as<{ id: string }>(who.uid,
      `insert into field_events (sport, title, host_ids, status, format) values ('golf', 'R', $1, $2, $3) returning id`, [[who.player], status, JSON.stringify({ courseId: c.id })]))[0].id;
    const otherOpen = await round(other, 'live');
    const otherDone = await round(other, 'live');
    await db.as(other.uid, `update field_events set status = 'completed' where id = $1`, [otherDone]);
    const ownOpen = await round(owner, 'live');
    await db.as(owner.uid, `update golf_courses set holes_data = $2 where id = $1`, [c.id, holes(3)]);
    const snap = async (id: string) => (await db.sql<{ s: unknown }>(`select format->'courseSnap' as s from field_events where id = $1`, [id]))[0].s;
    assert.ok(await snap(otherOpen), 'the other organiser\'s open round kept its course');
    assert.ok(await snap(otherDone), 'and their finished round');
    assert.equal(await snap(ownOpen), null, 'the creator\'s own open round follows the edit');
  });
});

describe('DB-18 — the ownership audit trail comes from the server', () => {
  test('the "from" names are what the tournament really was, not what the caller typed', async () => {
    const org = await person('Real Host');
    const to = await person('New Host');
    const [t] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id) values ('Audit Cup', 'Real Host Club', auth.uid()) returning id`);
    await db.as(org.uid, `select transfer_tournament_ownership($1, null, $2, 'New Host', 'org', 'Somebody Else')`, [t.id, [to.player]]);
    const [ev] = await db.sql<{ from_kind: string; from_name: string }>(`select from_kind, from_name from tournament_ownership_events where tournament_id = $1`, [t.id]);
    assert.deepEqual([ev.from_kind, ev.from_name], ['individual', 'Real Host Club']);
  });
});

describe('DB-22 — no unbounded inputs', () => {
  test('oversized match events, support questions and target lists are refused', async () => {
    const host = await person('Cap Host');
    const [tm] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ('Cap', 'C', 'football', '[]') returning id`);
    const [m] = await db.as<{ id: string }>(host.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [tm.id, [host.player]]);
    const big = JSON.stringify({ note: 'x'.repeat(40_000) });
    assert.ok(await errOf(() => db.as(host.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'NOTE', 'home', $2)`, [m.id, big])), 'a 40 KB event');
    assert.ok(await errOf(() => db.sql(`insert into support_cases (question) values ($1)`, ['q'.repeat(5000)])), 'a 5,000-character question');
    const ids = Array.from({ length: 1200 }, () => crypto.randomUUID());
    assert.match(await errOf(() => db.as(host.uid, `select push_allowed_targets($1)`, [ids])) ?? '', /too many/i);
  });
});
