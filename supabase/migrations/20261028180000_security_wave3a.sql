-- ============================================================================
--  Security Wave 3A — children's data (docs/security/audit-2026-10-27/PLAN.md)
--  tests/db-wave3.test.mts · docs/security/breaks/security-wave3.md
--
--  DB-08  internal functions are no longer callable by the app; a test now
--         lists every privileged function the app can call.
--  DB-10  community memberships (school, class, house) of children are read
--         only by that community's members, the child's side and support;
--         adults (staff, coaches) stay public.
--  DB-11  name masking no longer confirms a guessed name: any name with a
--         child's initials pattern is masked, right guess or wrong.
--  DB-15  names the server writes into public tables (scoring handovers,
--         ownership transfers, officials, managers) keep a child's initials.
-- ============================================================================

-- ---------- DB-08: internal only -------------------------------------------------------------
revoke execute on function assert_can_message() from public, anon, authenticated;
revoke execute on function can_admin_player(uuid) from public, anon, authenticated;
revoke execute on function can_contact_provisional(uuid) from public, anon, authenticated;
revoke execute on function can_review_kind(text) from public, anon, authenticated;
revoke execute on function holds_scoring_lock(uuid, text, text) from public, anon, authenticated;
revoke execute on function meet_age_cutoff(uuid, text) from public, anon, authenticated;
revoke execute on function my_scoring_player(uuid) from public, anon, authenticated;
revoke execute on function org_required_id_types_for(text, text) from public, anon, authenticated;
revoke execute on function player_age(uuid) from public, anon, authenticated;
revoke execute on function player_full_visible(uuid) from public, anon, authenticated;
revoke execute on function profile_age(uuid) from public, anon, authenticated;
revoke execute on function tie_side_lineup(text, text) from public, anon, authenticated;

-- ---------- DB-10: who reads community memberships ------------------------------------------
-- The caller's own facts only (safe to call from a policy): the communities
-- they're an active member of, and the players they speak for.
create or replace function my_member_org_ids()
  returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.org_id), '{}') from org_members m
   where m.player_id = any(auth_player_ids()) and (m.until is null or m.until >= current_date);
$$;
create or replace function my_side_player_ids()
  returns uuid[] language sql stable security definer set search_path = public as $$
  select player_side_ids(auth.uid());
$$;
-- A known adult (date of birth on the player or their account says 18+).
create or replace function player_id_is_known_adult(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select player_is_known_adult(p.dob, p.profile_id) from players p where p.id = p_player), false);
$$;
revoke all on function my_member_org_ids() from public;
revoke all on function my_side_player_ids() from public;
revoke all on function player_id_is_known_adult(uuid) from public;
grant execute on function my_member_org_ids() to anon, authenticated;
grant execute on function my_side_player_ids() to anon, authenticated;
grant execute on function player_id_is_known_adult(uuid) to anon, authenticated;

drop policy if exists org_members_read on org_members;
create policy org_members_read on org_members for select using (
  org_id = any((select my_member_org_ids())::uuid[])
  or player_id = any((select my_side_player_ids())::uuid[])
  or (select is_support())
  or player_id_is_known_adult(player_id)
);
-- The old write policy was FOR ALL, which also let every signed-in user read
-- every row: split it (guard_org_member still decides each write).
drop policy if exists org_members_write on org_members;
create policy org_members_insert on org_members for insert to authenticated with check (true);
create policy org_members_update on org_members for update to authenticated using (true) with check (true);
create policy org_members_delete on org_members for delete to authenticated using (true);

