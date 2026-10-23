-- ============================================================================
--  Prep reminders on the server — reminder_sends takes kinds 'squad' + 'host'
-- ============================================================================
--  Idempotent — safe to re-run. Needs 20261019124310_event_result_alerts (the
--  ledger's current shape: match_id / event_id, unique indexes).
--
--  The two pre-match nudges about other people's jobs moved from devices to the
--  notify-upcoming cron (2026-10-23; rules in
--  supabase/functions/_shared/prepReminders.ts):
--    • 'squad' — "📋 Squad needed": a side has no matchday squad → its captain,
--      vice-captain, team admins and staff (a day / 3 h / 1 h before kickoff);
--    • 'host'  — "⚠️ No scorer yet": the match has no scorer → its hosts.
--  Each is recorded in the existing dedup ledger reminder_sends exactly like the
--  'player' / 'follower' / 'scorer' reminders — one row per (match, lead,
--  recipient profile, kind) — so a nudge is never sent twice. Only the kind
--  check widens; no new table, no new columns.
--
--  ORDER: safe either way. Until this runs, notify-upcoming's prep ledger insert
--  is refused by the old check; the function then skips the prep nudges for
--  that run (logged) and sends everything else as before.
--
--  RLS: unchanged — reminder_sends stays server-only (RLS on, no client policy;
--  the notify-* edge functions use the service role). Re-asserted below.
-- ============================================================================

alter table reminder_sends drop constraint if exists reminder_sends_kind_check;
alter table reminder_sends add constraint reminder_sends_kind_check
  check (kind in ('player', 'follower', 'scorer', 'squad', 'host'));

alter table reminder_sends enable row level security;
