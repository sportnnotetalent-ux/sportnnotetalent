-- ============================================================================
--  Anti-scraping hardening (founder, 2026-10-25 — "hard to copy"; follows
--  docs/security/api-exposure-audit-2026-10-24.md). Runbook:
--  docs/security/anti-scraping.md.
--
--  1. API gate — a PostgREST pre-request check on every REST / RPC call:
--     refuses (HTTP 403) callers on the blocklist — an IP address, an account,
--     or a User-Agent pattern (seeded with common scraping tools: python
--     requests, curl, wget, Scrapy …; never browsers, the Android app (okhttp),
--     Deno edge functions or Node). service_role and the API's root (its
--     description, no data) are never blocked.
--     It FAILS OPEN: any error inside the check lets the request through, so the
--     gate can never take the app down. Off switch: api_gate_settings.enabled.
--     (GET requests run read-only, so the database can't count them for rate
--     limits — blocking is how we act on what the weekly numbers / logs show.)
--  2. api_whoami() — the IP / User-Agent / role the API sees for the caller,
--     to check the gate and to find your own IP before blocking someone.
--  3. Trap records — three adult "players" and one team that don't exist,
--     with unique names. If they ever show up in another app or dataset, it
--     was copied from SportnNote. Listed in the private canary_records table.
--  4. api_traffic_report() — API requests by role since the last report (from
--     pg_stat_statements) and the most-read tables, for the weekly email.
--
--  Run order: everything below, then step 5 turns the gate on (and is the
--  one line to undo).
-- ============================================================================

-- ---------- 1. Blocklist + settings (private: no client access) -------------
create table if not exists api_blocklist (
  id bigint generated always as identity primary key,
  -- 'ip' = exact client IP; 'user' = auth user id (profiles.id);
  -- 'agent' = case-insensitive regex on the User-Agent header
  kind text not null check (kind in ('ip', 'user', 'agent')),
  value text not null check (length(value) between 1 and 200),
  reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (kind, value)
);
alter table api_blocklist enable row level security;
revoke all on api_blocklist from anon, authenticated;

-- A broken regex would make every agent check error (the gate fails open, so
-- nothing would be blocked): refuse it when it's added.
create or replace function api_blocklist_validate()
  returns trigger language plpgsql as $$
begin
  if new.kind = 'agent' then
    perform '' ~* new.value;
  end if;
  new.value := trim(new.value);
  return new;
end $$;
drop trigger if exists api_blocklist_validate on api_blocklist;
create trigger api_blocklist_validate before insert or update on api_blocklist
  for each row execute function api_blocklist_validate();

create table if not exists api_gate_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true
);
alter table api_gate_settings enable row level security;
revoke all on api_gate_settings from anon, authenticated;
insert into api_gate_settings (id, enabled) values (true, true) on conflict (id) do nothing;

