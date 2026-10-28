-- ============================================================================
--  Hotfix (found live 2026-10-29): reading `phone` from players_view failed for
--  everyone — "permission denied for function member_consented".
--
--  Wave 2 (20261028140000) made the view show a coach-added player's number to
--  the coach only once that player's side agreed to the team, by calling
--  member_consented() — and in the same migration locked member_consented away
--  from anon and authenticated. Postgres checks a view's functions as the
--  person reading it, so every read that includes `phone` failed: every profile
--  page and every full player list ("Set up your profile", the "Did a coach add
--  you by phone?" card). Counting rows still worked (an unread column is left
--  out of the plan), so nothing noticed.
--
--  The view now calls editable_team_member_consented(), which anyone may call
--  but which only answers for a team the reader can edit (so it can't be used
--  to learn another team's agreements), and is otherwise identical.
--  Test: tests/db-view-columns.test.mts reads every column of every client view
--  as a visitor and as a signed-in user. Idempotent — safe to re-run.
-- ============================================================================

create or replace function editable_team_member_consented(p_team uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(can_edit_team_roster(p_team), false) and member_consented('team', p_team, p_player);
$$;
revoke all on function editable_team_member_consented(uuid, uuid) from public;
grant execute on function editable_team_member_consented(uuid, uuid) to anon, authenticated;

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
         then not me.anon and exists (select 1 from teams t where t.id = any(me.editable) and t.roster ? p.id::text
                                        and editable_team_member_consented(t.id, p.id))  -- W2; 2026-10-29: callable by the reader
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
