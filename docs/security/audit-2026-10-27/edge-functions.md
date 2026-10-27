# Edge functions — security audit, 2026-10-27

Scope: every function in `supabase/functions/*/index.ts` (25) and the `_shared/` helpers, plus the SQL each one calls (latest `create or replace` in `supabase/migrations/`). Skipped: `school-parent-request`, reviewed separately.

Method: static reading only. No live endpoint was called and nothing was deployed. "Verified (static)" means the code path was followed end to end in the repo. Findings that depend on live configuration (webhooks, gateway behaviour, provider console) say so. Findings are written as defensive analysis for the engineer who will fix them — mechanism, impact, and fix direction, not runnable exploit steps.

**Count:** 1 Critical, 4 High, 6 Medium, 11 Low (22 findings).

Theme behind the most serious findings: **a "relationship" with a player can be manufactured by the caller alone.** Any signed-in user can create a friendly match naming any existing team, create a team listing any player ids in its roster, or add any player to an org they created. `push_allowed_targets`, `player_circle_of`, and `can_edit_team_roster` treat those self-made links as proof of a genuine relationship, and several edge functions then push, email, or hand out guardian codes on that basis.

---

## Findings

### EF-01 — Guardian-link path trusts a player-controlled `guardian.email` that a non-owner can set — **Critical**

