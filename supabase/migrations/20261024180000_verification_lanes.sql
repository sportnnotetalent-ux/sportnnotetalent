-- ============================================================================
--  Verification fast lanes, Phase 2: parent confirms, school confirms
--  (founder, 2026-10-24 — docs/verification/fast-lanes.md)
--
--  A date of birth can now be verified three ways, the fastest first:
--   • school / club — a VERIFIED organisation's Owner/Admin confirms its active
--     members' dates of birth against its own records, in bulk;
--   • parent — the parent confirms the child's date of birth while approving
--     consent (the emailed code), or later from Manage child;
--   • document — a reviewer approves an uploaded proof (Phase 1).
--  players.dob_confirmations records parent / org confirmations, each with the
--  date of birth it confirmed (so a changed date of birth stops counting), and
--  is written ONLY by the server functions below. players_view.age_verified_by
--  exposes the level ('document' / 'school' / 'parent') — nothing personal.
--  SportnNote reviewers verify an organisation once (on its request, or
--  directly); renaming it clears that.
-- ============================================================================

-- ---------- 1. Confirmations on the player ---------------------------------------
alter table players add column if not exists dob_confirmations jsonb;

create or replace function guard_dob_confirmations()
  returns trigger language plpgsql as $$
begin
  -- only the server functions below (trusted RPC) write confirmations
  if is_client_request() then
    new.dob_confirmations := case when tg_op = 'INSERT' then null else old.dob_confirmations end;
  end if;
  return new;
end $$;
drop trigger if exists players_dob_confirmations_guard on players;
create trigger players_dob_confirmations_guard before insert or update on players
  for each row execute function guard_dob_confirmations();

-- ---------- 2. Parent confirms (consent link) ---------------------------------------
create or replace function guardian_consent_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r guardian_consent_requests;
  pr profiles;
  yrs int;
  child_dob date;
begin
  r := guardian_consent_lookup(p_code);
  if r.profile_id is null then raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.'; end if;
  select * into pr from profiles where id = r.profile_id;
  -- the date of birth the parent is asked to confirm: the child's player row, else the account
  select coalesce(p.dob, pr.dob) into child_dob from players p
   where p.profile_id = r.profile_id order by p.created_at limit 1;
  child_dob := coalesce(child_dob, pr.dob);
  yrs := case when pr.dob is null then null else extract(year from age(current_date, pr.dob))::int end;
  return jsonb_build_object(
    'childFirstName', split_part(trim(pr.full_name), ' ', 1),
    'ageBand', case when yrs is null then null when yrs < 13 then 'under 13' else '13 to 17' end,
    'status', pr.guardian_consent,
    'dob', child_dob,
    'expiresAt', r.expires_at);
end $$;
revoke all on function guardian_consent_preview(text) from public;
grant execute on function guardian_consent_preview(text) to anon, authenticated;

