# Public API exposure audit — 2026-10-24

**Question (founder):** what could someone bulk-download from SportnNote to copy it?

**How:** read-only checks on live (project `mpgbvbylmkwasjgupsbq`):
- row-level security (RLS) and grants on every `public` table;
- SELECT policies, column privileges, views, storage buckets and anon-callable functions;
- REST reads using the app's public anon key (which ships inside every copy of the app).

## What is well protected

- **RLS is on for every table.** Nothing is readable without a policy.
- **Private player details are column-locked:** phone, email, date of birth, city, school, photo, bio, guardian and verification. They are only served through `players_view`, which applies the privacy rules (yourself, guardian, your circle, adults' opt-in contact).
- **Logged-out visitors see children as initials only**, with no age, gender or sport details.
- **Messages, threads and reports:** only the people in them, plus support.
- **Analytics, crash reports and KPI views:** no public access at all.
- **Storage:** `verification-docs` and `player-photos` are private. `media` (logos) is public by design.
- **Guardian consent codes:** 16 random characters (80 bits), stored hashed, so they can't be guessed.
- **Writes are guarded:** for example, `org_members` has an open RLS write policy, but the `guard_org_member` trigger checks owner/admin/invite on every change.
- **No secret keys** are in the app or in git history. Only the public anon key is.

## What can be bulk-downloaded

| Who | Can download, in a few requests, with no rate limit | Live size today |
|---|---|---|
| **Anyone** (the anon key from the app) | Every match, ball-by-ball / point-by-point event, stat line, team, roster, tournament, club, school, venue and organisation; adult players' names | 43 matches, 159 events, 33 teams, 7 tournaments, 23 players |
| **Anyone who signs up** (free, instant) | All of the above, plus **every player's full name, age, gender and sports, children included** | 23 players |

This is mostly public-by-design: shared match links, spectators, and public profiles are how the app spreads. But as matches pile up, this data is the moat, and a scraper can copy all of it. Supabase's REST API has no per-IP rate limit (default 1,000 rows per request, and paging gets the rest).

## Recommendations (in order)

1. **Terms of Use clause:** no scraping or bulk download, no reverse engineering, no building or training competing services (drafted 2026-10-24 in `src/data/legal.ts`). This gives the legal basis to act.
2. **Children, for signed-in strangers.** *Founder decision needed.* Show a child's full name and age only to their circle (shared team, match, tournament or organisation), their guardian, and organisers of events they're entered in. Everyone else gets initials, like logged-out visitors do. This is a privacy win under the DPDP Act and removes the most sensitive part of a scrape. Trade-off: searching for an existing child player by name to add them needs the invite / contact route instead.
3. **Detect bulk reads.** Review the API request logs (Supabase → Logs → API) for any IP making thousands of list requests. Automate it as a scheduled alert once there's real volume.
4. **At scale, make bulk listing harder.**
   - Limit logged-out reads of old ball-by-ball events to recent or live matches.
   - Serve public "browse" lists from cached, rate-limited endpoints instead of raw tables.
   - Consider a custom API domain with firewall rate limits.
   - Not worth it at today's size, and it trades off against open sharing.
5. **Optional "trap" records:** a few harmless unique entries (as map makers do) that prove a copied dataset came from SportnNote.

## Status — 2026-10-25

- **1. Terms clause:** done; live since 2026-10-24.
- **2. Children for signed-in strangers:** done (migrations 20261024120000 → 20261024210000). IDs-only scoring as well.
- **3. Detect bulk reads:** the weekly email now has an API TRAFFIC section (requests by role, most-read tables). The runbook has a Logs Explorer query to find the caller.
- **4. Make bulk listing harder:** an API gate with a blocklist (IP / account / tool User-Agent). Rate limits aren't possible in the database for read requests; the remaining at-scale steps are listed in the runbook.
- **5. Trap records:** done, with three players and one team.

See `anti-scraping.md` (migration `20261025150000_anti_scraping.sql`).

