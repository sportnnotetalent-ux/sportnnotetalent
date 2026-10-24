-- ============================================================================
--  School hall of fame (founder, 2026-10-25 — "hard to copy": a school's
--  sporting history lives on SportnNote and grows every season).
--
--  A school / club page at app.sportnnote.in/h/<orgId>, year by year:
--    • verified honours — certificates its students earned while members
--      (titles, podiums, medals, awards; revoked / participation left out),
--      marked "school event" when the school hosted it;
--    • honours the school adds itself (past years, outside events) — tagged
--      "Added by the school"; students linked by player id only;
--    • the events it hosted.
--  Private until an Owner / Admin publishes it (then anyone with the link);
--  members always see it. People are returned as player ids — the app shows
--  names through players_view, so a possible minor is initials to the public.
-- ============================================================================

alter table organizations add column if not exists hall_public boolean not null default false;

create table if not exists org_honours (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  year int not null check (year between 1900 and 2100),
  -- 'champion' | 'runner_up' | 'third' | 'medal' | 'award' | 'other'
  kind text not null default 'other' check (kind in ('champion', 'runner_up', 'third', 'medal', 'award', 'other')),
  title text not null check (length(title) between 1 and 120),
  sport text check (sport is null or length(sport) <= 40),
  level text check (level is null or level in ('school', 'zone', 'district', 'state', 'national', 'international')),
  team_label text check (team_label is null or length(team_label) <= 80),
  player_ids uuid[] not null default '{}' check (cardinality(player_ids) <= 60),
  note text check (note is null or length(note) <= 200),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists org_honours_org on org_honours (org_id, year desc);
alter table org_honours enable row level security;
-- Reads and writes only through the functions below.
revoke all on org_honours from anon, authenticated;

-- An active Owner / Admin of the school.
create or replace function hall_editor_or_raise(p_org uuid)
  returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the school''s owners and admins can change its hall of fame' using errcode = '42501';
  end if;
end $$;
revoke all on function hall_editor_or_raise(uuid) from public, anon, authenticated;

-- Publish / unpublish.
create or replace function set_hall_public(p_org uuid, p_public boolean)
  returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform hall_editor_or_raise(p_org);
  update organizations set hall_public = coalesce(p_public, false) where id = p_org;
  return coalesce(p_public, false);
end $$;
revoke all on function set_hall_public(uuid, boolean) from public, anon;
grant execute on function set_hall_public(uuid, boolean) to authenticated;

-- Add (p_id null) or edit an honour the school records itself.
create or replace function save_org_honour(p_org uuid, p_id uuid, p jsonb)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  members uuid[];
  t text; team text; nt text;
  rid uuid;
begin
  perform hall_editor_or_raise(p_org);
  if p_id is not null and not exists (select 1 from org_honours where id = p_id and org_id = p_org) then
    raise exception 'No such honour' using errcode = 'P0002';
  end if;
  -- linked students: the school's members (now or past) only
  select coalesce(array_agg(distinct m.player_id), '{}') into members from org_members m where m.org_id = p_org;
  select coalesce(array_agg(distinct x), '{}') into ids
    from (select json_uuid(v) as x from jsonb_array_elements_text(coalesce(p->'playerIds', '[]'::jsonb)) v) s
   where x is not null and x = any(members);
  if cardinality(ids) > 60 then raise exception 'Up to 60 students per honour'; end if;
  -- a possible minor's full name typed into the text becomes initials
  t := mask_minor_names(nullif(trim(p->>'title'), ''), members);
  team := mask_minor_names(nullif(trim(p->>'teamLabel'), ''), members);
  nt := mask_minor_names(nullif(trim(p->>'note'), ''), members);
  if t is null then raise exception 'Give the honour a title'; end if;
  if coalesce(p->>'year', '') !~ '^\d{4}$' then raise exception 'Pick the year'; end if;
  if p_id is null then
    insert into org_honours (org_id, year, kind, title, sport, level, team_label, player_ids, note, created_by)
    values (p_org, (p->>'year')::int, coalesce(nullif(p->>'kind', ''), 'other'), left(t, 120),
            nullif(p->>'sport', ''), nullif(p->>'level', ''), left(team, 80), ids, left(nt, 200), auth.uid())
    returning id into rid;
  else
    update org_honours set year = (p->>'year')::int, kind = coalesce(nullif(p->>'kind', ''), 'other'), title = left(t, 120),
           sport = nullif(p->>'sport', ''), level = nullif(p->>'level', ''), team_label = left(team, 80),
           player_ids = ids, note = left(nt, 200), updated_at = now()
     where id = p_id
    returning id into rid;
  end if;
  return rid;
end $$;
revoke all on function save_org_honour(uuid, uuid, jsonb) from public, anon;
grant execute on function save_org_honour(uuid, uuid, jsonb) to authenticated;

create or replace function delete_org_honour(p_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from org_honours where id = p_id;
  if o is null then return; end if;
  perform hall_editor_or_raise(o);
  delete from org_honours where id = p_id;
end $$;
revoke all on function delete_org_honour(uuid) from public, anon;
grant execute on function delete_org_honour(uuid) to authenticated;

-- The hall of fame. Anyone when published; else the school's members, its
-- admins and SportnNote support (others get the header only).
create or replace function org_hall_of_fame(p_org uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o organizations;
  can_edit boolean;
  member boolean;
  visible boolean;
  base jsonb;
begin
  select * into o from organizations where id = p_org;
  if o.id is null then return jsonb_build_object('found', false); end if;
  can_edit := auth.uid() is not null and has_org_role(p_org, array['Owner', 'Admin']);
  member := auth.uid() is not null and exists (
    select 1 from org_members m where m.org_id = p_org and m.player_id = any(auth_player_ids()));
  visible := o.hall_public or can_edit or member or (auth.uid() is not null and is_support());
  base := jsonb_build_object(
    'found', true,
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'type', o.type, 'city', o.city,
                              'logoUrl', o.logo_url, 'verified', o.verified_at is not null),
    'public', o.hall_public, 'canEdit', can_edit, 'member', member, 'visible', visible);
  if not visible then return base; end if;
  return base || jsonb_build_object(
    -- certificates its students earned while members of the school
    'certs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', x.kind, 'title', x.title, 'detail', x.detail, 'sport', x.sport, 'teamName', x.team_name,
               'date', x.d, 'tournamentId', x.tournament_id, 'tournament', x.tname, 'home', x.home, 'playerId', x.player_id)
             order by x.d desc)
        from (
          select c.kind, c.title, c.detail, c.sport, c.team_name, c.tournament_id, c.player_id,
                 coalesce(c.event_date, c.issued_at::date) as d, t.name as tname,
                 coalesce(t.host_org_id = p_org, false) as home
            from certificates c
            left join tournaments t on t.id = c.tournament_id
           where c.revoked_at is null and c.kind <> 'participation'
             and (c.tournament_id is null or t.deleted_at is null)
             and exists (
               select 1 from org_members m
                where m.org_id = p_org and m.player_id = c.player_id
                  and (m.since is null or m.since <= coalesce(c.event_date, c.issued_at::date))
                  and (m.until is null or m.until >= coalesce(c.event_date, c.issued_at::date)))
           order by d desc
           limit 3000) x), '[]'::jsonb),
    'manual', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'year', h.year, 'kind', h.kind, 'title', h.title, 'sport', h.sport, 'level', h.level,
               'teamLabel', h.team_label, 'playerIds', to_jsonb(h.player_ids), 'note', h.note)
             order by h.year desc, h.created_at desc)
        from org_honours h where h.org_id = p_org), '[]'::jsonb),
    'hosted', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sports', to_jsonb(t.sports),
                                          'startDate', t.start_date, 'endDate', t.end_date)
             order by t.start_date desc nulls last)
        from tournaments t where t.host_org_id = p_org and t.deleted_at is null), '[]'::jsonb));
end $$;
revoke all on function org_hall_of_fame(uuid) from public;
grant execute on function org_hall_of_fame(uuid) to anon, authenticated;
