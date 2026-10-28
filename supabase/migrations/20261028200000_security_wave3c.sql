-- ============================================================================
--  Security Wave 3C — consent and abuse limits (docs/security/audit-2026-10-27/PLAN.md)
--  tests/db-wave3.test.mts · docs/security/breaks/security-wave3.md
--
--  DB-16  logged-out analytics and crash reports are also limited per address
--         (the request's IP, as api_gate reads it) and overall; the rate-limit
--         ledger is cleaned every hour by a job, not by chance.
--  DB-07  a child can't lift the under-18 limits themselves: a date of birth
--         moves to an adult one (or is cleared) only through support; changing
--         the guardian's contact after a guardian confirmed asks again (unless
--         the linked parent changes it). The sign-up country (CL-04) and how
--         consent is proven (CL-03) wait for the founder's decision.
-- ============================================================================

-- ---------- DB-16 ------------------------------------------------------------------------------
-- The caller's address from the request headers (null when unknown).
create or replace function request_ip()
  returns text language plpgsql stable set search_path = public as $$
declare
  hdr jsonb;
begin
  hdr := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  return nullif(trim(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-real-ip', split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1))), '');
exception when others then
  return null;
end $$;
revoke all on function request_ip() from public, anon, authenticated;

-- A logged-out caller: per address, and all logged-out callers together.
create or replace function anon_rate_ok(p_bucket text, p_per_ip int, p_all int)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  ip text := request_ip();
begin
  if auth.uid() is not null then return true; end if;
  if ip is not null and not rate_limit_hit(p_bucket || ':ip', ip, p_per_ip, 3600) then return false; end if;
  return rate_limit_hit(p_bucket || ':all', 'anon', p_all, 3600);
end $$;
revoke all on function anon_rate_ok(text, int, int) from public, anon, authenticated;

create or replace function track_events(p_events jsonb, p_anon_id uuid, p_session_id uuid, p_platform text, p_app_version text)
  returns integer language plpgsql security definer set search_path = public as $$
declare
  e jsonb; n int := 0;
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'anon');
  actor uuid := analytics_actor(auth.uid());
  -- A signed-in child (or unknown age): no device or session ids either.
  child boolean := auth.uid() is not null and analytics_actor(auth.uid()) is null;
  plat text := case when p_platform in ('ios', 'android', 'web') then p_platform else null end;
  ver text := left(p_app_version, 32);
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if not rate_limit_hit('track_events', subject, 120, 3600) then return 0; end if;
  if not anon_rate_ok('track_events', 300, 20000) then return 0; end if;   -- W3 DB-16
  for e in select * from jsonb_array_elements(p_events) limit 50 loop
    continue when jsonb_typeof(e) <> 'object';
    continue when coalesce(e->>'name', '') not in
      ('app_open', 'screen_view', 'share_link', 'install_prompt', 'sign_in', 'sign_out', 'onboarding_step', 'feedback_sent');
    insert into analytics_events (at, name, profile_id, anon_id, session_id, source, platform, app_version, props)
    values (
      coalesce(case when (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T'
                     and (e->>'at')::timestamptz between now() - interval '7 days' and now() + interval '5 minutes'
                    then (e->>'at')::timestamptz end, now()),
      e->>'name', actor,
      case when child then null else p_anon_id end,
      case when child then null else p_session_id end,
      'client', plat, ver, analytics_clean_props(e->'props'));
    n := n + 1;
  end loop;
  if random() < 0.001 then
    delete from analytics_events where at < now() - interval '13 months';
    delete from client_errors where at < now() - interval '13 months';
  end if;
  return n;
exception when others then
  return n;
end $$;

create or replace function report_client_error(p_message text, p_stack text, p_fatal boolean, p_screen text, p_anon_id uuid, p_session_id uuid, p_platform text, p_app_version text)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'session:' || p_session_id::text, 'anon');
  actor uuid := analytics_actor(auth.uid());
  child boolean := auth.uid() is not null and analytics_actor(auth.uid()) is null;
  msg text; stk text;
begin
  if coalesce(p_message, '') = '' then return false; end if;
  if not rate_limit_hit('client_errors', subject, 30, 3600) then return false; end if;
  if not anon_rate_ok('client_errors', 60, 3000) then return false; end if;   -- W3 DB-16
  msg := regexp_replace(regexp_replace(left(p_message, 500),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'), '\d{7,}', '<num>', 'g');
  stk := regexp_replace(regexp_replace(left(p_stack, 4000),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'), '\d{7,}', '<num>', 'g');
  insert into client_errors (profile_id, anon_id, session_id, platform, app_version, fatal, screen, message, stack, fingerprint)
  values (actor,
          case when child then null else p_anon_id end,
          case when child then null else p_session_id end,
          case when p_platform in ('ios', 'android', 'web') then p_platform else null end,
          left(p_app_version, 32), coalesce(p_fatal, false), left(p_screen, 64), msg, stk,
          md5(regexp_replace(msg || '|' || coalesce(split_part(stk, E'\n', 2), ''), '\d+', '#', 'g')));
  return true;
exception when others then
  return false;
end $$;

-- The ledger, cleaned every hour (the chance-based cleanup stays as a backstop).
select cron.unschedule('rate-limit-cleanup') where exists (select 1 from cron.job where jobname = 'rate-limit-cleanup');
select cron.schedule('rate-limit-cleanup', '41 * * * *', $$ delete from rate_limit_hits where window_start < now() - interval '2 days' $$);

-- ---------- DB-07: date of birth ---------------------------------------------------------------
-- A possible minor's date of birth moves to an adult one (or is cleared) only
-- through support. An unclaimed player's creator (a coach fixing a typo) is
-- unaffected; an account and a child's own claimed player are.
create or replace function guard_dob_adulthood()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or is_support() then return new; end if;
  -- an unclaimed player (also at the moment it's claimed: the account's own DOB is applied)
  if tg_table_name = 'players' and to_jsonb(old)->>'profile_id' is null and to_jsonb(old)->>'guardian_profile_id' is null then return new; end if;
  if profile_is_minor(old.dob) and not profile_is_minor(new.dob) then
    raise exception 'An under-18 date of birth can only be changed to an adult one by SportnNote support — write to support@sportnnote.in.'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_dob_adulthood on profiles;
create trigger guard_dob_adulthood before update of dob on profiles for each row execute function guard_dob_adulthood();
drop trigger if exists guard_dob_adulthood on players;
create trigger guard_dob_adulthood before update of dob on players for each row execute function guard_dob_adulthood();

-- ---------- DB-07: a new guardian contact is asked again ----------------------------------
-- After a guardian confirmed, a changed guardian email or phone (on the account
-- or the child's own player) puts the account back to "waiting for a guardian",
-- unless the linked parent made the change.
create or replace function guardian_contact_of(g jsonb)
  returns text language sql immutable set search_path = public as $$
  select lower(coalesce(g->>'email', '')) || '|' || regexp_replace(coalesce(g->>'phone', ''), '\D', '', 'g');
$$;
revoke all on function guardian_contact_of(jsonb) from public, anon, authenticated;

create or replace function guardian_change_reconsent()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  prof uuid := case when tg_table_name = 'profiles' then new.id else (to_jsonb(new)->>'profile_id')::uuid end;
  linked uuid := case when tg_table_name = 'players' then (to_jsonb(new)->>'guardian_profile_id')::uuid end;
begin
  if not is_client_request() or is_support() or prof is null then return new; end if;
  if guardian_contact_of(new.guardian) = guardian_contact_of(old.guardian) then return new; end if;
  if linked is not null and linked = auth.uid() then return new; end if;
  if not exists (select 1 from profiles pr where pr.id = prof and pr.guardian_consent = 'confirmed' and profile_is_minor(pr.dob)) then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    -- (guard_privacy_columns has already run: this value stands)
    new := jsonb_populate_record(new, jsonb_build_object('guardian_consent', 'pending', 'guardian_consent_at', now(), 'guardian_consent_method', null));
  else
    perform set_config('app.trusted_rpc', 'on', true);
    update profiles set guardian_consent = 'pending', guardian_consent_at = now(), guardian_consent_method = null where id = prof;
    perform set_config('app.trusted_rpc', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists guardian_change_reconsent on profiles;
create trigger guardian_change_reconsent before update of guardian on profiles for each row execute function guardian_change_reconsent();
drop trigger if exists guardian_change_reconsent on players;
create trigger guardian_change_reconsent before update of guardian on players for each row execute function guardian_change_reconsent();
