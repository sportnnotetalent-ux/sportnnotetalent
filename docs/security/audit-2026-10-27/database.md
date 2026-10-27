# Database security audit — 2026-10-27

**Scope.** `supabase/schema.sql` and the migrations in `supabase/migrations/`, read in filename order. Only the latest definition of each function, policy and trigger was judged. `20261028100000_student_lists.sql` was skipped as asked. `supabase/release/` bundles were not diffed separately.

**Method.** Static reading only. Nothing was run against live or any database.

**Assumption to confirm on live.** Supabase's default privileges grant `EXECUTE` on new `public` functions to `anon` and `authenticated` explicitly. So `revoke … from public, anon` still leaves `authenticated` able to call a function. Check with `select has_function_privilege('authenticated', '<fn>(<args>)', 'execute')`.

**Note on detail.** Each finding names the weak rule, where it lives, who can reach it, and what it exposes. The reproduction steps are left out on purpose. Every item can be confirmed by reading the cited lines.

---

## Findings

### DB-01 · Critical · Anyone signed in can put any child into their own "circle"

- **Objects:**
  - `player_circle_of()` — `20261019124600_protect_minors.sql:71`
  - `my_roster_editable_team_ids()` — `20261023100000_perf_wave2.sql:265`
  - `players_view` — `20261026120000_device_account_and_verification_privacy.sql:51`
  - the "read players" policy — `20261024120000_minor_names_signed_in.sql:98`
- **Weakness:** The circle is built from rows the caller can create alone. None of them need consent from the players or teams they point at:
  - a team they created, with any player ids in its roster;
  - `team_members` and `club_members` rows on teams or clubs they manage (`20261006120000_security_hardening.sql:486`, `:633`);
  - `org_members` rows in an org they administer (`guard_org_member`, `20261006120000_security_hardening.sql:661`, admin INSERT);
  - `tournament_teams` rows for any team (`20261006120000_security_hardening.sql:919`);
  - a friendly match against any team (`20261006120000_security_hardening.sql:862`);
  - `field_entries` for any player (`20261009120000_golf_field_events.sql:134`).
- **Who:** Any signed-in stranger.
- **Impact:** Defeats the "initials outside the circle" rule for every child:
  - full name, age, gender, city, school, photo, bio and sport details;
  - phone numbers of unclaimed players, through `provisional_contact`;
  - following a minor, which brings match-time and venue alerts;
  - push messages sent through `push-send` (`push_allowed_targets`, `20261023100000_perf_wave2.sql:138`).

  It can be done in bulk, because player ids are listed in `players_view`.
- **Fix direction:** Build the circle only from relationships the other side confirmed. Examples: an accepted invite or roster consent, a verified org, or an org the child joined by choice. Never count rows the viewer created alone. Show `provisional_contact` only to the team's real managers.

### DB-02 · Critical · An unclaimed player can be claimed with a phone number nobody verified

- **Objects:**
  - "update own profile" — `20260709120000_production_hardening.sql:109`
  - `guard_privacy_columns` — `20261020120000_privacy_rights.sql:200`, which does not cover `phone` or `dob`
  - `handle_new_user` — `20261016120000_phone_login.sql:13`, which copies `phone` from sign-up metadata
  - the claim branch of `guard_player_write` — `20261019121200_admin_edit_player.sql:104-114`
  - `my_claimable_player()` — `20261007120000_private_contact_details.sql:159`
- **Weakness:** The claim check compares the player's phone with `profiles.phone`. The user sets `profiles.phone` freely, by UPDATE or in sign-up metadata, and nothing verifies it. `my_claimable_player()` uses the same value, which also opens the base-table read.
- **Who:** Any signed-in user who knows the phone number stored on an unclaimed player. That is often a parent's number typed in by a coach, and DB-01 exposes it.
- **Impact:** The attacker takes over a child's player record: DOB, guardian contact, stats, certificates and future messages. They can then delete it ("players delete scoped" allows the owner to delete). It also works as a phone-to-name lookup with no rate limit.
- **Fix direction:**
  - Make `profiles.phone` server-only: set it only after an OTP, and freeze it in a guard trigger.
  - Base the claim on a verified phone (an `auth.users.phone_confirmed_at` or OTP record), never on profile text.
  - Take `phone` out of the sign-up metadata path.

