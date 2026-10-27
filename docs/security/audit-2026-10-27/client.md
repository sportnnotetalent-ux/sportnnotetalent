# Client security audit: app + web build (2026-10-27)

Scope: `src/` (React Native / Expo app and its web build at app.sportnnote.in), `public/sw.js`, `public/index.html`, `app.json`, `scripts/build-website.mjs`. This was static analysis only. No live service was contacted and no code was changed.

Skipped as instructed: `StudentImportScreen.tsx`, `SchoolRequestScreen.tsx`, `src/data/studentList*.ts`, `src/core/xlsx.ts`.

Where a finding's root cause is on the server (SQL or an edge function), it is listed here because the client calls that path and exposes it. The database audit should confirm these. "Unverified" means the code path was read but the runtime behaviour was not exercised.

**Count: 4 High · 14 Medium · 12 Low (30 findings).**

---

## High

### CL-01: The child-safety fielding gate is off in production, and it only ever existed on the client (High)
- **Where:** `src/core/eligibility.ts:37-45` (`TESTING_ALLOW_UNVERIFIED = true`), `:79-81` (`canFieldPlayer`). It is enforced only in `src/screens/MatchSquadScreen.tsx:74`, `src/screens/CricketLineupScreen.tsx:81` and `src/screens/LiveScoringScreen.tsx:389-390`. A test pins the switch on: `tests/verification-requirement.test.mts:25` (`assert.equal(TESTING_ALLOW_UNVERIFIED, true)`). The tournament age requirement is also client-only: `supabase/migrations/20261024190000_age_requirement.sql:11-12` says "The app enforces it".
- **Attack / failure:** In the live build, any child can be picked into a squad and scored, with or without guardian verification or an approved age proof. Even after the constant is flipped, a scorer can skip the rule by writing squads, line-ups or events through the API (`append_match_event`, `matches`/`lineups` updates). The server never checks eligibility or `tournaments.age_verification`.
- **Impact:** The guardian-verified rule for under-18s and an organiser's "age verified" requirement can both be skipped. Flipping the constant would fail the test suite, so it is likely to stay on.
- **Fix direction:** Set the flag to false (and change the test), then enforce eligibility and `age_verification` in the server write paths for squads, line-ups and events.

### CL-02: Looking up a phone number or email returns a child's full name (High; root cause on the server, visible to the client)
- **Where:** The client calls these at `src/data/repos.ts:2652` (`find_player_by_phone`) and `:2681` (`find_player_by_email`). They are used by `lookupPeople` (co-host picker) and `invitePerson`/`AddInvitePlayer`. The SQL is `supabase/migrations/20261007120000_private_contact_details.sql:123-155`, which returns `p.full_name` straight from `players`, never passed through `public_person_name`/`players_view`. Later migrations only change volatility (`20261017120000_contact_lookup_volatile.sql:7-8`).
- **Attack:** Any signed-in account (accounts are free) types phone numbers into the co-host or "add player" search, or calls the RPC directly. It is limited to 60 lookups an hour per account. The response holds `{id, full_name, claimed}` for the matching player, including under-18s. The UI throws the name away and re-reads `players_view` (initials), but the full name is already in the network response. Follow-up: with the returned id, `GET /functions/v1/join?p=<id>&format=json` (called unauthenticated by `src/screens/InviteScreen.tsx:42`) returns the child's team name and team id.
- **Impact:** A child's mobile number resolves to their full name, player id and team. This goes around the "initials outside the circle" rule.
- **Fix direction:** Return only `id`/`claimed` (or a masked name) from both RPCs, and gate `join?p=` by caller/relationship.

### CL-03: Guardian consent can be completed by whoever holds the emailed link, and any adult account that opens it becomes the child's linked guardian (High; server root cause, client shows no check)
- **Where:** `src/screens/GuardianConsentScreen.tsx:46, 107-110` ("If you agree, this account is linked as {child}'s parent/guardian") calls `src/data/privacy.ts:146-156` and then `guardian_consent_decide` (`supabase/migrations/20261024180000_verification_lanes.sql:63-124`; linking at `:100-107`, DOB "parent" confirmation at `:95-98`). At sign-up the child types the guardian email freely (`src/screens/AuthScreen.tsx:108-118`, `269`).
- **Attack:**
  - **(a)** A child enters an email they control as "guardian". They open the link signed out and tap Agree. Consent becomes `confirmed`, `guardian.emailVerified` becomes true, and with "Yes, that's right" the DOB is recorded as parent-confirmed. That is the fast lane that satisfies an organiser's "confirmed age" requirement.
  - **(b)** Any signed-in account aged 18+ **or with no DOB at all** (`a is null or a >= 18`) that opens the link is set as `guardian_profile_id`. Coaches' message threads about the child are re-addressed to that account (`message_threads.recipient_profile_id = me`). It also gains guardian rights: view or export the child's data, withdraw consent, delete the child. Nothing checks that the signed-in account's email equals the email the code was sent to.
