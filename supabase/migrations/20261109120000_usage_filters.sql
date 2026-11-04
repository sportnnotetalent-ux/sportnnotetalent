-- Usage dashboard filters (founder 2026-11-04; docs/security/breaks/usage-filters.md).
--
-- The dashboard for any period (from–to, IST days, up to 400) and for chosen
-- sports and places. Totals for the period, for the same number of days just
-- before it, for today, and per day / week / month for the trend.
--  sport  games of those sports; people who play one (the sports on their profile)
--  place  cities. A person: their "Where are you based?" answer, else their
--         profile city. A game: its tournament's city, else the city of the
--         people running it (hosts, then scorers). 0 = "No city set".
-- Links shared, sessions and crashes have no sport or place, and installs that
-- aren't signed in have neither: under a filter those stay whole (shares,
-- crashes) or are left out (installs), and the app says so.
-- The v1 usage_dashboard / usage_people stay for app versions on the old screen.

-- Columns these read (added by earlier migrations; no-ops live) — so this file
-- also stands on a database built without them.
alter table matches add column if not exists completed_at timestamptz;
alter table matches add column if not exists scorer_ids uuid[] not null default '{}';
alter table profiles add column if not exists home_city_id integer references cities(id) on delete set null;

-- The checks both readers share: support only, a sane range, sane filters.
create or replace function usage_check(p_from date, p_to date, p_sports text[], p_cities integer[])
  returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_support() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to
     or p_to > (now() at time zone 'Asia/Kolkata')::date or p_to - p_from + 1 > 400 then
    raise exception 'bad_range' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_sports), 0) > 30 or coalesce(cardinality(p_cities), 0) > 50
     or exists (select 1 from unnest(p_sports) s where s is null or s !~ '^[a-z][a-z0-9_]{0,31}$') then
    raise exception 'bad_filter' using errcode = '22023';
  end if;
end $$;
revoke all on function usage_check(date, date, text[], integer[]) from public, anon, authenticated;

-- Every account with its first player, city and sports, narrowed by the filters
-- (null = no filter).
create or replace function usage_scope_people(p_sports text[], p_cities integer[])
  returns table (id uuid, created_at timestamptz, dob date, full_name text, pid uuid, city integer)
  language sql stable security definer set search_path = public as $$
  select x.id, x.created_at, x.dob, x.full_name, x.pid, x.city from (
    select pr.id, pr.created_at, pr.dob, pr.full_name, pl.id as pid, pl.sports,
           coalesce(pr.home_city_id, city_for_text(pl.city)) as city
    from profiles pr
    left join lateral (select p.id, p.city, p.sports from players p where p.profile_id = pr.id order by p.created_at limit 1) pl on true
  ) x
  where (p_sports is null or x.sports && p_sports)
    and (p_cities is null or coalesce(x.city, 0) = any(p_cities))
$$;
revoke all on function usage_scope_people(text[], integer[]) from public, anon, authenticated;

-- A game's city: its tournament's, else the first of the people running it with one.
create or replace function usage_match_city(p_match uuid)
  returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select city_for_text(t.city) from matches m join tournaments t on t.id = m.tournament_id where m.id = p_match),
    (select coalesce(pr.home_city_id, city_for_text(p.city))
       from matches m
       cross join lateral unnest(coalesce(m.host_ids, '{}') || coalesce(m.scorer_ids, '{}')
                  || case when m.scorer_id is null then '{}'::uuid[] else array[m.scorer_id] end) with ordinality x(pid, ord)
       join players p on p.id = x.pid
       left join profiles pr on pr.id = p.profile_id
      where m.id = p_match and coalesce(pr.home_city_id, city_for_text(p.city)) is not null
      order by x.ord limit 1))
$$;
revoke all on function usage_match_city(uuid) from public, anon, authenticated;

