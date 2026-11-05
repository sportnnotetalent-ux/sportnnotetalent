# Break-it: signed-out reads limited to the shared item (2026-11-05)

Founder: "Go ahead with the signed-out read lockdown" (anti-scraping step 1;
docs/security/anti-scraping.md "Later, at scale").

Before: about 35 tables had read policies of `true`, so with the public anon
key anyone could download every match, event, stat line, team, tournament,
organisation and player in a few requests. Live traffic (weekly snapshots)
shows no scraping yet — this is done before the 7 Dec pre-launch publicity.

How it works:
- While signed out, the app sends `x-share: <kind>:<uuid>` naming the page in
  view: m (match), t (tournament), p (player), team, e (golf round / results
  event), h (school hall of fame). Set from the current route.
- `share_scope()` (security definer) turns that one id into the small set of
  rows that page needs: e.g. a match → the match, its two teams, their players,
  its tournament and host organisation; a tournament → its matches, teams,
  players, events, host.
- Signed-out (role `anon`) read policies return only rows in that set. No
  header, a malformed header or an unknown id → nothing. Signed-in users keep
  the existing policies unchanged.
- `players_view` (a definer view) filters rows for `current_user = 'anon'`
  only, so owner-rights functions (passport, certificates, hall of fame,
  invites) keep working.
- Live feeds (realtime) can't carry the header, so signed-out reads of
  `match_events` / `field_entries` are also allowed for matches / rounds that
  are live now. That's a small, changing set; history stays scoped.
- Reference data stays open: cities, golf courses, venues.
Migration: supabase/migrations/20261110120000_signed_out_scope.sql.

| # | Break | Fix |
|---|-------|-----|
| SO1 | Signed out, `select * from players / matches / match_events / stat_lines …` dumps the table | anon policies return only the shared item's rows; no header = nothing |
| SO2 | A forged header for another match | It only ever opens ONE item per request, the same thing its public link already shows — no list to enumerate ids from |
| SO3 | Header injection (`m:x' or 1=1`, huge strings, other kinds) | Strict regex `^(m|t|p|team|e|h):<uuid>$`; anything else = empty scope |
| SO4 | Owner-rights link features break (passport, certificates, hall of fame, invites, guardian consent) | They run as the owner, which bypasses RLS and the view filter (`current_user` isn't anon) |
| SO5 | Signed-in users lose access | Existing policies re-targeted `to authenticated`, unchanged |
| SO6 | Signed-out live pages / stream overlays freeze (realtime has no header) | `match_events` / `field_entries` also readable for live matches / rounds |
| SO7 | Shared pages that load whole tables and filter in the browser break | They get only the scoped rows, which include the one they look for |
| SO8 | Lists that a signed-out visitor never needs (listings, activity log, squad sessions, schools) | Signed-in only |
| SO9 | Slow: the scope is recomputed for every row | Policies call it as `(select share_ids('m'))`, computed once per query |

Tests: tests/db-signed-out-scope.test.mts (SO1–SO9), tests/share-scope.test.mts (route → header),
tests/sim-signed-out-scope.test.mts (600 visitors with random headers / pages).
