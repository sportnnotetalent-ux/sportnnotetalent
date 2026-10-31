/**
 * Personalised Home — 500 users (quality mandate step 6). 600 matches across 12
 * Indian cities (pins, tournament cities, adult and child hosts' friendlies,
 * deleted tournaments, every status), then 500 people each answer the
 * questions (some skip), view random matches (signed in, signed out from
 * shared addresses, their own as scorers) and ask for "Near you", with and
 * without location. Every rule is checked against a plain recomputation:
 * one view per person/address per match per day, scorers never count,
 * near-you lists only nearby, placeable, non-deleted matches in the right
 * order, their sports first, and (PH-08) the requests stay quick. Since
 * 20261031130000 an unplaced match takes its adult scorer's home city.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb(); });

let seed = 20261031;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const SPORTS = ['football', 'cricket', 'badminton', 'kabaddi', 'basketball', 'tennis'] as const;
const CITIES = ['Hyderabad', 'Bengaluru', 'Mumbai', 'Chennai', 'Pune', 'Delhi', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kochi', 'Visakhapatnam'];
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

test('500 users: views and Near you hold for everyone, quickly', { timeout: 900_000 }, async () => {
  const centre = new Map((await db.sql<{ name: string; id: number; lat: number; lng: number }>(
    `select distinct on (name) name, id, lat, lng from cities where name = any($1) and country = 'IN' order by name, population desc`, [CITIES])).map((c) => [c.name, c]));
  assert.equal(centre.size, CITIES.length);

  // --- 600 matches -----------------------------------------------------------------
  const adultHosts: Record<string, string> = {}; const kidHosts: Record<string, string> = {};
  for (const c of CITIES) {
    const [a] = await db.sql<{ id: string }>(`insert into players (full_name, dob, city) values ($1, '1985-01-01', $2) returning id`, [`Host ${c}`, c]);
    const [k] = await db.sql<{ id: string }>(`insert into players (full_name, dob, city) values ($1, '2013-01-01', $2) returning id`, [`Kid ${c}`, c]);
    adultHosts[c] = a.id; kidHosts[c] = k.id;
  }
  const tours: Record<string, string> = {}; const deletedTours: Record<string, string> = {};
  for (const c of CITIES) {
    tours[c] = (await db.sql<{ id: string }>(`insert into tournaments (name, host_name, city) values ($1, 'Org', $2) returning id`, [`${c} Cup`, `${c}, India`]))[0].id;
    deletedTours[c] = (await db.sql<{ id: string }>(`insert into tournaments (name, host_name, city, deleted_at) values ($1, 'Org', $2, now()) returning id`, [`${c} Gone`, c]))[0].id;
  }
  const [t1] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('A', 'A', 'football') returning id`);
  const [t2] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('B', 'B', 'football') returning id`);
  type M = { id: string; sport: string; status: string; place: { lat: number; lng: number } | null; deleted: boolean; startsH: number; doneH: number | null };
  const matches: M[] = [];
  const scorerOf = new Map<string, string>();
  const rows: unknown[][] = [];
  for (let i = 0; i < 600; i++) {
    const city = pick(CITIES); const c = centre.get(city)!;
    const sport = pick(SPORTS);
    const kind = pick(['pin', 'pin', 'tour', 'tour', 'adultFriendly', 'kidFriendly', 'deleted'] as const);
    const status = pick(['live', 'live', 'scheduled', 'completed', 'cancelled'] as const);
    const startsH = status === 'scheduled' ? pick([2, 5, 20, 40]) : -1;
    const doneH = status === 'completed' ? pick([5, 30, 70]) : null;
    const pin = kind === 'pin' ? { lat: +(c.lat + (rnd() - 0.5) * 0.3).toFixed(4), lng: +(c.lng + (rnd() - 0.5) * 0.3).toFixed(4) } : null;
    const place = kind === 'kidFriendly' || kind === 'deleted' ? null : pin ?? { lat: c.lat, lng: c.lng };
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    matches.push({ id, sport, status, place, deleted: kind === 'deleted', startsH, doneH });
    rows.push([id, sport, kind === 'tour' || kind === 'pin' ? tours[city] : kind === 'deleted' ? deletedTours[city] : null, status,
      new Date(Date.now() + startsH * 3600_000).toISOString(), doneH != null ? new Date(Date.now() - doneH * 3600_000).toISOString() : null,
      pin ? `https://www.google.com/maps/@${pin.lat},${pin.lng},16z` : null,
      kind === 'adultFriendly' ? [adultHosts[city]] : kind === 'kidFriendly' ? [kidHosts[city]] : []]);
  }
  for (const r of rows) {
    await db.sql(`insert into matches (id, sport, tournament_id, status, starts_at, completed_at, venue_maps_url, host_ids, home_team_id, away_team_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, '${t1.id}', '${t2.id}')`, r);
  }

  // --- 500 people ------------------------------------------------------------------
  const truthViews = new Map<string, Set<string>>();
  let slowest = 0; let total = 0; let checked = 0;
  for (let u = 0; u < 500; u++) {
    const city = pick(CITIES); const c = centre.get(city)!;
    const uid = await db.signUp({ name: `User ${u}`, dob: '1995-01-01' });
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1995-01-01') returning id`, [`User ${u}`, uid]);
    const sports = [pick(SPORTS), pick(SPORTS)].filter((s, i, a) => a.indexOf(s) === i);
    const skipped = chance(0.15);
    if (skipped) await db.as(uid, `select skip_personalisation()`);
    else await db.as(uid, `select save_personalisation($1, $2, $3)`, [['play'], c.id, sports]);

    // a scorer of one match, who opens it: never counted
    const own = pick(matches);
    if (!scorerOf.has(own.id)) {
      await db.sql(`update matches set scorer_ids = array_append(coalesce(scorer_ids, '{}'), $2::uuid) where id = $1`, [own.id, p.id]);
      scorerOf.set(own.id, p.id);
      // 20261031130000: an unplaced match is placed at its (adult) scorer's home city
      if (!own.place && !own.deleted && !skipped) own.place = { lat: c.lat, lng: c.lng };
      await db.as(uid, `select record_match_view($1, null)`, [own.id]);
    }
    for (let v = 0; v < 3; v++) {
      const m = pick(matches);
      if (scorerOf.get(m.id) === p.id) continue;
      await db.as(uid, `select record_match_view($1, null)`, [m.id]);
      if (!truthViews.has(m.id)) truthViews.set(m.id, new Set());
      truthViews.get(m.id)!.add(`u:${uid}`);
    }

    // Near you: half with a location around their city, half by city only
    const at = chance(0.5) ? { lat: +(c.lat + (rnd() - 0.5) * 0.2).toFixed(2), lng: +(c.lng + (rnd() - 0.5) * 0.2).toFixed(2) } : null;
    const t0 = performance.now();
    const [{ r }] = await db.as<{ r: { basis: string; radius_km: number; all_sports: boolean; live: { id: string; distance_km: number; views: number; sport: string }[]; soon: { id: string; starts_at: string }[]; recent: { id: string }[] } }>(uid,
      `select near_matches($1, $2, $3, $4, 10) as r`, [sports, at?.lat ?? null, at?.lng ?? null, c.id]);
    const ms = performance.now() - t0;
    slowest = Math.max(slowest, ms); total += ms;

    // --- check this answer against a recomputation ---
    const point = at ?? c;
    const byId = new Map(matches.map((m) => [m.id, m]));
    for (const row of [...r.live, ...r.soon, ...r.recent]) {
      const m = byId.get(row.id)!;
      assert.ok(m.place, `unplaceable match ${m.id} listed`);
      assert.ok(!m.deleted, 'deleted tournament listed');
      assert.ok(km(point, m.place) <= r.radius_km + 0.5, `match ${km(point, m.place).toFixed(1)} km away, radius ${r.radius_km}`);
      if (!r.all_sports) assert.ok(sports.includes(m.sport as typeof sports[number]), 'other sport without all_sports');
    }
    for (const row of r.live) assert.equal(byId.get(row.id)!.status, 'live');
    for (let i = 1; i < r.live.length; i++) {
      if (r.basis === 'near') assert.ok(r.live[i - 1].distance_km <= r.live[i].distance_km, 'nearest first');
      else assert.ok(r.live[i - 1].views >= r.live[i].views, 'most viewed first');
    }
    for (let i = 1; i < r.soon.length; i++) assert.ok(Date.parse(r.soon[i - 1].starts_at) <= Date.parse(r.soon[i].starts_at), 'soonest first');
    // nothing live nearby in their sports was left out (within the radius used)
    if (!r.all_sports && r.live.length < 10) {
      const want = matches.filter((m) => m.status === 'live' && m.place && !m.deleted && sports.includes(m.sport as typeof sports[number])
        && km(point, m.place) <= r.radius_km - 0.5);
      for (const m of want) assert.ok(r.live.some((x) => x.id === m.id), `missed live match ${km(point, m.place!).toFixed(1)} km away`);
      checked++;
    }
  }

  // --- signed-out visitors from 20 shared addresses, each with fresh device ids ---
  const addrViews = new Map<string, Set<string>>();
  for (let i = 0; i < 400; i++) {
    const ip = `203.0.113.${1 + (i % 20)}`; const m = pick(matches);
    await db.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': ip })]);
      await tx.query('set local role anon');
      await tx.query(`select record_match_view($1, gen_random_uuid()::text)`, [m.id]);
    });
    if (!addrViews.has(m.id)) addrViews.set(m.id, new Set());
    addrViews.get(m.id)!.add(ip);
  }

  const counts = new Map((await db.sql<{ match_id: string; views: number }>(`select match_id, views from match_view_counts`)).map((x) => [x.match_id, x.views]));
  for (const m of matches) {
    const want = (truthViews.get(m.id)?.size ?? 0) + (addrViews.get(m.id)?.size ?? 0);
    assert.equal(counts.get(m.id) ?? 0, want, `views of ${m.id}`);
  }
  const [{ n }] = await db.sql<{ n: number }>(`select count(*)::int as n from match_views where viewer ~ '-'`);
  assert.equal(n, 0, 'only hashes are stored');
  assert.ok(checked > 100, `${checked} answers checked for completeness`);
  // PH-08: quick enough (PGlite in one process is far slower than the real database)
  console.log(`near_matches: avg ${(total / 500).toFixed(0)} ms, slowest ${slowest.toFixed(0)} ms`);
  assert.ok(total / 500 < 150, `average ${(total / 500).toFixed(0)} ms`);
});
