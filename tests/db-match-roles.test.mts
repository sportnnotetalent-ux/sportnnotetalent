/** Match-day roles in the database (docs/security/breaks/match-roles.md):
 *  captain / keeper must be in that side's squad; only a side's managers set
 *  them; leaving the squad clears the role; old rows aren't broken. */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

describe('match_squads roles', () => {
  let db: TestDb;
  let homeCap: string, awayCap: string, host: string, matchId: string;
  let p1: string, p2: string, p3: string;
  before(async () => {
    db = await bootDb({ strict: true });
    const person = async (name: string) => {
      const uid = await db.signUp({ name, dob: '1990-01-01' });
      const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id) values ($1, $2) returning id`, [name, uid]);
      return { uid, pid: p.id };
    };
    const hc = await person('Home Captain'); const ac = await person('Away Captain'); const ho = await person('Host');
    homeCap = hc.uid; awayCap = ac.uid; host = ho.uid;
    const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('Home FC', 'HFC', 'football', $1) returning id`, [hc.pid]);
    const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('Away FC', 'AFC', 'football', $1) returning id`, [ac.pid]);
    [{ id: matchId }] = await db.sql<{ id: string }>(`insert into matches (sport, status, home_team_id, away_team_id, host_ids) values ('football', 'scheduled', $1, $2, $3) returning id`, [h.id, a.id, [ho.pid]]);
    [p1, p2, p3] = (await db.sql<{ id: string }>(`insert into players (full_name) values ('One'), ('Two'), ('Three') returning id`)).map((r) => r.id);
  });
  const refused = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
  const upsert = (uid: string, side: string, starters: string[], captain: string | null, keeper: string | null = null) =>
    db.as(uid, `insert into match_squads (match_id, side, starters, subs, captain_id, keeper_id) values ($1, $2, $3, '[]', $4, $5)
      on conflict (match_id, side) do update set starters = excluded.starters, subs = excluded.subs, captain_id = excluded.captain_id, keeper_id = excluded.keeper_id`,
      [matchId, side, JSON.stringify(starters), captain, keeper]);
  const row = async (side: string) => (await db.sql<{ captain_id: string | null; keeper_id: string | null }>(`select captain_id, keeper_id from match_squads where match_id = $1 and side = $2`, [matchId, side]))[0];

  test('a side manager sets a captain and keeper from the squad', async () => {
    await upsert(homeCap, 'home', [p1, p2], p1, p2);
    assert.deepEqual(await row('home'), { captain_id: p1, keeper_id: p2 });
  });
  test('MR1: a captain or keeper outside the squad is refused', async () => {
    assert.ok(await refused(() => upsert(homeCap, 'home', [p1, p2], p3)), 'captain not in squad');
    assert.ok(await refused(() => upsert(homeCap, 'home', [p1, p2], p1, p3)), 'keeper not in squad');
    assert.deepEqual(await row('home'), { captain_id: p1, keeper_id: p2 }, 'unchanged');
  });
  test('MR2: the other side cannot set our roles', async () => {
    assert.ok(await refused(() => db.as(awayCap, `update match_squads set captain_id = $2 where match_id = $1 and side = 'home'`, [matchId, p2]).then((r) => {
      if (!(r as unknown[]).length) throw new Error('no rows changed');
    })) || (await row('home')).captain_id === p1);
    assert.equal((await row('home')).captain_id, p1);
  });
  test('MR5: taking the captain and keeper out of the squad clears them', async () => {
    await db.as(homeCap, `update match_squads set starters = $2 where match_id = $1 and side = 'home'`, [matchId, JSON.stringify([p3])]);
    assert.deepEqual(await row('home'), { captain_id: null, keeper_id: null });
  });
  test('MR7: an older row whose keeper is not in the squad still saves when neither changes', async () => {
    await db.sql(`alter table match_squads disable trigger match_squads_roles`);
    await db.sql(`insert into match_squads (match_id, side, starters, subs, keeper_id) values ($1, 'away', $2, '[]', $3)
      on conflict (match_id, side) do update set starters = excluded.starters, keeper_id = excluded.keeper_id`, [matchId, JSON.stringify([p1]), p3]);
    await db.sql(`alter table match_squads enable trigger match_squads_roles`);
    await db.as(host, `update match_squads set subs = subs where match_id = $1 and side = 'away'`, [matchId]);
    assert.equal((await row('away')).keeper_id, p3);
  });
  test('the host sets both sides', async () => {
    await upsert(host, 'away', [p1, p2], p2, p1);
    assert.deepEqual(await row('away'), { captain_id: p2, keeper_id: p1 });
  });
});
