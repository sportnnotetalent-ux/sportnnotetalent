-- Match-day roles (reference-video C6, docs/security/breaks/match-roles.md).
-- Each side's match squad gets a captain (new) next to its keeper (keeper_id,
-- already live). Both must be players in that side's squad. Who may set them is
-- unchanged: the existing match_squads_write policy (can_manage_match_side).
alter table match_squads add column if not exists captain_id uuid;

create or replace function guard_match_squad_roles()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ids jsonb := coalesce(new.starters, '[]'::jsonb) || coalesce(new.subs, '[]'::jsonb);
  squad_changed boolean := tg_op = 'INSERT'
    or new.starters is distinct from old.starters or new.subs is distinct from old.subs;
begin
  -- MR1: a role given (or changed) must be someone in this side's squad.
  if new.captain_id is not null and not (ids ? new.captain_id::text) then
    if tg_op = 'UPDATE' and new.captain_id is not distinct from old.captain_id then
      new.captain_id := null; -- MR5: they left the squad, so they lose the role
    else
      raise exception 'The captain must be in this side''s squad.' using errcode = '22023';
    end if;
  end if;
  -- The keeper is checked only when it or the squad changes (MR7: older rows
  -- whose keeper isn't in the squad stay as they were until edited).
  if new.keeper_id is not null and not (ids ? new.keeper_id::text)
     and (tg_op = 'INSERT' or squad_changed or new.keeper_id is distinct from old.keeper_id) then
    if tg_op = 'UPDATE' and new.keeper_id is not distinct from old.keeper_id then
      new.keeper_id := null;
    else
      raise exception 'The keeper must be in this side''s squad.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists match_squads_roles on match_squads;
create trigger match_squads_roles
  before insert or update on match_squads
  for each row execute function guard_match_squad_roles();
