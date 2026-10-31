-- ============================================================================
--  Personalised Home (founder 2026-10-31)
--  On first sign-in we ask a few skippable questions: how they'll use the app,
--  their sports (with position and handedness, saved to their player profile
--  by the app) and the city they're based in. Home then shows matches near
--  them: live first, nearest (with location) or most viewed in their city
--  (without); if nothing is live, matches starting soon and just finished.
--
--  1. profiles: personalised_at, personalise_skipped_at, uses, home_city_id
--     + my_personalisation / save_personalisation / skip_personalisation
--  2. search_cities, and helpers that place a match on the map
--  3. match views: one per person or device per match per day, hashed
--  4. near_matches (read-only)
--
--  Run 20261031110000_cities.sql first (from the terminal: it's big). This file
--  is small enough for the SQL Editor. Safe to run again.
--  A person's location is never stored: the app sends it rounded to ~1 km and
--  near_matches only sorts with it.
-- ============================================================================

-- The city list's table (same as 20261031110000_cities.sql, without the rows),
-- so this file works whichever runs first.
create table if not exists cities (
  id integer primary key,
  name text not null,
  region text,
  country text not null check (country ~ '^[A-Z]{2}$'),
  lat real not null check (lat between -90 and 90),
  lng real not null check (lng between -180 and 180),
  population integer not null default 0,
  aka text
);
create index if not exists cities_name_lower on cities (lower(name) text_pattern_ops);
alter table cities enable row level security;
drop policy if exists "read cities" on cities;
create policy "read cities" on cities for select using (true);
revoke insert, update, delete, truncate on cities from anon, authenticated;
grant select on cities to anon, authenticated;


-- ---------- 1. The first-run answers ------------------------------------------

alter table profiles add column if not exists personalised_at timestamptz;
alter table profiles add column if not exists personalise_skipped_at timestamptz;
alter table profiles add column if not exists uses text[];
alter table profiles add column if not exists home_city_id integer references cities(id) on delete set null;
-- the sports they picked (played or followed): what "Near you" shows first
alter table profiles add column if not exists interest_sports text[];
alter table profiles drop constraint if exists profiles_uses_check;
alter table profiles add constraint profiles_uses_check
  check (uses is null or uses <@ array['play', 'organise', 'score', 'parent', 'fan']::text[]);

create or replace function my_personalisation()
  returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'done', p.personalised_at is not null,
    'skipped', p.personalise_skipped_at is not null,
    'uses', to_jsonb(p.uses),
    'sports', to_jsonb(p.interest_sports),
    'home_city', (select jsonb_build_object('id', c.id, 'name', c.name, 'region', c.region, 'country', c.country, 'lat', c.lat, 'lng', c.lng)
                  from cities c where c.id = p.home_city_id))
  from profiles p where p.id = auth.uid();
$$;
revoke all on function my_personalisation() from public, anon;
grant execute on function my_personalisation() to authenticated;

drop function if exists save_personalisation(text[], integer);
create or replace function save_personalisation(p_uses text[], p_home_city integer, p_sports text[] default null)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if p_uses is not null and not (p_uses <@ array['play', 'organise', 'score', 'parent', 'fan']::text[]) then
    raise exception 'Unknown use: choose from play, organise, score, parent or fan.' using errcode = '22023';
  end if;
  if p_home_city is not null and not exists (select 1 from cities where id = p_home_city) then
    raise exception 'That city isn''t in our list: pick one from the search.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_sports, 1), 0) > 40 or exists (select 1 from unnest(p_sports) s where s !~ '^[a-z_]{2,30}$') then
    raise exception 'Unknown sport in the list.' using errcode = '22023';
  end if;
  update profiles set
    -- each use once, in the order given
    uses = (select array_agg(u order by i) from (select u, min(i) as i from unnest(p_uses) with ordinality x(u, i) group by u) d),
    home_city_id = p_home_city,
    interest_sports = (select array_agg(x order by i) from (select x, min(i) as i from unnest(p_sports) with ordinality y(x, i) group by x) d),
    personalised_at = now()
  where id = auth.uid();
end $$;
revoke all on function save_personalisation(text[], integer, text[]) from public, anon;
grant execute on function save_personalisation(text[], integer, text[]) to authenticated;

-- "Skip" is remembered so the questions never pop up again (Home keeps a small
-- "finish setting up" card instead).
create or replace function skip_personalisation()
  returns void language sql security definer set search_path = public as $$
  update profiles set personalise_skipped_at = coalesce(personalise_skipped_at, now()) where id = auth.uid();
$$;
revoke all on function skip_personalisation() from public, anon;
grant execute on function skip_personalisation() to authenticated;


-- ---------- 2. Cities and where a match is -------------------------------------

