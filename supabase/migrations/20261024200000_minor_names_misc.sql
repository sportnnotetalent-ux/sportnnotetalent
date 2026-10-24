-- ============================================================================
--  Children's names in the remaining public copies (IDs-only close-out,
--  founder 2026-10-24 — docs/privacy/ids-only-scoring.md)
--
--  A person's name is also copied, next to their id, into:
--    • matches.potm (Player of the Match + the auto pick it replaced)
--    • matches.result.byName (who closed the match by hand)
--    • tournaments.awards.items[].playerName (+ teamName, which for a singles /
--      doubles entry is the player's name)
--    • match_disputes.player_name / raised_by_name / replacement_name and its
--      history (byName, and notes like "reassigned to <name>")
--    • activity_log.by_name (+ its detail text)
--    • field_entries.result.members[].name (relay / crew members)
--  All of these are publicly readable. A trigger on each stores a possible
--  minor's name (under 18, or no date of birth — the players_view rule) as
--  initials, so every writer (old app versions included) is covered. Adults
--  are unchanged. The app shows full names to the child's circle by id
--  (players_view). Backfills existing rows.
-- ============================================================================

-- The name to store publicly for a person (a player id, or an account id):
-- initials for a possible minor, else the stored name as given.
create or replace function public_person_name(p_id uuid, p_stored text)
  returns text language sql stable security definer set search_path = public as $$
  select case
    when p_stored is null or p_id is null then p_stored
    when exists (select 1 from players p
                  where (p.id = p_id or p.profile_id = p_id)
                    and not player_is_known_adult(p.dob, p.profile_id))
      then coalesce((select name_initials(p.full_name) from players p
                      where p.id = p_id or p.profile_id = p_id
                      order by (p.id = p_id) desc, p.created_at limit 1), name_initials(p_stored))
    else p_stored
  end;
$$;
revoke all on function public_person_name(uuid, text) from public, anon, authenticated;

-- A UUID from jsonb text, or null when it isn't one.
create or replace function json_uuid(p text)
  returns uuid language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

-- ---------- matches.potm / matches.result ------------------------------------------
create or replace function matches_mask_minor_names()
  returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
end $$;
drop trigger if exists matches_mask_minor_names on matches;
create trigger matches_mask_minor_names before insert or update of potm, result on matches
  for each row execute function matches_mask_minor_names();

-- ---------- tournaments.awards ---------------------------------------------------------
create or replace function tournaments_mask_award_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare items jsonb;
begin
  if new.awards is null or jsonb_typeof(new.awards->'items') <> 'array' then return new; end if;
  select coalesce(jsonb_agg(
           case when jsonb_typeof(it) = 'object' then
             it || jsonb_strip_nulls(jsonb_build_object(
               'playerName', public_person_name(json_uuid(it->>'playerId'), it->>'playerName'),
               'teamName', case when json_uuid(it->>'playerId') is not null and it ? 'teamName'
                                then mask_minor_names(it->>'teamName', array[json_uuid(it->>'playerId')]) end))
           else it end order by ord), '[]'::jsonb)
    into items
    from jsonb_array_elements(new.awards->'items') with ordinality as a(it, ord);
  new.awards := jsonb_set(new.awards, '{items}', items);
  return new;
end $$;
drop trigger if exists tournaments_mask_award_names on tournaments;
create trigger tournaments_mask_award_names before insert or update of awards on tournaments
  for each row execute function tournaments_mask_award_names();

-- ---------- match_disputes --------------------------------------------------------------
create or replace function match_disputes_mask_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare ids uuid[] := array_remove(array[new.player_id, new.replacement_id], null);
begin
  new.player_name := public_person_name(new.player_id, new.player_name);
  new.raised_by_name := public_person_name(new.raised_by, new.raised_by_name);
  new.replacement_name := public_person_name(new.replacement_id, new.replacement_name);
  if jsonb_typeof(new.history) = 'array' then
    select coalesce(jsonb_agg(
             case when jsonb_typeof(h) = 'object' then
               h || jsonb_strip_nulls(jsonb_build_object(
                 'byName', public_person_name(json_uuid(h->>'byId'), h->>'byName'),
                 'note', case when h ? 'note' then mask_minor_names(h->>'note', ids) end))
             else h end order by ord), '[]'::jsonb)
      into new.history
      from jsonb_array_elements(new.history) with ordinality as x(h, ord);
  end if;
  return new;
end $$;
drop trigger if exists match_disputes_mask_names on match_disputes;
create trigger match_disputes_mask_names before insert or update on match_disputes
  for each row execute function match_disputes_mask_names();

-- ---------- activity_log ------------------------------------------------------------------
create or replace function activity_log_mask_names()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.by_player_id is not null then
    new.detail := mask_minor_names(new.detail, array[new.by_player_id]);
    new.by_name := public_person_name(new.by_player_id, new.by_name);
  end if;
  return new;
end $$;
drop trigger if exists activity_log_mask_names on activity_log;
create trigger activity_log_mask_names before insert or update on activity_log
  for each row execute function activity_log_mask_names();

-- ---------- field_entries.result.members (relay / crew) ----------------------------------
create or replace function field_entries_mask_member_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare members jsonb;
begin
  if new.result is null or jsonb_typeof(new.result->'members') <> 'array' then return new; end if;
  select coalesce(jsonb_agg(
           case when jsonb_typeof(m) = 'object' and json_uuid(m->>'playerId') is not null
                then m || jsonb_build_object('name', public_person_name(json_uuid(m->>'playerId'), m->>'name'))
                else m end order by ord), '[]'::jsonb)
    into members
    from jsonb_array_elements(new.result->'members') with ordinality as x(m, ord);
  new.result := jsonb_set(new.result, '{members}', members);
  return new;
end $$;
drop trigger if exists field_entries_mask_member_names on field_entries;
create trigger field_entries_mask_member_names before insert or update of result on field_entries
  for each row execute function field_entries_mask_member_names();

-- ---------- Backfill (fires the triggers above) -------------------------------------------
update matches set potm = potm where potm is not null;
update matches set result = result where result ? 'byName';
update tournaments set awards = awards where awards is not null;
update match_disputes set player_name = player_name;
update activity_log set by_name = by_name where by_player_id is not null;
update field_entries set result = result where jsonb_typeof(result->'members') = 'array';
