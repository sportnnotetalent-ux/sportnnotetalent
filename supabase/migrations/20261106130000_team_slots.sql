-- Team slots: fixtures first, teams later (founder 2026-11-06;
-- docs/security/breaks/team-slots.md).
--
-- An organiser without their teams yet makes SLOTS (A1…A4, B1…B4, or Team 1…):
-- one-off team rows marked with the tournament they hold a place in, entered
-- in it, so fixtures can be generated between them. When a team comes in:
--  • name_tournament_slot — a brand-new team: the slot becomes it (same row,
--    same games), now a real team;
--  • fill_tournament_slot — a team already on SportnNote takes the slot's
--    place in THIS tournament's games and entry; the slot row is removed.
-- Every function checks can_manage_tournament. Slots are adhoc, so they never
-- show in Discover, search or anyone's team list.

alter table teams add column if not exists slot_tournament_id uuid references tournaments(id) on delete cascade;
create index if not exists teams_slot_tournament_idx on teams(slot_tournament_id) where slot_tournament_id is not null;

create or replace function create_tournament_slots(p_tournament uuid, p_sport text, p_names text[])
  returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  n text;
  tid uuid;
  ids uuid[] := '{}';
begin
  if auth.uid() is null or not can_manage_tournament(p_tournament) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_names), 0) not between 1 and 128 or p_sport is null or char_length(p_sport) not between 1 and 40
     or exists (select 1 from unnest(p_names) x where x is null or char_length(btrim(x)) not between 1 and 60) then
    raise exception 'bad_slots' using errcode = '22023';
  end if;
  foreach n in array p_names loop
    insert into teams (name, short_name, sport, adhoc, slot_tournament_id, created_by)
    values (btrim(n), left(btrim(n), 6), p_sport, true, p_tournament, auth.uid())
    returning id into tid;
    insert into tournament_teams (tournament_id, team_id, status) values (p_tournament, tid, 'confirmed');
    ids := ids || tid;
  end loop;
  return ids;
end $$;

-- The slot row, after the checks every slot change shares.
create or replace function tournament_slot_load(p_slot uuid)
  returns teams language plpgsql security definer set search_path = public as $$
declare s teams;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into s from teams where id = p_slot for update;
  if s.id is null or s.slot_tournament_id is null then raise exception 'not_a_slot' using errcode = '22023'; end if;
  if not can_manage_tournament(s.slot_tournament_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return s;
end $$;

-- A team already on SportnNote takes the slot's place in this tournament.
create or replace function fill_tournament_slot(p_slot uuid, p_team uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  s teams;
  t teams;
  e tournament_teams;
begin
  s := tournament_slot_load(p_slot);
  select * into t from teams where id = p_team;
  if t.id is null or t.slot_tournament_id is not null or t.sport is distinct from s.sport then
    raise exception 'wrong_team' using errcode = '22023';
  end if;
  if exists (select 1 from tournament_teams where tournament_id = s.slot_tournament_id and team_id = p_team)
     or exists (select 1 from matches where tournament_id = s.slot_tournament_id and p_team in (home_team_id, away_team_id)) then
    raise exception 'already_entered' using errcode = '23505';
  end if;
  if exists (select 1 from matches where tournament_id = s.slot_tournament_id and p_slot in (home_team_id, away_team_id)
             and status not in ('scheduled', 'postponed', 'cancelled')) then
    raise exception 'slot_started' using errcode = '42501';
  end if;
  select * into e from tournament_teams where tournament_id = s.slot_tournament_id and team_id = p_slot;
  perform set_config('app.trusted_rpc', 'on', true);
  update matches set home_team_id = p_team where tournament_id = s.slot_tournament_id and home_team_id = p_slot;
  update matches set away_team_id = p_team where tournament_id = s.slot_tournament_id and away_team_id = p_slot;
  -- same rule as adding a team: confirmed only when the organiser runs it, else invited
  insert into tournament_teams (tournament_id, team_id, status, category_id)
  values (s.slot_tournament_id, p_team, case when can_manage_team(p_team) then 'confirmed' else 'invited' end, e.category_id);
  delete from tournament_teams where tournament_id = s.slot_tournament_id and team_id = p_slot;
  perform set_config('app.trusted_rpc', 'off', true);
  -- the slot held no other place: remove it once nothing points at it
  if not exists (select 1 from matches where p_slot in (home_team_id, away_team_id)) then
    delete from teams where id = p_slot;
  end if;
end $$;

-- A brand-new team: the slot becomes it (same row, same games).
create or replace function name_tournament_slot(p_slot uuid, p_name text, p_short text)
  returns void language plpgsql security definer set search_path = public as $$
declare s teams;
begin
  s := tournament_slot_load(p_slot);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60
     or (p_short is not null and char_length(btrim(p_short)) > 6) then
    raise exception 'bad_name' using errcode = '22023';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update teams set name = btrim(p_name), short_name = coalesce(nullif(btrim(p_short), ''), left(btrim(p_name), 3)),
    adhoc = false, slot_tournament_id = null
    where id = p_slot;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

revoke all on function tournament_slot_load(uuid) from public, anon, authenticated;
revoke all on function create_tournament_slots(uuid, text, text[]) from public, anon, authenticated;
revoke all on function fill_tournament_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function name_tournament_slot(uuid, text, text) from public, anon, authenticated;
grant execute on function create_tournament_slots(uuid, text, text[]) to authenticated;
grant execute on function fill_tournament_slot(uuid, uuid) to authenticated;
grant execute on function name_tournament_slot(uuid, text, text) to authenticated;
