/** Team slots against a real Postgres (PGlite): create, fill with an existing
 *  team, name as a new team, and every refusal (docs/security/breaks/team-slots.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
type Who = { uid: string; player: string };
async function person(name: string): Promise<Who> {
  const uid = await db.signUp({ name, dob: '1990-01-01' });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1990-01-01') returning id`, [name, uid]);
  return { uid, player: p.id };
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
let org: Who, other: Who;
async function tournament(owner: Who) {
  const [t] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, host_ids, sports) values ('Winter Shield', 'Org', $1, '{football}') returning id`, [[owner.player]]);
  return t.id;
}
const mkSlots = (w: Who, t: string, names: string[], sport = 'football') =>
  db.as<{ ids: string[] }>(w.uid, `select create_tournament_slots($1, $2, $3::text[]) as ids`, [t, sport, names]).then((r) => r[0].ids);
const fill = (w: Who, slot: string, team: string) => db.as(w.uid, `select fill_tournament_slot($1, $2)`, [slot, team]);
const name = (w: Who, slot: string, n: string, s: string) => db.as(w.uid, `select name_tournament_slot($1, $2, $3)`, [slot, n, s]);
async function game(t: string, home: string, away: string, status = 'scheduled') {
  const [m] = await db.sql<{ id: string }>(`insert into matches (sport, tournament_id, home_team_id, away_team_id, status) values ('football', $1, $2, $3, $4) returning id`, [t, home, away, status]);
  return m.id;
}
async function realTeam(owner: Who, nm: string, sport = 'football') {
  const [t] = await db.as<{ id: string }>(owner.uid, `insert into teams (name, short_name, sport, created_by) values ($1, 'RT', $2, $3) returning id`, [nm, sport, owner.uid]);
  return t.id;
}

before(async () => {
  db = await bootDb({ strict: true });
  org = await person('Olga Organiser'); other = await person('Oscar Other');
});

describe('TS1/TS3/TS10/TS11 creating slots', () => {
  test('the organiser makes slots: one-off rows, entered in the tournament', async () => {
    const t = await tournament(org);
    const ids = await mkSlots(org, t, ['A1', 'A2', 'B1', 'B2']);
    assert.equal(ids.length, 4);
    const rows = await db.sql<{ name: string; adhoc: boolean; slot_tournament_id: string }>(`select name, adhoc, slot_tournament_id from teams where id = any($1::uuid[]) order by name`, [ids]);
    assert.deepEqual(rows.map((r) => [r.name, r.adhoc, r.slot_tournament_id === t]), [['A1', true, true], ['A2', true, true], ['B1', true, true], ['B2', true, true]]);
    const [n] = await db.sql<{ n: string }>(`select count(*) as n from tournament_teams where tournament_id = $1 and status = 'confirmed'`, [t]);
    assert.equal(Number(n.n), 4);
  });
  test('someone else can\'t; junk sizes and names refused', async () => {
    const t = await tournament(org);
    assert.match(await errOf(() => mkSlots(other, t, ['A1', 'A2'])) ?? '', /not_allowed/);
    assert.match(await errOf(() => mkSlots(org, t, [])) ?? '', /bad_slots/);
    assert.equal((await mkSlots(org, t, ['Slot 1'])).length, 1, 'TS14: one slot is fine');
    assert.match(await errOf(() => mkSlots(org, t, Array.from({ length: 129 }, (_, i) => `T${i}`))) ?? '', /bad_slots/);
    assert.match(await errOf(() => mkSlots(org, t, ['A1', ''])) ?? '', /bad_slots/);
  });
});

describe('TS7/TS8 filling with an existing team', () => {
  test('the team takes the slot\'s place in this tournament only', async () => {
    const t = await tournament(org);
    const [a1, a2] = await mkSlots(org, t, ['A1', 'A2']);
    const g = await game(t, a1, a2);
    const lions = await realTeam(org, 'Lions');
    const t2 = await tournament(org);
    const elsewhere = await game(t2, a1, a2); // impossible in practice, proves the scope
    await fill(org, a1, lions);
    const [m] = await db.sql<{ home_team_id: string }>(`select home_team_id from matches where id = $1`, [g]);
    assert.equal(m.home_team_id, lions);
    const [e] = await db.sql<{ home_team_id: string }>(`select home_team_id from matches where id = $1`, [elsewhere]);
    assert.equal(e.home_team_id, a1);
    const entries = await db.sql<{ team_id: string; status: string }>(`select team_id, status from tournament_teams where tournament_id = $1 order by team_id`, [t]);
    assert.ok(entries.some((x) => x.team_id === lions && x.status === 'confirmed'));
    assert.ok(!entries.some((x) => x.team_id === a1));
  });
  test('TS8: a team the organiser doesn\'t run gets in as invited', async () => {
    const t = await tournament(org);
    const [a1, a2] = await mkSlots(org, t, ['A1', 'A2']);
    await game(t, a1, a2);
    const theirs = await realTeam(other, 'Tigers');
    await fill(org, a1, theirs);
    const [x] = await db.sql<{ status: string }>(`select status from tournament_teams where tournament_id = $1 and team_id = $2`, [t, theirs]);
    assert.equal(x.status, 'invited');
  });
});

describe('TS4/TS5/TS6 refusals', () => {
  test('already in, wrong sport, another slot, started game, stranger', async () => {
    const t = await tournament(org);
    const [a1, a2, a3] = await mkSlots(org, t, ['A1', 'A2', 'A3']);
    const lions = await realTeam(org, 'Lions');
    await fill(org, a1, lions);
    assert.match(await errOf(() => fill(org, a2, lions)) ?? '', /already_entered/);
    const tennis = await realTeam(org, 'Racket', 'tennis');
    assert.match(await errOf(() => fill(org, a2, tennis)) ?? '', /wrong_team/);
    assert.match(await errOf(() => fill(org, a2, a3)) ?? '', /wrong_team/);
    const puma = await realTeam(org, 'Pumas');
    assert.match(await errOf(() => fill(other, a2, puma)) ?? '', /not_allowed/);
    await game(t, a2, a3, 'live');
    assert.match(await errOf(() => fill(org, a2, puma)) ?? '', /slot_started/);
    assert.match(await errOf(() => fill(org, lions, puma)) ?? '', /not_a_slot/);
  });
});

describe('TS9 naming a slot as a new team', () => {
  test('the slot becomes the team: same row, same games, no longer a slot', async () => {
    const t = await tournament(org);
    const [a1, a2] = await mkSlots(org, t, ['A1', 'A2']);
    const g = await game(t, a1, a2);
    await name(org, a1, 'Falcons FC', 'FAL');
    const [row] = await db.sql<{ name: string; short_name: string; adhoc: boolean; slot_tournament_id: string | null }>(`select name, short_name, adhoc, slot_tournament_id from teams where id = $1`, [a1]);
    assert.deepEqual([row.name, row.short_name, row.adhoc, row.slot_tournament_id], ['Falcons FC', 'FAL', false, null]);
    const [m] = await db.sql<{ home_team_id: string }>(`select home_team_id from matches where id = $1`, [g]);
    assert.equal(m.home_team_id, a1);
    assert.match(await errOf(() => name(other, a2, 'X', 'X')) ?? '', /not_allowed/);
    assert.match(await errOf(() => name(org, a2, '', 'X')) ?? '', /bad_name/);
  });
});
