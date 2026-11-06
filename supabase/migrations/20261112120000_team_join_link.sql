-- Team join link + requests (reference-video C8, docs/security/breaks/team-join-link.md).
-- A team's managers share ONE link; a person opens it, sees only the team's name
-- and sport, and asks to join, for themselves (adults) or for their child (the
-- parent asks). The team's managers accept or decline. Accepting adds the
-- player to the squad and records that their side agreed (member_consents
-- 'joined'). Tables are reached only through these functions.

create table if not exists team_join_links (
  team_id    uuid primary key references teams(id) on delete cascade,
  token      text not null unique,
  enabled    boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table team_join_links enable row level security;
revoke all on team_join_links from anon, authenticated;

create table if not exists team_join_requests (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  requested_by uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  decided_by   uuid,
  decided_at   timestamptz
);
create unique index if not exists team_join_requests_one_pending on team_join_requests (team_id, player_id) where status = 'pending';
create index if not exists team_join_requests_team on team_join_requests (team_id, status);
alter table team_join_requests enable row level security;
revoke all on team_join_requests from anon, authenticated;

-- TJ6: a school house team with no squad list of its own takes its players from
-- the house. Adding one person would replace that whole squad, so these teams
-- don't get join links.
create or replace function team_squad_from_house(p_team uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teams t join players p on p.house_name = t.name and t.sport = any(p.sports)
     where t.id = p_team
       and (t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0));
$$;
revoke all on function team_squad_from_house(uuid) from public, anon, authenticated;

-- Managers: get (or replace) the team's link. p_new = a fresh token; the old one stops working.
create or replace function team_join_link(p_team uuid, p_new boolean default false)
  returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null or not can_manage_team(p_team) then
    raise exception 'Only this team''s managers can share its join link' using errcode = '42501';
  end if;
  if team_squad_from_house(p_team) then
    raise exception 'This team''s squad comes from its school house list — add players from the school instead' using errcode = '22023';
  end if;
  select l.token into tok from team_join_links l where l.team_id = p_team;
  if tok is null or p_new then
    tok := new_invite_token();
    insert into team_join_links (team_id, token, enabled, created_by) values (p_team, tok, true, auth.uid())
      on conflict (team_id) do update set token = excluded.token, enabled = true, created_by = excluded.created_by, created_at = now();
  else
    update team_join_links set enabled = true where team_id = p_team;
  end if;
  return tok;
end $$;

-- Managers: switch the link off (it can be switched back on with the same token).
create or replace function team_join_link_off(p_team uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not can_manage_team(p_team) then
    raise exception 'Only this team''s managers can change its join link' using errcode = '42501';
  end if;
  update team_join_links set enabled = false where team_id = p_team;
end $$;

-- Anyone signed in, rate-limited: what a link points at — the team's name and
-- sport only (TJ3: no squad, no captain, no contact details).
create or replace function team_join_preview(p_token text)
  returns table (team_id uuid, team_name text, sport text) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in to join a team' using errcode = '42501'; end if;
  if not rate_limit_hit('team-join-lookup', auth.uid()::text, 30, 3600) then
    raise exception 'Too many tries — wait a little and try again' using errcode = '54000';
  end if;
  return query
    select t.id, t.name, t.sport::text from team_join_links l join teams t on t.id = l.team_id
     where l.token = upper(trim(p_token)) and l.enabled;
end $$;

-- Ask to join. p_player: the caller's own player (adults only) or their child's
-- (the parent asks for an under-18 — TJ4).
create or replace function request_team_join(p_token text, p_player uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  pl players;
  v_adult boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join a team' using errcode = '42501'; end if;
  if not rate_limit_hit('team-join-request', auth.uid()::text, 20, 3600) then
    raise exception 'Too many requests — wait a little and try again' using errcode = '54000';
  end if;
  select l.team_id into v_team from team_join_links l where l.token = upper(trim(p_token)) and l.enabled;
  if v_team is null then return 'link_off'; end if;
  select * into pl from players where id = p_player;
  if pl.id is null then raise exception 'Unknown player' using errcode = 'P0002'; end if;
  v_adult := coalesce(pl.dob <= (current_date - interval '18 years')::date, false);
  if pl.guardian_profile_id is distinct from auth.uid() then
    -- not their parent: it must be the caller's own player, and an adult
    if pl.profile_id is distinct from auth.uid() then
      raise exception 'You can only ask for yourself or your own child' using errcode = '42501';
    end if;
    if not v_adult then return 'ask_parent'; end if;
  end if;
  if exists (select 1 from teams t where t.id = v_team and jsonb_typeof(t.roster) = 'array' and t.roster ? p_player::text) then
    return 'already_member';
  end if;
  if exists (select 1 from team_join_requests r where r.team_id = v_team and r.player_id = p_player and r.status = 'pending') then
    return 'already_requested';
  end if;
  if (select count(*) from team_join_requests r where r.team_id = v_team and r.status = 'pending') >= 100 then
    return 'team_busy';   -- TJ7: a flood of requests can't bury a team
  end if;
  insert into team_join_requests (team_id, player_id, requested_by) values (v_team, p_player, auth.uid());
  return 'requested';
end $$;

-- Managers: the pending requests. An under-18's name shows as initials (TJ5).
create or replace function team_join_requests_for(p_team uuid)
  returns table (id uuid, player_id uuid, name text, adult boolean, by_parent boolean, created_at timestamptz)
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not can_manage_team(p_team) then
    raise exception 'Only this team''s managers can see its join requests' using errcode = '42501';
  end if;
  return query
    select r.id, r.player_id,
           case when coalesce(p.dob <= (current_date - interval '18 years')::date, false) then p.full_name
                else coalesce((select string_agg(left(w, 1) || '.', ' ') from regexp_split_to_table(trim(p.full_name), '\s+') w), '?') end,
           coalesce(p.dob <= (current_date - interval '18 years')::date, false),
           coalesce(p.guardian_profile_id = r.requested_by, false),
           r.created_at
      from team_join_requests r join players p on p.id = r.player_id
     where r.team_id = p_team and r.status = 'pending'
     order by r.created_at;
end $$;

-- Managers: accept (joins the squad, their side's agreement recorded) or decline.
create or replace function decide_team_join(p_request uuid, p_accept boolean)
  returns text language plpgsql security definer set search_path = public as $$
declare r team_join_requests;
begin
  select * into r from team_join_requests where id = p_request;
  if r.id is null or auth.uid() is null or not can_manage_team(r.team_id) then
    raise exception 'Only this team''s managers can answer its join requests' using errcode = '42501';
  end if;
  if r.status <> 'pending' then return r.status; end if;
  if p_accept then
    if team_squad_from_house(r.team_id) then
      raise exception 'This team''s squad comes from its school house list' using errcode = '22023';
    end if;
    update teams t
       set roster = case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end || to_jsonb(r.player_id::text)
     where t.id = r.team_id
       and not (jsonb_typeof(t.roster) = 'array' and t.roster ? r.player_id::text);
    insert into member_consents (kind, group_id, player_id, by_profile, method)
      values ('team', r.team_id, r.player_id, r.requested_by, 'joined') on conflict do nothing;
    update team_join_requests set status = 'accepted', decided_by = auth.uid(), decided_at = now() where id = r.id;
    return 'accepted';
  end if;
  update team_join_requests set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = r.id;
  return 'declined';
end $$;

revoke all on function team_join_link(uuid, boolean), team_join_link_off(uuid), team_join_preview(text),
  request_team_join(text, uuid), team_join_requests_for(uuid), decide_team_join(uuid, boolean) from public, anon;
grant execute on function team_join_link(uuid, boolean), team_join_link_off(uuid), team_join_preview(text),
  request_team_join(text, uuid), team_join_requests_for(uuid), decide_team_join(uuid, boolean) to authenticated;
