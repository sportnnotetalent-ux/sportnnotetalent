-- Shared scoring (founder approved 2026-11-03; docs/security/breaks/shared-scoring.md).
--
-- Two or more people who may score a match record it at the same time from
-- their own phones. Off by default: one-at-a-time (the scoring lock, 0039)
-- stays exactly as it is.
--
-- In shared mode the single-holder lock is not used. Instead every tap carries
-- its BASE: the key of the newest event the phone had applied
-- (coalesce(client_id::text, 'id:' || id), '' for an empty log). The server
-- refuses a tap (and an Undo) whose base is not the match's newest event —
-- `stale_tap:<player id of whoever recorded the newest step>` — and inserts
-- nothing. Event ids are never reused, so an undo + new step can't fool it (ABA).
-- An old app sends no base: refused in shared mode ('update_app_shared_scoring').
--
-- Replaces: append_match_event (7 args → 8, p_base default null),
-- pop_match_event (2 → 3), claim_scoring, handover_scoring, guard_match_event_write
-- — each from its latest body (0039 / security_wave3a / security_wave3b), with
-- every existing check kept.

alter table matches add column if not exists shared_scoring boolean not null default false;
-- Who recorded a step (a PLAYER id, set by the server). IDs-only: no names in events.
alter table match_events add column if not exists recorded_by uuid references players(id) on delete set null;
-- Steps undone in shared mode: a phone that never heard back retries its tap
-- (same client id) — it must not come back after another scorer undid it.
create table if not exists match_event_undone (
  match_id  uuid not null references matches(id) on delete cascade,
  client_id uuid not null,
  at        timestamptz not null default now(),
  primary key (match_id, client_id)
);
alter table match_event_undone enable row level security;  -- no policies: only the functions below
revoke all on match_event_undone from anon, authenticated;

-- The key a phone knows an event by (its client id, else its server id).
create or replace function match_event_key(p_client uuid, p_id bigint)
  returns text language sql immutable as $$
  select coalesce(p_client::text, 'id:' || p_id::text);
$$;

-- The newest event of a match: its key ('' when none) and who recorded it.
create or replace function newest_match_event(p_match uuid, out k text, out by_player uuid)
  language sql stable security definer set search_path = public as $$
  select coalesce((select match_event_key(e.client_id, e.id) from match_events e where e.match_id = p_match order by e.seq desc, e.id desc limit 1), ''),
         (select e.recorded_by from match_events e where e.match_id = p_match order by e.seq desc, e.id desc limit 1);
$$;

-- In shared mode while the match is played: the base must be the newest event.
create or replace function check_shared_base(p_match uuid, p_base text)
  returns void language plpgsql stable security definer set search_path = public as $$
declare
  n record;
begin
  if p_base is null then
    raise exception 'update_app_shared_scoring' using errcode = '42501',
      hint = 'This match is scored by several phones at once — update SportnNote to score it.';
  end if;
  select * into n from newest_match_event(p_match);
  if n.k is distinct from p_base then
    raise exception '%', 'stale_tap:' || coalesce(n.by_player::text, '');
  end if;
end $$;

