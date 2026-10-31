-- Delete the two old test matches left "live" (founder, 2026-10-31):
-- Lions vs Tigers (live since 22 Aug) and Brazil 5 fc vs Japan 5 fc (live since 26 Sep).
-- Run in the Supabase SQL editor. Their events, stat lines, squads, lineups and
-- other per-match rows go with them (every table that points at a match is
-- "on delete cascade"). The teams themselves are kept.
--
-- The first version matched by team name and found only one: the second match's
-- teams are "Brazil 5 fc" / "Japan 5 fc". The founder's look-up (2026-10-31) gave
-- the two ids; this deletes exactly those, and nothing unless both are still live.

do $$
declare n int;
begin
  with gone as (
    delete from matches
    where id in ('72414a2a-4605-4411-86ba-0885507552c5', '4ad03965-7a65-4302-b3de-0d70af255601')
      and status = 'live'
    returning id
  )
  select count(*) into n from gone;
  if n <> 2 then
    raise exception 'Expected 2 matches, found %. Nothing deleted.', n;
  end if;
  raise notice 'Deleted % matches.', n;
end $$;
