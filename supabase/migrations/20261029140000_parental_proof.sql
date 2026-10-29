-- CL-03 parental proof (design: docs/security/cl03-parental-proof-design.md;
-- founder 2026-10-28/29). Every under-18 account — India included — waits for a
-- parent, who approves from their OWN account (18+) by uploading a photo ID and
-- a document showing the relationship. A reviewer decides; on approval the
-- parent becomes the linked guardian. The emailed link alone no longer
-- confirms consent, links a guardian or confirms a date of birth. The files are
-- deleted 30 days after the decision (privacy-retention).
--
-- Each function below starts from its LATEST body (grep all migrations first:
-- 20261029130000 fixed a bug where an older body was reused):
--   guardian_consent_decide  20261024180000_verification_lanes
--   guardian_set_consent     20261020120000_privacy_rights
--   claim_guardian_link      20261008120000_messaging
--   minor_account_limited    20261020120000_privacy_rights
--   can_review_kind          20261027170000_support_console (wave3a only revoked it)
-- Tests: tests/db-parental-proof.test.mts.

-- ---------- 1. Every under-18 waits for a parent ------------------------------------
-- India's sign-up checkbox ("self-declared") ends. A second BEFORE INSERT trigger
-- (fires after privacy_on_new_profile: same timing, later name) turns it into
-- "pending", so the sign-up trigger's body stays as it is.
create or replace function privacy_parental_proof_required()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.guardian_consent = 'self_declared' then
    new.guardian_consent := 'pending';
    new.guardian_consent_at := null;
    new.guardian_consent_method := 'parental_proof_required';
  end if;
  return new;
end $$;
drop trigger if exists privacy_zz_parental_proof on profiles;
create trigger privacy_zz_parental_proof before insert on profiles
  for each row execute function privacy_parental_proof_required();

-- Accounts already on file (live 2026-10-29: one, the test account).
do $$
declare r record;
begin
  perform set_config('app.trusted_rpc', 'on', true);
  for r in select id from profiles where guardian_consent = 'self_declared' and profile_is_minor(dob) loop
    update profiles set guardian_consent = 'pending', guardian_consent_at = null,
           guardian_consent_method = 'parental_proof_required'
     where id = r.id;
    insert into consent_log (profile_id, kind, event, method) values (r.id, 'guardian_consent', 'pending', 'parental_proof_required');
  end loop;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

-- Limited until a parent is approved (self_declared included, in case any remain).
create or replace function minor_account_limited(p_profile uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select pr.guardian_consent in ('pending', 'withdrawn', 'self_declared') and profile_is_minor(pr.dob)
      from profiles pr where pr.id = p_profile), false);
$$;

-- ---------- 2. The proofs ---------------------------------------------------------
create table if not exists guardian_proofs (
  id                  uuid primary key default gen_random_uuid(),
  -- set null, not cascade: if the child's account is deleted first the row stays
  -- until privacy-retention has deleted the parent's files (PP-11)
  child_profile_id    uuid references profiles(id) on delete set null,
  guardian_profile_id uuid not null references profiles(id) on delete cascade,
  relationship        text not null check (relationship in ('mother', 'father', 'legal_guardian')),
  name_on_id          text not null check (length(trim(name_on_id)) between 1 and 80),
  dob_confirmed       boolean not null default false,
  id_path             text,
  relation_path       text,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason              text,
  submitted_at        timestamptz not null default now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid references profiles(id) on delete set null,
  docs_deleted_at     timestamptz,
  -- the edge function guardian-proof tells people once per proof (PP-23)
  reviewers_alerted_at timestamptz,
  family_told_at       timestamptz
);
create unique index if not exists guardian_proofs_one_open on guardian_proofs (child_profile_id) where status = 'pending';
create index if not exists guardian_proofs_child_idx on guardian_proofs (child_profile_id, submitted_at desc);
create index if not exists guardian_proofs_guardian_idx on guardian_proofs (guardian_profile_id, submitted_at desc);
alter table guardian_proofs enable row level security;
-- no policies: read and written only through the functions below
revoke all on guardian_proofs from anon, authenticated;

-- Reviewers claim proofs like age and organisation checks.
alter table support_claims drop constraint if exists support_claims_kind_check;
alter table support_claims add constraint support_claims_kind_check check (kind in ('org', 'age', 'guardian'));
create or replace function can_review_kind(p_kind text)
  returns boolean language sql stable security definer set search_path = public as $$
  select case p_kind when 'org' then is_support()
                     when 'age' then is_verification_reviewer()
                     when 'guardian' then is_verification_reviewer()
                     else false end;