-- ---------- DB-11: mask by the initials pattern, not by an exact match --------------------
-- A regex for a name: with two or more words, ANY words with the same initials
-- ("Asha Rao" → [Aa]… [Rr]…), so a wrong guess is masked exactly like the right
-- one and the stored text confirms nothing beyond the public initials. A
-- one-word name (or one with a non-letter initial) is matched literally.
create or replace function minor_name_pattern(p_name text)
  returns text language sql immutable set search_path = public as $$
  select case
    when cardinality(t) >= 2 and not exists (select 1 from unnest(t) w where left(w, 1) !~ '^[[:alpha:]]$')
      then (select string_agg('[' || upper(left(w, 1)) || lower(left(w, 1)) || '][[:alpha:]''’.-]*', '\s+' order by o)
              from unnest(t) with ordinality as x(w, o))
    else replace(regexp_replace(array_to_string(t, ' '), '([^[:alnum:][:space:]])', '\\\1', 'g'), ' ', '\s+')
  end
  from (select regexp_split_to_array(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), ' ') as t) s;
$$;

-- The possible minors among these players, longest names first.
create or replace function minor_names_of(p_players uuid[])
  returns table (n text) language sql stable security definer set search_path = public as $$
  select s.n from (
    select distinct regexp_replace(trim(full_name), '\s+', ' ', 'g') as n
      from players
     where id = any(p_players) and not player_is_known_adult(dob, profile_id)
       and length(trim(coalesce(full_name, ''))) >= 2
  ) s
  order by cardinality(regexp_split_to_array(s.n, ' ')) desc, length(s.n) desc, s.n;
$$;
revoke all on function minor_names_of(uuid[]) from public, anon, authenticated;

create or replace function mask_minor_names(p_label text, p_players uuid[])
  returns text language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v text := p_label;
begin
  if v is null or p_players is null or cardinality(p_players) = 0 then return v; end if;
  for r in select n from minor_names_of(p_players) loop
    v := regexp_replace(v, '(?<![[:alnum:]_])' || minor_name_pattern(r.n) || '(?![[:alnum:]_])', name_initials(r.n), 'gi');
  end loop;
  return v;
exception when others then
  return p_label;  -- never block a write
end $$;

create or replace function mask_minor_names_json(p_data jsonb, p_players uuid[])
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  t text;
  any_pat text;
