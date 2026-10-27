-- Organisation verification, Phase 3 (2026-10-27): other markets.
-- docs/verification/org-verification.md → Phase 3.
--
-- A community's market (organizations.market — the school system it picked)
-- now decides which official IDs satisfy step 1:
--   UK  — school URN, Scotland / Wales / NI school reference, UKPRN,
--         Companies House number, registered charity number;
--   US  — NCES school ID, IPEDS unit ID, EIN, state entity number;
--   SG  — UEN, MOE school code;   MY — SSM number, MOE school code, ROS number;
--   AU  — ABN (with its checksum), ACARA school ID, TEQSA provider ID,
--         incorporated association number;
--   Gulf — education regulator licence (KHDA, ADEK, SPEA, MOE …), trade licence,
--          and CBSE for Indian-curriculum schools;
--   every market — "Registration number" (any official register) as the
--   catch-all, so nobody is stuck at step 1.
-- India is unchanged (org_required_id_types). Numbers a state, emirate or local
-- register issues are "local": they never block another community.
-- The rules mirror src/core/orgVerification.ts (MARKET_IDS, OFFICIAL_ID_RULES).
--
-- Idempotent — safe to re-run.

-- ---------- 1. The new ID types ------------------------------------------------------
alter table org_official_ids drop constraint if exists org_official_ids_id_type_check;
alter table org_official_ids add constraint org_official_ids_id_type_check check (id_type in (
  'udise', 'cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios', 'aishe',
  'cin', 'llpin', 'gstin', 'udyam', 'ngo_darpan', 'society_reg', 'trust_reg', 'coop_reg', 'iti',
  'urn', 'uk_school_ref', 'ukprn', 'companies_house', 'uk_charity',
  'nces', 'ipeds', 'ein', 'us_state_entity',
  'uen', 'sg_moe', 'ssm', 'my_moe', 'my_ros',
  'abn', 'acara', 'teqsa', 'au_assoc',
  'gulf_school', 'trade_licence', 'other_reg'));

create or replace function norm_official_id(p_type text, p_value text)
  returns text language sql immutable as $$
  select case
    when p_type in ('udise', 'urn', 'ukprn', 'ipeds', 'abn', 'acara', 'sg_moe') then regexp_replace(coalesce(p_value, ''), '\D', '', 'g')
    when p_type = 'ein' then regexp_replace(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), '^(\d{2})(\d{7})$', '\1-\2')
    else (
      select case p_type
        when 'llpin' then regexp_replace(x, '^([A-Z]{3})-?(\d{4})$', '\1-\2')
        when 'udyam' then regexp_replace(x, '^UDYAM-?([A-Z]{2})-?(\d{2})-?(\d{7})$', 'UDYAM-\1-\2-\3')
        when 'ngo_darpan' then regexp_replace(x, '^([A-Z]{2})[/-](\d{4})[/-](\d{7})$', '\1/\2/\3')
        -- a Companies House number typed without its leading zeros
        when 'companies_house' then case when x ~ '^\d{1,7}$' then lpad(x, 8, '0') else x end
        else x
      end
      from (select upper(regexp_replace(trim(coalesce(p_value, '')), '\s+', '', 'g')) as x) v)
  end;
$$;

-- The Australian Business Number checksum (src/core/orgVerification.ts abnOk).
create or replace function abn_ok(p_abn text)
  returns boolean language sql immutable as $$
  select case when coalesce(p_abn, '') ~ '^\d{11}$' then (
    select sum((substr(p_abn, i, 1)::int - case when i = 1 then 1 else 0 end) * (array[10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19])[i]) % 89 = 0
      from generate_series(1, 11) i)
  else false end;
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
    when 'iti' then p_value ~ '^[A-Z]{2}\d{8}$'
    -- Phase 3
    when 'urn' then p_value ~ '^\d{6}$'
    when 'uk_school_ref' then p_value ~ '^[A-Z0-9/-]{4,12}$'
    when 'ukprn' then p_value ~ '^1\d{7}$'
    when 'companies_house' then p_value ~ '^(\d{8}|[A-Z]{2}\d{6})$'
    when 'uk_charity' then p_value ~ '^(\d{6,7}|SC\d{6}|NIC\d{6})$'
    when 'nces' then p_value ~ '^(\d{12}|[A-Z0-9]{8})$'
    when 'ipeds' then p_value ~ '^\d{6}$'
    when 'ein' then p_value ~ '^\d{2}-\d{7}$'
    when 'us_state_entity' then p_value ~ '^[A-Z0-9-]{3,20}$'
    when 'uen' then p_value ~ '^(\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$'
    when 'sg_moe' then p_value ~ '^\d{4}$'
    when 'ssm' then p_value ~ '^(\d{12}|\d{1,7}-?[A-Z])$'
    when 'my_moe' then p_value ~ '^[A-Z]{3}\d{4}$'
    when 'my_ros' then p_value ~ '^[A-Z0-9/-]{4,30}$'
    when 'abn' then abn_ok(p_value)
    when 'acara' then p_value ~ '^\d{5,6}$'
    when 'teqsa' then p_value ~ '^PRV\d{5}$'
    when 'au_assoc' then p_value ~ '^[A-Z0-9/-]{3,20}$'
    when 'gulf_school' then p_value ~ '^[A-Z0-9/.-]{3,30}$'
    when 'trade_licence' then p_value ~ '^[A-Z0-9/.-]{3,30}$'
    when 'other_reg' then p_value ~ '^[A-Z0-9/().&-]{3,40}$'
    else false
  end;
