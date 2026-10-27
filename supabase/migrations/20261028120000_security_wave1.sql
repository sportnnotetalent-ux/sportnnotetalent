-- ============================================================================
--  Security Wave 1 (founder 2026-10-28; docs/security/audit-2026-10-27/PLAN.md)
--  Urgent fixes from the break-it audits, with no change to how the app is used.
--  Each is covered by tests/db-wave1.test.mts, run against every migration in
--  a real Postgres (PGlite).
--
--  W1-1 (EF-01 / DB-04): someone who manages an unclaimed child's team but
--       didn't add the child can no longer change the child's guardian contact,
--       guardian account link or date of birth. The guardian-takeover chain
--       (change the email → link code mailed to it → become guardian) is closed.
--  W1-2 (DB-02): a provisional player is claimed only with a VERIFIED number
--       (the sign-in phone confirmed by SMS) or the confirmed sign-in email —
--       never the profile phone, which is just text the user typed.
--  W1-3 (DB-03): meet_ages() answers only for the meet's own entrants, and a
--       person can read at most 6 different age cut-off dates a day (finding a
--       date of birth by moving the cut-off needs about 9).
--  W1-4 (DB-06): a match can't join (or be moved into) a team-tie series unless
--       the caller manages every match already in it.
--  W1-7 (DB-09 / CL-02): the phone / email lookups return a possible minor's
--       name as initials.
--  W1-10 (CL-12): a match's live-stream and map links are cleaned for every app
--       version: https only (a bare "youtu.be/x" gets it, http: is upgraded);
--       upi:, intent:, javascript:, data: and links with credentials are dropped.
-- ============================================================================

-- ---------- W1-1 + W1-2: guard_player_write ------------------------------------
-- Latest body: 20261019121200_admin_edit_player.sql. Changes are marked W1-1 / W1-2.
create or replace function guard_player_write()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  my_email    text;
  my_email_ok boolean := false;
  my_phone    text;
begin
  if not is_client_request() or is_support() then return new; end if;

  select u.email, (u.email_confirmed_at is not null)
    into my_email, my_email_ok
    from auth.users u where u.id = auth.uid();
  my_email_ok := coalesce(my_email_ok, false);

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.phone_verified := false;               -- only verify-contact-otp sets this
    new.reported_at := null;
    new.email_verified := coalesce(new.email_verified, false)
      and new.profile_id = auth.uid() and my_email_ok
      and lower(coalesce(new.email, '')) = lower(coalesce(my_email, ''));
    if coalesce(new.verification->>'status', 'pending') <> 'pending' then
      new.verification := new.verification - 'status';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if old.profile_id is null and new.profile_id is not null then
    -- Claiming a provisional player: only for yourself, only one that matches
    -- your own VERIFIED number or confirmed email, never one flagged "not me".
    -- W1-2: the number is the sign-in phone SMS confirmed (auth.users), never
    -- profiles.phone, which the user can type freely.
    select u.phone into my_phone from auth.users u
     where u.id = auth.uid() and u.phone_confirmed_at is not null;
    if new.profile_id <> auth.uid()
       or old.reported_at is not null
       or not coalesce( (phone_key(old.phone) is not null and phone_key(old.phone) = phone_key(my_phone))
                     or (old.email is not null and my_email_ok and lower(old.email) = lower(my_email)), false) then
      raise exception 'You can only claim a profile that matches your own verified phone number or email'
        using errcode = '42501';
    end if;
  elsif old.profile_id is null and old.created_by is distinct from auth.uid() then
    -- Parity #12: a manager of a team / club / tournament this unclaimed player
    -- is on may edit it too — but never its identity or privacy choices.
    if not can_admin_player(old.id) then
      raise exception 'Only the person who added this player can edit it' using errcode = '42501';
    end if;
    new.profile_id := old.profile_id;
    if old.phone is not null then new.phone := old.phone; end if;
    if old.email is not null then new.email := old.email; end if;
    new.house_name := old.house_name;
    new.show_phone := old.show_phone;
    new.show_email := old.show_email;
    new.findable_by_contact := old.findable_by_contact;
    new.verification := old.verification;
    -- W1-1: nor who the child's parent is, or when they were born — only the
    -- person who added the child (or the parent, or support) changes those.
    new.guardian := old.guardian;
    new.guardian_profile_id := old.guardian_profile_id;
    new.dob := old.dob;
  end if;

  new.created_by := old.created_by;
  new.reported_at := old.reported_at;

  -- phone_verified: never set by the client; a changed number is unverified.
  new.phone_verified := case when phone_key(new.phone) is distinct from phone_key(old.phone)
                             then false else old.phone_verified end;

  -- email_verified: only true for your own confirmed sign-in email.
  if new.email is distinct from old.email or (new.email_verified and not old.email_verified) then
    new.email_verified := coalesce(new.email_verified, false)
      and new.profile_id = auth.uid() and my_email_ok
      and lower(coalesce(new.email, '')) = lower(coalesce(my_email, ''));
  else
    new.email_verified := old.email_verified;
  end if;

  -- verification: the owner may (re)submit → 'pending'; approve/reject is
  -- reviewer-only. Changing a verified DOB or guardian voids the approval.
  if (new.verification->>'status') is distinct from (old.verification->>'status')
     and coalesce(new.verification->>'status', 'pending') <> 'pending' then
    raise exception 'Only SportnNote reviewers can approve or reject verification' using errcode = '42501';
  end if;
  if (old.verification->>'status') = 'approved'
     and (new.dob is distinct from old.dob
          -- the guardian's identity, not bookkeeping flags inside the jsonb
          or (new.guardian->>'name', phone_key(new.guardian->>'phone'), lower(new.guardian->>'email'))
             is distinct from
             (old.guardian->>'name', phone_key(old.guardian->>'phone'), lower(old.guardian->>'email')))
     and (new.verification->>'status') = 'approved' then
    new.verification := new.verification - 'status';
  end if;

  return new;
