/** Usage dashboard against a real Postgres (PGlite): who may read it, and the
 *  numbers on seeded activity (docs/security/breaks/usage-dashboard.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
let support: string, user: string;
type Week = Record<string, number | string>;
const dash = async (uid: string, weeks = 4) => (await db.as<{ d: { weeks: Week[]; by_sport: { sport: string; games: number }[]; today: Record<string, number> } }>(uid, `select usage_dashboard($1) as d`, [weeks]))[0].d;

before(async () => {
  db = await bootDb({ strict: true });
  support = await db.signUp({ name: 'Sam Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);
  user = await db.signUp({ name: 'Una User' });
});

describe('UD1/UD2/UD6 access and shape', () => {
  test('support reads it; a user and anon cannot', async () => {
    assert.ok(Array.isArray((await dash(support)).weeks));
    assert.match(await errOf(() => dash(user)) ?? '', /not_allowed/);
    assert.ok(await errOf(() => db.asAnon(`select usage_dashboard(4)`)));
  });
  test('counts only: no ids or names anywhere in the reply', async () => {
    const txt = JSON.stringify(await dash(support));
    assert.doesNotMatch(txt, /[0-9a-f]{8}-[0-9a-f]{4}-/);
    assert.doesNotMatch(txt, /Una|Sam/);
  });
  test('UD6: 1–26 weeks', async () => {
    assert.equal((await dash(support, 500)).weeks.length, 26);
    assert.equal((await dash(support, 0)).weeks.length, 1);
  });
});

describe('UD9 privacy: a minor / opted-out sign-up counts, but is never linked', () => {
  test('sign-ups count everyone; activation only those who share usage data', async () => {
    const before = (await dash(support, 1)).weeks[0];
    await db.signUp({ name: 'Young Player', dob: '2012-01-01' });
    const w = (await dash(support, 1)).weeks[0];
    assert.equal(Number(w.sign_ups) - Number(before.sign_ups), 1);
    assert.equal(Number(w.cohort) - Number(before.cohort), 0, 'a minor is not in the linked cohort');
  });
});

describe('UD3/UD7 the numbers', () => {
  test('games scored, finish rate, activation, shares, views, crash-free', async () => {
    const before = (await dash(support, 1)).weeks[0];
    // a new player who plays (not scores) a game this week
    // an adult who shares usage data (analytics links no one else — analytics_actor)
    const newbie = await db.signUp({ name: 'New Player', dob: '1990-01-01' });
    const [p] = await db.sql<{ id: string }>(`insert into players (full_name, profile_id) values ('New Player', $1) returning id`, [newbie]);
    const [t1] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, roster) values ('A', 'A', 'football', $1::jsonb) returning id`, [JSON.stringify([p.id])]);
    const [t2] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('B', 'B', 'football') returning id`);
    // scored + completed; completed with no events (a walkover); started not finished
    const mk = async () => (await db.sql<{ id: string }>(`insert into matches (sport, home_team_id, away_team_id, status) values ('football', $1, $2, 'scheduled') returning id`, [t1.id, t2.id]))[0].id;
    const scored = await mk(), walkover = await mk(), unfinished = await mk();
    for (const m of [scored, unfinished]) await db.sql(`update matches set status = 'live' where id = $1`, [m]);
    await db.sql(`insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'goal', 'home', '{}')`, [scored]);
    await db.sql(`update matches set status = 'completed' where id = any($1::uuid[])`, [[scored, walkover]]);
    await db.sql(`update matches set status = 'completed' where id = $1`, [scored]); // no double count
    await db.sql(`insert into analytics_events (name, profile_id, source, props) values ('share_link', $1, 'client', '{"what":"match"}'), ('app_open', $1, 'client', '{}')`, [newbie]);
    await db.sql(`insert into match_views (match_id, viewer) values ($1, 'v1'), ($1, 'v2')`, [scored]);
    const sid = randomUUID();
    await db.sql(`insert into analytics_events (name, profile_id, session_id, source) values ('app_open', $1, $2, 'client')`, [user, sid]);
    await db.sql(`insert into client_errors (session_id, fatal, message, fingerprint) values ($1, true, 'boom', 'fp')`, [sid]);
    const w = (await dash(support, 1)).weeks[0];
    assert.equal(Number(w.games_scored) - Number(before.games_scored), 1, 'only the scored game');
    assert.equal(Number(w.started) - Number(before.started), 2);
    assert.equal(Number(w.finished) - Number(before.finished), 1);
    assert.ok(Number(w.activated) >= 1, 'played, not scored, still counts');
    assert.ok(Number(w.sign_ups) - Number(before.sign_ups) >= 1);
    assert.equal(Number(w.shares) - Number(before.shares), 1);
    assert.equal(Number(w.game_views) - Number(before.game_views), 2);
    assert.ok(Number(w.crashed) >= 1);
    const d = await dash(support, 1);
    assert.ok(d.by_sport.some((x) => x.sport === 'football' && x.games >= 1));
    assert.ok(d.today.games_scored >= 1);
  });
});

describe('UD10 drill-downs: who', () => {
  const people = async (uid: string, kind: string) => (await db.as<{ r: Record<string, unknown>[] }>(uid, `select usage_people($1) as r`, [kind]))[0].r;
  test('support sees this week\'s sign-ups by name; a user cannot', async () => {
    const who = await db.signUp({ name: 'Riya Newcomer', dob: '1995-05-05' });
    await db.sql(`insert into players (full_name, profile_id, city) values ('Riya Newcomer', $1, 'Hyderabad')`, [who]);
    const kid = await db.signUp({ name: 'Kiran Kid', dob: '2013-03-03' });
    const rows = await people(support, 'signups');
    const riya = rows.find((r) => r.name === 'Riya Newcomer')!;
    assert.ok(riya, 'listed');
    assert.equal(riya.city, 'Hyderabad');
    assert.equal(riya.minor, false);
    assert.equal(rows.find((r) => r.name === 'Kiran Kid')?.minor, true, 'under 18 marked');
    for (const r of rows) assert.ok(!('phone' in r) && !('email' in r), 'no contact details');
    assert.match(await errOf(() => people(user, 'signups')) ?? '', /not_allowed/);
    assert.match(await errOf(() => people(support, 'everything')) ?? '', /bad_kind/);
    void kid;
  });
  test('games and active lists', async () => {
    const g = await people(support, 'games');
    assert.ok(Array.isArray(g));
    for (const x of g) assert.ok(Number(x.steps) >= 1, 'only scored games');
    const a = await people(support, 'active');
    assert.ok(Array.isArray(a));
  });
});