$$;

-- Numbers a state, emirate or local register issues (never block another community).
create or replace function org_local_id_types()
  returns text[] language sql immutable as $$
  select array['state_board', 'society_reg', 'trust_reg', 'coop_reg',
               'uk_school_ref', 'us_state_entity', 'my_ros', 'au_assoc', 'gulf_school', 'trade_licence', 'other_reg'];
$$;

-- One verified community per (non-local) official ID: the new local numbers join the exceptions.
drop index if exists org_official_ids_one_verified;
create unique index if not exists org_official_ids_one_verified on org_official_ids (country, id_type, id_value)
  where locked and id_type not in ('state_board', 'society_reg', 'trust_reg', 'coop_reg',
                                   'uk_school_ref', 'us_state_entity', 'my_ros', 'au_assoc', 'gulf_school', 'trade_licence', 'other_reg');

-- ---------- 2. What satisfies step 1, per market ---------------------------------------
create table if not exists org_id_requirements (
  market   text not null,
  org_type text not null,
  id_types text[] not null,
  primary key (market, org_type)
);
alter table org_id_requirements enable row level security;
-- no policies: read by the functions below (the app has the same lists)

insert into org_id_requirements (market, org_type, id_types) values
  ('gulf-british', 'School', array['gulf_school', 'other_reg']),
  ('gulf-british', 'Junior / PU college', array['gulf_school', 'other_reg']),
  ('gulf-british', 'College', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-british', 'University', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-british', 'Polytechnic / institute', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-british', 'ITI', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-british', 'Sports club', array['trade_licence', 'other_reg']),
  ('gulf-british', 'Sports academy', array['trade_licence', 'other_reg']),
  ('gulf-british', 'Sports association', array['trade_licence', 'other_reg']),
  ('gulf-british', 'Company', array['trade_licence', 'other_reg']),
  ('gulf-british', 'Hospital chain', array['trade_licence', 'other_reg']),
  ('gulf-british', 'NGO', array['trade_licence', 'other_reg']),
  ('gulf-british', 'Housing society', array['other_reg']),
  ('gulf-indian', 'School', array['cbse', 'gulf_school', 'other_reg']),
  ('gulf-indian', 'Junior / PU college', array['cbse', 'gulf_school', 'other_reg']),
  ('gulf-indian', 'College', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-indian', 'University', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-indian', 'Polytechnic / institute', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-indian', 'ITI', array['gulf_school', 'trade_licence', 'other_reg']),
  ('gulf-indian', 'Sports club', array['trade_licence', 'other_reg']),
  ('gulf-indian', 'Sports academy', array['trade_licence', 'other_reg']),
  ('gulf-indian', 'Sports association', array['trade_licence', 'other_reg']),
  ('gulf-indian', 'Company', array['trade_licence', 'other_reg']),
  ('gulf-indian', 'Hospital chain', array['trade_licence', 'other_reg']),
  ('gulf-indian', 'NGO', array['trade_licence', 'other_reg']),
  ('gulf-indian', 'Housing society', array['other_reg']),
  ('uk', 'School', array['urn', 'uk_school_ref', 'other_reg']),
  ('uk', 'Junior / PU college', array['urn', 'uk_school_ref', 'other_reg']),
  ('uk', 'College', array['ukprn', 'other_reg']),
  ('uk', 'University', array['ukprn', 'other_reg']),
  ('uk', 'Polytechnic / institute', array['ukprn', 'other_reg']),
  ('uk', 'ITI', array['ukprn', 'other_reg']),
  ('uk', 'Sports club', array['companies_house', 'uk_charity', 'other_reg']),
  ('uk', 'Sports academy', array['companies_house', 'uk_charity', 'other_reg']),
  ('uk', 'Sports association', array['companies_house', 'uk_charity', 'other_reg']),
  ('uk', 'Company', array['companies_house']),
  ('uk', 'Hospital chain', array['companies_house', 'uk_charity']),
  ('uk', 'NGO', array['uk_charity', 'companies_house', 'other_reg']),
  ('uk', 'Housing society', array['companies_house', 'other_reg']),
  ('sg', 'School', array['sg_moe', 'uen', 'other_reg']),
  ('sg', 'Junior / PU college', array['sg_moe', 'uen', 'other_reg']),
  ('sg', 'College', array['uen', 'other_reg']),
  ('sg', 'University', array['uen', 'other_reg']),
  ('sg', 'Polytechnic / institute', array['uen', 'other_reg']),
  ('sg', 'ITI', array['uen', 'other_reg']),
  ('sg', 'Sports club', array['uen', 'other_reg']),
  ('sg', 'Sports academy', array['uen', 'other_reg']),
  ('sg', 'Sports association', array['uen', 'other_reg']),
  ('sg', 'Company', array['uen']),
  ('sg', 'Hospital chain', array['uen']),
  ('sg', 'NGO', array['uen', 'other_reg']),
  ('sg', 'Housing society', array['uen', 'other_reg']),
  ('my', 'School', array['my_moe', 'ssm', 'other_reg']),
  ('my', 'Junior / PU college', array['my_moe', 'ssm', 'other_reg']),
  ('my', 'College', array['ssm', 'other_reg']),
  ('my', 'University', array['ssm', 'other_reg']),
  ('my', 'Polytechnic / institute', array['ssm', 'other_reg']),
  ('my', 'ITI', array['ssm', 'other_reg']),
  ('my', 'Sports club', array['my_ros', 'ssm', 'other_reg']),
  ('my', 'Sports academy', array['my_ros', 'ssm', 'other_reg']),
  ('my', 'Sports association', array['my_ros', 'ssm', 'other_reg']),
  ('my', 'Company', array['ssm']),
  ('my', 'Hospital chain', array['ssm']),
  ('my', 'NGO', array['my_ros', 'ssm', 'other_reg']),
  ('my', 'Housing society', array['my_ros', 'other_reg']),
  ('au', 'School', array['acara', 'abn', 'other_reg']),
  ('au', 'Junior / PU college', array['acara', 'abn', 'other_reg']),
  ('au', 'College', array['teqsa', 'abn', 'other_reg']),
  ('au', 'University', array['teqsa', 'abn', 'other_reg']),
  ('au', 'Polytechnic / institute', array['teqsa', 'abn', 'other_reg']),
  ('au', 'ITI', array['teqsa', 'abn', 'other_reg']),
  ('au', 'Sports club', array['abn', 'au_assoc', 'other_reg']),
  ('au', 'Sports academy', array['abn', 'au_assoc', 'other_reg']),
  ('au', 'Sports association', array['abn', 'au_assoc', 'other_reg']),
  ('au', 'Company', array['abn']),
  ('au', 'Hospital chain', array['abn']),
  ('au', 'NGO', array['abn', 'au_assoc']),
  ('au', 'Housing society', array['au_assoc', 'abn', 'other_reg']),
  ('us', 'School', array['nces', 'other_reg']),
  ('us', 'Junior / PU college', array['nces', 'other_reg']),
  ('us', 'College', array['ipeds', 'other_reg']),
  ('us', 'University', array['ipeds', 'other_reg']),
  ('us', 'Polytechnic / institute', array['ipeds', 'other_reg']),
  ('us', 'ITI', array['ipeds', 'other_reg']),
  ('us', 'Sports club', array['ein', 'us_state_entity', 'other_reg']),
  ('us', 'Sports academy', array['ein', 'us_state_entity', 'other_reg']),
  ('us', 'Sports association', array['ein', 'us_state_entity', 'other_reg']),
  ('us', 'Company', array['ein', 'us_state_entity']),
  ('us', 'Hospital chain', array['ein', 'us_state_entity']),
  ('us', 'NGO', array['ein', 'us_state_entity']),
  ('us', 'Housing society', array['us_state_entity', 'ein', 'other_reg'])
on conflict (market, org_type) do update set id_types = excluded.id_types;

create or replace function org_required_id_types_for(p_type text, p_market text)
  returns text[] language sql stable security definer set search_path = public as $$
  select case
    when coalesce(nullif(p_market, ''), 'in') = 'in' then org_required_id_types(p_type)
    else coalesce((select r.id_types from org_id_requirements r where r.market = p_market and r.org_type = p_type),
                  org_required_id_types(p_type))
  end;
$$;
revoke all on function org_required_id_types_for(text, text) from public, anon;
grant execute on function org_required_id_types_for(text, text) to authenticated;

-- ---------- 3. Submitting checks the market's IDs ---------------------------------------
create or replace function submit_org_verification(p_org uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare o organizations; v org_verifications; need text[];
begin
  perform org_admin_or_raise(p_org);
  select * into o from organizations where id = p_org;
  select * into v from org_verifications where org_id = p_org;
  if o.registered is not true then raise exception 'Only a registered organisation can be verified' using errcode = '23514'; end if;
  if o.verified_at is not null then raise exception 'It’s already verified' using errcode = '55000'; end if;
  need := org_required_id_types_for(o.type, o.market);
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

-- Quick checks after running (read-only):
--   select valid_official_id('abn', norm_official_id('abn', '51 824 753 556'));   -- true
--   select norm_official_id('companies_house', '1234567');                         -- 01234567
--   select org_required_id_types_for('School', 'uk');                              -- {urn,uk_school_ref,other_reg}
--   select org_required_id_types_for('School', 'in');                              -- {udise}
