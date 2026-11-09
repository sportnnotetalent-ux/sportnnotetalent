-- Talent foundations — schools, licences, memberships with Talent roles, seat
-- caps, the phone allow-list and attach-on-first-login.
-- Spec: docs/talent/schema-foundations.md. Breaks fixed: docs/security/breaks/talent-foundations.md.
-- Tests: tests/db-talent-foundations.test.mts, tests/sim-talent-foundations.test.mts.
--
-- Adds four tables and their functions on top of the SportnNote schema; changes
-- no existing table or function. A Talent school is an organizations row of type
-- 'School'. A Talent student is NOT a SportnNote players row (TF1–TF4, TF15):
-- name, DOB and gender live on talent_students, so only the rules below decide
-- who sees a child. Clients never write talent_* rows directly: every write goes
-- through the security definer functions below, and the caps are triggers so
-- they hold for every write path (service role included).
--
-- Idempotent: safe to run again.

-- ---------- 1. Tables -----------------------------------------------------------
create table if not exists talent_schools (
  org_id           uuid primary key references organizations(id) on delete cascade,
  student_licences int  not null default 0 check (student_licences >= 0),
  staff_seats      int  not null default 10 check (staff_seats >= 0),
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table if not exists talent_memberships (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references talent_schools(org_id) on delete cascade,
  phone        text not null,
  role         text not null check (role in ('org_leader', 'admin', 'organizer', 'scorer', 'parent')),
  display_name text check (char_length(display_name) <= 200),
  email        text check (char_length(email) <= 320),
  profile_id   uuid references profiles(id) on delete set null,
  added_by     uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid references profiles(id) on delete set null
);
create unique index if not exists talent_memberships_active_role
  on talent_memberships (school_id, phone, role) where removed_at is null;
create index if not exists talent_memberships_phone on talent_memberships (phone) where removed_at is null;
create index if not exists talent_memberships_profile on talent_memberships (profile_id) where removed_at is null;

create table if not exists talent_students (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references talent_schools(org_id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 1 and 200),
  dob        date not null,
  gender     text check (char_length(gender) <= 40),
  class      text check (char_length(class) <= 40),
  section    text check (char_length(section) <= 40),
  added_by   uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists talent_students_school on talent_students (school_id);

create table if not exists talent_student_guardians (
  student_id    uuid not null references talent_students(id) on delete cascade,
  membership_id uuid not null references talent_memberships(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (student_id, membership_id)
);
create index if not exists talent_student_guardians_membership on talent_student_guardians (membership_id);

-- ---------- 2. Helpers ----------------------------------------------------------
-- The caller's sign-in number as SMS confirmed it (auth.users), in E.164. Supabase
-- stores it as full international digits without '+', so this never guesses a
-- country (TF6). Null when not confirmed.
create or replace function talent_my_phone()
  returns text language sql stable security definer set search_path = public as $$
  select '+' || regexp_replace(u.phone, '\D', '', 'g')
    from auth.users u
   where u.id = auth.uid() and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';
$$;

-- Does the caller hold one of these roles, active, at this school — with the
-- number the membership was given still being their sign-in number (TF9)?
create or replace function talent_has_role(p_school uuid, p_roles text[])
  returns boolean language sql stable security definer set search_path = public as $$
  select p_school is not null and auth.uid() is not null and exists (
    select 1 from talent_memberships m
     where m.school_id = p_school and m.profile_id = auth.uid() and m.phone = talent_my_phone()
       and m.removed_at is null and m.role = any(p_roles));
$$;

create or replace function talent_is_manager(p_school uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select is_support() or talent_has_role(p_school, array['org_leader', 'admin']);
$$;

-- Is this student linked to one of the caller's active parent memberships?
-- (security definer, so the students and guardians policies don't recurse)
create or replace function talent_is_my_child(p_student uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from talent_student_guardians g
      join talent_memberships m on m.id = g.membership_id
     where g.student_id = p_student and m.profile_id = auth.uid()
       and m.phone = talent_my_phone() and m.removed_at is null);
$$;

create or replace function talent_manages_student(p_student uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from talent_students s where s.id = p_student and talent_is_manager(s.school_id));
$$;

-- Talent numbers are Indian mobiles (TF5): a typo that turns into a foreign
-- number is refused instead of handing a login to a stranger.
create or replace function talent_phone(p text)
  returns text language plpgsql immutable as $$
declare
  k text := phone_key(p);
begin
  if k is null or k !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Not a valid Indian mobile phone number';
  end if;
  return k;
end $$;

-- Free text shown to other people: no control or text-direction characters (TF13).
create or replace function talent_text(p text, p_label text)
  returns text language plpgsql immutable as $$
begin
  if p ~ '[[:cntrl:]‎‏‪-‮⁦-⁩]' then
    raise exception '% contains a character that is not allowed', p_label;
  end if;
  return nullif(btrim(p), '');
end $$;

-- ---------- 3. Caps and integrity (triggers: every write path) -----------------
create or replace function talent_membership_guard()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  s      talent_schools;
  in_use int;
begin
  new.phone := talent_phone(new.phone);
  new.display_name := talent_text(new.display_name, 'Name');
  new.email := lower(talent_text(new.email, 'Email'));
  if new.email is not null and new.email !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[a-z]{2,}$' then
    raise exception 'Not a valid email address';
  end if;
  if tg_op = 'UPDATE' and (new.school_id <> old.school_id or new.role <> old.role) then
    raise exception 'A membership''s school and role cannot change; remove it and add a new one';
  end if;
  -- Caps apply when a membership becomes active (insert, re-activation) or moves
  -- to another number — never on attach or removal, so one school over its cap
  -- can't block a person's login at their other schools (TF8).
  if new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.removed_at is null and new.phone = old.phone then return new; end if;

  -- Lock the school so concurrent adds are counted one at a time.
  select * into s from talent_schools where org_id = new.school_id for update;

  if new.role = 'parent' then
    select count(distinct phone) into in_use from talent_memberships
     where school_id = new.school_id and role = 'parent' and removed_at is null
       and id <> new.id and phone <> new.phone;
    if in_use + 1 > s.student_licences then
      raise exception 'No student licences left for another parent login (% in use)', in_use;
    end if;
  else
    -- Staff seats are per person: a second role for the same phone is free.
    if not exists (select 1 from talent_memberships
                    where school_id = new.school_id and phone = new.phone and role <> 'parent'
                      and removed_at is null and id <> new.id) then
      select count(distinct phone) into in_use from talent_memberships
       where school_id = new.school_id and role <> 'parent' and removed_at is null and id <> new.id;
      if in_use + 1 > s.staff_seats then
        raise exception 'No staff seats left at this school (% of % in use)', in_use, s.staff_seats;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists talent_memberships_guard on talent_memberships;
create trigger talent_memberships_guard before insert or update on talent_memberships
  for each row execute function talent_membership_guard();

create or replace function talent_student_guard()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  s      talent_schools;
  in_use int;
begin
  new.full_name := talent_text(new.full_name, 'Name');
  new.gender := talent_text(new.gender, 'Gender');
  new.class := talent_text(new.class, 'Class');
  new.section := talent_text(new.section, 'Section');
  if new.full_name is null or char_length(new.full_name) > 200 then
    raise exception 'Student name is required (max 200 characters)';
  end if;
  -- School age only (TF3): a typo can't turn a child into an "adult".
  if new.dob is null or new.dob > current_date - interval '2 years' or new.dob < current_date - interval '21 years' then
    raise exception 'A school-age date of birth is required';
  end if;
  if tg_op = 'UPDATE' then
    if new.school_id <> old.school_id then raise exception 'A student''s school cannot change'; end if;
    return new;
  end if;
  select * into s from talent_schools where org_id = new.school_id for update;
  select count(*) into in_use from talent_students where school_id = new.school_id;
  if in_use + 1 > s.student_licences then
    raise exception 'All % student licences are in use', s.student_licences;
  end if;
  return new;
end $$;
drop trigger if exists talent_students_guard on talent_students;
create trigger talent_students_guard before insert or update on talent_students
  for each row execute function talent_student_guard();

create or replace function talent_guardian_guard()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from talent_students s join talent_memberships m on m.school_id = s.school_id
                  where s.id = new.student_id and m.id = new.membership_id and m.role = 'parent') then
    raise exception 'A guardian link needs a parent membership at the student''s school';
  end if;
  return new;
end $$;
drop trigger if exists talent_student_guardians_guard on talent_student_guardians;
create trigger talent_student_guardians_guard before insert or update on talent_student_guardians
  for each row execute function talent_guardian_guard();

-- Licences and seats can't drop below what is in use, by any path (TF19).
create or replace function talent_school_guard()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  students int; parents int; staff int;
begin
  select count(*) into students from talent_students where school_id = new.org_id;
  select count(distinct phone) into parents from talent_memberships where school_id = new.org_id and role = 'parent' and removed_at is null;
  select count(distinct phone) into staff from talent_memberships where school_id = new.org_id and role <> 'parent' and removed_at is null;
  if new.student_licences < greatest(students, parents) then
    raise exception '% licences are in use (% students, % parent logins)', greatest(students, parents), students, parents;
  end if;
  if new.staff_seats < staff then
    raise exception '% staff seats are in use', staff;
  end if;
  return new;
end $$;
drop trigger if exists talent_schools_guard on talent_schools;
create trigger talent_schools_guard before update on talent_schools
  for each row execute function talent_school_guard();

-- ---------- 4. Schools and licences: SportnNote support only -------------------
create or replace function talent_create_school(p_name text, p_student_licences int)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  oid uuid;
begin
  if not is_support() then raise exception 'Only the SportnNote support team can create schools'; end if;
  if coalesce(btrim(p_name), '') = '' or char_length(p_name) > 200 then raise exception 'School name is required (max 200 characters)'; end if;
  if p_student_licences is null or p_student_licences < 0 then raise exception 'Student licences must be 0 or more'; end if;
  perform set_config('app.trusted_rpc', 'on', true);
  insert into organizations (name, type, created_by) values (talent_text(p_name, 'School name'), 'School', auth.uid()) returning id into oid;
  insert into talent_schools (org_id, student_licences, created_by) values (oid, p_student_licences, auth.uid());
  perform set_config('app.trusted_rpc', 'off', true);
  return oid;
end $$;

create or replace function talent_set_licences(p_school uuid, p_student_licences int)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then raise exception 'Only the SportnNote support team can change licences'; end if;
  if p_student_licences is null or p_student_licences < 0 then raise exception 'Student licences must be 0 or more'; end if;
  perform 1 from talent_schools where org_id = p_school for update;
  if not found then raise exception 'No such school'; end if;
  update talent_schools set student_licences = p_student_licences where org_id = p_school;   -- the guard refuses below in-use
end $$;

-- ---------- 5. Staff ------------------------------------------------------------
create or replace function talent_add_member(p_school uuid, p_phone text, p_role text, p_name text, p_email text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  if p_role is null or p_role not in ('org_leader', 'admin', 'organizer', 'scorer') then
    raise exception 'Unknown staff role (parents are added with their child)';
  end if;
  if not exists (select 1 from talent_schools where org_id = p_school) then raise exception 'No such school'; end if;
  if not is_support() then
    if p_role = 'org_leader' then
      if not talent_has_role(p_school, array['org_leader']) then
        raise exception 'Only an Org Leader or the SportnNote team can add an Org Leader';
      end if;
    elsif not talent_has_role(p_school, array['org_leader', 'admin']) then
      raise exception 'Only Org Leaders and Admins can add staff';
    end if;
  end if;
  insert into talent_memberships (school_id, phone, role, display_name, email, added_by)
  values (p_school, p_phone, p_role, p_name, p_email, auth.uid())
  returning id into mid;
  return mid;
end $$;

create or replace function talent_remove_member(p_membership uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  m talent_memberships;
begin
  select * into m from talent_memberships where id = p_membership;
  -- Someone with no role at the school learns nothing about the id (TF16).
  if not found or not (is_support() or talent_has_role(m.school_id, array['org_leader', 'admin', 'organizer', 'scorer', 'parent'])) then
    raise exception 'No such membership';
  end if;
  if m.removed_at is not null then return; end if;
  if not is_support() then
    if m.role = 'org_leader' then
      if m.profile_id is distinct from auth.uid() or m.phone is distinct from talent_my_phone() then
        raise exception 'Only the SportnNote team can remove another Org Leader';
      end if;
    elsif not talent_has_role(m.school_id, array['org_leader', 'admin']) then
      raise exception 'Only Org Leaders and Admins can remove members';
    end if;
  end if;
  -- Serialise with other changes at this school (the last-Org-Leader check).
  perform 1 from talent_schools where org_id = m.school_id for update;
  -- Leaving needs another Org Leader who has actually signed in (TF7).
  if m.role = 'org_leader' and not is_support()
     and not exists (select 1 from talent_memberships
                      where school_id = m.school_id and role = 'org_leader' and removed_at is null
                        and id <> m.id and profile_id is not null) then
    raise exception 'Add another Org Leader (who has signed in) before removing yourself';
  end if;
  update talent_memberships set removed_at = now(), removed_by = auth.uid() where id = m.id;
end $$;

-- ---------- 6. Students and parents ---------------------------------------------
create or replace function talent_add_student(p_school uuid, p_name text, p_dob date, p_gender text,
                                              p_class text, p_section text, p_parent_phone text, p_parent_name text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid; mid uuid; ph text;
begin
  if not exists (select 1 from talent_schools where org_id = p_school) then raise exception 'No such school'; end if;
  if not talent_is_manager(p_school) then raise exception 'Only Org Leaders and Admins can add students'; end if;
  ph := talent_phone(p_parent_phone);
  -- One add at a time per school: the duplicate check below and the caps.
  perform 1 from talent_schools where org_id = p_school for update;

  -- A double submit returns the student already added (TF11).
  select s.id into sid from talent_students s
    join talent_student_guardians g on g.student_id = s.id
    join talent_memberships m on m.id = g.membership_id
   where s.school_id = p_school and lower(s.full_name) = lower(btrim(p_name)) and s.dob = p_dob
     and m.phone = ph and m.removed_at is null
   limit 1;
  if sid is not null then return sid; end if;

  insert into talent_students (school_id, full_name, dob, gender, class, section, added_by)
  values (p_school, p_name, p_dob, p_gender, p_class, p_section, auth.uid()) returning id into sid;

  select id into mid from talent_memberships
   where school_id = p_school and phone = ph and role = 'parent' and removed_at is null;
  if mid is null then
    insert into talent_memberships (school_id, phone, role, display_name, added_by)
    values (p_school, ph, 'parent', p_parent_name, auth.uid()) returning id into mid;
  end if;
  insert into talent_student_guardians (student_id, membership_id) values (sid, mid);
  return sid;
end $$;

-- Removing a student erases the child's details (TF10). A parent with no other
-- child at this school loses the login.
create or replace function talent_remove_student(p_student uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  st talent_students;
begin
  select * into st from talent_students where id = p_student;
  if not found or not talent_is_manager(st.school_id) then raise exception 'No such student'; end if;
  update talent_memberships m set removed_at = now(), removed_by = auth.uid()
   where m.removed_at is null and m.role = 'parent'
     and m.id in (select membership_id from talent_student_guardians where student_id = st.id)
     and not exists (select 1 from talent_student_guardians g
                      where g.membership_id = m.id and g.student_id <> st.id);
  delete from talent_students where id = st.id;
end $$;

-- ---------- 7. Login ------------------------------------------------------------
-- For the phone-login edge function and the sign-up hook only (service role).
create or replace function talent_phone_allowed(p_phone text)
  returns boolean language sql stable security definer set search_path = public as $$
  select phone_key(p_phone) is not null and exists (
    select 1 from talent_memberships where phone = phone_key(p_phone) and removed_at is null);
$$;

-- Link every active, unattached membership with the caller's CONFIRMED sign-in
-- phone (auth.users, set by SMS) to the caller. Never a typed number.
create or replace function talent_attach_me()
  returns int language plpgsql security definer set search_path = public as $$
declare
  ph text := talent_my_phone(); n int;
begin
  if auth.uid() is null or ph is null then return 0; end if;
  update talent_memberships set profile_id = auth.uid()
   where phone = ph and removed_at is null and profile_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 8. Access -----------------------------------------------------------
alter table talent_schools enable row level security;
alter table talent_memberships enable row level security;
alter table talent_students enable row level security;
alter table talent_student_guardians enable row level security;

revoke all on talent_schools, talent_memberships, talent_students, talent_student_guardians from anon, authenticated;
grant select on talent_schools, talent_memberships, talent_students, talent_student_guardians to authenticated;
grant all on talent_schools, talent_memberships, talent_students, talent_student_guardians to service_role;

drop policy if exists talent_schools_read on talent_schools;
create policy talent_schools_read on talent_schools for select to authenticated
  using (is_support() or talent_has_role(org_id, array['org_leader', 'admin', 'organizer', 'scorer', 'parent']));

drop policy if exists talent_memberships_read on talent_memberships;
create policy talent_memberships_read on talent_memberships for select to authenticated
  using ((profile_id = auth.uid() and phone = talent_my_phone()) or talent_is_manager(school_id));

drop policy if exists talent_students_read on talent_students;
create policy talent_students_read on talent_students for select to authenticated
  using (is_support()
         or talent_has_role(school_id, array['org_leader', 'admin', 'organizer', 'scorer'])
         or talent_is_my_child(id));

drop policy if exists talent_student_guardians_read on talent_student_guardians;
create policy talent_student_guardians_read on talent_student_guardians for select to authenticated
  using (exists (select 1 from talent_memberships m
                  where m.id = membership_id and m.profile_id = auth.uid() and m.phone = talent_my_phone() and m.removed_at is null)
         or talent_manages_student(student_id));

-- Functions: signed-in callers for the RPCs (each checks its own rules); the
-- allow-list is server-only so it can't be used to probe numbers.
revoke all on function talent_my_phone(), talent_has_role(uuid, text[]), talent_is_manager(uuid),
  talent_is_my_child(uuid), talent_manages_student(uuid), talent_phone(text), talent_text(text, text),
  talent_create_school(text, int), talent_set_licences(uuid, int),
  talent_add_member(uuid, text, text, text, text), talent_remove_member(uuid),
  talent_add_student(uuid, text, date, text, text, text, text, text), talent_remove_student(uuid),
  talent_phone_allowed(text), talent_attach_me(),
  talent_membership_guard(), talent_student_guard(), talent_guardian_guard(), talent_school_guard()
  from public, anon, authenticated;
grant execute on function talent_my_phone(), talent_has_role(uuid, text[]), talent_is_manager(uuid),
  talent_is_my_child(uuid), talent_manages_student(uuid),
  talent_create_school(text, int), talent_set_licences(uuid, int),
  talent_add_member(uuid, text, text, text, text), talent_remove_member(uuid),
  talent_add_student(uuid, text, date, text, text, text, text, text), talent_remove_student(uuid),
  talent_attach_me()
  to authenticated;
grant execute on function talent_phone_allowed(text) to service_role;
