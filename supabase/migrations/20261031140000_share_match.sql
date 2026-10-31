-- ============================================================================
--  The live score link (MVP, founder 2026-10-31)
--  A shared app.sportnnote.in/m/<match> link is answered by the Cloudflare
--  Worker (worker/index.ts): link-preview robots get "⚽ LIVE · Panthers 2–1
--  Cheetahs", people get a ~15 KB live score page instead of the full app.
--  Neither can run a sport's scoring code, so:
--  1. matches.summary: the scorer's app saves a tiny summary with every save
--     of the match (score and status, e.g. {"h":"2","a":"1","s":"2nd Half"}).
--     It never holds a player's name (sports' summaries are team-level).
--  2. share_match(id): just what the link needs, to anyone, read-only.
--  Run in the SQL Editor. Safe to run again.
-- ============================================================================

alter table matches add column if not exists summary jsonb;
alter table matches drop constraint if exists matches_summary_check;
alter table matches add constraint matches_summary_check
  check (summary is null or (jsonb_typeof(summary) = 'object' and length(summary::text) <= 600));

create or replace function share_match(p_id uuid)
  returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'sport', m.sport, 'status', m.status, 'starts_at', m.starts_at,
    'venue_name', m.venue_name, 'winner', m.winner, 'summary', m.summary,
    'result_score', m.result->'score',
    'home', case when ht.id is null then null else jsonb_build_object('name', ht.name, 'short_name', ht.short_name, 'color_hex', ht.color_hex) end,
    'away', case when at.id is null then null else jsonb_build_object('name', at.name, 'short_name', at.short_name, 'color_hex', at.color_hex) end,
    'tournament', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name) end,
    'views', coalesce((select v.views from match_view_counts v where v.match_id = m.id), 0))
  from matches m
  left join teams ht on ht.id = m.home_team_id
  left join teams at on at.id = m.away_team_id
  left join tournaments t on t.id = m.tournament_id
  where m.id = p_id and (t.id is null or t.deleted_at is null);
$$;
revoke all on function share_match(uuid) from public;
grant execute on function share_match(uuid) to anon, authenticated;

-- ============================================================================
--  End. Then publish the app (it starts saving the summary) and deploy the
--  website Worker (docs/launch/live-link.md has the Cloudflare steps).
-- ============================================================================
