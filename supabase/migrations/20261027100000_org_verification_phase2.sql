-- ============================================================================
--  Organisation verification, Phase 2 (founder, 2026-10-27): every registered
--  community type gets the same three steps as schools and colleges
--  (docs/verification/org-verification.md):
--    1. an official ID — at least one of the type's options (org_required_id_types);
--    2. one registration document;
--    3. proof the person is authorised (official email code, a letter signed by
--       the head + support's call-back, or the head confirming).
--
--  Types and the IDs that satisfy step 1:
--    Sports club / academy  society_reg · trust_reg · cin · llpin · gstin · udyam
--    Sports association     society_reg · trust_reg · cin
--    Company                cin · llpin                       (+ gstin optional)
--    Hospital chain         cin · llpin · trust_reg · society_reg (+ gstin)
--    NGO                    ngo_darpan · society_reg · trust_reg · cin (Section 8)
--    Housing society        coop_reg · society_reg
--  (School: udise, College: aishe — unchanged.)
--
--  Numbers from a LOCAL registrar (society / trust / co-operative registration,
--  state board school codes) can repeat in another state or district, so they
--  don't take part in "one verified community per official ID"; support still
--  sees the match.
--
--  Members' dates of birth: from now on only a verified school, college, sports
--  club, academy or association may confirm them (organisations that keep
--  members' records for sport). Live had 0 verified organisations, so nothing
--  is taken away.
--
--  Mirrors src/core/orgVerification.ts (OFFICIAL_ID_RULES, normOfficialId,
--  ORG_VERIFY, LOCAL_ID_TYPES, DOB_CONFIRM_TYPES) — tests/org-verification-phase2.test.mts.
--  Run in the SQL editor. Then deploy org-verify and verification-submit (wording).
-- ============================================================================

-- ---------- 1. The new ID types ----------------------------------------------------
alter table org_official_ids drop constraint if exists org_official_ids_id_type_check;
alter table org_official_ids add constraint org_official_ids_id_type_check check (id_type in (
  'udise', 'cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios', 'aishe',
  'cin', 'llpin', 'gstin', 'udyam', 'ngo_darpan', 'society_reg', 'trust_reg', 'coop_reg'));

create or replace function norm_official_id(p_type text, p_value text)
  returns text language sql immutable as $$
  select case
    when p_type = 'udise' then regexp_replace(coalesce(p_value, ''), '\D', '', 'g')
    else (
      select case p_type
        when 'llpin' then regexp_replace(x, '^([A-Z]{3})-?(\d{4})$', '\1-\2')
        when 'udyam' then regexp_replace(x, '^UDYAM-?([A-Z]{2})-?(\d{2})-?(\d{7})$', 'UDYAM-\1-\2-\3')
        when 'ngo_darpan' then regexp_replace(x, '^([A-Z]{2})[/-](\d{4})[/-](\d{7})$', '\1/\2/\3')
        else x
      end
      from (select upper(regexp_replace(trim(coalesce(p_value, '')), '\s+', '', 'g')) as x) v)
  end;
$$;

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
    else false
  end;
$$;

-- A local registrar's number: can repeat elsewhere, never blocks another community.
create or replace function org_local_id_types()
  returns text[] language sql immutable as $$
  select array['state_board', 'society_reg', 'trust_reg', 'coop_reg'];
$$;

-- What satisfies step 1 for each type.
create or replace function org_required_id_types(p_type text)
  returns text[] language sql immutable as $$
  select case p_type
    when 'School' then array['udise']
    when 'College' then array['aishe']
    when 'Sports club' then array['society_reg', 'trust_reg', 'cin', 'llpin', 'gstin', 'udyam']
    when 'Sports academy' then array['society_reg', 'trust_reg', 'cin', 'llpin', 'gstin', 'udyam']
    when 'Sports association' then array['society_reg', 'trust_reg', 'cin']
    when 'Company' then array['cin', 'llpin']
    when 'Hospital chain' then array['cin', 'llpin', 'trust_reg', 'society_reg']
    when 'NGO' then array['ngo_darpan', 'society_reg', 'trust_reg', 'cin']
    when 'Housing society' then array['coop_reg', 'society_reg']
  end;
$$;

-- ---------- 2. One verified community per (non-local) official ID ---------------
drop index if exists org_official_ids_one_verified;
create unique index if not exists org_official_ids_one_verified on org_official_ids (country, id_type, id_value)
  where locked and id_type not in ('state_board', 'society_reg', 'trust_reg', 'coop_reg');

-- (= 20261025190000 + the local-ID exception in the "already verified" check)
create or replace function set_org_official_ids(p_org uuid, p_ids jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o organizations;
  it jsonb;
  t text; val text; c text;
  holder text;
  changed boolean := false;
  keep text[] := '{}';
begin
  perform org_admin_or_raise(p_org);
  select * into o from organizations where id = p_org;
  if o.registered is not true then
    raise exception 'Only a registered organisation has official IDs' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_ids, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_ids, '[]'::jsonb)) > 8 then
    raise exception 'Up to 8 official IDs';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_ids, '[]'::jsonb)) loop
    t := it->>'type';
    c := upper(coalesce(nullif(it->>'country', ''), 'IN'));
    val := norm_official_id(t, it->>'value');
    continue when val = '';
    if not valid_official_id(t, val) then
      raise exception 'That % doesn’t look right — check it and try again', t using errcode = '22023';
    end if;
    holder := null;
    if not (t = any(org_local_id_types())) then
      select o2.name into holder from org_official_ids j join organizations o2 on o2.id = j.org_id
       where j.locked and j.country = c and j.id_type = t and j.id_value = val and j.org_id <> p_org limit 1;
    end if;
    if holder is not null then
      raise exception '% is already verified on SportnNote — ask its admins to add you', holder using errcode = '23505';
    end if;
    if not exists (select 1 from org_official_ids where org_id = p_org and id_type = t and id_value = val and country = c) then
      changed := true;
    end if;
    insert into org_official_ids (org_id, country, id_type, id_value)
    values (p_org, c, t, val)
    on conflict (org_id, id_type) do update set country = excluded.country, id_value = excluded.id_value, locked = false;
    keep := keep || t;
  end loop;
  if exists (select 1 from org_official_ids where org_id = p_org and not (id_type = any(keep))) then changed := true; end if;
  delete from org_official_ids where org_id = p_org and not (id_type = any(keep));
  -- a verified community whose official IDs change must be verified again
  if changed and o.verified_at is not null then
    perform set_config('app.trusted_rpc', 'on', true);
    update organizations set verified_at = null, verified_by = null where id = p_org;
    perform set_config('app.trusted_rpc', 'off', true);
  end if;
  return org_verification_state(p_org);
