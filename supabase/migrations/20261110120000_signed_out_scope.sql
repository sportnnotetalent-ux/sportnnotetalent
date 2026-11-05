-- Signed-out reads limited to the shared item (founder 2026-11-05;
-- docs/security/breaks/signed-out-scope.md). While signed out the app sends
-- `x-share: <kind>:<uuid>` for the page in view; anon read policies return only
-- the rows that page needs. Signed-in policies are unchanged (re-targeted to
-- `authenticated`). Undo: drop the anon policies, `alter policy … to public`.

-- The shared item named by the request header, or nothing (SO3: strict format).
create or replace function share_ref(out kind text, out ref uuid)
  returns setof record language plpgsql stable set search_path = public as $$
declare h text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-share';
  exception when others then return;
  end;
  if h is null or h !~ '^(m|t|p|team|e|h):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  kind := split_part(h, ':', 1); ref := split_part(h, ':', 2)::uuid;
  return next;
end $$;
revoke all on function share_ref() from public;
grant execute on function share_ref() to anon, authenticated;

-- The rows a shared page needs, by kind: m match, t tournament, team, p player,
-- e golf round / results event, h school hall of fame. Owner rights (reads
-- past RLS); returns only ids.
create or replace function share_scope() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  k text; r uuid;
  m uuid[] := '{}'; t uuid[] := '{}'; tm uuid[] := '{}'; pl uuid[] := '{}';
  o uuid[] := '{}'; ev uuid[] := '{}'; cl uuid[] := '{}';
