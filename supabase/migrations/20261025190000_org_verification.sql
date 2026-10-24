-- ============================================================================
--  School & college verification, Phase 1 (founder, 2026-10-24 —
--  docs/verification/org-verification.md).
--
--  A community is either a REGISTERED organisation (school, college, company …)
--  or an UNREGISTERED group (friends, neighbourhood …). Unregistered groups need
--  no verification and can't be a School / College.
--
--  A registered school / college proves three things to SportnNote support:
--    1. its official ID — UDISE+ (schools) or AISHE (colleges), plus board codes;
--    2. a recognition document — board affiliation letter, state recognition
--       (RTE) certificate, government sanction order, university affiliation …;
--    3. that the person asking is authorised — a code to an official email, a
--       letter signed by the Head (support calls the school's published number),
--       or the Head confirming by email.
--  Support (only) approves. On approval its official IDs lock: one verified
--  community per ID, so nobody else can claim that school. Renaming, changing the
--  type or registration, or changing an official ID removes verification.
--  Documents are deleted 30 days after the decision (privacy-retention).
--  Verification never blocks running events; it unlocks the ✓ badge and
--  confirming members' dates of birth.
-- ============================================================================

-- ---------- 1. Registered / unregistered -------------------------------------
alter table organizations add column if not exists registered boolean;  -- null = not stated yet

-- (redefines the 20261024180000 guard: + registration rule, + type / registration
--  changes also remove verification)
create or replace function guard_org_verification()
  returns trigger language plpgsql as $$
begin
  if new.registered is false and new.type in ('School', 'College') then
    raise exception 'A school or college is a registered organisation — choose “Registered”, or pick another type for an informal group.' using errcode = '23514';
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

-- ---------- 2. Official IDs ---------------------------------------------------
create table if not exists org_official_ids (
  org_id uuid not null references organizations(id) on delete cascade,
  country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  -- udise (UDISE+ school code), cbse (affiliation no.), cisce (school code),
  -- state_board, ib, cambridge, nios, aishe (college / university code)
  id_type text not null check (id_type in ('udise', 'cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios', 'aishe')),
  id_value text not null check (length(id_value) between 2 and 32),
  locked boolean not null default false,   -- true once the community is verified
  created_at timestamptz not null default now(),
  primary key (org_id, id_type)
);
-- one VERIFIED community per official ID
create unique index if not exists org_official_ids_one_verified on org_official_ids (country, id_type, id_value) where locked;
create index if not exists org_official_ids_lookup on org_official_ids (country, id_type, id_value);
alter table org_official_ids enable row level security;
revoke all on org_official_ids from anon, authenticated;

-- Same rules as core/orgVerification.ts (OFFICIAL_ID_RULES).
create or replace function norm_official_id(p_type text, p_value text)
  returns text language sql immutable as $$
  select case
    when p_type = 'udise' then regexp_replace(coalesce(p_value, ''), '\D', '', 'g')
    else upper(regexp_replace(trim(coalesce(p_value, '')), '\s+', '', 'g'))
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
    else false
  end;
$$;

-- ---------- 3. The verification request -------------------------------------
create table if not exists org_verifications (
  org_id uuid primary key references organizations(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  doc_kind text check (doc_kind is null or length(doc_kind) <= 40),
  doc_path text,
  doc_name text check (doc_name is null or length(doc_name) <= 200),
  authority text check (authority is null or authority in ('email', 'letter', 'head')),
  official_email text,
  email_verified_at timestamptz,
  letter_path text,
  letter_name text check (letter_name is null or length(letter_name) <= 200),
  head_name text check (head_name is null or length(head_name) <= 80),
  head_email text,
  head_requested_at timestamptz,
  head_confirmed_at timestamptz,
  head_confirmed_name text,
  head_declined_at timestamptz,
  submitted_by uuid references profiles(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or length(reject_reason) <= 200),
  checks jsonb,
  docs_deleted_at timestamptz,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table org_verifications enable row level security;
revoke all on org_verifications from anon, authenticated;

create table if not exists org_verification_codes (
  org_id uuid not null references organizations(id) on delete cascade,
  purpose text not null check (purpose in ('email', 'head')),
  target_email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  requested_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, purpose)
);
alter table org_verification_codes enable row level security;
revoke all on org_verification_codes from anon, authenticated;

-- When a community stops being verified (renamed, retyped, support removed it,
-- an ID changed), its IDs unlock and the request goes back to draft.
create or replace function org_after_verification_change()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.verified_at is not null and new.verified_at is null then
    update org_official_ids set locked = false where org_id = new.id;
    update org_verifications
       set status = 'draft', updated_at = now(),
           history = history || jsonb_build_array(jsonb_build_object('at', now(), 'action', 'unverified'))
     where org_id = new.id and status = 'approved';
  end if;
  return null;
end $$;
drop trigger if exists organizations_after_verification on organizations;
create trigger organizations_after_verification after update of verified_at on organizations
  for each row execute function org_after_verification_change();

create or replace function org_admin_or_raise(p_org uuid)
  returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the community''s owners and admins can do this' using errcode = '42501';
  end if;
end $$;
revoke all on function org_admin_or_raise(uuid) from public, anon, authenticated;

-- For the edge function (acting as the caller): may I manage this community?
create or replace function org_is_admin(p_org uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and has_org_role(p_org, array['Owner', 'Admin']);
$$;
revoke all on function org_is_admin(uuid) from public, anon;
grant execute on function org_is_admin(uuid) to authenticated;

create or replace function org_history_add(p_org uuid, p_entry jsonb)
  returns void language sql security definer set search_path = public as $$
  update org_verifications set history = history || jsonb_build_array(p_entry || jsonb_build_object('at', now())), updated_at = now()
   where org_id = p_org;
$$;
revoke all on function org_history_add(uuid, jsonb) from public, anon, authenticated;

-- ---------- 4. What the community's admins (and support) see ------------------
create or replace function org_verification_state(p_org uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o organizations; v org_verifications;
begin
  if not (has_org_role(p_org, array['Owner', 'Admin']) or is_support()) then
    raise exception 'Only the community''s owners and admins can see this' using errcode = '42501';
  end if;
  select * into o from organizations where id = p_org;
  select * into v from org_verifications where org_id = p_org;
  return jsonb_build_object(
    'registered', o.registered,
    'type', o.type,
    'verified', o.verified_at is not null,
    'verifiedAt', o.verified_at,
    'requestedAt', o.verification_requested_at,
    'ids', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', i.id_type, 'value', i.id_value, 'country', i.country, 'locked', i.locked,
               'claimedBy', (select o2.name from org_official_ids j join organizations o2 on o2.id = j.org_id
                              where j.locked and j.country = i.country and j.id_type = i.id_type and j.id_value = i.id_value and j.org_id <> p_org limit 1))
             order by i.id_type)
        from org_official_ids i where i.org_id = p_org), '[]'::jsonb),
    'verification', case when v.org_id is null then null else jsonb_build_object(
      'status', v.status, 'docKind', v.doc_kind, 'docName', v.doc_name, 'hasDoc', v.doc_path is not null,
      'authority', v.authority, 'officialEmail', v.official_email, 'emailVerified', v.email_verified_at is not null,
      'letterName', v.letter_name, 'hasLetter', v.letter_path is not null,
      'headName', v.head_name, 'headEmail', v.head_email, 'headRequestedAt', v.head_requested_at,
      'headConfirmedAt', v.head_confirmed_at, 'headConfirmedName', v.head_confirmed_name, 'headDeclinedAt', v.head_declined_at,
      'submittedAt', v.submitted_at, 'rejectReason', v.reject_reason, 'reviewedAt', v.reviewed_at) end);
