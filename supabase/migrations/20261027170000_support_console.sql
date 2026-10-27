-- Support console (2026-10-27) — docs/verification/org-verification.md
-- "Next, when there is a support team": one place for SportnNote support to
-- work through the queues, so more than one person can share them.
--
-- 1. support_claims — "✋ I'll check this" on an organisation or an age proof,
--    so two people don't check the same one. A claim lasts 2 hours, can be
--    taken over (on purpose), and is released when the decision is made.
-- 2. claim_support_item / release_support_item — the only way to claim.
-- 3. guard_org_decision_claim — the server, not just the app, refuses an
--    organisation decision while someone else's claim is fresh, and a second
--    decision a few minutes after someone else's (two people pressing at once).
--    Age proofs: the verification-review function checks the same claim (and
--    already refuses a second decision).
-- 4. support_overview() — what's waiting (count, oldest, over a day) in each
--    queue, the live claims, and this week's reviews per person.
--
-- Idempotent — safe to re-run. No change to existing rows.

-- ---------- 1. Claims --------------------------------------------------------
create table if not exists support_claims (
  kind       text not null check (kind in ('org', 'age')),
  ref_id     uuid not null,
  claimed_by uuid not null references profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table support_claims enable row level security;
-- no policies: read and written only through the functions below

-- The name support sees for a colleague (their player name, else their account's).
create or replace function support_staff_name(p_profile uuid)
  returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pl.full_name from players pl where pl.profile_id = p_profile and coalesce(pl.full_name, '') <> '' limit 1),
    (select pr.full_name from profiles pr where pr.id = p_profile),
    'Support');
$$;
revoke all on function support_staff_name(uuid) from public, anon, authenticated;

-- Who may work a queue: organisations are support only; age proofs also the
-- reviewers support appoints (is_verification_reviewer).
create or replace function can_review_kind(p_kind text)
  returns boolean language sql stable security definer set search_path = public as $$
  select case p_kind when 'org' then is_support() when 'age' then is_verification_reviewer() else false end;
$$;
revoke all on function can_review_kind(text) from public, anon;
grant execute on function can_review_kind(text) to authenticated;

-- ---------- 2. Claim / release -----------------------------------------------
create or replace function claim_support_item(p_kind text, p_ref uuid, p_take_over boolean default false)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c support_claims;
begin
  if auth.uid() is null or not can_review_kind(p_kind) then
    raise exception 'Only SportnNote support can claim this' using errcode = '42501';
  end if;
  select * into c from support_claims where kind = p_kind and ref_id = p_ref;
  if found and c.claimed_by <> auth.uid() and c.claimed_at > now() - interval '2 hours' and not coalesce(p_take_over, false) then
    raise exception 'Being checked by %', support_staff_name(c.claimed_by) using errcode = '55P03';
  end if;
  insert into support_claims (kind, ref_id, claimed_by, claimed_at)
  values (p_kind, p_ref, auth.uid(), now())
  on conflict (kind, ref_id) do update set claimed_by = excluded.claimed_by, claimed_at = excluded.claimed_at;
  return jsonb_build_object('kind', p_kind, 'ref', p_ref, 'by', auth.uid(), 'byName', support_staff_name(auth.uid()), 'at', now());
end $$;
revoke all on function claim_support_item(text, uuid, boolean) from public, anon;
grant execute on function claim_support_item(text, uuid, boolean) to authenticated;

