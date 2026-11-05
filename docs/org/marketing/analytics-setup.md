# Connecting each platform's analytics

Founder 2026-11-05: connect every platform's stats right away (weekly exports until then).

**How it works:** the founder signs in and creates the access on each platform (agents never sign in or see passwords). Each platform gives a **read-only** access key. The founder puts the keys in one local file, `.env.analytics.local` (already git-ignored by `.env*.local`; never committed, never pasted in chat). Engineering builds a small script that reads that file, pulls the numbers (counts only) and writes them to `stats/log.md`. The daily run then logs stats automatically.

Rules: read-only permissions only (insights / analytics), never "publish" or "manage" scopes, until the founder moves to direct posting.

## Part 1: the founder's steps

### 1. Instagram, Facebook and Threads (Meta) — free
1. Go to developers.facebook.com, sign in with the account that admins the SportnNote business portfolio, and create an app: type **Business**, linked to the **SportnNote** business portfolio.
2. Add the **Instagram Graph API** and **Threads API** products.
3. In the portfolio (business.facebook.com → Settings → Users → **System users**), create a system user "sportnnote-stats", give it the Facebook Page and Instagram account with **view-only/insights** access, and generate a token for the app with only these permissions: `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights`. (Because it's your own business's data, the app can stay in development mode; no app review is needed for reading your own insights.)
4. Threads: in the app's Threads settings, add your Threads account as a tester and generate a token with `threads_basic` and `threads_manage_insights`.
5. Put them in `.env.analytics.local` as `META_SYSTEM_TOKEN=…`, `THREADS_TOKEN=…`, plus the Page id and Instagram account id (shown in Business Settings).

### 2. YouTube — free
1. console.cloud.google.com → new project "sportnnote-stats" → enable **YouTube Analytics API** and **YouTube Data API v3**.
2. OAuth consent screen: External, app name SportnNote Stats, add your own Google account as a test user.
3. Create an **OAuth client id** (type: Desktop app) and download it. Put the client id and secret in `.env.analytics.local` (`YT_CLIENT_ID`, `YT_CLIENT_SECRET`).
4. When Engineering's script is ready, run it once yourself: it opens a Google sign-in page; you sign in with the account that owns the YouTube channel and allow **read-only** analytics. It saves a refresh token locally. That's the only time you sign in.

### 3. LinkedIn page — free, needs approval
1. linkedin.com/developers → **Create app**, linked to the SportnNote company page (you as page admin verify it).
2. In the app's **Products** tab, request **Community Management API** (page analytics). LinkedIn reviews it; this can take days to weeks. Use the business email and describe it as "reading our own page's analytics".
3. Once approved, Engineering's script does the same one-time sign-in as YouTube, with scope `r_organization_social` and `rw_organization_admin` read calls only. Client id/secret go in `.env.analytics.local`.

### 4. X — paid
Reading post stats needs the X API **Basic** plan (about $200/month). Decision open (decisions.md). Until then: X analytics → export monthly into `stats/inbox/`.

## Part 2: Engineering (hand-off to eng-director)
A script `scripts/social-stats.mjs`:
- reads `.env.analytics.local` (never prints a key), calls each connected platform's read-only insights endpoints for the posts in `queue.md` with a live link, plus follower totals;
- writes counts only into `docs/org/marketing/stats/log.md` (no commenter names, no user ids);
- skips a platform whose keys aren't there yet, and says so;
- quality mandate: break-it list (Security writes it: token handling, scopes, no personal data), tests with recorded sample responses, no live calls in tests.

## Status
| Platform | Founder step | Script |
|---|---|---|
| Instagram / Facebook | todo | todo |
| Threads | todo | todo |
| YouTube | todo | todo |
| LinkedIn | todo (apply now — approval takes time) | todo |
| X | decision open | — (exports) |