end $$;
revoke all on function org_verification_state(uuid) from public, anon;
grant execute on function org_verification_state(uuid) to authenticated;

-- ---------- 5. Official IDs: save, and look one up -----------------------------
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
    select o2.name into holder from org_official_ids j join organizations o2 on o2.id = j.org_id
     where j.locked and j.country = c and j.id_type = t and j.id_value = val and j.org_id <> p_org limit 1;
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

-- While creating a community: is this ID already a verified community?
create or replace function org_id_lookup(p_type text, p_value text, p_country text default 'IN')
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare val text := norm_official_id(p_type, p_value); c text := upper(coalesce(nullif(p_country, ''), 'IN')); v record;
begin
  if not valid_official_id(p_type, val) then return jsonb_build_object('valid', false); end if;
  select o.id, o.name into v from org_official_ids j join organizations o on o.id = j.org_id
   where j.locked and j.country = c and j.id_type = p_type and j.id_value = val limit 1;
  return jsonb_build_object(
    'valid', true, 'value', val,
    'verified', case when v.id is null then null else jsonb_build_object('orgId', v.id, 'name', v.name) end,
    'others', (select count(*) from org_official_ids j where not j.locked and j.country = c and j.id_type = p_type and j.id_value = val));
end $$;
revoke all on function org_id_lookup(text, text, text) from public, anon;
grant execute on function org_id_lookup(text, text, text) to authenticated;