### DB-03 · Critical · `meet_ages()` leaks the exact date of birth of any player

- **Objects:**
  - `meet_ages()` — `20261019124330_field_record_book.sql:220`
  - `meet_age_cutoff()` — `20261020160000_market_presets.sql:35`, the `'meet'` branch
- **Weakness:** The function checks only that the caller manages the tournament id passed in, and anyone can create a tournament. It takes up to 2,000 arbitrary player ids. The cutoff date can follow the tournament's own `start_date`, which the organiser can set to any day. The "first or last day of the month" protection in `meet_age_cutoff` doesn't apply to that branch.
- **Who:** Any signed-in user.
- **Impact:** Children's dates of birth can be recovered exactly and in bulk. These are the most sensitive field here, and `players_view` hides them from everyone except the player, their guardian and support.
- **Fix direction:**
  - Return ages only for players entered in that tournament and confirmed.
  - Make `'meet'` follow the same month-boundary rule, or freeze `start_date` once ages have been read.
  - Rate-limit the function.

### DB-04 · Critical · Strangers can become "admins" of other coaches' unclaimed players, which leads to a guardian takeover

- **Objects:**
  - `can_admin_player()` — `20261019122600_org_staff_player_edit.sql:53`, tournament arm `:66-77`
  - the "authed create tourneys" policy — `20261006120000_security_hardening.sql:836`, which doesn't check `host_ids`
  - the admin branch of `guard_player_write` — `20261019121200_admin_edit_player.sql:115-129`
  - `guard_guardian_fields` — `20261008120000_messaging.sql:50`
  - `send_message()` — `20261008120000_messaging.sql:243`
  - `claim_guardian_link()` — `20261008120000_messaging.sql:529`
- **Weakness:** The tournament arm trusts `tour.host_ids` and `tournament_teams`. A stranger can fill both without the named host or team agreeing. After that, the admin branch can still change the guardian contact and the DOB. A guardian email change unlinks the current guardian. The `message-notify` edge function then emails a link code to whatever guardian email is on file.
- **Who:** Any signed-in user, against unclaimed players added by a coach.
- **Impact:**
  - Changes to a child's record: name, DOB (which can turn a child into a "known adult", so their card becomes public), and guardian details.
  - The real guardian can be replaced by someone else, who then gets export, consent and delete rights over the child.
- **Fix direction:**
  - Validate `host_ids` at INSERT: only yourself, or people who accepted.
  - Don't let `tournament_teams` entries without the team's consent count for `can_admin_player`.
  - Lock `guardian`, `dob` and `guardian_profile_id` in the admin branch.

### DB-05 · High · Any signed-in user can take over or change the roster of any team

- **Objects:**
  - `can_edit_team_roster()` — `20261006120000_security_hardening.sql:145`
  - the `teams_update` policy — `20261006120000_security_hardening.sql:451`
  - `guard_team_write` — `20261019121000_tournament_teams_admin.sql:39`
- **Weakness:** Roster rights come from managing a scheduled or live match of the team, and anyone can create a friendly against any team. The guard also lets a non-manager fill an empty captain or vice-captain slot, and that slot then counts as full management.
- **Impact:** Someone else's team gets changed:
  - players added or removed;
  - renamed, deleted or withdrawn from tournaments;
  - new invites created.

  It also feeds DB-01 and DB-04.
- **Fix direction:**
  - Give roster rights only for matches in a tournament the team entered with consent, or for matches its managers accepted.
  - Never let a non-manager fill the captain or vice-captain slot.

