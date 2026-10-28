-- ============================================================================
--  Security Wave 2a — the consent model (founder 2026-10-28, "1A")
--  docs/security/wave2-consent-design.md · tests/db-wave2.test.mts
--
--  A link between a player and a group (team, club, community, field event)
--  gives the group's people the player's circle — full name, card, an unclaimed
--  player's number, follows, pushes, admin edits — only when the PLAYER'S SIDE
--  agreed: their own account, their linked parent, or (for an unclaimed player)
--  the person who added them. A team counts in a tournament only once the TEAM'S
--  side agreed ('confirmed'). Links nobody agreed to still exist (rosters,
--  scoring) but reveal no child and grant nothing. Adults are public anyway.
--
--  Fixes DB-01 (self-made circle), DB-04 (admin via co-host / unconfirmed
--  entries), DB-05 (squad rights via a friendly; the captain slot), DB-14 /
--  SL-19 (communities enrolling anyone), EF-02 / EF-03 (pushes to strangers'
--  children). Every link that exists today is recorded as agreed ('existing').
-- ============================================================================

-- ---------- 1. Who speaks for a player ---------------------------------------------
create or replace function is_player_side(p_player uuid, p_profile uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_profile is not null and exists (
    select 1 from players p where p.id = p_player
       and ( p.profile_id = p_profile or p.guardian_profile_id = p_profile
          or (p.profile_id is null and p.created_by = p_profile) ));
$$;
revoke all on function is_player_side(uuid, uuid) from public, anon, authenticated;

-- ---------- 2. Agreements ------------------------------------------------------------
create table if not exists member_consents (
  kind       text not null check (kind in ('team', 'club', 'org', 'field_event')),
  group_id   uuid not null,
  player_id  uuid not null references players(id) on delete cascade,
  by_profile uuid,
  method     text not null check (method in ('self', 'creator', 'accepted', 'existing', 'joined')),
  at         timestamptz not null default now(),
  primary key (kind, group_id, player_id)
);
create index if not exists member_consents_player_idx on member_consents (player_id);
alter table member_consents enable row level security;
revoke all on member_consents from anon, authenticated;   -- written by triggers / server functions only

-- Did the player's side agree to this link? A record, or agreed by construction:
-- the group's creator speaks for the player (the same coach added both; the
-- player or parent made the group), or — a community — its own staff added
-- the player (a school's students), or an accepted join request / invite.
create or replace function member_consented(p_kind text, p_group uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_group is not null and p_player is not null and (
    exists (select 1 from member_consents c where c.kind = p_kind and c.group_id = p_group and c.player_id = p_player)
    or case p_kind
      when 'team' then exists (select 1 from teams t where t.id = p_group and is_player_side(p_player, t.created_by))
      when 'club' then exists (select 1 from clubs c where c.id = p_group and is_player_side(p_player, c.created_by))
      when 'field_event' then exists (select 1 from field_events e where e.id = p_group and is_player_side(p_player, e.created_by))
      when 'org' then
           exists (select 1 from organizations o where o.id = p_group and is_player_side(p_player, o.created_by))
        or exists (select 1 from players p
                     join org_members m on m.org_id = p_group and m.until is null and m.role in ('Owner', 'Admin', 'Organizer')
                     join players sp on sp.id = m.player_id
                    where p.id = p_player and p.created_by is not null and sp.profile_id = p.created_by)
        or exists (select 1 from org_requests q where q.org_id = p_group and q.player_id = p_player and q.status = 'accepted')
      else false
    end);
$$;
revoke all on function member_consented(text, uuid, uuid) from public, anon, authenticated;

-- Record an agreement when the person acting is the player's side.
create or replace function record_member_consent(p_kind text, p_group uuid, p_player uuid)
  returns void language sql security definer set search_path = public as $$
  insert into member_consents (kind, group_id, player_id, by_profile, method)
  select p_kind, p_group, p.id, auth.uid(),
         case when p.profile_id = auth.uid() or p.guardian_profile_id = auth.uid() then 'self' else 'creator' end
    from players p
   where p.id = p_player and auth.uid() is not null and is_player_side(p.id, auth.uid())
  on conflict do nothing;
$$;
revoke all on function record_member_consent(text, uuid, uuid) from public, anon, authenticated;

-- Every player a team names: roster, captain, vice-captain, admins.
create or replace function team_player_ids(t teams)
  returns uuid[] language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}') from (
    select json_uuid(r.v) as x
      from jsonb_array_elements_text(case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as r(v)
    union all select t.captain_id union all select t.vice_captain_id
    union all select unnest(coalesce(t.admin_ids, '{}'))
  ) s;
$$;
revoke all on function team_player_ids(teams) from public, anon, authenticated;

-- ---------- 3. Triggers that record agreements ------------------------------------------
create or replace function record_team_consents()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  x uuid;
  before_ids uuid[] := case when tg_op = 'UPDATE' then team_player_ids(old) else '{}' end;
begin
  if auth.uid() is null then return null; end if;
  foreach x in array team_player_ids(new) loop
    if not (x = any(before_ids)) then perform record_member_consent('team', new.id, x); end if;
  end loop;
  return null;
end $$;
drop trigger if exists record_team_consents on teams;
create trigger record_team_consents after insert or update of roster, captain_id, vice_captain_id, admin_ids on teams
  for each row execute function record_team_consents();

create or replace function record_row_consent()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is null then return null; end if;
  case tg_table_name
    when 'team_members' then perform record_member_consent('team', new.team_id, new.player_id);
    when 'team_player_roles' then perform record_member_consent('team', new.team_id, new.player_id);
    when 'club_members' then perform record_member_consent('club', new.club_id, new.player_id);
    when 'org_members' then perform record_member_consent('org', new.org_id, new.player_id);
    when 'field_entries' then perform record_member_consent('field_event', new.event_id, new.player_id);
    else null;
  end case;
  return null;
end $$;
drop trigger if exists record_row_consent on team_members;
create trigger record_row_consent after insert on team_members for each row execute function record_row_consent();
drop trigger if exists record_row_consent on team_player_roles;
create trigger record_row_consent after insert on team_player_roles for each row execute function record_row_consent();
drop trigger if exists record_row_consent on club_members;
create trigger record_row_consent after insert on club_members for each row execute function record_row_consent();
drop trigger if exists record_row_consent on org_members;
create trigger record_row_consent after insert on org_members for each row execute function record_row_consent();
drop trigger if exists record_row_consent on field_entries;
create trigger record_row_consent after insert on field_entries for each row execute function record_row_consent();

-- An accepted join request (the player asked) or invite (the invitee, their
-- parent, or the parent's page from a school's student list) is agreement.
create or replace function record_org_request_consent()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into member_consents (kind, group_id, player_id, by_profile, method)
    values ('org', new.org_id, new.player_id, auth.uid(), 'accepted') on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists record_org_request_consent on org_requests;
create trigger record_org_request_consent after update of status on org_requests
  for each row execute function record_org_request_consent();

-- ---------- 4. Every link that exists today is agreed ('existing') -------------------------
insert into member_consents (kind, group_id, player_id, method)
select 'team', t.id, x, 'existing' from teams t cross join lateral unnest(team_player_ids(t)) as x
 where exists (select 1 from players p where p.id = x)
on conflict do nothing;
insert into member_consents (kind, group_id, player_id, method)
select 'team', m.team_id, m.player_id, 'existing' from team_members m where exists (select 1 from players p where p.id = m.player_id)
on conflict do nothing;
insert into member_consents (kind, group_id, player_id, method)
select 'team', r.team_id, r.player_id, 'existing' from team_player_roles r where exists (select 1 from players p where p.id = r.player_id)
on conflict do nothing;
insert into member_consents (kind, group_id, player_id, method)
select 'club', c.club_id, c.player_id, 'existing' from club_members c where exists (select 1 from players p where p.id = c.player_id)
on conflict do nothing;
insert into member_consents (kind, group_id, player_id, method)
select 'org', m.org_id, m.player_id, 'existing' from org_members m where exists (select 1 from players p where p.id = m.player_id)
on conflict do nothing;
insert into member_consents (kind, group_id, player_id, method)
select 'field_event', f.event_id, f.player_id, 'existing' from field_entries f where exists (select 1 from players p where p.id = f.player_id)
on conflict do nothing;

-- ---------- 5. A team joins a tournament only with its side's agreement ----------------------
-- An organiser entering a team they don't manage gets 'invited' (the team's
-- manager accepts); a team asking to join is 'pending' and the organiser approves.
-- Only a brand-new entry: when the row exists (the app's add is an upsert), the
-- update guard below decides, so a request is approved and nothing is downgraded.
create or replace function guard_tournament_team_insert()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_client_request() and new.status = 'confirmed' and not can_manage_team(new.team_id)
     and not exists (select 1 from tournament_teams tt where tt.tournament_id = new.tournament_id and tt.team_id = new.team_id) then
    new.status := 'invited';
  end if;
  return new;
end $$;
drop trigger if exists guard_tournament_team_insert on tournament_teams;
create trigger guard_tournament_team_insert before insert on tournament_teams
  for each row execute function guard_tournament_team_insert();

-- ---------- 6. The checks that use agreements ------------------------------------------------
-- Latest bodies: player_circle_of 20261019124600_protect_minors; my_roster_editable_team_ids
-- and push_allowed_targets 20261023100000_perf_wave2; can_admin_player
-- 20261019122600_org_staff_player_edit; can_edit_team_roster and guard_tournament_team
-- 20261006120000_security_hardening; guard_team_write 20261019121000_tournament_teams_admin;
-- players_view 20261026120000_device_account_and_verification_privacy; org_member_dobs and
-- org_confirm_dobs 20261025170000_guide_review_fixes. Changes are marked W2.

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
    -- W2: only entries the team agreed to (confirmed); a friendly I host or
    -- score adds no other team (its opponents agree in Wave 2b)
    union select team_id from tournament_teams where tournament_id = any(my_tours) and status = 'confirmed'
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

create or replace function my_roster_editable_team_ids()
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_ids uuid[] := auth_player_ids();
  v_uid uuid := auth.uid();
begin
  return (
    with
    adm_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin', 'Organizer')
    ),
    oa_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin')
    ),
    m_clubs as materialized (
      select id from clubs where created_by = v_uid
      union select c.id from clubs c join oa_orgs o on o.org_id = c.org_id
      union select club_id from club_members where player_id = any(v_ids) and role = 'admin'
    ),
    m_tours as materialized (
      select id from tournaments where organizer_id = v_uid
      union select id from tournaments where host_ids && v_ids
      union select t.id from tournaments t join adm_orgs o on o.org_id = t.host_org_id
    ),
    m_matches as materialized (
      select id from matches where scorer_ids && v_ids
      union select id from matches where scorer_id = any(v_ids)
      union select id from matches where host_ids && v_ids
      union select m.id from matches m join m_tours t on t.id = m.tournament_id
    )
    select coalesce(array_agg(t.id), '{}') from teams t where t.id in (
      select id from teams where created_by = v_uid
      union select id from teams where captain_id = any(v_ids)
      union select id from teams where vice_captain_id = any(v_ids)
      union select id from teams where admin_ids && v_ids
      union select t2.id from teams t2 join m_clubs c on c.id = t2.club_id
      union select t2.id from teams t2 join adm_orgs o on o.org_id = t2.org_id
      union select team_id from team_staff where profile_id = v_uid
      -- W2: a match gives squad rights only in a tournament the team agreed to (never a friendly)
      union select m.home_team_id from matches m join m_matches mm on mm.id = m.id where m.status in ('scheduled', 'live')
              and m.tournament_id is not null
              and exists (select 1 from tournament_teams tt where tt.tournament_id = m.tournament_id and tt.team_id = m.home_team_id and tt.status = 'confirmed')
      union select m.away_team_id from matches m join m_matches mm on mm.id = m.id where m.status in ('scheduled', 'live')
              and m.tournament_id is not null
              and exists (select 1 from tournament_teams tt where tt.tournament_id = m.tournament_id and tt.team_id = m.away_team_id and tt.status = 'confirmed')
    )
  );
