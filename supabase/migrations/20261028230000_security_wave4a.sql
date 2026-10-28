-- ============================================================================
--  Security Wave 4A — low findings, the database (docs/security/audit-2026-10-27/PLAN.md)
--  tests/db-wave4.test.mts · docs/security/breaks/security-wave4.md
--
--  DB-18  the ownership audit trail's "from" (and an org's "to") come from the
--         server, not the caller (co-hosts keep transfer rights: accepted).
--  DB-20  a possible minor's guardian can be messaged only by someone in the
--         child's agreed circle; the refusal reveals no guardian contact.
--  DB-22  bounded inputs: match event payloads (32 KB), match snapshots (2 MB),
--         support questions (4,000 characters), push target lists (1,000),
--         field-record merges (500).
--  DB-23  a submitted verification document can't be replaced (no UPDATE).
--  DB-24  editing a golf course leaves other organisers' rounds (finished or
--         open) on the course as it was — and the freeze no longer trips the
--         Wave 3B finished-result guard (it runs as a trusted step).
-- ============================================================================

-- ---------- DB-20 -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_message(p_player uuid, p_body text)
 RETURNS TABLE(thread_id uuid, message_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  me    uuid := auth.uid();
  body  text := trim(coalesce(p_body, ''));
  tgt   players;
  tage  int;
  recip uuid;
  via   boolean := false;
  th    uuid;
  mid   uuid;
begin
  perform assert_can_message();
  if body = '' or char_length(body) > 2000 then
    raise exception 'Write a message (up to 2000 characters)';
  end if;
  select * into tgt from players where id = p_player;
  if tgt.id is null then raise exception 'Player not found'; end if;
  if tgt.profile_id = me then raise exception 'You can''t message yourself'; end if;

  tage := player_age(p_player);
  -- W4 (DB-20): a possible minor's guardian only from someone the child plays,
  -- trains or competes with (the agreed circle) — and refused before anything
  -- says whether a guardian contact is on file
  if (tage is null or tage < 18) and not player_full_visible_to(me, p_player) then
    raise exception 'You can only message the parents of players you play with, coach or organise.' using errcode = '42501';
  end if;
  if tage is null or tage < 18 then
    -- Under-18 (or age unknown — treated as a minor): the guardian's inbox.
    via := true;
    if tgt.guardian_profile_id is not null then
      recip := tgt.guardian_profile_id;
    elsif coalesce(tgt.guardian->>'email', '') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      recip := null;   -- delivered by email (with a link code) until they link
    else
      raise exception 'This player''s parent/guardian can''t be reached on SportnNote yet.';
    end if;
  else
    if tgt.profile_id is null then
      raise exception '% isn''t on SportnNote yet.', tgt.full_name;
    end if;
    recip := tgt.profile_id;
  end if;
  if recip = me then raise exception 'You can''t message yourself'; end if;
  if recip is not null and exists (select 1 from message_blocks b
                                   where b.blocker_profile_id = recip and b.blocked_profile_id = me) then
    raise exception 'You can''t message this person.' using errcode = '42501';
  end if;

  select t.id into th from message_threads t where t.subject_player_id = p_player and t.sender_profile_id = me;
  if th is null then
    if not rate_limit_hit('msg-new-thread', me::text, 10, 86400) then
      raise exception 'You''ve started a lot of new conversations today — try again tomorrow.' using errcode = '54000';
    end if;
    insert into message_threads (subject_player_id, sender_profile_id, recipient_profile_id, via_guardian)
      values (p_player, me, recip, via) returning id into th;
  else
    update message_threads t set recipient_profile_id = recip, via_guardian = via where t.id = th;
  end if;
  if not rate_limit_hit('msg-send', me::text, 100, 86400) then
    raise exception 'Daily message limit reached — try again tomorrow.' using errcode = '54000';
  end if;
  insert into messages (thread_id, sender_profile_id, body) values (th, me, body) returning id into mid;
  update message_threads t set last_message_at = now(), sender_read_at = now() where t.id = th;
  return query select th, mid;
end $function$;

-- ---------- DB-23 -------------------------------------------------------------------------------
drop policy if exists "verif docs update own" on storage.objects;

-- ---------- DB-24 -------------------------------------------------------------------------------
create or replace function freeze_golf_rounds_on_course_edit()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.holes_data is distinct from old.holes_data or new.tees is distinct from old.tees then
    perform set_config('app.trusted_rpc', 'on', true);
    update field_events e
       set format = e.format || jsonb_build_object('courseSnap', jsonb_build_object('holes', old.holes_data, 'tees', old.tees))
     where e.sport = 'golf'
       and e.format ->> 'courseId' = old.id::text
       and not (e.format ? 'courseSnap')
       and (e.status = 'completed' or e.created_by is distinct from old.created_by);
    perform set_config('app.trusted_rpc', 'off', true);
  end if;
  return new;
end $$;

-- ---------- DB-18 -------------------------------------------------------------------------------
-- Latest body: 20261028180000_security_wave3a. Changes marked W4.
create or replace function transfer_tournament_ownership(p_tid uuid, p_org uuid, p_player_ids uuid[], p_host_name text, p_from_kind text, p_from_name text)
  returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := (auth_player_ids())[1];
  my_name text;
  old_ids uuid[];
  v_from_kind text;
  v_from_name text;
begin
  if auth.uid() is null or not can_manage_tournament(p_tid) then
    raise exception 'Only this tournament''s owners can transfer it' using errcode = '42501';
  end if;
  if p_org is not null and not has_org_role(p_org, array['Owner','Admin','Organizer']) then
    raise exception 'You can only transfer to an organization you help run' using errcode = '42501';
  end if;
  if p_org is null and coalesce(array_length(p_player_ids, 1), 0) = 0 then
    raise exception 'Pick who to transfer the tournament to';
  end if;
  my_name := public_person_name(me, (select full_name from players where id = me));
  -- W4 (DB-18): the "from" side of the audit trail is what the tournament is now
  select case when t.host_org_id is not null then 'org' else 'individual' end,
         coalesce(case when t.host_org_id is not null then (select o.name from organizations o where o.id = t.host_org_id) end, t.host_name)
    into v_from_kind, v_from_name from tournaments t where t.id = p_tid;
  -- DB-15: the names typed for "from" and "to" keep a child's initials
  select coalesce(t.host_ids, '{}') || auth_player_ids() || coalesce(t.created_by, me) into old_ids from tournaments t where t.id = p_tid;

  perform set_config('app.trusted_rpc', 'on', true);
  update tournaments
     set host_org_id = p_org,
         host_ids = case when p_org is null then p_player_ids else '{}'::uuid[] end,
         host_name = coalesce(nullif(trim(p_host_name), ''), host_name),
         organizer_id = null
   where id = p_tid;
  insert into tournament_ownership_events
    (tournament_id, action, from_kind, from_name, to_kind, to_name, by_player_id, by_name)
  values
    (p_tid, 'transferred', v_from_kind, mask_minor_names(v_from_name, old_ids),
     case when p_org is null then 'individual' else 'org' end,
     case when p_org is not null then coalesce((select o.name from organizations o where o.id = p_org), p_host_name)
          else mask_minor_names(p_host_name, coalesce(p_player_ids, '{}')) end, me, my_name);
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

-- ---------- DB-22 -------------------------------------------------------------------------------
alter table match_events drop constraint if exists match_events_size_cap;
alter table match_events add constraint match_events_size_cap
  check (pg_column_size(payload) <= 32768 and (attribution is null or pg_column_size(attribution) <= 8192));
alter table matches drop constraint if exists matches_state_size_cap;
alter table matches add constraint matches_state_size_cap check (state is null or pg_column_size(state) <= 2097152);
alter table support_cases drop constraint if exists support_cases_size_cap;
alter table support_cases add constraint support_cases_size_cap
  check (char_length(question) <= 4000 and (tried is null or char_length(tried) <= 4000));

CREATE OR REPLACE FUNCTION public.push_allowed_targets(p_targets uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[] := auth_player_ids();
  v_uid uuid := auth.uid();
  v_circle uuid[];
begin
  -- W4 (DB-22): a bounded list
  if cardinality(p_targets) > 1000 then raise exception 'Too many targets at once' using errcode = '54000'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.merge_field_records(p_tid uuid, p_sport text, p_ops jsonb, p_phase uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fm      jsonb;
  book    jsonb;
  op      jsonb;
  rec     jsonb;
  cur     jsonb;
  prev    jsonb;
  removed jsonb;
  r       jsonb;
  kind    text;
  better  text;
  manager boolean;
  host_key text;   -- the eventKey of the phase a host runs (null = not a host)
begin
  -- W4 (DB-22): a bounded batch (the merge is quadratic in it)
  if jsonb_typeof(p_ops) = 'array' and jsonb_array_length(p_ops) > 500 then raise exception 'Too many record changes at once' using errcode = '54000'; end if;
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_sport is null or p_sport !~ '^[a-z_]{2,20}$' then raise exception 'Unknown sport' using errcode = '22023'; end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then raise exception 'Expected a list of record changes' using errcode = '22023'; end if;

  manager := can_manage_tournament(p_tid);
  if p_phase is not null then
    select e.format->'results'->>'eventKey' into host_key
      from field_events e
     where e.id = p_phase and e.tournament_id = p_tid and e.sport = p_sport and can_manage_field_event(e.id);
  end if;
  if not manager and host_key is null then
    raise exception 'You can’t change this tournament’s records' using errcode = '42501';
  end if;

  -- One writer at a time per tournament: the rest wait here, then see the new book.
  select formats into fm from tournaments where id = p_tid for update;
  if not found then raise exception 'Tournament not found' using errcode = 'P0002'; end if;
  begin
    book := case jsonb_typeof(fm->p_sport->'records')
              when 'string' then (fm->p_sport->>'records')::jsonb
              when 'array' then fm->p_sport->'records'
              else '[]'::jsonb end;
  exception when others then book := '[]'::jsonb;
  end;
  if jsonb_typeof(book) is distinct from 'array' then book := '[]'::jsonb; end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    kind := op->>'op';
    if kind in ('set', 'remove') and not manager then
      raise exception 'Only the tournament’s organisers can edit the record board' using errcode = '42501';
    end if;

    if kind in ('better', 'set') then
      rec := op->'rec';
      if jsonb_typeof(rec) is distinct from 'object' or rec->>'scope' not in ('MR', 'SR')
         or coalesce(rec->>'discipline', '') = '' or coalesce(rec->>'category', '') = ''
         or jsonb_typeof(rec->'value') is distinct from 'number' or coalesce(rec->>'holder', '') = '' then
        raise exception 'A record needs a scope, event, category, mark and holder' using errcode = '22023';
      end if;
      -- a host only writes records their own event set
      if not manager and rec->>'eventKey' is distinct from host_key then
        raise exception 'You can only record what your event set' using errcode = '42501';
      end if;
      select x into cur from jsonb_array_elements(book) x
       where x->>'scope' = rec->>'scope' and x->>'discipline' = rec->>'discipline' and x->>'category' = rec->>'category'
       limit 1;
      if kind = 'better' and cur is not null then
        better := coalesce(op->>'better', 'lower');
        if jsonb_typeof(cur->'value') = 'number' and not (
             (better = 'higher' and (rec->>'value')::numeric > (cur->>'value')::numeric)
          or (better <> 'higher' and (rec->>'value')::numeric < (cur->>'value')::numeric)) then
          continue;   -- someone else's record still stands
        end if;
      end if;
      select coalesce(jsonb_agg(x), '[]'::jsonb) into book from jsonb_array_elements(book) x
       where not (x->>'scope' = rec->>'scope' and x->>'discipline' = rec->>'discipline' and x->>'category' = rec->>'category');
      book := book || jsonb_build_array(rec);

    elsif kind = 'remove' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into book from jsonb_array_elements(book) x
       where not (x->>'scope' = op->>'scope' and x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category');

    elsif kind = 'restore' then
      if not manager and op->>'eventKey' is distinct from host_key then
        raise exception 'You can only reopen your own event' using errcode = '42501';
      end if;
      select coalesce(jsonb_agg(x), '[]'::jsonb) into removed from jsonb_array_elements(book) x
       where x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category' and x->>'eventKey' = op->>'eventKey';
      select coalesce(jsonb_agg(x), '[]'::jsonb) into book from jsonb_array_elements(book) x
       where not (x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category' and coalesce(x->>'eventKey', '') = coalesce(op->>'eventKey', ''));
      for r in select * from jsonb_array_elements(removed) loop
        select b into prev from jsonb_array_elements(coalesce(op->'before', '[]'::jsonb)) b
         where b->>'scope' = r->>'scope' and b->>'discipline' = op->>'discipline' and b->>'category' = op->>'category'
           and b->>'eventKey' is distinct from op->>'eventKey'
         limit 1;
        if prev is not null and not exists (
             select 1 from jsonb_array_elements(book) x
              where x->>'scope' = prev->>'scope' and x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category') then
          book := book || jsonb_build_array(prev);
        end if;
      end loop;

    else
      raise exception 'Unknown record change "%"', kind using errcode = '22023';
    end if;
  end loop;

  update tournaments
     set formats = jsonb_set(coalesce(fm, '{}'::jsonb), array[p_sport],
                             coalesce(fm->p_sport, '{}'::jsonb) || jsonb_build_object('records', book::text))
   where id = p_tid;
  return book;
end $function$;
