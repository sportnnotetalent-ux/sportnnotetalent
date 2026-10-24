-- ============================================================================
--  QR-verified certificates (founder, 2026-10-25 — "hard to copy": a
--  certificate anyone can check, because the proof lives in SportnNote).
--
--  An organiser issues certificates for a tournament or meet (champions,
--  runners-up, third, awards, medals, participation). Each has a short random
--  code; the printed certificate carries a QR to app.sportnnote.in/c/<code>,
--  where anyone (signed out too) sees whether it's genuine: what was won,
--  where, when, who issued it — and the holder as initials when they're a
--  possible minor (the players_view rule), by name when an adult.
--
--  The table stores no names (player id only). Written only through the
--  functions below; read by the holder, their parent/guardian, the
--  tournament's managers and support. Revoking keeps the row (shows "revoked").
-- ============================================================================

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  player_id uuid not null references players(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete cascade,
  -- 'champion' | 'runner_up' | 'third' | 'award' | 'medal' | 'participation'
  kind text not null check (kind in ('champion', 'runner_up', 'third', 'award', 'medal', 'participation')),
  title text not null check (length(title) between 1 and 80),
  detail text check (detail is null or length(detail) <= 160),
  sport text,
  team_name text check (team_name is null or length(team_name) <= 80),
  event_date date,
  issued_by uuid references profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or length(revoked_reason) <= 200)
);
-- the same achievement isn't issued twice (re-issuing returns the existing codes)
create unique index if not exists certificates_unique_achievement
  on certificates (coalesce(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid), player_id, kind, title, coalesce(detail, ''));
create index if not exists certificates_player on certificates (player_id);
create index if not exists certificates_tournament on certificates (tournament_id);

alter table certificates enable row level security;
revoke all on certificates from anon, authenticated;
grant select on certificates to authenticated;
drop policy if exists certificates_read on certificates;
create policy certificates_read on certificates for select to authenticated using (
  player_id = any(auth_player_ids())
  or exists (select 1 from players p where p.id = certificates.player_id and p.guardian_profile_id = auth.uid())
  or (tournament_id is not null and can_manage_tournament(tournament_id))
  or is_support()
);

-- A short code people can type: 10 characters, no look-alikes (O/0, I/1), ~50 bits.
create or replace function new_certificate_code()
  returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
  i int;
begin
  for i in 0..9 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end $$;
revoke all on function new_certificate_code() from public, anon, authenticated;

-- ---------- Issue (the tournament's managers) ---------------------------------------
-- p_items: [{ playerId, kind, title, detail?, sport?, teamName?, eventDate? }]
create or replace function issue_certificates(p_tournament uuid, p_items jsonb)
  returns table (code text, player_id uuid, kind text, title text, detail text, issued_at timestamptz, revoked_at timestamptz)
  language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  pid uuid;
begin
  if not can_manage_tournament(p_tournament) then
    raise exception 'Only this tournament''s organisers can issue its certificates' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then
    raise exception 'Up to 2,000 certificates at a time';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    pid := json_uuid(it->>'playerId');
    continue when pid is null or not exists (select 1 from players where id = pid);
    continue when coalesce(it->>'kind', '') not in ('champion', 'runner_up', 'third', 'award', 'medal', 'participation');
    continue when coalesce(trim(it->>'title'), '') = '';
    insert into certificates (code, player_id, tournament_id, kind, title, detail, sport, team_name, event_date, issued_by)
    values (new_certificate_code(), pid, p_tournament, it->>'kind', left(trim(it->>'title'), 80),
            nullif(left(trim(coalesce(it->>'detail', '')), 160), ''), nullif(it->>'sport', ''),
            -- a singles / doubles entry's name is the players' names: masked for a possible minor
            nullif(left(mask_minor_names(trim(coalesce(it->>'teamName', '')), array[pid]), 80), ''),
            case when coalesce(it->>'eventDate', '') ~ '^\d{4}-\d{2}-\d{2}' then left(it->>'eventDate', 10)::date end,
            auth.uid())
    on conflict do nothing;
  end loop;
  return query
    select c.code, c.player_id, c.kind, c.title, c.detail, c.issued_at, c.revoked_at
      from certificates c where c.tournament_id = p_tournament
     order by c.kind, c.title, c.issued_at;
end $$;
revoke all on function issue_certificates(uuid, jsonb) from public, anon;
grant execute on function issue_certificates(uuid, jsonb) to authenticated;

-- ---------- Revoke (the tournament's managers, the issuer, support) -----------------
create or replace function revoke_certificate(p_code text, p_reason text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare c certificates;
begin
  select * into c from certificates where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if c.id is null then raise exception 'No certificate with that code'; end if;
  if not (c.issued_by = auth.uid() or (c.tournament_id is not null and can_manage_tournament(c.tournament_id)) or is_support()) then
    raise exception 'Only the organisers who issued it can revoke it' using errcode = '42501';
  end if;
  update certificates set revoked_at = coalesce(revoked_at, now()), revoked_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
   where id = c.id;
end $$;
revoke all on function revoke_certificate(text, text) from public, anon;
grant execute on function revoke_certificate(text, text) to authenticated;

-- ---------- Verify (anyone — the QR page) -------------------------------------------
create or replace function verify_certificate(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c certificates;
  pl players;
  t tournaments;
  issuer text;
begin
  select * into c from certificates where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if c.id is null then return jsonb_build_object('found', false); end if;
  select * into pl from players where id = c.player_id;
  select * into t from tournaments where id = c.tournament_id;
  issuer := coalesce((select o.name from organizations o where o.id = t.host_org_id), nullif(t.host_name, 'You'), 'the organisers');
  return jsonb_build_object(
    'found', true,
    'code', c.code,
    'holder', public_person_name(c.player_id, pl.full_name),
    'kind', c.kind,
    'title', c.title,
    'detail', c.detail,
    'sport', c.sport,
    'teamName', c.team_name,
    'eventDate', c.event_date,
    'tournament', t.name,
    'tournamentId', t.id,
    'issuer', issuer,
    'issuerVerified', exists (select 1 from organizations o where o.id = t.host_org_id and o.verified_at is not null),
    'issuedAt', c.issued_at,
    'revoked', c.revoked_at is not null,
    'revokedReason', c.revoked_reason);
end $$;
revoke all on function verify_certificate(text) from public;
grant execute on function verify_certificate(text) to anon, authenticated;

-- ---------- Mine (the holder; a parent sees their children's) -------------------------
create or replace function my_certificates()
  returns table (code text, player_id uuid, kind text, title text, detail text, sport text, team_name text,
                 event_date date, tournament text, issued_at timestamptz, revoked_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select c.code, c.player_id, c.kind, c.title, c.detail, c.sport, c.team_name, c.event_date, t.name, c.issued_at, c.revoked_at
    from certificates c
    left join tournaments t on t.id = c.tournament_id
   where auth.uid() is not null
     and (c.player_id = any(auth_player_ids())
          or exists (select 1 from players p where p.id = c.player_id and p.guardian_profile_id = auth.uid()))
   order by c.issued_at desc;
$$;
revoke all on function my_certificates() from public, anon;
grant execute on function my_certificates() to authenticated;
