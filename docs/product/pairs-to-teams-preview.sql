-- Read-only preview for supabase/migrations/20261116120000_doubles_pairs_to_teams.sql
-- (teams for doubles, phase 6). Lists every team row the migration will put into a
-- team (club), grouped by pair. Changes nothing.
with rows as (
  select t.id, t.name, t.sport, t.created_at, t.admin_ids, x.a, x.b
    from teams t
    cross join lateral (
      select min(v) as a, max(v) as b, count(*) as total, count(distinct v) as uniq,
             count(*) filter (where v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as bad
        from jsonb_array_elements_text(case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as e(v)
    ) x
   where t.adhoc is true and t.club_id is null
     and t.sport = any (array['tennis', 'badminton', 'padel', 'squash', 'tabletennis', 'pickleball', 'carrom', 'pool', 'snooker', 'billiards']::text[])
     and x.total = 2 and x.uniq = 2 and x.bad = 0
     and exists (select 1 from players p where p.id = x.a::uuid)
     and exists (select 1 from players p where p.id = x.b::uuid)
)
select a || '|' || b as pair,
       (array_agg(name order by created_at, id))[1] as new_team_name,
       string_agg(sport || ': ' || name, '; ' order by created_at, id) as team_rows,
       count(*) as rows
  from rows group by a, b order by new_team_name;