- **Functions:** `message-notify/index.ts:63-77` (emails the guardian link code); `delete-account/index.ts:35-49` (a linked guardian can then erase the child's data).
- **SQL involved:** `create_guardian_link_code` (`20261008120000_messaging.sql:499`) emails whatever is in `players.guardian.email`; `guard_guardian_fields` (`messaging.sql:50-72`) treats a changed guardian email as an unlink but does not stop a non-owner from writing it; `guard_player_write` admin branch (`20261019121200_admin_edit_player.sql:113-128`) locks phone/email/house/privacy/verification for a non-creator admin but **does not lock `guardian`**; `can_admin_player` (`20261019122600_org_staff_player_edit.sql:53`); `can_edit_team_roster` (`20261006120000_security_hardening.sql:145`); `guard_team_write` (`20261019121000_tournament_teams_admin.sql:42-56`); `claim_guardian_link` (`messaging.sql:529`).
- **Weakness:** to become a child's linked guardian, an attacker needs the child's `guardian.email` to be an address they control. Several code paths let a user who is *not* the player's owner edit an unclaimed child's `guardian` object: the `can_admin_player` org-staff and match-roster arms give "admin" edit rights over unclaimed players on teams the attacker can attach themselves to, and the admin branch of `guard_player_write` does not keep `guardian` immutable the way it keeps `phone`, `email`, and `verification`. Once the guardian email points at the attacker, `message-notify` will mail the link code there, and `claim_guardian_link` links their account. The attacker can reach "admin over an unclaimed player" by creating a match or team that references the victim's existing team — neither creation is checked against team ownership (see EF-02, EF-04).
- **Impact:** full takeover of a minor's guardianship: read/reply to messages about the child, confirm the child's date of birth, and — through `delete-account` with `childPlayerId` — permanently erase the child's player record. DPDP / child-safety critical.
- **Fix direction:** add `guardian` (and `guardian_profile_id`) to the fields the non-creator/admin branch of `guard_player_write` forces back to `old`, so only the owner or support can ever change a player's guardian contact; re-check whether `can_admin_player` should grant any rights over a player whose guardian is unset.
- **Status:** Verified (static) that `guardian` is absent from the admin-branch lock list and that `can_admin_player` admits non-creators. The end-to-end chain depends on EF-02/EF-04 holding at the RLS layer; confirm against the live `teams`/`matches` insert policies before rating remediation complete.

### EF-02 — `push-send` relationship gate can be satisfied by caller-created matches/teams — **High**

- **Function:** `push-send/index.ts:55` calls `push_allowed_targets` as the caller.
- **SQL:** `push_allowed_targets` (`20261023100000_perf_wave2.sql:138`) treats "a scorer/host/player of a match the caller is involved in" and "shares a team" as allowed, where "my_matches"/"my_teams" include matches the caller hosts and teams the caller created or captains.
- **Weakness:** match creation (`"authed create match"`, `security_hardening.sql:861`) only checks `tournament_id`, not the two team ids; team creation lets the caller put arbitrary player ids in `roster`. So a caller can fabricate a match or team that "connects" them to any target player, then pass that player's id to `push-send`.
- **Impact:** send a push/web-push with attacker-chosen title+body to essentially any player (including minors, subject to the `allowed_player_follows` filter which is *not* applied in `push-send` — see EF-03). Phishing and harassment vector; the 50-recipients / 120-calls-per-hour caps limit volume but not targeting.
- **Fix direction:** scope `push_allowed_targets` to relationships the *target* also participated in (e.g. require the match/team to pre-exist or to have been created by someone other than the caller), or require mutual follow / confirmed membership for cross-user push.
- **Status:** Verified (static) in SQL. Exact insert policies for `matches`/`teams` were read (`security_hardening.sql:445,861`); confirm no newer migration tightened them.

### EF-03 — `push-send` does not apply the minor-follow filter other push paths use — **High**

- **Function:** `push-send/index.ts:64-94`.
- **Weakness:** `notify-followers` and `notify-upcoming` pass player targets through `allowed_player_follows` / `keepAllowedFollows` (`_shared/minorFollows.ts`) so under-18 players only get alerts from their circle. `push-send` resolves player ids to profile ids and pushes directly, with no minor check beyond `push_allowed_targets`. Combined with EF-02, a minor outside the attacker's real circle can be pushed to.
- **Impact:** unsolicited notifications to minors; weakens the "protect minors at the data layer" guarantee (`20261019124600_protect_minors.sql`) for the remote-push path.
- **Fix direction:** route `push-send` recipients through the same minor-follow/circle check, or at least drop targets that are possible minors not in the caller's verified circle.
- **Status:** Verified (static) — the filter is absent from `push-send`; present in the other two.

### EF-04 — Link-prefix / `isOurLink` allow-list can't stop a lookalike host once a `.com` origin is configured — **High**

- **Function:** `send-invite/index.ts:38` (`isOurLink`) built from `inviteLinkPrefixes` (`_shared/hosts.ts:34`).
- **Weakness:** each allowed origin is turned into a prefix ending in `/` (good against `sportnnote.in.evil`), but the check is a plain `startsWith` on the whole URL. It does not constrain the path or query. A link like `https://app.sportnnote.in/redirect?to=https://evil.example` passes `isOurLink` and is emailed verbatim from the `no-reply@sportnnote.in` sender. Whether this is exploitable depends on whether any SportnNote host has an open-redirect endpoint; the app's own deep links and web router should be audited for one.
- **Impact:** if any configured origin hosts a redirect/forwarding parameter, `send-invite` becomes a branded phishing relay (20 invites/user/day to arbitrary recipients).
- **Fix direction:** validate the link against a small set of exact expected shapes (`/i/<uuid>`, `/get/<handle>`, `join-club/<code>`, …) rather than any URL under the origin; or strip query strings from invite links.
- **Status:** Partially verified (static). The weak check is confirmed; impact is **conditional** on an open redirect existing on a SportnNote host — unverified here.

### EF-05 — Guardian-email OTP/code sends are keyed per child, letting the same child's guardian be re-mailed via several functions — **High**

- **Functions:** `guardian-consent/index.ts:40` (3/child/day), `guardian-link/index.ts:31` (3/child/day), `message-notify/index.ts:66` (`guardian-email`, 3/child/day).
- **Weakness:** each cap is a separate rate-limit bucket keyed on the child/player id, and `message-notify`'s guardian email is keyed on the player id too. A caller who can start conversations about several different children, or who controls several children (an organiser who typed them in), multiplies the mail. More importantly the buckets are independent, so the same guardian address can receive up to 3+3+3 messages/day across the three functions, each carrying a working link code. There is no per-destination-email cap.
- **Impact:** email bombing / nuisance to a guardian's inbox, and repeated delivery of link codes (each valid 7 days) raises phishing-confusion risk. Resend cost is bounded but non-trivial at scale.
- **Fix direction:** add a per-destination-email rate limit shared across all guardian-mailing functions (e.g. bucket on `sha256(lower(email))`), independent of which child triggered it.
- **Status:** Verified (static) that the three buckets are distinct and all keyed on player/child id, none on the destination email.

### EF-06 — `send-contact-otp` reflects raw provider error text to the client — **Medium**

- **Function:** `send-contact-otp/index.ts:79-85, 104-110, 150-151` returns `detail` = up to 300 chars of the Resend/WhatsApp response body; `verify-contact-otp` does not, but `send-contact-otp` does.
- **Weakness:** provider error bodies can contain internal identifiers, the target address, template names, or account state. Returned to any authenticated caller who owns the player row.
- **Impact:** information leak about delivery infrastructure and possibly the stored contact address; aids reconnaissance.
- **Fix direction:** keep `console.error(detail)` server-side; return only the short non-sensitive `reason` tag to the client (the header comment already says reason is meant to be the only non-sensitive field).
- **Status:** Verified (static).

### EF-07 — `register-lookup` fetches a government site with a user-supplied value; low SSRF surface but unbounded response handling — **Medium**

- **Function:** `register-lookup/index.ts:28-44`.
- **Weakness:** the host is fixed (`saras.cbse.gov.in`) and `value` is constrained to `^\d{4,8}$` (`_shared/saras.ts:25` URL-encodes it), so there is no host injection — good. But `html = await res.text()` has no size cap, and the parser runs regexes over the whole body; a hostile or compromised upstream (or a redirect, since `fetch` follows redirects by default) could return a very large body or redirect elsewhere. Support-only and rate-limited (120/hr), so blast radius is small.
- **Impact:** memory/CPU on a large response; redirect-following could reach an unintended host. Minor given the role gate.
- **Fix direction:** cap the response size, set `redirect: 'manual'` (or verify the final URL host), keep the 12 s timeout.
- **Status:** Verified (static) — no host injection; no size/redirect guard.

### EF-08 — `support-assistant` forwards user text to the Anthropic API with a per-user cap only — **Medium**

- **Function:** `support-assistant/index.ts:70-104`.
- **Weakness:** signed-in only, 20/user/hr, question ≤1000 chars, context ≤12000 chars — all good. But `context` is supplied by the client, not fetched server-side from the knowledge base, so a caller can send 12 KB of arbitrary text as "Help context" each call and spend the model budget / attempt prompt-injection of the support model. The `region`/`timeZone` inputs are tightly validated (good). Cost is bounded by the rate limit but 20×12 KB/hr/user across many accounts is real spend.
- **Impact:** model-budget abuse and prompt-injection of the grounded support answer (low stakes — output is returned only to the same caller).
- **Fix direction:** have the server select the KB context by article id rather than accepting free-form `context`, or cap/也 charge context more tightly; consider a global (not just per-user) budget guard.
- **Status:** Verified (static).

### EF-09 — `phone-login` account-existence oracle via distinct responses — **Medium**

- **Function:** `phone-login/index.ts:114-121`.
- **Weakness:** after verifying a Firebase token for a number, the function returns `status:'ok'` (number owns a verified account), `status:'unverified'` with an explanatory message (number is on an account that never verified it), or `status:'new'` (unknown number). The attacker must already prove control of the number via Firebase SMS, which bounds abuse, but for numbers they do control they learn whether that number is tied to an existing SportnNote account and its verification state. Rate limited per-IP (30/hr) and per-number (10/hr).
- **Impact:** limited enumeration / account-state disclosure, gated by SMS possession.
- **Fix direction:** acceptable risk given the SMS gate; if tightening, make `unverified` and `new` responses less distinguishable. Documented as low-to-medium.
- **Status:** Verified (static).

### EF-10 — `invite-joined` names a newly-joined adult to the inviter; relies on app-set follow — **Medium**

- **Function:** `invite-joined/index.ts:54-80`.
- **Weakness:** guards are reasonable (new account ≤14 days, once-ever via `app_metadata`, caller must already follow the inviter, minors never named). The "already follows the inviter" check (`follows` row) is the only thing tying the push to a real invite; a caller can insert their own follow row then call this to surface their own display name to any inviter player id. Minors are protected (name blanked). For adults it just reveals "X joined from your invite" to a chosen inviter — low harm, once per account.
- **Impact:** minor spoofing of the "joined from your invite" signal; capped at once per account and adults only.
- **Fix direction:** verify the follow was created through the invite flow (e.g. check an invite/referral record) rather than any follow row; low priority.
- **Status:** Verified (static).

### EF-11 — `report-invite` and `join` are public (`--no-verify-jwt`) and act on any UUID with no rate limit — **Medium**

- **Functions:** `report-invite/index.ts:27-42`, `join/index.ts:26-56`.
- **Weakness:** both are deployed public. `report-invite` POST stamps `players.reported_at` for any unclaimed player id (`.is('profile_id', null)`), with no auth and no rate limit. An attacker who can enumerate/guess provisional player UUIDs can mass-flag unclaimed invites as "not me". `reported_at` blocks the phone-number claim path (`phone_login_attach_player`, `20261016120000`), though `20261018120000` lets an SMS-proven claim clear it, so impact is bounded. `join` only reads (302 redirect / JSON team name), leaking the team name for a guessed player id to an unauthenticated caller.
- **Impact:** griefing (flag provisional players, mild claim friction) and unauthenticated disclosure of team name per player id. UUIDs are hard to guess, limiting reach.
- **Fix direction:** add a per-IP rate limit to `report-invite`; consider requiring the invite token (not the bare player id) so only someone who received the message can report. For `join` JSON, consider the same.
- **Status:** Verified (static). "public" status confirmed from deploy comments, not from live config.

### EF-12 — `delete-account` rate limit (3/hr/user) does not protect the guardian-delete target — **Medium**

- **Function:** `delete-account/index.ts:28, 35-58`.
- **Weakness:** the rate limit is keyed on the *caller*, which is right for self-delete, but the guardian-delete branch (`childPlayerId`) is also only 3/hr for the caller — fine. The real exposure is upstream (EF-01): if guardianship can be hijacked, this function is the destruction tool. On its own `guardian_delete_target` (`20261020120000_privacy_rights.sql:532`) correctly requires `players.guardian_profile_id = caller`. No weakness in isolation; flagged because it is the high-impact sink for EF-01.
- **Impact:** irreversible erasure of a child's record if guardianship is spoofed.
- **Fix direction:** fix EF-01; optionally add an out-of-band confirmation (email to the guardian address) before a guardian-initiated child deletion.
- **Status:** Verified (static) — the SQL guard itself is sound.

### EF-13 — `stripLinks` misses bare domains, so phishing text can be relayed — **Low**

- **Helper:** `_shared/guard.ts:62` used by `push-send`, `invite-joined`, `message-notify`, `verification-review`, `send-invite`.
- **Weakness:** the regex only strips `http(s)://…` and `www.…`. Bare domains and shorteners survive: `sportnnote-help.com/verify`, `bit.ly/x`, `wa.me/9199…` all pass through (verified by running the regex locally). Relayed into pushes/emails to other users.
- **Impact:** anti-phishing control is weaker than the comments imply; a crafted contact string can carry a clickable-looking domain.
- **Fix direction:** also strip bare `host.tld[/path]` patterns and known shortener forms, or render relayed free text as plainly non-link.
- **Status:** Verified (static) + reproduced against the regex.

### EF-14 — `rate_limit` fails open on any ledger error — **Low**

- **Helper:** `_shared/guard.ts:48-57` returns `true` (allowed) when `rate_limit_hit` errors.
- **Weakness:** deliberate ("a missing migration shouldn't take features down"), but it means any condition that makes the RPC error — e.g. transient DB load, a permissions regression — silently disables every rate limit across all functions at once.
- **Impact:** loss of all cost/abuse caps during a DB hiccup; no alert.
- **Fix direction:** keep fail-open but emit a metric/alert on ledger errors so a sustained failure is visible; consider fail-closed for the money-spending buckets (email/SMS).
- **Status:** Verified (static).

### EF-15 — CORS `Access-Control-Allow-Origin: *` on state-changing JWT functions — **Low**

- **Helper:** `_shared/guard.ts:20-24`; most functions echo it.
- **Weakness:** `*` with methods `POST, OPTIONS`. Because auth is a Bearer JWT (not a cookie), `*` does not by itself enable CSRF — a browser on another origin can't read the user's token. Low risk, but it does allow any web page to invoke these with a token it already has and read the JSON response.
- **Impact:** minimal given Bearer-token auth; noted for completeness.
- **Fix direction:** if feasible, reflect an allow-list of SportnNote web origins for the authenticated functions.
- **Status:** Verified (static).

### EF-16 — Method not restricted on several functions — **Low**

- **Functions:** `guardian-link/index.ts`, `invite-joined`, `message-notify`, `verify-phone-firebase`, `push-send`, `verification-review` handle `OPTIONS` then proceed without checking `req.method === 'POST'` (unlike `delete-account`, `org-verify`, etc. which 405 non-POST). `req.json()` on a GET just yields `{}`, so they fail validation harmlessly, but the inconsistency is a smell.
- **Impact:** negligible; defence-in-depth only.
- **Fix direction:** reject non-POST uniformly.
- **Status:** Verified (static).

### EF-17 — `notify-upcoming` email reminders are not de-duplicated against push and trust `venue_name`/team names verbatim — **Low**

- **Function:** `notify-upcoming/index.ts:257-420`.
- **Weakness:** names and `venue_name` go straight into email subject/body with no `stripLinks`/clip (`:288, :411`). Those fields are written by match/team managers, so content is bounded to people who can manage the match, but a managed venue name containing a URL would be emailed to players/scorers. The minor-name masking is handled in SQL triggers for `matches`, not necessarily for `venue_name`.
- **Impact:** low — limited to manager-set strings; possible link injection into reminder emails.
- **Fix direction:** `stripLinks` + length-cap venue/team names used in emails.
- **Status:** Verified (static).

### EF-18 — Webhook/cron secret comparison is sound, but functions fail *open* to "configured but empty" in one path — **Low**

- **Functions:** `notify-followers/index.ts:541-544` (refuses when `WEBHOOK_SECRET` unset — good, fail-closed); `notify-upcoming`, `privacy-retention`, `verification-reminders`, `weekly-report` accept either the service-role bearer or `x-cron-secret`, each via `safeEqual` (`_shared/guard.ts:70`, constant-time — good).
- **Weakness:** in the cron functions, if neither `SUPABASE_SERVICE_ROLE_KEY` nor `CRON_SECRET` is set, `isCron`/`authorised` returns false (fail-closed) — correct. `safeEqual` is used consistently. No timing/optional-secret bug found. Noted here as **checked and fine** with one caveat: `privacy-retention` and `verification-reminders` accept the service-role key as a bearer, meaning anyone who ever obtains that key can trigger destructive retention runs — standard for Supabase but worth key-rotation discipline.
- **Impact:** none under correct configuration.
- **Fix direction:** none required; prefer `x-cron-secret` over service-role bearer for cron where possible.
- **Status:** Verified (static).

### EF-19 — `verification-submit` org branch relies on client-checked admin status read with service role — **Low**

- **Function:** `verification-submit/index.ts:64-82`.
- **Weakness:** the org-admin check reads `org_members` with the **service role** and filters in JS (`roles.some(...)`) rather than evaluating RLS as the caller. It is logically equivalent (filters by the caller's own player ids and Owner/Admin role with an un-expired `until`), but reading privileged tables with the service role and re-implementing the authorisation in the function is the pattern that caused past bugs. The player branch's ownership check (`:100-104`) correctly also allows "document uploaded by me".
- **Impact:** none found; maintainability/defence-in-depth.
- **Fix direction:** use `caller.asUser.rpc('org_is_admin', …)` as `org-verify` does, so one SQL definition is the source of truth.
- **Status:** Verified (static).

### EF-20 — `message-notify` claim window lets a sender trigger delivery up to 10 min after send, repeatedly across edits — **Low**

- **Function:** `message-notify/index.ts:33-38`.
- **Weakness:** delivery is claimed atomically (`is('notified_at', null)`) and limited to the sender and a 10-minute freshness window — well designed against replay. No double-send found. Listed as checked-and-fine; the only note is that the guardian-email branch's cap is per-child (see EF-05), not per-message.
- **Status:** Verified (static) — idempotency is correct.

### EF-21 — Expo/web push fan-out has no per-call ceiling in `notify-followers` — **Low**

- **Function:** `notify-followers/index.ts` (webhook-triggered).
- **Weakness:** gated by `WEBHOOK_SECRET` so only the DB can call it, and it pages/chunks correctly. A star player/tournament with very many followers produces a large fan-out per event, but that is intended and the ledger prevents repeats. No external abuse path (secret-gated). Checked-and-fine; noted only as a cost consideration.
- **Status:** Verified (static).

### EF-22 — `support-escalate` records a case and emails support with user text; handle comes from profile (good) — **Low**

- **Function:** `support-escalate/index.ts`.
- **Weakness:** signed-in only, 5/hr, question/tried length-capped, `handle` taken from the caller's own profile (not the body) — all correct. The email body is plain text to a fixed `SUPPORT_EMAIL`, so no header/recipient injection. Checked-and-fine; the only residual is that `question`/`tried` are not link-stripped, but they go only to the internal support inbox, which is acceptable.
- **Status:** Verified (static).

---

## Checked and fine (per function)

- **delete-account** — self-delete requires the caller's own session; guardian-delete gated by `guardian_delete_target` SQL (owner-of-guardianship only); `confirm:'DELETE'` required; 3/hr cap. Sound in isolation (see EF-01/EF-12 for the upstream guardianship risk).
- **guardian-consent** — owner-only (reads caller's own `profiles.guardian_consent`), status-gated, 3/child/day, guardian address taken from the DB not the body, email masked in the response. (Per-destination cap gap = EF-05.)
- **guardian-link** — requires `child.profile_id === caller`; address from DB; 3/child/day. (EF-05.)
- **join-club** — public read-only landing page; code validated `^[A-Za-z0-9-]{3,40}$` and upper-cased before echo; only the club name is revealed, via service role. Fine.
- **org-verify** — admin checked **as the caller** via `org_is_admin`; 5/community/hr; `email_code` address validated; `ask_head` address from the DB; email masked. Good model (contrast EF-19).
- **phone-login** — Firebase token verified (Google keys, issuer, audience, ≤10 min); full E.164 identity (no last-10 collision); per-IP and per-number caps; placeholder emails never mailed (`guard.ts:82`); no account takeover for a number merely typed but unverified. (Existence oracle = EF-09.)
- **privacy-retention** — cron-only (service-role bearer or `CRON_SECRET`, `safeEqual`); dry-run; destructive ops gated. Fine (EF-18 caveat).
- **verify-contact-otp** — owner-checked; hashed code; 5-attempt cap; 10-min expiry; re-checks the sent-to address still matches the profile before flipping the flag; flags set server-side only. Solid.
- **verify-phone-firebase** — Firebase token verified; owner-checked; number must match the profile (whole E.164); flag set with service role only; 10/hr. Solid.
- **send-contact-otp** — owner-checked; address read from the DB, never the body; hashed code; CSPRNG; 5/hr per player+channel. (Error-detail leak = EF-06.)
- **verification-review** — reviewer-only (`isReviewer`), pending-only, never your own/your ward's, support-claim honoured, decision written with server-side identity, 300/hr. Strong.
- **verification-reminders** — cron-only; dry-run; stamps only the same pending submission. Fine.
- **weekly-report** — cron/service-role only; internal recipient; no user-controlled sink. Fine.
- **notify-followers** — webhook-secret gated (fail-closed when unset); diffs headline increases; ledger-idempotent; minor-follow filtered. Fine (EF-21 cost note).
- **notify-upcoming** — cron-only; simulated clock honoured only in dry-run; ledger-idempotent; minor-follow filtered. (Email link-strip gap = EF-17.)
- **send-invite** — signed-in; 20/day; server writes subject/body; recipient email validated; link allow-listed. (Allow-list weakness = EF-04.)
- **support-assistant** — signed-in; 20/hr; region/timeZone hard-validated. (Client-supplied context = EF-08.)
- **support-escalate** — see EF-22 (fine).

---

## Functions with no tests

Searched `tests/` for each function name (file reference or `supabase/functions/<name>` string). The following have **no** test that references them:

- `guardian-link` — no test.
- `report-invite` — no test (the public report/flag path; EF-11).
- `send-contact-otp` — no test (OTP send; EF-06).
- `verify-contact-otp` — no test.
- `verify-phone-firebase` — no test.
- `support-assistant` — no test (EF-08).
- `support-escalate` — no test (EF-22).

Have at least one referencing test: `delete-account`, `guardian-consent`, `invite-joined`, `join`, `join-club`, `message-notify`, `notify-followers`, `notify-upcoming`, `org-verify`, `phone-login`, `privacy-retention`, `push-send`, `register-lookup`, `send-invite`, `verification-reminders`, `verification-review`, `verification-submit`, `weekly-report`. Most of these are source-string assertions (grep-style) rather than behavioural handler tests, so they would not catch the logic flaws above.

---

## Notes / assumptions

- Several Critical/High findings chain through the **RLS insert policies for `teams` and `matches`** (that a caller can name any team / roster any player). These were read from `supabase/migrations/20261006120000_security_hardening.sql` (lines 445, 861) and `20261019122700_org_integrity.sql`; if a newer migration tightened them, EF-01/EF-02 downgrade accordingly. Confirm against the live schema before closing.
- EF-04's real-world severity depends on whether any configured SportnNote origin exposes an open redirect — not verified in this static pass.
- No live endpoints were called and nothing was deployed, per instructions.