### DB-06 · High · A team-tie series can be hijacked through `format.__seriesId`

- **Objects:**
  - `is_tie_host` — `20261019123500_team_tie_ops.sql:44`
  - `settle_team_tie` — `20261019123500_team_tie_ops.sql:55`
  - `save_tie_lineup` — `20261019123500_team_tie_ops.sql:173`
  - `get_tie_lineups` — `20261019123500_team_tie_ops.sql:250`
- **Weakness:** A series is identified by a free-text key inside `matches.format`, which any match creator controls. Host rights over the series come from any one match carrying that key. These SECURITY DEFINER functions then update every match in the series and write `match_squads`, bypassing RLS.
- **Impact:** Someone else's tie can be disrupted: sealed lineups read, lineups and squads overwritten, remaining rubbers cancelled or restored.
- **Fix direction:**
  - Bind a series to one tournament: require all its matches to share a `tournament_id` the caller manages.
  - Make `__seriesId` server-assigned and immutable from clients.

### DB-07 · Medium · A child can bypass guardian consent and the limited state

- **Objects:**
  - `privacy_on_new_profile` — `20261020120000_privacy_rights.sql:127`, which takes the country from client metadata at `:143`
  - `guard_privacy_columns` — `20261020120000_privacy_rights.sql:200`, which doesn't cover `dob`
  - `minor_account_limited` — `20261020120000_privacy_rights.sql:105`
  - `assert_can_message` — `20261008120000_messaging.sql:222`
- **Weakness:** The checks rely on values the child writes themselves:
  - the sign-up country;
  - the DOB on their profile and player;
  - the guardian email on their own player, where the consent code is sent.
- **Impact:** A minor can:
  - avoid guardian confirmation in markets that need it;
  - lift the limited state;
  - appear as an adult (a public card, and access to messaging);
  - approve their own consent.
- **Fix direction:**
  - Make DOB and guardian email server-controlled after sign-up, or let a change raise a new consent and re-verification.
  - Store the country from a server-side signal.

### DB-08 · Medium · Functions that were meant to be internal are still callable by `authenticated`

- **Objects:**
  - `player_age`, `profile_age` and `assert_can_message` — `20261008120000_messaging.sql:119`, `:125`, `:222`, revoked only from `public, anon` at `:577-580`
  - `tie_side_lineup` and `tie_rubber_players` — `20261019123500_team_tie_ops.sql:131`, `:146`, revoked at `:278`
- **Impact (if the default-privilege assumption holds):**
  - Exact age of any player or account.
  - The sealed tie lineup of the other side.
- **Fix direction:** `revoke execute … from authenticated` as well, then add a check that lists every `public` function `authenticated` can call.

### DB-09 · Medium · `find_player_by_phone` and `find_player_by_email` return unmasked names of minors

- **Object:** `20261007120000_private_contact_details.sql:123`, `:140`. Still called from `src/data/repos.ts:2652` and `:2681`.
- **Impact:** Full name and "claimed" status of any player, children included, from a phone number or email. Also confirms whether a phone or email exists. Limited to 60 an hour per account, but accounts are cheap.
- **Fix direction:** Apply the adult-only rule and `public_person_name` the way `discover_player_by_contact` does, or return only an id.

### DB-10 · Medium · `org_members` is public: school, class and house of every child

- **Object:** the `org_members_read` policy, `using (true)` — `20261006120000_security_hardening.sql:657`
- **Impact:** Anyone, logged out included, can link a child's player id to their school, academic class or section (`grades`) and house. `players_view` hides `school_id` and `city` for minors precisely to prevent this.
- **Fix direction:**
  - Limit reads to the org's members and admins, plus the player and their guardian.
  - Or expose only aggregates and adults publicly.

### DB-11 · Medium · The name-masking triggers can be used to confirm a child's full name