-- Switch shared scoring on / off. Friendlies: anyone who may score it (listed
-- scorers, hosts). Tournament matches: the match's hosts and the tournament's
-- organisers only. Switching on clears the lock holder.
create or replace function set_shared_scoring(p_match uuid, p_on boolean)
  returns void language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if m.tournament_id is null then
    if not can_manage_match(p_match) then raise exception 'not_allowed' using errcode = '42501'; end if;
  elsif not (coalesce(m.host_ids, '{}') && auth_player_ids() or can_manage_tournament(m.tournament_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update matches set shared_scoring = coalesce(p_on, false),
    active_scorer_id = case when p_on then null else active_scorer_id end,
    active_scorer_device = case when p_on then null else active_scorer_device end,
    active_scorer_at = case when p_on then null else active_scorer_at end
    where id = p_match;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

-- The column only changes through set_shared_scoring.
create or replace function guard_shared_scoring()
  returns trigger language plpgsql set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if tg_op = 'INSERT' then new.shared_scoring := false; return new; end if;
  if new.shared_scoring is distinct from old.shared_scoring then
    raise exception 'Use set_shared_scoring to change how a match is scored' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_shared_scoring on matches;
create trigger guard_shared_scoring before insert or update on matches
  for each row execute function guard_shared_scoring();

-- 0039, + shared mode: everyone allowed may score — nobody takes the lock.
create or replace function claim_scoring(p_match uuid, p_device text, p_takeover boolean default false)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  me uuid;
begin
  if not can_manage_match(p_match) then raise exception 'not_allowed' using errcode = '42501'; end if;
  me := my_scoring_player(p_match);
  if me is null then raise exception 'no_player' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if m.shared_scoring then
    return jsonb_build_object('ok', true, 'shared', true, 'holder_id', null);
  end if;
  if m.active_scorer_id is null
     or not scoring_lock_enforced(m.status, m.active_scorer_id)
     or (m.active_scorer_id = me and (m.active_scorer_device is null or m.active_scorer_device = p_device))
     or p_takeover then
    update matches set active_scorer_id = me, active_scorer_device = p_device, active_scorer_at = now(),
      scorer_ids = case when me = any(coalesce(scorer_ids, '{}')) then scorer_ids else coalesce(scorer_ids, '{}') || me end
      where id = p_match;
    return jsonb_build_object('ok', true, 'holder_id', me);
  end if;
  return jsonb_build_object('ok', false, 'holder_id', m.active_scorer_id,
    'holder_name', (select full_name from players where id = m.active_scorer_id), 'at', m.active_scorer_at);
end $$;

-- security_wave3a, + shared mode: nothing to hand over.
create or replace function handover_scoring(p_match uuid, p_to uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  old_name text;
begin
  if not can_manage_match(p_match) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if m.shared_scoring then raise exception 'shared_scoring_on' using errcode = '42501'; end if;
  old_name := public_person_name(m.active_scorer_id, (select full_name from players where id = m.active_scorer_id));
  update matches set active_scorer_id = p_to, active_scorer_device = null, active_scorer_at = now(),
    scorer_ids = case when p_to = any(coalesce(scorer_ids, '{}')) then scorer_ids else coalesce(scorer_ids, '{}') || p_to end
    where id = p_match;
  if m.tournament_id is not null then
    insert into activity_log (scope, ref_id, action, detail, by_player_id, by_name)
    values ('tournament', m.tournament_id, 'scoring.handover',
      coalesce(old_name, 'nobody') || ' → ' || coalesce(public_person_name(p_to, (select full_name from players where id = p_to)), 'someone'),
      my_scoring_player(p_match), public_person_name(my_scoring_player(p_match), (select full_name from players where id = my_scoring_player(p_match))));
  end if;
end $$;

-- 0039, + p_base and shared mode. A new signature: the old 7-argument one goes
-- (an old app's named call still resolves here, with p_base null).
drop function if exists append_match_event(uuid, text, uuid, text, text, jsonb, jsonb);
create or replace function append_match_event(p_match uuid, p_device text, p_client_id uuid, p_type text,
                                              p_side text, p_payload jsonb, p_attribution jsonb, p_base text default null)
  returns int language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  s int;
begin
  if not can_manage_match(p_match) then raise exception 'not_active_scorer' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if p_client_id is not null then
    select seq into s from match_events where match_id = p_match and client_id = p_client_id;
    if s is not null then return s; end if;
  end if;
  if m.shared_scoring and coalesce(m.status, 'scheduled') in ('scheduled', 'live') then
    -- Shared: every allowed scorer may write; the base must be the newest event,
    -- and a step another scorer undid never comes back on a late retry.
    perform check_shared_base(p_match, p_base);
    if p_client_id is not null and exists (select 1 from match_event_undone u where u.match_id = p_match and u.client_id = p_client_id) then
      raise exception '%', 'stale_tap:' || coalesce((select by_player::text from newest_match_event(p_match)), '');
    end if;
  elsif scoring_lock_enforced(m.status, m.active_scorer_id) then
    if not holds_scoring_lock(m.active_scorer_id, m.active_scorer_device, p_device) then
      raise exception 'not_active_scorer' using errcode = '42501';
    end if;
    update matches set active_scorer_device = coalesce(active_scorer_device, p_device), active_scorer_at = now() where id = p_match;
  elsif coalesce(m.status, 'scheduled') in ('scheduled', 'live') then
    update matches set active_scorer_id = my_scoring_player(p_match), active_scorer_device = p_device, active_scorer_at = now() where id = p_match;
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  select coalesce(max(seq), 0) + 1 into s from match_events where match_id = p_match;
  insert into match_events (match_id, seq, type, side, payload, attribution, created_by, client_id, recorded_by)
  values (p_match, s, p_type, p_side, coalesce(p_payload, '{}'::jsonb), p_attribution, auth.uid(), p_client_id, my_scoring_player(p_match));
  perform set_config('app.trusted_rpc', 'off', true);
  return s;
end $$;

-- 0039, + p_base: in shared mode Undo removes only the step the phone saw as newest.
drop function if exists pop_match_event(uuid, text);
create or replace function pop_match_event(p_match uuid, p_device text, p_base text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  r match_events%rowtype;
begin
  if not can_manage_match(p_match) then raise exception 'not_active_scorer' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if m.shared_scoring and coalesce(m.status, 'scheduled') in ('scheduled', 'live') then
    perform check_shared_base(p_match, p_base);
  elsif scoring_lock_enforced(m.status, m.active_scorer_id)
     and not holds_scoring_lock(m.active_scorer_id, m.active_scorer_device, p_device) then
    raise exception 'not_active_scorer' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  delete from match_events where id = (select id from match_events where match_id = p_match order by seq desc, id desc limit 1)
    returning * into r;
  perform set_config('app.trusted_rpc', 'off', true);
  if r.id is null then return null; end if;
  if m.shared_scoring and r.client_id is not null then
    insert into match_event_undone (match_id, client_id) values (p_match, r.client_id) on conflict do nothing;
  end if;
  return jsonb_build_object('seq', r.seq, 'type', r.type, 'side', r.side, 'payload', r.payload,
                            'attribution', r.attribution, 'client_id', r.client_id, 'recorded_by', r.recorded_by);
end $$;

-- security_wave3b, + shared mode: direct writes would skip the base check, so
-- while a shared match is played only the RPCs write; a client never sets recorded_by.
create or replace function guard_match_event_write()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid := coalesce(new.match_id, old.match_id);
  m matches%rowtype;
begin
  if not is_client_request() then return coalesce(new, old); end if;
  select * into m from matches where id = mid;
  -- (a match deleted as a whole cascades here one trigger level down: allowed as before)
  if m.shared_scoring and coalesce(m.status, 'scheduled') in ('scheduled', 'live') and pg_trigger_depth() <= 1 then
    raise exception 'update_app_shared_scoring' using errcode = '42501';
  end if;
  if scoring_lock_enforced(m.status, m.active_scorer_id)
     and not (m.active_scorer_id = any(auth_player_ids())) then
    raise exception 'not_active_scorer' using errcode = '42501';
  end if;
  if m.status = 'completed' and not can_correct_match(mid) then
    raise exception 'This match is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := least(coalesce(new.created_at, now()), now());
    new.recorded_by := null;
  end if;
  return coalesce(new, old);
end $$;

revoke all on function append_match_event(uuid, text, uuid, text, text, jsonb, jsonb, text), pop_match_event(uuid, text, text),
  set_shared_scoring(uuid, boolean), newest_match_event(uuid), check_shared_base(uuid, text) from public, anon;
revoke all on function newest_match_event(uuid), check_shared_base(uuid, text) from authenticated;
grant execute on function append_match_event(uuid, text, uuid, text, text, jsonb, jsonb, text), pop_match_event(uuid, text, text),
  set_shared_scoring(uuid, boolean) to authenticated;
