/**
 * Squad sessions against a real Postgres (PGlite, every migration applied):
 * who may change a session, whose pick it is, stale phones, teams and games.
 * Break-it: docs/security/breaks/squad-sessions.md. Migration: 20261105120000_squad_sessions.sql.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
type Who = { uid: string; player: string };
async function person(name: string): Promise<Who> {
  const uid = await db.signUp({ name, dob: '1990-01-01' });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1990-01-01') returning id`, [name, uid]);
  return { uid, player: p.id };
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
type S = { id: string; status: string; version: number; players: string[]; captains: string[]; picks: { captain: string; player: string }[]; rules: Record<string, unknown>; team_ids: string[] };
const call = async (w: Who, fn: string, args: string, params: unknown[]) =>
  (await db.as<{ s: S }>(w.uid, `select ${fn}(${args}) as s`, params))[0].s;

const create = (w: Who, players: Who[], rules: object = { teams: 3 }) =>
  call(w, 'squad_session_create', `p_sport => $1, p_name => $2, p_players => $3::uuid[], p_rules => $4::jsonb`,
    ['football', 'Fnatic', players.map((p) => p.player), JSON.stringify(rules)]);
const setRules = (w: Who, s: S, rules: object) => call(w, 'squad_session_set_rules', '$1, $2::jsonb, $3', [s.id, JSON.stringify(rules), s.version]);
const setPlayers = (w: Who, s: S, ps: Who[]) => call(w, 'squad_session_set_players', '$1, $2::uuid[], $3', [s.id, ps.map((p) => p.player), s.version]);
const setCaptains = (w: Who, s: S, cs: Who[]) => call(w, 'squad_session_set_captains', '$1, $2::uuid[], $3', [s.id, cs.map((p) => p.player), s.version]);
const pick = (w: Who, s: S, p: Who) => call(w, 'squad_session_pick', '$1, $2, $3', [s.id, p.player, s.version]);
const shareRest = (w: Who, s: S) => call(w, 'squad_session_share_rest', '$1, $2', [s.id, s.version]);
const restart = (w: Who, s: S) => call(w, 'squad_session_restart_picks', '$1, $2', [s.id, s.version]);
const makeTeams = (w: Who, s: S) => call(w, 'squad_session_make_teams', '$1, $2', [s.id, s.version]);
const nextGame = async (w: Who, s: S, home: number, away: number) =>
  (await db.as<{ m: string }>(w.uid, `select squad_session_next_game($1, $2, $3, $4) as m`, [s.id, home, away, s.version]))[0].m;
const end = (w: Who, s: S) => call(w, 'squad_session_end', '$1, $2', [s.id, s.version]);
const reload = async (s: S) => (await db.sql<S>(`select * from squad_sessions where id = $1`, [s.id]))[0];

let P: Who[] = [];
let outsider: Who;
before(async () => {
  db = await bootDb({ strict: true });
  for (let i = 0; i < 9; i++) P.push(await person(`Player ${i + 1}`));
  outsider = await person('Out Sider');
});

async function picking() {
  let s = await create(P[0], P);
  s = await setCaptains(P[4], s, [P[0], P[1], P[2]]);
  return s;
}

describe('creating and rules', () => {
  test('the creator is always in; rules are stored; version starts at 1', async () => {
    const s = await create(P[0], P.slice(1, 4));
    assert.ok(s.players.includes(P[0].player));
    assert.equal(s.players.length, 4);
    assert.equal(s.status, 'setup');
    assert.equal(s.version, 1);
  });
  test('SS16: signed out is refused', async () => {
    assert.ok(await errOf(() => db.asAnon(`select squad_session_create('football', 'X', '{}'::uuid[], '{}'::jsonb)`)));
  });
  test('SS14: more than 100 players is refused', async () => {
    const many = Array.from({ length: 101 }, () => randomUUID());
    assert.match(await errOf(() => db.as(P[0].uid, `select squad_session_create('football', 'X', $1::uuid[], '{}'::jsonb)`, [many])) ?? '', /too_many_players|unknown_player/);
  });
  test('SS7: junk rules refused on the server', async () => {
    const s = await create(P[0], P);
    assert.match(await errOf(() => setRules(P[1], s, { teams: 50 })) ?? '', /bad_rules/);
    assert.match(await errOf(() => setRules(P[1], s, { teams: 3, rotation: 'chaos' })) ?? '', /bad_rules/);
    assert.match(await errOf(() => setRules(P[1], s, { teams: 3, points: { win: -1, draw: 1, loss: 0 } })) ?? '', /bad_rules/);
  });
  test('SS1: any present player may change rules; an outsider may not', async () => {
    const s = await create(P[0], P);
    const s2 = await setRules(P[5], s, { teams: 3, rotation: 'winner_stays', pickOrder: 'straight', points: { win: 2, draw: 1, loss: 0 }, maxWins: 3, drawRule: 'both_off' });
    assert.equal(s2.rules.rotation, 'winner_stays');
    assert.equal(s2.version, 2);
    assert.match(await errOf(() => setRules(outsider, s2, { teams: 3 })) ?? '', /not_in_session/);
  });
  test('SS4: a stale version is refused', async () => {
    const s = await create(P[0], P);
    await setRules(P[1], s, { teams: 2 });
    assert.match(await errOf(() => setRules(P[2], s, { teams: 3 })) ?? '', /session_changed/);
  });
  test('reads are open, writes only through the functions', async () => {
    const s = await create(P[0], P);
    assert.equal((await db.asAnon<{ id: string }>(`select id from squad_sessions where id = $1`, [s.id])).length, 1);
    assert.ok(await errOf(() => db.as(P[0].uid, `update squad_sessions set status = 'ended' where id = $1`, [s.id])));
    assert.ok(await errOf(() => db.as(P[0].uid, `insert into squad_sessions (sport, name, rules) values ('football', 'x', '{}')`)));
  });
});

describe('captains and picks', () => {
  test('SS6: wrong count, not present or repeated captains refused', async () => {
    const s = await create(P[0], P);
    assert.match(await errOf(() => setCaptains(P[0], s, [P[0], P[1]])) ?? '', /bad_captains/);
    assert.match(await errOf(() => setCaptains(P[0], s, [P[0], P[1], outsider])) ?? '', /bad_captains/);
    assert.match(await errOf(() => setCaptains(P[0], s, [P[0], P[1], P[1]])) ?? '', /bad_captains/);
  });
  test('SS2: only the captain whose turn it is may pick (snake)', async () => {
    let s = await picking();
    assert.equal(s.status, 'picking');
    assert.match(await errOf(() => pick(P[1], s, P[3])) ?? '', /not_your_pick/);
    assert.match(await errOf(() => pick(P[5], s, P[3])) ?? '', /not_your_pick/);
    s = await pick(P[0], s, P[3]);
    s = await pick(P[1], s, P[4]);
    s = await pick(P[2], s, P[5]);
    // snake: captain 3 again
    assert.match(await errOf(() => pick(P[0], s, P[6])) ?? '', /not_your_pick/);
    s = await pick(P[2], s, P[6]);
    assert.deepEqual(s.picks.map((p) => p.captain), [P[0], P[1], P[2], P[2]].map((p) => p.player));
  });
  test('SS3: picked twice, a captain, or an outsider is refused', async () => {
    let s = await picking();
    s = await pick(P[0], s, P[3]);
    assert.match(await errOf(() => pick(P[1], s, P[3])) ?? '', /not_available/);
    assert.match(await errOf(() => pick(P[1], s, P[2])) ?? '', /not_available/);
    assert.match(await errOf(() => pick(P[1], s, outsider)) ?? '', /not_available/);
  });
  test('SS4: two phones picking the same turn — the second is refused', async () => {
    const s = await picking();
    await pick(P[0], s, P[3]);
    assert.match(await errOf(() => pick(P[0], s, P[4])) ?? '', /session_changed/);
  });
  test('SS5/SS10: captains and players lock once picking starts; restart is explicit', async () => {
    let s = await picking();
    s = await pick(P[0], s, P[3]);
    assert.match(await errOf(() => setCaptains(P[0], s, [P[3], P[4], P[5]])) ?? '', /picks_started/);
    assert.match(await errOf(() => setPlayers(P[0], s, P.slice(0, 6))) ?? '', /players_locked/);
    assert.match(await errOf(() => setRules(P[0], s, { teams: 2 })) ?? '', /teams_locked/);
    s = await restart(P[7], s);
    assert.equal(s.picks.length, 0);
    s = await setCaptains(P[0], s, [P[3], P[4], P[5]]);
    assert.deepEqual(s.captains, [P[3], P[4], P[5]].map((p) => p.player));
  });
  test('share the rest, then make teams: rosters are captain + picks', async () => {
    let s = await picking();
    s = await pick(P[0], s, P[3]);
    assert.match(await errOf(() => makeTeams(P[0], s)) ?? '', /picks_unfinished/);
    s = await shareRest(P[8], s);
    assert.equal(s.picks.length, 6);
    s = await makeTeams(P[8], s);
    assert.equal(s.status, 'playing');
    assert.equal(s.team_ids.length, 3);
    const teams = await db.sql<{ id: string; name: string; roster: string[]; adhoc: boolean }>(`select id, name, roster, adhoc from teams where id = any($1::uuid[])`, [s.team_ids]);
    const byId = new Map(teams.map((t) => [t.id, t]));
    const t1 = byId.get(s.team_ids[0])!;
    assert.equal(t1.name, 'Fnatic 1');
    assert.equal(t1.adhoc, true);
    assert.equal(t1.roster[0], P[0].player);
    assert.equal(t1.roster.length, 3);
  });
});

describe('games', () => {
  async function playing() {
    let s = await picking();
    s = await shareRest(P[0], s);
    return makeTeams(P[0], s);
  }
  test('next game: a friendly between session teams that any player can score', async () => {
    let s = await playing();
    const m = await nextGame(P[6], s, 0, 1);
    const [row] = await db.sql<{ tournament_id: string | null; session_id: string; home_team_id: string; away_team_id: string; scorer_ids: string[]; shared_scoring: boolean; status: string }>(
      `select tournament_id, session_id, home_team_id, away_team_id, scorer_ids, shared_scoring, status from matches where id = $1`, [m]);
    assert.equal(row.tournament_id, null);
    assert.equal(row.session_id, s.id);
    assert.equal(row.home_team_id, s.team_ids[0]);
    assert.equal(row.away_team_id, s.team_ids[1]);
    assert.equal(row.shared_scoring, true);
    assert.equal(row.scorer_ids.length, 9);
    // a player (not the one who started it) records a step
    const seq = await db.as<{ s: number }>(P[8].uid, `select append_match_event($1, 'dev', $2, 'goal', 'home', '{}'::jsonb, null, '') as s`, [m, randomUUID()]);
    assert.equal(seq[0].s, 1);
  });
  test('SS8: no second game while one is open', async () => {
    let s = await playing();
    await nextGame(P[0], s, 0, 1);
    s = await reload(s);
    assert.match(await errOf(() => nextGame(P[0], s, 1, 2)) ?? '', /game_open/);
    await db.sql(`update matches set status = 'completed' where session_id = $1`, [s.id]);
    assert.ok(await nextGame(P[0], s, 1, 2));
  });
  test('SS9: bad team indexes refused; SS1 outsider refused', async () => {
    const s = await playing();
    assert.match(await errOf(() => nextGame(P[0], s, 0, 0)) ?? '', /bad_teams/);
    assert.match(await errOf(() => nextGame(P[0], s, 0, 3)) ?? '', /bad_teams/);
    assert.match(await errOf(() => nextGame(outsider, s, 0, 1)) ?? '', /not_in_session/);
  });
  test('SS15: an ended session refuses every change', async () => {
    let s = await playing();
    s = await end(P[3], s);
    assert.equal(s.status, 'ended');
    assert.match(await errOf(() => nextGame(P[0], s, 0, 1)) ?? '', /session_ended/);
    assert.match(await errOf(() => setRules(P[0], s, { teams: 3 })) ?? '', /session_ended/);
  });
  test('SS13: games count as friendlies for the picked players', async () => {
    const s = await playing();
    const m = await nextGame(P[0], s, 0, 1);
    // a picked (non-captain) player on the home team
    const [home] = await db.sql<{ roster: string[] }>(`select roster from teams where id = $1`, [s.team_ids[0]]);
    const picked = home.roster[1];
    const [r] = await db.sql<{ n: string }>(
      `select count(*) as n from matches m join teams t on t.id in (m.home_team_id, m.away_team_id)
        where m.id = $1 and m.tournament_id is null and t.roster ? $2`, [m, picked]);
    assert.equal(Number(r.n), 1);
    // and a player of the team sitting out is not in this game
    const [out] = await db.sql<{ roster: string[] }>(`select roster from teams where id = $1`, [s.team_ids[2]]);
    const [r2] = await db.sql<{ n: string }>(
      `select count(*) as n from matches m join teams t on t.id in (m.home_team_id, m.away_team_id) where m.id = $1 and t.roster ? $2`, [m, out.roster[1]]);
    assert.equal(Number(r2.n), 0);
  });
});
