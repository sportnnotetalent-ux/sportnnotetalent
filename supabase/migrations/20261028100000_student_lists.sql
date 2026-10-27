-- ============================================================================
--  Student lists: bulk upload by class, section or the whole school, existing
--  students recognised, no duplicates (founder 2026-10-27: 1A, 2A, 3A)
--
--  The school's import (StudentImportScreen) asks the server which rows are
--  students it already has, and which are children already on SportnNote
--  outside the school — the client can't see the second kind, and never will.
--
--  1. org_member_ids: each student's ADMISSION NUMBER at this school — the
--     school's own number (3A: no government IDs). Private to the school's
--     Owners / Admins; one student per number per school.
--  2. org_roster_match(org, rows): for each row of the list, in order —
--       admission number at this school → name (+ date of birth) among this
--       school's members, current or past → first name + a parent's email or
--       phone among them → a child elsewhere on SportnNote with the same name,
--       date of birth AND parent contact.
--     A school member comes back with its id (the school already has it). A
--     child elsewhere comes back only as "parent will be asked": no id, no
--     name, nothing about them (1A).
--  3. Roster invites (org_requests.details: class, House, admission number).
--     org_roster_invite (service role; edge function school-parent-request)
--     invites each child found elsewhere and mints a code that is emailed to
--     the PARENT on file (or to the student, if an adult). The parent approves
--     on a public page (/school-request?c=CODE) — no account needed —
--     through school_request_preview / school_request_decide. Only then does
--     the child join the school's list, in the class the school gave.
--     A child can't accept such an invite for themselves; an adult student
--     can, in the app as before, and the details are applied then too.
--  Students who left (2A) are marked by the school's admins in the app, from
--  the preview, with the existing membership rules (until = today).
-- ============================================================================

-- ---------- 1. Admission numbers -------------------------------------------------
create table if not exists org_member_ids (
  org_id       uuid not null references organizations(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  admission_no text not null check (length(btrim(admission_no)) between 1 and 40),
  updated_at   timestamptz not null default now(),
  primary key (org_id, player_id)
);
create unique index if not exists org_member_ids_admission_uk on org_member_ids (org_id, upper(btrim(admission_no)));
alter table org_member_ids enable row level security;
revoke all on org_member_ids from anon;
drop policy if exists org_member_ids_admins on org_member_ids;
create policy org_member_ids_admins on org_member_ids for all to authenticated
  using (has_org_role(org_id, array['Owner', 'Admin']))
  with check (has_org_role(org_id, array['Owner', 'Admin'])
              and exists (select 1 from org_members m where m.org_id = org_member_ids.org_id and m.player_id = org_member_ids.player_id));

-- ---------- 2. Matching keys -------------------------------------------------------
-- "St. Anne  D'Souza" → "st anne dsouza"
create or replace function roster_name_key(p text)
  returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^[:alnum:][:space:]]', '', 'g'), '\s+', ' ', 'g')), '');
$$;
-- the last 10 digits ("+91 98450 00000" = "098450 00000")
create or replace function roster_phone_key(p text)
  returns text language sql immutable set search_path = public as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 8
              then right(regexp_replace(p, '\D', '', 'g'), 10) end;
$$;
create or replace function roster_email_key(p text)
  returns text language sql immutable set search_path = public as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;
create index if not exists players_roster_key_idx on players (roster_name_key(full_name), dob);

-- Every email / phone that reaches a player's family: the parent on the
-- profile, the child's own, the sign-up copy, the linked parent account.
create or replace function player_contact_keys(p_player uuid)
  returns table(email text, phone text) language sql stable security definer set search_path = public, auth as $$
  select roster_email_key(x.e), roster_phone_key(x.ph)
    from players p
    left join profiles pr on pr.id = p.profile_id
    left join auth.users gu on gu.id = p.guardian_profile_id
    left join auth.users ou on ou.id = p.profile_id
    cross join lateral (values
      (p.guardian->>'email', p.guardian->>'phone'),
      (p.email, p.phone),
      (pr.guardian->>'email', pr.guardian->>'phone'),
      (gu.email, gu.phone),
      (ou.email, ou.phone)) as x(e, ph)
   where p.id = p_player;