$$;
revoke all on function can_review_kind(text) from public, anon, authenticated;

-- ---------- 3. The parent submits -----------------------------------------------------
-- Which child a link is for — the upload folder is <parent>/guardian-<child>/.
-- Signed-in callers only (the public preview shows just a first name and age band).
create or replace function guardian_proof_child(p_code text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare r guardian_consent_requests;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not rate_limit_hit('guardian-proof-child', auth.uid()::text, 30, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  r := guardian_consent_lookup(p_code);
  if r.profile_id is null then
    raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.';
  end if;
  return r.profile_id;
end $$;
revoke all on function guardian_proof_child(text) from public, anon;
grant execute on function guardian_proof_child(text) to authenticated;

-- With the link's code; or, after a rejection, the same parent resends without it.
-- Files: the private verification-docs bucket, under the parent's own folder
-- <parent>/guardian-<child>/ (the bucket's insert policy already limits uploads
-- to your own folder; reviewers can read it).
create or replace function guardian_proof_submit(
  p_code text, p_child uuid, p_relationship text, p_name text,
  p_id_path text, p_relation_path text, p_dob_confirmed boolean default false)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  r      guardian_consent_requests;
  child  uuid;
  a      int;
  nm     text := left(trim(coalesce(p_name, '')), 80);
  prefix text;
  pid    uuid;
begin
  if me is null then
    raise exception 'Sign in first — the parent or guardian approves from their own account.' using errcode = '42501';
  end if;
  if not rate_limit_hit('guardian-proof', me::text, 10, 86400) then
    raise exception 'Too many attempts — try again tomorrow' using errcode = '54000';
  end if;
  if coalesce(trim(p_code), '') <> '' then
    r := guardian_consent_lookup(p_code);
    if r.profile_id is null then
      raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.';
    end if;
    child := r.profile_id;
    if p_child is not null and p_child <> child then raise exception 'That link is for a different child.'; end if;
  else
    child := p_child;
    if child is null or not exists (select 1 from guardian_proofs
                                      where child_profile_id = child and guardian_profile_id = me and status = 'rejected') then
      raise exception 'Open the link your child sent you (it lasts 7 days — they can send a new one from the app).';
    end if;
  end if;
  if me = child then
    raise exception 'This has to be done by your parent or guardian, from their own account.' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = child and guardian_consent = 'confirmed' and guardian_consent_method = 'documents') then
    raise exception 'This child is already approved by a parent''s documents. To change the parent, the approved parent first withdraws consent in Settings.';
  end if;
  a := profile_age(me);
  if a is null or a < 18 then
    raise exception 'The parent or guardian''s account must be 18 or over — add your date of birth in Edit profile first.' using errcode = '42501';
  end if;
  if coalesce(p_relationship, '') not in ('mother', 'father', 'legal_guardian') then
    raise exception 'Choose the relationship: mother, father or legal guardian.';
  end if;
  if nm = '' then raise exception 'Type your name exactly as it is on your ID.'; end if;
  prefix := me::text || '/guardian-' || child::text || '/';
  if coalesce(p_id_path, '') not like prefix || '%' or coalesce(p_relation_path, '') not like prefix || '%'
     or p_id_path = p_relation_path
     or not exists (select 1 from storage.objects where bucket_id = 'verification-docs' and name = p_id_path)
     or not exists (select 1 from storage.objects where bucket_id = 'verification-docs' and name = p_relation_path) then
    raise exception 'Upload both documents first: your photo ID and the document showing the relationship.';
  end if;
  if exists (select 1 from guardian_proofs where child_profile_id = child and status = 'pending') then
    raise exception 'Documents for this child are already being checked — we''ll let you know.';
  end if;

  insert into guardian_proofs (child_profile_id, guardian_profile_id, relationship, name_on_id, dob_confirmed, id_path, relation_path)
  values (child, me, p_relationship, nm, coalesce(p_dob_confirmed, false), p_id_path, p_relation_path)
  returning id into pid;
  insert into consent_log (profile_id, kind, event, method, actor_profile_id)
  values (child, 'guardian_consent', 'documents_submitted', 'documents', me);
  return pid;
end $$;
revoke all on function guardian_proof_submit(text, uuid, text, text, text, text, boolean) from public;
grant execute on function guardian_proof_submit(text, uuid, text, text, text, text, boolean) to anon, authenticated;

-- ---------- 4. A reviewer decides -----------------------------------------------------
create or replace function decide_guardian_proof(p_proof uuid, p_approve boolean, p_reason text default null)
  returns text language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  g   guardian_proofs;
  c   support_claims;
  rsn text := left(trim(coalesce(p_reason, '')), 300);
begin
  if me is null or not is_verification_reviewer() then
    raise exception 'Only reviewers can decide this.' using errcode = '42501';
  end if;
  select * into g from guardian_proofs where id = p_proof for update;
  if g.id is null then raise exception 'That proof wasn''t found.'; end if;
  if me in (g.guardian_profile_id, g.child_profile_id)
     or exists (select 1 from players where profile_id = g.child_profile_id and guardian_profile_id = me) then
    raise exception 'You can''t review your own family''s documents.' using errcode = '42501';
  end if;
  if g.status <> 'pending' then raise exception 'This was already decided.'; end if;
  select * into c from support_claims where kind = 'guardian' and ref_id = g.id;
  if found and c.claimed_by <> me and c.claimed_at > now() - interval '2 hours' then
    raise exception 'Being checked by % — take it over first', support_staff_name(c.claimed_by) using errcode = '55P03';
  end if;
  if not p_approve and rsn = '' then raise exception 'Give a reason so the parent knows what to fix.'; end if;

  perform set_config('app.trusted_rpc', 'on', true);
  update guardian_proofs
     set status = case when p_approve then 'approved' else 'rejected' end,
         reason = nullif(rsn, ''), reviewed_at = now(), reviewed_by = me
   where id = g.id;
  if p_approve then
    update profiles set guardian_consent = 'confirmed', guardian_consent_at = now(),
           guardian_consent_method = 'documents', consent_withdrawn_at = null,
           guardian = coalesce(guardian, '{}'::jsonb)
                      || jsonb_build_object('confirmedAt', now(), 'confirmedName', g.name_on_id, 'relationship', g.relationship)
     where id = g.child_profile_id;
    update players set guardian_profile_id = g.guardian_profile_id,
           guardian = coalesce(guardian, '{}'::jsonb)
                      || jsonb_build_object('confirmedAt', now(), 'confirmedName', g.name_on_id, 'relationship', g.relationship)
     where profile_id = g.child_profile_id;
    if g.dob_confirmed then
      update players set dob_confirmations = coalesce(dob_confirmations, '{}'::jsonb)
             || jsonb_build_object('parent', jsonb_build_object('at', now(), 'by', g.guardian_profile_id, 'method', 'documents', 'dob', dob))
       where profile_id = g.child_profile_id and dob is not null;
    end if;
    update message_threads t set recipient_profile_id = g.guardian_profile_id
      from players p where p.id = t.subject_player_id and p.profile_id = g.child_profile_id and t.via_guardian;
    delete from guardian_consent_requests where profile_id = g.child_profile_id;
  end if;
  perform set_config('app.trusted_rpc', 'off', true);
  delete from support_claims where kind = 'guardian' and ref_id = g.id;
  insert into consent_log (profile_id, kind, event, method, actor_profile_id)
  values (g.child_profile_id, 'guardian_consent', case when p_approve then 'confirmed' else 'documents_rejected' end, 'documents', me);
  return case when p_approve then 'approved' else 'rejected' end;
end $$;
revoke all on function decide_guardian_proof(uuid, boolean, text) from public, anon;
grant execute on function decide_guardian_proof(uuid, boolean, text) to authenticated;

-- The reviewers' queue.
create or replace function pending_guardian_proofs()
  returns table (id uuid, child_profile_id uuid, child_name text, child_dob date, relationship text, name_on_id text,
                 guardian_account_name text, dob_confirmed boolean, id_path text, relation_path text, submitted_at timestamptz,
                 claimed_by uuid, claimed_by_name text, claimed_at timestamptz)
  language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_verification_reviewer() then
    raise exception 'Only reviewers can see this.' using errcode = '42501';
  end if;
  return query
    select g.id, g.child_profile_id,
           coalesce((select p.full_name from players p where p.profile_id = g.child_profile_id order by p.created_at limit 1), cp.full_name),
           coalesce((select p.dob from players p where p.profile_id = g.child_profile_id and p.dob is not null order by p.created_at limit 1), cp.dob),
           g.relationship, g.name_on_id,
           coalesce((select p.full_name from players p where p.profile_id = g.guardian_profile_id order by p.created_at limit 1), gp.full_name),
           g.dob_confirmed, g.id_path, g.relation_path, g.submitted_at,
           c.claimed_by, case when c.claimed_by is not null then support_staff_name(c.claimed_by) end, c.claimed_at
      from guardian_proofs g
      join profiles cp on cp.id = g.child_profile_id
      join profiles gp on gp.id = g.guardian_profile_id
      left join support_claims c on c.kind = 'guardian' and c.ref_id = g.id
     where g.status = 'pending'
     order by g.submitted_at;
end $$;
revoke all on function pending_guardian_proofs() from public, anon;
grant execute on function pending_guardian_proofs() to authenticated;

-- The child's own card: where their parent's proof stands.
create or replace function my_guardian_proof_status()
  returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'status', g.status, 'reason', g.reason,
                            'submittedAt', g.submitted_at, 'reviewedAt', g.reviewed_at)
    from guardian_proofs g where g.child_profile_id = auth.uid()
   order by g.submitted_at desc limit 1;
