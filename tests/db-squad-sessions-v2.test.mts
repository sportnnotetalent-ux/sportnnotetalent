/** Squad sessions v2 against a real Postgres: one shared phone, game settings,
 *  guests, no team (docs/security/breaks/squad-sessions.md SS17–SS23). */
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
type S = { id: string; version: number; status: string; picks: { captain: string; player: string }[]; format: Record<string, unknown>; team_ids: string[]; players: string[] };
const call = async (w: Who, fn: string, args: string, params: unknown[]) => (await db.as<{ s: S }>(w.uid, `select ${fn}(${args}) as s`, params))[0].s;
const create = (w: Who, ps: string[], rules: object) => call(w, 'squad_session_create', `p_sport => 'badminton', p_name => 'Smashers', p_players => $1::uuid[], p_rules => $2::jsonb`, [ps, JSON.stringify(rules)]);
const caps = (w: Who, s: S, c: Who[]) => call(w, 'squad_session_set_captains', '$1, $2::uuid[], $3', [s.id, c.map((x) => x.player), s.version]);
const pick = (w: Who, s: S, p: string) => call(w, 'squad_session_pick', '$1, $2, $3', [s.id, p, s.version]);
const setFormat = (w: Who, s: S, f: unknown) => call(w, 'squad_session_set_format', '$1, $2::jsonb, $3', [s.id, JSON.stringify(f), s.version]);

let P: Who[] = []; let guest: Who; let outsider: Who; let nameOnly: string;
before(async () => {
  db = await bootDb({ strict: true });
  for (let i = 0; i < 6; i++) P.push(await person(`Player ${i}`));
  guest = await person('Guest Gupta'); outsider = await person('Out Sider');
  // a typed-name player (no account, no phone)
  nameOnly = (await db.sql<{ id: string }>(`insert into players (full_name) values ('Typed Name') returning id`))[0].id;
});

describe('SS17 guests and no team', () => {
  test('a session with no team, a guest and a typed-name player', async () => {
    const s = await create(P[0], [P[1].player, guest.player, nameOnly], { teams: 2 });
    assert.equal(s.players.length, 4);
    assert.ok(s.players.includes(nameOnly));
  });
});

describe('SS18/SS19 one shared phone', () => {
  test('own phones (default): only the captain on turn picks', async () => {
    let s = await create(P[0], P.slice(1).map((p) => p.player), { teams: 2 });
    s = await caps(P[0], s, [P[0], P[1]]);
    assert.match(await errOf(() => pick(P[2], s, P[3].player)) ?? '', /not_your_pick/);
  });
  test('one phone: any player in the session picks for the captain on turn', async () => {
    let s = await create(P[0], P.slice(1).map((p) => p.player), { teams: 2, pickOn: 'shared' });
    s = await caps(P[0], s, [P[0], P[1]]);
    s = await pick(P[4], s, P[3].player);                 // P4 holds the phone
    assert.equal(s.picks[0].captain, P[0].player);         // credited to captain 1
    s = await pick(P[4], s, P[2].player);
    assert.equal(s.picks[1].captain, P[1].player);         // then captain 2
    assert.match(await errOf(() => pick(outsider, s, P[5].player)) ?? '', /not_in_session/);
    assert.match(await errOf(() => pick(P[4], s, P[3].player)) ?? '', /not_available/);
  });
  test('bad pickOn refused', async () => {
    assert.match(await errOf(() => create(P[0], [P[1].player], { teams: 2, pickOn: 'anyone' })) ?? '', /bad_rules/);
  });
});

describe('SS20–SS22 game settings', () => {
  test('saved once; the next game uses them; a game keeps its own', async () => {
    let s = await create(P[0], P.slice(1, 4).map((p) => p.player), { teams: 2 });
    s = await setFormat(P[2], s, { pointsPerGame: 15, bestOf: 1 });
    assert.deepEqual(s.format, { pointsPerGame: 15, bestOf: 1 });
    s = await caps(P[0], s, [P[0], P[1]]);
    s = await call(P[0], 'squad_session_share_rest', '$1, $2', [s.id, s.version]);
    s = await call(P[0], 'squad_session_make_teams', '$1, $2', [s.id, s.version]);
    const m1 = (await db.as<{ m: string }>(P[0].uid, `select squad_session_next_game($1, 0, 1, $2) as m`, [s.id, s.version]))[0].m;
    const [g1] = await db.sql<{ format: Record<string, unknown> }>(`select format from matches where id = $1`, [m1]);
    assert.equal(g1.format.pointsPerGame, 15);
    s = (await db.sql<S>(`select * from squad_sessions where id = $1`, [s.id]))[0];
    s = await setFormat(P[3], s, { pointsPerGame: 21, bestOf: 3 });
    const [still] = await db.sql<{ format: Record<string, unknown> }>(`select format from matches where id = $1`, [m1]);
    assert.equal(still.format.pointsPerGame, 15, 'the running game keeps its settings');
  });
  test('junk and huge settings refused; outsider refused', async () => {
    const s = await create(P[0], [P[1].player], { teams: 2 });
    assert.match(await errOf(() => setFormat(P[0], s, [1, 2])) ?? '', /bad_format/);
    assert.match(await errOf(() => setFormat(P[0], s, { x: 'y'.repeat(9000) })) ?? '', /bad_format/);
    assert.match(await errOf(() => setFormat(outsider, s, { a: 1 })) ?? '', /not_in_session/);
  });
});