end $$;

create or replace function can_edit_team_roster(p_team uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_team(p_team) or exists (
    select 1 from matches m
    where (m.home_team_id = p_team or m.away_team_id = p_team)
      and m.status in ('scheduled', 'live')
      and can_manage_match(m.id)
      -- W2: only a match in a tournament this team agreed to — never a friendly
      and m.tournament_id is not null
      and exists (select 1 from tournament_teams tt where tt.tournament_id = m.tournament_id
                    and tt.team_id = p_team and tt.status = 'confirmed')
  );
$$;


create or replace function push_allowed_targets(p_targets uuid[])
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_ids uuid[] := auth_player_ids();
  v_uid uuid := auth.uid();
  v_circle uuid[];
begin
  -- Support staff may notify anyone (verification decisions): every target, as given.
  if is_support() then
    return (select coalesce(array_agg(x order by o), '{}') from unnest(p_targets) with ordinality u(x, o));
  end if;

  -- W2 (EF-02 / EF-03): a possible minor is a target only inside the caller's
  -- agreed circle — never through a link the caller made alone.
  v_circle := player_circle_of(v_uid);
  return (
    with
    -- orgs where the caller is an active Owner/Admin/Organizer (has_org_role)
    adm_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin', 'Organizer')
    ),
    oa_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin')
    ),
    -- can_manage_club
    m_clubs as materialized (
      select id from clubs where created_by = v_uid
      union select c.id from clubs c join oa_orgs o on o.org_id = c.org_id
      union select club_id from club_members where player_id = any(v_ids) and role = 'admin'
    ),
    -- can_manage_tournament
    m_tours as materialized (
      select id from tournaments where organizer_id = v_uid
      union select id from tournaments where host_ids && v_ids
      union select t.id from tournaments t join adm_orgs o on o.org_id = t.host_org_id
    ),
    -- can_manage_match
    m_matches as materialized (
      select id from matches where scorer_ids && v_ids
      union select id from matches where scorer_id = any(v_ids)
      union select id from matches where host_ids && v_ids
      union select m.id from matches m join m_tours t on t.id = m.tournament_id
    ),
    -- can_manage_team
    m_teams as materialized (
      select id from teams where created_by = v_uid
      union select id from teams where captain_id = any(v_ids)
      union select id from teams where vice_captain_id = any(v_ids)
      union select id from teams where admin_ids && v_ids
      union select t.id from teams t join m_clubs c on c.id = t.club_id
      union select t.id from teams t join adm_orgs o on o.org_id = t.org_id
      union select team_id from team_staff where profile_id = v_uid
    ),
    -- teams the caller manages, captains, plays on, or runs a live/scheduled match for
    my_teams as materialized (
      select t.id from teams t where t.id in (
        select id from m_teams                                   -- can_edit_team_roster: manages the team
        union select m.home_team_id from matches m join m_matches mm on mm.id = m.id
              where m.status in ('scheduled', 'live')            -- … or a live/scheduled match of it
              and m.tournament_id is not null
              and exists (select 1 from tournament_teams tt where tt.tournament_id = m.tournament_id and tt.team_id = m.home_team_id and tt.status = 'confirmed')
        union select m.away_team_id from matches m join m_matches mm on mm.id = m.id
              where m.status in ('scheduled', 'live')
              and m.tournament_id is not null
              and exists (select 1 from tournament_teams tt where tt.tournament_id = m.tournament_id and tt.team_id = m.away_team_id and tt.status = 'confirmed')
        union select id from teams where roster ?| (select array_agg(x::text) from unnest(v_ids) x)
        union select team_id from team_members where player_id = any(v_ids)
      )
    ),
    -- matches the caller manages or plays in
    my_matches as materialized (
      select id from m_matches
      union select id from matches where home_team_id in (select id from my_teams)
      union select id from matches where away_team_id in (select id from my_teams)
    ),
    -- tournaments the caller manages or has a team entered in
    my_tournaments as materialized (
      select id from m_tours
      union
      select tt.tournament_id from tournament_teams tt where tt.team_id in (select id from my_teams)
    )
    -- the per-target checks below are the old ones, unchanged
    select coalesce(array_agg(x order by o), '{}') from unnest(p_targets) with ordinality u(x, o)
    where (x = any(v_circle) or exists (select 1 from players pa where pa.id = x and player_is_known_adult(pa.dob, pa.profile_id)))
      and (x = any(v_ids)
       -- shares a team (captain / vice / roster / member)
       or exists (select 1 from teams t where t.id in (select id from my_teams)
                  and (t.captain_id = x or t.vice_captain_id = x or t.roster ? x::text
                       or exists (select 1 from team_members tm where tm.team_id = t.id and tm.player_id = x)))
       -- a scorer / host / player of a match the caller is involved in
       or exists (select 1 from matches m where m.id in (select id from my_matches)
                  and (x = any(m.scorer_ids) or x = any(m.host_ids) or m.scorer_id = x
                       or exists (select 1 from teams t where t.id in (m.home_team_id, m.away_team_id)
                                  and (t.captain_id = x or t.vice_captain_id = x or t.roster ? x::text))))
       -- a host, or an entered team's captain, of a tournament the caller is in
       or exists (select 1 from tournaments t where t.id in (select id from my_tournaments)
                  and (x = any(t.host_ids)
                       or exists (select 1 from org_members om where om.org_id = t.host_org_id
                                  and om.player_id = x and om.until is null
                                  and om.role in ('Owner','Admin','Organizer'))
                       or exists (select 1 from tournament_teams tt join teams tm on tm.id = tt.team_id
                                  where tt.tournament_id = t.id
                                    and (tm.captain_id = x or tm.vice_captain_id = x))))
       -- a fellow member of an org the caller is in
       or exists (select 1 from org_members a join org_members b on a.org_id = b.org_id
                  where a.player_id = any(v_ids) and a.until is null
                    and b.player_id = x and b.until is null)
       -- a fellow member of a club
       or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
                  where a.player_id = any(v_ids) and b.player_id = x))
  );
