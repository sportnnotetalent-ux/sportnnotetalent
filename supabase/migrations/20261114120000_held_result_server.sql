-- A held result finishes without the scorer's app (docs/security/breaks/held-result-server.md).
-- While a result is held (SD-111, ~60 s undo window) the app saves
-- held_result = { winner, until } with the board. Every minute the server
-- completes any live match whose hold ran out more than 30 s ago — the same row
-- change the app makes, so the follower alert, completed_at and standings
-- follow from the existing triggers.

alter table matches add column if not exists held_result jsonb;
alter table matches drop constraint if exists matches_held_result_check;
alter table matches add constraint matches_held_result_check check (
  held_result is null or (
    jsonb_typeof(held_result) = 'object'
    and length(held_result::text) <= 200
    and coalesce(held_result->>'winner', 'none') in ('home', 'away', 'draw', 'none')
    and (held_result->>'until') is not null
  ));

-- HR6: until must be soon (within 10 minutes of the save); HR4: a match that
-- isn't live never keeps one.
create or replace function matches_held_result()
  returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from 'live' then
    new.held_result := null;
  elsif new.held_result is not null and (new.held_result->>'until')::timestamptz > now() + interval '10 minutes' then
    raise exception 'held_result_too_far' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists matches_held_result on matches;
create trigger matches_held_result before insert or update on matches
  for each row execute function matches_held_result();

create or replace function finish_held_results()
  returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform set_config('app.trusted_rpc', 'on', true);
  update matches
     set status = 'completed',
         winner = nullif(held_result->>'winner', ''),
         updated_at = now()
   where status = 'live'
     and held_result is not null
     and (held_result->>'until')::timestamptz < now() - interval '30 seconds';
  get diagnostics n = row_count;
  perform set_config('app.trusted_rpc', 'off', true);
  return n;
end $$;
revoke all on function finish_held_results() from public, anon, authenticated;

select cron.unschedule('finish-held-results') where exists (select 1 from cron.job where jobname = 'finish-held-results');
select cron.schedule('finish-held-results', '* * * * *', $$ select public.finish_held_results() $$);
