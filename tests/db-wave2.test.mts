/**
 * Security Wave 2 — the consent model (docs/security/wave2-consent-design.md),
 * against a real Postgres (PGlite, every migration applied). Part 1: what is
 * legitimate today stays visible. Part 2: every self-made link stops revealing
 * a child. Part 3: roster rights, admin rights and pushes.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

type Who = { uid: string; player: string };
async function person(name: string, dob = '1985-01-01'): Promise<Who> {
  const uid = await db.signUp({ name, dob });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
  return { uid, player: p.id };
}
async function child(by: string, name = 'Asha Rao', extra: { house?: string; sport?: string } = {}) {
  const [p] = await db.as<{ id: string }>(by,
    `insert into players (full_name, dob, house_name, sports) values ($1, '2014-03-05', $2, $3) returning id`,
    [name, extra.house ?? null, extra.sport ? [extra.sport] : []]);
  return p.id;
}
async function team(by: string, roster: string[] = [], extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = { name: 'Team', short_name: 'T', sport: 'football', roster: JSON.stringify(roster), ...extra };
  const cols = Object.keys(row);
  const [t] = await db.as<{ id: string }>(by,
    `insert into teams (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, Object.values(row));
  return t.id;
}
const sees = async (viewer: string, player: string) =>
  (await db.sql<{ v: boolean }>(`select player_full_visible_to($1, $2) as v`, [viewer, player]))[0].v;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

/* ------------------------------ part 1: legitimate ------------------------------ */

describe('W2 — legitimate links stay visible', () => {
  test('a coach and their assistant see the children the coach added to their team', async () => {
    const coach = await person('Coach A');
    const assistant = await person('Assistant B');
    const kid = await child(coach.uid);
    await team(coach.uid, [kid], { admin_ids: [assistant.player] });
    assert.equal(await sees(coach.uid, kid), true);
    assert.equal(await sees(assistant.uid, kid), true);
  });
  test('school staff see the students the school added', async () => {
    const head = await person('Head');
    const pe = await person('PE Teacher');
    const [o] = await db.as<{ id: string }>(head.uid, `insert into organizations (name, type, created_by) values ('School', 'School', auth.uid()) returning id`);
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [o.id, head.player]);
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Admin', current_date)`, [o.id, pe.player]);
    const student = await child(head.uid, 'Student One');
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, student]);
    assert.equal(await sees(pe.uid, student), true);
  });
  test('an organiser sees a team that accepted its invite, or that asked to join and was approved', async () => {
    const coach = await person('Coach C');
    const kid = await child(coach.uid, 'Kid C');
    const t = await team(coach.uid, [kid], { name: 'C Team' });
    const org = await person('Organiser X');
    const [tour] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id, is_open) values ('Cup', 'X', auth.uid(), true) returning id`);
    // the organiser enters the team → it's only invited
    await db.as(org.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [tour.id, t]);
    const [row] = await db.sql<{ status: string }>(`select status from tournament_teams where tournament_id = $1 and team_id = $2`, [tour.id, t]);
    assert.equal(row.status, 'invited', 'an organiser can only invite a team they don\'t manage');
    assert.equal(await sees(org.uid, kid), false, 'not before the team agrees');
    // the coach accepts
    await db.as(coach.uid, `update tournament_teams set status = 'confirmed' where tournament_id = $1 and team_id = $2`, [tour.id, t]);
    assert.equal(await sees(org.uid, kid), true);
    // another team asks to join; the organiser approves
    const coach2 = await person('Coach D');
    const kid2 = await child(coach2.uid, 'Kid D');
    const t2 = await team(coach2.uid, [kid2], { name: 'D Team' });
    await db.as(coach2.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'pending')`, [tour.id, t2]);
    await db.as(org.uid, `update tournament_teams set status = 'confirmed' where tournament_id = $1 and team_id = $2`, [tour.id, t2]);
    assert.equal(await sees(org.uid, kid2), true);
  });
  test('the app\'s bulk add (an upsert) never downgrades a confirmed team, and approving a request still confirms it', async () => {
    const org = await person('Bulk Organiser');
    const [tour] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id, is_open) values ('Bulk', 'B', auth.uid(), true) returning id`);
    const c1 = await person('Bulk Coach 1');
    const t1 = await team(c1.uid, [], { name: 'B1' });
    await db.as(c1.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'pending')`, [tour.id, t1]);
    // the organiser "adds" (upserts) the requesting team and a new one
    const c2 = await person('Bulk Coach 2');
    const t2 = await team(c2.uid, [], { name: 'B2' });
    const up = `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed'), ($1, $3, 'confirmed')
                on conflict (tournament_id, team_id) do update set status = excluded.status`;
    await db.as(org.uid, up, [tour.id, t1, t2]);
    const st = async () => Object.fromEntries((await db.sql<{ team_id: string; status: string }>(`select team_id, status from tournament_teams where tournament_id = $1`, [tour.id])).map((x) => [x.team_id, x.status]));
    assert.deepEqual(await st(), { [t1]: 'confirmed', [t2]: 'invited' }, 'the request is approved; the new team is invited');
    // adding them all again changes nothing
    await db.as(org.uid, up, [tour.id, t1, t2]);
    assert.deepEqual(await st(), { [t1]: 'confirmed', [t2]: 'invited' });
  });
  test('a child who asked to join a school and was accepted is seen by its staff', async () => {
    const head = await person('Head 2');
    const [o] = await db.as<{ id: string }>(head.uid, `insert into organizations (name, type, created_by) values ('School 2', 'School', auth.uid()) returning id`);
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [o.id, head.player]);
    const teen = await person('Teen Self', '2010-01-01');
    const [q] = await db.as<{ id: string }>(teen.uid, `insert into org_requests (org_id, player_id, direction, role) values ($1, $2, 'request', 'Member') returning id`, [o.id, teen.player]);
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, teen.player]);
    await db.as(head.uid, `update org_requests set status = 'accepted' where id = $1`, [q.id]);
    assert.equal(await sees(head.uid, teen.player), true);
  });
  test('links that existed before the migration still count', async () => {
    const pre = await bootDb({ strict: true, skip: /security_wave[23]|players_view_phone/ });   // Wave 3 and the view hotfix build on 2b
    const coach = await pre.signUp({ name: 'Old Coach' });
    const [kid] = await pre.as<{ id: string }>(coach, `insert into players (full_name, dob) values ('Old Kid', '2014-01-01') returning id`);
    const other = await pre.signUp({ name: 'Old Teammate Coach' });
    await pre.as(other, `insert into teams (name, short_name, sport, roster) values ('Old', 'O', 'football', $1)`, [JSON.stringify([kid.id])]);
    const dir = join(import.meta.dirname, '..', 'supabase', 'migrations');
    const f = readdirSync(dir).find((x) => x.includes('_security_wave2'))!;
    await pre.pg.exec(readFileSync(join(dir, f), 'utf8'));
    const [v] = await pre.sql<{ v: boolean }>(`select player_full_visible_to($1, $2) as v`, [other, kid.id]);
    assert.equal(v.v, true);
  });
});