begin
  if p_data is null or p_players is null or cardinality(p_players) = 0
     or jsonb_typeof(p_data) not in ('object', 'array', 'string') then
    return p_data;
  end if;
  t := p_data::text;
  -- W3B-12: one pass first — most snapshots (ids-only scoring) hold no name at all
  select string_agg(minor_name_pattern(n), '|') into any_pat from minor_names_of(p_players);
  if any_pat is null or t !~* ('(?<![[:alnum:]_])(' || any_pat || ')(?![[:alnum:]_])') then
    return p_data;
  end if;
  for r in select n from minor_names_of(p_players) loop
    -- (?!"\s*:) — never inside an object key
    t := regexp_replace(t, '(?<![[:alnum:]_])' || minor_name_pattern(r.n) || '(?![[:alnum:]_])(?!"\s*:)', name_initials(r.n), 'gi');
  end loop;
  return t::jsonb;
exception when others then
  return p_data;  -- never block scoring
end $$;

-- An entry (1–2 players) named after its players: decided on the MASKED names,
-- so a guess with the right initials becomes the same entry with the same name.
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
  nm := lower(mask_minor_names(regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g'), ids));
  if nm in (lower(mask_minor_names(fwd, ids)), lower(mask_minor_names(rev, ids))) then
    new.entry_ids := ids;
    new.name := mask_minor_names(new.name, ids);
  else
    new.entry_ids := null;  -- a team with its own name (or renamed): not an entry
  end if;
  return new;
end $$;

-- ---------- DB-15: names the server writes ----------------------------------------------------
-- The actor stamped on audit rows: initials for a possible minor (this trigger
-- runs after activity_log_mask_names, so it masks its own value).
create or replace function stamp_audit_actor()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if new.by_player_id is null or not (new.by_player_id = any(auth_player_ids())) then
    new.by_player_id := (auth_player_ids())[1];
  end if;
  new.by_name := public_person_name(new.by_player_id, (select full_name from players where id = new.by_player_id));
  new.at := now();
  return new;
end $$;

create or replace function handover_scoring(p_match uuid, p_to uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  old_name text;
begin
  if not can_manage_match(p_match) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
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

create or replace function transfer_tournament_ownership(p_tid uuid, p_org uuid, p_player_ids uuid[], p_host_name text, p_from_kind text, p_from_name text)
  returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := (auth_player_ids())[1];
  my_name text;
  old_ids uuid[];
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
    (p_tid, 'transferred', p_from_kind, mask_minor_names(p_from_name, old_ids),
     case when p_org is null then 'individual' else 'org' end, mask_minor_names(p_host_name, coalesce(p_player_ids, '{}')), me, my_name);
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

-- The players of a match's two teams (rosters, squads, entries) — usable in a
-- BEFORE INSERT trigger, where the match row doesn't exist yet.
create or replace function teams_linked_player_ids(p_home uuid, p_away uuid)
  returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct pid) filter (where pid is not null), '{}') from (
    select tm.player_id as pid from team_members tm where tm.team_id in (p_home, p_away)
    union select json_uuid(r.v) from teams t,
           jsonb_array_elements_text(case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as r(v)
     where t.id in (p_home, p_away)
    union select unnest(t.entry_ids) from teams t where t.id in (p_home, p_away)
  ) s;
$$;
revoke all on function teams_linked_player_ids(uuid, uuid) from public, anon, authenticated;

create or replace function matches_mask_minor_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  if new.potm is not null and jsonb_typeof(new.potm) = 'object' then
    if new.potm ? 'name' then
      new.potm := jsonb_set(new.potm, '{name}', to_jsonb(public_person_name(json_uuid(new.potm->>'playerId'), new.potm->>'name')));
    end if;
    if jsonb_typeof(new.potm->'auto') = 'object' and new.potm->'auto' ? 'name' then
      new.potm := jsonb_set(new.potm, '{auto,name}', to_jsonb(public_person_name(json_uuid(new.potm->'auto'->>'playerId'), new.potm->'auto'->>'name')));
    end if;
  end if;
  if new.result is not null and jsonb_typeof(new.result) = 'object' and new.result ? 'byName' then
    new.result := jsonb_set(new.result, '{byName}', to_jsonb(public_person_name(json_uuid(new.result->>'byId'), new.result->>'byName')));
  end if;
  -- DB-15: officials (by their player id, else by the teams' children) and the
  -- free-text team managers
  if (jsonb_typeof(new.officials) = 'array' and jsonb_array_length(new.officials) > 0)
     or (jsonb_typeof(new.managers) = 'object' and new.managers <> '{}'::jsonb) then
    ids := teams_linked_player_ids(new.home_team_id, new.away_team_id);
    if jsonb_typeof(new.officials) = 'array' then
      select coalesce(jsonb_agg(
               case when jsonb_typeof(o) = 'object' and jsonb_typeof(o->'name') = 'string' then
                 jsonb_set(o, '{name}', to_jsonb(coalesce(
                   case when json_uuid(o->>'playerId') is not null then public_person_name(json_uuid(o->>'playerId'), o->>'name') end,
                   mask_minor_names(o->>'name', ids))))
               else o end order by ord), '[]'::jsonb)
        into new.officials
        from jsonb_array_elements(new.officials) with ordinality as x(o, ord);
    end if;
    if jsonb_typeof(new.managers) = 'object' and cardinality(ids) > 0 then
      new.managers := mask_minor_names_json(new.managers, ids);
    end if;
  end if;
  return new;
exception when others then
  return new;  -- never block a match write
end $$;
drop trigger if exists matches_mask_minor_names on matches;
create trigger matches_mask_minor_names before insert or update of potm, result, officials, managers on matches
  for each row execute function matches_mask_minor_names();
