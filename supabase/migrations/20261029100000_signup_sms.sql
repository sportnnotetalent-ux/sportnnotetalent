-- ============================================================================
--  SMS verification is required at sign-up (founder, 2026-10-29). Closes
--  PC-05: an unverified number was a claim, not proof of the sign-up country.
--
--  1. signup_phone_tickets: after the Firebase SMS code proves the mobile,
--     phone-login (service role) swaps the proof for a one-time ticket
--     (create_signup_phone_ticket: 64 hex characters, 20 minutes, only the hash
--     kept, one live ticket per number).
--  2. The Auth "Before User Created" hook (hook_before_user_created) refuses an
--     email sign-up unless its metadata carries a live ticket for the same
--     number. Our own mobile sign-in (phone-login: a confirmed phone and the
--     placeholder address) needs none. Support can switch the requirement off
--     for an SMS outage: update signup_guard_settings set require_phone = false.
--  3. The new profile redeems the ticket (redeem_signup_phone_ticket, after
--     insert on profiles): the ticket is spent and the account's player starts
--     with the mobile verified — no second SMS.
--  4. phone_login_attach_player (both routes) links a coach-made profile with
--     the number only under Wave 2b's checks (claim_player_by_phone: the same
--     first name and birth year, no other parent). It used to link by number
--     alone: a parent signing up with their own number got their child's
--     profile when a coach had typed that number on it. A "not me" flag is
--     still cleared once the number is proven (0037).
--
--  Idempotent — safe to re-run. The hook must be ON: Supabase → Authentication
--  → Auth Hooks → "Before User Created" → public.hook_before_user_created.
-- ============================================================================


-- ---------- 1. Tickets -------------------------------------------------------------

create table if not exists signup_phone_tickets (
  token_hash text primary key,
  phone      text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid,
  created_at timestamptz not null default now()
);
create index if not exists signup_phone_tickets_phone_idx on signup_phone_tickets (phone);
alter table signup_phone_tickets enable row level security;
revoke all on signup_phone_tickets from public, anon, authenticated;

create or replace function create_signup_phone_ticket(p_phone text)
  returns text language plpgsql security definer set search_path = public as $$
declare
  ph text := phone_key(p_phone);
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if ph is null or ph !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'a full international number is required'; end if;
  delete from signup_phone_tickets where (phone = ph and used_at is null) or expires_at < now() - interval '1 day';
  insert into signup_phone_tickets (token_hash, phone, expires_at)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), ph, now() + interval '20 minutes');
  return token;
end $$;
revoke all on function create_signup_phone_ticket(text) from public, anon, authenticated;
grant execute on function create_signup_phone_ticket(text) to service_role;

-- A live ticket for this number? (the hook and the redeem share the rule)
create or replace function signup_phone_ticket_ok(p_ticket text, p_phone text)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_ticket, '') <> '' and exists (
    select 1 from signup_phone_tickets t
     where t.token_hash = encode(sha256(convert_to(p_ticket, 'UTF8')), 'hex')
       and t.phone = phone_key(p_phone) and t.used_at is null and t.expires_at > now());
$$;
revoke all on function signup_phone_ticket_ok(text, text) from public, anon, authenticated;


-- ---------- 2. The sign-up hook -------------------------------------------------------

alter table signup_guard_settings add column if not exists require_phone boolean not null default true;

create or replace function hook_before_user_created(event jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s signup_guard_settings;
  u jsonb := coalesce(event->'user', '{}'::jsonb);
  meta jsonb := coalesce(u->'user_metadata', '{}'::jsonb);
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

  -- 2026-10-29: the mobile is proven by SMS before the account is made
  if s.require_phone and not signup_phone_ticket_ok(meta->>'phone_ticket', meta->>'phone') then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Verify your mobile number first — we text you a code, then you can create your account.'));
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
grant execute on function signup_phone_ticket_ok(text, text) to supabase_auth_admin;
grant select on signup_phone_tickets to supabase_auth_admin;


-- ---------- 4. Linking a coach-made profile: Wave 2b's checks on both routes -----------

create or replace function phone_login_attach_player(p_profile uuid, p_phone text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr profiles%rowtype;
  pid uuid;
  k text := phone_key(p_phone);
begin
  select * into pr from profiles where id = p_profile;
  if not found then raise exception 'no profile'; end if;
  select id into pid from players where profile_id = p_profile order by created_at limit 1;
  if pid is not null then
    update players set phone_verified = true where id = pid and phone_key(phone) = k;
    return pid;
  end if;
  -- 0037: proving the number settles a "not me" flag (a link preview could set it)
  perform set_config('app.trusted_rpc', 'on', true);
  update players set reported_at = null
   where id = (select id from players where profile_id is null and reported_at is not null and phone_key(phone) = k
                order by created_at limit 1)
     and not exists (select 1 from players q where q.profile_id is null and q.reported_at is null and phone_key(q.phone) = k);
  perform set_config('app.trusted_rpc', 'off', true);
  if claim_player_by_phone(p_profile, p_phone) = 'linked' then
    select id into pid from players where profile_id = p_profile order by created_at limit 1;
    return pid;
  end if;
  -- their own profile; the number only if no other profile has it (support links the rest)
  if exists (select 1 from players q where phone_key(q.phone) = k) then
    insert into players (profile_id, full_name, phone, dob, guardian, phone_verified, sports)
    values (p_profile, pr.full_name, null, pr.dob, pr.guardian, false, '{}')
    returning id into pid;
  else
    insert into players (profile_id, full_name, phone, dob, guardian, phone_verified, sports)
    values (p_profile, pr.full_name, p_phone, pr.dob, pr.guardian, true, '{}')
    returning id into pid;
  end if;
  return pid;
end $$;
revoke all on function phone_login_attach_player(uuid, text) from public, anon, authenticated;
grant execute on function phone_login_attach_player(uuid, text) to service_role;


-- ---------- 3. The new profile redeems its ticket ------------------------------------------

create or replace function redeem_signup_phone_ticket()
  returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  meta jsonb;
  got  text;
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into meta from auth.users u where u.id = new.id;
  if coalesce(meta->>'phone_ticket', '') = '' then return new; end if;
  update signup_phone_tickets t set used_at = now(), used_by = new.id
   where t.token_hash = encode(sha256(convert_to(meta->>'phone_ticket', 'UTF8')), 'hex')
     and t.phone = phone_key(meta->>'phone') and t.used_at is null and t.expires_at > now()
  returning t.phone into got;
  if got is not null then perform phone_login_attach_player(new.id, got); end if;
  return new;
exception when others then
  return new;  -- the account is made either way; the number can be verified in Profile
end $$;
drop trigger if exists redeem_signup_phone_ticket on profiles;
create trigger redeem_signup_phone_ticket after insert on profiles
  for each row execute function redeem_signup_phone_ticket();
