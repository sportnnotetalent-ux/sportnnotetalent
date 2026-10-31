-- Delete the two old test matches left "live" (founder, 2026-10-31):
-- Lions vs Tigers (live since 22 Aug) and Brazil vs Japan (live since 26 Sep).
-- Run in the Supabase SQL editor. Their events, stat lines, squads, lineups and
-- other per-match rows go with them (every table that points at a match is
-- "on delete cascade"). The teams themselves are kept.

-- 1. Look first: this should list exactly the two matches.
select m.id, m.sport, m.status, m.updated_at, h.name as home, a.name as away
from matches m
join teams h on h.id = m.home_team_id
join teams a on a.id = m.away_team_id
where m.status = 'live'
  and m.updated_at < now() - interval '30 days'
  and ((h.name, a.name) in (('Lions', 'Tigers'), ('Tigers', 'Lions'), ('Brazil', 'Japan'), ('Japan', 'Brazil')));

-- 2. If step 1 showed exactly those two, run this. It deletes the same rows and
--    prints what it removed; it refuses (and changes nothing) unless it is exactly 2.
do $$
declare n int;
begin
  with gone as (
    delete from matches m
    using teams h, teams a
    where h.id = m.home_team_id and a.id = m.away_team_id
      and m.status = 'live'
      and m.updated_at < now() - interval '30 days'
      and ((h.name, a.name) in (('Lions', 'Tigers'), ('Tigers', 'Lions'), ('Brazil', 'Japan'), ('Japan', 'Brazil')))
    returning m.id
  )
  select count(*) into n from gone;
  if n <> 2 then
    raise exception 'Expected 2 matches, found %. Nothing deleted.', n;
  end if;
  raise notice 'Deleted % matches.', n;
end $$;
