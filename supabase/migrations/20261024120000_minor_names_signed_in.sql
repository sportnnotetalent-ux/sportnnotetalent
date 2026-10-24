-- ============================================================================
--  Children's names and ages: only their circle (founder, 2026-10-24)
--
--  Until now a possible minor (under 18, or no date of birth on file) showed a
--  REDUCED card to signed-in strangers that still had their full name, age,
--  gender and sport details; only logged-out visitors got initials. Anyone can
--  sign up in a minute, so that let anyone list every child's full name and age
--  (docs/security/api-exposure-audit-2026-10-24.md).
--
--  Now a signed-in viewer outside the child's circle gets exactly what a
--  logged-out visitor gets: initials, number, sports, house. Full details stay
--  with: the child, their guardian, the organiser who added them, support, and
--  their circle (player_circle_of: shared teams and clubs; tournaments they
--  run, officiate, score in or play in — every team in them; field-event
--  entries; organisations; wards). Adults are unchanged.
--
--  1. players_view: `v.full or not me.anon` → `v.full` (and the guardian /
--     verification summaries the same way). Columns, order, types, grants and
--     security_barrier unchanged; the view still evaluates the viewer once.
--  2. players (base table), signed-in SELECT: was `true`, which also exposed
--     full_name / gender / sport_details of every child. Now: adults, your own
--     rows, your wards, provisional players you added, support, your circle,
--     and the one provisional player you can claim (my_claimable_player — the
--     claim UPDATE needs to see it). The app reads players through players_view
--     (owner rights, unaffected); its direct reads are inserts of its own rows,
--     the claim, and roster / org lookups inside the circle. Logged-out reads
--     (adults only) are unchanged.
--
--  After this, don't re-run 20261023100000 or older players_view migrations:
--  they recreate the view with the old rule.
-- ============================================================================

-- ---------- 1. players_view ---------------------------------------------------
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
  case when a.priv then p.verification
       when p.verification is null or not v.full then null
       else jsonb_strip_nulls(jsonb_build_object('status', p.verification->>'status'))
  end as verification,
  case when v.full then p.guardian_profile_id is not null end as guardian_linked,
  p.findable_by_contact,
  not v.full as restricted
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

-- ---------- 2. players: signed-in reads ----------------------------------------
-- (select …) around the per-viewer calls: evaluated once per query, not per row.
drop policy if exists "read players" on players;
create policy "read players" on players for select to authenticated using (
  player_is_known_adult(dob, profile_id)
  or profile_id = (select auth.uid())
  or guardian_profile_id = (select auth.uid())
  or (profile_id is null and created_by = (select auth.uid()))
  or (select is_support())
  -- coalesce(): an array expression (a bare `any((select …))` is read as a subquery)
  or id = any(coalesce((select my_player_circle()), '{}'::uuid[]))
  or id = (select my_claimable_player())
);

-- ============================================================================
--  End. No edge function or app deploy is needed for the data to change; the
--  app's wording for the reduced card ships with the next update.
-- ============================================================================
