-- Fill a slot with a team already in the tournament (docs/security/breaks/slot-fill-existing.md).
-- Same as 20261106130000_team_slots.sql's fill_tournament_slot, except a team
-- already entered may take a slot while it has no game in the tournament yet
-- (SL1: one with a game is still refused). Its entry is kept (SL2/SL3).
create or replace function fill_tournament_slot(p_slot uuid, p_team uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  s teams;
  t teams;
  e tournament_teams;
  entered boolean;
begin
  s := tournament_slot_load(p_slot);
  select * into t from teams where id = p_team;
  if t.id is null or t.slot_tournament_id is not null or t.sport is distinct from s.sport then
    raise exception 'wrong_team' using errcode = '22023';
  end if;
  if exists (select 1 from matches where tournament_id = s.slot_tournament_id and p_team in (home_team_id, away_team_id)) then
    raise exception 'already_entered' using errcode = '23505';
  end if;
  entered := exists (select 1 from tournament_teams where tournament_id = s.slot_tournament_id and team_id = p_team);
  if exists (select 1 from matches where tournament_id = s.slot_tournament_id and p_slot in (home_team_id, away_team_id)
             and status not in ('scheduled', 'postponed', 'cancelled')) then
    raise exception 'slot_started' using errcode = '42501';
  end if;
  select * into e from tournament_teams where tournament_id = s.slot_tournament_id and team_id = p_slot;
  perform set_config('app.trusted_rpc', 'on', true);
  update matches set home_team_id = p_team where tournament_id = s.slot_tournament_id and home_team_id = p_slot;
  update matches set away_team_id = p_team where tournament_id = s.slot_tournament_id and away_team_id = p_slot;
  -- same rule as adding a team: confirmed only when the organiser runs it, else invited;
  -- a team already entered keeps its entry as it is
  if not entered then
    insert into tournament_teams (tournament_id, team_id, status, category_id)
    values (s.slot_tournament_id, p_team, case when can_manage_team(p_team) then 'confirmed' else 'invited' end, e.category_id);
  end if;
  delete from tournament_teams where tournament_id = s.slot_tournament_id and team_id = p_slot;
  perform set_config('app.trusted_rpc', 'off', true);
  -- the slot held no other place: remove it once nothing points at it
  if not exists (select 1 from matches where p_slot in (home_team_id, away_team_id)) then
    delete from teams where id = p_slot;
  end if;
end $$;
