-- ============================================================================
--  Fixes found while writing the website guides (2026-10-24).
--  1. Certificates: a revoked certificate no longer blocks issuing the right
--     one again — "one per player per achievement" now counts live
--     (non-revoked) certificates only.
--  2. Parent consent link: a child whose consent was self-declared at sign-up
--     (e.g. India) can now send their parent the link too. The parent's answer
--     upgrades it to parent-confirmed and can confirm the date of birth (or,
--     "I don't agree", withdraws it as before).
--  3. School / club DOB confirmations: each organisation's confirmation is kept
--     (dob_confirmations.orgs.<orgId>), so a second school confirming the same
--     player no longer un-ticks them on the first school's list. The single
--     'org' entry (the latest) is still written — players_view, the passport and
--     age badges read it, unchanged.
-- ============================================================================

-- ---------- 1. Certificates -------------------------------------------------
drop index if exists certificates_unique_achievement;
create unique index if not exists certificates_unique_live_achievement
  on certificates (coalesce(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid), player_id, kind, title, coalesce(detail, ''))
  where revoked_at is null;
-- (issue_certificates' "on conflict do nothing" has no target, so it honours
-- this partial index as is.)

-- ---------- 2. Parent consent link for self-declared accounts ---------------
create or replace function create_guardian_consent_code(p_profile uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18];
  code text := '';
  i int;
  pr profiles;
  email text;
begin
  select * into pr from profiles where id = p_profile;
  if pr.id is null then raise exception 'no profile'; end if;
  if coalesce(pr.guardian_consent, '') not in ('pending', 'withdrawn', 'self_declared') then
    raise exception 'No guardian confirmation is needed for this account.';
  end if;
  -- The player profile's guardian (editable in Edit profile) wins over the
  -- sign-up copy on the account.
  email := coalesce((select p.guardian->>'email' from players p where p.profile_id = pr.id
                      and coalesce(p.guardian->>'email', '') <> '' order by p.created_at limit 1),
                    nullif(pr.guardian->>'email', ''));
  if coalesce(email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Add your parent or guardian''s email first.';
  end if;
  foreach i in array idx loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into guardian_consent_requests (profile_id, code_hash, target_email, expires_at)
  values (p_profile, encode(sha256(convert_to(code, 'UTF8')), 'hex'), lower(email), now() + interval '7 days')
  on conflict (profile_id) do update
    set code_hash = excluded.code_hash, target_email = excluded.target_email,
        expires_at = excluded.expires_at, created_at = now();
  insert into consent_log (profile_id, kind, event, method) values (p_profile, 'guardian_consent', 'requested', 'email_link');
  return jsonb_build_object('code', code, 'email', lower(email), 'childName', pr.full_name,
                            'selfDeclared', pr.guardian_consent = 'self_declared');
end $$;
revoke all on function create_guardian_consent_code(uuid) from public, anon, authenticated;
grant execute on function create_guardian_consent_code(uuid) to service_role;

-- ---------- 3. One DOB confirmation per school / club -----------------------
create or replace function org_member_dobs(p_org uuid)
  returns table (player_id uuid, full_name text, dob date, age int, confirmed boolean, verified_by text)
  language plpgsql stable security definer set search_path = public as $$
begin
  perform org_dob_access_or_raise(p_org);
  return query
  select p.id, p.full_name, p.dob,
         case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end,
         coalesce(p.dob is not null and (
                    p.dob_confirmations->'orgs'->p_org::text->>'dob' = p.dob::text
                    -- confirmations made before this migration (single entry)
                    or (p.dob_confirmations->'org'->>'orgId' = p_org::text and p.dob_confirmations->'org'->>'dob' = p.dob::text)), false),
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
         || jsonb_build_object(
              -- the latest (read by players_view, the passport, age badges)
              'org', jsonb_build_object('orgId', p_org, 'orgName', org_name, 'at', now(), 'by', auth.uid(), 'dob', p.dob),
              -- every school / club that confirmed it
              'orgs', coalesce(p.dob_confirmations->'orgs', '{}'::jsonb)
                      || jsonb_build_object(p_org::text, jsonb_build_object('orgName', org_name, 'at', now(), 'by', auth.uid(), 'dob', p.dob)))
   where p.id = any(coalesce(p_players, '{}'::uuid[])) and p.dob is not null
     and p.id in (select m.player_id from org_members m
                   where m.org_id = p_org and (m.until is null or m.until >= current_date));
  get diagnostics n = row_count;
  perform set_config('app.trusted_rpc', 'off', true);
  return n;
end $$;
revoke all on function org_confirm_dobs(uuid, uuid[]) from public, anon;
grant execute on function org_confirm_dobs(uuid, uuid[]) to authenticated;
