/**
 * Personalised Home (founder 2026-10-31) — the database side:
 *  - cities: the GeoNames list (20261031110000_cities.sql), searchable by old
 *    names too ("Bangalore" finds Bengaluru), state shown for repeated names;
 *  - the first-run questions: done / skipped, how they'll use the app, home city;
 *  - match views: one per person (or device) per match per day, the match's own
 *    scorers and hosts don't count, stored hashed, limits;
 *  - near_matches: live matches nearest first (with location) or most viewed in
 *    their city (without), widening 50 → 150 km, then "starting soon" and "just
 *    finished", their sports first, else all sports. Read-only.
 * Migration: 20261031120000_personalised_home.sql.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb(); });

const err = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
const cityId = async (name: string, region?: string) =>
  (await db.sql<{ id: number }>(`select id from cities where name = $1 ${region ? 'and region = $2' : ''} order by population desc limit 1`, region ? [name, region] : [name]))[0].id;
let n = 0;
async function person(name: string, dob = '1990-01-01', city?: string) {
  const uid = await db.signUp({ name, dob });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob, city) values ($1, $2, $3, $4) returning id`, [name, uid, dob, city ?? null]);
  return { uid, player: p.id };
}
async function team(sport = 'football') {
  const [t] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ($1, 'T', $2) returning id`, [`Team ${++n}`, sport]);
  return t.id;
}
async function tournament(city: string | null, deleted = false) {
  const [t] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, city, deleted_at) values ($1, 'Org', $2, $3) returning id`,
    [`Cup ${++n}`, city, deleted ? new Date().toISOString() : null]);
  return t.id;
}
async function match(o: { sport?: string; tournament?: string | null; status?: string; startsInH?: number; completedAgoH?: number; maps?: string; hosts?: string[]; scorers?: string[]; views?: number; idleH?: number }) {
  const sport = o.sport ?? 'football';
  const starts = new Date(Date.now() + (o.startsInH ?? -1) * 3600_000).toISOString();
  const completed = o.completedAgoH != null ? new Date(Date.now() - o.completedAgoH * 3600_000).toISOString() : null;
  const [m] = await db.sql<{ id: string }>(
    `insert into matches (sport, tournament_id, status, starts_at, completed_at, venue_maps_url, home_team_id, away_team_id, host_ids, scorer_ids, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [sport, o.tournament ?? null, o.status ?? 'live', starts, completed, o.maps ?? null, await team(sport), await team(sport), o.hosts ?? [], o.scorers ?? [],
     new Date(Date.now() - (o.idleH ?? 0) * 3600_000).toISOString()]);
  if (o.views) await db.sql(`insert into match_view_counts (match_id, views) values ($1, $2)`, [m.id, o.views]);
  return m.id;
}

describe('cities', () => {
  const search = (q: string) => db.asAnon<{ r: { id: number; name: string; region: string; country: string }[] }>(`select search_cities($1) as r`, [q]).then((x) => x[0].r);
  test('anyone can search; the biggest match comes first, with its state', async () => {
    const r = await search('hyder');
    assert.equal(r[0].name, 'Hyderabad');
    assert.equal(r[0].region, 'Telangana');
  });
  test('old names people still type find the new one', async () => {
    assert.equal((await search('Bangalore'))[0].name, 'Bengaluru');
    assert.equal((await search('gurgaon'))[0].name, 'Gurugram');
  });
  test('repeated town names come back with different states', async () => {
    const r = (await search('Rampur')).filter((c) => c.name === 'Rampur');
    assert.ok(r.length > 1);
    assert.ok(new Set(r.map((c) => c.region)).size > 1);
  });
  test('one letter, or LIKE wildcards, find nothing', async () => {
    assert.deepEqual(await search('h'), []);
    assert.deepEqual(await search('%%'), []);
    assert.deepEqual(await search('_y'), []);
  });
  test('nobody but the migration writes the list', async () => {
    const u = await person('City Vandal');
    assert.ok(await err(() => db.as(u.uid, `update cities set name = 'X' where name = 'Hyderabad'`)) !== null
      || (await db.sql<{ n: number }>(`select count(*)::int as n from cities where name = 'X'`))[0].n === 0);
    assert.ok(await err(() => db.asAnon(`insert into cities (id, name, country, lat, lng) values (1, 'Fake', 'IN', 0, 0)`)));
  });
});

describe('the first-run questions', () => {
  const mine = (uid: string) => db.as<{ r: { done: boolean; skipped: boolean; uses: string[] | null; sports: string[] | null; home_city: { id: number; name: string; lat: number } | null } }>(uid, `select my_personalisation() as r`).then((x) => x[0].r);
  test('a new account has not answered; answering saves uses + home city and marks it done', async () => {
    const u = await person('New Person');
    assert.deepEqual([(await mine(u.uid)).done, (await mine(u.uid)).skipped], [false, false]);
    const hyd = await cityId('Hyderabad');
    await db.as(u.uid, `select save_personalisation($1, $2, $3)`, [['play', 'fan', 'play'], hyd, ['football', 'cricket', 'football']]);
    const r = await mine(u.uid);
    assert.equal(r.done, true);
    assert.deepEqual(r.uses, ['play', 'fan'], 'each once, in order');
    assert.deepEqual(r.sports, ['football', 'cricket']);
    assert.equal(r.home_city?.name, 'Hyderabad');
    assert.ok(Math.abs((r.home_city?.lat ?? 0) - 17.384) < 0.01);
  });
  test('skip is remembered (so it never pops up again) and can still be answered later', async () => {
    const u = await person('In A Hurry');
    await db.as(u.uid, `select skip_personalisation()`);
    assert.equal((await mine(u.uid)).skipped, true);
    await db.as(u.uid, `select save_personalisation($1, null)`, [['score']]);
    assert.equal((await mine(u.uid)).done, true);
  });
  test('only the five uses, a real city, and only for yourself', async () => {
    const u = await person('Odd Answers');
    assert.match(await err(() => db.as(u.uid, `select save_personalisation($1, null)`, [['play', 'hacker']])) ?? '', /use/i);
    assert.match(await err(() => db.as(u.uid, `select save_personalisation($1, $2)`, [['play'], 999999999])) ?? '', /city/i);
    assert.match(await err(() => db.as(u.uid, `select save_personalisation($1, null, $2)`, [['fan'], ['football', "x'; drop table"]])) ?? '', /sport/i);
    assert.ok(await err(() => db.asAnon(`select save_personalisation($1, null)`, [['play']])));
    assert.ok(await err(() => db.asAnon(`select my_personalisation()`)));
  });
});

describe('match views', () => {
  const view = (who: string | null, m: string, device: string | null = null) =>
    (who ? db.as<{ v: number }>(who, `select record_match_view($1, $2) as v`, [m, device]) : db.asAnon<{ v: number }>(`select record_match_view($1, $2) as v`, [m, device])).then((x) => x[0].v);
  test('once per person per day; signed-out visitors once per device', async () => {
    const m = await match({});
    const a = await person('Viewer A'); const b = await person('Viewer B');
    assert.equal(await view(a.uid, m), 1);
    assert.equal(await view(a.uid, m), 1, 'a refresh is not a new view');
    assert.equal(await view(b.uid, m), 2);
    const dev = '6f1c1a52-6a3b-4c2e-9d4e-0a1b2c3d4e5f';
    assert.equal(await view(null, m, dev), 3);
    assert.equal(await view(null, m, dev), 3);
    assert.equal(await view(null, m, null), 3, 'no device id (no analytics consent): not counted');
    assert.equal(await view(null, m, 'not a uuid'), 3);
    // the next day the same person counts again
    await db.sql(`update match_views set day = day - 1 where match_id = $1`, [m]);
    assert.equal(await view(a.uid, m), 4);
  });
  test('the match\'s own scorers and hosts don\'t count', async () => {
    const s = await person('The Scorer'); const h = await person('The Host');
    const m = await match({ scorers: [s.player], hosts: [h.player] });
    assert.equal(await view(s.uid, m), 0);
    assert.equal(await view(h.uid, m), 0);
  });
  test('who viewed is stored only as a hash; the list is private, the count is public', async () => {
    const a = await person('Private Viewer');
    const m = await match({});
    await view(a.uid, m);
    const rows = await db.sql<{ viewer: string }>(`select viewer from match_views where match_id = $1`, [m]);
    assert.equal(rows.length, 1);
    assert.ok(!rows[0].viewer.includes(a.uid) && /^[0-9a-f]{64}$/.test(rows[0].viewer));
    assert.ok(await err(() => db.asAnon(`select * from match_views`)));
    assert.ok(await err(() => db.as(a.uid, `select * from match_views`)));
    assert.equal((await db.asAnon<{ views: number }>(`select views from match_view_counts where match_id = $1`, [m]))[0].views, 1);
    assert.ok(await err(() => db.as(a.uid, `update match_view_counts set views = 99999 where match_id = $1`, [m])) !== null
      || (await db.sql<{ views: number }>(`select views from match_view_counts where match_id = $1`, [m]))[0].views === 1);
  });
  test('limits: a viewer over 300 an hour stops counting; an unknown match is 0', async () => {
    const a = await person('Bot Like');
    await db.sql(`insert into rate_limit_hits (bucket, subject, window_start, hits)
      values ('match_views', $1, to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 300)`, [a.uid]);
    const m = await match({});
    assert.equal(await view(a.uid, m), 0);
    assert.equal(await view(a.uid, '00000000-0000-0000-0000-000000000000'), 0);
  });
  test('old view rows are cleared by a daily job', async () => {
    const [j] = await db.sql<{ command: string }>(`select command from cron.job where jobname = 'match-views-cleanup'`);
    assert.match(j.command, /delete from public\.match_views/);
  });
});

/** A logged-out call from an address (the request headers PostgREST passes). */
const anonFrom = (ip: string, q: string, params: unknown[] = []) => db.pg.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` })]);
  await tx.query('set local role anon');
  return (await tx.query<Record<string, unknown>>(q, params)).rows;
});

describe('break-it fixes', () => {
  test('PH-01: a script sending a new device id each time still counts once per address', async () => {
    const m = await match({});
    let last = 0;
    for (let i = 0; i < 5; i++) {
      const [r] = await anonFrom('198.51.100.9', `select record_match_view($1, gen_random_uuid()::text) as v`, [m]);
      last = r.v as number;
    }
    assert.equal(last, 1);
    const [other] = await anonFrom('198.51.100.10', `select record_match_view($1, gen_random_uuid()::text) as v`, [m]);
    assert.equal(other.v, 2, 'another address counts');
  });
  test('PH-06: nobody else can read a person\'s answers', async () => {
    const a = await person('Answers Owner');
    await db.as(a.uid, `select save_personalisation($1, $2, $3)`, [['parent'], await cityId('Hyderabad'), ['football']]);
    const b = await person('Nosy Neighbour');
    for (const col of ['home_city_id', 'uses', 'interest_sports', 'personalised_at']) {
      assert.ok(await err(() => db.as(b.uid, `select ${col} from profiles where id = $1`, [a.uid])), col);
      assert.ok(await err(() => db.asAnon(`select ${col} from profiles where id = $1`, [a.uid])), col);
    }
  });
});

describe('near_matches', () => {
  type Row = { id: string; sport: string; distance_km: number | null; views: number };
  type Near = { basis: string; radius_km: number | null; all_sports: boolean; city: { name: string } | null; live: Row[]; soon: Row[]; recent: Row[] };
  const near = (o: { sports?: string[] | null; lat?: number | null; lng?: number | null; city?: number | null; limit?: number }) =>
    db.asAnon<{ r: Near }>(`select near_matches($1, $2, $3, $4, $5) as r`, [o.sports ?? null, o.lat ?? null, o.lng ?? null, o.city ?? null, o.limit ?? 10]).then((x) => x[0].r);
  const ids = (rows: Row[]) => rows.map((r) => r.id);
  const M: Record<string, string> = {};
  before(async () => {
    // Clean slate for this block: everything else in this file is in other cities' matches too.
    await db.sql(`update matches set status = 'cancelled'`);
    const hyd = await tournament('Hyderabad');
    const hydState = await tournament('Hyderabad, Telangana');
    const mum = await tournament('Mumbai');
    const gone = await tournament('Hyderabad', true);
    const adultHost = await person('Adult Host', '1985-05-05', 'Secunderabad');
    const kidHost = await person('Kid Host', '2014-05-05', 'Secunderabad');
    M.pinned = await match({ tournament: hyd, maps: 'https://www.google.com/maps/place/Gachibowli+Stadium/@17.4401,78.3489,17z', views: 5 });
    M.cityCentre = await match({ tournament: hydState, views: 50 });
    M.cricket = await match({ sport: 'cricket', tournament: hyd, views: 500 });
    M.mumbai = await match({ tournament: mum, views: 900 });
    M.friendly = await match({ hosts: [adultHost.player], views: 1 });
    M.kidFriendly = await match({ hosts: [kidHost.player], views: 1 });
    M.deleted = await match({ tournament: gone, views: 999 });
    M.soon = await match({ tournament: hyd, status: 'scheduled', startsInH: 3 });
    M.later = await match({ tournament: hyd, status: 'scheduled', startsInH: 72 });
    M.finished = await match({ tournament: hyd, status: 'completed', completedAgoH: 20, views: 80 });
    M.old = await match({ tournament: hyd, status: 'completed', completedAgoH: 24 * 5, views: 800 });
    M.qPin = await match({ tournament: mum, maps: 'https://maps.google.com/?q=17.4500,78.3600', views: 2 });
  });
  test('with location: nearest live first, their sport only, nothing far, deleted or unplaceable', async () => {
    const r = await near({ sports: ['football'], lat: 17.4401, lng: 78.3489 });
    assert.equal(r.basis, 'near');
    assert.equal(r.radius_km, 50);
    assert.deepEqual(ids(r.live), [M.pinned, M.qPin, M.cityCentre, M.friendly]);
    assert.ok(r.live[0].distance_km! < 1 && r.live[2].distance_km! > 5);
    assert.deepEqual(ids(r.soon), [M.soon]);
    assert.deepEqual(ids(r.recent), [M.finished]);
    assert.equal(r.all_sports, false);
  });
  test('a pin in the Maps link beats the tournament\'s city', async () => {
    const r = await near({ sports: ['football'], lat: 19.076, lng: 72.877 }); // Mumbai
    assert.ok(ids(r.live).includes(M.mumbai));
    assert.ok(!ids(r.live).includes(M.qPin), 'its pin is in Hyderabad, though its tournament says Mumbai');
  });
  test('without location: their city, most viewed first', async () => {
    const r = await near({ sports: ['football'], city: await cityId('Hyderabad') });
    assert.equal(r.basis, 'city');
    assert.equal(r.city?.name, 'Hyderabad');
    assert.deepEqual(ids(r.live), [M.cityCentre, M.pinned, M.qPin, M.friendly]);
    assert.deepEqual(r.live.map((x) => x.views), [50, 5, 2, 1]);
  });
  test('nothing within 50 km: widens to 150 km', async () => {
    const r = await near({ sports: ['football'], lat: 18.2, lng: 78.9 }); // ~100 km north-east
    assert.equal(r.radius_km, 150);
    assert.ok(r.live.length >= 3);
  });
  test('nothing in their sports nearby: all sports, flagged', async () => {
    const r = await near({ sports: ['tennis'], lat: 17.4401, lng: 78.3489 });
    assert.equal(r.all_sports, true);
    assert.ok(ids(r.live).includes(M.cricket));
  });
  test('nothing anywhere near, and no location or city at all', async () => {
    const far = await near({ sports: ['football'], lat: -33.87, lng: 151.21 }); // Sydney
    assert.deepEqual([far.live.length, far.soon.length, far.recent.length], [0, 0, 0]);
    assert.equal((await near({ sports: ['football'] })).basis, 'none');
    const bad = await near({ sports: ['football'], lat: 200, lng: 78, city: await cityId('Hyderabad') });
    assert.equal(bad.basis, 'city', 'an impossible location is ignored');
  });
  test('at most 20 per list; read-only (works in a read-only transaction, like a GET)', async () => {
    const r = await near({ sports: null, lat: 17.4401, lng: 78.3489, limit: 1000 });
    assert.ok(r.live.length <= 20);
    await db.pg.transaction(async (tx) => {
      await tx.query(`set transaction read only`);
      await tx.query(`select near_matches(array['football'], 17.44, 78.35, null, 10)`);
    });
  });
});

describe('places from people, and old "live" matches (founder 2026-10-31: his own live match was missing)', () => {
  type Row = { id: string };
  type Near = { live: Row[] };
  const near = (city: string) => cityId(city).then((c) => db.asAnon<{ r: Near }>(`select near_matches(array['football'], null, null, $1, 20) as r`, [c]))
    .then((x) => x[0].r.live.map((m) => m.id));
  const answered = async (name: string, city: string, dob = '1990-01-01', playerCity?: string) => {
    const u = await person(name, dob, playerCity);
    await db.as(u.uid, `select save_personalisation($1, $2, $3)`, [['score'], await cityId(city), ['football']]);
    return u;
  };
  before(async () => { await db.sql(`update matches set status = 'cancelled'`); });

  test('a match in a tournament with no city is placed at its scorer\'s home city (their answer)', async () => {
    const s = await answered('Pune Scorer', 'Pune');
    const m = await match({ tournament: await tournament(null), scorers: [s.player] });
    assert.ok((await near('Pune')).includes(m));
  });
  test('a host\'s answer to "Where are you based?" beats their profile\'s old city', async () => {
    const h = await answered('Moved Host', 'Bengaluru', '1988-02-02', 'Chennai');
    const m = await match({ hosts: [h.player] });
    assert.ok((await near('Bengaluru')).includes(m));
    assert.ok(!(await near('Chennai')).includes(m));
  });
  test('a child\'s home city never places a match', async () => {
    const kid = await answered('Kid Scorer', 'Jaipur', '2013-03-03');
    const m = await match({ scorers: [kid.player] });
    assert.ok(!(await near('Jaipur')).includes(m));
  });
  test('last resort: the tournament organiser\'s home city', async () => {
    const org = await answered('Kochi Organiser', 'Kochi');
    const [t] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, organizer_id) values ('No City Cup', 'Org', $1) returning id`, [org.uid]);
    const m = await match({ tournament: t.id });
    assert.ok((await near('Kochi')).includes(m));
  });
  test('a "live" match nobody has touched for 12 hours isn\'t live near you; scoring keeps it there', async () => {
    const pin = 'https://maps.google.com/?q=26.9124,75.7873'; // Jaipur
    const old = await match({ maps: pin, idleH: 20 });
    const busy = await match({ maps: pin, idleH: 20 });
    await db.sql(`insert into match_events (match_id, seq, type, payload) values ($1, 1, 'note', '{}')`, [busy]).catch(async () => {
      await db.sql(`insert into match_events (match_id, type) values ($1, 'note')`, [busy]);
    });
    const ids = await near('Jaipur');
    assert.ok(!ids.includes(old), 'idle since yesterday');
    assert.ok(ids.includes(busy), 'scored a moment ago');
  });
});
