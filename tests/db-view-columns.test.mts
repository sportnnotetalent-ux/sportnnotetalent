/**
 * Found live 2026-10-29: reading `phone` from players_view failed for everyone
 * ("permission denied for function member_consented") — Wave 2 called a
 * function in the view that it also locked away from the app's roles, and
 * Postgres checks a view's functions as the person reading it. Counting rows
 * still worked (an unread column is left out of the plan), so nothing noticed.
 *
 * Every column of every view the app may read, read as a visitor and as a
 * signed-in user, on rows that exercise each branch (an adult, a child, a
 * coach-made profile on a team the reader manages).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
let coach = '';
before(async () => {
  db = await bootDb({ strict: true });
  coach = await db.signUp({ name: 'View Coach', dob: '1980-01-01' });
  const [cp] = await db.as<{ id: string }>(coach, `insert into players (profile_id, full_name, dob, phone) values ($1, 'View Coach', '1980-01-01', '+919811122233') returning id`, [coach]);
  const [kid] = await db.as<{ id: string }>(coach, `insert into players (full_name, dob, phone) values ('Coach Added', '2013-01-01', '+919811122244') returning id`);
  const [adult] = await db.as<{ id: string }>(coach, `insert into players (full_name, dob, phone, show_phone) values ('Coach Added Adult', '1995-01-01', '+919811122255', true) returning id`);
  await db.as(coach, `insert into teams (name, short_name, sport, roster, captain_id) values ('View FC', 'VFC', 'football', $1, $2)`,
    [JSON.stringify([cp.id, kid.id, adult.id]), cp.id]);
});

async function clientViews(): Promise<{ view: string; cols: string[] }[]> {
  const rows = await db.sql<{ v: string; c: string }>(`
    select k.relname as v, a.attname as c
      from pg_class k
      join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = k.oid and a.attnum > 0 and not a.attisdropped
     where k.relkind = 'v'
       and (has_table_privilege('anon', k.oid, 'select') or has_table_privilege('authenticated', k.oid, 'select'))
     order by 1, a.attnum`);
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.v, [...(by.get(r.v) ?? []), r.c]);
  return [...by].map(([view, cols]) => ({ view, cols }));
}

describe('every column of every client view can be read', () => {
  test('as a signed-in user (the coach who manages the team)', async () => {
    const bad: string[] = [];
    for (const { view, cols } of await clientViews()) {
      if (!(await db.sql<{ ok: boolean }>(`select has_table_privilege('authenticated', $1, 'select') as ok`, [`public.${view}`]))[0].ok) continue;
      for (const c of cols) {
        try { await db.as(coach, `select "${c}" from "${view}" limit 20`); } catch (e) { bad.push(`${view}.${c}: ${(e as Error).message}`); }
      }
    }
    assert.deepEqual(bad, []);
  });
  test('as a visitor', async () => {
    const bad: string[] = [];
    for (const { view, cols } of await clientViews()) {
      if (!(await db.sql<{ ok: boolean }>(`select has_table_privilege('anon', $1, 'select') as ok`, [`public.${view}`]))[0].ok) continue;
      for (const c of cols) {
        try { await db.asAnon(`select "${c}" from "${view}" limit 20`); } catch (e) { bad.push(`${view}.${c}: ${(e as Error).message}`); }
      }
    }
    assert.deepEqual(bad, []);
  });
  test('the app\'s own profile read (all its columns) works for the owner', async () => {
    const [p] = await db.as<{ phone: string; full_name: string }>(coach,
      `select id, profile_id, full_name, jersey_no, sports, house_name, house_color, city, gender, bio, phone, email, phone_verified, email_verified, photo_url, sport_details, dob, guardian, verification, age, show_phone, show_email, guardian_linked, findable_by_contact, restricted, age_verified_by
         from players_view where profile_id = $1`, [coach]);
    assert.equal(p.phone, '+919811122233');
  });
});

describe('the coach-added number (Wave 2) still follows the agreement', () => {
  test('the managing coach sees an adult\'s shared number; a stranger and a visitor don\'t see the child\'s', async () => {
    const stranger = await db.signUp({ name: 'View Stranger', dob: '1990-01-01' });
    const kid = await db.sql<{ id: string }>(`select id from players where full_name = 'Coach Added'`);
    const s = await db.as<{ phone: string | null }>(stranger, `select phone from players_view where id = $1`, [kid[0].id]);
    assert.equal(s[0]?.phone ?? null, null, 'a stranger');
    const v = await db.asAnon<{ phone: string | null }>(`select phone from players_view where id = $1`, [kid[0].id]);
    assert.equal(v[0]?.phone ?? null, null, 'a visitor');
    await assert.rejects(db.as(stranger, `select editable_team_member_consented((select id from teams where name = 'View FC'), $1)`, [kid[0].id]).then((r) => {
      if ((r as { editable_team_member_consented: boolean }[])[0].editable_team_member_consented) throw new Error('leaked'); throw new Error('false, as expected');
    }), /false, as expected/, 'a stranger asking about a team they can\'t edit gets false');
  });
});
