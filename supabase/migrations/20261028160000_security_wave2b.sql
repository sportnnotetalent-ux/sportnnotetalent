-- ============================================================================
--  Security Wave 2b — the app side of the consent model (founder 2026-10-28)
--  docs/security/wave2-consent-design.md · tests/db-wave2b.test.mts
--
--  1. Requests to confirm: a link someone else made to my player (or my child,
--     or the unclaimed player I added) — a team, club, community or field
--     event — is listed for the player's side, who answers Confirm (it counts
--     from then on) or Not us (the player leaves the team / club / community;
--     a field-event entry stays for its results but reveals nothing). A
--     declined link isn't asked again.
--  2. Friendlies: the opponent's manager accepts a friendly. Until then its
--     players stay private to the host and scorers (W2B-11).
--  3. W1-2b: someone a coach added by phone, who signed up by email, proves the
--     number with an SMS code and the server links that profile to them.
-- ============================================================================

-- ---------- 1. Requests to confirm ------------------------------------------------------
create table if not exists member_link_declines (
  kind       text not null check (kind in ('team', 'club', 'org', 'field_event')),
  group_id   uuid not null,
  player_id  uuid not null references players(id) on delete cascade,
  by_profile uuid,
  at         timestamptz not null default now(),
  primary key (kind, group_id, player_id)
);
alter table member_link_declines enable row level security;
revoke all on member_link_declines from anon, authenticated;   -- written by answer_link only

-- The players a profile speaks for (see is_player_side).
create or replace function player_side_ids(p_profile uuid)
  returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}') from players p
   where p_profile is not null
     and ( p.profile_id = p_profile or p.guardian_profile_id = p_profile
        or (p.profile_id is null and p.created_by = p_profile) );
$$;
revoke all on function player_side_ids(uuid) from public, anon, authenticated;

