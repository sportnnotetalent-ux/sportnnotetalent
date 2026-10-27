-- Sign-up guard (2026-10-27) — anti-scraping "at scale", docs/security/anti-scraping.md.
--
-- Scraping at scale needs many accounts. This Supabase Auth "Before User
-- Created" hook makes them hard to make in bulk, without any change to the app
-- (so Android APK 41 keeps working) and without a CAPTCHA for real people:
--
-- * temporary-inbox services (mailinator, 10minutemail …) can't sign up;
-- * at most N new accounts a day from one network (IP) — default 100, high
--   enough for a school's sign-up drive on one Wi-Fi; support can raise it;
-- * accounts our own phone sign-in makes (phone-login: a confirmed phone and a
--   placeholder @phone.sportnnote.in address) are never limited — apps can't
--   make those, as Supabase phone sign-up is off;
-- * it fails open: if the check itself errors, the sign-up goes through.
--
-- After running this, switch it on: Supabase → Authentication → Auth Hooks →
-- "Before User Created" → Postgres → public.hook_before_user_created.
-- Turn it off the same way (or `update signup_guard_settings set enabled = false`).
--
-- Idempotent — safe to re-run.

create table if not exists signup_guard_settings (
  id             boolean primary key default true check (id),
  enabled        boolean not null default true,
  per_ip_per_day int not null default 100 check (per_ip_per_day between 1 and 100000),
  blocked_domains text[] not null default array[
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com', 'grr.la',
    '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com',
    'tempmail.dev', 'tempinbox.com', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'trashmail.de',
    'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com',
    'mintemail.com', 'mohmal.com', 'emailondeck.com', 'mailnesia.com', 'mytemp.email', 'moakt.com',
    'burnermail.io', '1secmail.com', '1secmail.net', '1secmail.org', 'discard.email', 'inboxkitten.com',
    'mail.tm', 'tmpmail.org', 'tmpmail.net', 'emailfake.com', 'spamgourmet.com', 'mailcatch.com', 'mailpoof.com'
  ]
);
insert into signup_guard_settings (id) values (true) on conflict (id) do nothing;
alter table signup_guard_settings enable row level security;
-- no policies: changed in the SQL editor only

comment on table signup_guard_settings is 'Sign-up guard (hook_before_user_created): on/off, new accounts per IP per day, temporary-inbox domains';

create or replace function hook_before_user_created(event jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s signup_guard_settings;
  u jsonb := coalesce(event->'user', '{}'::jsonb);
  domain text := split_part(lower(trim(coalesce(u->>'email', ''))), '@', 2);
  ip text := nullif(trim(coalesce(event->'metadata'->>'ip_address', '')), '');
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
grant usage on schema public to supabase_auth_admin;