$$;
revoke all on function player_contact_keys(uuid) from public, anon, authenticated;

-- Where a school's request about this player goes: the parent for a possible
-- minor, the person themselves for an adult.
create or replace function roster_request_email(p_player uuid)
  returns text language sql stable security definer set search_path = public, auth as $$
  select case
    when player_is_known_adult(p.dob, p.profile_id)
      then coalesce((select u.email from auth.users u where u.id = p.profile_id), nullif(btrim(p.email), ''))
    else coalesce(nullif(btrim(p.guardian->>'email'), ''),
                  (select nullif(btrim(pr.guardian->>'email'), '') from profiles pr where pr.id = p.profile_id),
                  (select u.email from auth.users u where u.id = p.guardian_profile_id))
  end
    from players p where p.id = p_player;
$$;
revoke all on function roster_request_email(uuid) from public, anon, authenticated;

-- ---------- 3. Matching ------------------------------------------------------------
-- Internal: one result per row. kind = member (with player_id) | check (a member
-- with the same name but another date of birth, or several) | parent | unreachable
-- (a child elsewhere; nobody to email) | invited (already asked) | new.
create or replace function org_roster_match_rows(p_org uuid, p_rows jsonb)
  returns table(i int, kind text, player_id uuid, why text, left_school boolean)
  language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  k text;
  fname text;
  d date;
  em text;
  ph text;
  hit record;
  n int;
begin
  for r in
    select x.i as ri, x.name as rname, x.dob as rdob, x.adm as radm, x.email as remail, x.phone as rphone
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(i int, name text, dob text, adm text, email text, phone text)
  loop
    i := r.ri; player_id := null; why := null; left_school := false;
    k := roster_name_key(r.rname);
    fname := split_part(coalesce(k, ''), ' ', 1);
    d := case when r.rdob ~ '^\d{4}-\d{2}-\d{2}$' then r.rdob::date end;
    em := roster_email_key(r.remail);
    ph := roster_phone_key(r.rphone);

    -- a) the admission number at this school
    if nullif(btrim(coalesce(r.radm, '')), '') is not null then
      select a.player_id as pid, m.until into hit
        from org_member_ids a join org_members m on m.org_id = a.org_id and m.player_id = a.player_id
       where a.org_id = p_org and upper(btrim(a.admission_no)) = upper(btrim(r.radm))
       limit 1;
      if found then
        kind := 'member'; player_id := hit.pid; why := 'admission'; left_school := hit.until is not null;
        return next; continue;
      end if;
    end if;
    if k is null then kind := 'new'; return next; continue; end if;

    -- b) the name among this school's members (current first), date of birth agreeing
    select count(*) into n
      from org_members m join players p on p.id = m.player_id
     where m.org_id = p_org and roster_name_key(p.full_name) = k
       and (d is null or p.dob is null or p.dob = d);
    if n = 1 then
      select m.player_id as pid, m.until, (d is not null and p.dob = d) as dob_same into hit
        from org_members m join players p on p.id = m.player_id
       where m.org_id = p_org and roster_name_key(p.full_name) = k
         and (d is null or p.dob is null or p.dob = d);
      kind := 'member'; player_id := hit.pid; why := case when hit.dob_same then 'name_dob' else 'name' end;
      left_school := hit.until is not null;
      return next; continue;
    elsif n > 1 then
      kind := 'check'; why := 'several'; return next; continue;
    end if;
    select m.player_id as pid, m.until into hit
      from org_members m join players p on p.id = m.player_id
     where m.org_id = p_org and roster_name_key(p.full_name) = k
     order by (m.until is null) desc limit 1;
    if found then
      kind := 'check'; player_id := hit.pid; why := 'dob_differs'; left_school := hit.until is not null;
      return next; continue;
    end if;

    -- c) first name + a parent's email or phone, among this school's members
    if em is not null or ph is not null then
      select m.player_id as pid, m.until into hit
        from org_members m join players p on p.id = m.player_id
       where m.org_id = p_org and split_part(coalesce(roster_name_key(p.full_name), ''), ' ', 1) = fname
         and exists (select 1 from player_contact_keys(p.id) c where (em is not null and c.email = em) or (ph is not null and c.phone = ph))
       order by (m.until is null) desc limit 1;
      if found then
        kind := 'member'; player_id := hit.pid; why := 'contact'; left_school := hit.until is not null;
        return next; continue;
      end if;
    end if;

    -- d) a child elsewhere on SportnNote: same name, same date of birth, same parent contact
    if d is not null and (em is not null or ph is not null) then
      select p.id as pid into hit
        from players p
       where roster_name_key(p.full_name) = k and p.dob = d
         and not exists (select 1 from org_members m where m.org_id = p_org and m.player_id = p.id)
         and exists (select 1 from player_contact_keys(p.id) c where (em is not null and c.email = em) or (ph is not null and c.phone = ph))
       order by p.created_at limit 1;
      if found then
        player_id := hit.pid;
        kind := case
          when exists (select 1 from org_requests q where q.org_id = p_org and q.player_id = hit.pid
                         and q.direction = 'invite' and q.status = 'pending') then 'invited'
          when roster_request_email(hit.pid) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then 'parent'
          else 'unreachable' end;
        why := 'elsewhere';
        return next; continue;
      end if;
    end if;

    kind := 'new';
    return next;
  end loop;