- **Impact:** Verifiable parental consent and the "messages go to the parent" safeguard can be handed to an unverified adult or forged by the child.
- **Fix direction:** Link only when the caller's verified email equals `target_email`. Treat a null age as a minor. Do not let the consent link alone grant the parent-confirmed DOB lane.

### CL-04: The under-18 consent route is chosen by a country value the client supplies, and the India guardian rules exist only in the UI (High)
- **Where:** `src/core/auth.tsx:282-288` sends `country: privacyCountry()`, which comes from the device time zone or a Region override (`src/core/privacyRegion.ts:76-84`). The server trusts `meta->>'country'` (`supabase/migrations/20261020120000_privacy_rights.sql:139-171`). The guardian name/contact and consent checkbox for minors are checked only in `src/screens/AuthScreen.tsx:108-118`.
- **Attack:** A UK/EU/US child sets the phone's time zone to Asia/Kolkata (or the app Region to India), or calls `auth.signUp` directly with `country: 'IN'`. They get `guardian_consent = 'self_declared'` instead of `pending` and skip the guardian-email confirmation. A US under-13 is no longer refused (the +1 phone fallback only applies when no country is sent, and phone is optional). A direct `signUp` with a 12-year-old's DOB and no guardian at all is accepted.
- **Impact:** COPPA / UK and EU under-18 consent flows can be bypassed. Accounts for under-18s can exist with no guardian on file.
- **Fix direction:** Work out the jurisdiction on the server (IP/phone/explicit, and the stricter one when sources disagree), and require guardian details for minors in the sign-up trigger.

---

## Medium