- **Objects:**
  - `mask_minor_names_json` and its trigger — `20261027200000_match_names_safety_net.sql:58`, `:92`
  - `teams_entry_names` — `20261024160000_entry_names.sql:62`
  - `match_disputes_mask_names` — `20261024200000_minor_names_misc.sql:88`
- **Weakness:** The data is stored masked only when a submitted string equals the child's real full name. A writer can see from the stored result whether a candidate name was right.
- **Impact:** A child's initials, which are public, can be turned back into their full name by testing candidate names.
- **Fix direction:** For possible minors, don't keep free-text names next to their ids at all (strip, don't conditionally mask). Or mask regardless of whether the name matched, and cap payload size.

### DB-12 · Medium · Achievements can be invented for any player

- **Objects:**
  - `issue_certificates` — `20261025090000_certificates.sql:69`
  - "insert stats" and "update stats" — `20260709120000_production_hardening.sql:176-177`
  - "insert event stats" — `20261009120000_golf_field_events.sql:145`
  - `field_entries` writes
  - shown in `resolve_passport` (`20261025110000_career_passport.sql:76`) and `org_hall_of_fame` (`20261025130000_hall_of_fame.sql:117`)
- **Weakness:** Certificates and stat lines are accepted for any player id, without checking that the player took part.
- **Impact:** Fake or defamatory records on a child's career passport and in school halls of fame. Certificates also pass `verify_certificate`.
- **Fix direction:** Require the player to be a confirmed participant (an entry, squad or roster with consent) in the tournament, match or event.

### DB-13 · Medium · Results are never final

- **Objects:**
  - "delete match" — `20261019121300_match_delete_played.sql:16`
  - "manage match" — `20260709120000_production_hardening.sql:157`
  - "delete events" — `20260709120000_production_hardening.sql:168`
  - `guard_match_move` — `20261006120000_security_hardening.sql:865`
  - `guard_match_event_write` — `20261019120300_scoring_lock.sql:141`
  - `guard_field_event` — `20261019124330_field_record_book.sql:180`
- **Weakness:** Any scorer or host can:
  - set a completed match back to an editable status and then delete it (stat lines cascade);
  - add or remove events after completion;
  - move a match or field event out of its tournament, after which the organisers lose control of it.
- **Fix direction:**
  - Lock completed results to tournament managers, with an audited correction RPC.
  - Make the delete check the stored status, not the client-settable one.
  - Block `tournament_id → null` for non-managers.

### DB-14 · Medium · Org admins can enrol people without consent; verified orgs then get those members' DOBs

- **Objects:**
  - admin INSERT in `guard_org_member` — `20261006120000_security_hardening.sql:661`
  - `org_member_dobs` and `org_confirm_dobs` — `20261025170000_guide_review_fixes.sql:66`, `:91`
- **Impact:**
  - An Owner or Admin of a verified org can read DOBs, and record a "school confirmed" DOB, for people who never joined.
  - Any org admin can add anyone, including as Owner or Admin, which harms that person's reputation.
  - A narrow path also lets an admin end someone's membership in another org of the same type (`:737-749`).
- **Fix direction:**
  - Membership should need the person's (or guardian's) acceptance.
  - DOB functions should count only members who joined by choice (reuse `org_member_by_choice`).

### DB-15 · Medium · Minors' full names in public tables outside the masking net

- **Objects:**
  - `handover_scoring` writes the full names of the old and new scorer into `activity_log.detail` (`20261019120300_scoring_lock.sql:59-76`), and `activity_log_mask_names` (`20261024200000_minor_names_misc.sql:112`) masks only the actor.
  - `stamp_audit_actor` (`20261006120000_security_hardening.sql:956`) and `transfer_tournament_ownership` (`:880`) store an unmasked `by_name` in the public `tournament_ownership_events`.
  - `matches.managers` and `matches.officials` hold free-text names.
- **Fix direction:**
  - Store ids only, and use `public_person_name` on every name written to a public table.
  - Add these columns to `scripts/check-minor-names.sql`.

### DB-16 · Medium · Logged-out callers can get around the analytics and crash-report rate limit

