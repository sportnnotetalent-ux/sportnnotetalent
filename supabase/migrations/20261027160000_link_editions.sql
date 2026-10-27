-- Link earlier editions (2026-10-27).
--
-- Schools and clubs that ran last year's tournament before "Run it again"
-- existed can link it to this year's, so both pages list every edition. The
-- edition columns stay closed to the app (guard_tournament_edition); this
-- function is the one way to change them after creation:
--
--   link_tournament_edition(p_tournament, p_previous)  — p_previous null = unlink
--
-- Rules (the same as Run it again):
-- * the caller organises BOTH tournaments, so nobody can add their event to
--   someone else's history;
-- * the earlier edition starts before this one, and isn't followed by another
--   live tournament (a series is a single line, no branches);
-- * never a loop: the earlier edition can't be one of this tournament's later
--   editions;
-- * this tournament's later editions move into the series with it
--   (first_edition_id), or become their own series on unlink.
--
-- Also: Run it again now refuses a second next edition of the same tournament
-- (the app already opens the existing one instead).
--
-- Idempotent — safe to re-run. Needs 20261027140000_tournament_editions.

create or replace function guard_tournament_edition()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  prev record;
begin
  if tg_op = 'UPDATE' then
    if is_client_request()
       and (new.previous_edition_id is distinct from old.previous_edition_id
            or new.first_edition_id is distinct from old.first_edition_id) then
      raise exception 'Link editions from the tournament''s Manage tab' using errcode = '42501';
    end if;
    return new;
  end if;

  -- INSERT
  if new.previous_edition_id is null then
    new.first_edition_id := null;
    return new;
  end if;
  select id, start_date, first_edition_id into prev from tournaments where id = new.previous_edition_id;
  if not found then
    raise exception 'The earlier edition wasn''t found' using errcode = '23503';
  end if;
  if is_client_request() and not can_manage_tournament(prev.id) then
    raise exception 'Only the organisers of a tournament can run it again' using errcode = '42501';
  end if;
  if new.start_date is not null and prev.start_date is not null and new.start_date <= prev.start_date then
    raise exception 'The next edition has to start after this one' using errcode = '22023';
  end if;
  if exists (select 1 from tournaments x where x.previous_edition_id = prev.id and x.deleted_at is null) then
    raise exception 'This tournament already has a next edition' using errcode = '23505';
  end if;
  new.first_edition_id := coalesce(prev.first_edition_id, prev.id);
  return new;
end $$;

drop trigger if exists guard_tournament_edition on tournaments;
create trigger guard_tournament_edition before insert or update on tournaments
  for each row execute function guard_tournament_edition();

create or replace function link_tournament_edition(p_tournament uuid, p_previous uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  prev record;
  root uuid;
begin
  select id, start_date into t from tournaments where id = p_tournament and deleted_at is null;
  if not found then
    raise exception 'Tournament not found' using errcode = '23503';
  end if;
  if auth.uid() is null or not can_manage_tournament(t.id) then
    raise exception 'Only this tournament''s organisers can link its editions' using errcode = '42501';
  end if;

  if p_previous is null then
    root := t.id;
  else
    select id, start_date, first_edition_id into prev from tournaments where id = p_previous and deleted_at is null;
    if not found then
      raise exception 'The earlier edition wasn''t found' using errcode = '23503';
    end if;
    if prev.id = t.id then
      raise exception 'A tournament can''t be its own earlier edition' using errcode = '22023';
    end if;
    if not can_manage_tournament(prev.id) then
      raise exception 'You can only link a tournament you also organise' using errcode = '42501';
    end if;
    if prev.start_date >= t.start_date then
      raise exception 'The earlier edition has to start before this one' using errcode = '22023';
    end if;
    if exists (select 1 from tournaments x where x.previous_edition_id = prev.id and x.id <> t.id and x.deleted_at is null) then
      raise exception 'That tournament already has a next edition' using errcode = '23505';
    end if;
    if exists (
      with recursive later(id) as (
        select x.id from tournaments x where x.previous_edition_id = t.id
        union
        select x.id from tournaments x join later l on x.previous_edition_id = l.id
      )
      select 1 from later where later.id = prev.id
    ) then
      raise exception 'That tournament is one of this one''s later editions' using errcode = '22023';
    end if;
    root := coalesce(prev.first_edition_id, prev.id);
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  update tournaments
     set previous_edition_id = p_previous,
         first_edition_id = case when p_previous is null then null else root end
   where id = t.id;
  -- this tournament's later editions follow it (into the series, or out as their own)
  with recursive later(id) as (
    select x.id from tournaments x where x.previous_edition_id = t.id
    union
    select x.id from tournaments x join later l on x.previous_edition_id = l.id
  )
  update tournaments set first_edition_id = root where id in (select id from later);
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

revoke all on function link_tournament_edition(uuid, uuid) from public, anon;
grant execute on function link_tournament_edition(uuid, uuid) to authenticated;