-- Does this link exist (whoever made it)?
create or replace function member_link_exists(p_kind text, p_group uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'team' then exists (select 1 from teams t where t.id = p_group and p_player = any(team_player_ids(t)))
                  or exists (select 1 from team_members m where m.team_id = p_group and m.player_id = p_player)
                  or exists (select 1 from team_player_roles r where r.team_id = p_group and r.player_id = p_player)
    when 'club' then exists (select 1 from club_members c where c.club_id = p_group and c.player_id = p_player)
    when 'org' then exists (select 1 from org_members m where m.org_id = p_group and m.player_id = p_player
                              and (m.until is null or m.until >= current_date))
    when 'field_event' then exists (select 1 from field_entries f where f.event_id = p_group and f.player_id = p_player)
    else false
  end;
$$;
revoke all on function member_link_exists(text, uuid, uuid) from public, anon, authenticated;

-- Links to my side that nobody on my side agreed to, newest groups first.
create or replace function my_pending_links()
  returns table (kind text, group_id uuid, group_name text, player_id uuid, player_name text, added_by text, at timestamptz)
  language plpgsql stable security definer set search_path = public as $$
declare
  ids uuid[] := player_side_ids(auth.uid());
  ids_txt text[];
begin
  if auth.uid() is null or cardinality(ids) = 0 then return; end if;
  ids_txt := array(select unnest(ids)::text);
  return query
  with links as (
    select 'team'::text as k, t.id as g, x as p from teams t cross join lateral unnest(team_player_ids(t)) x
     where x = any(ids)
       and ( (jsonb_typeof(t.roster) = 'array' and t.roster ?| ids_txt)
          or t.captain_id = any(ids) or t.vice_captain_id = any(ids) or coalesce(t.admin_ids, '{}') && ids )
    union select 'team', m.team_id, m.player_id from team_members m where m.player_id = any(ids)
    union select 'team', r.team_id, r.player_id from team_player_roles r where r.player_id = any(ids)
    union select 'club', c.club_id, c.player_id from club_members c where c.player_id = any(ids)
    union select 'org', m.org_id, m.player_id from org_members m
           where m.player_id = any(ids) and (m.until is null or m.until >= current_date)
    union select 'field_event', f.event_id, f.player_id from field_entries f where f.player_id = any(ids)
  ), named as (
    select l.k, l.g, l.p,
           case l.k when 'team' then t.name when 'club' then c.name when 'org' then o.name else e.title end as gname,
           case l.k when 'team' then t.created_by when 'club' then c.created_by when 'org' then o.created_by else e.created_by end as creator,
           case l.k when 'team' then t.created_at when 'club' then c.created_at when 'org' then o.created_at else e.created_at end as made
      from links l
      left join teams t on l.k = 'team' and t.id = l.g
      left join clubs c on l.k = 'club' and c.id = l.g
      left join organizations o on l.k = 'org' and o.id = l.g
      left join field_events e on l.k = 'field_event' and e.id = l.g
  )
  select n.k, n.g, n.gname, n.p, pl.full_name, coalesce(pr.full_name, 'Someone'), n.made
    from named n
    join players pl on pl.id = n.p
    left join profiles pr on pr.id = n.creator
   where n.gname is not null
     and not member_consented(n.k, n.g, n.p)
     and not exists (select 1 from member_link_declines d where d.kind = n.k and d.group_id = n.g and d.player_id = n.p)
   order by n.made desc nulls last
   limit 100;
end $$;
revoke all on function my_pending_links() from public, anon;
grant execute on function my_pending_links() to authenticated;

-- Confirm (it counts from now on) or "Not us" (the player leaves the group; a
-- field-event entry stays for its results). Only the player's side may answer —
-- and may also take the player out of a group they agreed to earlier.
create or replace function answer_link(p_kind text, p_group uuid, p_player uuid, p_accept boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('team', 'club', 'org', 'field_event') or p_accept is null then
    raise exception 'Unknown request' using errcode = '22023';
  end if;
  if not is_player_side(p_player, auth.uid()) then
    raise exception 'Only the player, their parent or the person who added them can confirm this' using errcode = '42501';
  end if;
  if not member_link_exists(p_kind, p_group, p_player) then
    raise exception 'There''s nothing to confirm — the link was removed' using errcode = 'P0002';
  end if;

  if p_accept then
    insert into member_consents (kind, group_id, player_id, by_profile, method)
    values (p_kind, p_group, p_player, auth.uid(), 'accepted') on conflict do nothing;
    delete from member_link_declines d where d.kind = p_kind and d.group_id = p_group and d.player_id = p_player;
    return;
  end if;

  if p_kind = 'org' and exists (
       select 1 from org_members m where m.org_id = p_group and m.player_id = p_player and m.role = 'Owner' and m.until is null)
     and not exists (
       select 1 from org_members m where m.org_id = p_group and m.player_id <> p_player and m.role = 'Owner' and m.until is null) then
    raise exception 'This player is the only owner of that community — contact support to remove them' using errcode = '42501';
  end if;

  insert into member_link_declines (kind, group_id, player_id, by_profile)
  values (p_kind, p_group, p_player, auth.uid())
  on conflict (kind, group_id, player_id) do update set by_profile = excluded.by_profile, at = now();
  delete from member_consents c where c.kind = p_kind and c.group_id = p_group and c.player_id = p_player;

  perform set_config('app.trusted_rpc', 'on', true);
  if p_kind = 'team' then
    update teams t
       set roster = case when jsonb_typeof(t.roster) = 'array'
                         then coalesce((select jsonb_agg(v) from jsonb_array_elements(t.roster) v
                                         where v #>> '{}' is distinct from p_player::text), '[]'::jsonb)
                         else t.roster end,
           captain_id = nullif(t.captain_id, p_player),
           vice_captain_id = nullif(t.vice_captain_id, p_player),
           admin_ids = array_remove(t.admin_ids, p_player)
     where t.id = p_group;
    delete from team_members m where m.team_id = p_group and m.player_id = p_player;
    delete from team_player_roles r where r.team_id = p_group and r.player_id = p_player;
  elsif p_kind = 'club' then
    delete from club_members c where c.club_id = p_group and c.player_id = p_player;
  elsif p_kind = 'org' then
    delete from org_members m where m.org_id = p_group and m.player_id = p_player;
  end if;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function answer_link(text, uuid, uuid, boolean) from public, anon;
grant execute on function answer_link(text, uuid, uuid, boolean) to authenticated;

-- ---------- 2. Friendlies: the opponent's manager accepts -----------------------------------
create table if not exists match_team_consents (
  match_id   uuid not null references matches(id) on delete cascade,
  team_id    uuid not null references teams(id) on delete cascade,
  accepted   boolean not null,
  by_profile uuid,
  method     text not null check (method in ('host', 'answered', 'existing')),
  at         timestamptz not null default now(),
  primary key (match_id, team_id)
);
create index if not exists match_team_consents_team_idx on match_team_consents (team_id);
alter table match_team_consents enable row level security;
revoke all on match_team_consents from anon, authenticated;   -- written by the trigger / answer_friendly only

-- A friendly's creator agrees for every team in it they manage.
create or replace function record_friendly_consents()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  x uuid;
begin
  if new.tournament_id is not null or auth.uid() is null then return null; end if;
  foreach x in array array[new.home_team_id, new.away_team_id] loop
    if x is not null and can_manage_team(x) then
      insert into match_team_consents (match_id, team_id, accepted, by_profile, method)
      values (new.id, x, true, auth.uid(), 'host') on conflict do nothing;
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists record_friendly_consents on matches;
create trigger record_friendly_consents after insert or update of home_team_id, away_team_id, tournament_id on matches
  for each row execute function record_friendly_consents();

-- Every friendly that exists today is agreed (on live, 2026-10-28: 17, all
-- between one creator's own teams).
insert into match_team_consents (match_id, team_id, accepted, method)
select m.id, x, true, 'existing' from matches m cross join lateral unnest(array[m.home_team_id, m.away_team_id]) x
 where m.tournament_id is null and x is not null and exists (select 1 from teams t where t.id = x)
on conflict do nothing;

-- The teams I manage (can_manage_team, for the caller, as a set — keep in step;
-- can_manage_club includes the club's admins, W2bB-11).
create or replace function my_managed_team_ids()
  returns uuid[] language sql stable security definer set search_path = public as $$
  with me as (select auth_player_ids() as ids),
  my_orgs as (select m.org_id from org_members m, me where m.player_id = any(me.ids) and m.until is null
                and m.role in ('Owner', 'Admin', 'Organizer')),
  my_clubs as (select c.id from clubs c where c.created_by = auth.uid()
                or c.org_id in (select m.org_id from org_members m, me where m.player_id = any(me.ids) and m.until is null
                                  and m.role in ('Owner', 'Admin'))
                union select cm.club_id from club_members cm, me where cm.player_id = any(me.ids) and cm.role = 'admin')
  select coalesce(array_agg(distinct id), '{}') from (
    select t.id from teams t, me
     where t.created_by = auth.uid() or t.captain_id = any(me.ids) or t.vice_captain_id = any(me.ids)
        or coalesce(t.admin_ids, '{}') && me.ids
        or t.club_id in (select id from my_clubs) or t.org_id in (select org_id from my_orgs)
    union select s.team_id from team_staff s where s.profile_id = auth.uid()
  ) s;
$$;
revoke all on function my_managed_team_ids() from public, anon, authenticated;

-- Friendlies against a team I manage that I haven't answered.
create or replace function my_pending_friendlies()
  returns table (match_id uuid, team_id uuid, team_name text, other_team text, sport text, starts_at timestamptz,
                 status text, host_name text)
  language plpgsql stable security definer set search_path = public as $$
declare
  mine uuid[];
begin
  if auth.uid() is null then return; end if;
  mine := my_managed_team_ids();
  if cardinality(mine) = 0 then return; end if;
  return query
  select m.id, x.tid, t.name, o.name, m.sport, m.starts_at, m.status, hp.full_name
    from matches m
    cross join lateral (values (m.home_team_id, m.away_team_id), (m.away_team_id, m.home_team_id)) as x(tid, oid)
    join teams t on t.id = x.tid
    left join teams o on o.id = x.oid
    left join players hp on hp.id = m.host_ids[1]
   where m.tournament_id is null
     and (m.home_team_id = any(mine) or m.away_team_id = any(mine))
     and x.tid = any(mine)
     and not exists (select 1 from match_team_consents c where c.match_id = m.id and c.team_id = x.tid)
   order by m.starts_at desc nulls last, m.created_at desc
   limit 50;
end $$;
revoke all on function my_pending_friendlies() from public, anon;
grant execute on function my_pending_friendlies() to authenticated;

create or replace function answer_friendly(p_match uuid, p_team uuid, p_accept boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_accept is null or not exists (select 1 from matches m where m.id = p_match and m.tournament_id is null
                                        and p_team in (m.home_team_id, m.away_team_id)) then
    raise exception 'That team isn''t playing this friendly' using errcode = 'P0002';
  end if;
  if not can_manage_team(p_team) then
    raise exception 'Only the team''s manager can answer this' using errcode = '42501';
  end if;
  insert into match_team_consents (match_id, team_id, accepted, by_profile, method)
  values (p_match, p_team, p_accept, auth.uid(), 'answered')
  on conflict (match_id, team_id) do update
    set accepted = excluded.accepted, by_profile = excluded.by_profile, method = 'answered', at = now();
end $$;
revoke all on function answer_friendly(uuid, uuid, boolean) from public, anon;
grant execute on function answer_friendly(uuid, uuid, boolean) to authenticated;

-- ---------- 3. The circle: accepted friendlies -------------------------------------------------
-- Latest body: 20261028140000_security_wave2. Change marked W2b.
create or replace function player_circle_of(p_profile uuid)
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  me uuid[];
  me_txt text[];
  my_houses text[];
  my_teams uuid[];
  my_tours uuid[];
  circle_teams uuid[];
  my_clubs uuid[];
  result uuid[];
begin
  if p_profile is null then return '{}'::uuid[]; end if;
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(id::text), '{}'),
         coalesce(array_agg(house_name) filter (where house_name is not null), '{}')
    into me, me_txt, my_houses
    from players where profile_id = p_profile;

  -- Clubs I belong to.
  select coalesce(array_agg(distinct club_id), '{}') into my_clubs
    from club_members where player_id = any(me);

  -- Teams I'm on or run.
  select coalesce(array_agg(distinct t.id), '{}') into my_teams
    from teams t
   where t.created_by = p_profile
      or t.captain_id = any(me) or t.vice_captain_id = any(me)
      or coalesce(t.admin_ids, '{}') && me
      or (jsonb_typeof(t.roster) = 'array' and t.roster ?| me_txt)
      or ((t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0)
          and t.name = any(my_houses)
          -- W2: a House team counts only for agreed members of its school
          and t.org_id is not null
          and exists (select 1 from players p where p.profile_id = p_profile and p.house_name = t.name and t.sport = any(p.sports)
                        and member_consented('org', t.org_id, p.id)))
      or (t.club_id is not null and t.club_id = any(my_clubs))
      or exists (select 1 from team_members m where m.team_id = t.id and m.player_id = any(me))
      or exists (select 1 from team_player_roles r where r.team_id = t.id and r.player_id = any(me))
      or exists (select 1 from team_staff s where s.team_id = t.id and s.profile_id = p_profile);

  -- Tournaments I run, officiate, score in, or play in.
  select coalesce(array_agg(distinct x), '{}') into my_tours from (
    select t.id as x from tournaments t
     where t.organizer_id = p_profile
        or coalesce(t.host_ids, '{}') && me
        or t.created_by = any(me)
        or (t.host_org_id is not null and exists (
              select 1 from org_members om
               where om.org_id = t.host_org_id and om.player_id = any(me)
                 and (om.until is null or om.until >= current_date)
                 and om.role in ('Owner', 'Admin', 'Organizer')))
    union select tournament_id from tournament_officials where player_id = any(me)
    union select tournament_id from tournament_teams where team_id = any(my_teams) and status = 'confirmed'
    union select tournament_id from matches
           where tournament_id is not null
             and (home_team_id = any(my_teams) or away_team_id = any(my_teams)
                  or coalesce(scorer_ids, '{}') && me or coalesce(host_ids, '{}') && me)
    union select e.tournament_id from field_events e
           where e.tournament_id is not null
             and (coalesce(e.host_ids, '{}') && me or e.created_by = p_profile
                  or exists (select 1 from field_entries fe where fe.event_id = e.id and fe.player_id = any(me)))
  ) s where x is not null;

  -- Every team in those tournaments + both sides of any match I score/host.
  select coalesce(array_agg(distinct x), '{}') into circle_teams from (
    select unnest(my_teams) as x
    -- W2: only entries the team agreed to (confirmed)
    union select team_id from tournament_teams where tournament_id = any(my_tours) and status = 'confirmed'
    -- W2b: a friendly I host or score adds each team whose side accepted it
    union select c.team_id from match_team_consents c join matches m on m.id = c.match_id
           where c.accepted and m.tournament_id is null and c.team_id in (m.home_team_id, m.away_team_id)
             and (coalesce(m.host_ids, '{}') && me or coalesce(m.scorer_ids, '{}') && me or m.scorer_id = any(me))
    union select mt.x from (select m.tournament_id, unnest(array[m.home_team_id, m.away_team_id]) as x
                              from matches m where m.tournament_id = any(my_tours)) mt
           where exists (select 1 from tournament_teams tt where tt.tournament_id = mt.tournament_id
                           and tt.team_id = mt.x and tt.status = 'confirmed')
    union select fe.team_id from field_entries fe join field_events e on e.id = fe.event_id
           where e.tournament_id = any(my_tours)
             and exists (select 1 from tournament_teams tt where tt.tournament_id = e.tournament_id
                           and tt.team_id = fe.team_id and tt.status = 'confirmed')
  ) s where x is not null;

  select coalesce(array_agg(distinct x), '{}') into result from (
    select unnest(me) as x
    -- members of the circle's teams
    union select r.v::uuid from teams t
           cross join lateral jsonb_array_elements_text(
             case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as r(v)
           where t.id = any(circle_teams)
             and r.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and member_consented('team', t.id, r.v::uuid)          -- W2: the player's side agreed
    union select m.player_id from team_members m where m.team_id = any(circle_teams) and member_consented('team', m.team_id, m.player_id)
    union select r.player_id from team_player_roles r where r.team_id = any(circle_teams) and member_consented('team', r.team_id, r.player_id)
    union select x from teams t cross join lateral unnest(array[t.captain_id, t.vice_captain_id] || coalesce(t.admin_ids, '{}')) x
           where t.id = any(circle_teams) and x is not null and member_consented('team', t.id, x)
    -- school house teams with no explicit roster: the house's players of that sport
    union select p.id from teams t join players p on p.house_name = t.name and t.sport = any(p.sports)
           where t.id = any(circle_teams)
             and (t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0)
             -- W2: agreed members of the House team's school, or added by its creator
             and ((t.org_id is not null and member_consented('org', t.org_id, p.id)) or is_player_side(p.id, t.created_by))
    -- my clubs (a club is one real team across sports)
    union select cm.player_id from club_members cm where cm.club_id = any(my_clubs) and member_consented('club', cm.club_id, cm.player_id)
    -- individual entries (golf, athletics, swimming …) in my tournaments / events I host
    union select fe.player_id from field_entries fe join field_events e on e.id = fe.event_id
           where (e.tournament_id = any(my_tours) or coalesce(e.host_ids, '{}') && me or e.created_by = p_profile)
             and fe.player_id is not null
             and ( member_consented('field_event', e.id, fe.player_id)
                or (fe.team_id is not null and member_consented('team', fe.team_id, fe.player_id)
                    and exists (select 1 from tournament_teams tt where tt.tournament_id = e.tournament_id
                                  and tt.team_id = fe.team_id and tt.status = 'confirmed')) )
    -- active members of my organisations
    union select om2.player_id from org_members om join org_members om2 on om2.org_id = om.org_id
           where om.player_id = any(me)
             and (om.until is null or om.until >= current_date)
             and (om2.until is null or om2.until >= current_date)
             and member_consented('org', om2.org_id, om2.player_id)  -- W2
    -- my wards and the provisional players I entered
    union select id from players where guardian_profile_id = p_profile
    union select id from players where created_by = p_profile
  ) s where x is not null;

  return result;
end $$;

-- ---------- 4. W1-2b: verify your number to link the profile a coach made --------------------
-- Has this player row any history? Every table that references players (W2bB-07).
create or replace function player_has_history(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams t
                  where (jsonb_typeof(t.roster) = 'array' and t.roster ? p_player::text)
                     or t.captain_id = p_player or t.vice_captain_id = p_player
                     or p_player = any(coalesce(t.admin_ids, '{}')) or p_player = any(coalesce(t.entry_ids, '{}')))
      or exists (select 1 from team_members m where m.player_id = p_player)
      or exists (select 1 from team_player_roles r where r.player_id = p_player)
      or exists (select 1 from club_members c where c.player_id = p_player)
      or exists (select 1 from org_members m where m.player_id = p_player)
      or exists (select 1 from field_entries f where f.player_id = p_player)
      or exists (select 1 from matches m where p_player = any(m.scorer_ids) or p_player = any(m.host_ids) or m.scorer_id = p_player)
      or exists (select 1 from tournaments t where t.created_by = p_player or p_player = any(coalesce(t.host_ids, '{}')))
      -- W2bB-07: everything else that hangs off a player row (deleted or unlinked with it)
      or exists (select 1 from player_sport_profiles x where x.player_id = p_player)
      or exists (select 1 from stat_lines x where x.player_id = p_player)
      or exists (select 1 from certificates x where x.player_id = p_player)
      or exists (select 1 from message_threads x where x.subject_player_id = p_player)
      or exists (select 1 from org_requests x where x.player_id = p_player or x.created_by = p_player or x.decided_by = p_player)
      or exists (select 1 from org_member_ids x where x.player_id = p_player)
      or exists (select 1 from tournament_officials x where x.player_id = p_player or x.assigned_by = p_player)
      or exists (select 1 from listings x where x.author_id = p_player)
      or exists (select 1 from match_disputes x where p_player in (x.player_id, x.raised_by, x.replacement_id))
      or exists (select 1 from match_squads x where x.keeper_id = p_player)
      or exists (select 1 from matches x where x.active_scorer_id = p_player)
      or exists (select 1 from activity_log x where x.by_player_id = p_player)
      or exists (select 1 from consent_log x where x.player_id = p_player)
      or exists (select 1 from tournament_ownership_events x where x.by_player_id = p_player);
$$;
revoke all on function player_has_history(uuid) from public, anon, authenticated;

-- Called by verify-phone-firebase (channel 'claim') after Google's token proved
-- the caller holds p_phone. Links the unclaimed player a coach added with that
-- number to the caller. Returns:
--   'linked'  — done (the caller's own empty profile, if any, is replaced);
--   'none'    — no unclaimed profile has that number;
--   'support' — both profiles have history, or the first names, birth years
--               or parents disagree (a parent verifying their own number must
--               not take over their child's profile) — support merges by hand.
create or replace function claim_player_by_phone(p_profile uuid, p_phone text)
  returns text language plpgsql security definer set search_path = public as $$
declare
  k text := phone_key(p_phone);
  target players%rowtype;
  own players%rowtype;
  own_count int;
  my_dob date;
  my_first text;
begin
  if p_profile is null or k is null then return 'none'; end if;
  select * into target from players p
   where p.profile_id is null and p.reported_at is null and phone_key(p.phone) = k
   order by p.created_at limit 1
   for update;
  if not found then return 'none'; end if;

  select count(*) into own_count from players p where p.profile_id = p_profile;
  if own_count > 1 then return 'support'; end if;
  if own_count = 1 then select * into own from players p where p.profile_id = p_profile; end if;
  my_dob := coalesce(own.dob, (select pr.dob from profiles pr where pr.id = p_profile));
  -- W2bB-06: the same first name — a parent's number on a child's profile, or a
  -- wrong number, mustn't hand the child's profile to the number's owner.
  my_first := split_part(lower(btrim(regexp_replace(coalesce(own.full_name, (select pr.full_name from profiles pr where pr.id = p_profile), ''), '\s+', ' ', 'g'))), ' ', 1);
  if my_first = '' or my_first <> split_part(lower(btrim(regexp_replace(coalesce(target.full_name, ''), '\s+', ' ', 'g'))), ' ', 1) then
    return 'support';
  end if;
  if my_dob is not null and target.dob is not null and extract(year from my_dob) <> extract(year from target.dob) then
    return 'support';
  end if;
  if own.guardian_profile_id is not null and target.guardian_profile_id is not null
     and own.guardian_profile_id <> target.guardian_profile_id then
    return 'support';
  end if;
  if own_count = 1 and player_has_history(own.id) then return 'support'; end if;

  perform set_config('app.trusted_rpc', 'on', true);
  if own_count = 1 then
    delete from players p where p.id = own.id;
  end if;
  update players p
     set profile_id = p_profile,
         phone_verified = true,
         full_name = coalesce(own.full_name, p.full_name),
         dob = coalesce(own.dob, p.dob),
         guardian = coalesce(own.guardian, p.guardian),
         guardian_profile_id = coalesce(p.guardian_profile_id, own.guardian_profile_id),
         email = coalesce(own.email, p.email),
         email_verified = case when own.email is not null then own.email_verified else p.email_verified end
   where p.id = target.id and p.profile_id is null;
  perform set_config('app.trusted_rpc', 'off', true);
  return 'linked';
end $$;
revoke all on function claim_player_by_phone(uuid, text) from public, anon, authenticated;
grant execute on function claim_player_by_phone(uuid, text) to service_role;
