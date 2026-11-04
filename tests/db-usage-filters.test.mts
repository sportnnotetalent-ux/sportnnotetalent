/** Usage dashboard filters against a real Postgres (PGlite): period, sports,
 *  places — and who may read them (docs/security/breaks/usage-filters.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
let support: string, user: string, today: string, hyd: number, pune: number;
type Totals = Record<string, number>;
type Report = { from: string; to: string; bucket: string; period: Totals; previous: Totals; today: Totals; buckets: (Totals & { start: string })[];
  by_sport: { sport: string; games: number }[]; places: { id: number; name: string; people: number; games: number }[] };
const report = async (uid: string, from: string, to: string, sports: string[] | null = null, cities: number[] | null = null) =>
  (await db.as<{ r: Report }>(uid, `select usage_report($1::date, $2::date, $3::text[], $4::int[]) as r`, [from, to, sports, cities]))[0].r;
const people = async (kind: string, sports: string[] | null = null, cities: number[] | null = null) =>
  (await db.as<{ r: Record<string, unknown>[] }>(support, `select usage_report_people($1, $2::date, $2::date, $3::text[], $4::int[]) as r`, [kind, today, sports, cities]))[0].r;
const n = (v: unknown) => Number(v);

before(async () => {
  db = await bootDb({ strict: true });
  [{ today }] = await db.sql<{ today: string }>(`select to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as today`);
  [{ id: hyd }] = await db.sql<{ id: number }>(`select id from cities where name = 'Hyderabad' order by population desc limit 1`);
  [{ id: pune }] = await db.sql<{ id: number }>(`select id from cities where name = 'Pune' order by population desc limit 1`);
  support = await db.signUp({ name: 'Sam Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);
  user = await db.signUp({ name: 'Una User' });
  const person = async (name: string, dob: string, sports: string[], city: string | null, home: number | null) => {
    const uid = await db.signUp({ name, dob });
    if (home) await db.sql(`update profiles set home_city_id = $2 where id = $1`, [uid, home]);
    const [p] = await db.sql<{ id: string }>(`insert into players (full_name, profile_id, sports, city, dob) values ($1, $2, $3, $4, $5) returning id`, [name, uid, sports, city, dob]);
    return { uid, pid: p.id };
  };
  const a = await person('Asha Pool', '1990-01-01', ['pool'], null, hyd);
  const b = await person('Bala Tennis', '1991-01-01', ['tennis'], 'Pune', null);
  await person('Chitra Cue', '1992-01-01', ['pool', 'snooker'], null, null);
  await person('Kid Pool', '2013-01-01', ['pool'], null, hyd);
  const team = async (s: string) => (await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ($1, 'X', $2) returning id`, [`${s} side`, s]))[0].id;
  const game = async (sport: string, extra: string, args: unknown[] = []) => {
    const [h, w] = [await team(sport), await team(sport)];
    const [m] = await db.sql<{ id: string }>(`insert into matches (sport, home_team_id, away_team_id, status ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $3, 'live' ${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [sport, h, w, ...args]);
    await db.sql(`insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'point', 'home', '{}')`, [m.id]);
    await db.sql(`update matches set status = 'completed' where id = $1`, [m.id]);
    return m.id;
  };
  const [cup] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, sports, city) values ('Hyd Cup', 'H', '{pool}', 'Hyderabad') returning id`);
  await game('pool', 'tournament_id=$4', [cup.id]);
  await game('tennis', 'host_ids=$4', [[b.pid]]);
  await game('football', '');
  await db.sql(`insert into analytics_events (name, profile_id, source) values ('app_open', $1, 'client')`, [a.uid]);
  await db.sql(`insert into analytics_events (name, anon_id, source) values ('app_open', $1, 'client')`, [randomUUID()]);
});

describe('UF1/UF2/UF3 access and inputs', () => {
  test('support only', async () => {
    assert.ok((await report(support, today, today)).period);
    assert.match(await errOf(() => report(user, today, today)) ?? '', /not_allowed/);
    assert.ok(await errOf(() => db.asAnon(`select usage_report(current_date, current_date, null, null)`)));
    assert.match(await errOf(() => db.as(user, `select usage_report_people('signups', current_date, current_date, null, null)`)) ?? '', /not_allowed/);
  });
  test('UF2: reversed, too long or future ranges are refused', async () => {
    assert.match(await errOf(() => report(support, today, '2026-01-01')) ?? '', /bad_range/);
    assert.match(await errOf(() => report(support, '2024-01-01', today)) ?? '', /bad_range/);
    assert.match(await errOf(() => report(support, today, '2099-01-01')) ?? '', /bad_range/);
  });
  test('UF3: junk sports and too many values are refused; unknown ones match nothing', async () => {
    assert.match(await errOf(() => report(support, today, today, ["x'; drop table matches"])) ?? '', /bad_filter/);
    assert.match(await errOf(() => report(support, today, today, Array.from({ length: 31 }, (_, i) => `s${i}`))) ?? '', /bad_filter/);
    assert.match(await errOf(() => report(support, today, today, null, Array.from({ length: 51 }, (_, i) => i + 1))) ?? '', /bad_filter/);
    assert.equal(n((await report(support, today, today, ['curling'])).period.sign_ups), 0);
  });
});

describe('the filters', () => {
  test('no filter: everyone and every game', async () => {
    const r = await report(support, today, today);
    assert.equal(n(r.period.sign_ups), 6);
    assert.equal(n(r.period.games_scored), 3);
    assert.equal(n(r.period.active_users), 2, 'a person and an install');
  });
  test('sport: people who play it, games of it; installs left out (UF4)', async () => {
    const r = await report(support, today, today, ['pool']);
    assert.equal(n(r.period.sign_ups), 3);
    assert.equal(n(r.period.games_scored), 1);
    assert.equal(n(r.period.active_users), 1);
    assert.deepEqual(r.by_sport.map((x) => x.sport), ['pool']);
  });
  test('place: home city, else profile city; game: tournament city, else the people running it', async () => {
    const h = await report(support, today, today, null, [hyd]);
    assert.equal(n(h.period.sign_ups), 2);
    assert.equal(n(h.period.games_scored), 1);
    const p = await report(support, today, today, null, [pune]);
    assert.equal(n(p.period.sign_ups), 1);
    assert.equal(n(p.period.games_scored), 1);
    const none = await report(support, today, today, null, [0]);
    assert.equal(n(none.period.sign_ups), 3, '"No city set"');
    assert.equal(n(none.period.games_scored), 1);
  });
  test('several sports and several places together', async () => {
    const r = await report(support, today, today, ['pool', 'tennis'], [hyd, pune]);
    assert.equal(n(r.period.sign_ups), 3);
    assert.equal(n(r.period.games_scored), 2);
  });
  test('UF6: the places list is names and counts only', async () => {
    const r = await report(support, today, today);
    const h = r.places.find((x) => x.id === hyd)!;
    assert.equal(h.name, 'Hyderabad');
    assert.equal(n(h.people), 2);
    assert.equal(n(h.games), 1);
    assert.ok(r.places.some((x) => x.id === 0 && /No city/.test(x.name)));
    assert.doesNotMatch(JSON.stringify(r.places), /Asha|Bala|Kid/);
  });
  test('UF5: the lists follow the same filters', async () => {
    assert.deepEqual((await people('signups', ['pool'])).map((x) => x.name).sort(), ['Asha Pool', 'Chitra Cue', 'Kid Pool']);
    assert.deepEqual((await people('signups', null, [pune])).map((x) => x.name), ['Bala Tennis']);
    const g = await people('games', null, [pune]);
    assert.equal(g.length, 1);
    assert.equal(g[0].sport, 'tennis');
    const act = await people('active', ['pool']);
    assert.deepEqual(act.map((x) => x.name), ['Asha Pool']);
  });
});

describe('periods', () => {
  test('buckets per day, the previous period of the same length (UF7)', async () => {
    const [{ from }] = await db.sql<{ from: string }>(`select to_char($1::date - 6, 'YYYY-MM-DD') as "from"`, [today]);
    const r = await report(support, from, today);
    assert.equal(r.bucket, 'day');
    assert.equal(r.buckets.length, 7);
    assert.equal(r.buckets[6].start, today);
    assert.equal(n(r.buckets[6].games_scored), 3);
    assert.equal(n(r.previous.games_scored), 0);
    const [{ f90 }] = await db.sql<{ f90: string }>(`select to_char($1::date - 89, 'YYYY-MM-DD') as f90`, [today]);
    const w = await report(support, f90, today);
    assert.equal(w.bucket, 'week');
    assert.equal(w.buckets.reduce((s, b) => s + n(b.games_scored), 0), 3);
  });
  test('UF8: retention counts sign-ups at least a week old, active again in days 7–14', async () => {
    const old = await db.signUp({ name: 'Olu Old', dob: '1988-01-01' });
    await db.sql(`update profiles set created_at = now() - interval '10 days' where id = $1`, [old]);
    await db.sql(`update analytics_events set at = now() - interval '10 days' where name = 'signed_up' and profile_id = $1`, [old]);
    await db.sql(`insert into analytics_events (name, profile_id, source, at) values ('app_open', $1, 'client', now() - interval '2 days')`, [old]);
    const [{ f }] = await db.sql<{ f: string }>(`select to_char($1::date - 29, 'YYYY-MM-DD') as f`, [today]);
    const r = await report(support, f, today);
    assert.equal(n(r.period.ret_base), 1);
    assert.equal(n(r.period.retained), 1);
    assert.equal(n((await report(support, today, today)).period.ret_base), 0, 'today’s sign-ups are too new');
  });
});
