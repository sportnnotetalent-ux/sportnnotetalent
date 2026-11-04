# Break-it: sign-up source (2026-11-04)

Founder: "Yes, build it" — record which shared link or invite each new user
signed up from, so the usage dashboard shows true link → sign-up conversion.

How it works: when someone opens a SportnNote link (a game, tournament, friend
invite, team/club join, profile, results, parent/school link), the device
remembers the KIND of link (and, for public pages, which one) for 30 days. On
the first sign-in after the account is made, the app sends it once
(`record_signup_source`) and forgets it. The dashboard counts sign-ups by
source and lists each new person's source.
Migration: supabase/migrations/20261108120000_signup_source.sql.

| # | Break | Fix |
|---|-------|-----|
| SS1 | Secret tokens in links (team / club / tournament join tokens, parent and school codes in `?c=`) get stored and shown on the dashboard | Only the link KIND is kept for those; the query string is never read; refs are kept only for public pages (game, tournament, profile, friend invite) |
| SS2 | An existing user opens a link and is "attributed" as a new sign-up | The server records a source only for an account made in the last 48 hours; the device forgets the link on every signed-in check |
| SS3 | A user calls the RPC again to rewrite their source / inflate a link | One row per account (first one wins); later calls do nothing |
| SS4 | Anyone (anon) writes sources, or reads other people's | Signed-in only, for themselves (auth.uid()); the table has no grants and RLS on — only the RPC writes and only support reads, via the dashboard |
| SS5 | Junk refs (huge strings, SQL-ish text, someone else's made-up id) | Kind must be in the list; ref must look like an id (≤ 64 chars, letters/digits/-/_) and must exist (a real game / tournament / player); otherwise only the kind is kept |
| SS6 | "Invited by myself" | An invite ref that is the new user's own player is dropped |
| SS7 | Minors / people who chose "Essential only" get a per-person trail of which link they followed | For them only the kind is kept (no ref) — matching analytics_actor; counts still include them |
| SS8 | An old link from weeks ago credits today's sign-up | The device keeps a link for 30 days, first link wins; older or future-dated ones are dropped |
| SS9 | Deleting an account leaves its source behind | The row is deleted with the profile (on delete cascade) |
| SS10 | Dashboard shows "link → sign-up" wrongly when nothing is recorded yet | Sign-ups with no recorded source count as "Direct / unknown"; nothing is guessed |

Tests: tests/signup-source.test.mts (link → kind/ref, keep/send rules),
tests/db-signup-source.test.mts (SS2–SS7, SS9, dashboard), tests/sim-signup-source.test.mts (600 users).
