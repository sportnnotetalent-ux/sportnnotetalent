-- ============================================================================
--  Near you: place more matches, and skip abandoned "live" ones
--  (founder 2026-10-31: his own live match in a tournament with no city was
--  missing from "Live near you", while two test matches left "live" since
--  August/September would have shown).
--  1. A match with no Maps pin and no tournament city is placed at the home
--     city of the people running it: the match's hosts, its scorers, then the
--     tournament's hosts (their answer to "Where are you based?", else their
--     profile's city), then the tournament organiser's answer. Adults only.
--  2. A "live" match with no change and no scoring for 12 hours isn't live near
--     you.
--  near_matches recreated from its latest body (20261031120000). Safe to run
--  again. Run in the SQL Editor; then nothing to publish (server only).
-- ============================================================================

-- Live (nearest first with a location; most viewed first in a city), starting
-- in the next 24 hours (soonest first) and finished in the last 2 days (most
-- viewed first). Within 50 km of the point or the city's centre, then 150 km;
-- their sports first, then all sports (all_sports = true). A match is placed
-- by its Maps pin, else its tournament's city, else the home city of the
-- people running it (hosts, scorers, the tournament's hosts; adults only),
-- else the tournament organiser's. A "live" match nobody has touched for 12
-- hours isn't live near you. Deleted tournaments' matches and matches that
-- can't be placed are left out. p_lat/p_lng are rounded to ~1 km here too and never stored.
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
           t.city as t_city, t.host_ids as t_hosts, t.organizer_id as t_org, maps_pin(m.venue_maps_url) as pin
    from matches m
    left join tournaments t on t.id = m.tournament_id
    where (m.tournament_id is null or t.deleted_at is null)
      and (m.status = 'live'
        or (m.status = 'scheduled' and m.starts_at between now() - interval '30 minutes' and now() + interval '24 hours')
        or (m.status = 'completed' and coalesce(m.completed_at, m.starts_at) > now() - interval '2 days'))
      -- an abandoned "live" match (no change and no scoring for 12 hours) isn't live near you
      and (m.status <> 'live'
        or greatest(m.updated_at, (select max(e.created_at) from match_events e where e.match_id = m.id)) > now() - interval '12 hours')
  ),
  -- the tournament's city: each distinct name looked up once (PH-08)
  texts as (select distinct t_city as txt from cand where pin is null and t_city is not null),
  resolved as (select x.txt, ci.lat, ci.lng from texts x join cities ci on ci.id = city_for_text(x.txt)),
  cand2 as (
    select c.*, coalesce(c.pin[1], tr.lat) as tlat, coalesce(c.pin[2], tr.lng) as tlng
    from cand c left join resolved tr on c.pin is null and tr.txt = c.t_city
  ),
  -- Still unplaced: the people running it (the match's hosts, its scorers, then
  -- the tournament's hosts), by their answer to "Where are you based?", else
  -- their profile's city; then the tournament organiser's answer. Adults only:
  -- a child's city is private. Looked up per match through indexes (joining
  -- the in-between results made the plan rescan them for every match).
  placed as (
    select c.*, coalesce(c.tlat, pp.lat, op.lat) as plat, coalesce(c.tlng, pp.lng, op.lng) as plng
    from cand2 c
    left join lateral (
      select ci.lat, ci.lng
      from unnest(coalesce(c.host_ids, '{}') || coalesce(c.scorer_ids, '{}')
                  || case when c.scorer_id is null then '{}'::uuid[] else array[c.scorer_id] end
                  || coalesce(c.t_hosts, '{}')) with ordinality x(pid, ord)
      join players p on p.id = x.pid
      left join profiles pr on pr.id = p.profile_id
      join cities ci on ci.id = coalesce(pr.home_city_id, city_for_text(p.city))
      where c.tlat is null and p.dob is not null and p.dob <= current_date - interval '18 years'
      order by x.ord limit 1
    ) pp on true
    left join lateral (
      select ci.lat, ci.lng
      from profiles pr join cities ci on ci.id = pr.home_city_id
      where c.tlat is null and pp.lat is null and pr.id = c.t_org
        and pr.dob is not null and pr.dob <= current_date - interval '18 years'
    ) op on true
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
