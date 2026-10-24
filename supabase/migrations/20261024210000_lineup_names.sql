-- ============================================================================
--  Line-ups: a child's name is never stored in the public line-up slots
--  (IDs-only close-out, founder 2026-10-24 — docs/privacy/ids-only-scoring.md)
--
--  match_lineups.home / away are arrays of positional slots
--  { position, x, y, playerId, playerName, … } and are publicly readable. A
--  trigger stores a possible minor's playerName as initials (public_person_name,
--  migration 20261024200000_minor_names_misc — run that first). The app shows
--  each slot's player by id (LineupView; the editor re-reads the squad).
-- ============================================================================
create or replace function lineup_slots_masked(p_slots jsonb)
  returns jsonb language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(p_slots) <> 'array' then p_slots else (
    select coalesce(jsonb_agg(
             case when jsonb_typeof(sl) = 'object' and sl ? 'playerName' and json_uuid(sl->>'playerId') is not null
                  then sl || jsonb_build_object('playerName', public_person_name(json_uuid(sl->>'playerId'), sl->>'playerName'))
                  else sl end order by ord), '[]'::jsonb)
      from jsonb_array_elements(p_slots) with ordinality as x(sl, ord)) end;
$$;
revoke all on function lineup_slots_masked(jsonb) from public, anon, authenticated;

create or replace function match_lineups_mask_names()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.home := lineup_slots_masked(new.home);
  new.away := lineup_slots_masked(new.away);
  return new;
end $$;
drop trigger if exists match_lineups_mask_names on match_lineups;
create trigger match_lineups_mask_names before insert or update on match_lineups
  for each row execute function match_lineups_mask_names();

update match_lineups set home = home;
