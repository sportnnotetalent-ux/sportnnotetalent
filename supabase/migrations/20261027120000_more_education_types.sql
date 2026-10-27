-- ============================================================================
--  More educational institutions (founder, 2026-10-27): "there are other
--  educational institutions apart from schools … who should also be able to set
--  up communities, verify themselves, and host sports tournaments year on year."
--
--  New community types, verified like schools and colleges:
--    Junior / PU college      UDISE+ code            (11–12 institutions)
--    University               AISHE code (U-…)
--    Polytechnic / institute  AISHE code (S-… / C-…) (diploma, nursing, teacher training …)
--    ITI                      ITI code from NCVT MIS (e.g. GU29000014)
--  Like schools and colleges they must be registered organisations, keep class /
--  year timelines (app: EDUCATION_TYPES), and once verified may confirm members'
--  dates of birth.
--
--  Mirrors src/core/orgVerification.ts (ORG_VERIFY, OFFICIAL_ID_RULES.iti,
--  OFFICIAL_ONLY_TYPES, DOB_CONFIRM_TYPES) — tests/education-types.test.mts.
--  Run in the SQL editor. Then deploy org-verify + verification-submit (wording).
-- ============================================================================

-- ---------- 1. The ITI code ----------------------------------------------------------
alter table org_official_ids drop constraint if exists org_official_ids_id_type_check;
alter table org_official_ids add constraint org_official_ids_id_type_check check (id_type in (
  'udise', 'cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios', 'aishe',
  'cin', 'llpin', 'gstin', 'udyam', 'ngo_darpan', 'society_reg', 'trust_reg', 'coop_reg', 'iti'));

create or replace function valid_official_id(p_type text, p_value text)
  returns boolean language sql immutable as $$
  select case p_type
    when 'udise' then p_value ~ '^\d{11}$'
    when 'cbse' then p_value ~ '^\d{4,8}$'
    when 'cisce' then p_value ~ '^[A-Z0-9]{3,10}$'
    when 'state_board' then p_value ~ '^[A-Z0-9/-]{2,20}$'
    when 'ib' then p_value ~ '^[A-Z0-9-]{3,10}$'
    when 'cambridge' then p_value ~ '^[A-Z0-9]{3,10}$'
    when 'nios' then p_value ~ '^[A-Z0-9/-]{3,20}$'
    when 'aishe' then p_value ~ '^[CUS]-\d{3,6}$'
    when 'cin' then p_value ~ '^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$'
    when 'llpin' then p_value ~ '^[A-Z]{3}-\d{4}$'
    when 'gstin' then p_value ~ '^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
    when 'udyam' then p_value ~ '^UDYAM-[A-Z]{2}-\d{2}-\d{7}$'
    when 'ngo_darpan' then p_value ~ '^[A-Z]{2}[/]\d{4}[/]\d{7}$'
    when 'society_reg' then p_value ~ '^[A-Z0-9/().&-]{3,40}$'
    when 'trust_reg' then p_value ~ '^[A-Z0-9/().&-]{3,40}$'
    when 'coop_reg' then p_value ~ '^[A-Z0-9/().&-]{3,40}$'
    when 'iti' then p_value ~ '^[A-Z]{2}\d{8}$'
    else false
  end;
$$;

-- ---------- 2. What satisfies step 1 for the new types ---------------------------------
create or replace function org_required_id_types(p_type text)
  returns text[] language sql immutable as $$
  select case p_type
    when 'School' then array['udise']
    when 'Junior / PU college' then array['udise']
    when 'College' then array['aishe']
    when 'University' then array['aishe']
    when 'Polytechnic / institute' then array['aishe']
    when 'ITI' then array['iti']
    when 'Sports club' then array['society_reg', 'trust_reg', 'cin', 'llpin', 'gstin', 'udyam']
    when 'Sports academy' then array['society_reg', 'trust_reg', 'cin', 'llpin', 'gstin', 'udyam']
    when 'Sports association' then array['society_reg', 'trust_reg', 'cin']
    when 'Company' then array['cin', 'llpin']
    when 'Hospital chain' then array['cin', 'llpin', 'trust_reg', 'society_reg']
    when 'NGO' then array['ngo_darpan', 'society_reg', 'trust_reg', 'cin']
    when 'Housing society' then array['coop_reg', 'society_reg']
  end;
$$;

-- ---------- 3. Educational institutions are registered organisations ------------------
-- (= 20261025190000 with the full list of educational types)
create or replace function guard_org_verification()
  returns trigger language plpgsql as $$
begin
  if new.registered is false and new.type in ('School', 'Junior / PU college', 'College', 'University', 'Polytechnic / institute', 'ITI') then
    raise exception 'An educational institution is a registered organisation — choose “Registered”, or pick another type for an informal group.' using errcode = '23514';
  end if;
  if is_client_request() then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verified_by := null; new.verification_requested_at := null;
    else
      new.verified_at := old.verified_at;
      new.verified_by := old.verified_by;
      new.verification_requested_at := old.verification_requested_at;
      -- renamed, retyped or re-registered → must be verified again
      if new.name is distinct from old.name or new.type is distinct from old.type
         or new.registered is distinct from old.registered then
        new.verified_at := null; new.verified_by := null;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------- 4. Members' dates of birth: every educational institution ----------------
create or replace function org_dob_access_or_raise(p_org uuid)
  returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the organisation''s owners and admins can do this' using errcode = '42501';
  end if;
  if not exists (select 1 from organizations where id = p_org and verified_at is not null) then
    raise exception 'SportnNote needs to verify the organisation first' using errcode = '42501';
  end if;
  if not exists (select 1 from organizations where id = p_org
                   and type in ('School', 'Junior / PU college', 'College', 'University', 'Polytechnic / institute', 'ITI',
                                'Sports club', 'Sports academy', 'Sports association')) then
    raise exception 'Only an educational institution or a sports club, academy or association confirms members’ dates of birth' using errcode = '42501';
  end if;
end $$;
revoke all on function org_dob_access_or_raise(uuid) from public, anon, authenticated;

-- ============================================================================
--  Checks after running:
--    select valid_official_id('iti', norm_official_id('iti', 'gu 29000014'));   -- true
--    select org_required_id_types('University');                               -- {aishe}
-- ============================================================================
