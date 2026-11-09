-- ============================================================================
--  Verification fast lanes, Phase 1: faster document review (founder, 2026-10-24)
--  docs/verification/fast-lanes.md
--
--  Before: one support account, alerted by an email that carried a 7-day link to
--  the (often a child's) ID document; nothing reminded anyone; the only live
--  submission sat 55 days with no file.
--
--  1. Trusted reviewers: verification_reviewers + is_verification_reviewer()
--     (support/admin, or appointed by support). Reviewers act ONLY through
--     server functions — support's blanket bypass of the player-row guards is
--     not extended to them.
--  2. Reviewers may open the documents (storage policy).
--  3. pending_verifications(): the queue, with what a reviewer needs.
--  4. Support appoints / removes reviewers (functions below).
--  5. Hourly cron → edge function verification-reminders (re-alerts reviewers
--     about anything waiting more than 12 hours). Decisions go through the
--     verification-review edge function.
--
--  Deploy (founder runs this, then): supabase functions deploy verification-review
--  verification-reminders verification-submit
-- ============================================================================

-- ---------- 1. Reviewers ------------------------------------------------------
create table if not exists verification_reviewers (
  profile_id uuid primary key references profiles(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table verification_reviewers enable row level security;
-- No policies: read and written only through the functions below.
revoke all on verification_reviewers from anon, authenticated;

create or replace function is_verification_reviewer()
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (is_support() or exists (select 1 from verification_reviewers r where r.profile_id = auth.uid()));
$$;
revoke all on function is_verification_reviewer() from public, anon;
grant execute on function is_verification_reviewer() to authenticated, service_role;

-- ---------- 2. Documents: reviewers may open them -------------------------------
drop policy if exists "verif docs read own or support" on storage.objects;
drop policy if exists "verif docs read own or reviewer" on storage.objects;
create policy "verif docs read own or reviewer" on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or is_verification_reviewer()));

-- ---------- 3. The queue --------------------------------------------------------
create or replace function pending_verifications()
  returns table (
    player_id uuid, profile_id uuid, full_name text, dob date,
    guardian_name text, guardian_linked boolean,
    doc_name text, doc_path text, submitted_at bigint, history jsonb
  ) language sql stable security definer set search_path = public as $$
  select p.id, p.profile_id, p.full_name, coalesce(p.dob, pr.dob),
         nullif(p.guardian->>'name', ''), p.guardian_profile_id is not null,
         p.verification->>'docName', p.verification->>'docPath',
         nullif(p.verification->>'submittedAt', '')::numeric::bigint,
         coalesce(p.verification->'history', '[]'::jsonb)
    from players p
    left join profiles pr on pr.id = p.profile_id
   where is_verification_reviewer()
     and p.verification->>'status' = 'pending'
   order by nullif(p.verification->>'submittedAt', '')::numeric nulls last;
$$;
revoke all on function pending_verifications() from public, anon;
grant execute on function pending_verifications() to authenticated;

-- ---------- 4. Appointing reviewers (support only) ------------------------------
create or replace function verification_reviewers_list()
  returns table (profile_id uuid, full_name text, granted_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select r.profile_id, p.full_name, r.granted_at
    from verification_reviewers r join profiles p on p.id = r.profile_id
   where is_support()
   order by r.granted_at;
$$;
revoke all on function verification_reviewers_list() from public, anon;
grant execute on function verification_reviewers_list() to authenticated;

create or replace function grant_verification_reviewer(p_profile uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then
    raise exception 'Only SportnNote support can appoint reviewers' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No SportnNote account found for that person';
  end if;
  insert into verification_reviewers (profile_id, granted_by) values (p_profile, auth.uid())
    on conflict (profile_id) do nothing;
end $$;
revoke all on function grant_verification_reviewer(uuid) from public, anon;
grant execute on function grant_verification_reviewer(uuid) to authenticated;

create or replace function revoke_verification_reviewer(p_profile uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then
    raise exception 'Only SportnNote support can remove reviewers' using errcode = '42501';
  end if;
  delete from verification_reviewers where profile_id = p_profile;
end $$;
revoke all on function revoke_verification_reviewer(uuid) from public, anon;
grant execute on function revoke_verification_reviewer(uuid) to authenticated;

-- ---------- 5. Hourly reminder (edge function verification-reminders) -------------
-- Same auth as privacy-retention: the functions anon key + the cron secret, both
-- from Vault.
select cron.unschedule('verification-reminders')
 where exists (select 1 from cron.job where jobname = 'verification-reminders');
select cron.schedule(
  'verification-reminders', '15 * * * *',
  $$ select net.http_post(
       url := 'https://byjuxrajzvfjpnqvzwzv.supabase.co/functions/v1/verification-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'functions_anon_key'),
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       body := '{}'::jsonb) $$
);