### CL-05: Signing out offline silently keeps the session (shared phones) (Medium)
- **Where:** `src/core/auth.tsx:318-329`. The result of `supabase.auth.signOut()` is ignored. In auth-js 2.108.1 `_signOut` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3297-3307`) returns early on a network error and never calls `_removeSession()`.
- **Failure:** At a ground with poor signal, the user taps Sign out. Push and alerts are released (`releaseDeviceForSignOut`) but the session stays in storage, and no error is shown. The next person to pick up the phone is still in the previous account. On web, the `clear-data` message still goes out, but the stored token remains.
- **Fix direction:** Fall back to `signOut({ scope: 'local' })` on error, or clear the storage key, then show a confirmation.

### CL-06: Device cleanup only runs from the Sign out button (Medium)
- **Where:** The `'signed-out'` branch of `onAuth` (`src/core/auth.tsx:168-180`) clears the read caches only. `forgetAccountOnDevice` (`src/core/notifications.ts:146-150`), web push unsubscribe and the service-worker `clear-data` happen only inside `signOut()` (`auth.tsx:321-328`).
- **Failure:** The session can end other ways: refresh token revoked, password changed elsewhere, account deleted from another device, or a session that expired. In those cases the previous account's in-app alerts stay listed, its scheduled reminders still fire, the browser's web-push subscription stays bound to it, and cached API responses remain. The next account to sign in on that device sees the previous account's alerts and pushes.
- **Fix direction:** Run the same device release on every transition to signed-out or switched account.

### CL-07: Offline queues are not tied to an account and are replayed under whoever signs in next. Field results are written last-write-wins (Medium)
- **Where:**
  - Match taps: `src/data/matchOutbox.ts:18` (key `sportfolio.outbox.<matchId>`), `:193-195` (a 20 s `flushAll` that runs whether or not anyone is signed in).
  - Held results: `src/data/pendingResults.ts:21, 77-88`, flushed on any sign-in at `src/navigation/RootNavigator.tsx:310`.
  - Golf and athletics cards: `src/data/golf.ts:248, 268-285, 297-302`.
- **Failure:**
  - **(a)** Scorer A signs out with taps or a held result still queued. User B signs in on the same phone and the queue is sent with B's token. If B is also a host or scorer, the events and completed snapshot (winner, standings, follower push) are written as B. Otherwise they fail forever.
  - **(b)** A marker's offline card is pushed with `update ... eq(id)` and no version check. Hours later it overwrites an organiser's correction.
  - **(c)** `pushEntry` treats "no error" as synced, but an RLS-filtered update returns no error and 0 rows. The queued card is deleted and silently lost. `repos.ts` already has `assertUpdated` for exactly this case (`src/data/repos.ts:2014-2018`).
- **Fix direction:** Store the owner's user id with each queue and flush only for that user. Clear or park the queues on sign-out. Use version/updated_at checks on field entries. Check affected rows.

### CL-08: The service worker keeps signed-in API responses on disk, keyed by URL only (Medium)
- **Where:** `public/sw.js:111-136` caches every Supabase `/rest/v1/` GET (up to 300 entries, persistent). It serves them when the network fails, whoever is signed in. It is cleared only by the `clear-data` message (`sw.js:53`) from the Sign out button (`auth.tsx:327`).
- **Failure:** Private reads end up in Cache Storage until an explicit sign-out: the user's own contacts and guardian contacts (`players_view`), message lists, and children's full names as seen by a coach. A school or shared computer closed without signing out keeps them. After a non-button sign-out (CL-06), a different account working offline is served the previous account's responses for identical URLs (for example RLS-scoped lists with no user filter in the URL).
- **Fix direction:** Leave out private tables and views, key the cache by user, and wipe it on every auth change.

### CL-09: A child's DOB, phone and guardian contacts are written into auth `user_metadata`, so they ride in every JWT and in the stored session (Medium)
- **Where:** `src/core/auth.tsx:283-288` (`options.data` = `full_name, role, dob, phone, guardian{name,phone,email,consentedAt}, country, legal_accepted`).
- **Failure:** Supabase copies `user_metadata` into the access-token claims and into the persisted session JSON. The data then sits in AsyncStorage or localStorage on every device the child uses. It is sent as a bearer token to every REST, RPC and edge-function call (anything that logs headers logs it). It is never cleared after the profile row is created, so it goes stale and survives a later edit or erasure of the guardian details. It was not checked against a live token (unverified for this project), but this is standard Supabase behaviour.
- **Fix direction:** Pass the minimum needed in metadata, or call an RPC after sign-up, and clear the metadata once the trigger has copied it.

### CL-10: On Android the session and offline data are included in device backups (Medium)
- **Where:** `app.json` has no `android.allowBackup`. Expo's default is `true` (`node_modules/@expo/config-plugins/build/android/AllowBackup.js:28`). Tokens are kept in AsyncStorage, not SecureStore (`src/core/supabase.ts:22`).
- **Failure:** The refresh token, offline queues and cached profile data go into Google Auto Backup and device-to-device transfer, and come back on another phone signed in.
- **Fix direction:** Set `allowBackup: false` (or backup rules that exclude AsyncStorage), and keep the session in SecureStore on native.

### CL-11: The "Open in the app" button can be turned into an open redirect or an arbitrary Android intent (Medium)
- **Where:** `src/components/OpenInAppBanner.tsx:31-35` builds the URL with `androidIntentUrl(path)` (`src/core/inviteText.ts:169-171`). The path comes from the raw route token: `JoinClubScreen.tsx:64`, `JoinTournamentScreen.tsx:132`. React Navigation URL-decodes path params (`node_modules/@react-navigation/core/lib/module/getStateFromPath.js:70,281`). By contrast, `GetApp` validates its parameter with `isInviterId`.
- **Attack:** `https://app.sportnnote.in/join-club/X%23Intent%3Bscheme%3Dhttps%3Bpackage%3D<any.app>%3BS.browser_fallback_url%3Dhttps%253A%252F%252Fevil.example%3Bend`. On Android Chrome, the official-looking "📲 Open in the SportnNote app" button opens another app, or falls back to the attacker's site. The link was not tested on a device.
- **Fix direction:** Validate the token against the invite-token format (`parseClubToken`/`parseTournamentToken`) before building the intent, and `encodeURIComponent` the path.

### CL-12: The match live-stream link accepts any URL scheme and is opened for every viewer (Medium)
- **Where:** It is saved unvalidated at `src/screens/LiveScoringScreen.tsx:2046-2049, 2083` and `src/screens/ScheduleMatchScreen.tsx:306`. It is opened by `src/components/LiveStream.tsx:62` (`Linking.openURL(url)`) and pinned at the top of the match for everyone, guests included (`LiveScoringScreen.tsx:2288`).
- **Attack:** Any scorer or host sets a phishing page, an `intent://` URL, or `upi://pay?pa=attacker@upi&am=500` (opens a pre-filled UPI payment on Indian phones) behind "Watch live stream". On web, RNW opens with `noopener`; whether a `javascript:` URL can do anything there is unverified and probably contained.
- **Fix direction:** Allow only `https:` links to YouTube or Twitch (and their known hosts), both on save and on open.

