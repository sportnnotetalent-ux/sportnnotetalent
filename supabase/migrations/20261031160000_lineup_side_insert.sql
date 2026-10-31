-- ============================================================================
--  match_lineups holds BOTH teams' on-pitch layouts in one row per match.
--  guard_lineup_side (20261006120000_security_hardening.sql, its only
--  definition) stops a team manager changing the other side — but only on
--  UPDATE. The row's first INSERT wasn't checked, so a captain who saved first
--  could fill in the other team's layout. Same rule now on insert: a side the
--  caller doesn't manage must start empty. Update behaviour is unchanged.
--  Idempotent — safe to re-run.
-- ============================================================================
create or replace function guard_lineup_side()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if tg_op = 'INSERT' then
    if can_manage_match(new.match_id) then return new; end if;
    if not can_manage_match_side(new.match_id, 'home')
       and (coalesce(new.home, '[]'::jsonb) <> '[]'::jsonb or new.home_formation is not null) then
      raise exception 'You can only change your own team''s lineup' using errcode = '42501';
    end if;
    if not can_manage_match_side(new.match_id, 'away')
       and (coalesce(new.away, '[]'::jsonb) <> '[]'::jsonb or new.away_formation is not null) then
      raise exception 'You can only change your own team''s lineup' using errcode = '42501';
    end if;
    return new;
  end if;
  if can_manage_match(old.match_id) then return new; end if;
  if not can_manage_match_side(old.match_id, 'home')
     and (new.home, new.home_formation) is distinct from (old.home, old.home_formation) then
    raise exception 'You can only change your own team''s lineup' using errcode = '42501';
  end if;
  if not can_manage_match_side(old.match_id, 'away')
     and (new.away, new.away_formation) is distinct from (old.away, old.away_formation) then
    raise exception 'You can only change your own team''s lineup' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_lineup_side on match_lineups;
create trigger guard_lineup_side before insert or update on match_lineups
  for each row execute function guard_lineup_side();
