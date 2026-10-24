-- ============================================================================
--  Verification fast lanes, Phase 3: the organiser chooses what each tournament
--  needs (founder, 2026-10-24 — docs/verification/fast-lanes.md).
--
--  tournaments.age_verification:
--    'none'      — not required (the default; today's behaviour)
--    'confirmed' — every player's age confirmed by a parent, their school /
--                  club, or a reviewed document (players_view.age_verified_by
--                  is set)
--    'verified'  — verified by their school / club or a reviewed document
--  The app enforces it where players are picked for that tournament's matches
--  (squad, cricket line-up, live scoring roster). Friendlies stay 'none'.
--  Written by the tournament's organisers through the existing tournaments
--  update policy.
-- ============================================================================
alter table tournaments add column if not exists age_verification text not null default 'none';
alter table tournaments drop constraint if exists tournaments_age_verification_check;
alter table tournaments add constraint tournaments_age_verification_check
  check (age_verification in ('none', 'confirmed', 'verified'));