drop function if exists guardian_consent_decide(text, boolean, text);
create or replace function guardian_consent_decide(p_code text, p_approve boolean, p_guardian_name text default null, p_dob_confirmed boolean default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r guardian_consent_requests;
  me uuid := auth.uid();
  linked boolean := false;
  a int;
  gname text := left(trim(coalesce(p_guardian_name, '')), 80);
begin
  -- Codes are 16 characters (80 bits), so guessing is hopeless; signed-in callers
  -- are still capped.
  if me is not null and not rate_limit_hit('guardian-consent-decide', me::text, 20, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  r := guardian_consent_lookup(p_code);
  if r.profile_id is null then raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.'; end if;
  if me = r.profile_id then
    raise exception 'This has to be done by your parent or guardian, not from your own account.' using errcode = '42501';
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  if p_approve then
    update profiles set guardian_consent = 'confirmed', guardian_consent_at = now(),
           guardian_consent_method = 'email_link', consent_withdrawn_at = null,
           guardian = coalesce(guardian, '{}'::jsonb)
                      || jsonb_build_object('confirmedAt', now(), 'emailVerified', true)
                      || case when gname <> '' then jsonb_build_object('confirmedName', gname) else '{}'::jsonb end
     where id = r.profile_id;
    -- The code reached the guardian email on file → it's verified.
    update players set guardian = coalesce(guardian, '{}'::jsonb) || '{"emailVerified": true}'::jsonb
     where profile_id = r.profile_id and lower(coalesce(guardian->>'email', '')) = r.target_email;
    -- Fast lanes (2026-10-24): the parent also confirms the child's date of birth.
    if coalesce(p_dob_confirmed, false) then
      update players set dob_confirmations = coalesce(dob_confirmations, '{}'::jsonb)
             || jsonb_build_object('parent', jsonb_build_object('at', now(), 'by', me, 'method', 'consent_link', 'dob', dob))
       where profile_id = r.profile_id and dob is not null;
    end if;
    if me is not null then
      a := profile_age(me);
      if a is null or a >= 18 then
        update players set guardian_profile_id = me
         where profile_id = r.profile_id and lower(coalesce(guardian->>'email', '')) = r.target_email;
        update message_threads t set recipient_profile_id = me
          from players p where p.id = t.subject_player_id and p.profile_id = r.profile_id and t.via_guardian;
        linked := exists (select 1 from players where profile_id = r.profile_id and guardian_profile_id = me);
      end if;
    end if;
  else
    update profiles set guardian_consent = 'withdrawn', consent_withdrawn_at = now(),
           guardian_consent_method = 'email_link'
     where id = r.profile_id;
  end if;
  perform set_config('app.trusted_rpc', 'off', true);

  insert into consent_log (profile_id, kind, event, method, actor_profile_id)
  values (r.profile_id, 'guardian_consent', case when p_approve then 'confirmed' else 'declined' end, 'email_link', me);
  delete from guardian_consent_requests where profile_id = r.profile_id;
  return jsonb_build_object('status', case when p_approve then 'confirmed' else 'withdrawn' end, 'linked', linked,
                            'dobConfirmed', p_approve and coalesce(p_dob_confirmed, false));
end $$;
revoke all on function guardian_consent_decide(text, boolean, text, boolean) from public;
grant execute on function guardian_consent_decide(text, boolean, text, boolean) to anon, authenticated;

-- ---------- 3. Parent confirms (linked guardian, any time) ----------------------------
-- The linked parent sees the date of birth they're asked to confirm (it's
-- otherwise private to the child and support).
create or replace function guardian_child_dob(p_player uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pl players;
begin
  pl := guardian_child_or_raise(p_player);
  return jsonb_build_object(
    'dob', pl.dob,
    'confirmed', pl.dob is not null and pl.dob_confirmations->'parent'->>'dob' = pl.dob::text,
    'verifiedBy', case
      when pl.verification->>'status' = 'approved' then 'document'
      when pl.dob is not null and pl.dob_confirmations->'org'->>'dob' = pl.dob::text then 'school'
      when pl.dob is not null and pl.dob_confirmations->'parent'->>'dob' = pl.dob::text then 'parent'
    end);
end $$;
revoke all on function guardian_child_dob(uuid) from public, anon;
grant execute on function guardian_child_dob(uuid) to authenticated;

create or replace function guardian_confirm_dob(p_player uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare pl players;
begin
  pl := guardian_child_or_raise(p_player);
  if pl.dob is null then raise exception 'Add their date of birth first (Edit profile).'; end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update players set dob_confirmations = coalesce(dob_confirmations, '{}'::jsonb)
         || jsonb_build_object('parent', jsonb_build_object('at', now(), 'by', auth.uid(), 'method', 'linked_guardian', 'dob', pl.dob))
   where id = p_player;
  perform set_config('app.trusted_rpc', 'off', true);
  return jsonb_build_object('confirmed', true, 'dob', pl.dob);
end $$;
revoke all on function guardian_confirm_dob(uuid) from public, anon;
grant execute on function guardian_confirm_dob(uuid) to authenticated;

-- ---------- 4. Verified organisations ----------------------------------------------
alter table organizations add column if not exists verified_at timestamptz;
alter table organizations add column if not exists verified_by uuid references profiles(id) on delete set null;
alter table organizations add column if not exists verification_requested_at timestamptz;

create or replace function guard_org_verification()
  returns trigger language plpgsql as $$
begin
  if is_client_request() then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verified_by := null; new.verification_requested_at := null;
    else
      new.verified_at := old.verified_at;
      new.verified_by := old.verified_by;
      new.verification_requested_at := old.verification_requested_at;
      -- a renamed organisation must be verified again
      if new.name is distinct from old.name then new.verified_at := null; new.verified_by := null; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists organizations_verification_guard on organizations;
create trigger organizations_verification_guard before insert or update on organizations
  for each row execute function guard_org_verification();

-- An Owner / Admin asks SportnNote to verify the organisation.
create or replace function request_org_verification(p_org uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the organisation''s owners and admins can ask for this' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update organizations set verification_requested_at = now() where id = p_org and verified_at is null;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function request_org_verification(uuid) from public, anon;
grant execute on function request_org_verification(uuid) to authenticated;

-- Reviewers: organisations waiting, and the decision.
create or replace function pending_org_verifications()
  returns table (org_id uuid, name text, type text, city text, email text, phone text, requested_at timestamptz, members bigint)
  language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.type, o.city, o.email, o.phone, o.verification_requested_at,
         (select count(*) from org_members m where m.org_id = o.id and (m.until is null or m.until >= current_date))
    from organizations o
   where is_verification_reviewer() and o.verification_requested_at is not null and o.verified_at is null
   order by o.verification_requested_at;
$$;
revoke all on function pending_org_verifications() from public, anon;
grant execute on function pending_org_verifications() to authenticated;

create or replace function review_org_verification(p_org uuid, p_approve boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_verification_reviewer() then
    raise exception 'Only SportnNote reviewers can verify organisations' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update organizations
     set verified_at = case when p_approve then now() end,
         verified_by = case when p_approve then auth.uid() end,
         verification_requested_at = null
   where id = p_org;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function review_org_verification(uuid, boolean) from public, anon;
grant execute on function review_org_verification(uuid, boolean) to authenticated;

-- ---------- 5. School / club confirms its members' dates of birth -------------------
create or replace function org_dob_access_or_raise(p_org uuid)
  returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the organisation''s owners and admins can do this' using errcode = '42501';
  end if;
  if not exists (select 1 from organizations where id = p_org and verified_at is not null) then
    raise exception 'SportnNote needs to verify the organisation first' using errcode = '42501';
  end if;
end $$;
revoke all on function org_dob_access_or_raise(uuid) from public, anon, authenticated;

create or replace function org_member_dobs(p_org uuid)
  returns table (player_id uuid, full_name text, dob date, age int, confirmed boolean, verified_by text)
  language plpgsql stable security definer set search_path = public as $$
begin
  perform org_dob_access_or_raise(p_org);
  return query
  select p.id, p.full_name, p.dob,
         case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end,
         coalesce(p.dob is not null and p.dob_confirmations->'org'->>'orgId' = p_org::text
                  and p.dob_confirmations->'org'->>'dob' = p.dob::text, false),
         case
           when p.verification->>'status' = 'approved' then 'document'
           when p.dob is not null and p.dob_confirmations->'org'->>'dob' = p.dob::text then 'school'
           when p.dob is not null and p.dob_confirmations->'parent'->>'dob' = p.dob::text then 'parent'
         end
    from players p
   where p.id in (select m.player_id from org_members m
                   where m.org_id = p_org and (m.until is null or m.until >= current_date))
   order by p.full_name;
end $$;
revoke all on function org_member_dobs(uuid) from public, anon;
grant execute on function org_member_dobs(uuid) to authenticated;

create or replace function org_confirm_dobs(p_org uuid, p_players uuid[])
  returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  org_name text;
begin
  perform org_dob_access_or_raise(p_org);
  select name into org_name from organizations where id = p_org;
  perform set_config('app.trusted_rpc', 'on', true);
  update players p
     set dob_confirmations = coalesce(p.dob_confirmations, '{}'::jsonb)
         || jsonb_build_object('org', jsonb_build_object('orgId', p_org, 'orgName', org_name, 'at', now(), 'by', auth.uid(), 'dob', p.dob))
   where p.id = any(coalesce(p_players, '{}'::uuid[])) and p.dob is not null
     and p.id in (select m.player_id from org_members m
                   where m.org_id = p_org and (m.until is null or m.until >= current_date));
  get diagnostics n = row_count;
  perform set_config('app.trusted_rpc', 'off', true);
  return n;
end $$;
revoke all on function org_confirm_dobs(uuid, uuid[]) from public, anon;
grant execute on function org_confirm_dobs(uuid, uuid[]) to authenticated;

-- ---------- 6. players_view: age_verified_by (appended; otherwise unchanged from 20261024120000) ---
create or replace view players_view with (security_barrier = true) as
with me as materialized (
  -- Uncorrelated and MATERIALIZED → evaluated once per query, never per row.
  select auth.uid() is null as anon, auth.uid() as uid, my_player_circle() as circle,
         -- F-04b: the teams whose roster the caller may edit, once per query
         case when auth.uid() is null then '{}'::uuid[] else my_roster_editable_team_ids() end as editable
)
select
  p.id, p.profile_id,
  case when v.full then p.full_name else name_initials(p.full_name) end as full_name,
  p.jersey_no, p.sports, p.house_name, p.house_color,
  case when v.full then p.city end as city,
  case when v.full then p.school_id end as school_id,
  p.phone_verified, p.email_verified,
  case when v.full then p.photo_url end as photo_url,
  case when v.full then p.sport_details end as sport_details,
  p.created_at, p.updated_at, p.invited,
  case when v.full then p.gender end as gender,
  case when v.full then p.bio end as bio,
  p.reported_at,
  case when v.full then p.created_by end as created_by,
  p.show_phone, p.show_email,
  case when v.full then a.age end as age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null or not v.full then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  case when a.priv then p.verification
       when p.verification is null or not v.full then null
       else jsonb_strip_nulls(jsonb_build_object('status', p.verification->>'status'))
  end as verification,
  case when v.full then p.guardian_profile_id is not null end as guardian_linked,
  p.findable_by_contact,
  not v.full as restricted,
  -- fast lanes: how this player's age was verified (a level, nothing personal) —
  -- a confirmation only counts for the date of birth it confirmed
  case
    when p.verification->>'status' = 'approved' then 'document'
    when p.dob is not null and p.dob_confirmations->'org'->>'dob' = p.dob::text then 'school'
    when p.dob is not null and p.dob_confirmations->'parent'->>'dob' = p.dob::text then 'parent'
  end as age_verified_by
from players p
cross join me
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    -- = can_contact_provisional(p.id): signed in and on the roster of a team the caller may edit
    case when p.profile_id is null
         then not me.anon and exists (select 1 from teams t where t.id = any(me.editable) and t.roster ? p.id::text)
         else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
  offset 0  -- evaluate once per row (else the planner copies each call into every column that uses it)
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
  offset 0
) v;
grant select on players_view to anon, authenticated;
