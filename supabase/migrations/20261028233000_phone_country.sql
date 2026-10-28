-- ============================================================================
--  CL-04 · The country that decides an under-18's consent route comes from the
--  phone number, not the device (founder 2026-10-28: "for India by default it's
--  +91 … if one verifies their phone number, means they are from that
--  country"). Idempotent — safe to re-run. Needs 20261020120000_privacy_rights.
--
--  1. country_of_phone(): the country a number's dial code says, for the
--     markets the app serves. +1 is shared by the US and Canada (null here; the
--     US rules apply to it separately). Any other valid number: 'ZZ' ("outside
--     India, not in this list").
--  2. Sign-up (privacy_on_new_profile): the mobile's dial code decides, not the
--     device's time zone. When the number and the device disagree on India,
--     the stricter one is kept (the guardian confirms). An under-18 with no
--     phone has proven no country: the guardian confirms. India is unchanged:
--     a +91 number on an Indian device (or an older build that sends no
--     country) keeps the sign-up checkbox.
--  3. apply_verified_phone_country(): called by verify-phone-firebase (service
--     role) once the SMS proves the number. The account's country becomes the
--     number's; the route only gets stricter (an India checkbox becomes
--     "waiting for a guardian" for a non-Indian number; a waiting, confirmed or
--     withdrawn account is kept as it is).
-- ============================================================================


-- ---------- 1. A number's country ---------------------------------------------

create or replace function country_of_phone(p_phone text)
  returns text language sql immutable set search_path = public as $$
  select case
    when ph is null or ph !~ '^\+[1-9][0-9]{6,14}$' then null
    when ph ~ '^\+1' then null
    when ph ~ '^\+91' then 'IN'
    when ph ~ '^\+44' then 'GB'
    when ph ~ '^\+971' then 'AE'
    when ph ~ '^\+974' then 'QA'
    when ph ~ '^\+966' then 'SA'
    when ph ~ '^\+968' then 'OM'
    when ph ~ '^\+973' then 'BH'
    when ph ~ '^\+965' then 'KW'
    when ph ~ '^\+65' then 'SG'
    when ph ~ '^\+60' then 'MY'
    when ph ~ '^\+61' then 'AU'
    when ph ~ '^\+64' then 'NZ'
    when ph ~ '^\+353' then 'IE'
    when ph ~ '^\+27' then 'ZA'
    when ph ~ '^\+94' then 'LK'
    when ph ~ '^\+977' then 'NP'
    when ph ~ '^\+880' then 'BD'
    when ph ~ '^\+92' then 'PK'
    else 'ZZ' end
  from (select regexp_replace(p_phone, '[[:space:]().-]', '', 'g') as ph) x;
$$;

-- A North American (+1) number: the US rules apply (conservative; shared with Canada).
create or replace function phone_is_nanp(p_phone text)
  returns boolean language sql immutable set search_path = public as $$
  select coalesce(regexp_replace(p_phone, '[[:space:]().-]', '', 'g') ~ '^\+1[0-9]{10}$', false);
$$;


-- ---------- 2. Sign-up -----------------------------------------------------------

create or replace function privacy_on_new_profile()
  returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  meta jsonb;
  dc   text;     -- the device's country (what the app sent)
  pc   text;     -- the phone's country
  cc   text;     -- what is stored
  nanp boolean;
  ph   text;
  yrs  int;
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into meta from auth.users u where u.id = new.id;
  meta := coalesce(meta, '{}'::jsonb);

  -- Consent state is never taken from a client.
  new.guardian_consent := null; new.guardian_consent_at := null;
  new.guardian_consent_method := null; new.consent_withdrawn_at := null;

  dc := upper(coalesce(nullif(meta->>'country', ''), ''));
  if dc !~ '^[A-Z]{2}$' then dc := null; end if;
  ph := coalesce(nullif(meta->>'phone', ''), new.phone, '');
  pc := country_of_phone(ph);
  nanp := phone_is_nanp(ph);
  -- CL-04: the phone decides; when it and the device disagree on India, the
  -- stricter (not India) one is kept
  if nanp then
    cc := case when dc in ('US', 'CA') then dc end;
  elsif pc in ('IN', 'ZZ') then
    cc := case when dc is not null and dc <> 'IN' then dc else pc end;
  elsif pc is not null then
    cc := pc;
  else
    cc := dc;  -- no phone: the device's (an under-18 then waits for a guardian, below)
  end if;
  new.signup_country := cc;
  -- "Essential only" chosen on the device before signing up.
  if meta->>'analytics' = 'denied' then new.analytics_opt_out := true; end if;

  if new.dob is not null then
    yrs := extract(year from age(current_date, new.dob))::int;
    if yrs < 13 and (cc = 'US' or dc = 'US' or nanp) then
      raise exception 'US_UNDER_13: In the US, children under 13 can''t create their own account. A parent or guardian can add them as a player from the parent''s account.'
        using errcode = '42501';
    end if;
    if yrs < 18 then
      -- India's sign-up checkbox only when an Indian (+91) number says India
      if guardian_confirm_required(cc) or nanp or pc is distinct from 'IN' then
        new.guardian_consent := 'pending';
      else
        new.guardian_consent := 'self_declared';
        new.guardian_consent_at := now();
        new.guardian_consent_method := 'signup_checkbox';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists privacy_on_new_profile on profiles;
create trigger privacy_on_new_profile before insert on profiles
  for each row execute function privacy_on_new_profile();


-- ---------- 3. A verified number -------------------------------------------------

create or replace function apply_verified_phone_country(p_profile uuid, p_phone text)
  returns void language plpgsql security definer set search_path = public as $$
declare
  pc   text := country_of_phone(p_phone);
  nanp boolean := phone_is_nanp(p_phone);
  pr   record;
  cc   text;
begin
  if pc is null and not nanp then return; end if;
  select id, dob, signup_country, guardian_consent into pr from profiles where id = p_profile for update;
  if not found then return; end if;
  cc := case
    when nanp then case when pr.signup_country in ('US', 'CA') then pr.signup_country else 'US' end
    -- 'ZZ' keeps a more exact non-India country already on file
    when pc = 'ZZ' and pr.signup_country is not null and pr.signup_country not in ('IN', 'ZZ') then pr.signup_country
    else pc end;
  update profiles set signup_country = cc where id = p_profile and signup_country is distinct from cc;
  -- only stricter: the India checkbox waits for a guardian when the number isn't Indian
  if pr.guardian_consent = 'self_declared' and profile_is_minor(pr.dob) and guardian_confirm_required(cc) then
    update profiles set guardian_consent = 'pending', guardian_consent_at = null, guardian_consent_method = 'phone_country'
     where id = p_profile;
    insert into consent_log (profile_id, kind, event, method) values (p_profile, 'guardian_consent', 'pending', 'phone_country');
  end if;
end $$;
revoke all on function apply_verified_phone_country(uuid, text) from public, anon, authenticated;
grant execute on function apply_verified_phone_country(uuid, text) to service_role;