end $$;
revoke all on function set_org_official_ids(uuid, jsonb) from public, anon;
grant execute on function set_org_official_ids(uuid, jsonb) to authenticated;

create or replace function org_id_lookup(p_type text, p_value text, p_country text default 'IN')
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare val text := norm_official_id(p_type, p_value); c text := upper(coalesce(nullif(p_country, ''), 'IN'));
        vid uuid; vname text;  -- plain variables: a record left unassigned can't be read
begin
  if not valid_official_id(p_type, val) then return jsonb_build_object('valid', false); end if;
  if not (p_type = any(org_local_id_types())) then
    select o.id, o.name into vid, vname from org_official_ids j join organizations o on o.id = j.org_id
     where j.locked and j.country = c and j.id_type = p_type and j.id_value = val limit 1;
  end if;
  return jsonb_build_object(
    'valid', true, 'value', val,
    'verified', case when vid is null then null else jsonb_build_object('orgId', vid, 'name', vname) end,
    'others', (select count(*) from org_official_ids j where not j.locked and j.country = c and j.id_type = p_type and j.id_value = val));
end $$;
revoke all on function org_id_lookup(text, text, text) from public, anon;
grant execute on function org_id_lookup(text, text, text) to authenticated;

-- ---------- 3. Submitting: the type's ID options ------------------------------------
create or replace function submit_org_verification(p_org uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare o organizations; v org_verifications; need text[];
begin
  perform org_admin_or_raise(p_org);
  select * into o from organizations where id = p_org;
  select * into v from org_verifications where org_id = p_org;
  if o.registered is not true then raise exception 'Only a registered organisation can be verified' using errcode = '23514'; end if;
  if o.verified_at is not null then raise exception 'It’s already verified' using errcode = '55000'; end if;
  need := org_required_id_types(o.type);
  if need is null then
    raise exception 'Pick a standard community type first (school, club, company, NGO …)' using errcode = '0A000';
  end if;
  if not exists (select 1 from org_official_ids where org_id = p_org and id_type = any(need)) then
    raise exception 'Add the official ID first (step 1)' using errcode = '23502';
  end if;
  if v.org_id is null or v.doc_path is null then raise exception 'Upload the document first (step 2)' using errcode = '23502'; end if;
  if v.authority is null
     or (v.authority = 'email' and v.email_verified_at is null)
     or (v.authority = 'letter' and v.letter_path is null)
     or (v.authority = 'head' and (v.head_requested_at is null or v.head_declined_at is not null)) then
    raise exception 'Finish step 3 — show you’re authorised' using errcode = '23502';
  end if;
  update org_verifications
     set status = 'pending', submitted_at = now(), submitted_by = auth.uid(), reject_reason = null, updated_at = now()
   where org_id = p_org;
  perform org_history_add(p_org, jsonb_build_object('action', 'submitted', 'by', auth.uid()));
  perform set_config('app.trusted_rpc', 'on', true);
  update organizations set verification_requested_at = now() where id = p_org;
  perform set_config('app.trusted_rpc', 'off', true);
  return org_verification_state(p_org);
end $$;
revoke all on function submit_org_verification(uuid) from public, anon;
grant execute on function submit_org_verification(uuid) to authenticated;

-- ---------- 4. Approving: the clash check skips local registrars' numbers ----------
create or replace function decide_org_verification(p_org uuid, p_approve boolean, p_reason text default null, p_checks jsonb default null)
  returns void language plpgsql security definer set search_path = public as $$
declare clash text;
begin
  if not is_support() then raise exception 'Only SportnNote support verifies organisations' using errcode = '42501'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why it’s being sent back' using errcode = '22023';
  end if;
  insert into org_verifications (org_id) values (p_org) on conflict (org_id) do nothing;
  if p_approve then
    select o2.name into clash from org_official_ids i
      join org_official_ids j on j.locked and j.country = i.country and j.id_type = i.id_type and j.id_value = i.id_value and j.org_id <> i.org_id
      join organizations o2 on o2.id = j.org_id
     where i.org_id = p_org and not (i.id_type = any(org_local_id_types())) limit 1;
    if clash is not null then
      raise exception '% is already verified with the same official ID — send this one back', clash using errcode = '23505';
    end if;
    update org_official_ids set locked = true where org_id = p_org;
  end if;
  update org_verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         reject_reason = case when p_approve then null else left(trim(p_reason), 200) end,
         reviewed_by = auth.uid(), reviewed_at = now(), checks = p_checks, updated_at = now()
   where org_id = p_org;
  perform org_history_add(p_org, jsonb_build_object('action', case when p_approve then 'approved' else 'rejected' end,
                                                    'by', auth.uid(), 'reason', case when p_approve then null else left(trim(p_reason), 200) end));
  perform set_config('app.trusted_rpc', 'on', true);
  update organizations
     set verified_at = case when p_approve then now() end,
         verified_by = case when p_approve then auth.uid() end,
         verification_requested_at = null
   where id = p_org;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function decide_org_verification(uuid, boolean, text, jsonb) from public, anon;
grant execute on function decide_org_verification(uuid, boolean, text, jsonb) to authenticated;

-- ---------- 5. Members' dates of birth: schools, colleges and sports bodies -------
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
                   and type in ('School', 'College', 'Sports club', 'Sports academy', 'Sports association')) then
    raise exception 'Only a school, college or sports club, academy or association confirms members’ dates of birth' using errcode = '42501';
  end if;
end $$;
revoke all on function org_dob_access_or_raise(uuid) from public, anon, authenticated;

-- ============================================================================
--  Checks after running:
--    select norm_official_id('udyam', 'udyam ka 03 0012345');                    -- UDYAM-KA-03-0012345
--    select valid_official_id('cin', norm_official_id('cin', 'u92490ka2019ptc123456')); -- true
--    select org_required_id_types('Sports club');                                 -- {society_reg,…}
-- ============================================================================
