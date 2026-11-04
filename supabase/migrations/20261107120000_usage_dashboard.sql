-- Usage dashboard v1 (founder 2026-11-06; docs/security/breaks/usage-dashboard.md).
--
-- One read for the support console's dashboard: per week (Monday, Asia/Kolkata,
-- like the kpi_* views) the eight agreed numbers, games by sport over the last
-- 4 weeks, and today's counts. COUNTS ONLY — no names, ids or per-person rows
-- (some users are minors). Support / admin only; computed live.
--
-- Per week W:
--  games_scored  distinct matches completed in W that have ≥ 1 scoring event
--  active_users  distinct signed-in people who opened the app / a screen in W
--  sign_ups      every sign-up in W (anonymous ones too)
--  cohort / activated   of W's sign-ups WHO SHARE USAGE DATA (adults who didn't
--                opt out — analytics_actor links no one else), how many within 7 days scored a game
--                (match_started / match_completed) OR were on a side's roster of
--                a game completed in that window
--  started / finished   matches that went live in W / of those, completed now
--  shares / game_views  links shared in W / people opening games in W
--  prev_signups / retained  of W-1's sign-ups who share usage data, how many were active in W
-- active_users counts people (linked) and installs (anon id) — one each.
--  sessions / crashed   app sessions opened in W / of those, with a fatal error

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
  rows as (
    select w.wk,
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
        'sessions', r.sessions, 'crashed', r.crashed) order by r.wk desc), '[]'::jsonb) from rows r),
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

-- Drill-downs (founder 2026-11-06: "as soon as I see a few new sign-ups, I need
-- to see who these people are"). Support / admin only; up to 200 rows.
--  signups   accounts made in the week: name, joined, city, sports, phone
--            verified, under 18, games played so far (no contact details)
--  inactive  accounts from the last 8 weeks, 7+ days old, no game yet
--  games     the week's scored games: sport, the two sides, when, steps
--  active    people active in the week — only those who share usage data
--            (analytics links no one else; installs stay a count)
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
      select a.*, pl.city, pl.sports, coalesce(pl.phone_verified, false) as phone_verified,
        (select count(distinct m.id) from matches m join teams t on t.id in (m.home_team_id, m.away_team_id)
          where m.status = 'completed' and jsonb_typeof(t.roster) = 'array' and t.roster ? a.pid::text) as games
      from acc a left join players pl on pl.id = a.pid
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'player_id', r.pid, 'name', r.full_name, 'joined', r.created_at, 'city', r.city, 'sports', coalesce(to_jsonb(r.sports), '[]'::jsonb),
        'phone_verified', r.phone_verified, 'minor', r.dob is not null and r.dob > current_date - interval '18 years', 'games', r.games)
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
