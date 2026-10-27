-- Run it again (2026-10-27): a tournament's editions.
--
-- "🔁 Run it again" creates the next edition of a tournament with the same
-- set-up and links it to this one, so every edition's page shows the series
-- ("2025 · 2026 · 2027"). "📋 Copy this setup" makes an unlinked copy — no
-- column needed.
--
-- 1. tournaments.previous_edition_id — the edition before this one.
-- 2. tournaments.first_edition_id — the series' first edition (null on the
--    first edition itself), so one query reads a whole series. Set by the
--    trigger, never by the app.
-- 3. guard_tournament_edition — only the organisers of an edition can link a
--    new tournament after it (otherwise anyone could add their event to a
--    famous tournament's history), the next edition starts after it, and the
--    link is made when the tournament is created (the app can't re-link one
--    later, which also keeps a series free of loops).
--
-- Idempotent — safe to re-run.

alter table tournaments add column if not exists previous_edition_id uuid references tournaments(id) on delete set null;
alter table tournaments add column if not exists first_edition_id uuid references tournaments(id) on delete set null;

comment on column tournaments.previous_edition_id is 'The edition before this one ("Run it again"); set only when the tournament is created';
comment on column tournaments.first_edition_id is 'The series'' first edition (null on the first itself); set by guard_tournament_edition';

create index if not exists tournaments_first_edition_idx on tournaments(first_edition_id) where first_edition_id is not null;
create index if not exists tournaments_previous_edition_idx on tournaments(previous_edition_id) where previous_edition_id is not null;

create or replace function guard_tournament_edition()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  prev record;
begin
  if tg_op = 'UPDATE' then
    if is_client_request()
       and (new.previous_edition_id is distinct from old.previous_edition_id
            or new.first_edition_id is distinct from old.first_edition_id) then
      raise exception 'Editions are linked when you run a tournament again' using errcode = '42501';
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
  new.first_edition_id := coalesce(prev.first_edition_id, prev.id);
  return new;
end $$;

drop trigger if exists guard_tournament_edition on tournaments;
create trigger guard_tournament_edition before insert or update on tournaments
  for each row execute function guard_tournament_edition();
