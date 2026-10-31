-- ============================================================================
--  AS-02 (docs/security/breaks/audit-security-2026-10-31.md) — a dispute's
--  status only moves the way the scoring screen offers it:
--    reported → open (accept) · reported → dismissed
--    open → resolved          · open → dismissed
--  Closed disputes (resolved / dismissed) stay closed. Before this a match
--  manager could make ANY status change (reopen, re-resolve, skip triage).
--  Everything else in guard_dispute is unchanged: this is the body from
--  20261006120000_security_hardening.sql (its only definition) plus the
--  status check. Idempotent — safe to re-run.
-- ============================================================================
create or replace function guard_dispute()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  home_ok boolean;
  away_ok boolean;
begin
  if not is_client_request() then return new; end if;

  if tg_op = 'INSERT' then
    if new.kind = 'objection' then
      if not coalesce(new.player_id = any(auth_player_ids()), false) then
        raise exception 'You can only object to your own participation — report someone else instead'
          using errcode = '42501';
      end if;
      new.status := 'open';
    else
      new.status := 'reported';
    end if;
    new.home_captain_ok := false; new.away_captain_ok := false;
    new.replacement_id := null; new.replacement_name := null; new.resolved_at := null;
    return new;
  end if;

  -- AS-02: the allowed status moves, for everyone (match managers included).
  if new.status is distinct from old.status and not (
       (old.status = 'reported' and new.status in ('open', 'dismissed'))
    or (old.status = 'open' and new.status in ('resolved', 'dismissed'))
  ) then
    raise exception 'This dispute can''t move from % to %', old.status, new.status using errcode = '42501';
  end if;

  if can_manage_match(old.match_id) then return new; end if;

  if (new.match_id, new.side, new.player_id, new.player_name, new.kind, new.status,
      new.raised_by, new.raised_by_name, new.raised_at, new.resolved_at)
     is distinct from
     (old.match_id, old.side, old.player_id, old.player_name, old.kind, old.status,
      old.raised_by, old.raised_by_name, old.raised_at, old.resolved_at) then
    raise exception 'Only the match organizer can change this dispute''s status' using errcode = '42501';
  end if;
  home_ok := can_manage_match_side(old.match_id, 'home');
  away_ok := can_manage_match_side(old.match_id, 'away');
  if new.home_captain_ok is distinct from old.home_captain_ok and not home_ok then
    raise exception 'Only the home side can confirm for the home side' using errcode = '42501';
  end if;
  if new.away_captain_ok is distinct from old.away_captain_ok and not away_ok then
    raise exception 'Only the away side can confirm for the away side' using errcode = '42501';
  end if;
  return new;
end $$;
