# SportnNote: handoff (start here)

Written 2026-10-31, when the founder moved to a new Claude account. It records where everything stands, what's next, and how we work. A new session should read this first, then `docs/product/MVP.md`, then the newest `DEVLOG.md` entries.

**The previous assistant's notes:**
- **Memory:** a snapshot of all of it is in `docs/handoff/memory/`. `MEMORY.md` is the index, one file per topic. If your memory folder is empty, read these.
- **Morning error check:** a scheduled task. Its full prompt is in `docs/handoff/morning-error-check-task.md`.

## 1. The product in one paragraph
SportnNote ("Play a Sport, Make a Note") is an Expo SDK 56 / React Native 0.85 / TypeScript multi-sport scoring app.
- **Platforms:** web, an Android APK, and soon the Play Store and App Store.
- **Backend:** Supabase (project `mpgbvbylmkwasjgupsbq`, Mumbai).
- **Website:** sportnnote.in, a Cloudflare Worker with static assets, deployed from `main` when the founder pushes.
- **Repo:** `~/Desktop/rudy/sportfolio`, branch `feat/sport-formats-and-scoring`. `main` is kept equal to it with `git branch -f main HEAD`. GitHub is `sportnnote-lgtm/sportnnote` (private).

**The MVP (founder, 2026-10-31):** score any match live from your phone, everyone follows it from a link, and the results, standings and stats build themselves.
- **For:** community and friends' games.
- **Sports to perfect first:** football, basketball, kabaddi, badminton, tennis, pickleball and padel. Cricket stays as it is.

## 2. What's live right now (2026-10-31)
| Piece | State |
|---|---|
| Web app | `sportnnote.expo.app` / `app.sportnnote.in`, build `index-df1fae98` (commit 2c144db) |
| Android | APK 41 is the download. Over-the-air update group `0f861a23` (runtime `1.0.0`, channel `preview`). |
| Database | Every migration up to `20261031140000_share_match.sql` has been run. |
| Website Worker | Deployed from 2c144db. Serves sportnnote.in plus `app.sportnnote.in/m/*` (the live score link) and `/.well-known/*`. |
| Cloudflare | Worker routes `app.sportnnote.in/m/*` and `app.sportnnote.in/.well-known/*`. The redirect rule sends the rest of `app.sportnnote.in` to `sportnnote.expo.app`, except `/.well-known/` and `/m/`. |
| Daily error email | Labels errors new / older version / noise. |
| Morning error check | A scheduled task on the founder's Mac at 08:30 IST, which may need re-creating under the new account (§6). |

**Not pushed yet** (the founder pushes):
- `c116959`: DEVLOG entry.
- `e9877c6`: Worker fix. Without it, browsers that open a match link get the website's 404 page. Robots and WhatsApp previews already work.
- This handoff commit.

