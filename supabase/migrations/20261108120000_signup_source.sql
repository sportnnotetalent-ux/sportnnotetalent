-- Sign-up source (founder 2026-11-04; docs/security/breaks/signup-source.md).
--
-- Which link a new user signed up from: the device remembers the kind of link a
-- signed-out visitor opened (and, for public pages, which one) and sends it once
-- on the first sign-in after the account is made. One row per account.
--  kind  game | tournament | invite | team | profile | results | parent | school
--  ref   a game / tournament / player id — public pages only, checked to exist;
--        never for minors or people who don't share usage data (analytics_actor)

create table if not exists signup_sources (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  kind        text not null check (kind in ('game', 'tournament', 'invite', 'team', 'profile', 'results', 'parent', 'school')),
  ref         text check (ref is null or ref ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  recorded_at timestamptz not null default now()
);
alter table signup_sources enable row level security;
revoke all on table signup_sources from public, anon, authenticated;

create or replace function record_signup_source(p_kind text, p_ref text default null)
  returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  made timestamptz;
  r text := null;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('game', 'tournament', 'invite', 'team', 'profile', 'results', 'parent', 'school') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  select created_at into made from profiles where id = me;
  if made is null or made < now() - interval '48 hours' then
    return 'too_late';
  end if;
  if exists (select 1 from signup_sources where profile_id = me) then
    return 'already';
  end if;
  -- a ref only for public pages, only if it is real, and only for people who share usage data
  if p_ref ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' and analytics_actor(me) is not null then
    r := case p_kind
      when 'game' then (select m.id::text from matches m where m.id::text = p_ref)
      when 'tournament' then (select t.id::text from tournaments t where t.id::text = p_ref)
      when 'invite' then (select p.id::text from players p where p.id::text = p_ref and p.profile_id is distinct from me)
      when 'profile' then (select p.id::text from players p where p.id::text = p_ref and p.profile_id is distinct from me)
      else null end;
  end if;
  insert into signup_sources (profile_id, kind, ref) values (me, p_kind, r) on conflict (profile_id) do nothing;
  return 'saved';
end $$;

revoke all on function record_signup_source(text, text) from public, anon, authenticated;
grant execute on function record_signup_source(text, text) to authenticated;

-- The usage dashboard (20261107120000) gains sign-ups from links per week
-- (from_links), sign-ups by source over the last 4 weeks (by_source; no
-- recorded source = 'direct'), and each new person's source in the lists.

create or replace function usage_dashboard(p_weeks integer default 8)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  n int := least(26, greatest(1, coalesce(p_weeks, 8)));
  this_week date := date_trunc('week', now() at time zone 'Asia/Kolkata')::date;
  out jsonb;
begin
  if auth.uid() is null or not is_support() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  with weeks as (
    select (this_week - (7 * g))::date as wk from generate_series(0, n - 1) g
  ),
  ev as (
    select date_trunc('week', at at time zone 'Asia/Kolkata')::date as wk, name, profile_id, anon_id, session_id, props, at
    from analytics_events
    where at >= ((this_week - 7 * n - 14)::timestamp at time zone 'Asia/Kolkata')
  ),
  completed as (
    select distinct on (props->>'match_id') wk, props->>'match_id' as mid, props->>'sport' as sport
    from ev where name = 'match_completed' and props ? 'match_id'
    order by props->>'match_id', at
  ),
  scored as (
    select c.* from completed c
    where exists (select 1 from match_events e where e.match_id::text = c.mid)
  ),
  started as (
    select distinct on (props->>'match_id') wk, props->>'match_id' as mid
    from ev where name = 'match_started' and props ? 'match_id'
    order by props->>'match_id', at
  ),
  signups as (
    select profile_id, min(at) as at, date_trunc('week', min(at) at time zone 'Asia/Kolkata')::date as wk
    from analytics_events where name = 'signed_up' and profile_id is not null group by profile_id
  ),
  active as (
    select distinct wk, coalesce(profile_id::text, 'anon:' || anon_id::text) as who, profile_id from ev
    where (profile_id is not null or anon_id is not null) and name in ('app_open', 'screen_view')
  ),
  activated as (
    select s.profile_id, s.wk from signups s
    where exists (
        select 1 from analytics_events e where e.profile_id = s.profile_id
          and e.name in ('match_started', 'match_completed', 'round_completed')
          and e.at between s.at and s.at + interval '7 days')
      or exists (
        select 1 from players pl
        join teams t on jsonb_typeof(t.roster) = 'array' and t.roster ? pl.id::text
        join matches m on (m.home_team_id = t.id or m.away_team_id = t.id) and m.status = 'completed'
        where pl.profile_id = s.profile_id
          and coalesce(m.completed_at, m.updated_at) between s.at and s.at + interval '7 days')
  ),
  sess as (
    select distinct wk, session_id from ev where name = 'app_open' and session_id is not null
  ),
  crashed as (
    select distinct session_id from client_errors where fatal and session_id is not null
  ),
  views as (
    select date_trunc('week', day)::date as wk, count(*) as c from match_views
    where day >= this_week - 7 * n group by 1
  ),
  sources as (
    select date_trunc('week', pr.created_at at time zone 'Asia/Kolkata')::date as wk, coalesce(s.kind, 'direct') as kind
    from profiles pr left join signup_sources s on s.profile_id = pr.id
    where pr.created_at >= ((this_week - 7 * n)::timestamp at time zone 'Asia/Kolkata')
  ),
  rows as (
    select w.wk,
      (select count(*) from sources x where x.wk = w.wk and x.kind <> 'direct') as from_links,
      (select count(*) from scored x where x.wk = w.wk) as games_scored,
      (select count(distinct who) from active a where a.wk = w.wk) as active_users,
      (select count(*) from ev where ev.wk = w.wk and ev.name = 'signed_up') as sign_ups,
      (select count(*) from signups s where s.wk = w.wk) as cohort,
      (select count(*) from activated a where a.wk = w.wk) as activated,
      (select count(*) from started x where x.wk = w.wk) as started,
      (select count(*) from started x join matches m on m.id::text = x.mid where x.wk = w.wk and m.status = 'completed') as finished,
      (select count(*) from ev where ev.wk = w.wk and ev.name = 'share_link') as shares,
      coalesce((select c from views v where v.wk = w.wk), 0) as game_views,
      (select count(*) from signups s where s.wk = w.wk - 7) as prev_signups,
      (select count(*) from signups s where s.wk = w.wk - 7
         and exists (select 1 from active a where a.wk = w.wk and a.profile_id = s.profile_id)) as retained,
      (select count(*) from sess x where x.wk = w.wk) as sessions,
      (select count(*) from sess x where x.wk = w.wk and x.session_id in (select session_id from crashed)) as crashed
    from weeks w
  )
  select jsonb_build_object(
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object(
        'week', r.wk, 'games_scored', r.games_scored, 'active_users', r.active_users, 'sign_ups', r.sign_ups,
        'cohort', r.cohort, 'activated', r.activated, 'started', r.started, 'finished', r.finished,
        'shares', r.shares, 'game_views', r.game_views, 'prev_signups', r.prev_signups, 'retained', r.retained,
        'sessions', r.sessions, 'crashed', r.crashed, 'from_links', r.from_links) order by r.wk desc), '[]'::jsonb) from rows r),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'signups', c) order by c desc, kind), '[]'::jsonb)
        from (select kind, count(*) as c from sources where wk >= this_week - 21 group by kind) x),
    'by_sport', (select coalesce(jsonb_agg(jsonb_build_object('sport', sport, 'games', c) order by c desc, sport), '[]'::jsonb)
        from (select sport, count(*) as c from scored where wk >= this_week - 21 and sport is not null group by sport) x),
    'today', jsonb_build_object(
        'sign_ups', (select count(*) from analytics_events where name = 'signed_up'
                          and (at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date),
        'games_scored', (select count(*) from scored s join analytics_events e on e.name = 'match_completed' and e.props->>'match_id' = s.mid
                          where (e.at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date),
        'active_users', (select count(distinct coalesce(profile_id::text, 'anon:' || anon_id::text)) from analytics_events
                          where (profile_id is not null or anon_id is not null) and name in ('app_open', 'screen_view')
                          and (at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date),
        'tournaments', (select count(*) from analytics_events where name = 'tournament_created'
                          and (at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date))
  ) into out;
  return out;
end $$;

revoke all on function usage_dashboard(integer) from public, anon, authenticated;
grant execute on function usage_dashboard(integer) to authenticated;

create or replace function usage_people(p_kind text, p_week date default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  wk date := coalesce(p_week, date_trunc('week', now() at time zone 'Asia/Kolkata')::date);
  t0 timestamptz := (wk::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((wk + 7)::timestamp at time zone 'Asia/Kolkata');
  out jsonb;
begin
  if auth.uid() is null or not is_support() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind in ('signups', 'inactive') then
    with acc as (
      select pr.id, pr.full_name, pr.created_at, pr.dob,
        (select pl.id from players pl where pl.profile_id = pr.id order by pl.created_at limit 1) as pid
      from profiles pr
      where case when p_kind = 'signups' then pr.created_at >= t0 and pr.created_at < t1
                 else pr.created_at >= now() - interval '56 days' and pr.created_at <= now() - interval '7 days' end
    ), rows as (
      select a.*, ss.kind as source,
        case ss.kind
          when 'invite' then (select ip.full_name from players ip where ip.id::text = ss.ref)
          when 'profile' then (select ip.full_name from players ip where ip.id::text = ss.ref)
          when 'game' then (select coalesce(ht.name, '?') || ' v ' || coalesce(awt.name, '?') from matches m
                              left join teams ht on ht.id = m.home_team_id left join teams awt on awt.id = m.away_team_id where m.id::text = ss.ref)
          when 'tournament' then (select tr.name from tournaments tr where tr.id::text = ss.ref)
        end as source_detail,
        pl.city, pl.sports, coalesce(pl.phone_verified, false) as phone_verified,
        (select count(distinct m.id) from matches m join teams t on t.id in (m.home_team_id, m.away_team_id)
          where m.status = 'completed' and jsonb_typeof(t.roster) = 'array' and t.roster ? a.pid::text) as games
      from acc a left join players pl on pl.id = a.pid
        left join signup_sources ss on ss.profile_id = a.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'player_id', r.pid, 'name', r.full_name, 'joined', r.created_at, 'city', r.city, 'sports', coalesce(to_jsonb(r.sports), '[]'::jsonb),
        'phone_verified', r.phone_verified, 'minor', r.dob is not null and r.dob > current_date - interval '18 years', 'games', r.games,
        'source', r.source, 'source_detail', r.source_detail)
        order by r.created_at desc), '[]'::jsonb)
      into out
      from (select * from rows where p_kind = 'signups' or games = 0 order by created_at desc limit 200) r;
  elsif p_kind = 'games' then
    select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into out from (
      select jsonb_build_object('match_id', m.id, 'sport', m.sport, 'home', ht.name, 'away', at.name,
        'at', coalesce(m.completed_at, m.updated_at), 'steps', (select count(*) from match_events e where e.match_id = m.id),
        'tournament', tr.name) as x
      from matches m
      left join teams ht on ht.id = m.home_team_id
      left join teams at on at.id = m.away_team_id
      left join tournaments tr on tr.id = m.tournament_id
      where m.status = 'completed' and coalesce(m.completed_at, m.updated_at) >= t0 and coalesce(m.completed_at, m.updated_at) < t1
        and exists (select 1 from match_events e where e.match_id = m.id)
      order by coalesce(m.completed_at, m.updated_at) desc limit 200) g;
  elsif p_kind = 'active' then
    select coalesce(jsonb_agg(jsonb_build_object('player_id', a.pid, 'name', a.full_name, 'last_seen', a.last_seen, 'opens', a.opens)
        order by a.last_seen desc), '[]'::jsonb) into out from (
      select pr.full_name, max(e.at) as last_seen, count(*) as opens,
        (select pl.id from players pl where pl.profile_id = pr.id order by pl.created_at limit 1) as pid
      from analytics_events e join profiles pr on pr.id = e.profile_id
      where e.name in ('app_open', 'screen_view') and e.at >= t0 and e.at < t1
      group by pr.id, pr.full_name order by max(e.at) desc limit 200) a;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  return out;
end $$;

revoke all on function usage_people(text, date) from public, anon, authenticated;
grant execute on function usage_people(text, date) to authenticated;
