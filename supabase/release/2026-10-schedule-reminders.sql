-- Schedule match reminders (notify-upcoming) every 5 minutes.
-- Paste into Supabase → SQL editor → Run. Safe to re-run (same job name = update).
-- Uses the 'cron_secret' already stored in Vault by the weekly-report setup; the
-- Bearer is the PUBLIC anon key, read from Vault 'functions_anon_key' (see the
-- parity RUNBOOK), needed only to pass the functions gateway — the function itself checks x-cron-secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('notify-upcoming', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://mjzywmnglxyijjebzfcj.supabase.co/functions/v1/notify-upcoming',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'functions_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$job$);

select jobname, schedule, active from cron.job order by jobname;
