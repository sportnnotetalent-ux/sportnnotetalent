-- Stale "Live now" (founder 2026-11-04): two quick tennis games started on 31 Oct
-- and 1 Nov still showed as LIVE on Home days later. The app hides a live match
-- with no activity for 12 hours (src/core/staleLive.ts, MVP L11), but home_feed
-- never returned matches.updated_at, so Home could not tell. This re-creates
-- home_feed from its newest body (20261024160000_entry_names.sql) with one change:
-- m.updated_at in the match columns. Read-only function; nothing else changes.
-- Run once in the Supabase SQL editor.

create or replace function home_feed()
  returns jsonb language sql stable security invoker set search_path = public as $$
  with
  -- getMyPlayerId: the one player row of this account (none, or several = null,
  -- like the app's .single() read)
  me as (
    select case when count(*) = 1 then (array_agg(p.id))[1] end as pid
    from players p where p.profile_id = auth.uid()
  ),
  fol as (select f.target_type, f.target_id from follows f where f.follower_id = auth.uid()),
  fol_players as (select coalesce(array_agg(target_id::text), '{}') as ids from fol where target_type = 'player'),
  tours as materialized (
    select t.id, t.name, t.host_name, t.host_org_id, t.logo_url, t.organizer_id, t.host_ids, t.is_open, t.sports,
           t.start_date, t.end_date, t.formats, t.structure, t.knockout_format, t.reminder_lead_minutes,
           t.registration_deadline, t.min_teams, t.max_teams, t.scoring, t.created_by, t.participation,
           t.banner_url, t.city, t.grounds, t.event_category, t.about, t.organiser_phone, t.organiser_email, t.deleted_at,
           t.time_zone, t.qualifies_to
    from tournaments t
  ),
  -- tournaments the caller hosts (live ones; hostIds falls back to organizer_id like the app)
  my_tours as (
    select t.id from tours t, me
    where t.deleted_at is null and me.pid is not null
      and me.pid = any(coalesce(t.host_ids, case when t.organizer_id is not null then array[t.organizer_id] end))
  ),
  -- every visible match except a deleted tournament's unfinished ones
  vis as materialized (
    select m.id, m.tournament_id, m.group_label, m.stage, m.byes, m.sport, m.status, m.starts_at, m.venue_id,
           m.venue_name, m.venue_maps_url, m.stream_url, m.winner, m.host_ids, m.logo_url, m.scorer_id, m.scorer_ids,
           m.format, m.state, m.result, m.updated_at,
           ht.id as h_id, ht.roster as h_roster, at.id as a_id, at.roster as a_roster,
           case when ht.id is null then null else jsonb_build_object('id', ht.id, 'name', ht.name, 'short_name', ht.short_name,
             'sport', ht.sport, 'color_hex', ht.color_hex, 'level', ht.level, 'entry_ids', ht.entry_ids) end as home_team,
           case when at.id is null then null else jsonb_build_object('id', at.id, 'name', at.name, 'short_name', at.short_name,
             'sport', at.sport, 'color_hex', at.color_hex, 'level', at.level, 'entry_ids', at.entry_ids) end as away_team
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    where not coalesce(m.tournament_id in (select id from tours where deleted_at is not null) and m.status is distinct from 'completed', false)
  ),
  flags as (
    select v.*,
      -- a team "has" a player when its roster lists them or team_members does
      (me.pid is not null and (
          me.pid = any(v.host_ids) or v.scorer_id = me.pid or me.pid = any(v.scorer_ids)
       or (v.h_id is not null and ((jsonb_typeof(v.h_roster) = 'array' and v.h_roster ? me.pid::text)
             or exists (select 1 from team_members tm where tm.team_id = v.h_id and tm.player_id = me.pid)))
       or (v.a_id is not null and ((jsonb_typeof(v.a_roster) = 'array' and v.a_roster ? me.pid::text)
             or exists (select 1 from team_members tm where tm.team_id = v.a_id and tm.player_id = me.pid)))
       or v.tournament_id in (select id from my_tours))) is true as mine,
      (  v.tournament_id in (select target_id from fol where target_type = 'tournament')
      or v.h_id in (select target_id from fol where target_type = 'team')
      or v.a_id in (select target_id from fol where target_type = 'team')
      or (v.h_id is not null and ((jsonb_typeof(v.h_roster) = 'array' and v.h_roster ?| fp.ids)
             or exists (select 1 from team_members tm where tm.team_id = v.h_id and tm.player_id::text = any(fp.ids))))
      or (v.a_id is not null and ((jsonb_typeof(v.a_roster) = 'array' and v.a_roster ?| fp.ids)
             or exists (select 1 from team_members tm where tm.team_id = v.a_id and tm.player_id::text = any(fp.ids))))
      ) is true as followed
    from vis v, me, fol_players fp
  )
  select jsonb_build_object(
    'player_id', (select pid from me),
    'tournaments', coalesce((select jsonb_agg(to_jsonb(t) order by t.start_date desc) from tours t), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(f) - array['h_id', 'h_roster', 'a_id', 'a_roster', 'mine', 'followed'] order by f.starts_at)
                         from flags f where f.mine or f.followed), '[]'::jsonb),
    'mine_ids', coalesce((select jsonb_agg(f.id order by f.starts_at) from flags f where f.mine), '[]'::jsonb)
  );
$$;


revoke all on function home_feed() from public, anon;
grant execute on function home_feed() to authenticated;
