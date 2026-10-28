-- ============================================================================
--  Security Wave 3B — results you can trust (docs/security/audit-2026-10-27/PLAN.md)
--  tests/db-wave3.test.mts · docs/security/breaks/security-wave3.md
--
--  DB-12  stat lines and certificates only for players who took part: on one
--         of the match's teams (or entered in the event / tournament) — and,
--         for a possible minor, a link their side agreed to. Other rows are
--         skipped silently (never an error, so a whole sync isn't lost).
--         "Not us" also removes the child's lines from that group's games.
--  DB-13  a finished result is final: its tournament's organisers can change
--         it any time; its scorers and hosts for 24 hours after it ended (the
--         app's own rule, CL-17, now on the server); support always. Only
--         organisers take a match or round out of its tournament, wind a
--         tournament match back (after its first 30 minutes) or delete a
--         tournament fixture. An event's time can't be set in the future.
-- ============================================================================

-- ---------- DB-13: when did a match end, and who may still change it ----------------------
-- W3B-14: the first time it finished, kept on the match (the app can't set it;
-- reopening and finishing again doesn't move it; a full reset clears it).
alter table matches add column if not exists completed_at timestamptz;

create or replace function matches_completed_at()
  returns trigger language plpgsql set search_path = public as $$
begin
  if is_client_request() then
    new.completed_at := case when tg_op = 'UPDATE' then old.completed_at end;
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status in ('scheduled', 'postponed', 'cancelled') then
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists matches_completed_at on matches;
create trigger matches_completed_at before insert or update on matches
  for each row execute function matches_completed_at();

-- Matches finished before this migration: their last scoring event, else the
-- time of a result entered by hand, else their last change.
create or replace function match_completed_at(p_match uuid)
  returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  t timestamptz;
begin
  select m.completed_at into t from matches m where m.id = p_match;
  if t is not null then return t; end if;
  select max(e.created_at) into t from match_events e where e.match_id = p_match and e.type <> 'AMEND';
  select m.result into r from matches m where m.id = p_match;
  begin
    if jsonb_typeof(r) = 'object' and jsonb_typeof(r->'at') = 'string' then t := greatest(t, (r->>'at')::timestamptz); end if;
  exception when others then null;   -- an unreadable time is ignored
  end;
  return t;
end $$;
revoke all on function match_completed_at(uuid) from public, anon, authenticated;
update matches m set completed_at = coalesce(match_completed_at(m.id), m.updated_at)
 where m.status = 'completed' and m.completed_at is null;

create or replace function can_correct_match(p_match uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select is_support() or exists (
    select 1 from matches m where m.id = p_match and (
         (m.tournament_id is not null and can_manage_tournament(m.tournament_id))
      or (can_manage_match(m.id) and coalesce(match_completed_at(m.id), now()) > now() - interval '24 hours')));
$$;
revoke all on function can_correct_match(uuid) from public, anon, authenticated;

create or replace function guard_match_final()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or is_support() then return new; end if;
  if old.status = 'completed'
     and (new.status, new.winner, new.result, new.state, new.format, new.home_team_id, new.away_team_id, new.tournament_id)
         is distinct from (old.status, old.winner, old.result, old.state, old.format, old.home_team_id, old.away_team_id, old.tournament_id)
     and not can_correct_match(old.id) then
    raise exception 'This match is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  if old.tournament_id is not null and not can_manage_tournament(old.tournament_id) then
    if new.tournament_id is distinct from old.tournament_id then
      raise exception 'Only the tournament''s organisers can take a match out of it' using errcode = '42501';
    end if;
    -- "Reset match" after a mistaken start: the scorer's for the first 30 minutes
    if old.status in ('live', 'completed') and new.status in ('scheduled', 'postponed', 'cancelled')
       and exists (select 1 from match_events e where e.match_id = old.id and e.created_at < now() - interval '30 minutes') then
      raise exception 'Only the tournament''s organisers can wind this match back' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_match_final on matches;
create trigger guard_match_final before update on matches for each row execute function guard_match_final();

-- Events: the scoring lock as before, then the finished-match rule; no future times.
create or replace function guard_match_event_write()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid := coalesce(new.match_id, old.match_id);
  m matches%rowtype;
begin
  if not is_client_request() then return coalesce(new, old); end if;
  select * into m from matches where id = mid;
  if scoring_lock_enforced(m.status, m.active_scorer_id)
     and not (m.active_scorer_id = any(auth_player_ids())) then
    raise exception 'not_active_scorer' using errcode = '42501';
  end if;
  if m.status = 'completed' and not can_correct_match(mid) then
    raise exception 'This match is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.created_at := least(coalesce(new.created_at, now()), now()); end if;
  return coalesce(new, old);
end $$;

-- A tournament fixture is deleted by its organisers; a friendly as before.
drop policy if exists "delete match" on matches;
create policy "delete match" on matches for delete using (
  (tournament_id is not null and status in ('scheduled', 'postponed', 'cancelled')
     and (can_manage_tournament(tournament_id) or is_support()))
  or (tournament_id is null and can_manage_match(id) and status in ('scheduled', 'postponed', 'cancelled'))
  or ((host_ids && auth_player_ids()) and tournament_id is null
      and (status = 'live' or (status = 'completed'
           and coalesce((select max(e.created_at) from match_events e where e.match_id = matches.id), updated_at) > now() - interval '30 minutes')))
);

-- ---------- DB-13: field events (golf rounds, athletics, …) ----------------------------------
alter table field_events add column if not exists completed_at timestamptz;
update field_events set completed_at = updated_at where status = 'completed' and completed_at is null;

-- The first time the round finished (W3B-14: reopening doesn't move it; the app can't set it).
create or replace function field_events_completed_at()
  returns trigger language plpgsql set search_path = public as $$
begin
  if is_client_request() then
    new.completed_at := case when tg_op = 'UPDATE' then old.completed_at end;
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status in ('scheduled', 'cancelled') then
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists field_events_completed_at on field_events;
create trigger field_events_completed_at before insert or update on field_events
  for each row execute function field_events_completed_at();

create or replace function can_correct_field_event(p_event uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select is_support() or exists (
    select 1 from field_events e where e.id = p_event and (
         (e.tournament_id is not null and can_manage_tournament(e.tournament_id))
      or (can_manage_field_event(e.id) and coalesce(e.completed_at, now()) > now() - interval '24 hours')));
$$;
revoke all on function can_correct_field_event(uuid) from public, anon, authenticated;

create or replace function guard_field_event()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if old.status = 'completed'
     and (to_jsonb(new) - 'updated_at' - 'completed_at') is distinct from (to_jsonb(old) - 'updated_at' - 'completed_at')
     and not can_correct_field_event(old.id) then
    raise exception 'This round is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  if old.tournament_id is not null and new.tournament_id is distinct from old.tournament_id
     and not (can_manage_tournament(old.tournament_id) or is_support()) then
    raise exception 'Only the tournament''s organisers can take a round out of it' using errcode = '42501';
  end if;
  if new.tournament_id is distinct from old.tournament_id and new.tournament_id is not null
     and not can_manage_tournament(new.tournament_id) then
    raise exception 'You can only move a round into a tournament you manage' using errcode = '42501';
  end if;
  if new.host_ids is distinct from old.host_ids
     and not (case when old.tournament_id is not null then can_manage_tournament(old.tournament_id)
                   else old.created_by = auth.uid() end) then
    raise exception 'Only the organisers can change who runs this event' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function guard_field_entry()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  -- W3 DB-13: a finished round, for organisers and markers alike
  if exists (select 1 from field_events e where e.id = old.event_id and e.status = 'completed')
     and not can_correct_field_event(old.event_id) then
    raise exception 'This round is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  if can_manage_field_event(old.event_id) then return new; end if;
  if (new.event_id, new.player_id, new.team_id, new.group_no, new.tee_time, new.start_hole, new.handicap_index)
     is distinct from (old.event_id, old.player_id, old.team_id, old.group_no, old.tee_time, old.start_hole, old.handicap_index)
     or (new.status is distinct from old.status and new.status not in ('playing', 'finished')) then
    raise exception 'Markers can only enter scores — ask the organizer for other changes' using errcode = '42501';
  end if;
  -- No scoring once the round is closed.
  if exists (select 1 from field_events e where e.id = old.event_id and e.status = 'completed') then
    raise exception 'This round is finished — scores are locked' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function guard_field_entry_final()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev uuid := coalesce(new.event_id, old.event_id);
begin
  if not is_client_request() then return coalesce(new, old); end if;
  if exists (select 1 from field_events e where e.id = ev and e.status = 'completed') and not can_correct_field_event(ev) then
    raise exception 'This round is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_field_entry_final on field_entries;
create trigger guard_field_entry_final before insert or delete on field_entries
  for each row execute function guard_field_entry_final();

-- ---------- DB-12: who took part -----------------------------------------------------------
-- On one of the match's teams (roster, captain, admins, members, roles, entry,
-- or a school House team's players) — a possible minor only through a link
-- their side agreed to; an adult also through a matchday squad.
create or replace function player_took_part_in_match(p_match uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_player is not null and (
    exists (
      select 1 from matches m
        cross join lateral unnest(array[m.home_team_id, m.away_team_id]) as tid
        join teams t on t.id = tid
       where m.id = p_match
         and case
           when t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0 then
             -- a House team: the school's (agreed) players of that House and sport
             exists (select 1 from players p where p.id = p_player and p.house_name = t.name and t.sport = any(p.sports)
                       and ((t.org_id is not null and member_consented('org', t.org_id, p.id)) or is_player_side(p.id, t.created_by)))
             or exists (select 1 from team_members x where x.team_id = t.id and x.player_id = p_player
                          and (player_id_is_known_adult(p_player) or member_consented('team', t.id, p_player)))
           else
             ( p_player = any(team_player_ids(t)) or p_player = any(coalesce(t.entry_ids, '{}'))
               or exists (select 1 from team_members x where x.team_id = t.id and x.player_id = p_player)
               or exists (select 1 from team_player_roles x where x.team_id = t.id and x.player_id = p_player) )
             and (player_id_is_known_adult(p_player) or member_consented('team', t.id, p_player))
         end)
    or (player_id_is_known_adult(p_player) and exists (
          select 1 from match_squads s where s.match_id = p_match
             and (s.starters ? p_player::text or s.subs ? p_player::text))));
$$;
revoke all on function player_took_part_in_match(uuid, uuid) from public, anon, authenticated;

-- Entered in the event: their own entry, or on a team entry (a relay) — a
-- possible minor only with their side's agreement.
create or replace function player_took_part_in_event(p_event uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_player is not null and exists (
    select 1 from field_entries fe where fe.event_id = p_event and (
         (fe.player_id = p_player
            and (player_id_is_known_adult(p_player) or member_consented('field_event', p_event, p_player)
                 or (fe.team_id is not null and member_consented('team', fe.team_id, p_player))))
      or (fe.team_id is not null and exists (
            select 1 from teams t where t.id = fe.team_id
               and (p_player = any(team_player_ids(t)) or exists (select 1 from team_members x where x.team_id = t.id and x.player_id = p_player))
               and (player_id_is_known_adult(p_player) or member_consented('team', t.id, p_player))))));
$$;
revoke all on function player_took_part_in_event(uuid, uuid) from public, anon, authenticated;

-- In the tournament: a confirmed team (as above), an event entry, or a stat line.
create or replace function player_took_part_in_tournament(p_tournament uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_player is not null and (
       exists (select 1 from tournament_teams tt join teams t on t.id = tt.team_id
                where tt.tournament_id = p_tournament and tt.status = 'confirmed'
                  and ( p_player = any(team_player_ids(t)) or p_player = any(coalesce(t.entry_ids, '{}'))
                     or exists (select 1 from team_members x where x.team_id = t.id and x.player_id = p_player)
                     or exists (select 1 from team_player_roles x where x.team_id = t.id and x.player_id = p_player) )
                  and (player_id_is_known_adult(p_player) or member_consented('team', t.id, p_player)))
    or exists (select 1 from stat_lines sl join matches m on m.id = sl.match_id
                where m.tournament_id = p_tournament and sl.player_id = p_player)
    or exists (select 1 from stat_lines sl join field_events e on e.id = sl.event_id
                where e.tournament_id = p_tournament and sl.player_id = p_player)
    or exists (select 1 from field_events e where e.tournament_id = p_tournament and player_took_part_in_event(e.id, p_player)));
$$;
revoke all on function player_took_part_in_tournament(uuid, uuid) from public, anon, authenticated;

-- W3B-20: linked to the match / event but not yet agreed to — the line is kept
-- aside and written when the child's side confirms.
create or replace function player_linked_to_match(p_match uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_player is not null and exists (
    select 1 from matches m
      cross join lateral unnest(array[m.home_team_id, m.away_team_id]) as tid
      join teams t on t.id = tid
     where m.id = p_match
       and ( p_player = any(team_player_ids(t)) or p_player = any(coalesce(t.entry_ids, '{}'))
          or exists (select 1 from team_members x where x.team_id = t.id and x.player_id = p_player)
          or exists (select 1 from team_player_roles x where x.team_id = t.id and x.player_id = p_player)
          or ((t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0)
              and exists (select 1 from players p where p.id = p_player and p.house_name = t.name and t.sport = any(p.sports)))));
$$;
revoke all on function player_linked_to_match(uuid, uuid) from public, anon, authenticated;

create table if not exists parked_stat_lines (
  match_id  uuid references matches(id) on delete cascade,
  event_id  uuid references field_events(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  line      jsonb not null,
  at        timestamptz not null default now()
);
create unique index if not exists parked_stat_lines_key on parked_stat_lines (coalesce(match_id, event_id), player_id);
alter table parked_stat_lines enable row level security;
revoke all on parked_stat_lines from anon, authenticated;   -- written by guard_stat_line only

-- Write the kept-aside lines of a player who now counts (and has no line yet).
create or replace function release_parked_stat_lines(p_player uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  r parked_stat_lines%rowtype;
  prev text := current_setting('app.trusted_rpc', true);
begin
  perform set_config('app.trusted_rpc', 'on', true);
  for r in select * from parked_stat_lines where player_id = p_player loop
    if (r.match_id is not null and player_took_part_in_match(r.match_id, p_player))
       or (r.event_id is not null and player_took_part_in_event(r.event_id, p_player)) then
      insert into stat_lines
      select (jsonb_populate_record(null::stat_lines, r.line)).*
       where not exists (select 1 from stat_lines sl where sl.player_id = p_player
                           and sl.match_id is not distinct from r.match_id and sl.event_id is not distinct from r.event_id);
      delete from parked_stat_lines x where x.player_id = p_player
         and x.match_id is not distinct from r.match_id and x.event_id is not distinct from r.event_id;
    end if;
  end loop;
  perform set_config('app.trusted_rpc', coalesce(prev, ''), true);
end $$;
revoke all on function release_parked_stat_lines(uuid) from public, anon, authenticated;

-- Stat lines: the finished-result rule (an error), then who took part (skipped).
create or replace function guard_stat_line()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  r stat_lines%rowtype;
begin
  if not is_client_request() or is_support() then return coalesce(new, old); end if;
  r := coalesce(new, old);
  if r.match_id is not null then
    if exists (select 1 from matches m where m.id = r.match_id and m.status = 'completed') and not can_correct_match(r.match_id) then
      raise exception 'This match is finished — only its organisers can change it now' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not player_took_part_in_match(r.match_id, r.player_id) then
      if player_linked_to_match(r.match_id, r.player_id) then   -- W3B-20: kept for the child's side to confirm
        insert into parked_stat_lines (match_id, player_id, line) values (r.match_id, r.player_id, to_jsonb(r))
        on conflict (coalesce(match_id, event_id), player_id) do update set line = excluded.line, at = now();
      end if;
      return null;
    end if;
  elsif r.event_id is not null then
    if exists (select 1 from field_events e where e.id = r.event_id and e.status = 'completed') and not can_correct_field_event(r.event_id) then
      raise exception 'This round is finished — only its organisers can change it now' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not player_took_part_in_event(r.event_id, r.player_id) then
      if exists (select 1 from field_entries fe where fe.event_id = r.event_id and fe.player_id = r.player_id) then
        insert into parked_stat_lines (event_id, player_id, line) values (r.event_id, r.player_id, to_jsonb(r))
        on conflict (coalesce(match_id, event_id), player_id) do update set line = excluded.line, at = now();
      end if;
      return null;
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_stat_line on stat_lines;
create trigger guard_stat_line before insert or update or delete on stat_lines
  for each row execute function guard_stat_line();

-- Certificates: only for the tournament's participants.
create or replace function issue_certificates(p_tournament uuid, p_items jsonb)
  returns table (code text, player_id uuid, kind text, title text, detail text, issued_at timestamptz, revoked_at timestamptz)
  language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  pid uuid;
begin
  if not can_manage_tournament(p_tournament) then
    raise exception 'Only this tournament''s organisers can issue its certificates' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then
    raise exception 'Up to 2,000 certificates at a time';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    pid := json_uuid(it->>'playerId');
    continue when pid is null or not exists (select 1 from players where id = pid);
    continue when not player_took_part_in_tournament(p_tournament, pid);   -- W3 DB-12
    continue when coalesce(it->>'kind', '') not in ('champion', 'runner_up', 'third', 'award', 'medal', 'participation');
    continue when coalesce(trim(it->>'title'), '') = '';
    insert into certificates (code, player_id, tournament_id, kind, title, detail, sport, team_name, event_date, issued_by)
    values (new_certificate_code(), pid, p_tournament, it->>'kind', left(trim(it->>'title'), 80),
            nullif(left(trim(coalesce(it->>'detail', '')), 160), ''), nullif(it->>'sport', ''),
            -- a singles / doubles entry's name is the players' names: masked for a possible minor
            nullif(left(mask_minor_names(trim(coalesce(it->>'teamName', '')), array[pid]), 80), ''),
            case when coalesce(it->>'eventDate', '') ~ '^\d{4}-\d{2}-\d{2}' then left(it->>'eventDate', 10)::date end,
            auth.uid())
    on conflict do nothing;
  end loop;
  return query
    select c.code, c.player_id, c.kind, c.title, c.detail, c.issued_at, c.revoked_at
      from certificates c where c.tournament_id = p_tournament
     order by c.kind, c.title, c.issued_at;
end $$;

-- ---------- DB-12: "Not us" also takes the child's stat lines --------------------------------
-- Latest body: 20261028160000_security_wave2b. Changes marked W3.
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
    perform release_parked_stat_lines(p_player);   -- W3B-20
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
    -- W3 DB-12: and the child's stat lines (and kept-aside ones) from that team's games
    delete from stat_lines sl where sl.player_id = p_player
       and sl.match_id in (select m.id from matches m where p_group in (m.home_team_id, m.away_team_id));
    delete from parked_stat_lines x where x.player_id = p_player
       and x.match_id in (select m.id from matches m where p_group in (m.home_team_id, m.away_team_id));
  elsif p_kind = 'club' then
    delete from club_members c where c.club_id = p_group and c.player_id = p_player;
  elsif p_kind = 'org' then
    delete from org_members m where m.org_id = p_group and m.player_id = p_player;
  elsif p_kind = 'field_event' then
    -- the entry stays for its results; the child's own stat line goes (W3 DB-12)
    delete from stat_lines sl where sl.player_id = p_player and sl.event_id = p_group;
  end if;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

-- ---------- W3B-20: an agreement recorded any other way releases kept-aside lines too ---------------
-- Latest body: 20261028140000_security_wave2.
create or replace function record_member_consent(p_kind text, p_group uuid, p_player uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  insert into member_consents (kind, group_id, player_id, by_profile, method)
  select p_kind, p_group, p.id, auth.uid(),
         case when p.profile_id = auth.uid() or p.guardian_profile_id = auth.uid() then 'self' else 'creator' end
    from players p
   where p.id = p_player and auth.uid() is not null and is_player_side(p.id, auth.uid())
  on conflict do nothing;
  if exists (select 1 from parked_stat_lines x where x.player_id = p_player) then
    perform release_parked_stat_lines(p_player);
  end if;
end $$;
revoke all on function record_member_consent(text, uuid, uuid) from public, anon, authenticated;
