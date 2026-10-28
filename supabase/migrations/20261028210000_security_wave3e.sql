-- ============================================================================
--  Security Wave 3E — the app's findings, enforced on the server
--  (docs/security/audit-2026-10-27/PLAN.md · tests/db-wave3.test.mts)
--
--  CL-14  the guardian's phoneVerified / emailVerified flags are written only
--         by the server (the verification functions); a changed contact loses
--         its flag.
--  CL-15  verification documents: images and PDFs only, 10 MB at most.
--  CL-17  "Reset match" is one step (reset_match), with Wave 3B's rules; a
--         changed Player of the Match can't be changed again, except by the
--         tournament's organisers or support.
-- ============================================================================

-- ---------- CL-14 --------------------------------------------------------------------------------
-- A client's new guardian json, with the verified flags as the server last
-- set them — kept only while that email / number is unchanged.
create or replace function guardian_with_server_flags(p_new jsonb, p_old jsonb)
  returns jsonb language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p_new) <> 'object' then p_new else
    (p_new - 'phoneVerified' - 'emailVerified')
    || case when coalesce((p_old->>'phoneVerified')::boolean, false)
              and regexp_replace(coalesce(p_new->>'phone', ''), '\D', '', 'g') = regexp_replace(coalesce(p_old->>'phone', ''), '\D', '', 'g')
              and coalesce(p_new->>'phone', '') <> ''
            then '{"phoneVerified": true}'::jsonb else '{}'::jsonb end
    || case when coalesce((p_old->>'emailVerified')::boolean, false)
              and lower(coalesce(p_new->>'email', '')) = lower(coalesce(p_old->>'email', ''))
              and coalesce(p_new->>'email', '') <> ''
            then '{"emailVerified": true}'::jsonb else '{}'::jsonb end
  end;
$$;
revoke all on function guardian_with_server_flags(jsonb, jsonb) from public, anon, authenticated;

create or replace function guard_guardian_flags()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or new.guardian is null then return new; end if;
  new.guardian := guardian_with_server_flags(new.guardian, case when tg_op = 'UPDATE' then old.guardian end);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists guard_guardian_flags on players;
create trigger guard_guardian_flags before insert or update of guardian on players
  for each row execute function guard_guardian_flags();

-- ---------- CL-15 --------------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
 where id = 'verification-docs';

-- ---------- CL-17: reset in one step ---------------------------------------------------------------
create or replace function reset_match(p_match uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
begin
  if auth.uid() is null or not can_manage_match(p_match) then
    raise exception 'You''re not allowed to reset this match' using errcode = '42501';
  end if;
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if m.status = 'completed' and not can_correct_match(p_match) then
    raise exception 'This match is finished — only its organisers can change it now' using errcode = '42501';
  end if;
  if m.tournament_id is not null and not can_manage_tournament(m.tournament_id) and not is_support()
     and exists (select 1 from match_events e where e.match_id = p_match and e.created_at < now() - interval '30 minutes') then
    raise exception 'Only the tournament''s organisers can wind this match back' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update matches
     set state = '{}'::jsonb, status = 'scheduled', winner = null, result = null, potm = null,
         active_scorer_id = null, active_scorer_device = null, active_scorer_at = null,
         format = case when jsonb_typeof(format) = 'object' then format - '__break' else format end,
         updated_at = now()
   where id = p_match;
  delete from match_events where match_id = p_match;
  update stat_lines set stats = '{}'::jsonb, won = false, result = null where match_id = p_match;
  delete from parked_stat_lines where match_id = p_match;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function reset_match(uuid) from public, anon;
grant execute on function reset_match(uuid) to authenticated;

-- ---------- CL-17: Player of the Match changes once ----------------------------------------------
create or replace function guard_potm_once()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or is_support() then return new; end if;
  if jsonb_typeof(old.potm) = 'object' and old.potm ? 'by' and new.potm is distinct from old.potm
     and not (old.tournament_id is not null and can_manage_tournament(old.tournament_id)) then
    raise exception 'Player of the Match can only be changed once.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_potm_once on matches;
create trigger guard_potm_once before update of potm on matches for each row execute function guard_potm_once();
