-- Squad sessions v2 (founder 2026-11-06; docs/security/breaks/squad-sessions.md SS17–SS23).
--
--  • One shared phone (SS18/SS19): rules.pickOn = 'own' (default — only the
--    captain on turn, from their own account) or 'shared' (any player in the
--    session picks FOR the captain on turn — still only on turn, still only
--    available players).
--  • Game settings (SS20–SS22): squad_sessions.format, set once with the sport's
--    own rules; every NEW game copies it. A game keeps the settings it started with.
--  • Guests and no-team sessions (SS17/SS23) needed no server change: players
--    are any player rows, club_id may be null.
--
-- Replaces squad_rules_ok, squad_session_save, squad_session_pick and
-- squad_session_next_game from their latest bodies (20261105120000), with every
-- existing check kept.

alter table squad_sessions add column if not exists format jsonb not null default '{}';
alter table squad_sessions drop constraint if exists squad_sessions_format_object;
alter table squad_sessions add constraint squad_sessions_format_object check (jsonb_typeof(format) = 'object');

create or replace function squad_rules_ok(r jsonb)
  returns boolean language sql immutable as $$
  select jsonb_typeof(r) = 'object'
     and jsonb_typeof(r->'teams') = 'number' and (r->>'teams')::numeric between 2 and 8 and (r->>'teams')::numeric = floor((r->>'teams')::numeric)
     and coalesce(r->>'rotation', 'round_robin') in ('round_robin', 'winner_stays')
     and coalesce(r->>'pickOrder', 'snake') in ('snake', 'straight')
     and coalesce(r->>'pickOn', 'own') in ('own', 'shared')
     and coalesce(r->>'drawRule', 'longer_on_goes_off') in ('longer_on_goes_off', 'both_off')
     and (r->'maxWins' is null or (jsonb_typeof(r->'maxWins') = 'number' and (r->>'maxWins')::numeric between 1 and 10))
     and (r->'points' is null or (
           jsonb_typeof(r->'points') = 'object'
       and coalesce((r->'points'->>'win')::numeric, 3) between 0 and 10
       and coalesce((r->'points'->>'draw')::numeric, 1) between 0 and 10
       and coalesce((r->'points'->>'loss')::numeric, 0) between 0 and 10))
     and pg_column_size(r) < 2000;
$$;

create or replace function squad_session_save(s squad_sessions)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare r squad_sessions;
begin
  update squad_sessions set status = s.status, players = s.players, captains = s.captains, picks = s.picks,
    rules = s.rules, team_ids = s.team_ids, format = s.format, version = s.version + 1, updated_at = now()
    where id = s.id returning * into r;
  return to_jsonb(r);
end $$;

create or replace function squad_session_pick(p_id uuid, p_player uuid, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions; turn uuid;
begin
  s := squad_session_load(p_id, p_version);  -- signed in, in the session, not ended, fresh version
  if s.status <> 'picking' then raise exception 'not_picking' using errcode = '42501'; end if;
  turn := squad_pick_turn(s.captains, jsonb_array_length(s.picks), coalesce(s.rules->>'pickOrder', 'snake'));
  if turn is null then raise exception 'not_your_pick' using errcode = '42501'; end if;
  -- own phones: only the captain on turn; one shared phone: anyone in the session, for that captain
  if coalesce(s.rules->>'pickOn', 'own') <> 'shared' and not turn = any(auth_player_ids()) then
    raise exception 'not_your_pick' using errcode = '42501';
  end if;
  if not p_player = any(squad_available(s)) then raise exception 'not_available' using errcode = '22023'; end if;
  s.picks := s.picks || jsonb_build_array(jsonb_build_object('captain', turn, 'player', p_player));
  return squad_session_save(s);
end $$;

-- Game settings for the session's next games (the sport's own format keys).
create or replace function squad_session_set_format(p_id uuid, p_format jsonb, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions;
begin
  s := squad_session_load(p_id, p_version);
  if p_format is null or jsonb_typeof(p_format) <> 'object' or pg_column_size(p_format) > 8000 then
    raise exception 'bad_format' using errcode = '22023';
  end if;
  s.format := p_format;
  return squad_session_save(s);
end $$;

create or replace function squad_session_next_game(p_id uuid, p_home integer, p_away integer, p_version integer)
  returns uuid language plpgsql security definer set search_path = public as $$
declare s squad_sessions; mid uuid; me uuid;
begin
  s := squad_session_load(p_id, p_version);
  if s.status <> 'playing' then raise exception 'not_playing' using errcode = '42501'; end if;
  select v into me from unnest(auth_player_ids()) v where v = any(s.players) limit 1;
  if p_home is null or p_away is null or p_home = p_away
     or p_home < 0 or p_away < 0 or p_home >= cardinality(s.team_ids) or p_away >= cardinality(s.team_ids) then
    raise exception 'bad_teams' using errcode = '22023';
  end if;
  if exists (select 1 from matches where session_id = p_id and status in ('scheduled', 'live')) then
    raise exception 'game_open' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  insert into matches (sport, tournament_id, session_id, home_team_id, away_team_id, starts_at, venue_name,
                       host_ids, scorer_ids, scorer_id, shared_scoring, format, status)
  values (s.sport, null, p_id, s.team_ids[p_home + 1], s.team_ids[p_away + 1], now(), s.venue_name,
          s.players, s.players, me, true, coalesce(s.format, '{}'), 'scheduled')
  returning id into mid;
  perform set_config('app.trusted_rpc', 'off', true);
  perform squad_session_save(s);
  return mid;
end $$;

revoke all on function squad_session_save(squad_sessions) from public, anon, authenticated;
revoke all on function squad_session_set_format(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function squad_session_set_format(uuid, jsonb, integer) to authenticated;
revoke all on function squad_session_pick(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function squad_session_pick(uuid, uuid, integer) to authenticated;
revoke all on function squad_session_next_game(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function squad_session_next_game(uuid, integer, integer, integer) to authenticated;
