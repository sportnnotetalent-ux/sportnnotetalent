# Break-it: a held result finishes without the scorer's app (2026-11-07)

Follow-up to full-time-held.md. Live check: after the deciding tap the result is held ~60 s (SD-111 undo window);
if the scorer closed or left the browser tab inside that window, the completed write never landed (the browser cancels
it), so the follower "Full time" alert, the standings and the game moving to Completed waited until the scorer next
opened the app. Founder 2026-11-07: "Yes, fix it".

Fix: while a result is held, the scorer's app saves `matches.held_result = { winner, until }` with the board
(`until` = when the hold runs out). A server job every minute (`finish_held_results`, pg_cron) completes any live match
whose hold ran out more than 30 s ago: `status = completed`, `winner` from the held result — the same row change the
app makes, so the existing triggers send the follower alert, stamp `completed_at` and update standings. The app's own
send (or Undo) still wins inside the window: any later save that isn't held writes `held_result = null`, and a
completed match never keeps one (trigger). Player stat-line W/L flags are refreshed the next time the scorer's app
opens (unchanged `flushPendingResults`).

| # | Break | Fix / why it's safe |
|---|-------|-----|
| HR1 | The scorer taps Undo inside the window; the server completes anyway | Undo's save is a non-held snapshot → `held_result = null`; the job only touches rows that still hold one |
| HR2 | The server completes while the app is still counting down | The job waits until 30 s after `until`; the app sends at `until` |
| HR3 | Someone forges `held_result` to end a match with a fake winner | Only people who can already write the match (scorers/hosts, RLS) can set it — they can already complete it directly; `winner` must be home / away / draw (check) |
| HR4 | A held result is set on a finished or not-started match | The job only finishes `status = 'live'`; a completed row's `held_result` is cleared by trigger |
| HR5 | The job (or anyone) is called by the app to complete arbitrary matches | `finish_held_results()` takes no arguments, is revoked from everyone, and runs only from pg_cron |
| HR6 | A far-future `until` keeps a match "held" forever | `until` must be within 10 minutes of the save (check), and a newer save replaces it |
| HR7 | Old app versions | They never write `held_result`; nothing changes for them. A new app on a database without the column retries the save without it |

Migration: supabase/migrations/20261114120000_held_result_server.sql. Tests: tests/db-held-result.test.mts, tests/held-result-client.test.mts.
