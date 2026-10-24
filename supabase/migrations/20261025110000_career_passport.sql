-- ============================================================================
--  Career passport (founder, 2026-10-25 — "hard to copy": a player's verified
--  record that selectors, coaches and scholarship panels can check).
--
--  A player (or their linked parent) creates a share code for their passport.
--  The link / QR app.sportnnote.in/pp/<code> shows their official record from
--  SportnNote: sports and results (the public stat lines), honours from their
--  certificates, and how their age was verified — the holder by name when an
--  adult, by initials when a possible minor (the paper / PDF the holder prints
--  has their full name). Sharing the code is the holder's choice: it reveals
--  their certificates, which are otherwise private. Resetting the code kills
--  the old link.
-- ============================================================================

alter table players add column if not exists passport_code text unique;

-- Only the functions below write it (a trusted RPC).
create or replace function guard_passport_code()
  returns trigger language plpgsql as $$
begin
  if is_client_request() then
    new.passport_code := case when tg_op = 'INSERT' then null else old.passport_code end;
  end if;
  return new;
end $$;
drop trigger if exists players_passport_code_guard on players;
create trigger players_passport_code_guard before insert or update on players
  for each row execute function guard_passport_code();

-- The player themselves, or their linked parent / guardian.
create or replace function passport_owner_or_raise(p_player uuid)
  returns players language plpgsql stable security definer set search_path = public as $$
declare pl players;
begin
  select * into pl from players where id = p_player;
  if pl.id is null or auth.uid() is null
     or not (pl.profile_id = auth.uid() or pl.guardian_profile_id = auth.uid()) then
    raise exception 'Only the player or their parent can share this passport' using errcode = '42501';
  end if;
  return pl;
end $$;
revoke all on function passport_owner_or_raise(uuid) from public, anon, authenticated;

-- The passport's share code (made on first use).
create or replace function passport_code(p_player uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare pl players; c text;
begin
  pl := passport_owner_or_raise(p_player);
  if pl.passport_code is not null then return pl.passport_code; end if;
  c := new_certificate_code();
  perform set_config('app.trusted_rpc', 'on', true);
  update players set passport_code = c where id = p_player;
  perform set_config('app.trusted_rpc', 'off', true);
  return c;
end $$;
revoke all on function passport_code(uuid) from public, anon;
grant execute on function passport_code(uuid) to authenticated;

-- A new code — the old link stops working.
create or replace function reset_passport_code(p_player uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  perform passport_owner_or_raise(p_player);
  c := new_certificate_code();
  perform set_config('app.trusted_rpc', 'on', true);
  update players set passport_code = c where id = p_player;
  perform set_config('app.trusted_rpc', 'off', true);
  return c;
end $$;
revoke all on function reset_passport_code(uuid) from public, anon;
grant execute on function reset_passport_code(uuid) to authenticated;

-- Anyone with the code: who it is (public-safe) and their honours.
create or replace function resolve_passport(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pl players; mine boolean;
begin
  select * into pl from players where passport_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if pl.id is null then return jsonb_build_object('found', false); end if;
  -- The player / their parent sees (and prints) the full name.
  mine := auth.uid() is not null and (pl.profile_id = auth.uid() or pl.guardian_profile_id = auth.uid());
  return jsonb_build_object(
    'found', true,
    'playerId', pl.id,
    'owner', mine,
    'name', case when mine then pl.full_name else public_person_name(pl.id, pl.full_name) end,
    'adult', player_is_known_adult(pl.dob, pl.profile_id),
    'ageVerifiedBy', case
      when pl.verification->>'status' = 'approved' then 'document'
      when pl.dob is not null and pl.dob_confirmations->'org'->>'dob' = pl.dob::text then 'school'
      when pl.dob is not null and pl.dob_confirmations->'parent'->>'dob' = pl.dob::text then 'parent'
    end,
    'since', pl.created_at,
    'sports', to_jsonb(pl.sports),
    -- Official record: their stat lines from tournament matches / events (no
    -- opponent names). The app sums them per sport.
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport', s.sport, 'stats', s.stats, 'event', s.event_id is not null,
               'result', case when s.event_id is not null then null
                              when m.status is distinct from 'completed' then null
                              else coalesce(s.result, case when s.won then 'W' else 'L' end) end)
             order by s.recorded_at)
        from stat_lines s
        left join matches m on m.id = s.match_id
        left join field_events e on e.id = s.event_id
       where s.player_id = pl.id
         and coalesce(e.tournament_id, m.tournament_id) is not null
         and coalesce(e.status, m.status) is distinct from 'cancelled'), '[]'::jsonb),
    'honours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', c.code, 'kind', c.kind, 'title', c.title, 'detail', c.detail, 'sport', c.sport,
               'teamName', c.team_name, 'eventDate', c.event_date,
               'issuer', coalesce((select o.name from organizations o where o.id = t.host_org_id), nullif(t.host_name, 'You'), 'the organisers'))
             order by coalesce(c.event_date, c.issued_at::date) desc)
        from certificates c left join tournaments t on t.id = c.tournament_id
       where c.player_id = pl.id and c.revoked_at is null and c.kind <> 'participation'), '[]'::jsonb));
end $$;
revoke all on function resolve_passport(text) from public;
grant execute on function resolve_passport(text) to anon, authenticated;