-- Town search: names and the old names people still type, biggest first. Two
-- letters minimum; LIKE wildcards in the query find nothing.
create or replace function search_cities(p_q text, p_limit integer default 8)
  returns jsonb language sql stable security invoker set search_path = public as $$
  with q as (select lower(trim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g'))) as s),
  hits as (
    select c.id, c.name, c.region, c.country, c.lat, c.lng, c.population,
           (lower(c.name) = q.s or ('|' || lower(coalesce(c.aka, '')) || '|') like '%|' || q.s || '|%') as exact
    from cities c, q
    where length(q.s) >= 2 and q.s !~ '[%_\\]'
      and (lower(c.name) like q.s || '%' or lower(coalesce(c.aka, '')) like '%' || q.s || '%')
    order by exact desc, c.population desc
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'region', h.region, 'country', h.country,
                                               'lat', h.lat, 'lng', h.lng) order by h.exact desc, h.population desc), '[]'::jsonb)
  from hits h;
$$;
revoke all on function search_cities(text, integer) from public;
grant execute on function search_cities(text, integer) to anon, authenticated;

-- The city a typed place names ("Hyderabad", "Hyderabad, Telangana",
-- "bangalore"): its first part, by name or old name, the biggest if repeated.
create or replace function city_for_text(p_text text)
  returns integer language plpgsql stable set search_path = public as $$
declare
  k text := lower(trim(regexp_replace(split_part(coalesce(p_text, ''), ',', 1), '\s+', ' ', 'g')));
  r integer;
begin
  if length(k) < 2 or k ~ '[%_\\]' then return null; end if;
  -- PH-08: the name itself first (indexed), then the old names people still type
  select c.id into r from cities c where lower(c.name) = k order by c.population desc limit 1;
  if r is null then
    select c.id into r from cities c
    where c.aka is not null and ('|' || lower(c.aka) || '|') like '%|' || k || '|%'
    order by c.population desc limit 1;
  end if;
  return r;
end $$;
revoke all on function city_for_text(text) from public, anon, authenticated;

-- A pin in a Google Maps link: the place itself (!3d…!4d…), a ?q=/ll= point,
-- or the map's centre (@lat,lng). Null when there's none.
create or replace function maps_pin(p_url text)
  returns double precision[] language plpgsql immutable set search_path = public as $$
declare
  m text[];
  la double precision;
  lo double precision;
begin
  if p_url is null then return null; end if;
  m := regexp_match(p_url, '!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)');
  if m is null then
    m := regexp_match(p_url, '[?&](?:q|query|ll|destination|daddr|center)=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)\s*(-?\d{1,3}(?:\.\d+)?)', 'i');
  end if;
  if m is null then m := regexp_match(p_url, '@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)'); end if;
  if m is null then return null; end if;
  la := m[1]::double precision;
  lo := m[2]::double precision;
  if la between -90 and 90 and lo between -180 and 180 and not (la = 0 and lo = 0) then return array[la, lo]; end if;
  return null;
end $$;
revoke all on function maps_pin(text) from public, anon, authenticated;


-- ---------- 3. Match views ----------------------------------------------------

-- Who viewed: a hash of (account or device id, match), one row per day. Private.
create table if not exists match_views (
  match_id uuid not null references matches(id) on delete cascade,
  viewer text not null,
  day date not null default current_date,
  primary key (match_id, viewer, day)
);
alter table match_views enable row level security;
revoke all on match_views from anon, authenticated;

-- How many: public, written only by record_match_view.
create table if not exists match_view_counts (
  match_id uuid primary key references matches(id) on delete cascade,
  views integer not null default 0
);
alter table match_view_counts enable row level security;
drop policy if exists "read match views" on match_view_counts;
create policy "read match views" on match_view_counts for select using (true);
revoke insert, update, delete, truncate on match_view_counts from anon, authenticated;
grant select on match_view_counts to anon, authenticated;

-- One view per person (signed in) or address (signed out, analytics allowed) per
-- match per day. The match's own scorers and hosts don't count. Returns the
-- match's view count. A separate table, so a view never touches the matches
-- row (which would wake every live scoring screen).
create or replace function record_match_view(p_match uuid, p_device text default null)
  returns integer language plpgsql security definer set search_path = public as $$
declare
  m record;
  subject text;
  n integer;
