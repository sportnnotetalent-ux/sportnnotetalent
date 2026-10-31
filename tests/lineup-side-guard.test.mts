/**
 * Audit C item (cricket batting order) and what checking it found:
 *  1. The cricket batting-order editor showed and saved BOTH teams for a
 *     one-side captain. The server already refused the other side's squad
 *     (match_squads is per side), but silently: the captain's edits vanished.
 *     Now it gets `editableSides` like the other line-up editors.
 *  2. match_lineups (the on-pitch layout) is ONE row per match holding both
 *     teams, and its policy let a manager of either side write the row — so a
 *     home captain could rewrite the away layout. A trigger now refuses a
 *     change to a side the caller doesn't manage (migration 20261031160000).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('the cricket batting-order editor', () => {
  test('its route takes editableSides, and the scorer screen passes them', () => {
    const types = read('src/navigation/types.ts');
    assert.match(types.slice(types.indexOf('CricketLineup: {')), /editableSides\?: \('home' \| 'away'\)\[\];/);
    const live = read('src/screens/LiveScoringScreen.tsx');
    const call = live.slice(live.indexOf("navigation.navigate('CricketLineup'"), live.indexOf("navigation.navigate('CricketLineup'") + 400);
    assert.match(call, /editableSides/);
  });
  test('it shows and saves only the allowed sides', () => {
    const src = read('src/screens/CricketLineupScreen.tsx');
    assert.match(src, /const allowedSides: \('home' \| 'away'\)\[\] = editableSides && editableSides\.length \? editableSides : \['home', 'away'\];/);
    assert.match(src, /useState<'home' \| 'away'>\(allowedSides\[0\]\)/);
    assert.match(src, /for \(const sd of allowedSides\)/);
    assert.match(src, /allowedSides\.includes\('home'\) &&/);
    assert.match(src, /allowedSides\.includes\('away'\) &&/);
  });
});

describe('match_lineups: a side is changed only by someone who manages it', () => {
  let db: TestDb;
  let homeCap: string, awayCap: string, host: string, matchId: string;
  before(async () => {
    db = await bootDb();
    const person = async (name: string) => {
      const uid = await db.signUp({ name, dob: '1990-01-01' });
      const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id) values ($1, $2) returning id`, [name, uid]);
      return { uid, pid: p.id };
    };
    const hc = await person('Home Captain'); const ac = await person('Away Captain'); const ho = await person('Host');
    homeCap = hc.uid; awayCap = ac.uid; host = ho.uid;
    const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('Home CC', 'HCC', 'cricket', $1) returning id`, [hc.pid]);
    const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('Away CC', 'ACC', 'cricket', $1) returning id`, [ac.pid]);
    [{ id: matchId }] = await db.sql<{ id: string }>(`insert into matches (sport, status, home_team_id, away_team_id, host_ids) values ('football', 'scheduled', $1, $2, $3) returning id`, [h.id, a.id, [ho.pid]]);
    await db.sql(`insert into match_lineups (match_id, home, away) values ($1, '[]', '[]')`, [matchId]);
  });
  const set = (uid: string, col: 'home' | 'away' | 'home_formation', v: string) =>
    db.as(uid, `update match_lineups set ${col} = $2 where match_id = $1`, [matchId, col === 'home_formation' ? v : JSON.stringify([{ playerId: v }])]);
  const refused = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
  const row = async () => (await db.sql<{ home: unknown[]; away: unknown[]; home_formation: string | null }>(`select home, away, home_formation from match_lineups where match_id = $1`, [matchId]))[0];

  test('the home captain sets the home side', async () => {
    await set(homeCap, 'home', 'h1');
    await set(homeCap, 'home_formation', '4-4-2');
    const r = await row();
    assert.deepEqual(r.home, [{ playerId: 'h1' }]);
    assert.equal(r.home_formation, '4-4-2');
  });
  test('…but not the away side', async () => {
    assert.ok(await refused(() => set(homeCap, 'away', 'x')));
    assert.deepEqual((await row()).away, []);
  });
  test('the away captain sets away, not home', async () => {
    await set(awayCap, 'away', 'a1');
    assert.ok(await refused(() => set(awayCap, 'home', 'x')));
    assert.ok(await refused(() => set(awayCap, 'home_formation', '3-5-2')));
  });
  test('the match host sets both', async () => {
    await set(host, 'home', 'h2');
    await set(host, 'away', 'a2');
    const r = await row();
    assert.deepEqual([r.home, r.away], [[{ playerId: 'h2' }], [{ playerId: 'a2' }]]);
  });
  test('creating the row: a captain can\'t fill in the other side either', async () => {
    await db.sql(`delete from match_lineups where match_id = $1`, [matchId]);
    assert.ok(await refused(() => db.as(homeCap, `insert into match_lineups (match_id, home, away) values ($1, '[]', '[{"playerId":"x"}]')`, [matchId])));
    await db.as(homeCap, `insert into match_lineups (match_id, home, away) values ($1, '[{"playerId":"h3"}]', '[]')`, [matchId]);
    assert.deepEqual((await row()).home, [{ playerId: 'h3' }]);
  });
});