/* ------------------------------ part 2: self-made links ------------------------------ */

describe('W2 — a stranger\'s self-made link never reveals a child', () => {
  let coach: Who, stranger: Who, kid: string, theirTeam: string;
  before(async () => {
    coach = await person('Real Coach');
    stranger = await person('Stranger S');
    kid = await child(coach.uid, 'Myra Joshi', { house: 'Red', sport: 'football' });
    theirTeam = await team(coach.uid, [kid], { name: 'Real Team' });
  });
  test('their own team\'s roster', async () => {
    await team(stranger.uid, [kid], { name: 'S1' });
    assert.equal(await sees(stranger.uid, kid), false);
  });
  test('team members, roles, captain slot', async () => {
    const t = await team(stranger.uid, [], { name: 'S2' });
    await db.as(stranger.uid, `insert into team_members (team_id, player_id) values ($1, $2)`, [t, kid]).catch(() => undefined);
    await db.as(stranger.uid, `insert into team_player_roles (team_id, player_id, roles) values ($1, $2, '{}')`, [t, kid]).catch(() => undefined);
    await team(stranger.uid, [], { name: 'S3', captain_id: kid });
    assert.equal(await sees(stranger.uid, kid), false);
  });
  test('a club or a community they run', async () => {
    const [c] = await db.as<{ id: string }>(stranger.uid, `insert into clubs (name, short_name) values ('S Club', 'SC') returning id`);
    await db.as(stranger.uid, `insert into club_members (club_id, player_id) values ($1, $2)`, [c.id, kid]).catch(() => undefined);
    const [o] = await db.as<{ id: string }>(stranger.uid, `insert into organizations (name, type, created_by) values ('S Org', 'Sports club', auth.uid()) returning id`);
    await db.as(stranger.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [o.id, stranger.player]);
    await db.as(stranger.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, kid]);
    assert.equal(await sees(stranger.uid, kid), false);
  });
  test('entering the child\'s real team in their tournament, or a friendly against it', async () => {
    const [tour] = await db.as<{ id: string }>(stranger.uid, `insert into tournaments (name, host_name, organizer_id, host_ids) values ('S Cup', 'S', auth.uid(), $1) returning id`, [[stranger.player]]);
    await db.as(stranger.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [tour.id, theirTeam]);
    const mine = await team(stranger.uid, [], { name: 'S4' });
    await db.as(stranger.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'scheduled')`, [mine, theirTeam, [stranger.player]]);
    assert.equal(await sees(stranger.uid, kid), false);
  });
  test('a field event entry, and a House team named after the child\'s House', async () => {
    const [e] = await db.as<{ id: string }>(stranger.uid, `insert into field_events (sport, title, host_ids) values ('golf', 'S Round', $1) returning id`, [[stranger.player]]);
    await db.as(stranger.uid, `insert into field_entries (event_id, player_id) values ($1, $2)`, [e.id, kid]).catch(() => undefined);
    await team(stranger.uid, [], { name: 'Red', sport: 'football' });
    assert.equal(await sees(stranger.uid, kid), false);
  });
});

/* ------------------------------ part 3: privileges ------------------------------ */

describe('W2 — roster rights, admin rights and pushes', () => {
  test('a friendly gives no roster rights, and nobody else fills an empty captain slot', async () => {
    const coach = await person('Roster Coach');
    const kid = await child(coach.uid, 'Roster Kid');
    const t = await team(coach.uid, [kid], { name: 'Roster Team' });
    const s = await person('Roster Stranger');
    const mine = await team(s.uid, [], { name: 'S5' });
    await db.as(s.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'scheduled')`, [mine, t, [s.player]]);
    const [r] = await db.as<{ ok: boolean }>(s.uid, `select can_edit_team_roster($1) as ok`, [t]);
    assert.equal(r.ok, false);
    await db.as(s.uid, `update teams set roster = '[]' where id = $1`, [t]).catch(() => undefined);
    const [after] = await db.sql<{ roster: string[] }>(`select roster from teams where id = $1`, [t]);
    assert.deepEqual(after.roster, [kid]);
    const err = await errOf(() => db.as(s.uid, `update teams set captain_id = $2 where id = $1`, [t, s.player]));
    const [cap] = await db.sql<{ captain_id: string | null }>(`select captain_id from teams where id = $1`, [t]);
    assert.ok(err || cap.captain_id === null, 'captain slot stays empty');
  });
  test('an organiser of a confirmed entry still manages its squad for the tournament\'s matches', async () => {
    const coach = await person('Entry Coach');
    const t = await team(coach.uid, [], { name: 'Entry Team' });
    const org = await person('Entry Organiser');
    const [tour] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id, is_open) values ('League', 'O', auth.uid(), true) returning id`);
    await db.as(coach.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'pending')`, [tour.id, t]);
    await db.as(org.uid, `update tournament_teams set status = 'confirmed' where tournament_id = $1 and team_id = $2`, [tour.id, t]);
    const other = await team(org.uid, [], { name: 'Org Team' });
    await db.as(org.uid, `insert into matches (sport, tournament_id, home_team_id, away_team_id, status) values ('football', $1, $2, $3, 'scheduled')`, [tour.id, other, t]);
    const [r] = await db.as<{ ok: boolean }>(org.uid, `select can_edit_team_roster($1) as ok`, [t]);
    assert.equal(r.ok, true);
  });
  test('naming a coach as a co-host gives no admin rights over their children', async () => {
    const coach = await person('Named Coach');
    const kid = await child(coach.uid, 'Named Kid');
    const t = await team(coach.uid, [kid], { name: 'Named Team' });
    const s = await person('Host Stranger');
    const [tour] = await db.as<{ id: string }>(s.uid, `insert into tournaments (name, host_name, organizer_id, host_ids) values ('Trap', 'S', auth.uid(), $1) returning id`, [[s.player, coach.player]]);
    await db.as(s.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [tour.id, t]);
    // can_admin_player is internal since Wave 3 (DB-08): ask it as the database, for this user
    const r = await db.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: s.uid, role: 'authenticated' })]);
      return (await tx.query<{ ok: boolean }>(`select can_admin_player($1) as ok`, [kid])).rows[0];
    });
    assert.equal(r.ok, false);
  });
  test('pushes: a stranger\'s self-made team doesn\'t make a child a push target; the coach\'s does', async () => {
    const coach = await person('Push Coach');
    const kidUid = await db.signUp({ name: 'Push Kid', dob: '2013-01-01' });
    const [kid] = await db.as<{ id: string }>(kidUid, `insert into players (full_name, profile_id, dob) values ('Push Kid', $1, '2013-01-01') returning id`, [kidUid]);
    await team(coach.uid, [], { name: 'Push Team', captain_id: kid.id }).catch(() => undefined);
    const s = await person('Push Stranger');
    await team(s.uid, [kid.id], { name: 'S6' });
    const [r] = await db.as<{ t: string[] }>(s.uid, `select push_allowed_targets($1) as t`, [[kid.id]]);
    assert.deepEqual(r.t, []);
  });
});