-- ---------- 6. The request: document + proof of authority, then submit ---------
create or replace function save_org_verification(p_org uuid, p jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v org_verifications;
  folder text := auth.uid()::text || '/org-' || p_org::text || '/';
  he text;
begin
  perform org_admin_or_raise(p_org);
  insert into org_verifications (org_id) values (p_org) on conflict (org_id) do nothing;
  select * into v from org_verifications where org_id = p_org;
  if v.status = 'pending' then
    raise exception 'It’s with SportnNote now — you’ll hear back soon' using errcode = '55000';
  end if;
  if p ? 'docPath' and nullif(p->>'docPath', '') is not null and left(p->>'docPath', length(folder)) <> folder then
    raise exception 'Upload the document again' using errcode = '22023';
  end if;
  if p ? 'letterPath' and nullif(p->>'letterPath', '') is not null and left(p->>'letterPath', length(folder)) <> folder then
    raise exception 'Upload the letter again' using errcode = '22023';
  end if;
  he := lower(nullif(trim(coalesce(p->>'headEmail', '')), ''));
  if he is not null and he !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email doesn’t look right' using errcode = '22023';
  end if;
  update org_verifications set
    doc_kind = case when p ? 'docKind' then left(nullif(p->>'docKind', ''), 40) else doc_kind end,
    doc_path = case when p ? 'docPath' then nullif(p->>'docPath', '') else doc_path end,
    doc_name = case when p ? 'docName' then left(nullif(p->>'docName', ''), 200) else doc_name end,
    authority = case when p ? 'authority' and p->>'authority' in ('email', 'letter', 'head') then p->>'authority' else authority end,
    letter_path = case when p ? 'letterPath' then nullif(p->>'letterPath', '') else letter_path end,
    letter_name = case when p ? 'letterName' then left(nullif(p->>'letterName', ''), 200) else letter_name end,
    head_name = case when p ? 'headName' then left(nullif(trim(p->>'headName'), ''), 80) else head_name end,
    head_email = case when p ? 'headEmail' then he else head_email end,
    -- a new Head address needs a new confirmation
    head_requested_at = case when p ? 'headEmail' and he is distinct from head_email then null else head_requested_at end,
    head_confirmed_at = case when p ? 'headEmail' and he is distinct from head_email then null else head_confirmed_at end,
    head_declined_at = case when p ? 'headEmail' and he is distinct from head_email then null else head_declined_at end,
    status = case when status = 'rejected' then 'draft' else status end,
    docs_deleted_at = null,
    updated_at = now()
   where org_id = p_org;
  return org_verification_state(p_org);
end $$;
revoke all on function save_org_verification(uuid, jsonb) from public, anon;
grant execute on function save_org_verification(uuid, jsonb) to authenticated;

-- Service role (org-verify edge function, after it checked org_is_admin as the
-- caller): a code for the official email (6 digits) or the Head's link (16 chars).
create or replace function create_org_code(p_org uuid, p_purpose text, p_email text, p_by uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
  em text := lower(trim(coalesce(p_email, '')));
  i int;
begin
  if p_purpose not in ('email', 'head') then raise exception 'bad purpose'; end if;
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'That email doesn’t look right' using errcode = '22023'; end if;
  if p_purpose = 'email' then
    code := lpad(((get_byte(bytes, 0) * 65536 + get_byte(bytes, 1) * 256 + get_byte(bytes, 2)) % 1000000)::text, 6, '0');
  else
    for i in 0..15 loop code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  end if;
  insert into org_verification_codes (org_id, purpose, target_email, code_hash, expires_at, attempts, requested_by)
  values (p_org, p_purpose, em, encode(sha256(convert_to(code, 'UTF8')), 'hex'),
          now() + case when p_purpose = 'email' then interval '30 minutes' else interval '14 days' end, 0, p_by)
  on conflict (org_id, purpose) do update
    set target_email = excluded.target_email, code_hash = excluded.code_hash, expires_at = excluded.expires_at,
        attempts = 0, requested_by = excluded.requested_by, created_at = now();
  insert into org_verifications (org_id) values (p_org) on conflict (org_id) do nothing;
  if p_purpose = 'head' then
    update org_verifications set head_requested_at = now(), head_confirmed_at = null, head_declined_at = null, updated_at = now()
     where org_id = p_org;
    perform org_history_add(p_org, jsonb_build_object('action', 'head_asked'));
  end if;
  return jsonb_build_object('code', code, 'email', em,
    'orgName', (select name from organizations where id = p_org),
    'requesterName', (select full_name from profiles where id = p_by));
end $$;
revoke all on function create_org_code(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function create_org_code(uuid, text, text, uuid) to service_role;

-- The admin types the code from the official email.
create or replace function verify_org_email_code(p_org uuid, p_code text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare r org_verification_codes;
begin
  perform org_admin_or_raise(p_org);
  select * into r from org_verification_codes where org_id = p_org and purpose = 'email';
  if r.org_id is null or r.expires_at < now() then
    raise exception 'That code has expired — send a new one' using errcode = '22023';
  end if;
  if r.attempts >= 5 then
    raise exception 'Too many tries — send a new code' using errcode = '54000';
  end if;
  if r.code_hash <> encode(sha256(convert_to(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 'UTF8')), 'hex') then
    update org_verification_codes set attempts = attempts + 1 where org_id = p_org and purpose = 'email';
    raise exception 'That code isn’t right — check the email and try again' using errcode = '22023';
  end if;
  delete from org_verification_codes where org_id = p_org and purpose = 'email';
  insert into org_verifications (org_id) values (p_org) on conflict (org_id) do nothing;
  update org_verifications
     set official_email = r.target_email, email_verified_at = now(), authority = coalesce(authority, 'email'), updated_at = now()
   where org_id = p_org;
  perform org_history_add(p_org, jsonb_build_object('action', 'email_verified', 'email', r.target_email));
  return org_verification_state(p_org);
end $$;
revoke all on function verify_org_email_code(uuid, text) from public, anon;
grant execute on function verify_org_email_code(uuid, text) to authenticated;

-- The Head's page (…/org-confirm?c=CODE): anyone with the link.
create or replace function org_code_lookup(p_code text)
  returns org_verification_codes language sql stable security definer set search_path = public as $$
  select * from org_verification_codes
   where purpose = 'head' and expires_at > now()
     and code_hash = encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;
revoke all on function org_code_lookup(text) from public, anon, authenticated;

create or replace function org_head_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r org_verification_codes; o organizations; v org_verifications;
begin
  r := org_code_lookup(p_code);
  if r.org_id is null then raise exception 'That link isn''t valid or has expired. Ask the person to send a new one.'; end if;
  select * into o from organizations where id = r.org_id;
  select * into v from org_verifications where org_id = r.org_id;
  return jsonb_build_object(
    'orgName', o.name, 'type', o.type, 'city', o.city,
    'ids', coalesce((select jsonb_agg(jsonb_build_object('type', i.id_type, 'value', i.id_value) order by i.id_type)
                       from org_official_ids i where i.org_id = r.org_id), '[]'::jsonb),
    'requesterName', coalesce((select full_name from profiles where id = r.requested_by), 'Someone'),
    'headName', v.head_name);
end $$;
revoke all on function org_head_preview(text) from public;
grant execute on function org_head_preview(text) to anon, authenticated;

create or replace function org_head_decide(p_code text, p_approve boolean, p_name text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare r org_verification_codes; nm text := left(trim(coalesce(p_name, '')), 80);
begin
  if auth.uid() is not null and not rate_limit_hit('org-head-decide', auth.uid()::text, 20, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  r := org_code_lookup(p_code);
  if r.org_id is null then raise exception 'That link isn''t valid or has expired. Ask the person to send a new one.'; end if;
  if p_approve and nm = '' then raise exception 'Type your name to confirm' using errcode = '22023'; end if;
  update org_verifications
     set head_confirmed_at = case when p_approve then now() end,
         head_confirmed_name = case when p_approve then nm end,
         head_declined_at = case when p_approve then null else now() end,
         updated_at = now()
   where org_id = r.org_id;
  perform org_history_add(r.org_id, jsonb_build_object('action', case when p_approve then 'head_confirmed' else 'head_declined' end, 'name', nullif(nm, '')));
  delete from org_verification_codes where org_id = r.org_id and purpose = 'head';
  return jsonb_build_object('confirmed', p_approve);
end $$;
revoke all on function org_head_decide(text, boolean, text) from public;
grant execute on function org_head_decide(text, boolean, text) to anon, authenticated;

-- Send it to SportnNote support.
create or replace function submit_org_verification(p_org uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare o organizations; v org_verifications; need text;
begin
  perform org_admin_or_raise(p_org);
  select * into o from organizations where id = p_org;
  select * into v from org_verifications where org_id = p_org;
  if o.registered is not true then raise exception 'Only a registered organisation can be verified' using errcode = '23514'; end if;
  if o.verified_at is not null then raise exception 'It’s already verified' using errcode = '55000'; end if;
  need := case o.type when 'School' then 'udise' when 'College' then 'aishe' end;
  if need is null then raise exception 'Verification for this type of community is coming soon' using errcode = '0A000'; end if;
  if not exists (select 1 from org_official_ids where org_id = p_org and id_type = need) then
    raise exception 'Add the % code first', case need when 'udise' then 'UDISE+' else 'AISHE' end using errcode = '23502';
  end if;
  if v.org_id is null or v.doc_path is null then raise exception 'Upload the recognition document first' using errcode = '23502'; end if;
  if v.authority is null
     or (v.authority = 'email' and v.email_verified_at is null)
     or (v.authority = 'letter' and v.letter_path is null)
     or (v.authority = 'head' and (v.head_requested_at is null or v.head_declined_at is not null)) then
    raise exception 'Finish step 3 — show you’re authorised by the school' using errcode = '23502';
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

-- ---------- 7. Support: the queue and the decision ----------------------------
create or replace function org_verification_queue()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_support() then raise exception 'Only SportnNote support verifies organisations' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'requestedAt')
      from (
        select jsonb_build_object(
          'orgId', o.id, 'name', o.name, 'type', o.type, 'city', o.city, 'email', o.email, 'phone', o.phone,
          'registered', o.registered, 'requestedAt', o.verification_requested_at,
          'members', (select count(*) from org_members m where m.org_id = o.id and (m.until is null or m.until >= current_date)),
          'ids', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'type', i.id_type, 'value', i.id_value, 'country', i.country,
                     'verifiedElsewhere', (select o2.name from org_official_ids j join organizations o2 on o2.id = j.org_id
                                            where j.locked and j.country = i.country and j.id_type = i.id_type and j.id_value = i.id_value and j.org_id <> o.id limit 1),
                     'sameIdElsewhere', (select count(*) from org_official_ids j
                                          where j.country = i.country and j.id_type = i.id_type and j.id_value = i.id_value and j.org_id <> o.id))
                   order by i.id_type)
              from org_official_ids i where i.org_id = o.id), '[]'::jsonb),
          'verification', case when v.org_id is null then null else jsonb_build_object(
            'status', v.status, 'docKind', v.doc_kind, 'docPath', v.doc_path, 'docName', v.doc_name,
            'authority', v.authority, 'officialEmail', v.official_email, 'emailVerifiedAt', v.email_verified_at,
            'letterPath', v.letter_path, 'letterName', v.letter_name,
            'headName', v.head_name, 'headEmail', v.head_email, 'headRequestedAt', v.head_requested_at,
            'headConfirmedAt', v.head_confirmed_at, 'headConfirmedName', v.head_confirmed_name, 'headDeclinedAt', v.head_declined_at,
            'submittedAt', v.submitted_at,
            'submitterName', (select full_name from profiles where id = v.submitted_by),
            'sentBackBefore', (select count(*) from jsonb_array_elements(v.history) h where h->>'action' = 'rejected')) end
        ) as x
          from organizations o
          left join org_verifications v on v.org_id = o.id
         where o.verified_at is null and o.verification_requested_at is not null
      ) q), '[]'::jsonb);
