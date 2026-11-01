-- Viewers become scorers (growth plan #6): how many people open, start and
-- save a game of their own, and where they came from — last 7 days.
-- Read-only. Run in the Supabase SQL editor whenever you like.
--   from: match_link (the light score page) · guest_bar (the app, signed out) · sign_in (the sign-in screen)
--   step: guest_game_open → guest_game_start → guest_game_saved
select
  props->>'step' as step,
  coalesce(props->>'from', '(saved)') as came_from,
  count(*) as times,
  count(distinct coalesce(anon_id::text, profile_id::text)) as people
from analytics_events
where name = 'onboarding_step'
  and props->>'step' like 'guest_game_%'
  and at > now() - interval '7 days'
group by 1, 2
order by 1, 2;