-- Every game with its sport, status, when it finished and its city, narrowed by the filters.
create or replace function usage_scope_games(p_sports text[], p_cities integer[])
  returns table (id uuid, sport text, status text, done_at timestamptz, city integer)
  language sql stable security definer set search_path = public as $$
  select x.id, x.sport, x.status, x.done_at, x.city from (
    select m.id, m.sport, m.status::text as status, coalesce(m.completed_at, m.updated_at) as done_at, usage_match_city(m.id) as city
    from matches m
  ) x
  where (p_sports is null or x.sport = any(p_sports))
    and (p_cities is null or coalesce(x.city, 0) = any(p_cities))
$$;
revoke all on function usage_scope_games(text[], integer[]) from public, anon, authenticated;

create or replace function usage_report(p_from date, p_to date, p_sports text[] default null, p_cities integer[] default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sports text[] := case when coalesce(cardinality(p_sports), 0) > 0 then p_sports end;
  cities integer[] := case when coalesce(cardinality(p_cities), 0) > 0 then p_cities end;
  filtered boolean;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  ndays integer;
  unit text;
  lo timestamptz;
  out jsonb;
begin
  perform usage_check(p_from, p_to, p_sports, p_cities);
  filtered := sports is not null or cities is not null;
  ndays := p_to - p_from + 1;
  unit := case when ndays <= 31 then 'day' when ndays <= 182 then 'week' else 'month' end;
  lo := ((p_from - ndays - 14)::timestamp at time zone 'Asia/Kolkata');

  with win as (
    select 'period'::text as k, p_from as d0, p_to + 1 as d1
    union all select 'previous', p_from - ndays, p_from
    union all select 'today', today, today + 1
    union all
    select 'b', greatest(g::date, p_from), least((g + ('1 ' || unit)::interval)::date, p_to + 1)
    from generate_series(date_trunc(unit, p_from::timestamp), p_to::timestamp, ('1 ' || unit)::interval) g
  ),
  w as (
    select k, d0, d1, (d0::timestamp at time zone 'Asia/Kolkata') as t0, (d1::timestamp at time zone 'Asia/Kolkata') as t1 from win
  ),
  ppl as (select * from usage_scope_people(sports, cities)),
  gms as (select * from usage_scope_games(sports, cities)),
  ev as (
    select name, profile_id, anon_id, session_id, props, at from analytics_events where at >= lo
  ),
  scored as (
    select g.* from gms g
    where g.status = 'completed' and exists (select 1 from match_events e where e.match_id = g.id)
  ),
  started as (
    select distinct on (props->>'match_id') props->>'match_id' as mid, at
    from ev where name = 'match_started' and props ? 'match_id'
    order by props->>'match_id', at
  ),
  started_f as (
    select s.at, g.status from started s join gms g on g.id::text = s.mid
  ),
  linked as (
    select p.id, p.pid, min(e.at) as at from ev e join ppl p on p.id = e.profile_id
    where e.name = 'signed_up' group by p.id, p.pid
  ),
  activated as (
    select l.id, l.at from linked l
    where exists (
        select 1 from analytics_events e where e.profile_id = l.id
          and e.name in ('match_started', 'match_completed', 'round_completed')
          and e.at between l.at and l.at + interval '7 days')
      or exists (
        select 1 from teams t
        join matches m on (m.home_team_id = t.id or m.away_team_id = t.id) and m.status = 'completed'
        where l.pid is not null and jsonb_typeof(t.roster) = 'array' and t.roster ? l.pid::text
          and coalesce(m.completed_at, m.updated_at) between l.at and l.at + interval '7 days')
  ),
  active as (
    select e.at, coalesce(e.profile_id::text, 'anon:' || e.anon_id::text) as who from ev e
    where e.name in ('app_open', 'screen_view')
      and ((e.profile_id is not null and e.profile_id in (select id from ppl))
        or (not filtered and e.profile_id is null and e.anon_id is not null))
  ),
  crashed as (
    select distinct session_id from client_errors where fatal and session_id is not null and at >= lo
  ),
  tot as (
    select w.k, w.d0,
      jsonb_build_object(
        'games_scored', (select count(*) from scored s where s.done_at >= w.t0 and s.done_at < w.t1),
        'active_users', (select count(distinct a.who) from active a where a.at >= w.t0 and a.at < w.t1),
        'sign_ups', (select count(*) from ppl p where p.created_at >= w.t0 and p.created_at < w.t1),
        'cohort', (select count(*) from linked l where l.at >= w.t0 and l.at < w.t1),
        'activated', (select count(*) from activated a where a.at >= w.t0 and a.at < w.t1),
        'started', (select count(*) from started_f s where s.at >= w.t0 and s.at < w.t1),
        'finished', (select count(*) from started_f s where s.at >= w.t0 and s.at < w.t1 and s.status = 'completed'),
        'shares', (select count(*) from ev where ev.name = 'share_link' and ev.at >= w.t0 and ev.at < w.t1),
        'game_views', (select count(*) from match_views v where v.day >= w.d0 and v.day < w.d1
                         and (not filtered or v.match_id in (select id from gms))),
        'ret_base', (select count(*) from linked l where l.at >= w.t0 and l.at < w.t1 and l.at <= now() - interval '7 days'),
        'retained', (select count(*) from linked l where l.at >= w.t0 and l.at < w.t1 and l.at <= now() - interval '7 days'
                       and exists (select 1 from analytics_events e where e.profile_id = l.id and e.name in ('app_open', 'screen_view')
                                     and e.at >= l.at + interval '7 days' and e.at < l.at + interval '14 days')),
        'sessions', (select count(distinct ev.session_id) from ev where ev.name = 'app_open' and ev.session_id is not null and ev.at >= w.t0 and ev.at < w.t1),
        'crashed', (select count(distinct ev.session_id) from ev where ev.name = 'app_open' and ev.at >= w.t0 and ev.at < w.t1
                      and ev.session_id in (select session_id from crashed)),
        'from_links', (select count(*) from ppl p join signup_sources s on s.profile_id = p.id where p.created_at >= w.t0 and p.created_at < w.t1),
        'tournaments', (select count(*) from ev where ev.name = 'tournament_created' and ev.at >= w.t0 and ev.at < w.t1)
      ) as t
    from w
  ),
  per as (select t0, t1 from w where k = 'period'),
  places as (
    select c.id, c.name, x.people, x.games from (
      select coalesce(a.city, b.city) as city, coalesce(a.n, 0) as people, coalesce(b.n, 0) as games
      from (select coalesce(city, 0) as city, count(*) as n from usage_scope_people(null, null) group by 1) a
      full join (select coalesce(s.city, 0) as city, count(*) as n from usage_scope_games(null, null) s, per
                  where s.status = 'completed' and s.done_at >= per.t0 and s.done_at < per.t1 group by 1) b on a.city = b.city
    ) x
    join (select ci.id, ci.name from cities ci union all select 0, 'No city set') c on c.id = x.city
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', unit, 'filtered', filtered,
    'period', (select t from tot where k = 'period'),
    'previous', (select t from tot where k = 'previous'),
    'today', (select t from tot where k = 'today'),
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object('start', to_char(d0, 'YYYY-MM-DD')) || t order by d0), '[]'::jsonb) from tot where k = 'b'),
    'by_sport', (select coalesce(jsonb_agg(jsonb_build_object('sport', sport, 'games', c) order by c desc, sport), '[]'::jsonb)
        from (select s.sport, count(*) as c from scored s, per where s.done_at >= per.t0 and s.done_at < per.t1 and s.sport is not null group by s.sport) x),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'signups', c) order by c desc, kind), '[]'::jsonb)
        from (select coalesce(s.kind, 'direct') as kind, count(*) as c from ppl p cross join per
                left join signup_sources s on s.profile_id = p.id
              where p.created_at >= per.t0 and p.created_at < per.t1 group by 1) x),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'people', people, 'games', games)
        order by (id = 0), people + games desc, name), '[]'::jsonb) from places)
  ) into out;
  return out;