begin
  select id, scorer_id, scorer_ids, host_ids into m from matches where id = p_match;
  if not found then return 0; end if;
  n := coalesce((select views from match_view_counts where match_id = p_match), 0);
  if auth.uid() is not null then
    subject := auth.uid()::text;
    if exists (select 1 from players p where p.profile_id = auth.uid()
               and (p.id = m.scorer_id or p.id = any(coalesce(m.scorer_ids, '{}')) or p.id = any(coalesce(m.host_ids, '{}')))) then
      return n;
    end if;
  elsif p_device ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    -- PH-01: the device id is the caller's own say-so, so a signed-out view
    -- counts once per internet address (a script can't mint new ids for views);
    -- the id itself only shows analytics consent. No address: the device.
    subject := coalesce('ip:' || request_ip(), 'd:' || lower(p_device));
  else
    return n;
  end if;
  if not rate_limit_hit('match_views', subject, 300, 3600) then return n; end if;
  if not anon_rate_ok('match_views', 600, 20000) then return n; end if;
  insert into match_views (match_id, viewer, day)
    values (p_match, encode(sha256(convert_to(subject || ':' || p_match::text, 'UTF8')), 'hex'), current_date)
    on conflict do nothing;
  if not found then return n; end if;
  insert into match_view_counts as c (match_id, views) values (p_match, 1)
    on conflict (match_id) do update set views = c.views + 1
    returning views into n;
  return n;
end $$;
revoke all on function record_match_view(uuid, text) from public;
grant execute on function record_match_view(uuid, text) to anon, authenticated;

-- Only today's and yesterday's rows matter (one view per day); clear the rest.
select cron.unschedule('match-views-cleanup') where exists (select 1 from cron.job where jobname = 'match-views-cleanup');
select cron.schedule('match-views-cleanup', '17 4 * * *', $$ delete from public.match_views where day < current_date - 2 $$);


-- ---------- 4. Matches near a point or a city -----------------------------------

-- One candidate match, placed and measured once per request (PH-08).
do $$ begin
  create type near_match_row as (id uuid, sport text, status text, starts_at timestamptz, done_at timestamptz,
                                 views integer, dist double precision, mine boolean, js jsonb);
exception when duplicate_object then null; end $$;

-- Live (nearest first with a location; most viewed first in a city), starting
-- in the next 24 hours (soonest first) and finished in the last 2 days (most
-- viewed first). Within 50 km of the point or the city's centre, then 150 km;
-- their sports first, then all sports (all_sports = true). A match is placed
-- by its Maps pin, else its tournament's city, else (friendlies) the city of
-- an adult host. Deleted tournaments' matches and matches that can't be placed
-- are left out. p_lat/p_lng are rounded to ~1 km here too and never stored.
-- PH-08: candidates are placed once (each distinct city name looked up once);
-- the four steps then only filter that list.
create or replace function near_matches(p_sports text[] default null, p_lat double precision default null,
                                        p_lng double precision default null, p_city integer default null,
                                        p_limit integer default 10)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_basis text;
  v_city jsonb;
  v_lim integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_rows near_match_row[];
  step record;
  res jsonb;
begin
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_lat := round(p_lat::numeric, 2);
    v_lng := round(p_lng::numeric, 2);
    v_basis := 'near';
  elsif p_city is not null then
    select c.lat, c.lng, jsonb_build_object('id', c.id, 'name', c.name, 'region', c.region, 'country', c.country)
      into v_lat, v_lng, v_city
      from cities c where c.id = p_city;
    if found then v_basis := 'city'; end if;
  end if;
  if v_basis is null then
    return jsonb_build_object('basis', 'none', 'radius_km', null, 'all_sports', false, 'city', null,
                              'live', '[]'::jsonb, 'soon', '[]'::jsonb, 'recent', '[]'::jsonb);
  end if;

  with cand as (
    select m.id, m.tournament_id, m.group_label, m.stage, m.byes, m.sport, m.status, m.starts_at, m.completed_at,
           m.venue_id, m.venue_name, m.venue_maps_url, m.stream_url, m.winner, m.host_ids, m.logo_url,
           m.scorer_id, m.scorer_ids, m.format, m.state, m.result, m.home_team_id, m.away_team_id,
           t.city as t_city, maps_pin(m.venue_maps_url) as pin
    from matches m
    left join tournaments t on t.id = m.tournament_id
    where (m.tournament_id is null or t.deleted_at is null)
      and (m.status = 'live'
        or (m.status = 'scheduled' and m.starts_at between now() - interval '30 minutes' and now() + interval '24 hours')
        or (m.status = 'completed' and coalesce(m.completed_at, m.starts_at) > now() - interval '2 days'))
  ),
  -- friendlies without a pin: their first adult host's city (a child's city is private)
  host_txt as (
    select c.id, (select p.city from players p
                  where p.id = any(coalesce(c.host_ids, '{}')) and p.city is not null
                    and p.dob is not null and p.dob <= current_date - interval '18 years'
                  order by array_position(c.host_ids, p.id) limit 1) as h_city
    from cand c where c.pin is null and c.tournament_id is null
  ),
  texts as (
    select t_city as txt from cand where pin is null and t_city is not null
    union
    select h_city from host_txt where h_city is not null
  ),
  resolved as (select x.txt, ci.lat, ci.lng from texts x join cities ci on ci.id = city_for_text(x.txt)),
  placed as (
    select c.*, coalesce(c.pin[1], tr.lat, hr.lat) as plat, coalesce(c.pin[2], tr.lng, hr.lng) as plng
    from cand c
    left join resolved tr on c.pin is null and tr.txt = c.t_city
    left join host_txt h on h.id = c.id
    left join resolved hr on c.pin is null and c.tournament_id is null and hr.txt = h.h_city
  ),
  near as (
    select p.*, coalesce(v.views, 0) as views,
      6371 * 2 * asin(sqrt(power(sin(radians(p.plat - v_lat) / 2), 2)
        + cos(radians(v_lat)) * cos(radians(p.plat)) * power(sin(radians(p.plng - v_lng) / 2), 2))) as dist
    from placed p
    left join match_view_counts v on v.match_id = p.id
    where p.plat is not null
  )
  select coalesce(array_agg(row(
      n.id, n.sport, n.status, n.starts_at, coalesce(n.completed_at, n.starts_at), n.views, n.dist,
      (p_sports is null or n.sport = any(p_sports)),
      jsonb_build_object(
        'id', n.id, 'tournament_id', n.tournament_id, 'group_label', n.group_label, 'stage', n.stage, 'byes', n.byes,
        'sport', n.sport, 'status', n.status, 'starts_at', n.starts_at, 'completed_at', n.completed_at,
        'venue_id', n.venue_id, 'venue_name', n.venue_name, 'venue_maps_url', n.venue_maps_url, 'stream_url', n.stream_url,
        'winner', n.winner, 'host_ids', n.host_ids, 'logo_url', n.logo_url, 'scorer_id', n.scorer_id, 'scorer_ids', n.scorer_ids,
        'format', n.format, 'state', n.state, 'result', n.result, 'views', n.views, 'distance_km', round(n.dist::numeric, 1),
        'home_team', case when ht.id is null then null else jsonb_build_object('id', ht.id, 'name', ht.name, 'short_name', ht.short_name,
          'sport', ht.sport, 'color_hex', ht.color_hex, 'level', ht.level, 'entry_ids', ht.entry_ids) end,
        'away_team', case when at.id is null then null else jsonb_build_object('id', at.id, 'name', at.name, 'short_name', at.short_name,
          'sport', at.sport, 'color_hex', at.color_hex, 'level', at.level, 'entry_ids', at.entry_ids) end)
    )::near_match_row), '{}')
    into v_rows
  from near n
  left join teams ht on ht.id = n.home_team_id
  left join teams at on at.id = n.away_team_id
  where n.dist <= 150;

  for step in select * from (values (1, 50, false), (2, 150, false), (3, 50, true), (4, 150, true)) s(i, radius, all_sports) order by i loop
    if step.all_sports and p_sports is null then continue; end if;
    select jsonb_build_object(
      'live', coalesce((select jsonb_agg(r.js order by case when v_basis = 'near' then r.dist end, r.views desc, r.dist)
                        from (select * from unnest(v_rows) u
                              where u.status = 'live' and u.dist <= step.radius and (step.all_sports or u.mine)
                              order by case when v_basis = 'near' then u.dist end, u.views desc, u.dist limit v_lim) r), '[]'::jsonb),
      'soon', coalesce((select jsonb_agg(r.js order by r.starts_at, r.dist)
                        from (select * from unnest(v_rows) u
                              where u.status = 'scheduled' and u.dist <= step.radius and (step.all_sports or u.mine)
                              order by u.starts_at, u.dist limit v_lim) r), '[]'::jsonb),
      'recent', coalesce((select jsonb_agg(r.js order by r.views desc, r.done_at desc)
                          from (select * from unnest(v_rows) u
                                where u.status = 'completed' and u.dist <= step.radius and (step.all_sports or u.mine)
                                order by u.views desc, u.done_at desc limit v_lim) r), '[]'::jsonb)
    ) into res;

    if jsonb_array_length(res->'live') + jsonb_array_length(res->'soon') + jsonb_array_length(res->'recent') > 0
       or step.i = 4 or (step.i = 2 and p_sports is null) then
      return res || jsonb_build_object('basis', v_basis, 'radius_km', step.radius,
        'all_sports', step.all_sports and p_sports is not null, 'city', v_city);
    end if;
  end loop;
  return null; -- not reached
end $$;
revoke all on function near_matches(text[], double precision, double precision, integer, integer) from public;
grant execute on function near_matches(text[], double precision, double precision, integer, integer) to anon, authenticated;

-- ============================================================================
--  End. Then publish the app (the questions, "Near you" on Home, view counts).
-- ============================================================================