$$;
revoke all on function my_guardian_proof_status() from public, anon;
grant execute on function my_guardian_proof_status() to authenticated;

-- The parent's own submissions (to resend after a rejection).
create or replace function my_guardian_proofs()
  returns table (id uuid, child_profile_id uuid, child_name text, status text, reason text,
                 submitted_at timestamptz, reviewed_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select g.id, g.child_profile_id,
         coalesce((select p.full_name from players p where p.profile_id = g.child_profile_id order by p.created_at limit 1), cp.full_name),
         g.status, g.reason, g.submitted_at, g.reviewed_at
    from guardian_proofs g join profiles cp on cp.id = g.child_profile_id
   where g.guardian_profile_id = auth.uid()
   order by g.submitted_at desc;
$$;
revoke all on function my_guardian_proofs() from public, anon;
grant execute on function my_guardian_proofs() to authenticated;

-- ---------- 5. The link alone confirms nothing (audit CL-03) --------------------------
-- From 20261024180000_verification_lanes. "Approve" now answers
-- "documents_needed" and changes nothing; "decline" is as before.
create or replace function guardian_consent_decide(p_code text, p_approve boolean, p_guardian_name text default null, p_dob_confirmed boolean default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r guardian_consent_requests;
  me uuid := auth.uid();
begin
  if me is not null and not rate_limit_hit('guardian-consent-decide', me::text, 20, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  r := guardian_consent_lookup(p_code);
  if r.profile_id is null then raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.'; end if;
  if me = r.profile_id then
    raise exception 'This has to be done by your parent or guardian, not from your own account.' using errcode = '42501';
  end if;

  if p_approve then
    -- Approval needs the parent's documents (guardian_proof_submit).
    return jsonb_build_object('status', 'documents_needed', 'linked', false, 'dobConfirmed', false);
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  update profiles set guardian_consent = 'withdrawn', consent_withdrawn_at = now(),
         guardian_consent_method = 'email_link'
   where id = r.profile_id;
  perform set_config('app.trusted_rpc', 'off', true);
  insert into consent_log (profile_id, kind, event, method, actor_profile_id)
  values (r.profile_id, 'guardian_consent', 'declined', 'email_link', me);
  delete from guardian_consent_requests where profile_id = r.profile_id;
  return jsonb_build_object('status', 'withdrawn', 'linked', false, 'dobConfirmed', false);
end $$;
revoke all on function guardian_consent_decide(text, boolean, text, boolean) from public;
grant execute on function guardian_consent_decide(text, boolean, text, boolean) to anon, authenticated;

-- From 20261020120000_privacy_rights. A linked guardian can withdraw any time;
-- "confirmed" needs an approved proof for the child.
create or replace function guardian_set_consent(p_player uuid, p_confirm boolean)
  returns text language plpgsql security definer set search_path = public as $$
declare
  pl players := guardian_child_or_raise(p_player);
  st text := case when p_confirm then 'confirmed' else 'withdrawn' end;
begin
  if pl.profile_id is null then
    raise exception 'Your child doesn''t have their own account yet — there is nothing to confirm. You can remove their data instead.';
  end if;
  if p_confirm and not exists (select 1 from guardian_proofs where child_profile_id = pl.profile_id and status = 'approved') then
    raise exception 'Approving needs your documents first: your photo ID and one showing you''re the parent or guardian.' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update profiles set guardian_consent = st, guardian_consent_at = now(),
         guardian_consent_method = 'linked_guardian_account',
         consent_withdrawn_at = case when p_confirm then null else now() end
   where id = pl.profile_id;
  perform set_config('app.trusted_rpc', 'off', true);
  insert into consent_log (profile_id, player_id, kind, event, method, actor_profile_id)
  values (pl.profile_id, pl.id, 'guardian_consent', st, 'linked_guardian_account', auth.uid());
  delete from guardian_consent_requests where profile_id = pl.profile_id;
  return st;
end $$;

-- From 20261008120000_messaging. The code links only the account whose verified
-- email it was sent to, and never an account with no age.
create or replace function claim_guardian_link(p_code text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c  guardian_link_codes;
  pl players;
  a  int;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not rate_limit_hit('guardian-claim', me::text, 10, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  select * into c from guardian_link_codes
   where code_hash = encode(sha256(convert_to(upper(trim(coalesce(p_code, ''))), 'UTF8')), 'hex');
  if c.player_id is null or c.expires_at < now() then
    raise exception 'That code isn''t valid or has expired — ask for a new one.';
  end if;
  select * into pl from players where id = c.player_id;
  if pl.profile_id = me then
    raise exception 'Sign in with the parent/guardian''s own account (not the player''s) to link.' using errcode = '42501';
  end if;
  a := profile_age(me);
  if a is null or a < 18 then
    raise exception 'A parent/guardian account must belong to an adult — add your date of birth in Edit profile first.' using errcode = '42501';
  end if;
  if coalesce((select lower(u.email) from auth.users u where u.id = me and u.email_confirmed_at is not null), '') <> c.target_email then
    raise exception 'Sign in with the account for the email this code was sent to.' using errcode = '42501';
  end if;
  if lower(coalesce(pl.guardian->>'email', '')) <> c.target_email then
    raise exception 'The guardian email on this profile changed — ask for a new code.';
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  update players
     set guardian_profile_id = me,
         guardian = coalesce(guardian, '{}'::jsonb) || '{"emailVerified": true}'::jsonb
   where id = pl.id;
  update message_threads set recipient_profile_id = me
   where subject_player_id = pl.id and via_guardian;
  perform set_config('app.trusted_rpc', 'off', true);
  delete from guardian_link_codes where player_id = pl.id;
  return pl.id;
end $$;

-- ---------- 6. Deleted 30 days after the decision (privacy-retention) ------------------
create or replace function due_guardian_proof_docs(p_grace_days int default 30)
  returns table (proof_id uuid, id_path text, relation_path text)
  language sql stable security definer set search_path = public as $$
  select g.id, g.id_path, g.relation_path
    from guardian_proofs g
   where g.docs_deleted_at is null
     and (g.id_path is not null or g.relation_path is not null)
     and ((g.status in ('approved', 'rejected') and g.reviewed_at < now() - make_interval(days => greatest(p_grace_days, 0)))
          -- the child's account is gone: nothing left to check (PP-11)
          or g.child_profile_id is null)
   order by g.reviewed_at nulls first
   limit 500;
$$;
revoke all on function due_guardian_proof_docs(int) from public, anon, authenticated;
grant execute on function due_guardian_proof_docs(int) to service_role;

create or replace function mark_guardian_proof_docs_deleted(p_proof uuid)
  returns void language sql security definer set search_path = public as $$
  update guardian_proofs set id_path = null, relation_path = null, docs_deleted_at = now()
   where id = p_proof and docs_deleted_at is null;
$$;
revoke all on function mark_guardian_proof_docs_deleted(uuid) from public, anon, authenticated;
grant execute on function mark_guardian_proof_docs_deleted(uuid) to service_role;

-- ---------- 7. Every email sign-up gives a date of birth (PP-21) ----------------------
-- Without one an account is never treated as a minor, so none of the above
-- would apply. The app always asks; a hand-made call didn't have to. Phone
-- sign-in (phone-login) already refuses a missing one. From the latest body,
-- 20261029100000_signup_sms; only the date-of-birth check is new.
create or replace function hook_before_user_created(event jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s signup_guard_settings;
  u jsonb := coalesce(event->'user', '{}'::jsonb);
  meta jsonb := coalesce(u->'user_metadata', '{}'::jsonb);
  domain text := split_part(lower(trim(coalesce(u->>'email', ''))), '@', 2);
  ip text := nullif(trim(coalesce(event->'metadata'->>'ip_address', '')), '');
  dob date;
begin
  select * into s from signup_guard_settings where id;
  if not found or not s.enabled then return '{}'::jsonb; end if;

  -- our own phone sign-in (phone-login): a confirmed phone + the placeholder address
  if coalesce(u->>'phone', '') <> '' and domain = 'phone.sportnnote.in' then return '{}'::jsonb; end if;
  if domain = 'phone.sportnnote.in' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Enter a valid email address.'));
  end if;

  if domain = any(s.blocked_domains) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Please use your own email address — a temporary inbox can’t be used for SportnNote.'));
  end if;

  -- 2026-10-29: the mobile is proven by SMS before the account is made
  if s.require_phone and not signup_phone_ticket_ok(meta->>'phone_ticket', meta->>'phone') then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Verify your mobile number first — we text you a code, then you can create your account.'));
  end if;

  -- 2026-10-29 (PP-21): a real YYYY-MM-DD date of birth (words like "today" parse as dates)
  if coalesce(meta->>'dob', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    begin dob := (meta->>'dob')::date; exception when others then dob := null; end;
  end if;
  if dob is null or dob > current_date or dob < date '1900-01-01' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Enter your date of birth to create an account.'));
  end if;

  if ip is not null and not rate_limit_hit('signup-ip', ip, s.per_ip_per_day, 86400) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429,
      'message', 'Too many new accounts from this network today. Please try again tomorrow, or contact support.'));
  end if;

  return '{}'::jsonb;
exception when others then
  return '{}'::jsonb;  -- fail open: a broken guard must never stop real sign-ups
end $$;
revoke all on function hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------- 8. Limited until approved: hidden publicly (founder 2026-10-29) ----------
-- The child can play, be on teams and be scored; until a parent is approved
-- they are left out of search, Discover and leaderboards, and get no
-- certificates, career passport link or Hall of Fame honours. Names are already
-- initials to strangers (players_view) — this keeps them off public lists.
-- players_view itself is not filtered: it also feeds their own team rosters.

-- Which of these players are hidden (the app leaves them out of public lists).
create or replace function limited_player_ids(p_ids uuid[])
  returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id order by p.id), '{}')
    from players p
   where p.id = any(p_ids[1:1000]) and p.profile_id is not null and minor_account_limited(p.profile_id);
$$;
revoke all on function limited_player_ids(uuid[]) from public;
grant execute on function limited_player_ids(uuid[]) to anon, authenticated;

-- No certificate for a hidden child (issue_certificates skips the row).
create or replace function certificates_skip_limited()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if player_account_limited(new.player_id) then return null; end if;
  return new;
end $$;
revoke all on function certificates_skip_limited() from public, anon, authenticated;
drop trigger if exists certificates_skip_limited on certificates;
create trigger certificates_skip_limited before insert on certificates
  for each row execute function certificates_skip_limited();

-- No career passport link while hidden…
create or replace function passport_needs_approval()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.passport_code is not null and new.passport_code is distinct from old.passport_code
     and new.profile_id is not null and minor_account_limited(new.profile_id) then
    raise exception 'Your parent or guardian needs to approve your account first.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function passport_needs_approval() from public, anon, authenticated;
drop trigger if exists players_passport_needs_approval on players;
create trigger players_passport_needs_approval before update of passport_code on players
  for each row execute function passport_needs_approval();

-- …and a link made earlier stops working when consent is withdrawn. Runs inside
-- other trusted functions, so it puts app.trusted_rpc back as it found it.
create or replace function passport_off_when_limited()
  returns trigger language plpgsql security definer set search_path = public as $$
declare prev text := coalesce(current_setting('app.trusted_rpc', true), 'off');
begin
  if minor_account_limited(new.id) and exists (select 1 from players where profile_id = new.id and passport_code is not null) then
    perform set_config('app.trusted_rpc', 'on', true);
    update players set passport_code = null where profile_id = new.id and passport_code is not null;
    perform set_config('app.trusted_rpc', prev, true);
  end if;
  return new;
end $$;
revoke all on function passport_off_when_limited() from public, anon, authenticated;
drop trigger if exists profiles_passport_off_when_limited on profiles;
create trigger profiles_passport_off_when_limited after update of guardian_consent on profiles
  for each row execute function passport_off_when_limited();

-- Hall of Fame honours leave a hidden child out.
create or replace function honours_skip_limited()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.player_ids := coalesce((select array_agg(x order by i) from unnest(new.player_ids) with ordinality u(x, i)
                               where not player_account_limited(x)), '{}');
  return new;
end $$;
revoke all on function honours_skip_limited() from public, anon, authenticated;
drop trigger if exists org_honours_skip_limited on org_honours;
create trigger org_honours_skip_limited before insert or update of player_ids on org_honours
  for each row execute function honours_skip_limited();