begin
  select s.kind, s.ref into k, r from share_ref() s;
  if k is null then return '{}'::jsonb; end if;
  if k = 'm' then
    m := array(select id from matches where id = r);
  elsif k = 't' then
    t := array(select id from tournaments where id = r);
    m := array(select id from matches where tournament_id = any(t));
    tm := array(select team_id from tournament_teams where tournament_id = any(t));
    ev := array(select id from field_events where tournament_id = any(t));
  elsif k = 'team' then
    tm := array(select id from teams where id = r);
    m := array(select id from matches where home_team_id = any(tm) or away_team_id = any(tm));
  elsif k = 'p' then
    pl := array(select id from players where id = r);
    tm := array(select id from teams where jsonb_typeof(roster) = 'array' and roster ? r::text);
    m := array(select match_id from stat_lines where player_id = r and match_id is not null
               union select id from matches where home_team_id = any(tm) or away_team_id = any(tm));
    ev := array(select event_id from field_entries where player_id = r);
  elsif k = 'e' then
    ev := array(select id from field_events where id = r);
    t := array(select tournament_id from field_events where id = any(ev) and tournament_id is not null);
  elsif k = 'h' then
    o := array(select id from organizations where id = r);
    pl := array(select player_id from org_members where org_id = any(o));
  end if;
  -- a match brings its two teams and its tournament; its stat lines' players
  tm := tm || array(select unnest(array[home_team_id, away_team_id]) from matches where id = any(m));
  t := t || array(select tournament_id from matches where id = any(m) and tournament_id is not null);
  pl := pl || array(select player_id from stat_lines where match_id = any(m) and player_id is not null);
  -- an event brings its entrants; a team its roster and club; a tournament its host
  pl := pl || array(select player_id from field_entries where event_id = any(ev) and player_id is not null);
  pl := pl || array(select x::uuid from teams, jsonb_array_elements_text(case when jsonb_typeof(teams.roster) = 'array' then teams.roster else '[]'::jsonb end) x
                    where teams.id = any(tm) and x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  cl := array(select club_id from teams where id = any(tm) and club_id is not null);
  o := o || array(select host_org_id from tournaments where id = any(t) and host_org_id is not null);
  return jsonb_build_object('m', m, 't', t, 'tm', tm, 'p', pl, 'o', o, 'e', ev, 'c', cl);
end $$;
revoke all on function share_scope() from public;
grant execute on function share_scope() to anon, authenticated;

-- One kind's ids. Policies call it as `(select share_ids('m'))`, once per query (SO9).
create or replace function share_ids(p_kind text) returns uuid[]
  language sql stable set search_path = public as $$
  select coalesce(array(select jsonb_array_elements_text(share_scope() -> p_kind)::uuid), '{}'::uuid[])
$$;
revoke all on function share_ids(text) from public;
grant execute on function share_ids(text) to anon, authenticated;

-- SO6: is this match / round live now? (owner rights: the policy runs as anon)
create or replace function share_match_live(p_match uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where id = p_match and status = 'live')
$$;
create or replace function share_event_live(p_event uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from field_events where id = p_event and status = 'live')
$$;
revoke all on function share_match_live(uuid) from public;
revoke all on function share_event_live(uuid) from public;
grant execute on function share_match_live(uuid) to anon, authenticated;
grant execute on function share_event_live(uuid) to anon, authenticated;

-- SO5: every open read policy on these tables keeps working for signed-in users only.
do $$
declare r record;
begin
  for r in
    select p.polname, c.relname from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and p.polcmd = 'r'
      and c.relname in ('matches', 'match_events', 'match_lineups', 'match_squads', 'match_disputes', 'match_view_counts', 'stat_lines', 'tournaments',
        'tournament_teams', 'tournament_categories', 'tournament_officials', 'tournament_ownership_events',
        'teams', 'team_members', 'team_player_roles', 'team_staff', 'clubs', 'club_members',
        'field_events', 'field_entries', 'organizations', 'player_sport_profiles',
        'listings', 'activity_log', 'squad_sessions', 'schools')
      and (0 = any(p.polroles) or (select oid from pg_roles where rolname = 'anon') = any(p.polroles))
  loop
    execute format('alter policy %I on %I to authenticated', r.polname, r.relname);
  end loop;
end $$;

-- Signed-out: only the shared item's rows (SO1/SO2/SO7).
drop policy if exists "anon_share_read" on matches;
create policy "anon_share_read" on matches for select to anon using (id = any((select share_ids('m'))::uuid[]));
drop policy if exists "anon_share_read" on match_events;
create policy "anon_share_read" on match_events for select to anon using (match_id = any((select share_ids('m'))::uuid[]) or share_match_live(match_id));
drop policy if exists "anon_share_read" on match_lineups;
create policy "anon_share_read" on match_lineups for select to anon using (match_id = any((select share_ids('m'))::uuid[]));
drop policy if exists "anon_share_read" on match_squads;
create policy "anon_share_read" on match_squads for select to anon using (match_id = any((select share_ids('m'))::uuid[]));
drop policy if exists "anon_share_read" on match_disputes;
create policy "anon_share_read" on match_disputes for select to anon using (match_id = any((select share_ids('m'))::uuid[]));
drop policy if exists "anon_share_read" on match_view_counts;
create policy "anon_share_read" on match_view_counts for select to anon using (match_id = any((select share_ids('m'))::uuid[]));
drop policy if exists "anon_share_read" on stat_lines;
create policy "anon_share_read" on stat_lines for select to anon using (match_id = any((select share_ids('m'))::uuid[]) or event_id = any((select share_ids('e'))::uuid[]));
drop policy if exists "anon_share_read" on tournaments;
create policy "anon_share_read" on tournaments for select to anon using (id = any((select share_ids('t'))::uuid[]));
drop policy if exists "anon_share_read" on tournament_teams;
create policy "anon_share_read" on tournament_teams for select to anon using (tournament_id = any((select share_ids('t'))::uuid[]));
drop policy if exists "anon_share_read" on tournament_categories;
create policy "anon_share_read" on tournament_categories for select to anon using (tournament_id = any((select share_ids('t'))::uuid[]));
drop policy if exists "anon_share_read" on tournament_officials;
create policy "anon_share_read" on tournament_officials for select to anon using (tournament_id = any((select share_ids('t'))::uuid[]));
drop policy if exists "anon_share_read" on tournament_ownership_events;
create policy "anon_share_read" on tournament_ownership_events for select to anon using (tournament_id = any((select share_ids('t'))::uuid[]));
drop policy if exists "anon_share_read" on teams;
create policy "anon_share_read" on teams for select to anon using (id = any((select share_ids('tm'))::uuid[]));
drop policy if exists "anon_share_read" on team_members;
create policy "anon_share_read" on team_members for select to anon using (team_id = any((select share_ids('tm'))::uuid[]));
drop policy if exists "anon_share_read" on team_player_roles;
create policy "anon_share_read" on team_player_roles for select to anon using (team_id = any((select share_ids('tm'))::uuid[]));
drop policy if exists "anon_share_read" on team_staff;
create policy "anon_share_read" on team_staff for select to anon using (team_id = any((select share_ids('tm'))::uuid[]));
drop policy if exists "anon_share_read" on clubs;
create policy "anon_share_read" on clubs for select to anon using (id = any((select share_ids('c'))::uuid[]));
drop policy if exists "anon_share_read" on club_members;
create policy "anon_share_read" on club_members for select to anon using (club_id = any((select share_ids('c'))::uuid[]));
drop policy if exists "anon_share_read" on field_events;
create policy "anon_share_read" on field_events for select to anon using (id = any((select share_ids('e'))::uuid[]) or tournament_id = any((select share_ids('t'))::uuid[]));
-- SO6: a live round's entries feed signed-out live pages (realtime has no header)
drop policy if exists "anon_share_read" on field_entries;
create policy "anon_share_read" on field_entries for select to anon using (event_id = any((select share_ids('e'))::uuid[])
  or share_event_live(event_id));
drop policy if exists "anon_share_read" on organizations;
create policy "anon_share_read" on organizations for select to anon using (id = any((select share_ids('o'))::uuid[]));
drop policy if exists "anon_share_read" on player_sport_profiles;
create policy "anon_share_read" on player_sport_profiles for select to anon using (player_id = any((select share_ids('p'))::uuid[]));
-- SO8: listings, activity log, squad sessions, schools — signed-in only (no anon policy).

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
                                        and editable_team_member_consented(t.id, p.id))  -- W2; 2026-10-29: callable by the reader
         else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
  offset 0  -- evaluate once per row (else the planner copies each call into every column that uses it)
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
  offset 0
) v
-- signed-out-scope.md SO1/SO4: signed out (role anon), only the shared item's players;
-- owner-rights functions run as the owner, so current_user isn't anon there
where current_user <> 'anon' or p.id = any((select share_ids('p'))::uuid[]);