- **Objects:**
  - `track_events` — `20261011120000_account_deletion_minor_analytics.sql:100`
  - `report_client_error` — `20261020120000_privacy_rights.sql:657`
- **Weakness:** For logged-out callers, the rate-limit key is the client-chosen `p_anon_id` or session id.
- **Impact:** Unlimited inserts into `analytics_events`, `client_errors` and `rate_limit_hits`. That means storage and cost growth, and polluted KPIs.
- **Fix direction:** Rate-limit by IP (from request headers, as `api_gate` reads it) plus a global cap, and clean up `rate_limit_hits` deterministically.

### DB-17 · Low · Phone-number squatting blocks phone sign-in

- **Objects:**
  - `uq_profiles_phone` and `uq_players_phone` — `20260709120000_production_hardening.sql:33-34`
  - `phone_login_lookup` — `20261016120000_phone_login.sql:58`
  - `phone-login` returns "unverified" (`supabase/functions/phone-login/index.ts:116`)
- **Impact:** A number that hasn't been verified on SportnNote can be held by an unverified profile or player row. The real owner then can't sign up or sign in by phone.
- **Fix direction:** Unique constraints on verified numbers only. Let a verified phone sign-in release unverified holders.

### DB-18 · Low · Any co-host or org Organizer can take over a tournament; audit text comes from the caller

- **Object:** `transfer_tournament_ownership` — `20261006120000_security_hardening.sql:880`
- **Impact:**
  - A co-host can remove the creator's control.
  - `from_kind`, `from_name` and `host_name` in the audit trail are set by the caller, not the server.
- **Fix direction:** Limit transfer to the owner. Derive the audit names on the server.

### DB-19 · Low · SECURITY DEFINER helpers with no revoke are callable by `anon`

- **Objects:** `auth_player_ids`, `has_org_role`, `can_manage_*`, `can_edit_player`, `can_view_player_private`, `can_contact_provisional`, `is_support`. All defined in `20261006120000_security_hardening.sql` and related files.
- **Exception:** `player_is_known_adult(null, <profile>)` (`20261019124600_protect_minors.sql:51`) answers "is this account 18 or over?" for any account.
- **Impact:** Most of them only evaluate the caller, so they leak little.
- **Fix direction:** Revoke from `anon` and `authenticated`. Policies still work, because the policy owner calls them.

### DB-20 · Low · Any adult can make SportnNote email any child's guardian

- **Object:** `send_message` — `20261008120000_messaging.sql:243`. Has no relationship check. With `message-notify`, it emails the guardian the sender's text.
- **Impact:** Unsolicited contact with parents through our domain. Whether a send succeeds also reveals whether a guardian email is on file. Rate limits are 10 new threads a day per account and 3 emails a day per child.
- **Fix direction:** Require a real relationship, using the consented circle from DB-01.

### DB-21 · Low · Push tokens can be re-bound

- **Objects:**
  - `claim_push_token` — `20261026120000_device_account_and_verification_privacy.sql:34`
  - "manage own tokens" — `supabase/schema.sql:552`
- **Impact:** Anyone holding a token string can move that device's notifications to their own account. Tokens aren't readable by others, so the risk is limited.
- **Fix direction:** Bind tokens to the device or session, or check them on sign-in.

### DB-22 · Low · Unbounded JSON and array inputs on signed-in paths

- **Objects:**
  - `merge_field_records(p_ops)` — `20261019124330_field_record_book.sql:46`, quadratic in the number of operations
  - `push_allowed_targets(p_targets)`
  - the masking triggers over unbounded `matches.state` and `match_events.payload`
  - `support_cases.question`
- **Impact:** CPU and storage pressure, held back only by `statement_timeout`.
- **Fix direction:** Cap array length and payload size in the functions and with `CHECK (pg_column_size(...) < n)`.

### DB-23 · Low · Verification evidence is self-attested or can be changed afterwards

