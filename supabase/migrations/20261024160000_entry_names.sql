-- ============================================================================
--  Singles / doubles entries: a child's full name is never stored in public
--  team names (founder, 2026-10-24; docs/privacy/ids-only-scoring.md, close-out)
--
--  An individual or pair entry is a one- or two-person team named after its
--  players ("Meera Rao", "Meera Rao / Asha Kumar" — participantEntry.entryName).
--  Team names are public (logged out too) and are copied into each player's
--  stat lines as the opponent, so a child who played singles showed by full
--  name to anyone.
--
--  1. mask_minor_names(label, player ids): each possible minor's full name in
--     the label → initials (name_initials, "M. R."). Possible minor = the
--     players_view rule (under 18, or no date of birth).
--  2. teams.entry_ids: set by a trigger when a team IS an entry (its name is its
--     1–2 roster players' names, either order, full or already masked); the
--     stored name is then masked. The app rebuilds the name for display from
--     entry_ids through players_view, so the child's circle still sees full
--     names and everyone else the stored initials.
--  3. stat_lines.opponent: masked with both sides' entry players.
--  4. home_feed: returns each side's entry_ids (otherwise unchanged from
--     20261023100000).
--
--  Adults are unchanged. Backfills existing entries and stat lines.
-- ============================================================================

-- ---------- 1. mask_minor_names ------------------------------------------------
create or replace function mask_minor_names(p_label text, p_players uuid[])
  returns text language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v text := p_label;
  n text;
  ini text;
  pos int;
  i int;
begin
  if v is null or p_players is null or cardinality(p_players) = 0 then return v; end if;
  for r in
    select full_name from players
     where id = any(p_players) and not player_is_known_adult(dob, profile_id)
       and length(trim(coalesce(full_name, ''))) >= 2
     order by length(full_name) desc
  loop
    n := regexp_replace(trim(r.full_name), '\s+', ' ', 'g');
    ini := name_initials(n);
    pos := 1;
    loop  -- every occurrence, case-insensitive; resume after the replacement
      i := strpos(lower(substr(v, pos)), lower(n));
      exit when i = 0;
      i := i + pos - 1;
      v := overlay(v placing ini from i for length(n));
      pos := i + length(ini);
    end loop;
  end loop;
  return v;
end $$;
revoke all on function mask_minor_names(text, uuid[]) from public, anon, authenticated;

-- ---------- 2. teams: entries ---------------------------------------------------
alter table teams add column if not exists entry_ids uuid[];

create or replace function teams_entry_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  fwd text;
  rev text;
  nm text;
begin
  ids := case when jsonb_typeof(new.roster) = 'array' then array(
           select r.v::uuid from jsonb_array_elements_text(new.roster) with ordinality as r(v, o)
            where r.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            order by r.o) end;
  if coalesce(cardinality(ids), 0) not between 1 and 2 then
    new.entry_ids := null;
    return new;
  end if;
  select string_agg(s.n, ' / ' order by s.o), string_agg(s.n, ' / ' order by s.o desc) into fwd, rev
    from (select regexp_replace(trim(p.full_name), '\s+', ' ', 'g') as n, u.o
            from unnest(ids) with ordinality as u(id, o) join players p on p.id = u.id) s;
  if fwd is null then new.entry_ids := null; return new; end if;
  nm := lower(regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g'));
  if nm in (lower(fwd), lower(rev), lower(mask_minor_names(fwd, ids)), lower(mask_minor_names(rev, ids))) then
    new.entry_ids := ids;
    new.name := mask_minor_names(new.name, ids);
  else
    new.entry_ids := null;  -- a team with its own name (or renamed): not an entry
  end if;
  return new;
end $$;
drop trigger if exists teams_entry_names on teams;
-- named after guard_team_write / stamp_created_by, so it runs after them
create trigger teams_entry_names before insert or update of name, roster on teams
  for each row execute function teams_entry_names();

-- Existing entries (fires the trigger; guards skip non-app writes).
update teams set roster = roster
 where jsonb_typeof(roster) = 'array' and jsonb_array_length(roster) between 1 and 2;

-- ---------- 3. stat_lines.opponent ----------------------------------------------
create or replace function stat_lines_mask_opponent()
  returns trigger language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if new.opponent is null or new.match_id is null then return new; end if;
  select coalesce(h.entry_ids, '{}') || coalesce(a.entry_ids, '{}') into ids
    from matches m
    left join teams h on h.id = m.home_team_id
    left join teams a on a.id = m.away_team_id
   where m.id = new.match_id;
  if coalesce(cardinality(ids), 0) > 0 then new.opponent := mask_minor_names(new.opponent, ids); end if;
  return new;
end $$;
drop trigger if exists stat_lines_mask_opponent on stat_lines;
create trigger stat_lines_mask_opponent before insert or update of opponent on stat_lines
  for each row execute function stat_lines_mask_opponent();

update stat_lines set opponent = opponent
 where opponent is not null and match_id in (
   select m.id from matches m join teams t on t.id in (m.home_team_id, m.away_team_id)
    where t.entry_ids is not null);

-- ---------- 4. home_feed: each side's entry_ids -----------------------------------
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
           m.format, m.state, m.result,
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

-- ============================================================================
--  End. Then publish the app (it shows entry names from entry_ids). Before the
--  app update, the circle sees the stored initials on children's entries too.
-- ============================================================================