end $$;

create or replace function can_admin_player(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from players p
    where p.id = p_player and p.profile_id is null and p.reported_at is null and (
         exists (select 1 from teams t where t.roster ? p.id::text
                 and t.created_by = p.created_by and can_manage_team(t.id))
      or exists (select 1 from teams t
                 where (t.roster is null or t.roster = '[]'::jsonb)
                   and p.house_name is not null and t.name = p.house_name
                   and t.created_by = p.created_by and can_manage_team(t.id))
      or exists (select 1 from club_members cm join clubs c on c.id = cm.club_id
                 where cm.player_id = p.id and c.created_by = p.created_by and can_manage_club(cm.club_id))
      or exists (select 1 from tournament_teams tt
                 join teams t on t.id = tt.team_id
                 join tournaments tour on tour.id = tt.tournament_id
                 where t.created_by = p.created_by
                   and ( t.roster ? p.id::text
                      or ( (t.roster is null or t.roster = '[]'::jsonb)
                           and p.house_name is not null and t.name = p.house_name ) )
                   and can_manage_tournament(tt.tournament_id)
                   -- W2 (DB-04): an entry the team agreed to; co-hosts named on the
                   -- tournament (host_ids) no longer count
                   and tt.status = 'confirmed'
                   and ( (tour.host_org_id is not null and t.org_id = tour.host_org_id)
                      or t.created_by = tour.organizer_id ))
      -- 0048: Owner/Admin of the organisation the team belongs to, for players
      -- added by a colleague who joined that organisation by choice.
      or exists (select 1 from teams t
                 where t.org_id is not null
                   and ( t.roster ? p.id::text
                      or ( (t.roster is null or t.roster = '[]'::jsonb)
                           and p.house_name is not null and t.name = p.house_name ) )
                   and has_org_role(t.org_id, array['Owner','Admin'])
                   and exists (select 1 from org_members tm join players tp on tp.id = tm.player_id
                               where tm.org_id = t.org_id and tm.until is null
                                 and tp.profile_id = t.created_by)
                   and org_member_by_choice(t.org_id, p.created_by))
    )
  );