- **Objects:**
  - the head email and official email in `save_org_verification` — `20261025190000_org_verification.sql:284` — are chosen by the applicant, who can confirm them themselves (`org_head_decide`, `:421`)
  - "verif docs update own" — `20260830120000_verification_backend.sql:42` — lets a user replace a document after it was reviewed
- **Fix direction:**
  - Show reviewers that the authority proof was self-asserted.
  - Make documents immutable once submitted (no UPDATE; a new upload means a new review).

### DB-24 · Low · Golf course edits change other organisers' live rounds

- **Object:** `golf_courses_update` — `20261009120000_golf_field_events.sql:113`
- **Weakness:** Rounds are frozen only when completed. A course creator's edits change par and stroke index for other organisers' rounds that are scheduled or in play.
- **Fix direction:** Snapshot the course when a round starts.

---

## Count by severity

| Severity | Count | Findings |
|---|---|---|
| Critical | 4 | DB-01 – DB-04 |
| High | 2 | DB-05, DB-06 |
| Medium | 10 | DB-07 – DB-16 |
| Low | 8 | DB-17 – DB-24 |

## Checked and fine

- **RLS** is on for every table created in `schema.sql` and the migrations. Server-only tables have RLS on with no client policies: `contact_otps`, `rate_limit_hits`, `consent_log`, `guardian_*`, `org_verification*`, `support_claims`, `api_*`, `canary_records`, `phone_review`, `signup_guard_settings`, `tie_lineups`, `reminder_sends`, `message_blocks`, `messaging_bans`.
- **Old "authed write" catalog policies** from `schema.sql` and early migrations were removed by the dynamic drop loop in `20261006120000_security_hardening.sql:402-418`. Later per-table policies replace them.
- **Every SECURITY DEFINER function has `set search_path`.** Invoker functions without one aren't exploitable, because clients can't create objects.
- **`app.trusted_rpc`** is set and cleared inside single RPC transactions. No caller-controlled path keeps it `on`, and clients can't set it.
- **Staff roles can't be granted from the client:** `guard_profile_role`, `guard_signup_role`, the `profiles_role_check` constraint, and grant/revoke reviewer limited to support.
- **Messaging RPCs:** participant checks, block checks and rate limits are present. Under-18s can't send.
- **Codes and tokens:**
  - guardian consent code 80 bits, hashed;
  - guardian link 40 bits, rate-limited;
  - team and club invites 50 bits, rate-limited;
  - certificate and passport codes 50 bits;
  - org head code 80 bits, email code 6 digits with 5 tries.
- **Service-role-only functions** are correctly revoked: deletion, retention, phone-login helpers, code minting, the traffic report.
- **KPI views** are revoked from clients. `home_feed` is security invoker.
- **Storage:** `player-photos` read via `can_view_player_photo`, `verification-docs` per owner or reviewer, `media` public by design.
- **Unchanged and still correct:** `guard_org_request` (accepted_by), `guard_club_org`, `guard_tournament_edition`, `link_tournament_edition`, `guard_dispute`, `stamp_listing` (minors' contact stripped), `guard_dob_confirmations`, `guard_passport_code`, `guard_org_verification`.
- **The 2026-10-24 fixes hold** at the `players_view` / base-table layer: initials for strangers, column grants, adults-only for `anon`. They are undermined by DB-01, DB-03 and DB-09 to DB-11.

## Areas with no tests

There are no executable RLS or policy tests in the repo. The SQL tests in `tests/` mostly assert on the SQL text. The PGlite harness mentioned in the DEVLOG lives outside the repo. In particular, nothing tests:

- who can enter the circle;
- the claim flow;
- `can_admin_player`;
- `meet_ages`;
- the team-tie RPCs;
- the `guard_team_write` slot fill;
- deleting matches and results;
- function EXECUTE grants per role.

A role-based test harness (anon / stranger / member / child, each attempting every write path) would catch most of the above.
