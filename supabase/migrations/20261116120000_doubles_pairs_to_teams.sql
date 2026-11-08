-- Teams for doubles, phase 6 (docs/product/teams-for-doubles.md,
-- docs/security/breaks/pairs-to-teams.md DP1–DP9): every existing doubles pair
-- becomes a team. The two-person quick-game sides of the same two players, in
-- any doubles sport, join one club (one team, any sport) and both players become
-- its admins, so either can rename it or add people.
--
-- Only club_id and admin_ids change on the team rows. Name, entry_ids, adhoc,
-- roster, matches and tournament entries stay as they are (DP5), and nothing is
-- deleted. Safe to run again (DP6). Run it in the SQL editor as one script: no
-- begin / commit.

create or replace function pairs_to_teams()
  returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_club uuid;
  v_name text;
  v_short text;
  n integer := 0;
begin
  for r in
    select t.id, t.name, t.color_hex, t.created_by, x.a, x.b
      from teams t
      cross join lateral (
        select min(v) as a, max(v) as b, count(*) as total, count(distinct v) as uniq,
               count(*) filter (where v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as bad
          from jsonb_array_elements_text(case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as e(v)
      ) x
     where t.adhoc is true
       and t.club_id is null                                                   -- DP6
       and t.sport = any (array['tennis', 'badminton', 'padel', 'squash', 'tabletennis', 'pickleball', 'carrom', 'pool', 'snooker', 'billiards']::text[])  -- DP1
       and x.total = 2 and x.uniq = 2 and x.bad = 0                            -- DP7
       and exists (select 1 from players p where p.id = x.a::uuid)
       and exists (select 1 from players p where p.id = x.b::uuid)
     order by t.created_at, t.id
  loop
    -- DP2 / DP6: the pair's team from an earlier row (or run). That is a club whose
    -- members are exactly these two admins, never a bigger club they are part of.
    select c.club_id into v_club
      from club_members c
     group by c.club_id
    having count(*) = 2
       and bool_and(c.role = 'admin')
       and bool_and(c.player_id in (r.a::uuid, r.b::uuid))
       and exists (select 1 from teams t2 where t2.club_id = c.club_id and t2.adhoc is true)
     order by c.club_id
     limit 1;

    if v_club is null then
      -- DP3: the stored name, which entry_names already masked, masked again
      -- in case it was stored before masking existed. Never rebuilt from full names.
      v_name := mask_minor_names(regexp_replace(trim(coalesce(nullif(r.name, ''), 'Team')), '\s+', ' ', 'g'), array[r.a::uuid, r.b::uuid]);
      select coalesce(nullif(upper(left(string_agg(left(w, 1), '' order by o), 4)), ''), 'TM') into v_short
        from regexp_split_to_table(v_name, '\s+') with ordinality as s(w, o)
       where w ~ '^[[:alpha:]]';
      insert into clubs (name, short_name, color_hex, created_by)
      values (v_name, v_short, r.color_hex, (select p.id from profiles p where p.id = r.created_by))
      returning id into v_club;
      -- DP4: both players are admins
      insert into club_members (club_id, player_id, role)
      values (v_club, r.a::uuid, 'admin'), (v_club, r.b::uuid, 'admin')
      on conflict (club_id, player_id) do update set role = 'admin';
    end if;

    -- DP4 / DP5: join the club; both players manage the sport row too. The
    -- captain, vice-captain and anyone already an admin stay.
    update teams t
       set club_id = v_club,
           admin_ids = coalesce(t.admin_ids, '{}'::uuid[])
             || array(select u from unnest(array[r.a::uuid, r.b::uuid]) u where not (u = any (coalesce(t.admin_ids, '{}'::uuid[]))))
     where t.id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- DP8: never callable from the app
revoke all on function pairs_to_teams() from public, anon, authenticated;

select pairs_to_teams();
