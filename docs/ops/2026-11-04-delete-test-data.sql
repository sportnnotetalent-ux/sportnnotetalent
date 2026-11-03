-- Delete the test data (founder, 2026-11-04). Run once in the Supabase SQL editor.
--
-- What goes (exact ids, looked up read-only on 2026-11-04):
--   * 32 matches: every match of the sample football teams Lions, Cheetahs,
--     Tigers, Panthers (21 Aug seed) and of Hrudhay's 5s / 5s Hrudhay, and all
--     matches of the tournament "Test tournamentzzzz".
--   * the 6 teams: Tigers, Panthers, Cheetahs, 5s Hrudhay, Hrudhay's 5s, Lions.
--   * 5 tournaments: Hrudhay's 6 a side test, Annual, Test tournamentzzzz, Local, Hello (all empty once the
--     matches above are gone).
-- Kept: "Hrudhay's 5 a side Hyd Tournament" (not confirmed as test) and
-- "Inter-School Championship 2026" (only its 3 Lions / Cheetahs / Tigers matches go).
--
-- Each match's events, stat lines, squads, lineups and other per-match rows go
-- with it (every table pointing at a match is "on delete cascade", as on 31 Oct).
-- All or nothing: if any count differs from what was found, or a team / tournament
-- is still referenced, the whole block stops and nothing is deleted — send me the
-- message and I'll adjust.

do $$
declare n int;
begin
  with gone as (
    delete from matches where id in (
    '064af8a2-99f8-47d2-8a13-cb51caf3c83a',
    '14622ff6-2f49-40a9-a890-f65eee7b1f4d',
    '1d685702-99b4-44da-b6a0-a32a5c54105e',
    '343c2399-5f73-4636-8335-34808aed1b8b',
    '34640b5f-e356-46eb-a1ce-4d92c65abf3a',
    '387cfa5e-8d21-4578-8eaf-b9841181a626',
    '4e4076fe-35f3-4a31-a7d3-a7ebb3d023af',
    '53b0af58-596e-4ade-9ab5-50777158d694',
    '55e417bb-7f99-4d89-94af-f2dadf569ee0',
    '57e91a23-fafe-4859-9c97-45af3a3b50bb',
    '67c6a91e-0416-473c-a65c-10160f65d7ed',
    '682dbee3-85b0-4995-aeaa-5d1cffe83709',
    '6da23011-61fb-4c24-9a8c-7a29b2924c46',
    '77ff40b3-7f8d-452c-839b-fcc440610c33',
    '780c8906-34f9-400b-beeb-1a875eab09fb',
    '821fd62a-2530-480a-9fa4-76eb97bc7f26',
    '892ab265-8d7b-4a06-9b2f-4b3b1703f8bf',
    '8e3291d9-ed24-4728-a7e2-496fc514036f',
    '8fb35e5a-3427-4f88-949b-f7b43f312e75',
    'ae7012ea-f5a6-456d-9b2c-ff806eae9376',
    'aec08a82-47f0-4a97-8ce6-5b5404394454',
    'b73b2bee-0f75-481e-b590-6d9ca1d306c9',
    'b9aee5c3-afab-453c-9607-0fab7d3afc26',
    'd1d53752-116f-4bf3-a59b-09f9bc0c8c50',
    'd277b914-ce17-4603-8b6d-d27a740f9db1',
    'd4af4c49-1903-4ec3-8bed-b9878a1c1e93',
    'da6ddc1d-30a6-4973-b4af-301013c307db',
    'e8c7b37d-6b39-40da-94a4-588211ea29b6',
    'ebd8d686-57c6-4375-a2c0-da96ce5ccf38',
    'f3a418b6-6641-4f91-91fb-feee1119654d',
    'f673bd50-6cb6-4cc9-8b21-b2dc182189d7',
    'f6d50bfa-c028-4bd1-98d7-33ba4eae3852'
    ) returning id
  ) select count(*) into n from gone;
  if n <> 32 then raise exception 'Expected 32 matches, found %. Nothing deleted.', n; end if;

  if exists (select 1 from matches where tournament_id in ('8b74c920-ce26-4aed-8df5-17e7a597f649', 'f7873e4b-b516-44a1-928d-28d5835fe935', '93ab0ac2-a4a2-4383-a7c1-2f2ed57e399e', 'e8445be2-8903-4473-90a7-2a193e848b94', '1ed0e1b2-891b-458e-af7d-d6a8b0dd26bf')) then
    raise exception 'A test tournament still has other matches. Nothing deleted.';
  end if;
  with gone as (
    delete from tournaments where id in (
    '8b74c920-ce26-4aed-8df5-17e7a597f649',
    'f7873e4b-b516-44a1-928d-28d5835fe935',
    '93ab0ac2-a4a2-4383-a7c1-2f2ed57e399e',
    'e8445be2-8903-4473-90a7-2a193e848b94',
    '1ed0e1b2-891b-458e-af7d-d6a8b0dd26bf'
    ) returning id
  ) select count(*) into n from gone;
  if n <> 5 then raise exception 'Expected 5 tournaments, found %. Nothing deleted.', n; end if;

  if exists (select 1 from matches where home_team_id in ('3e68620d-640b-4735-84a0-29b74a424f78', 'b21c6075-2048-421f-9d18-bf1d7e65c4b7', '06f5224f-9096-40c9-aabd-86f8e734219e', '4c488d97-7412-4a5d-bcd9-c051e3a631ca', '507fdf67-abf0-4f21-b032-743acc5f983f', '982e5bf1-90d7-4298-80b9-c599b73d65ff') or away_team_id in ('3e68620d-640b-4735-84a0-29b74a424f78', 'b21c6075-2048-421f-9d18-bf1d7e65c4b7', '06f5224f-9096-40c9-aabd-86f8e734219e', '4c488d97-7412-4a5d-bcd9-c051e3a631ca', '507fdf67-abf0-4f21-b032-743acc5f983f', '982e5bf1-90d7-4298-80b9-c599b73d65ff')) then
    raise exception 'A test team still has other matches. Nothing deleted.';
  end if;
  with gone as (
    delete from teams where id in (
    '3e68620d-640b-4735-84a0-29b74a424f78',
    'b21c6075-2048-421f-9d18-bf1d7e65c4b7',
    '06f5224f-9096-40c9-aabd-86f8e734219e',
    '4c488d97-7412-4a5d-bcd9-c051e3a631ca',
    '507fdf67-abf0-4f21-b032-743acc5f983f',
    '982e5bf1-90d7-4298-80b9-c599b73d65ff'
    ) returning id
  ) select count(*) into n from gone;
  if n <> 6 then raise exception 'Expected 6 teams, found %. Nothing deleted.', n; end if;

  raise notice 'Deleted 32 matches, 5 tournaments and 6 teams.';
end $$;
