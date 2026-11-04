/** 600 people and 150 games in random sports and places (docs/security/breaks/usage-filters.md):
 *  places split everything exactly — every single-place report adds up to the
 *  whole, several places = the sum of each; a sport filter never counts more
 *  than the whole; lists match their numbers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

let seed = 2611;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

test('600 people: filters partition and add up', async () => {
  const db = await bootDb({ strict: true });
  const [{ today }] = await db.sql<{ today: string }>(`select to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as today`);
  const support = await db.signUp({ name: 'Sam Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);
  const cityRows = await db.sql<{ id: number; name: string }>(`select distinct on (name) id, name from cities where name in ('Hyderabad', 'Pune', 'Chennai', 'Mumbai') order by name, population desc`);
  const SPORTS = ['pool', 'tennis', 'football', 'badminton', 'snooker'];
  const pids: string[] = [];
  for (let u = 0; u < 600; u++) {
    const uid = await db.signUp({ name: `P${u}`, dob: rnd(5) === 0 ? '2012-01-01' : '1990-01-01' });
    const c = rnd(cityRows.length + 1);
    const how = rnd(3); // home city answer / typed city / none
    if (c < cityRows.length && how === 0) await db.sql(`update profiles set home_city_id = $2 where id = $1`, [uid, cityRows[c].id]);
    const sports = SPORTS.filter(() => rnd(3) === 0);
    const [p] = await db.sql<{ id: string }>(`insert into players (full_name, profile_id, sports, city) values ($1, $2, $3, $4) returning id`,
      [`P${u}`, uid, sports, c < cityRows.length && how === 1 ? cityRows[c].name : null]);
    pids.push(p.id);
    if (rnd(2) === 0) await db.sql(`insert into analytics_events (name, profile_id, source) values ('app_open', $1, 'client')`, [uid]);
  }
  const [team] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('T', 'T', 'pool') returning id`);
  for (let g = 0; g < 150; g++) {
    const sport = SPORTS[rnd(SPORTS.length)];
    const [m] = await db.sql<{ id: string }>(`insert into matches (sport, home_team_id, away_team_id, status, host_ids) values ($1, $2, $2, 'live', $3) returning id`,
      [sport, team.id, rnd(2) ? [pids[rnd(pids.length)]] : []]);
    await db.sql(`insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'point', 'home', '{}')`, [m.id]);
    await db.sql(`update matches set status = 'completed' where id = $1`, [m.id]);
  }
  type T = Record<string, number>;
  const rep = async (sports: string[] | null, cities: number[] | null) =>
    (await db.as<{ r: { period: T } }>(support, `select usage_report($1::date, $1::date, $2::text[], $3::int[]) as r`, [today, sports, cities]))[0].r.period;
  const KEYS = ['sign_ups', 'games_scored', 'active_users', 'cohort'];
  const all = await rep(null, null);
  assert.equal(Number(all.sign_ups), 601);
  assert.equal(Number(all.games_scored), 150);
  const ids = [...cityRows.map((c) => c.id), 0];
  const sums: T = {};
  for (const id of ids) {
    const r = await rep(null, [id]);
    for (const k of KEYS) sums[k] = (sums[k] ?? 0) + Number(r[k]);
  }
  for (const k of KEYS) assert.equal(sums[k], Number(all[k]), `places split ${k} exactly`);
  const two = await rep(null, [ids[0], ids[1]]), a = await rep(null, [ids[0]]), b = await rep(null, [ids[1]]);
  for (const k of KEYS) assert.equal(Number(two[k]), Number(a[k]) + Number(b[k]), `two places = the sum (${k})`);
  for (let i = 0; i < 8; i++) {
    const pick = SPORTS.filter(() => rnd(2) === 0);
    const r = await rep(pick.length ? pick : null, null);
    for (const k of KEYS) assert.ok(Number(r[k]) <= Number(all[k]), k);
  }
  const g = await rep(['pool', 'tennis'], null), gp = await rep(['pool'], null), gt = await rep(['tennis'], null);
  assert.equal(Number(g.games_scored), Number(gp.games_scored) + Number(gt.games_scored), 'a game has one sport');
  const list = (await db.as<{ r: unknown[] }>(support, `select usage_report_people('signups', $1::date, $1::date, null, $2::int[]) as r`, [today, [ids[0]]]))[0].r;
  assert.equal(list.length, Number(a.sign_ups), 'the list matches its number');
});
