-- Read-only privacy check (IDs-only scoring, docs/privacy/ids-only-scoring.md):
-- how many PUBLIC rows still contain a possible minor's full name (under 18, or
-- no date of birth — the players_view rule). Every count should be 0.
-- Run:  npx supabase db query --linked -f scripts/check-minor-names.sql
with minors as (
  select full_name from players
   where not player_is_known_adult(dob, profile_id) and length(trim(full_name)) > 3
)
select 'match_events' as store, count(*) as rows_with_child_name from match_events e
 where exists (select 1 from minors m where coalesce(e.payload::text, '') || coalesce(e.attribution::text, '') ilike '%' || m.full_name || '%')
union all select 'matches (state, potm, result)', count(*) from matches x
 where exists (select 1 from minors m where coalesce(x.state::text, '') || coalesce(x.potm::text, '') || coalesce(x.result::text, '') ilike '%' || m.full_name || '%')
union all select 'teams (names)', count(*) from teams x
 where exists (select 1 from minors m where x.name ilike '%' || m.full_name || '%')
union all select 'stat_lines (opponent)', count(*) from stat_lines x
 where exists (select 1 from minors m where coalesce(x.opponent, '') ilike '%' || m.full_name || '%')
union all select 'match_lineups', count(*) from match_lineups x
 where exists (select 1 from minors m where coalesce(x.home::text, '') || coalesce(x.away::text, '') ilike '%' || m.full_name || '%')
union all select 'tournaments (awards)', count(*) from tournaments x
 where exists (select 1 from minors m where coalesce(x.awards::text, '') ilike '%' || m.full_name || '%')
union all select 'match_disputes', count(*) from match_disputes x
 where exists (select 1 from minors m where to_jsonb(x)::text ilike '%' || m.full_name || '%')
union all select 'activity_log', count(*) from activity_log x
 where exists (select 1 from minors m where coalesce(x.by_name, '') || coalesce(x.detail, '') ilike '%' || m.full_name || '%')
union all select 'listings', count(*) from listings x
 where exists (select 1 from minors m where coalesce(x.author_name, '') ilike '%' || m.full_name || '%')
union all select 'field_entries (members)', count(*) from field_entries x
 where exists (select 1 from minors m where coalesce(x.result::text, '') ilike '%' || m.full_name || '%')
-- Security Wave 3 (DB-15): officials, team managers and ownership transfers
union all select 'matches (officials, managers)', count(*) from matches x
 where exists (select 1 from minors m where coalesce(x.officials::text, '') || coalesce(x.managers::text, '') ilike '%' || m.full_name || '%')
union all select 'tournament_ownership_events', count(*) from tournament_ownership_events x
 where exists (select 1 from minors m where coalesce(x.by_name, '') || coalesce(x.from_name, '') || coalesce(x.to_name, '') ilike '%' || m.full_name || '%');