### CL-13: The developer-only "Results lab" screen works in production and enrols real people in fake events (Medium)
- **Where:** `src/navigation/RootNavigator.tsx:148` (`'ResultsLab'` in `STACK_SCREENS`), `:630`. `src/screens/ResultsLabScreen.tsx:1-6` ("hidden: reachable only by URL"), `:24, 54-58`.
- **Attack:** Any signed-in user opens `/ResultsLab` and taps a sample. The app pulls the whole player directory (`getPlayers()`) and creates a results event such as "100 m U14 Boys" with the first 12 real players as entrants, minors included (their names are masked server-side by `20261024200000_minor_names_misc.sql`). Repeated taps fill results with fake events tied to real children. Whether RLS lets a non-organiser insert `field_events`/`field_entries` was not checked.
- **Fix direction:** Register the screen only when `!isSupabaseConfigured || __DEV__`.

### CL-14: The guardian's "verified" flags can be written by the client (Medium; server guard gap)
- **Where:** `src/data/repos.ts:4144-4149` (`verifyGuardianContact` sets `guardian.phoneVerified/emailVerified = true` through `updatePlayer`). The guard explicitly ignores "bookkeeping flags inside the jsonb" (`supabase/migrations/20261019121200_admin_edit_player.sql:148-158`). The flags are used by `matchEligibility` (`src/core/eligibility.ts:20-28`).
- **Attack:** A child (or whoever manages an unclaimed child's row) PATCHes `players.guardian` with both flags set to true. The live UI only calls this path in demo mode, but the API accepts it.
- **Impact:** Two of the guardian checks in the eligibility rule can be faked, and the "verified guardian" display can't be trusted.
- **Fix direction:** Make the server the only writer of the verified flags inside `guardian` (strip them on client writes, as is done for `phone_verified`).

### CL-15: Verification documents have no type or size limit on the server, and reviewers open them in a browser (Medium)
- **Where:** The bucket is created with no `allowed_mime_types` or `file_size_limit` (`supabase/migrations/20260830120000_verification_backend.sql:24-26`). The 10 MB limit and content type are client-side only (`src/data/repos.ts:4168-4181`, `src/core/document.ts:137-143`, where the extension comes from the file name). Reviewers open the file with `Linking.openURL(signedUrl)` (`src/screens/VerificationReviewScreen.tsx:274-280`, `src/components/ProfileView.tsx:498-503`).
- **Attack:** Upload an HTML or SVG "document" (`contentType: text/html`) through the Storage API, then submit it for review. A support reviewer opens it on `<project>.supabase.co`, where it can show, for example, a fake "session expired, sign in" page to phish reviewer credentials. Also, files of any size can be uploaded. How Supabase Storage serves `text/html` was not checked.
- **Fix direction:** Set `allowed_mime_types` (`image/*`, `application/pdf`) and a size limit on the bucket, and download rather than render.

### CL-16: Photos uploaded from the web keep their EXIF data, including GPS (Medium)
- **Where:** `src/core/photo.ts:8-23` → `src/data/repos.ts:1975-2006` uploads the raw bytes. On web, expo-image-picker returns the original file and ignores `quality` and `allowsEditing` (`node_modules/expo-image-picker/src/ExponentImagePicker.web.ts:215` onward, with an "exif support" TODO). Logos and banners go to the **public** `media` bucket; player photos go to the private bucket.
- **Failure:** A photo taken at home or school and uploaded from a desktop or Android browser carries its GPS coordinates. Team logos and banners are world-readable. Native builds re-encode (quality 0.6), which probably strips EXIF (unverified). Verification documents keep their metadata too.
- **Fix direction:** Re-encode on the client (canvas, or expo-image-manipulator) before upload, or strip EXIF on the server.

### CL-17: The rules that protect finished results are client-only (Medium)
- **Where:**
  - The 24 h correction window is marked "Client-only gate" (`src/core/roles.ts:14-34`).
  - Restart is allowed only within 5 minutes and only if the match isn't complete (`src/screens/LiveScoringScreen.tsx:768-770`).
  - POTM can be changed once (`:798`).
  - Dispute resolution permission (`:544`; direct table updates at `src/data/repos.ts:2933-2960`).
  - `resetMatch` (`src/data/repos.ts:1689-1731`) is a sequence of separate, non-atomic writes: status, then `match_events` delete, then `stat_lines` reset.
- **Attack:** A scorer or host of a completed tournament match calls `resetMatch` or the event APIs directly days later. They wipe or rewrite the log, the result and standings. If the network drops partway through a reset, the match is left half-reset (status "scheduled" but events still there).
- **Fix direction:** Enforce the windows in the server write paths and do reset as one RPC.

### CL-18: Deleting an account needs no re-authentication (Medium)
- **Where:** `src/screens/DeleteAccountScreen.tsx:19-31` (typing "DELETE" is the only check). Guardians deleting a child: `src/data/privacy.ts:190-196` (behind a confirm sheet only).
- **Failure:** On a shared or unlocked phone, anyone can permanently delete the signed-in account, or a guardian's child's account, in seconds. It cannot be undone.
- **Fix direction:** Require a fresh password or OTP (re-auth) before deletion.

---

## Low

### CL-19: Sign-in messages reveal whether an email has an account (Low)
- **Where:** `src/core/auth.tsx:31` ("There's no account with this email", mapped from `otp_disabled`) for `sendSignInOtp` (`:333-336`) and `sendPhoneOtp` (`:347-350`, same message). Also `:32` ("already exists") on sign-up. That one depends on the live "Confirm email" setting (unverified).
- **Impact:** Anyone can check whether a given email (for example a child's) is registered. The API reveals the same thing, so this is wording only.
- **Fix direction:** Use a neutral message: "If an account exists, we've sent a code."

### CL-20: The SMS cost cap is enforced only on the device (Low)
- **Where:** `src/core/smsBudget.ts:18-24` and `src/core/smsLimit.ts:11-29` (5 a day per device, 3 per number, stored in AsyncStorage). Used at `src/core/phoneLogin.ts:30` and `src/data/repos.ts:4090`.
- **Impact:** Clearing storage, or calling Firebase with the public web key, gets around it. Only Firebase's own limits and reCAPTCHA remain against SMS-pumping costs.
- **Fix direction:** Add server/Firebase-side quotas (Identity Platform SMS region policy, App Check).

### CL-21: Team names in a match link can be spoofed (Low)
- **Where:** `src/screens/LiveScoringScreen.tsx:185-193`: route params win over the loaded names. Used at `:1015-1016`.
- **Attack:** `app.sportnnote.in/LiveScoring?matchId=<real>&sport=cricket&homeName=Pay%20fees%20to%20UPI%20x@y` shows the real live match with attacker text as the team names, on the trusted domain.
- **Fix direction:** Always display the names loaded from the server when a `matchId` is present.

### CL-22: Opening `/get/<playerId>` while signed in follows that player and notifies them, without asking (Low)
- **Where:** `src/screens/GetAppScreen.tsx:41-54`, `src/data/referral.ts:44-55`.
- **Attack:** A stranger sends a child their personal invite link. The child silently follows them, and the stranger gets "A friend joined" if the child's account is under 14 days old. The server keeps the child unnamed and refuses following minors.
- **Fix direction:** Show a "Follow <name>?" confirmation.

### CL-23: Two unauthenticated invite endpoints are called from the client (Low)
- **Where:** `src/screens/InviteScreen.tsx:42` (`join?p=<id>&format=json` returns any player's team name, team id and claimed flag) and `:53` (`report-invite`, a POST with any unclaimed player id that stamps `reported_at`; `supabase/functions/report-invite/index.ts:38`).
- **Impact:** Anyone can enumerate team membership, or mass-flag organisers' pending invites as "not me" (`claim_reported_invite` handling).
- **Fix direction:** Require a signed invite token rather than a bare player id.

### CL-24: Every match view downloads the whole player directory (Low)
- **Where:** `src/screens/LiveScoringScreen.tsx:311-315` calls `getPlayers()` (`src/data/repos.ts:1153-1161`, all pages), including for logged-out viewers of a shared link. Other screens do the same (20 call sites).
- **Impact:** Data minimisation and cost. Every viewer pulls everyone's public card, adults' full names and cities included, and the service worker (CL-08) keeps a copy.
- **Fix direction:** Fetch only the ids the screen needs.

### CL-25: Admin and test helpers are exposed as globals in production builds (Low)
- **Where:**
  - `__sportnnoteAdmin` (`src/data/repos.ts:2436-2441`, `src/data/matchRecordsBackfill.ts:97-100`): bulk `stat_lines`/`matches` writers.
  - `__sportfolioDisputes` (`repos.ts:2982-2984`).
  - `__sportfolioOutbox` with `setOnline`/`flushAll` (`src/data/matchOutbox.ts:199-205`).
  - `__sportfolioPendingResults` (`src/data/pendingResults.ts:90-93`).
- **Impact:** RLS still applies. But any injected script or browser extension gets ready-made bulk writers, and the attack surface is documented in the bundle.
- **Fix direction:** Register them only under `__DEV__`, or for support accounts on demand.

### CL-26: The web app sets no CSP and no framing protection (Low)
- **Where:** `public/index.html` (no CSP meta). The app is hosted on EAS with no header config in the repo. Print windows are same-origin `about:blank` documents written with `document.write` (`src/core/printSheet.ts:9-13`, `src/screens/TournamentProfileScreen.tsx:336-338`).
- **Impact:** All print builders escape correctly today (see below), but one missed `esc()` would mean script running with the session token in localStorage. The app can also be framed by other sites (largely blunted by storage partitioning).
- **Fix direction:** Add a CSP (script-src self plus the hosts actually used) and `frame-ancestors 'self'` (leaving the OBS `/o/` route framable if needed).

### CL-27: Exported CSV and calendar files can carry injected content (Low)
- **Where:** `src/data/scheduleImport.ts:553-554`: the template CSV doesn't neutralise a leading `= + - @`, and it includes team and venue names typed by other users. `src/core/ics.ts:33`: `esc()` leaves `\r`.
- **Impact:** Formula injection when an organiser opens the template in Excel or Sheets. Extra calendar properties can be injected through names saved via the API.
- **Fix direction:** Prefix risky CSV cells with `'`, and escape or strip `\r` in ICS values.

### CL-28: Crash reports can carry personal data (Low)
- **Where:** `src/core/telemetry.ts:173-176, 196-198`. A rejection that isn't an `Error` (for example a raw PostgREST error object) is serialised with `JSON.stringify`, and its `details` can hold values such as `Key (phone)=(+91…)`. Reports are tied to the profile id on the server.
- **Impact:** Contact data (possibly a child's) in the error logs. The guardian page promises activity is never linked to analytics (`GuardianConsentScreen.tsx:94`). Whether such a rejection actually reaches the handler was not checked.
- **Fix direction:** Report only `message`/`code`, and scrub digits and emails.

### CL-29: Over-the-air updates are not code-signed (Low)
- **Where:** `app.json` → `updates` has only the `url`; there is no `codeSigningCertificate`.
- **Impact:** Anyone with the Expo account, or an EAS-side compromise, can push JS to every installed phone with no signature check.
- **Fix direction:** Turn on EAS Update code signing.

### CL-30: Voice scoring on the web sends audio to Google's cloud speech service (Low)
- **Where:** `src/core/speechSetup.ts:1-3` and `src/core/speech.ts` (Web Speech API in Chrome and Edge is server-side recognition). The iOS microphone permission text says audio "isn't recorded or uploaded by SportnNote" (`app.json` infoPlist).
- **Impact:** Spoken player names, often children's, go to a third party. The privacy policy may need to disclose this (DPDP).
- **Fix direction:** Disclose it, or prefer on-device recognition where available (native already tries `requiresOnDeviceRecognition`).

---

## Client-only checks to cross-check in the database audit

These rules are enforced in the UI (or with client-supplied values) and, as far as the client code shows, not repeated on the server:

1. Fielding eligibility and the tournament age requirement (CL-01).
2. Under-18 sign-up: guardian name/contact and the consent checkbox (`AuthScreen.tsx:108-118`), and the sign-up `country` (CL-04).
3. The 24 h correction window, the 5-minute restart, reset of completed matches, one-time POTM, and who may resolve disputes (CL-17).
4. The guardian `phoneVerified`/`emailVerified` flags inside `players.guardian` (CL-14).
5. Verification document size and type (CL-15).
6. The SMS per-device and per-number caps (CL-20).
7. The scoring lock's device binding uses a client-generated id (`src/core/deviceId.ts`). The server can't tell two devices of the same account apart.
8. Admin screens reachable by URL by any signed-in user: `/MessageReports` (no client gate at all, `src/screens/MessageReportsScreen.tsx`), `/VerificationReview`, `/SupportConsole`, `/OrgDobs`, `/ManageChild`, `/ResultsLab`. All rely on RPC/RLS checks: `support_message_reports`, `support_resolve_report`, `support_lift_messaging_ban`, reviewer RPCs, `guardian_*` RPCs, and `field_events` insert.
9. The "quick" profile role comes from `user_metadata.role` (`src/core/authEvents.ts:56-63`), which the user can write. It is UI-only until `profiles` loads. Confirm that `profiles.role` can't be changed by the client, and that the sign-up fallback upsert (`src/core/auth.tsx:301-306`) can't insert `role='support'` if the trigger is ever missing.
10. Field-entry (golf, athletics) card writes are last-write-wins (CL-07(b)).
11. `find_player_by_phone`/`_email` returning `full_name` (CL-02), and `guardian_consent_decide` linking any adult with no email match (CL-03).
12. `join?p=` and `report-invite` taking a bare player id with no auth (CL-23).

---

## Checked and fine

- **No raw-HTML sinks in the app.** There is no `dangerouslySetInnerHTML`, `innerHTML`, `WebView`, `eval` or `new Function` in `src/`. `Markdown.tsx` renders through `<Text>` only, so tournament "about" text and AI answers are safe.
- **Every printable HTML builder escapes user text.**
  - Builders checked: `fixturesText.ts:22`, `certificates.ts:132`, `passport.ts:42`, `hallOfFame.ts:168`, `results/printSheets.ts:25`, `sports/chess/roundSheet.ts:177`, `orgVerification.ts:650`.
  - Meet logos are limited to `https:` or `data:image/` (`printSheets.ts` `meetHeaderHtml`).
  - Team colours are regex-checked.
  - QR SVGs are built from sanitised codes.
- **Marketing site build** (`scripts/build-website.mjs`): it uses only repo content (config and guides), escapes everything, guide links pass `safeUrl`, and JSON-LD escapes `<`.
- **Notification taps:**
  - Native taps open only `sportnnote://` URLs (`notifications.ts:133`).
  - Web push clicks resolve against the app's own origin, and the server only sends `/m/<id>` or `/` paths.
  - `push-send` checks the relationship, strips links, caps length and rate-limits.
  - `send-invite` allow-lists link origins (with a trailing slash), takes the inviter's name from the profile, and rate-limits.
  - `support-assistant` needs auth and has caps of 20 an hour and 1k/12k characters.
- **Links and URLs:**
  - The QR scanner opens only links on our own hosts, with an id regex (`appLinks.ts`).
  - The overlay `sp` param is limited to our own sponsor-logo paths (`overlayParams.ts`).
  - The GetApp `from` parameter is validated (`referralRules.ts`).
  - Venue map links are forced to http(s) (`venue.ts:9`).
  - WhatsApp windows are opened with `opener = null` (`connect.ts:44`).
- **Minors on the client:**
  - Profile share is offered only for adults or yourself (`PlayerProfileScreen.tsx:67`).
  - Minors' show-phone, show-email and findable flags are forced off in the client and enforced in `players_view` (`a.adult`).
  - The `match_disputes`, `field_entries.members`, award and line-up name fields are masked by server triggers (`minor_names_*`, `match_names_safety_net`).
  - Match events store ids only (`types.ts:874-877`).
  - Certificates use 50-bit codes, and `verify_certificate` uses `public_person_name`.
- **Guardian consent:** the server refuses approval from the child's own account (`me = r.profile_id`).
- **Session and caches:**
  - `detectSessionInUrl: false`.
  - The read cache is in memory only and cleared on sign-out and account switch.
  - Signed private-image URLs are cleared on auth events (`useImageUri.ts:25`).
  - Switching accounts remounts the navigator (`RootNavigator.tsx` navKey).
  - The active org context resets when the user isn't a member (`orgContext.tsx`).
- **Telemetry** sends allow-listed event names and route names only (never params), and the device id is sent only with consent.
- **Secrets:** the built bundle contains only the anon JWT (role `anon`). There is no service-role or LLM key in `src/`. `devSeed` loads under `__DEV__` only. The demo seeders load only when Supabase isn't configured. `.env*.local` is gitignored, and the tracked `google-services.json` holds a public-by-design key.
- **Image uploads** have a 5 MB client check, and the server enforces MIME and size limits on `media` and `player-photos` (`media_storage.sql`, `protect_minors.sql:302-305`). Player photos are private and served through signed URLs.
- **Phone login** only reveals new versus existing *after* the number is proven with Firebase. A password-reset request answers the same whether or not the account exists.

---

## Screens and data modules with no tests

Method: these names are never referenced from `tests/` (286 files). Many of the "covered" screens are only covered by source-text checks, not behaviour tests.

**Screens:**
- **Security-relevant, no tests:** `DeleteAccountScreen`, `GetAppScreen` (auto-follow), `InviteScreen`, `JoinClubScreen`, `JoinTeamScreen`, `JoinTournamentScreen`, `GuardianLinkScreen`, `MessageReportsScreen`, `MessagesScreen`, `ConversationScreen`, `PrivacyScreen`, `EditProfileScreen`, `OverlayScreen`, `ResultsLabScreen`, `MatchLinkScreen`, `RegionSettingsScreen`, `OrgDobsScreen`, `RosterImportScreen`, `ImportScheduleScreen`.
- **Others with no tests:** `AmericanoScreen`, `AssignScorersScreen`, `CalendarScreen`, `CertificateScreen`, `ClubHomeScreen`, `ClubSportScreen`, `ClubsScreen`, `ContingentsScreen`, `CreateClubScreen`, `CreateListingScreen`, `CreateSeriesScreen`, `CreateTournamentScreen`, `DiscoverOrgsScreen`, `DiscoverScreen`, `EditMatchScreen`, `EditTeamScreen`, `EditTournamentScreen`, `FeedbackScreen`, `FollowingScreen`, `GenerateFixturesScreen`, `GolfCourseEditScreen`, `HeadToHeadScreen`, `InviteFriendScreen`, `LegalScreen`, `MatchesScreen`, `MeetTimetableScreen`, `MyTournamentsScreen`, `NotificationPrefsScreen`, `NotificationsScreen`, `OrganizeScreen`, `OrganizerDashboardScreen`, `ScheduleMatchScreen`, `SeriesScreen`, `SportSettingsScreen`, `SupportScreen`, `SwissRoundScreen`, `TeamProfileScreen`, `TeamsScreen`, `TournamentTeamsScreen`, `TryNewSportScreen`, `WeightliftingEventSetup`.
- `SchoolRequestScreen` is also untested, but it is out of scope here.

**`src/data`:**
- **Security-relevant, no tests:** `messages`, `referral`, `pendingResults`, `golf` (the field-results outbox), `useLiveMatch`, `useImageUri`, `supportConsole`, `registerLookup`, `profileRegion`, `reminderPrefs`, `reminders`.
- **Others with no tests:**
  - Stores and records: `amendments`, `captainStore`, `certificates`, `chessRoundResults`, `entrants`, `hooks`, `manualStandings`, `matchRecordsBackfill`, `meetEntriesStore`, `onboardingStore`, `organizerStats`, `passport`, `sportProfileFields`, `teamEventResults`, `teamRoles`, `tieAlerts`, `timetableStore`, `tournamentDraft`.
  - Hooks: `useAgeRequirement`, `useAthletics`, `useCarriedEvent`, `useGolf`, `useMarket`, `useMeetAges`, `useMeetEntries`, `useMeetZone`, `usePlayerNameOf`, `useProfileShare`, `useSuspensions`, `useVerificationReviewer`.
  - Seeds: `demoStore`, `devSeed`, `sd134DemoSeed`, `sd137bDemoSeed`, `teamTieDemoSeed`, `worldCup*Seed`.

**`src/core`, no tests:**
- **Security-relevant:** `supabase`, `connect` (`openExternal`), `share`, `printSheet` / `printSheet.native`, `webPush`, `deviceId`, `guest`, `venue`, `photo`, `invite`, `orgContext`, `analyticsConsent`, `staleVersion`, `supportAI`, `voiceLLM`.
- **Others:** `a11y`, `confirm`, `download`, `functionPath`, `haptics*`, `hapticsPref`, `ics`, `keepAwake*`, `mockData`, `onboarding`, `pickContact`, `qrSvg`, `shareInvite*`, `speech`, `speechSetup*`, `teams`, `disputeMask`.

**Gaps that matter most:**
- Nothing tests sign-out when offline (CL-05).
- Nothing tests the signed-out-by-expiry path (CL-06).
- Nothing tests queue ownership across accounts (CL-07).
- Nothing tests that URL params can't change displayed data (CL-11, CL-21).
- A test actively asserts that the testing override stays on (CL-01).