$$;


create or replace function guard_team_write()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or tg_op <> 'UPDATE' then return new; end if;
  if not can_manage_team(old.id) then
    -- A tournament match's manager: roster edits only. W2 (DB-05): never the
    -- captain / vice-captain — an empty slot isn't theirs to fill any more.
    if (new.name, new.short_name, new.sport, new.color_hex, new.school_id, new.org_id, new.club_id, new.adhoc,
        new.logo_url, new.city, new.admin_ids)
       is distinct from (old.name, old.short_name, old.sport, old.color_hex, old.school_id, old.org_id, old.club_id, old.adhoc,
        old.logo_url, old.city, old.admin_ids)
       or new.captain_id is distinct from old.captain_id
       or new.vice_captain_id is distinct from old.vice_captain_id then
      raise exception 'You can only update the squad of this team' using errcode = '42501';
    end if;
  end if;
  -- Moving a team into an org / club needs authority over the destination.
  if new.org_id is distinct from old.org_id and new.org_id is not null
     and not has_org_role(new.org_id, array['Owner','Admin','Organizer']) then
    raise exception 'You can''t move this team into that organization' using errcode = '42501';
  end if;
  if new.club_id is distinct from old.club_id and new.club_id is not null
     and not can_manage_club(new.club_id) then
    raise exception 'You can''t move this team into that club' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function guard_tournament_team()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if can_manage_tournament(old.tournament_id) then
    -- W2: an organiser confirms a team that asked to join (pending), or a team
    -- they manage themselves; any other team accepts the invite itself.
    -- (The app's add is an upsert: an invite stays an invite rather than failing.)
    if new.status = 'confirmed' and old.status is distinct from 'confirmed'
       and old.status is distinct from 'pending' and not can_manage_team(new.team_id) then
      new.status := old.status;
    end if;
    -- …and re-adding never takes a team that agreed back to an invite.
    if old.status = 'confirmed' and new.status = 'invited' and not can_manage_team(new.team_id) then
      new.status := old.status;
    end if;
    return new;
  end if;
  -- A team manager may only accept an invite (invited → confirmed).
  if old.status = 'invited' and new.status = 'confirmed'
     and new.tournament_id = old.tournament_id and new.team_id = old.team_id
     and new.category_id is not distinct from old.category_id then
    return new;
  end if;
  raise exception 'Only the organizer can change this entry' using errcode = '42501';
end $$;

create or replace function org_member_dobs(p_org uuid)
  returns table (player_id uuid, full_name text, dob date, age int, confirmed boolean, verified_by text)
  language plpgsql stable security definer set search_path = public as $$
begin
  perform org_dob_access_or_raise(p_org);
  return query
  select p.id, p.full_name, p.dob,
         case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end,
         coalesce(p.dob is not null and (
                    p.dob_confirmations->'orgs'->p_org::text->>'dob' = p.dob::text
                    -- confirmations made before this migration (single entry)
                    or (p.dob_confirmations->'org'->>'orgId' = p_org::text and p.dob_confirmations->'org'->>'dob' = p.dob::text)), false),
         case
           when p.verification->>'status' = 'approved' then 'document'
           when p.dob is not null and p.dob_confirmations->'org'->>'dob' = p.dob::text then 'school'
           when p.dob is not null and p.dob_confirmations->'parent'->>'dob' = p.dob::text then 'parent'
         end
    from players p
   where p.id in (select m.player_id from org_members m
                   where m.org_id = p_org and (m.until is null or m.until >= current_date)
                     and member_consented('org', m.org_id, m.player_id))  -- W2 (DB-14)
   order by p.full_name;
end $$;

create or replace function org_confirm_dobs(p_org uuid, p_players uuid[])
  returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  org_name text;
begin
  perform org_dob_access_or_raise(p_org);
  select name into org_name from organizations where id = p_org;
  perform set_config('app.trusted_rpc', 'on', true);
  update players p
     set dob_confirmations = coalesce(p.dob_confirmations, '{}'::jsonb)
         || jsonb_build_object(
              -- the latest (read by players_view, the passport, age badges)
              'org', jsonb_build_object('orgId', p_org, 'orgName', org_name, 'at', now(), 'by', auth.uid(), 'dob', p.dob),
              -- every school / club that confirmed it
              'orgs', coalesce(p.dob_confirmations->'orgs', '{}'::jsonb)
                      || jsonb_build_object(p_org::text, jsonb_build_object('orgName', org_name, 'at', now(), 'by', auth.uid(), 'dob', p.dob)))
   where p.id = any(coalesce(p_players, '{}'::uuid[])) and p.dob is not null
     and p.id in (select m.player_id from org_members m
                   where m.org_id = p_org and (m.until is null or m.until >= current_date)
                     and member_consented('org', m.org_id, m.player_id));  -- W2 (DB-14)
  get diagnostics n = row_count;
  perform set_config('app.trusted_rpc', 'off', true);
  return n;
end $$;

create or replace view players_view with (security_barrier = true) as
with me as materialized (
  -- Uncorrelated and MATERIALIZED → evaluated once per query, never per row.
  select auth.uid() is null as anon, auth.uid() as uid, my_player_circle() as circle,
         -- F-04b: the teams whose roster the caller may edit, once per query
         case when auth.uid() is null then '{}'::uuid[] else my_roster_editable_team_ids() end as editable
)
select
  p.id, p.profile_id,
  case when v.full then p.full_name else name_initials(p.full_name) end as full_name,
  p.jersey_no, p.sports, p.house_name, p.house_color,
  case when v.full then p.city end as city,
  case when v.full then p.school_id end as school_id,
  p.phone_verified, p.email_verified,
  case when v.full then p.photo_url end as photo_url,
  case when v.full then p.sport_details end as sport_details,
  p.created_at, p.updated_at, p.invited,
  case when v.full then p.gender end as gender,
  case when v.full then p.bio end as bio,
  p.reported_at,
  case when v.full then p.created_by end as created_by,
  p.show_phone, p.show_email,
  case when v.full then a.age end as age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null or not v.full then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  -- the person / guardian / support: everything; everyone else: "approved" or nothing
  case when a.priv then p.verification
       when v.full and p.verification->>'status' = 'approved' then '{"status":"approved"}'::jsonb
  end as verification,
  case when v.full then p.guardian_profile_id is not null end as guardian_linked,
  p.findable_by_contact,
  not v.full as restricted,
  -- fast lanes: how this player's age was verified (a level, nothing personal) —
  -- a confirmation only counts for the date of birth it confirmed
  case
    when p.verification->>'status' = 'approved' then 'document'
    when p.dob is not null and p.dob_confirmations->'org'->>'dob' = p.dob::text then 'school'
    when p.dob is not null and p.dob_confirmations->'parent'->>'dob' = p.dob::text then 'parent'
  end as age_verified_by
from players p
cross join me
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    -- = can_contact_provisional(p.id): signed in and on the roster of a team the caller may edit
    case when p.profile_id is null
         then not me.anon and exists (select 1 from teams t where t.id = any(me.editable) and t.roster ? p.id::text
                                        and member_consented('team', t.id, p.id))  -- W2
         else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
  offset 0  -- evaluate once per row (else the planner copies each call into every column that uses it)
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
  offset 0
) v;
grant select on players_view to anon, authenticated;
