/** Captains map stand-ins (docs/security/breaks/team-who-played.md WH10–WH16):
 *  map_team_stand_ins lets a side's team managers (or the match's managers) add
 *  the one "who played" correction — checked play by play in the database. */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

describe('map_team_stand_ins', () => {
  let db: TestDb;
  let cap: string, outsider: string, host: string;
  let capPid: string, p2: string, p3: string, stranger: string, team: string, matchId: string;
  before(async () => {
    db = await bootDb({ strict: true });
    const person = async (name: string) => {
      const uid = await db.signUp({ name, dob: '1990-01-01' });
      const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id) values ($1, $2) returning id`, [name, uid]);
      return { uid, pid: p.id };
    };
    const c = await person('Captain'); const o = await person('Outsider'); const h = await person('Host');
    cap = c.uid; capPid = c.pid; outsider = o.uid; host = h.uid;
    [p2, p3, stranger] = (await db.sql<{ id: string }>(`insert into players (full_name) values ('Two'), ('Three'), ('Stranger') returning id`)).map((r) => r.id);
    [{ id: team }] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id, roster) values ('Smashers', 'SMA', 'badminton', $1, $2) returning id`, [capPid, JSON.stringify([capPid, p2, p3])]);
    const [{ id: away }] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Others', 'OTH', 'badminton') returning id`);
    [{ id: matchId }] = await db.sql<{ id: string }>(`insert into matches (sport, status, home_team_id, away_team_id, host_ids, format) values ('badminton', 'completed', $1, $2, $3, '{"playersPerSide": 2}') returning id`, [team, away, [h.pid]]);
    await db.sql(`insert into match_events (match_id, seq, type, side, payload, attribution) values
      ($1, 1, 'POINT', 'home', $2, null), ($1, 2, 'POINT', 'home', $3, null), ($1, 3, 'POINT', 'away', '{}', null)`,
      [matchId, JSON.stringify({ playerId: `ph:${team}:1` }), JSON.stringify({ pd: { how: 'winner', by: `ph:${team}:2` } })]);
  });
  const refused = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
  const op = (seq: number, side: string, payload: unknown) => ({ op: 'replace', seq, action: { type: 'POINT', side, payload } });
  const goodOps = () => [op(1, 'home', { playerId: capPid }), op(2, 'home', { pd: { how: 'winner', by: p2 } })];
  const call = (uid: string, starters: string[], ops: unknown, stats: unknown = []) =>
    db.as(uid, `select map_team_stand_ins($1, 'home', $2::uuid[], $3::jsonb, $4::text[], 'Tester', $5::jsonb)`, [matchId, starters, JSON.stringify(ops), ['Who played for Smashers'], JSON.stringify(stats)]);
  const amends = async () => (await db.sql<{ n: string }>(`select count(*)::text as n from match_events where match_id = $1 and type = 'AMEND'`, [matchId]))[0].n;

  test('WH10: someone who manages neither the team nor the match is refused', async () => {
    assert.ok(await refused(() => call(outsider, [capPid, p2], goodOps())));
    assert.equal(await amends(), '0');
  });
  test('WH11: the pick must be exactly the number playing, from the squad', async () => {
    assert.ok(await refused(() => call(cap, [capPid], goodOps())), 'too few');
    assert.ok(await refused(() => call(cap, [capPid, capPid], goodOps())), 'twice');
    assert.ok(await refused(() => call(cap, [capPid, stranger], goodOps())), 'not in the squad');
  });
  test('WH12: a play that changes more than who played is refused', async () => {
    assert.ok(await refused(() => call(cap, [capPid, p2], [op(1, 'away', { playerId: capPid })])), 'side changed');
    assert.ok(await refused(() => call(cap, [capPid, p2], [op(3, 'away', { playerId: capPid })])), 'a play with no stand-in');
    assert.ok(await refused(() => call(cap, [capPid, p2], [op(1, 'home', { playerId: p3 })])), 'mapped to someone else');
    assert.ok(await refused(() => call(cap, [capPid, p2], [{ op: 'void', seq: 1 }])), 'only replace');
    assert.equal(await amends(), '0');
  });
  test('WH13: stats only for the mapped players, as whole numbers within the match', async () => {
    assert.ok(await refused(() => call(cap, [capPid, p2], goodOps(), [{ playerId: stranger, stats: { points: 1 } }])), 'not a mapped player');
    assert.ok(await refused(() => call(cap, [capPid, p2], goodOps(), [{ playerId: p2, stats: { winners: 999 } }])), 'more than the match had');
    assert.ok(await refused(() => call(cap, [capPid, p2], goodOps(), [{ playerId: p2, stats: { winners: 1.5 } }])), 'not whole');
  });
  test('WH14: the captain maps: one AMEND, the squad set, the stats written', async () => {
    await call(cap, [capPid, p2], goodOps(), [{ playerId: capPid, stats: { points: 1 } }, { playerId: p2, stats: { winners: 1, points: 1 } }]);
    assert.equal(await amends(), '1');
    const [sq] = await db.sql<{ starters: string[] }>(`select starters from match_squads where match_id = $1 and side = 'home'`, [matchId]);
    assert.deepEqual(sq.starters, [capPid, p2]);
    const lines = await db.sql<{ player_id: string; stats: Record<string, number> }>(`select player_id, stats from stat_lines where match_id = $1 order by player_id`, [matchId]);
    assert.deepEqual(Object.fromEntries(lines.map((l) => [l.player_id, l.stats])), { [capPid]: { points: 1 }, [p2]: { winners: 1, points: 1 } });
  });
  test('WH16: a play already mapped has no stand-in left, so it can’t be touched', async () => {
    assert.ok(await refused(() => call(cap, [capPid, p2], [op(1, 'home', { playerId: capPid })])));
  });
  test('WH15: the match host can map too', async () => {
    await db.sql(`insert into match_events (match_id, seq, type, side, payload) values ($1, 50, 'POINT', 'home', $2)`, [matchId, JSON.stringify({ playerId: `ph:${team}:1` })]);
    await call(host, [capPid, p2], [op(50, 'home', { playerId: capPid })]);
    assert.equal(await amends(), '2');
  });
});