end $$;
revoke all on function org_roster_match_rows(uuid, jsonb) from public, anon, authenticated;

-- The school's call: rows [{i, name, dob, adm, email, phone}] → [{i, kind, playerId?, why, left}].
-- A child elsewhere never comes back with an id.
create or replace function org_roster_match(p_org uuid, p_rows jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['Owner', 'Admin']) then
    raise exception 'Only the school''s owners and admins can do this' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then
    raise exception 'Up to 3,000 students at a time' using errcode = '22023';
  end if;
  if not rate_limit_hit('roster-match', auth.uid()::text, 120, 3600) then
    raise exception 'Too many checks in an hour — try again later' using errcode = '54000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'i', x.i, 'kind', x.kind, 'why', x.why, 'left', x.left_school,
             'playerId', case when x.kind in ('member', 'check') then x.player_id end)) order by x.i)
      from org_roster_match_rows(p_org, p_rows) x), '[]'::jsonb);
end $$;
revoke all on function org_roster_match(uuid, jsonb) from public, anon;
grant execute on function org_roster_match(uuid, jsonb) to authenticated;

-- ---------- 4. Roster invites ---------------------------------------------------------
alter table org_requests add column if not exists details jsonb;

-- One emailed code per roster invite (hashed; 30 days).
create table if not exists org_parent_requests (
  request_id   uuid primary key references org_requests(id) on delete cascade,
  code_hash    text not null unique,
  target_email text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table org_parent_requests enable row level security;
revoke all on org_parent_requests from anon, authenticated;

-- Service role (school-parent-request): invite every child elsewhere in the rows
-- [{i, name, dob, adm, email, phone, standard, house}] for the school's Owner /
-- Admin p_by (a PROFILE id). Returns one item per new invite to email.
create or replace function org_roster_invite(p_org uuid, p_by uuid, p_rows jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  idx constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18];
  by_player uuid;
  org organizations;
  x record;
  rw jsonb;
  req uuid;
  bytes bytea;
  code text;
  j int;
  email text;
  res jsonb := '[]'::jsonb;
begin
  select m.player_id into by_player
    from org_members m join players p on p.id = m.player_id
   where m.org_id = p_org and m.until is null and m.role in ('Owner', 'Admin') and p.profile_id = p_by
   limit 1;
  if by_player is null then raise exception 'Only the school''s owners and admins can do this' using errcode = '42501'; end if;
  select * into org from organizations where id = p_org;
  perform set_config('app.trusted_rpc', 'on', true);
  for x in select * from org_roster_match_rows(p_org, p_rows) where kind = 'parent' loop
    select e into rw from jsonb_array_elements(p_rows) as e where (e->>'i')::int = x.i limit 1;
    insert into org_requests (org_id, player_id, direction, role, status, created_by, message, details)
    values (p_org, x.player_id, 'invite', 'Member', 'pending', by_player,
            left('From ' || org.name || '''s student list' || coalesce(' · ' || nullif(btrim(rw->>'standard'), ''), ''), 200),
            jsonb_strip_nulls(jsonb_build_object(
              'standard', left(nullif(btrim(rw->>'standard'), ''), 40),
              'house', left(nullif(btrim(rw->>'house'), ''), 40),
              'admissionNo', left(nullif(btrim(rw->>'adm'), ''), 40),
              'source', 'student_list')))
    on conflict do nothing
    returning id into req;
    continue when req is null;
    bytes := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
    code := '';
    foreach j in array idx loop code := code || substr(alphabet, (get_byte(bytes, j) % 32) + 1, 1); end loop;
    email := lower(roster_request_email(x.player_id));
    insert into org_parent_requests (request_id, code_hash, target_email, expires_at)
    values (req, encode(sha256(convert_to(code, 'UTF8')), 'hex'), email, now() + interval '30 days');
    res := res || jsonb_build_object(
      'code', code, 'email', email, 'school', org.name,
      'childFirstName', split_part(btrim((select full_name from players where id = x.player_id)), ' ', 1),
      'standard', nullif(btrim(rw->>'standard'), ''),
      'adult', (select player_is_known_adult(p.dob, p.profile_id) from players p where p.id = x.player_id));
    req := null;
  end loop;
  perform set_config('app.trusted_rpc', 'off', true);
  return res;
end $$;
revoke all on function org_roster_invite(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function org_roster_invite(uuid, uuid, jsonb) to service_role;

-- ---------- 5. The parent's page ---------------------------------------------------------
create or replace function school_request_lookup(p_code text)
  returns org_parent_requests language sql stable security definer set search_path = public as $$
  select * from org_parent_requests
   where code_hash = encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;
revoke all on function school_request_lookup(text) from public, anon, authenticated;

create or replace function school_request_preview(p_code text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pr org_parent_requests;
  q org_requests;
begin
  if not rate_limit_hit('school-request', coalesce(auth.uid()::text, 'anon:' || left(p_code, 4)), 60, 3600) then
    raise exception 'Too many tries — wait an hour' using errcode = '54000';
  end if;
  pr := school_request_lookup(p_code);
  if pr.request_id is null then raise exception 'That link or code isn''t valid. Check the email, or ask the school to send it again.'; end if;
  select * into q from org_requests where id = pr.request_id;
  return jsonb_build_object(
    'school', (select name from organizations where id = q.org_id),
    'schoolVerified', (select verified_at is not null from organizations where id = q.org_id),
    'city', (select city from organizations where id = q.org_id),
    'childFirstName', (select split_part(btrim(full_name), ' ', 1) from players where id = q.player_id),
    'standard', q.details->>'standard',
    'house', q.details->>'house',
    'status', case when q.status = 'pending' and pr.expires_at < now() then 'expired' else q.status end,
    'expiresAt', pr.expires_at,
    'adult', (select player_is_known_adult(p.dob, p.profile_id) from players p where p.id = q.player_id));
end $$;
revoke all on function school_request_preview(text) from public;
grant execute on function school_request_preview(text) to anon, authenticated;

create or replace function school_request_decide(p_code text, p_approve boolean)
  returns text language plpgsql security definer set search_path = public as $$
declare
  pr org_parent_requests;
  q org_requests;
  today date := current_date;
begin
  if not rate_limit_hit('school-request', coalesce(auth.uid()::text, 'anon:' || left(p_code, 4)), 60, 3600) then
    raise exception 'Too many tries — wait an hour' using errcode = '54000';
  end if;
  pr := school_request_lookup(p_code);
  if pr.request_id is null then raise exception 'That link or code isn''t valid. Check the email, or ask the school to send it again.'; end if;
  select * into q from org_requests where id = pr.request_id for update;
  if q.status <> 'pending' then return q.status; end if;
  if pr.expires_at < now() then return 'expired'; end if;
  perform set_config('app.trusted_rpc', 'on', true);
  if p_approve then
    insert into org_members (org_id, player_id, role, since, grades, houses)
    values (q.org_id, q.player_id, 'Member', today,
            case when q.details ? 'standard' then jsonb_build_array(jsonb_build_object('standard', q.details->>'standard', 'since', today::text)) else '[]'::jsonb end,
            case when q.details ? 'house' then jsonb_build_array(jsonb_build_object('house', q.details->>'house', 'since', today::text)) else '[]'::jsonb end)
    on conflict (org_id, player_id) do update
      set until = null,
          since = case when org_members.until is null then org_members.since else today end,
          grades = case when excluded.grades = '[]'::jsonb then org_members.grades
                        else (select coalesce(jsonb_agg(case when g->>'until' is null then g || jsonb_build_object('until', today::text) else g end), '[]'::jsonb)
                                from jsonb_array_elements(org_members.grades) g) || excluded.grades end,
          houses = case when excluded.houses = '[]'::jsonb then org_members.houses
                        else (select coalesce(jsonb_agg(case when h->>'until' is null then h || jsonb_build_object('until', today::text) else h end), '[]'::jsonb)
                                from jsonb_array_elements(org_members.houses) h) || excluded.houses end;
    if q.details ? 'admissionNo' then
      insert into org_member_ids (org_id, player_id, admission_no)
      values (q.org_id, q.player_id, q.details->>'admissionNo')
      on conflict do nothing;
    end if;
    update org_requests set status = 'accepted', decided_at = now() where id = q.id;
  else
    update org_requests set status = 'rejected', decided_at = now() where id = q.id;
  end if;
  perform set_config('app.trusted_rpc', 'off', true);
  return case when p_approve then 'accepted' else 'rejected' end;
end $$;
revoke all on function school_request_decide(text, boolean) from public;
grant execute on function school_request_decide(text, boolean) to anon, authenticated;

-- ---------- 6. In the app: details applied; a child doesn't accept for themselves ---------
create or replace function apply_roster_invite_details()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
begin
  select q.details into d from org_requests q
   where q.org_id = new.org_id and q.player_id = new.player_id and q.direction = 'invite'
     and q.status = 'pending' and q.details->>'source' = 'student_list'
   order by q.created_at desc limit 1;
  if d is null then return new; end if;
  if is_client_request() and not has_org_role(new.org_id, array['Owner', 'Admin'])
     and not exists (select 1 from players p where p.id = new.player_id and player_is_known_adult(p.dob, p.profile_id)) then
    raise exception 'A parent or guardian approves this — the school''s request was emailed to them' using errcode = '42501';
  end if;
  if coalesce(jsonb_array_length(new.grades), 0) = 0 and d ? 'standard' then
    new.grades := jsonb_build_array(jsonb_build_object('standard', d->>'standard', 'since', coalesce(new.since, current_date)::text));
  end if;
  if coalesce(jsonb_array_length(new.houses), 0) = 0 and d ? 'house' then
    new.houses := jsonb_build_array(jsonb_build_object('house', d->>'house', 'since', coalesce(new.since, current_date)::text));
  end if;
  return new;
end $$;
drop trigger if exists apply_roster_invite_details on org_members;
create trigger apply_roster_invite_details before insert on org_members
  for each row execute function apply_roster_invite_details();

create or replace function apply_roster_invite_admission()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  adm text;
begin
  select q.details->>'admissionNo' into adm from org_requests q
   where q.org_id = new.org_id and q.player_id = new.player_id and q.direction = 'invite'
     and q.status = 'pending' and q.details->>'source' = 'student_list' and q.details ? 'admissionNo'
   order by q.created_at desc limit 1;
  if adm is not null then
    insert into org_member_ids (org_id, player_id, admission_no) values (new.org_id, new.player_id, adm)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists apply_roster_invite_admission on org_members;
create trigger apply_roster_invite_admission after insert on org_members
  for each row execute function apply_roster_invite_admission();

-- A child can't move the school's invite to "accepted" themselves.
create or replace function guard_roster_invite_answer()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_client_request() and old.direction = 'invite' and old.status = 'pending' and new.status = 'accepted'
     and old.details->>'source' = 'student_list'
     and not exists (select 1 from players p where p.id = old.player_id and player_is_known_adult(p.dob, p.profile_id)) then
    raise exception 'A parent or guardian approves this — the school''s request was emailed to them' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_roster_invite_answer on org_requests;
create trigger guard_roster_invite_answer before update on org_requests
  for each row execute function guard_roster_invite_answer();