end $$;

-- W1-2: the provisional player waiting for ME — on my VERIFIED sign-in number or
-- confirmed email (latest body: 20261007120000_private_contact_details.sql).
create or replace function my_claimable_player()
  returns uuid language sql stable security definer set search_path = public as $$
  select p.id from players p
  where p.profile_id is null and p.reported_at is null
    and (
      (phone_key(p.phone) is not null and exists (
            select 1 from auth.users u
            where u.id = auth.uid() and u.phone_confirmed_at is not null
              and phone_key(u.phone) = phone_key(p.phone)))
      or (p.email is not null and exists (
            select 1 from auth.users u
            where u.id = auth.uid() and u.email_confirmed_at is not null
              and lower(u.email) = lower(p.email)))
    )
  order by p.created_at
  limit 1;
$$;

-- ---------- W1-3: meet_ages ------------------------------------------------------
-- The players entered in a tournament: its teams' rosters, members and
-- singles / doubles entries, and its field events' entries.
create or replace function tournament_entrant_ids(p_tid uuid)
  returns setof uuid language sql stable security definer set search_path = public as $$
  select json_uuid(r.v) from tournament_teams tt join teams t on t.id = tt.team_id,
         jsonb_array_elements_text(case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as r(v)
   where tt.tournament_id = p_tid
  union
  select tm.player_id from tournament_teams tt join team_members tm on tm.team_id = tt.team_id where tt.tournament_id = p_tid
  union
  select unnest(t.entry_ids) from tournament_teams tt join teams t on t.id = tt.team_id where tt.tournament_id = p_tid
  union
  select fe.player_id from field_entries fe join field_events fv on fv.id = fe.event_id where fv.tournament_id = p_tid;
$$;
revoke all on function tournament_entrant_ids(uuid) from public, anon, authenticated;

-- Which age cut-off dates each person read, per day (rate limit — no client access).
create table if not exists meet_age_reads (
  profile_id uuid not null,
  cutoff     date not null,
  day        date not null default current_date,
  primary key (profile_id, day, cutoff)
);
alter table meet_age_reads enable row level security;
revoke all on meet_age_reads from anon, authenticated;

create or replace function meet_ages(p_tid uuid, p_sport text, p_ids uuid[])
  returns table (id uuid, age int)
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  cut date;
  reads int;
begin
  if not can_manage_tournament(p_tid) then
    raise exception 'Only the tournament’s organisers can check ages' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 2000 then raise exception 'Too many players' using errcode = '54000'; end if;
  cut := meet_age_cutoff(p_tid, p_sport);
  -- W1-3: at most 6 different cut-off dates a person a day
  insert into meet_age_reads (profile_id, cutoff) values (auth.uid(), cut) on conflict do nothing;
  select count(*) into reads from meet_age_reads where profile_id = auth.uid() and day = current_date;
  if reads > 6 then
    raise exception 'Too many different age dates checked today — try again tomorrow' using errcode = '54000';
  end if;
  if random() < 0.01 then delete from meet_age_reads where day < current_date - 7; end if;
  return query
    select p.id, extract(year from age(cut, p.dob))::int
      from players p
     where p.id = any(p_ids) and p.dob is not null and p.dob <= cut
       -- W1-3: only this meet's own entrants
       and p.id in (select tournament_entrant_ids(p_tid));
end $$;
revoke all on function meet_ages(uuid, text, uuid[]) from public, anon;
grant execute on function meet_ages(uuid, text, uuid[]) to authenticated;

-- ---------- W1-4: team-tie series ------------------------------------------------
create or replace function guard_match_series()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid text := nullif(new.format->>'__seriesId', '');
begin
  if not is_client_request() or sid is null then return new; end if;
  if tg_op = 'UPDATE' and sid is not distinct from nullif(old.format->>'__seriesId', '') then return new; end if;
  if exists (
    select 1 from matches m
     where m.format->>'__seriesId' = sid and m.id is distinct from new.id
       and not ( m.host_ids && auth_player_ids()
              or (m.tournament_id is not null and can_manage_tournament(m.tournament_id)) )
  ) then
    raise exception 'That series belongs to someone else' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_match_series on matches;
create trigger guard_match_series before insert or update of format on matches
  for each row execute function guard_match_series();

-- ---------- W1-7: lookups ----------------------------------------------------------
-- Latest bodies: 20261007120000_private_contact_details.sql. Only the name changes.
create or replace function find_player_by_phone(p_phone text)
  returns table (id uuid, full_name text, claimed boolean)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if phone_key(p_phone) is null or length(phone_key(p_phone)) < 10 then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id, public_person_name(p.id, p.full_name), p.profile_id is not null
    from players p where phone_key(p.phone) = phone_key(p_phone)
    order by (p.profile_id is not null) desc, p.created_at
    limit 1;
end $$;

create or replace function find_player_by_email(p_email text)
  returns table (id uuid, full_name text, claimed boolean)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if coalesce(trim(p_email), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id, public_person_name(p.id, p.full_name), p.profile_id is not null
    from players p where lower(p.email) = lower(trim(p_email))
    order by (p.profile_id is not null) desc, p.created_at
    limit 1;
end $$;

-- ---------- W1-10: links on a match ---------------------------------------------------
-- Mirrors src/core/safeUrl.ts safeWebUrl().
create or replace function safe_web_url(p text)
  returns text language sql immutable set search_path = public as $$
  select case
    when s is null or s = '' or length(s) > 500 or s ~ '\s' then null
    when u !~* '^https://' then null
    when u ~* '^https://[^/?#]*@' then null                       -- user:password@host
    when u !~* '^https://[^/?#:]+\.[a-z]{2,}(:\d+)?([/?#]|$)' then null  -- a real host name
    else u
  end
  from (select btrim(p) as s) a,
       lateral (select case when btrim(p) ~* '^[a-z][a-z0-9+.-]*:'
                            then regexp_replace(btrim(p), '^http:', 'https:', 'i')
                            else 'https://' || regexp_replace(btrim(p), '^/+', '') end as u) b;
$$;

create or replace function matches_safe_links()
  returns trigger language plpgsql set search_path = public as $$
begin
  if new.stream_url is not null then new.stream_url := safe_web_url(new.stream_url); end if;
  if new.venue_maps_url is not null then new.venue_maps_url := safe_web_url(new.venue_maps_url); end if;
  return new;
end $$;
drop trigger if exists matches_safe_links on matches;
create trigger matches_safe_links before insert or update of stream_url, venue_maps_url on matches
  for each row execute function matches_safe_links();
