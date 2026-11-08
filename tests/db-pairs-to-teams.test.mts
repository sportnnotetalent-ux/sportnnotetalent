/** Teams for doubles, phase 6 (docs/security/breaks/pairs-to-teams.md DP1–DP9):
 *  pairs_to_teams() turns each existing doubles pair into a team (a club, one
 *  team any sport) with both players as admins — run by the founder once. */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';
import { TEAM_DOUBLES_SPORTS } from '../supabase/functions/_shared/prepReminders.ts';

const MIGRATION = readFileSync(join(import.meta.dirname, '..', 'supabase', 'migrations', '20261116120000_doubles_pairs_to_teams.sql'), 'utf8');

describe('pairs_to_teams', () => {
  let db: TestDb;
  let hru: string, viv: string, kid: string, adult: string, foot1: string, foot2: string, solo: string;
  const team = async (name: string, sport: string, roster: unknown[], extra: { captain?: string; adhoc?: boolean; created?: string } = {}) =>
    (await db.sql<{ id: string }>(
      `insert into teams (name, short_name, sport, roster, adhoc, captain_id, created_at) values ($1, 'X', $2, $3, $4, $5, coalesce($6::timestamptz, now())) returning id`,
      [name, sport, JSON.stringify(roster), extra.adhoc ?? true, extra.captain ?? null, extra.created ?? null]))[0].id;
  const row = async (id: string) => (await db.sql<{ name: string; club_id: string | null; admin_ids: string[] | null; adhoc: boolean; captain_id: string | null; entry_ids: string[] | null }>(
    `select name, club_id, admin_ids, adhoc, captain_id, entry_ids from teams where id = $1`, [id]))[0];
  const run = () => db.sql(`select pairs_to_teams()`);
  let pool: string, snooker: string, badminton: string, kidTeam: string, football: string, placeholder: string, junk: string, inClub: string, captained: string;
  let otherClub: string;

  before(async () => {
    db = await bootDb({ strict: true });
    const p = async (name: string, dob: string | null) => (await db.sql<{ id: string }>(`insert into players (full_name, dob) values ($1, $2) returning id`, [name, dob]))[0].id;
    hru = await p('Hrudhay Rao', '1990-01-01'); viv = await p('Vivek Chand', '1991-01-01');
    kid = await p('Diya Sharma', null); adult = await p('Arun Kumar', '1985-01-01');
    foot1 = await p('Gavva One', '1990-01-01'); foot2 = await p('Gavva Two', '1990-01-01');
    solo = await p('Solo Player', '1990-01-01');
    pool = await team('Hrudhay Rao / Vivek Chand', 'pool', [hru, viv], { created: '2026-11-01' });
    snooker = await team('Vivek Chand / Hrudhay Rao', 'snooker', [viv, hru], { created: '2026-11-03' });
    badminton = await team('Hrudhay Rao / Vivek Chand', 'badminton', [hru, viv], { created: '2026-11-05', captain: hru });
    kidTeam = await team('Diya Sharma / Arun Kumar', 'badminton', [kid, adult]);
    football = await team('Gavva Team', 'football', [foot1, foot2], { captain: foot1 });
    placeholder = await team('Pair A', 'tennis', []);
    junk = await team('Stand-ins', 'tennis', [`ph:x:1`, solo]);
    [{ id: otherClub }] = await db.sql<{ id: string }>(`insert into clubs (name, short_name) values ('Real Club', 'RC') returning id`);
    inClub = await team('In a club', 'pickleball', [foot1, solo]);
    await db.sql(`update teams set club_id = $1 where id = $2`, [otherClub, inClub]);
    captained = await team('Solo Player / Arun Kumar', 'tennis', [solo, adult], { captain: adult });
    await db.sql(`update teams set vice_captain_id = $1 where id = $2`, [solo, captained]);
  });

  test('DP8: app users can’t run it', async () => {
    const uid = await db.signUp({ name: 'Someone', dob: '1990-01-01' });
    await assert.rejects(() => db.as(uid, `select pairs_to_teams()`));
    await assert.rejects(() => db.asAnon(`select pairs_to_teams()`));
  });

  test('DP2: one team (club) per pair, every sport row in it', async () => {
    await run();
    const [a, b, c] = [await row(pool), await row(snooker), await row(badminton)];
    assert.ok(a.club_id);
    assert.equal(b.club_id, a.club_id);
    assert.equal(c.club_id, a.club_id);
    const [{ name }] = await db.sql<{ name: string }>(`select name from clubs where id = $1`, [a.club_id]);
    assert.equal(name, 'Hrudhay Rao / Vivek Chand', 'the oldest row’s name');
  });

  test('DP4: both players are admins; captain and vice-captain unchanged; nobody else', async () => {
    const { club_id } = await row(pool);
    const members = await db.sql<{ player_id: string; role: string }>(`select player_id, role from club_members where club_id = $1 order by player_id`, [club_id]);
    assert.deepEqual(members.map((m) => [m.player_id, m.role]).sort(), [[hru, 'admin'], [viv, 'admin']].sort());
    assert.deepEqual([...(await row(pool)).admin_ids!].sort(), [hru, viv].sort());
    assert.equal((await row(badminton)).captain_id, hru);
    const t = await row(captained);
    assert.equal(t.captain_id, adult);
    const [{ vice_captain_id }] = await db.sql<{ vice_captain_id: string }>(`select vice_captain_id from teams where id = $1`, [captained]);
    assert.equal(vice_captain_id, solo);
  });

  test('DP3: a child’s full name never reaches the team name', async () => {
    const t = await row(kidTeam);
    assert.ok(t.club_id);
    const [{ name }] = await db.sql<{ name: string }>(`select name from clubs where id = $1`, [t.club_id]);
    assert.doesNotMatch(name, /Diya|Sharma/);
    assert.equal(name, t.name, 'the stored (masked) name');
  });

  test('DP5: team rows keep name, entry ids, adhoc and roster', async () => {
    const t = await row(pool);
    assert.equal(t.name, 'Hrudhay Rao / Vivek Chand');
    assert.equal(t.adhoc, true);
    assert.deepEqual(t.entry_ids, [hru, viv]);
  });

  test('DP1 / DP7: team sports, placeholders, stand-ins and teams already in a club are untouched', async () => {
    assert.equal((await row(football)).club_id, null);
    assert.deepEqual((await row(football)).admin_ids ?? [], []);
    assert.equal((await row(placeholder)).club_id, null);
    assert.equal((await row(junk)).club_id, null);
    assert.equal((await row(inClub)).club_id, otherClub);
  });

  test('DP6: running again changes nothing; a new row joins the pair’s team', async () => {
    const count = async () => (await db.sql<{ n: string }>(`select count(*)::text n from clubs`))[0].n;
    const before = await count();
    await run();
    assert.equal(await count(), before);
    const tennis = await team('Hrudhay Rao / Vivek Chand', 'tennis', [viv, hru]);
    await run();
    assert.equal(await count(), before);
    assert.equal((await row(tennis)).club_id, (await row(pool)).club_id);
  });

  test('DP1: the SQL’s doubles sports are the app’s', () => {
    const m = MIGRATION.match(/array\[([^\]]+)\]::text\[\]/);
    assert.ok(m, 'a sport list in the migration');
    const list = m![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    assert.deepEqual(list, [...TEAM_DOUBLES_SPORTS].sort());
  });

  test('DP9: 600 players, 300 pairs across sports → one team each, two admins each', async () => {
    const sports = ['badminton', 'pool', 'tennis'];
    const ids = (await db.sql<{ id: string }>(`insert into players (full_name, dob) select 'Sim ' || g, '1990-01-01' from generate_series(1, 600) g returning id`)).map((r) => r.id);
    const values: string[] = []; const args: unknown[] = [];
    for (let i = 0; i < 300; i++) {
      for (let s = 0; s <= i % 3; s++) {
        args.push(`Sim pair ${i}`, sports[s], JSON.stringify(s % 2 ? [ids[2 * i + 1], ids[2 * i]] : [ids[2 * i], ids[2 * i + 1]]));
        values.push(`($${args.length - 2}, 'SP', $${args.length - 1}, $${args.length}::jsonb, true)`);
      }
    }
    await db.sql(`insert into teams (name, short_name, sport, roster, adhoc) values ${values.join(',')}`, args);
    await run();
    const [r] = await db.sql<{ clubs: string; bad: string; loose: string }>(`
      select count(distinct t.club_id)::text clubs,
        (select count(*) from (select c.club_id from club_members c where c.club_id in (select club_id from teams where name like 'Sim pair %')
           group by c.club_id having count(*) <> 2 or bool_or(c.role <> 'admin')) x)::text bad,
        count(*) filter (where t.club_id is null)::text loose
      from teams t where t.name like 'Sim pair %'`);
    assert.deepEqual(r, { clubs: '300', bad: '0', loose: '0' });
  });
});
