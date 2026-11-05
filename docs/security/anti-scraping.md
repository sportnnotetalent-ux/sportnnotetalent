# Anti-scraping — what's in place and the runbook

*2026-10-25. Follows `api-exposure-audit-2026-10-24.md`. Migration `20261025150000_anti_scraping.sql`.*

## The layers

| Layer | What it does | Where |
|---|---|---|
| **Terms of Service** | Ban scraping, bulk download, reverse engineering and building or training competing services. This gives the legal basis to act. | `src/data/legal.ts` ("Our app and its data") |
| **Children's data** | A possible minor is shown as initials to anyone outside their circle. Scoring data stores player ids, not names. | Migrations 20261024120000 → 20261024210000 |
| **Private columns** | Phone, email, date of birth and the like are only served through `players_view`, with privacy rules. | Earlier migrations |
| **Contact lookup limit** | Finding people by phone or email is capped at 60 an hour per account. | `discover_player_by_contact` |
| **API gate** (new) | Every REST and RPC request is checked against a blocklist (IP, account, User-Agent) and refused with HTTP 403 if listed. It is seeded with common scraping tools. | `api_gate()`, `api_blocklist` |
| **Trap records** (new) | Three made-up adult players and one made-up team. If they ever appear in someone else's app or dataset, it was copied from SportnNote. | `canary_records` |
| **Weekly numbers** (new) | Monday's email shows API requests (logged out / signed in) and the most-read tables, against the previous week. | `api_traffic_report()`, weekly-report |
| **Sign-up guard** (2026-10-27) | Scraping at scale needs many accounts. New accounts are capped per network (IP) per day (100 by default), and temporary-inbox services can't sign up. No CAPTCHA for real people, no app change. Fails open. | `hook_before_user_created`, `signup_guard_settings` (migration `20261027180000_signup_guard.sql`) |

**What this can't do:**
- **No automatic rate limits.** Supabase serves reads in read-only transactions, so the database can't count requests per visitor. The gate blocks who you list; it doesn't throttle automatically.
- **Anyone determined can still copy public data.** They can sign up, use a browser-like User-Agent, and rotate IPs. The aim is to make copying slower, noticeable and provable, and to keep children's data out of it.
- **Realtime, Storage and Auth** go to other Supabase services and don't pass through the gate.

## Signs of scraping

1. **The weekly email's API TRAFFIC section** jumps (for example logged-out requests ×5 or more) without a matching jump in sign-ups, matches or active users.
2. A table that normal use rarely reads in bulk (`match_events`, `stat_lines`, `players`) suddenly tops "Most read".
3. **A trap record turns up elsewhere:** search other apps, websites, datasets and Google for **Ojasvin Talluri**, **Ruthvel Kandregula**, **Sahasra Pennada** or **Kondapur Kestrels FC**.

## Investigate: who is it?

Supabase → **Logs → Logs Explorer**. On the free plan the logs cover the last day. Paste:

```sql
-- Busiest callers of the REST API in the selected window
select
  h.x_real_ip as ip,
  any_value(h.user_agent) as user_agent,
  count(*) as requests,
  count(distinct r.path) as different_paths
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as r
  cross join unnest(r.headers) as h
where r.path like '/rest/v1/%'
group by ip
order by requests desc
limit 20
```

- If a field name isn't recognised, open any single log row in **Logs → API Gateway** to see the exact header names (`x_real_ip` / `cf_connecting_ip`) and adjust.
- A normal app user makes a few hundred requests a day. Thousands of requests from one IP, many different paths, or a tool User-Agent means scraping.
- If the requests carry a signed-in user's token, the account can also be blocked.
- **Your own IP:** open `https://mpgbvbylmkwasjgupsbq.supabase.co/rest/v1/rpc/api_whoami?apikey=<anon key>` in a browser. The anon key is the public one in the app. This shows what the API sees for you, so you don't block yourself.

## Block, unblock, pause

Run these in Supabase → **SQL editor**:

```sql
-- Block an IP for 30 days
insert into api_blocklist (kind, value, reason, expires_at)
values ('ip', '203.0.113.7', 'scraped matches 2026-11-02', now() + interval '30 days');

-- Block an account (their auth user id = profiles.id)
insert into api_blocklist (kind, value, reason)
values ('user', '00000000-0000-0000-0000-000000000000', 'scraping account');

-- Block a tool by its User-Agent (case-insensitive regex)
insert into api_blocklist (kind, value, reason) values ('agent', '^my-scraper/', 'scraping tool');

-- See / remove entries
select * from api_blocklist order by created_at desc;
delete from api_blocklist where kind = 'ip' and value = '203.0.113.7';

-- Pause the gate (everything allowed) / resume
update api_gate_settings set enabled = false;
update api_gate_settings set enabled = true;

-- Remove the gate completely (instant)
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';
```

**Before blocking:**
- **Shared networks:** a school or college network can put many real users behind one IP. Prefer blocking the account, or block the IP with a short `expires_at`.
- **Already blocked by default** (tool User-Agents): `python-requests`, `python-urllib`, `python-httpx`, `aiohttp`, `scrapy`, `curl`, `wget`, `libwww-perl`.
- **Never blocked:** browsers, the Android app (`okhttp`), edge functions (`Deno`), Node, Go and Java clients, `service_role`, and the API root.
- **Fail-safe:** the gate fails open. If the check itself hits an error, the request goes through, so the gate can't take the app down. A bad regex is refused when you add it.

## Sign-up guard

**Switch it on (once, after running the migration):** Supabase → **Authentication → Auth Hooks** → **Before User Created** → **Postgres** → schema `public`, function `hook_before_user_created` → enable.

- **What it refuses:**
  - a temporary-inbox address ("Please use your own email address — a temporary inbox can't be used for SportnNote");
  - more than the daily number of new accounts from one IP ("Too many new accounts from this network today …").
- **Never limited:** sign-ups through the app's mobile-number sign-in (our server makes those accounts).
- **Fails open:** if the check errors, the sign-up goes through.

```sql
-- A school's sign-up drive on one Wi-Fi hit the limit: raise it (default 100 a day per IP)
update signup_guard_settings set per_ip_per_day = 300;

-- Add a temporary-inbox domain
update signup_guard_settings set blocked_domains = array_append(blocked_domains, 'example-temp.com');

-- Today's new-account counts by IP (the busiest first)
select subject as ip, hits from rate_limit_hits
 where bucket = 'signup-ip' and window_start >= date_trunc('day', now()) order by hits desc limit 20;

-- Pause / resume (or switch the hook off in the dashboard)
update signup_guard_settings set enabled = false;
update signup_guard_settings set enabled = true;
```

## If you find your data elsewhere

1. **Collect evidence:** screenshots with dates and URLs, and copies of the pages (a web archive link helps). Search for the trap names, and note any exact matches of our match data (scores, dates, venues).
2. **Prove it's ours:** `select * from canary_records;` shows when the trap records were created in our database. They don't exist anywhere else.
3. **Act:**
   - send a lawyer's notice citing the Terms of Service and copyright and database rights;
   - send takedown requests to the host and the app stores (Google Play and Apple both have IP complaint forms);
   - block the accounts and IPs above.

## Later, at scale

- Supabase **Pro plan**: longer log retention, and log drains for automatic daily alerts on the busiest IPs.
- **CAPTCHA** (Supabase Auth, Turnstile / hCaptcha) if bulk sign-ups get past the guard. Supabase's CAPTCHA covers every sign-in and code request too, and the Android app needs a WebView to show it. So it can only be switched on once almost everyone is on an APK that includes one — not APK 41.
- ~~Stop logged-out list reads of raw tables~~ **Done 2026-11-05** (`docs/security/breaks/signed-out-scope.md`, migration `20261110120000_signed_out_scope.sql`): signed out, the app names the shared item in view (`x-share` header) and the database returns only that item's rows; no header = nothing. To undo in an emergency: `drop policy "anon_share_read" on <table>` and `alter policy <old policy> on <table> to public` for each table listed in the migration.
- **App attestation** (Play Integrity / App Attest) behind an API proxy, once a proxy that can't be bypassed is possible.
