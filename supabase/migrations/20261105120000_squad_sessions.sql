-- Squad sessions (founder approved 2026-11-04; docs/product/squad-sessions.md,
-- break-it docs/security/breaks/squad-sessions.md).
--
-- A club's game day: the players present choose captains, the captains pick
-- teams in turn, and the teams play short games in rotation. Any player in the
-- session may change its rules; only captains pick, and only on their turn.
-- Session games are ordinary friendlies (no tournament), so they count under
-- each player's Friendly stats.
--
-- Every change goes through a function below (no write policies). Each one
-- takes the version the phone last saw and refuses a stale one
-- ('session_changed'), so two phones can't both act on the same moment.
-- The order of games is the app's rule (src/core/squadSession.ts); the server
-- checks the teams belong to the session and no game is still open.

create table if not exists squad_sessions (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references clubs(id) on delete set null,
  sport       text not null check (char_length(sport) between 1 and 40),
  -- team names are "<name> 1", "<name> 2", …
  name        text not null check (char_length(name) between 1 and 60),
  starts_at   timestamptz not null default now(),
  venue_name  text check (venue_name is null or char_length(venue_name) <= 120),
  status      text not null default 'setup' check (status in ('setup', 'picking', 'playing', 'ended')),
  players     uuid[] not null default '{}',
  captains    uuid[] not null default '{}',
  picks       jsonb not null default '[]',
  rules       jsonb not null default '{}',
  team_ids    uuid[] not null default '{}',
  version     integer not null default 1,
  created_by  uuid references players(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists squad_sessions_club_idx on squad_sessions(club_id, starts_at desc);
create index if not exists squad_sessions_players_idx on squad_sessions using gin (players);

alter table matches add column if not exists session_id uuid references squad_sessions(id) on delete set null;
create index if not exists matches_session_idx on matches(session_id) where session_id is not null;

alter table squad_sessions enable row level security;
drop policy if exists squad_sessions_read on squad_sessions;
create policy squad_sessions_read on squad_sessions for select using (true);
revoke insert, update, delete on squad_sessions from anon, authenticated;

-- Rules a phone may store (the app cleans them the same way, SS7).
create or replace function squad_rules_ok(r jsonb)
  returns boolean language sql immutable as $$
  select jsonb_typeof(r) = 'object'
     and jsonb_typeof(r->'teams') = 'number' and (r->>'teams')::numeric between 2 and 8 and (r->>'teams')::numeric = floor((r->>'teams')::numeric)
     and coalesce(r->>'rotation', 'round_robin') in ('round_robin', 'winner_stays')
     and coalesce(r->>'pickOrder', 'snake') in ('snake', 'straight')
     and coalesce(r->>'drawRule', 'longer_on_goes_off') in ('longer_on_goes_off', 'both_off')
     and (r->'maxWins' is null or (jsonb_typeof(r->'maxWins') = 'number' and (r->>'maxWins')::numeric between 1 and 10))
     and (r->'points' is null or (
           jsonb_typeof(r->'points') = 'object'
       and coalesce((r->'points'->>'win')::numeric, 3) between 0 and 10
       and coalesce((r->'points'->>'draw')::numeric, 1) between 0 and 10
       and coalesce((r->'points'->>'loss')::numeric, 0) between 0 and 10))
     and pg_column_size(r) < 2000;
$$;

-- The session, after the common checks (signed in, in it, not ended, the
-- version the phone saw). Locks the row.
create or replace function squad_session_load(p_id uuid, p_version integer)
  returns squad_sessions language plpgsql security definer set search_path = public as $$
declare s squad_sessions;
begin
  if auth.uid() is null then raise exception 'sign_in' using errcode = '42501'; end if;
  select * into s from squad_sessions where id = p_id for update;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (s.players && auth_player_ids()) then raise exception 'not_in_session' using errcode = '42501'; end if;
  if s.status = 'ended' then raise exception 'session_ended' using errcode = '42501'; end if;
  if p_version is distinct from s.version then raise exception 'session_changed' using errcode = '40001'; end if;
  return s;
end $$;

-- Whose pick is the n-th (0-based): snake 1,2,3,3,2,1 … or straight.
create or replace function squad_pick_turn(p_captains uuid[], p_n integer, p_order text)
  returns uuid language sql immutable as $$
  select case when coalesce(cardinality(p_captains), 0) = 0 then null
    when p_order = 'snake' and (p_n / cardinality(p_captains)) % 2 = 1
      then p_captains[cardinality(p_captains) - (p_n % cardinality(p_captains))]
    else p_captains[(p_n % cardinality(p_captains)) + 1] end;
$$;

-- Players still to pick: present, not a captain, not picked (in list order).
create or replace function squad_available(s squad_sessions)
  returns uuid[] language sql immutable as $$
  select coalesce(array_agg(p order by o), '{}') from unnest(s.players) with ordinality as u(p, o)
   where not p = any(s.captains)
     and not exists (select 1 from jsonb_array_elements(s.picks) k where (k->>'player')::uuid = p);
$$;

create or replace function squad_session_save(s squad_sessions)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare r squad_sessions;
begin
  update squad_sessions set status = s.status, players = s.players, captains = s.captains, picks = s.picks,
    rules = s.rules, team_ids = s.team_ids, version = s.version + 1, updated_at = now()
    where id = s.id returning * into r;
  return to_jsonb(r);
end $$;

create or replace function squad_session_create(p_sport text, p_name text, p_players uuid[], p_rules jsonb,
  p_club uuid default null, p_venue text default null, p_starts timestamptz default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  ps uuid[];
  r squad_sessions;
begin
  if auth.uid() is null then raise exception 'sign_in' using errcode = '42501'; end if;
  me := (auth_player_ids())[1];
  if me is null then raise exception 'no_player' using errcode = '42501'; end if;
  if cardinality(coalesce(p_players, '{}')) > 100 then raise exception 'too_many_players' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x), '{}') into ps from unnest(coalesce(p_players, '{}') || me) x;
  if cardinality(ps) > 100 then raise exception 'too_many_players' using errcode = '22023'; end if;
  if (select count(*) from players where id = any(ps)) <> cardinality(ps) then raise exception 'unknown_player' using errcode = '22023'; end if;
  if not squad_rules_ok(coalesce(p_rules, '{}') || jsonb_build_object('teams', coalesce(p_rules->'teams', '3'::jsonb))) then
    raise exception 'bad_rules' using errcode = '22023';
  end if;
  if p_club is not null and not exists (select 1 from club_members where club_id = p_club and player_id = any(auth_player_ids()))
     and not exists (select 1 from clubs where id = p_club and created_by = auth.uid()) then
    raise exception 'not_in_club' using errcode = '42501';
  end if;
  insert into squad_sessions (club_id, sport, name, starts_at, venue_name, players, rules, created_by)
  values (p_club, p_sport, btrim(p_name), coalesce(p_starts, now()), nullif(btrim(p_venue), ''), ps,
          coalesce(p_rules, '{}') || jsonb_build_object('teams', coalesce(p_rules->'teams', '3'::jsonb)), me)
  returning * into r;
  return to_jsonb(r);
end $$;

create or replace function squad_session_set_rules(p_id uuid, p_rules jsonb, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions;
begin
  s := squad_session_load(p_id, p_version);
  if not squad_rules_ok(p_rules) then raise exception 'bad_rules' using errcode = '22023'; end if;
  -- the number of teams is fixed once captains are chosen
  if s.status <> 'setup' and (p_rules->>'teams')::int <> (s.rules->>'teams')::int then
    raise exception 'teams_locked' using errcode = '42501';
  end if;
  s.rules := p_rules;
  return squad_session_save(s);
end $$;

create or replace function squad_session_set_players(p_id uuid, p_players uuid[], p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions; ps uuid[];
begin
  s := squad_session_load(p_id, p_version);
  if s.status <> 'setup' then raise exception 'players_locked' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct v), '{}') into ps from unnest(coalesce(p_players, '{}')) v;
  if cardinality(ps) > 100 then raise exception 'too_many_players' using errcode = '22023'; end if;
  if (select count(*) from players where id = any(ps)) <> cardinality(ps) then raise exception 'unknown_player' using errcode = '22023'; end if;
  if cardinality(ps) < 2 then raise exception 'too_few_players' using errcode = '22023'; end if;
  s.players := ps;
  return squad_session_save(s);
end $$;

create or replace function squad_session_set_captains(p_id uuid, p_captains uuid[], p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions;
begin
  s := squad_session_load(p_id, p_version);
  if s.status not in ('setup', 'picking') then raise exception 'teams_made' using errcode = '42501'; end if;
  if jsonb_array_length(s.picks) > 0 then raise exception 'picks_started' using errcode = '42501'; end if;
  if cardinality(coalesce(p_captains, '{}')) <> (s.rules->>'teams')::int
     or (select count(distinct c) from unnest(p_captains) c) <> cardinality(p_captains)
     or not (p_captains <@ s.players) then
    raise exception 'bad_captains' using errcode = '22023';
  end if;
  s.captains := p_captains;
  s.status := 'picking';
  return squad_session_save(s);
end $$;

create or replace function squad_session_restart_picks(p_id uuid, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions;
begin
  s := squad_session_load(p_id, p_version);
  if s.status <> 'picking' then raise exception 'not_picking' using errcode = '42501'; end if;
  s.picks := '[]';
  return squad_session_save(s);
end $$;

create or replace function squad_session_pick(p_id uuid, p_player uuid, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions; turn uuid;
begin
  s := squad_session_load(p_id, p_version);
  if s.status <> 'picking' then raise exception 'not_picking' using errcode = '42501'; end if;
  turn := squad_pick_turn(s.captains, jsonb_array_length(s.picks), coalesce(s.rules->>'pickOrder', 'snake'));
  if turn is null or not turn = any(auth_player_ids()) then raise exception 'not_your_pick' using errcode = '42501'; end if;
  if not p_player = any(squad_available(s)) then raise exception 'not_available' using errcode = '22023'; end if;
  s.picks := s.picks || jsonb_build_array(jsonb_build_object('captain', turn, 'player', p_player));
  return squad_session_save(s);
end $$;

-- "Share out the rest": the remaining players go to captains in pick order.
create or replace function squad_session_share_rest(p_id uuid, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions; p uuid; ord text;
begin
  s := squad_session_load(p_id, p_version);
  if s.status <> 'picking' then raise exception 'not_picking' using errcode = '42501'; end if;
  ord := coalesce(s.rules->>'pickOrder', 'snake');
  foreach p in array squad_available(s) loop
    s.picks := s.picks || jsonb_build_array(jsonb_build_object(
      'captain', squad_pick_turn(s.captains, jsonb_array_length(s.picks), ord), 'player', p));
  end loop;
  return squad_session_save(s);
end $$;

-- Everyone picked → one short-lived team per captain: "<name> 1", "<name> 2", …
create or replace function squad_session_make_teams(p_id uuid, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions; i int; tid uuid; ids uuid[] := '{}'; roster jsonb;
begin
  s := squad_session_load(p_id, p_version);
  if s.status <> 'picking' then raise exception 'not_picking' using errcode = '42501'; end if;
  if cardinality(squad_available(s)) > 0 then raise exception 'picks_unfinished' using errcode = '42501'; end if;
  for i in 1 .. cardinality(s.captains) loop
    select to_jsonb(array[s.captains[i]]) || coalesce(jsonb_agg(k->'player' order by o), '[]') into roster
      from jsonb_array_elements(s.picks) with ordinality as e(k, o) where (k->>'captain')::uuid = s.captains[i];
    insert into teams (name, short_name, sport, adhoc, roster, captain_id, created_by)
    values (s.name || ' ' || i, left(s.name, 3) || i, s.sport, true, roster, s.captains[i], auth.uid())
    returning id into tid;
    ids := ids || tid;
  end loop;
  s.team_ids := ids;
  s.status := 'playing';
  return squad_session_save(s);
end $$;

-- The next game (teams by index, 0-based): a friendly every player may score.
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
          s.players, s.players, me, true, '{}', 'scheduled')
  returning id into mid;
  perform set_config('app.trusted_rpc', 'off', true);
  perform squad_session_save(s);
  return mid;
end $$;

create or replace function squad_session_end(p_id uuid, p_version integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare s squad_sessions;
begin
  s := squad_session_load(p_id, p_version);
  s.status := 'ended';
  return squad_session_save(s);
end $$;

-- Only signed-in callers, only through the entry points.
do $$
declare f text;
begin
  foreach f in array array[
    'squad_session_load(uuid, integer)', 'squad_session_save(squad_sessions)', 'squad_available(squad_sessions)',
    'squad_session_create(text, text, uuid[], jsonb, uuid, text, timestamptz)',
    'squad_session_set_rules(uuid, jsonb, integer)', 'squad_session_set_players(uuid, uuid[], integer)',
    'squad_session_set_captains(uuid, uuid[], integer)', 'squad_session_restart_picks(uuid, integer)',
    'squad_session_pick(uuid, uuid, integer)', 'squad_session_share_rest(uuid, integer)',
    'squad_session_make_teams(uuid, integer)', 'squad_session_next_game(uuid, integer, integer, integer)',
    'squad_session_end(uuid, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'squad_session_create(text, text, uuid[], jsonb, uuid, text, timestamptz)',
    'squad_session_set_rules(uuid, jsonb, integer)', 'squad_session_set_players(uuid, uuid[], integer)',
    'squad_session_set_captains(uuid, uuid[], integer)', 'squad_session_restart_picks(uuid, integer)',
    'squad_session_pick(uuid, uuid, integer)', 'squad_session_share_rest(uuid, integer)',
    'squad_session_make_teams(uuid, integer)', 'squad_session_next_game(uuid, integer, integer, integer)',
    'squad_session_end(uuid, integer)'] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