end $$;
revoke all on function org_verification_queue() from public, anon;
grant execute on function org_verification_queue() to authenticated;

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
     where i.org_id = p_org limit 1;
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

-- Organisations are reviewed by SportnNote support only (founder, 2026-10-24):
-- the older one-tap functions follow the same rule.
create or replace function pending_org_verifications()
  returns table (org_id uuid, name text, type text, city text, email text, phone text, requested_at timestamptz, members bigint)
  language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.type, o.city, o.email, o.phone, o.verification_requested_at,
         (select count(*) from org_members m where m.org_id = o.id and (m.until is null or m.until >= current_date))
    from organizations o
   where is_support() and o.verification_requested_at is not null and o.verified_at is null
   order by o.verification_requested_at;
$$;
create or replace function review_org_verification(p_org uuid, p_approve boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then
    raise exception 'Only SportnNote support verifies organisations' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update organizations
     set verified_at = case when p_approve then now() end,
         verified_by = case when p_approve then auth.uid() end,
         verification_requested_at = null
   where id = p_org;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
-- The simple request stays for registered communities that aren't schools /
-- colleges yet (Phase 2 brings their own checks).
create or replace function request_org_verification(p_org uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the organisation''s owners and admins can ask for this' using errcode = '42501';
  end if;
  if exists (select 1 from organizations where id = p_org and registered is false) then
    raise exception 'An unregistered community doesn’t need verifying' using errcode = '23514';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update organizations set verification_requested_at = now() where id = p_org and verified_at is null;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

-- ---------- 8. Documents: deleted 30 days after the decision -----------------
create or replace function due_org_verification_docs(p_grace_days int default 30)
  returns table (org_id uuid, doc_path text, letter_path text)
  language sql stable security definer set search_path = public as $$
  select v.org_id, v.doc_path, v.letter_path from org_verifications v
   where v.status in ('approved', 'rejected') and v.reviewed_at < now() - make_interval(days => p_grace_days)
     and v.docs_deleted_at is null and (v.doc_path is not null or v.letter_path is not null);
$$;
revoke all on function due_org_verification_docs(int) from public, anon, authenticated;
grant execute on function due_org_verification_docs(int) to service_role;

create or replace function mark_org_docs_deleted(p_org uuid)
  returns void language sql security definer set search_path = public as $$
  update org_verifications set doc_path = null, letter_path = null, docs_deleted_at = now(), updated_at = now() where org_id = p_org;
$$;
revoke all on function mark_org_docs_deleted(uuid) from public, anon, authenticated;
grant execute on function mark_org_docs_deleted(uuid) to service_role;
