/** Team join link + requests in the database (docs/security/breaks/team-join-link.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

describe('team join link', () => {
  let db: TestDb;
  let cap: string, stranger: string, adult: string, parent: string, teen: string;
  let adultPid: string, childPid: string, teenPid: string, strangerPid: string;
  let team: string, house: string, token: string;
  const refused = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
  const one = async <T,>(p: Promise<T[]>) => (await p)[0];

  before(async () => {
    db = await bootDb({ strict: true });
    const person = async (name: string, dob: string) => {
      const uid = await db.signUp({ name, dob });
      const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
      return { uid, pid: p.id };
    };
    const c = await person('Cap Tain', '1990-01-01'); cap = c.uid;
    const s = await person('Some Stranger', '1990-01-01'); stranger = s.uid; strangerPid = s.pid;
    const a = await person('Adult Player', '1995-05-05'); adult = a.uid; adultPid = a.pid;
    const pa = await person('Parent Person', '1980-01-01'); parent = pa.uid;
    const t = await person('Teen Ager', '2012-01-01'); teen = t.uid; teenPid = t.pid;
    // the parent's child (no account of their own)
    [{ id: childPid }] = await db.sql<{ id: string }>(`insert into players (full_name, dob, guardian_profile_id) values ('Kid Name Here', '2014-03-03', $1) returning id`, [parent]);
    [{ id: team }] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id, roster) values ('Rovers', 'ROV', 'football', $1, $2) returning id`, [c.pid, JSON.stringify([c.pid])]);
    // a school house team, no squad list: its squad comes from the house
    [{ id: house }] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('Red House', 'RH', 'football', $1) returning id`, [c.pid]);
    await db.sql(`insert into players (full_name, house_name, sports) values ('House Kid', 'Red House', '{football}')`);
  });

  test('TJ2: only a manager gets the link; strangers cannot', async () => {
    token = (await one(db.as<{ t: string }>(cap, `select team_join_link($1) as t`, [team]))).t;
    assert.ok(token && token.length >= 6);
    assert.ok(await refused(() => db.as(stranger, `select team_join_link($1)`, [team])));
    assert.ok(await refused(() => db.as(stranger, `select team_join_link_off($1)`, [team])));
  });

  test('TJ6: a school house team with no squad list gets no join link', async () => {
    assert.ok(await refused(() => db.as(cap, `select team_join_link($1)`, [house])));
  });

  test('TJ3: the preview shows only the team name and sport', async () => {
    const rows = await db.as<Record<string, unknown>>(adult, `select * from team_join_preview($1)`, [token]);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['sport', 'team_id', 'team_name']);
    assert.equal(rows[0].team_name, 'Rovers');
  });

  test('TJ4: an adult asks for themselves; a teen is told to ask a parent; nobody asks for a stranger', async () => {
    assert.equal((await one(db.as<{ r: string }>(adult, `select request_team_join($1, $2) as r`, [token, adultPid]))).r, 'requested');
    assert.equal((await one(db.as<{ r: string }>(teen, `select request_team_join($1, $2) as r`, [token, teenPid]))).r, 'ask_parent');
    assert.ok(await refused(() => db.as(adult, `select request_team_join($1, $2)`, [token, strangerPid])), 'not someone else');
    assert.ok(await refused(() => db.as(adult, `select request_team_join($1, $2)`, [token, childPid])), 'not someone else\'s child');
    assert.equal((await one(db.as<{ r: string }>(parent, `select request_team_join($1, $2) as r`, [token, childPid]))).r, 'requested', 'a parent asks for their child');
  });

  test('TJ9: asking twice is "already requested"', async () => {
    assert.equal((await one(db.as<{ r: string }>(adult, `select request_team_join($1, $2) as r`, [token, adultPid]))).r, 'already_requested');
  });

  test('TJ1/TJ5: nobody is in the squad yet; the manager sees the requests, a child as initials', async () => {
    const roster = (await one(db.sql<{ roster: string[] }>(`select roster from teams where id = $1`, [team]))).roster;
    assert.ok(!roster.includes(adultPid) && !roster.includes(childPid));
    const reqs = await db.as<{ name: string; adult: boolean; by_parent: boolean }>(cap, `select * from team_join_requests_for($1)`, [team]);
    assert.equal(reqs.length, 2);
    assert.deepEqual(reqs.map((r) => [r.name, r.adult, r.by_parent]), [['Adult Player', true, false], ['K. N. H.', false, true]]);
    assert.ok(await refused(() => db.as(stranger, `select * from team_join_requests_for($1)`, [team])), 'TJ2');
  });

  test('TJ1/TJ9/TJ10: accepting adds them once and records their side agreed; declining adds no one', async () => {
    const reqs = await db.as<{ id: string; player_id: string }>(cap, `select id, player_id from team_join_requests_for($1)`, [team]);
    const a = reqs.find((r) => r.player_id === adultPid)!;
    const c = reqs.find((r) => r.player_id === childPid)!;
    assert.ok(await refused(() => db.as(stranger, `select decide_team_join($1, true)`, [a.id])), 'TJ2');
    assert.equal((await one(db.as<{ r: string }>(cap, `select decide_team_join($1, true) as r`, [a.id]))).r, 'accepted');
    assert.equal((await one(db.as<{ r: string }>(cap, `select decide_team_join($1, true) as r`, [a.id]))).r, 'accepted', 'answering again changes nothing');
    assert.equal((await one(db.as<{ r: string }>(cap, `select decide_team_join($1, false) as r`, [c.id]))).r, 'declined');
    const roster = (await one(db.sql<{ roster: string[] }>(`select roster from teams where id = $1`, [team]))).roster;
    assert.equal(roster.filter((x) => x === adultPid).length, 1);
    assert.ok(!roster.includes(childPid));
    const consent = await db.sql(`select method from member_consents where kind = 'team' and group_id = $1 and player_id = $2`, [team, adultPid]);
    assert.deepEqual(consent, [{ method: 'joined' }]);
    assert.equal((await one(db.as<{ r: string }>(adult, `select request_team_join($1, $2) as r`, [token, adultPid]))).r, 'already_member');
  });

  test('TJ8: a turned-off or replaced link stops working', async () => {
    await db.as(cap, `select team_join_link_off($1)`, [team]);
    assert.equal((await db.as(adult, `select * from team_join_preview($1)`, [token])).length, 0);
    assert.equal((await one(db.as<{ r: string }>(parent, `select request_team_join($1, $2) as r`, [token, childPid]))).r, 'link_off');
    const fresh = (await one(db.as<{ t: string }>(cap, `select team_join_link($1, true) as t`, [team]))).t;
    assert.notEqual(fresh, token);
    assert.equal((await db.as(adult, `select * from team_join_preview($1)`, [token])).length, 0, 'the old token is dead');
    assert.equal((await db.as(adult, `select * from team_join_preview($1)`, [fresh])).length, 1);
  });

  test('TJ7: the tables are not readable or writable directly', async () => {
    assert.ok(await refused(() => db.as(adult, `select * from team_join_links`)));
    assert.ok(await refused(() => db.as(adult, `insert into team_join_requests (team_id, player_id, requested_by) values ($1, $2, $3)`, [team, adultPid, adult])));
  });
});