end $$;

revoke all on function usage_report(date, date, text[], integer[]) from public, anon, authenticated;
grant execute on function usage_report(date, date, text[], integer[]) to authenticated;

-- The lists behind the tiles, for the same period and filters (UF5). Same rules
-- as v1: no contact details, under-18s marked, "active" only people who share
-- usage data; up to 200 rows.
create or replace function usage_report_people(p_kind text, p_from date, p_to date,
                                               p_sports text[] default null, p_cities integer[] default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sports text[] := case when coalesce(cardinality(p_sports), 0) > 0 then p_sports end;
  cities integer[] := case when coalesce(cardinality(p_cities), 0) > 0 then p_cities end;
  t0 timestamptz;
  t1 timestamptz;
  out jsonb;
begin
  perform usage_check(p_from, p_to, p_sports, p_cities);
  t0 := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  if p_kind in ('signups', 'inactive') then
    with acc as (
      select * from usage_scope_people(sports, cities) p
      where p.created_at >= t0 and p.created_at < t1
        and (p_kind = 'signups' or p.created_at <= now() - interval '7 days')
    ), rows as (
      select a.*, ss.kind as source,
        case ss.kind
          when 'invite' then (select ip.full_name from players ip where ip.id::text = ss.ref)
          when 'profile' then (select ip.full_name from players ip where ip.id::text = ss.ref)
          when 'game' then (select coalesce(ht.name, '?') || ' v ' || coalesce(awt.name, '?') from matches m
                              left join teams ht on ht.id = m.home_team_id left join teams awt on awt.id = m.away_team_id where m.id::text = ss.ref)
          when 'tournament' then (select tr.name from tournaments tr where tr.id::text = ss.ref)
        end as source_detail,
        pl.city as city_text, pl.sports, coalesce(pl.phone_verified, false) as phone_verified,
        (select ci.name from cities ci where ci.id = a.city) as city_name,
        (select count(distinct m.id) from matches m join teams t on t.id in (m.home_team_id, m.away_team_id)
          where m.status = 'completed' and jsonb_typeof(t.roster) = 'array' and t.roster ? a.pid::text) as games
      from acc a left join players pl on pl.id = a.pid
        left join signup_sources ss on ss.profile_id = a.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'player_id', r.pid, 'name', r.full_name, 'joined', r.created_at, 'city', coalesce(r.city_name, r.city_text),
        'sports', coalesce(to_jsonb(r.sports), '[]'::jsonb), 'phone_verified', r.phone_verified,
        'minor', r.dob is not null and r.dob > current_date - interval '18 years', 'games', r.games,
        'source', r.source, 'source_detail', r.source_detail)
        order by r.created_at desc), '[]'::jsonb)
      into out
      from (select * from rows where p_kind = 'signups' or games = 0 order by created_at desc limit 200) r;
  elsif p_kind = 'games' then
    select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into out from (
      select jsonb_build_object('match_id', m.id, 'sport', m.sport, 'home', ht.name, 'away', awt.name,
        'at', g.done_at, 'steps', (select count(*) from match_events e where e.match_id = m.id),
        'tournament', tr.name, 'city', (select ci.name from cities ci where ci.id = g.city)) as x
      from usage_scope_games(sports, cities) g
      join matches m on m.id = g.id
      left join teams ht on ht.id = m.home_team_id
      left join teams awt on awt.id = m.away_team_id
      left join tournaments tr on tr.id = m.tournament_id
      where g.status = 'completed' and g.done_at >= t0 and g.done_at < t1
        and exists (select 1 from match_events e where e.match_id = m.id)
      order by g.done_at desc limit 200) q;
  elsif p_kind = 'active' then
    select coalesce(jsonb_agg(jsonb_build_object('player_id', a.pid, 'name', a.full_name, 'last_seen', a.last_seen, 'opens', a.opens)
        order by a.last_seen desc), '[]'::jsonb) into out from (
      select p.full_name, p.pid, max(e.at) as last_seen, count(*) as opens
      from analytics_events e join usage_scope_people(sports, cities) p on p.id = e.profile_id
      where e.name in ('app_open', 'screen_view') and e.at >= t0 and e.at < t1
      group by p.id, p.full_name, p.pid order by max(e.at) desc limit 200) a;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  return out;
end $$;

revoke all on function usage_report_people(text, date, date, text[], integer[]) from public, anon, authenticated;
grant execute on function usage_report_people(text, date, date, text[], integer[]) to authenticated;