-- Common scraping tools. Not blocked: browsers, okhttp (the Android app),
-- Deno (edge functions), node / undici (could be our own tooling), and Go /
-- Java clients (Supabase's own infrastructure may use them). Add more rows any
-- time; delete a row to stop blocking it.
insert into api_blocklist (kind, value, reason) values
  ('agent', '^python-requests/', 'scraping tool'),
  ('agent', '^python-urllib', 'scraping tool'),
  ('agent', '^python-httpx/', 'scraping tool'),
  ('agent', 'aiohttp/', 'scraping tool'),
  ('agent', 'scrapy', 'scraping tool'),
  ('agent', '^curl/', 'scraping tool'),
  ('agent', '^wget/', 'scraping tool'),
  ('agent', '^libwww-perl/', 'scraping tool')
on conflict (kind, value) do nothing;

-- ---------- 2. The gate ------------------------------------------------------
create or replace function api_gate()
  returns void language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb;
  hdr jsonb;
  ip text;
  ua text;
  uid text;
  hit text;
begin
  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    if claims->>'role' = 'service_role' then return; end if;
    if not coalesce((select enabled from api_gate_settings where id), false) then return; end if;
    if coalesce(current_setting('request.path', true), '/') in ('', '/') then return; end if;
    hdr := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    ip := nullif(trim(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-real-ip', split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1))), '');
    ua := coalesce(hdr->>'user-agent', '');
    uid := claims->>'sub';
    select b.kind into hit
      from api_blocklist b
     where (b.expires_at is null or b.expires_at > now())
       and (   (b.kind = 'ip' and b.value = ip)
            or (b.kind = 'user' and b.value = uid)
            or (b.kind = 'agent' and ua ~* b.value))
     limit 1;
  exception when others then
    hit := null;  -- fail open: a problem in the check never blocks the app
  end;
  if hit is not null then
    raise sqlstate 'PT403' using
      message = 'Automated or bulk access to SportnNote isn''t allowed (see the Terms of Service). If this is a mistake, write to support@sportnnote.in.',
      hint = hit;
  end if;
end $$;
revoke all on function api_gate() from public;
grant execute on function api_gate() to anon, authenticated, service_role;

-- What the API sees for the caller (their own IP and User-Agent only).
create or replace function api_whoami()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  hdr jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
begin
  return jsonb_build_object(
    'ip', nullif(trim(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-real-ip', split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1))), ''),
    'userAgent', hdr->>'user-agent',
    'role', claims->>'role',
    'userId', claims->>'sub',
    'gate', coalesce((select enabled from api_gate_settings where id), false));
end $$;
revoke all on function api_whoami() from public;
grant execute on function api_whoami() to anon, authenticated;

-- ---------- 3. Trap records ----------------------------------------------------
create table if not exists canary_records (
  table_name text not null,
  record_id uuid not null,
  fingerprint text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (table_name, record_id)
);
alter table canary_records enable row level security;
revoke all on canary_records from anon, authenticated;

-- Adults with no contact details, no matches and no children involved; dated
-- before launch so they never count as "new" in the weekly numbers.
insert into players (id, full_name, jersey_no, sports, dob, gender, findable_by_contact, created_at)
values
  ('fd1e5331-f9c9-4620-8d7a-a0f0ff4ffbf0', 'Ojasvin Talluri', 47, array['football'], '1995-08-19', 'Male', false, '2026-06-21 09:14:00+05:30'),
  ('f55aa8b6-e56c-4d9e-98b1-add3cafa9a30', 'Ruthvel Kandregula', 8, array['football'], '1993-02-11', 'Male', false, '2026-06-21 09:16:00+05:30'),
  ('25c4d582-36e3-439a-a1da-973634c1fbb2', 'Sahasra Pennada', 23, array['football'], '1997-11-30', 'Female', false, '2026-06-21 09:17:00+05:30')
on conflict (id) do nothing;

insert into teams (id, name, short_name, sport, color_hex, roster, created_at)
values ('e5909c61-c7ff-41ef-bf5c-5d4f9da65b46', 'Kondapur Kestrels FC', 'KKF', 'football', '#2E6F95',
        '["fd1e5331-f9c9-4620-8d7a-a0f0ff4ffbf0", "f55aa8b6-e56c-4d9e-98b1-add3cafa9a30", "25c4d582-36e3-439a-a1da-973634c1fbb2"]'::jsonb,
        '2026-06-21 09:20:00+05:30')
on conflict (id) do nothing;

insert into canary_records (table_name, record_id, fingerprint, note) values
  ('players', 'fd1e5331-f9c9-4620-8d7a-a0f0ff4ffbf0', 'Ojasvin Talluri #47', 'trap record — not a real person'),
  ('players', 'f55aa8b6-e56c-4d9e-98b1-add3cafa9a30', 'Ruthvel Kandregula #8', 'trap record — not a real person'),
  ('players', '25c4d582-36e3-439a-a1da-973634c1fbb2', 'Sahasra Pennada #23', 'trap record — not a real person'),
  ('teams', 'e5909c61-c7ff-41ef-bf5c-5d4f9da65b46', 'Kondapur Kestrels FC (KKF, #2E6F95)', 'trap record — not a real team')
on conflict (table_name, record_id) do nothing;

-- ---------- 4. Weekly API traffic numbers ------------------------------------
create table if not exists api_traffic_snapshots (
  taken_at timestamptz not null,
  role text not null,
  queryid bigint not null,
  calls bigint not null,
  label text,
  primary key (taken_at, role, queryid)
);
alter table api_traffic_snapshots enable row level security;
revoke all on api_traffic_snapshots from anon, authenticated;

-- Requests (PostgREST runs one set_config statement per request) and the most
-- read tables / functions, for anon and authenticated, since the last saved
-- snapshot. p_save = false: look without saving (read-only).
create or replace function api_traffic_report(p_save boolean default true)
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  last_at timestamptz;
  prev_at timestamptz;
  since timestamptz;
  result jsonb;
begin
  select max(taken_at) into last_at from api_traffic_snapshots;
  select max(taken_at) into prev_at from api_traffic_snapshots where taken_at < last_at;
  select coalesce(last_at, (select stats_reset from extensions.pg_stat_statements_info)) into since;

  create temp table if not exists _api_cur (role text, queryid bigint, calls bigint, label text) on commit drop;
  truncate _api_cur;
  insert into _api_cur
  select r.rolname, s.queryid, sum(s.calls)::bigint,
         case when min(s.query) like 'select set_config(%' then 'requests'
              else coalesce(substring(min(s.query) from 'FROM "public"\."([A-Za-z0-9_]+)"'), '') end
    from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid
   where r.rolname in ('anon', 'authenticated')
   group by r.rolname, s.queryid;

  with req as (
    select x.role,
           (select coalesce(sum(calls), 0) from _api_cur c where c.role = x.role and c.label = 'requests') as now_n,
           (select coalesce(sum(calls), 0) from api_traffic_snapshots t where t.taken_at = last_at and t.role = x.role and t.label = 'requests') as last_n,
           (select coalesce(sum(calls), 0) from api_traffic_snapshots t where t.taken_at = prev_at and t.role = x.role and t.label = 'requests') as prev_n
      from (values ('anon'), ('authenticated')) x(role)
  ),
  tops as (
    select c.role, c.label, sum(case when c.calls >= coalesce(t.calls, 0) then c.calls - coalesce(t.calls, 0) else c.calls end) as n
      from _api_cur c
      left join api_traffic_snapshots t on t.taken_at = last_at and t.role = c.role and t.queryid = c.queryid
     where c.label not in ('', 'requests')
     group by c.role, c.label
  )
  select jsonb_build_object(
    'since', since,
    'reset', exists (select 1 from req where last_at is not null and now_n < last_n),
    'requests', (select jsonb_object_agg(role, jsonb_build_object(
                    'thisPeriod', case when last_at is null or now_n < last_n then now_n else now_n - last_n end,
                    'previousPeriod', case when prev_at is null then null when last_n < prev_n then last_n else last_n - prev_n end))
                   from req),
    'topTables', (select jsonb_object_agg(role, items) from (
                    select role, jsonb_agg(jsonb_build_object('table', label, 'reads', n) order by n desc) as items
                      from (select role, label, n, row_number() over (partition by role order by n desc) as rk from tops where n > 0) z
                     where rk <= 6 group by role) y))
    into result;

  if p_save then
    insert into api_traffic_snapshots (taken_at, role, queryid, calls, label)
    select now(), role, queryid, calls, label from _api_cur
    on conflict do nothing;
    delete from api_traffic_snapshots where taken_at < now() - interval '120 days';
  end if;
  return result;
end $$;
revoke all on function api_traffic_report(boolean) from public, anon, authenticated;
grant execute on function api_traffic_report(boolean) to service_role;

-- ---------- 5. Turn the gate on --------------------------------------------
-- Undo instantly:  alter role authenticator reset pgrst.db_pre_request;
--                  notify pgrst, 'reload config';
-- Pause without undoing:  update api_gate_settings set enabled = false;
alter role authenticator set pgrst.db_pre_request = 'public.api_gate';
notify pgrst, 'reload config';
