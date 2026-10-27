-- ============================================================================
--  Scoring safety net: no child's full name in public match data, whatever
--  app version saves it (founder 2026-10-27, "2A";
--  docs/privacy/ids-only-scoring.md, close-out)
--
--  Since 24 Oct the app stores player ids only in match_events (payload,
--  attribution) and matches.state, and looks names up when it shows them. A
--  phone still on an older version (until a restart picks up the update)
--  would still save full names into this public data. These triggers catch
--  that, the way the entry / POTM / awards / dispute triggers already do:
--  every possible minor (under 18, or no date of birth — the players_view
--  rule) linked to the match has their full name stored as initials ("A. R.").
--  Linked = both sides' squads and singles / doubles entries, plus every
--  player id in the data being saved.
--   • Nothing is refused: the event or snapshot is always saved, so no scorer
--     sees an error. On any surprise it is saved exactly as sent (fails open).
--   • Only whole words inside string values change; JSON keys never do.
--   • Adults' names are unchanged (their profiles are public anyway).
--   • Today's app sends no names, so its data passes through unchanged.
--  New writes only; rows already stored are the clean-up script's job
--  (scripts/check-minor-names.sql counts them).
-- ============================================================================

-- ---------- 1. The players linked to a match + the ids inside some data ----------
create or replace function match_linked_player_ids(p_match uuid, p_data jsonb)
  returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct pid) filter (where pid is not null), '{}')
    from (
      -- both sides' squads
      select tm.player_id as pid
        from matches m join team_members tm on tm.team_id in (m.home_team_id, m.away_team_id)
       where m.id = p_match
      union
      -- community teams' explicit rosters
      select json_uuid(r.v)
        from matches m join teams t on t.id in (m.home_team_id, m.away_team_id),
             jsonb_array_elements_text(case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as r(v)
       where m.id = p_match
      union
      -- singles / doubles entries
      select unnest(t.entry_ids)
        from matches m join teams t on t.id in (m.home_team_id, m.away_team_id)
       where m.id = p_match
      union
      -- any player id in the data itself (strikerId, playerId, {id}, lineups…)
      select json_uuid(v #>> '{}')
        from jsonb_path_query(coalesce(p_data, 'null'::jsonb), 'strict $.**') as v
       where jsonb_typeof(v) = 'string'
    ) s;
$$;
revoke all on function match_linked_player_ids(uuid, jsonb) from public, anon, authenticated;

-- ---------- 2. Mask possible minors' full names inside JSON --------------------------
-- Each name: the whole name (not "Ram Kumar" inside "Shriram Kumar"), any case,
-- any spacing between its words, and never a key (a key is followed by `":`).
-- Longest names first, so "Asha Rao Kumar" goes before "Asha Rao". Checked on
-- the live database's regex engine (read-only) — Devanagari names included.
create or replace function mask_minor_names_json(p_data jsonb, p_players uuid[])
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  t text;
  lt text;
  pat text;
begin
  if p_data is null or p_players is null or cardinality(p_players) = 0
     or jsonb_typeof(p_data) not in ('object', 'array', 'string') then
    return p_data;
  end if;
  t := p_data::text;
  lt := lower(t);
  for r in
    select n from (
      select distinct regexp_replace(trim(full_name), '\s+', ' ', 'g') as n
        from players
       where id = any(p_players) and not player_is_known_adult(dob, profile_id)
         and length(trim(coalesce(full_name, ''))) >= 3
    ) s order by length(n) desc, n
  loop
    continue when strpos(lt, lower(split_part(r.n, ' ', 1))) = 0;        -- cheap skip
    pat := regexp_replace(r.n, '([^[:alnum:][:space:]])', '\\\1', 'g');    -- literal text
    pat := '(?<![[:alnum:]_])' || replace(pat, ' ', '\s+') || '(?![[:alnum:]_])(?!"\s*:)';
    t := regexp_replace(t, pat, name_initials(r.n), 'gi');
  end loop;
  return t::jsonb;
exception when others then
  return p_data;  -- never block scoring
end $$;
revoke all on function mask_minor_names_json(jsonb, uuid[]) from public, anon, authenticated;

-- ---------- 3. match_events: payload + attribution ----------------------------------
create or replace function match_events_mask_minor_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  ids := match_linked_player_ids(new.match_id, jsonb_build_array(new.payload, new.attribution));
  if cardinality(ids) > 0 then
    new.payload := mask_minor_names_json(new.payload, ids);
    new.attribution := mask_minor_names_json(new.attribution, ids);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists match_events_mask_minor_names on match_events;
create trigger match_events_mask_minor_names before insert or update of payload, attribution on match_events
  for each row execute function match_events_mask_minor_names();

-- ---------- 4. matches.state: the live snapshot saved after every tap ---------------
create or replace function matches_mask_state_names()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  if new.state is null or new.state = '{}'::jsonb
     or (tg_op = 'UPDATE' and new.state is not distinct from old.state) then
    return new;
  end if;
  ids := match_linked_player_ids(new.id, new.state);
  if cardinality(ids) > 0 then
    new.state := mask_minor_names_json(new.state, ids);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists matches_mask_state_names on matches;
create trigger matches_mask_state_names before insert or update of state on matches
  for each row execute function matches_mask_state_names();

-- Check (read-only), after running this — both should be 0 for new matches:
--   npx supabase db query --linked -f scripts/check-minor-names.sql
