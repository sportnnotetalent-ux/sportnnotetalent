-- ============================================================================
--  Found in the founder's verification test, 2026-10-26.
--
--  1. One phone, one account (push). push_tokens was keyed (profile_id, token),
--     so a phone kept every account that ever signed in on it. Live had one
--     token shared by 3 accounts, so a friend's "your proof was rejected" push
--     reached the founder's phone after the friend had signed out. Now a token
--     belongs to the account that last signed in on that phone:
--       - claim_push_token(): called by the app at every sign-in;
--       - a unique index on token;
--       - on sign-out the app deletes its own row (allowed by RLS).
--
--  2. Other people see only "verified". players_view gave non-private viewers
--     the verification STATUS (pending / rejected / approved). The app never
--     showed it, but anyone signed in could read it from the API. Now others get
--     {"status":"approved"} when approved and nothing otherwise. The person,
--     their guardian and support still get the whole record (can_view_player_private).
--     Every check of another player's status in the app compares to 'approved'
--     (eligibility, verified-only filters), so nothing else changes.
--
--  Run in the SQL editor. No deploy needed. The app's sign-in calls
--  claim_push_token and falls back to the old save until this has run.
-- ============================================================================

-- ---------- 1. push_tokens: one account per device token ------------------------
-- Keep the most recently saved owner of each token (ctid breaks ties).
delete from push_tokens a
 using push_tokens b
 where a.token = b.token
   and (a.updated_at, a.ctid) < (b.updated_at, b.ctid);

create unique index if not exists push_tokens_token_key on push_tokens (token);

create or replace function claim_push_token(p_token text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if coalesce(p_token, '') = '' or length(p_token) > 300 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  insert into push_tokens (profile_id, token, updated_at)
  values (auth.uid(), p_token, now())
  on conflict (token) do update
    set profile_id = excluded.profile_id, updated_at = now();
end $$;
revoke all on function claim_push_token(text) from public, anon;
grant execute on function claim_push_token(text) to authenticated;

-- ---------- 2. players_view: others see "verified" only ----------------------------
-- Identical to 20261024180000_verification_lanes.sql except the `verification` column.
create or replace view players_view with (security_barrier = true) as
with me as materialized (
  -- Uncorrelated and MATERIALIZED → evaluated once per query, never per row.
  select auth.uid() is null as anon, auth.uid() as uid, my_player_circle() as circle,
         -- F-04b: the teams whose roster the caller may edit, once per query
         case when auth.uid() is null then '{}'::uuid[] else my_roster_editable_team_ids() end as editable
)
select
  p.id, p.profile_id,
  case when v.full then p.full_name else name_initials(p.full_name) end as full_name,
  p.jersey_no, p.sports, p.house_name, p.house_color,
  case when v.full then p.city end as city,
  case when v.full then p.school_id end as school_id,
  p.phone_verified, p.email_verified,
  case when v.full then p.photo_url end as photo_url,
  case when v.full then p.sport_details end as sport_details,
  p.created_at, p.updated_at, p.invited,
  case when v.full then p.gender end as gender,
  case when v.full then p.bio end as bio,
  p.reported_at,
  case when v.full then p.created_by end as created_by,
  p.show_phone, p.show_email,
  case when v.full then a.age end as age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null or not v.full then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  -- the person / guardian / support: everything; everyone else: "approved" or nothing
  case when a.priv then p.verification
       when v.full and p.verification->>'status' = 'approved' then '{"status":"approved"}'::jsonb
  end as verification,
  case when v.full then p.guardian_profile_id is not null end as guardian_linked,
  p.findable_by_contact,
  not v.full as restricted,
  -- fast lanes: how this player's age was verified (a level, nothing personal) —
  -- a confirmation only counts for the date of birth it confirmed
  case
    when p.verification->>'status' = 'approved' then 'document'
    when p.dob is not null and p.dob_confirmations->'org'->>'dob' = p.dob::text then 'school'
    when p.dob is not null and p.dob_confirmations->'parent'->>'dob' = p.dob::text then 'parent'
  end as age_verified_by
from players p
cross join me
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    -- = can_contact_provisional(p.id): signed in and on the roster of a team the caller may edit
    case when p.profile_id is null
         then not me.anon and exists (select 1 from teams t where t.id = any(me.editable) and t.roster ? p.id::text)
         else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
  offset 0  -- evaluate once per row (else the planner copies each call into every column that uses it)
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
  offset 0
) v;
grant select on players_view to anon, authenticated;

-- ============================================================================
--  Checks after running:
--    select token, count(*) from push_tokens group by token having count(*) > 1;   -- 0 rows
--    select proname from pg_proc where proname = 'claim_push_token';               -- 1 row
-- ============================================================================