create or replace function release_support_item(p_kind text, p_ref uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not can_review_kind(p_kind) then
    raise exception 'Only SportnNote support can release this' using errcode = '42501';
  end if;
  delete from support_claims where kind = p_kind and ref_id = p_ref and (claimed_by = auth.uid() or is_support());
end $$;
revoke all on function release_support_item(text, uuid) from public, anon;
grant execute on function release_support_item(text, uuid) to authenticated;

-- ---------- 3. Organisation decisions respect claims --------------------------
create or replace function guard_org_decision_claim()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  c support_claims;
begin
  -- only a decision (decide_org_verification stamps reviewed_at)
  if new.reviewed_at is not distinct from old.reviewed_at then return new; end if;
  select * into c from support_claims where kind = 'org' and ref_id = new.org_id;
  if found and auth.uid() is not null and c.claimed_by <> auth.uid() and c.claimed_at > now() - interval '2 hours' then
    raise exception 'Being checked by % — take it over first', support_staff_name(c.claimed_by) using errcode = '55P03';
  end if;
  if auth.uid() is not null and old.status in ('approved', 'rejected') and old.reviewed_at > now() - interval '10 minutes'
     and old.reviewed_by is distinct from auth.uid() then
    raise exception 'Already decided by % a moment ago', support_staff_name(old.reviewed_by) using errcode = '55P03';
  end if;
  delete from support_claims where kind = 'org' and ref_id = new.org_id;
  return new;
end $$;

drop trigger if exists guard_org_decision_claim on org_verifications;
create trigger guard_org_decision_claim before update of reviewed_at on org_verifications
  for each row execute function guard_org_decision_claim();

-- ---------- 4. The console's overview ------------------------------------------
create or replace function support_overview()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  staff boolean := is_support();
  week_ms numeric := extract(epoch from now() - interval '7 days') * 1000;
  day_ms numeric := extract(epoch from now() - interval '1 day') * 1000;
begin
  if auth.uid() is null or not is_verification_reviewer() then
    raise exception 'Only SportnNote support can open the console' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'orgs', case when staff then (
      select jsonb_build_object('waiting', count(*), 'oldest', min(submitted_at),
                                'overDay', count(*) filter (where submitted_at < now() - interval '1 day'))
        from org_verifications where status = 'pending') end,
    'age', (
      select jsonb_build_object('waiting', count(*), 'oldest', min(sub), 'overDay', count(*) filter (where sub < day_ms))
        from (select case when verification->>'submittedAt' ~ '^[0-9]+(\.[0-9]+)?$' then (verification->>'submittedAt')::numeric end as sub
                from players where verification->>'status' = 'pending') a),
    'reports', case when staff then (
      select jsonb_build_object('waiting', count(*), 'oldest', min(created_at),
                                'overDay', count(*) filter (where created_at < now() - interval '1 day'))
        from message_reports where status = 'open') end,
    'claims', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref_id, 'by', claimed_by,
                                                   'byName', support_staff_name(claimed_by), 'at', claimed_at)
                                order by claimed_at), '[]'::jsonb)
        from support_claims
       where claimed_at > now() - interval '2 hours' and (kind = 'age' or staff)),
    'week', case when staff then (
      with decided as (
        select case when e->>'by' ~* '^[0-9a-f-]{36}$' then (e->>'by')::uuid end as who, 'org' as k
          from org_verifications v, jsonb_array_elements(case when jsonb_typeof(v.history) = 'array' then v.history else '[]'::jsonb end) e
         where e->>'action' in ('approved', 'rejected') and v.updated_at > now() - interval '7 days'
           and (case when e->>'at' ~ '^[0-9]{4}-' then (e->>'at')::timestamptz end) > now() - interval '7 days'
        union all
        select pl.profile_id, 'age'
          from players p
          cross join jsonb_array_elements(case when jsonb_typeof(p.verification->'history') = 'array' then p.verification->'history' else '[]'::jsonb end) e
          left join players pl on pl.id::text = e->>'byId'
         where e->>'action' in ('approved', 'rejected')
           and (case when e->>'at' ~ '^[0-9]+(\.[0-9]+)?$' then (e->>'at')::numeric end) > week_ms
        union all
        select resolved_by, 'report' from message_reports
         where resolved_at > now() - interval '7 days' and resolved_by is not null
      ), per as (
        select who, count(*) filter (where k = 'org') as orgs, count(*) filter (where k = 'age') as age,
               count(*) filter (where k = 'report') as reports
          from decided group by who
      )
      select coalesce(jsonb_agg(jsonb_build_object('by', who, 'name', case when who is null then 'Unknown' else support_staff_name(who) end,
                                                   'orgs', orgs, 'age', age, 'reports', reports)
                                order by orgs + age + reports desc), '[]'::jsonb)
        from per) end
  );
end $$;
revoke all on function support_overview() from public, anon;
grant execute on function support_overview() to authenticated;
