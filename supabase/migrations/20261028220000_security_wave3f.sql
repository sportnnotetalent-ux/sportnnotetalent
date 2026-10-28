-- ============================================================================
--  Security Wave 3F — the Wave 2b follow-ups (founder 2026-10-28: into Wave 3)
--  tests/db-wave3.test.mts · docs/security/breaks/security-wave3.md
--
--  1. "Waiting to confirm" on a team's squad: its managers see which players'
--     sides haven't confirmed the link yet (why they show as initials).
--  2. Declined requests: the player's side sees its "Not us" answers and can
--     undo one (the group may then ask again by adding the player back).
--  3. Report a request: the player's side reports it to support — it also
--     counts as "Not us". Support sees reports with how often that group's
--     creator was reported.
--  (Push alerts for new requests: not built, founder 2026-10-28.)
-- ============================================================================

-- ---------- 1 ------------------------------------------------------------------------------------
create or replace function team_waiting_player_ids(p_team uuid)
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  ids uuid[];
begin
  if auth.uid() is null or not can_manage_team(p_team) then
    raise exception 'Only the team''s managers can see this' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x), '{}') into ids from (
    select unnest(team_player_ids(t)) as x from teams t where t.id = p_team
    union select m.player_id from team_members m where m.team_id = p_team
    union select r.player_id from team_player_roles r where r.team_id = p_team
  ) s
  where x is not null and not member_consented('team', p_team, x);
  return ids;
end $$;
revoke all on function team_waiting_player_ids(uuid) from public, anon;
grant execute on function team_waiting_player_ids(uuid) to authenticated;

-- ---------- 2 ------------------------------------------------------------------------------------
create or replace function my_declined_links()
  returns table (kind text, group_id uuid, group_name text, player_id uuid, player_name text, at timestamptz)
  language sql stable security definer set search_path = public as $$
  select d.kind, d.group_id,
         coalesce(case d.kind when 'team' then (select t.name from teams t where t.id = d.group_id)
                              when 'club' then (select c.name from clubs c where c.id = d.group_id)
                              when 'org' then (select o.name from organizations o where o.id = d.group_id)
                              else (select e.title from field_events e where e.id = d.group_id) end, 'A group'),
         d.player_id, p.full_name, d.at
    from member_link_declines d join players p on p.id = d.player_id
   where auth.uid() is not null and d.player_id = any(player_side_ids(auth.uid()))
   order by d.at desc
   limit 200;
$$;
revoke all on function my_declined_links() from public, anon;
grant execute on function my_declined_links() to authenticated;

create or replace function undo_decline(p_kind text, p_group uuid, p_player uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_player_side(p_player, auth.uid()) then
    raise exception 'Only the player, their parent or the person who added them can undo this' using errcode = '42501';
  end if;
  delete from member_link_declines d where d.kind = p_kind and d.group_id = p_group and d.player_id = p_player;
end $$;
revoke all on function undo_decline(text, uuid, uuid) from public, anon;
grant execute on function undo_decline(text, uuid, uuid) to authenticated;

-- ---------- 3 ------------------------------------------------------------------------------------
create table if not exists link_reports (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('team', 'club', 'org', 'field_event')),
  group_id    uuid not null,
  player_id   uuid references players(id) on delete set null,
  reporter    uuid,
  reason      text check (reason is null or length(reason) <= 300),
  at          timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid
);
create index if not exists link_reports_open_idx on link_reports (at desc) where handled_at is null;
alter table link_reports enable row level security;
revoke all on link_reports from anon, authenticated;   -- report_link / support only

create or replace function report_link(p_kind text, p_group uuid, p_player uuid, p_reason text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_player_side(p_player, auth.uid()) then
    raise exception 'Only the player, their parent or the person who added them can report this' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('team', 'club', 'org', 'field_event') then
    raise exception 'Unknown request' using errcode = '22023';
  end if;
  if not rate_limit_hit('report_link', auth.uid()::text, 20, 86400) then
    raise exception 'Too many reports today — write to support@sportnnote.in' using errcode = '54000';
  end if;
  insert into link_reports (kind, group_id, player_id, reporter, reason)
  values (p_kind, p_group, p_player, auth.uid(), nullif(left(btrim(coalesce(p_reason, '')), 300), ''));
  -- a report is also "Not us"
  if member_link_exists(p_kind, p_group, p_player) then
    perform answer_link(p_kind, p_group, p_player, false);
  else
    insert into member_link_declines (kind, group_id, player_id, by_profile) values (p_kind, p_group, p_player, auth.uid())
    on conflict (kind, group_id, player_id) do nothing;
  end if;
end $$;
revoke all on function report_link(text, uuid, uuid, text) from public, anon;
grant execute on function report_link(text, uuid, uuid, text) to authenticated;

-- Support: open reports, newest first, with the group's creator and how often
-- groups they made were reported.
create or replace function support_link_reports()
  returns table (id uuid, kind text, group_id uuid, group_name text, creator_name text, creator_reports bigint, reason text, at timestamptz)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not is_support() then raise exception 'SportnNote support only' using errcode = '42501'; end if;
  return query
  with r as (
    select lr.*,
           case lr.kind when 'team' then (select t.created_by from teams t where t.id = lr.group_id)
                        when 'club' then (select c.created_by from clubs c where c.id = lr.group_id)
                        when 'org' then (select o.created_by from organizations o where o.id = lr.group_id)
                        else (select e.created_by from field_events e where e.id = lr.group_id) end as creator,
           case lr.kind when 'team' then (select t.name from teams t where t.id = lr.group_id)
                        when 'club' then (select c.name from clubs c where c.id = lr.group_id)
                        when 'org' then (select o.name from organizations o where o.id = lr.group_id)
                        else (select e.title from field_events e where e.id = lr.group_id) end as gname
      from link_reports lr
  )
  select r.id, r.kind, r.group_id, coalesce(r.gname, '(deleted)'), coalesce(pr.full_name, 'Someone'),
         (select count(*) from r r2 where r2.creator is not distinct from r.creator), r.reason, r.at
    from r left join profiles pr on pr.id = r.creator
   where r.handled_at is null
   order by r.at desc
   limit 200;
end $$;
revoke all on function support_link_reports() from public, anon;
grant execute on function support_link_reports() to authenticated;

create or replace function support_handle_link_report(p_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then raise exception 'SportnNote support only' using errcode = '42501'; end if;
  update link_reports set handled_at = now(), handled_by = auth.uid() where id = p_id and handled_at is null;
end $$;
revoke all on function support_handle_link_report(uuid) from public, anon;
grant execute on function support_handle_link_report(uuid) to authenticated;
