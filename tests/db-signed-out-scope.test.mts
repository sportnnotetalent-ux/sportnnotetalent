/** Signed-out reads limited to the shared item (docs/security/breaks/signed-out-scope.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
const ids: Record<string, string> = {};
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
const anon = (h: string | null, q: string, p: unknown[] = []) => (h ? db.asAnonWith({ 'x-share': h }, q, p) : db.asAnon(q, p));
const col = async (h: string | null, table: string, c = 'id') => (await anon(h, `select ${c}::text as v from ${table}`)).map((r: any) => r.v).sort();

before(async () => {
  db = await bootDb({ strict: true });
  const one = async (q: string, p: unknown[] = []) => (await db.sql<{ id: string }>(q, p))[0].id;
  ids.org = await one(`insert into organizations (name) values ('Host School') returning id`);
  ids.org2 = await one(`insert into organizations (name) values ('Other School') returning id`);
  for (const k of ['pa', 'pb', 'pc', 'pd', 'pe']) ids[k] = await one(`insert into players (full_name, dob) values ($1, '1990-01-01') returning id`, [k.toUpperCase()]);
  const team = (n: string, ps: string[]) => one(`insert into teams (name, short_name, sport, roster) values ($1, $1, 'football', $2::jsonb) returning id`, [n, JSON.stringify(ps)]);
  ids.A = await team('A', [ids.pa]); ids.B = await team('B', [ids.pb]); ids.C = await team('C', [ids.pc]); ids.D = await team('D', [ids.pd]);
  ids.T1 = await one(`insert into tournaments (name, host_name, sports, host_org_id) values ('Cup 1', 'H', '{football}', $1) returning id`, [ids.org]);
  ids.T2 = await one(`insert into tournaments (name, host_name, sports, host_org_id) values ('Cup 2', 'H', '{football}', $1) returning id`, [ids.org2]);
  await db.sql(`insert into tournament_teams (tournament_id, team_id) values ($1, $2), ($1, $3), ($4, $5), ($4, $6)`, [ids.T1, ids.A, ids.B, ids.T2, ids.C, ids.D]);
  const match = (t: string, h: string, a: string, st: string) => one(`insert into matches (sport, tournament_id, home_team_id, away_team_id, status) values ('football', $1, $2, $3, $4) returning id`, [t, h, a, st]);
  ids.M1 = await match(ids.T1, ids.A, ids.B, 'completed');
  ids.M2 = await match(ids.T2, ids.C, ids.D, 'completed');
  ids.M3 = await match(ids.T2, ids.C, ids.D, 'live');
  for (const m of [ids.M1, ids.M2, ids.M3]) await db.sql(`insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'goal', 'home', '{}')`, [m]);
  await db.sql(`insert into stat_lines (match_id, player_id, sport, stats) values ($1, $2, 'football', '{}'), ($3, $4, 'football', '{}')`, [ids.M1, ids.pa, ids.M2, ids.pc]);
  ids.E = await one(`insert into field_events (tournament_id, sport, title, status) values ($1, 'golf', 'Round 1', 'scheduled') returning id`, [ids.T2]);
  await db.sql(`insert into field_entries (event_id, player_id) values ($1, $2)`, [ids.E, ids.pe]);
});

describe('SO1/SO3 no header, a bad header → nothing', () => {
  for (const t of ['matches', 'match_events', 'stat_lines', 'teams', 'tournaments', 'organizations', 'players_view', 'field_events', 'tournament_teams'])
    test(`${t}: no header returns no rows`, async () => assert.equal(Number((await anon(null, `select count(*) n from ${t}`))[0].n), t === 'match_events' ? 1 : 0, t === 'match_events' ? 'only the live match’s events (SO6)' : ''));
  test('malformed / injected headers are ignored', async () => {
    for (const h of ["m:x' or 1=1 --", `m:${ids.M1}x`, `zz:${ids.M1}`, 'm:', `M:${ids.M1}`, `m:${ids.M1},t:${ids.T1}`])
      assert.deepEqual(await col(h, 'matches'), [], h);
  });
});

describe('SO2/SO7 one shared item → just its rows', () => {
  test('a match page: the match, its teams, players, tournament and host', async () => {
    const h = `m:${ids.M1}`;
    assert.deepEqual(await col(h, 'matches'), [ids.M1]);
    assert.deepEqual(await col(h, 'teams'), [ids.A, ids.B].sort());
    assert.deepEqual(await col(h, 'tournaments'), [ids.T1]);
    assert.deepEqual(await col(h, 'organizations'), [ids.org]);
    assert.deepEqual(await col(h, 'players_view'), [ids.pa, ids.pb].sort());
    assert.deepEqual(await col(h, 'stat_lines', 'match_id'), [ids.M1]);
    assert.ok((await col(h, 'match_events', 'match_id')).includes(ids.M1));
  });
  test('a tournament page: its matches, teams, players and events — not the other tournament', async () => {
    const h = `t:${ids.T2}`;
    assert.deepEqual(await col(h, 'matches'), [ids.M2, ids.M3].sort());
    assert.deepEqual(await col(h, 'teams'), [ids.C, ids.D].sort());
    assert.deepEqual(await col(h, 'tournament_teams', 'team_id'), [ids.C, ids.D].sort());
    assert.deepEqual(await col(h, 'field_events'), [ids.E]);
    assert.deepEqual(await col(h, 'players_view'), [ids.pc, ids.pd, ids.pe].sort());
    assert.ok(!(await col(h, 'matches')).includes(ids.M1));
  });
  test('a player page: the player, their teams and matches', async () => {
    const h = `p:${ids.pa}`;
    assert.deepEqual(await col(h, 'matches'), [ids.M1]);
    assert.deepEqual(await col(h, 'teams'), [ids.A, ids.B].sort());
    assert.ok((await col(h, 'players_view')).includes(ids.pa));
    assert.ok(!(await col(h, 'players_view')).includes(ids.pc));
  });
  test('a team page and a golf / results event', async () => {
    assert.deepEqual(await col(`team:${ids.C}`, 'matches'), [ids.M2, ids.M3].sort());
    assert.deepEqual(await col(`e:${ids.E}`, 'field_entries', 'player_id'), [ids.pe]);
    assert.deepEqual(await col(`e:${ids.E}`, 'field_events'), [ids.E]);
  });
  test('an unknown id → nothing', async () => {
    assert.deepEqual(await col('m:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', 'matches'), []);
  });
});

describe('SO5/SO6/SO8', () => {
  test('signed-in users still read everything', async () => {
    const u = await db.signUp({ name: 'Sid Signed', dob: '1991-01-01' });
    const n = (await db.as<{ n: number }>(u, `select count(*)::int n from matches`))[0].n;
    assert.equal(n, 3);
  });
  test('live feeds: events of a live match are readable without a header', async () => {
    assert.deepEqual(await col(null, 'match_events', 'match_id'), [ids.M3]);
  });
  test('lists a visitor never needs are signed-in only', async () => {
    for (const t of ['listings', 'activity_log', 'squad_sessions', 'schools']) assert.deepEqual(await col(`t:${ids.T1}`, t), [], t);
  });
  test('reference data stays open', async () => {
    assert.ok(!(await errOf(() => anon(null, `select 1 from cities limit 1`))));
  });
});