After the push, check that opening a match link in a browser shows the light score page:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H 'Sec-Fetch-Mode: navigate' https://app.sportnnote.in/m/6da23011-61fb-4c24-9a8c-7a29b2924c46
```

It should print `200`; it printed `404` before the fix. Then paste a match link into WhatsApp and check that the preview reads "⚽ LIVE · …".

## 3. What was done in the last stretch (newest first; details in DEVLOG.md)
- **MVP loop items, live:**
  - The live score link: WhatsApp previews, plus a 4 KB spectator page in place of the 7 MB app, refreshed from an edge cache. Scores come from `matches.summary`.
  - A result card picture on web Share.
  - Quick game: the sport is pre-picked and empty sides become "Team A"/"Team B".
  - Quick tournament: name, sport, pasted teams and a format, then fixtures.
  - Docs: `docs/launch/live-link.md`, `docs/security/breaks/mvp-loop.md`.
- **MVP defined and audited** (`docs/product/MVP.md`, `docs/mvp/`):
  - The shared loop: `audit-loop.md`.
  - Three per-sport reviews: `audit-football-basketball.md`, `audit-badminton-tennis.md`, `audit-kabaddi-pickleball-padel.md`.
- **Near you, live:** matches are now placed by the home cities of the people running them; abandoned "live" matches are skipped.
- **Personalised Home, live:**
  - First-run questions (skippable; answers go into the profile).
  - "Near you" on Home.
  - Match view counts.
  - A GeoNames city list with 8,079 towns.
  - Location is approximate, adults only, while the app is in use.
- **Daily error tracking:** labelled email plus the morning check.
- **Earlier:** parental proof (CL-03), the redesign and logo, and much more. See `DEVLOG.md` and `docs/handoff/memory/`.

## 4. Next up, in order
### 4.1 Four score bugs from the sport reviews (P0, fix first, test-first)
1. **Tennis T1:** a custom "Games per set" never moves the tiebreak, because `tiebreakAt`, `setWinByTwo` and `tiebreakPoints` keep the preset's values. See `src/sports/tennis/meta.ts:53-59`, `engine.ts:93-96` and `src/components/FormatEditor.tsx:109-115`.
2. **Basketball B1:** one tap on "Start Overtime" ends a tied 3x3 game early, at any time and without a confirm. See `src/sports/basketball/index.tsx:821-841` and `engine.ts:618-622`. Fix: show it only at 0:00, add a confirm, and have the reducer refuse it before time is up.
3. **Kabaddi K1:** the 5-raid shootout ends as if each raid were worth only 1 point. See `src/sports/kabaddi/rules.ts:166-175` and `engine.ts:923-935`. The existing test `tests/kabaddi.test.mts:46-48` asserts the wrong rule.
4. **Kabaddi K2:** a failed do-or-die raid gives +2 and calls it a "super tackle"; it should be +1. See `rules.ts:305-308` and `:322-326`. Check against the AKFI rulebook.

The kabaddi fixes change how old matches replay, so gate them so old matches still replay as they were saved.

### 4.2 The P1s in `docs/mvp/*.md` (about 37)
The biggest:
- Pickup games with no players dead-end: football's stat buttons and subs, basketball's fouls.
- Basketball has no running clock, and its score buttons jump.
- Undo doesn't say what it will remove.
- Football's default is 11-a-side with 45-minute halves, wrong for turf.
- Pickleball's "Rec" preset is really best of 3.
- Padel "single set" turns into one tiebreak.
- The racket point buttons have no double-tap guard.
- Tennis presets and serving order.
- Badminton accepts a blank number of points.

Also open from the loop audit:
- **QT-04:** the quick tournament says "today", but the fixtures screen defaults to tomorrow.
- **QG-01:** quick "Team A/B" sides pile up in the team pickers.
- **L8:** links leave `app.sportnnote.in` for `sportnnote.expo.app`.
- **L9:** the spectator scoreboard shows short codes.
- **L10:** the email placeholder says "you@school.edu".
- **L11:** matches left "live" for months should end on their own. Two old test matches are still live: Lions vs Tigers and Brazil vs Japan.

### 4.3 The eligibility gate (decided, not built)
The founder decided:
- friendlies are never gated;
- a tournament can turn on "verified players only" (off by default).

`TESTING_ALLOW_UNVERIFIED` in `src/core/eligibility.ts` is still `true`. Build the per-tournament option before ever turning that off.

### 4.4 Going live on Play Store and App Store (founder decision, 2026-10-30)
The company is a sole proprietorship, so: a personal Play account, an individual Apple account, and the current app version.

**The founder's steps** (`docs/launch/founder-steps-now.md`):
1. Play Console account, plus 15–20 Android testers for the 14-day closed test.
2. Apple Developer account (individual, through the Apple Developer app in India).
3. In Firebase:
   - add the iOS app and send its `GoogleService-Info.plist`;
   - add a test phone number for store reviewers;
   - set the SMS region to India only.
4. Install Xcode.

**Engineering for the store builds:**
- Android app bundle, plus an iOS build (never built so far).
- iOS:
  - set `supportsTablet` to false;
  - camera permission text;
  - `ITSAppUsesNonExemptEncryption`.
- Over-the-air updates for store builds: the publish script covers only `android`/`preview`.
- Upload the existing EAS signing key to Play, so APK 41 users can update in place.
- Listings, screenshots, data-safety and privacy-label answers (`docs/international/audit/distribution.md`, now including approximate location) and reviewer notes.
- `expo-location` is already in the app and needs the new native build.
- Possibly `react-native-view-shot` + `expo-sharing` for the result picture on phones.

### 4.5 Waiting on the founder
- **Illustrations:** the founder is making them from `docs/design/illustrations.xlsx` (40 pictures plus 33 sport banners). Fit them into the UI when they arrive.
- **Social:** upload the brand kit (`docs/marketing/brand-kit/`) to the six social accounts.
- **Parental proof:** do the end-to-end test, then delete the under-18 test account "Sravan" (born 2024).
- **Testing:**
  - the sign-in checklist (`docs/testing/sign-in-test-script.md`);
  - a phone test round: voice scoring, PDF, certificates, passport, Hall of Fame, school verification.
- **Lawyer review of Terms and Privacy:**
  - privacy version is now 2026-10-31;
  - also covers under-18 matches showing in Near you (founder's choice), location, and the proprietorship's name and address.
- **Paperwork:** the assignment from likhithareddy39; trademark; sportnnote.com; Supabase Pro.
- **Store seller name:** it's the founder's legal name, so check the Salesforce employment terms.
- **Restore drill:** around January 2027.

### 4.6 Backlog
- Anti-scraping at scale.
- Wave 2b: push on a new request, Declined requests in Settings, Report on a request.
- 1.1.0 / SDK 57, on branch `sdk57` (never publish over-the-air from it). It's the first store update, together with App Check and EAS update code signing.
- iPhone universal links.
- Dark mode, after the founder's call.

## 5. How we work (founder rules; follow them)
- **Quality mandate** (`AGENTS.md`, `docs/engineering/quality-mandate.md`):
  1. Tests first.
  2. Unit tests.
  3. Integration tests (PGlite: `tests/helpers/pgdb.mts`).
  4. A break-it list first, written without fixing.
  5. Each fix with its own failing test.
  6. A simulation of 500 users or more.
  7. Only then publish.
  Break-it docs live in `docs/security/breaks/`.
- **Expo:** read the v56 docs before writing Expo code (`AGENTS.md`).
- **Commits:** explicit file lists only, never `-a`. Keep `main` equal to the branch. **The founder runs `git push`.**
- **Publishing:** ask for approval each time; the founder says "publish".
  - Publish from a clean worktree with `scripts/publish-web.sh` and `scripts/publish-android-ota.sh "msg"`.
  - Never pipe them through `head`.
  - Run `node scripts/auth-smoke.mjs` before every publish.
  - Never publish over-the-air from `sdk57`.
- **Database:**
  - Never write to the live database. Read-only queries are fine:
    `npx supabase db query --linked --project-ref mpgbvbylmkwasjgupsbq -o json "select …"`
  - The founder runs migrations in the SQL Editor, or a big file from the terminal with `-f`.
  - Recreate a function from its latest body; grep all migrations.
- **Never:**
  - commit or print secrets (`.env.local.bak`);
  - create accounts or enter passwords;
  - handle the backup passphrase.
  The publishable anon key is in `wrangler.jsonc` on purpose.
- **Don't commit:** `docs/cricheroes-parity/`, `docs/qr/`, `.claude/`, or `sportnnote-db-*.tar.gz.enc`.
- **Communication:** the founder prefers plain, short English; recommendations rather than surveys; screenshots as proof. Feature guides go on the website (`website/guides/`) for anything user-facing.
- **Preview:** the offline demo is the `.claude/launch.json` config `sportfolio-offline-demo` on port 8093. Metro can run out of memory after about an hour; restart it if the page goes blank.

## 6. Re-create the morning error check (if the new account doesn't run it)
The old account had a scheduled task, `sportnnote-morning-errors`: every day at 08:30, `30 8 * * *` in local time. Its full prompt is in `docs/handoff/morning-error-check-task.md`.

Re-create it with the same prompt. It reads errors read-only through `scripts/error-triage.mjs`, prepares fixes test-first on a `fix/errors-<date>` branch in its own worktree, and writes a report to `~/Desktop/rudy/error-reports/<date>.md`. It never pushes, deploys or writes the database.

## 7. Where things are
| What | Where |
|---|---|
| MVP definition, bar, funnel | `docs/product/MVP.md` |
| MVP audits | `docs/mvp/` |
| Store and launch steps | `docs/launch/` (founder-steps-now.md, live-link.md), `docs/international/go-live-checklist.md` |
| Break-it records | `docs/security/breaks/` |
| Everything that shipped | `DEVLOG.md` (newest at the top) |
| Website build + Worker | `scripts/build-website.mjs`, `worker/`, `wrangler.jsonc`, `website/` |
| Edge functions | `supabase/functions/` |
| Migrations | `supabase/migrations/` |
| Tests | `tests/` (full suite: `node --test tests/*.test.mts`, about 5,730 tests, ~5 min) |
| Previous assistant's memory | `docs/handoff/memory/` |
