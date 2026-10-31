---
name: sportfolio-security-hardening
description: "Security review 2026-10-05 — §2 blanket RLS writes + §3 edge fns DONE as migration 0025 (committed 914b2a7, not run live); §1 PII next: privacy opt-in + in-app messaging, minors routed to guardian"
metadata:
  node_type: memory
  type: project
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-05T18:23:54.560Z
---

Security review 2026-10-05 had three sections. The user approved §2 and §3 ("as per your fixes"); both are built as **migration 0025** (`supabase/migrations/20261006120000_security_hardening.sql`), plus 7 edge fns, `_shared/guard.ts` and app changes. Status: **committed 914b2a7 (2026-10-06, not pushed), not run on live**. Deploy checklist: `docs/security-hardening.md`. Run order: 0012–0024 first, then 0025, set WEBHOOK_SECRET, deploy fns, ship the next APK — old APK invites/membership/transfer break after 0025.

Extra criticals found and fixed in 0025:
- anyone could self-assign profiles.role=support/admin (opens all ID docs);
- owners could self-approve verification / phone_verified;
- invite tokens were sequential (`JOIN-n`);
- createOrgRequest upsert on a partial unique index always failed;
- org-hosted tournaments weren't manageable by org admins.

Verification harness: PGlite in the session scratchpad (scenarios.mjs, 102 passing). Not in the repo. Offered to add as a test (needs the @electric-sql/pglite devDependency).

**§1 PII — parts 1, 2, 4 BUILT 2026-10-06 as migration 0026** (`20261007120000_private_contact_details.sql`). Status: uncommitted, not run live.
- Mechanism: column-privilege revoke + `players_view` read model + RPCs. The user had approved a "separate table"; I chose this instead for the same outcome with no data move, and told them.
- App reads use `PLAYERS_READ`; `ageOf(p)`; Edit Profile privacy toggles (adults only).
- Gotcha: new players/profiles columns must be added to 0026's column grants AND to players_view.
- Part 3 (in-app messaging) not started. Gaps flagged: guardian verified flags are client-set (no server guardian OTP); own-phone verification is blocked on live until WhatsApp OTP works.

**Messaging BUILT 2026-10-06 as migration 0027** (`20261008120000_messaging.sql`), plus edge fns `message-notify` and `guardian-link`. Uncommitted.
- The user wants 0026 + 0027 committed together later ("commit everything at once").
- Adults-only senders; minors are routed to the guardian. A guardian links their own account via an emailed code (claim_guardian_link), which also verifies the guardian email server-side.
- Guardian flags and link are server-only (guard_guardian_fields trigger).
- Offline demo preview: launch config `sportfolio-offline-demo` (port 8093, EXPO_NO_DOTENV=1) — safe for UI checks; 8091 is LIVE.
- SQL suites in the scratchpad: scenarios (102), privacy (27), messaging (51).
- Also built (2026-10-06): support report review + messaging bans, unblock, realtime in conversations, and a guardian_phone OTP channel. The OTP delivery still waits on WhatsApp/Meta verification. Live mode no longer fakes on-screen OTP codes. SQL messaging suite is now 70 scenarios.

**§1 direction (user):**
- The app is for talent scouting/following, so public visibility of performance matters.
- Accept the private-table split *if* the app gets an in-app way to reach/message players.
- Add per-person privacy settings: contact details hidden by default, the person can opt in to show them.
- Must comply with DPDP Act 2023 (children's data).
- DECIDED 2026-10-06: messages to under-18 players are routed to their GUARDIAN (not the minor).

Pre-existing bug seen, not fixed: TournamentTeamsScreen emails `joinLink(invite.token)`, but the `join` fn expects a player UUID, so the "manage team" email link is broken.

**Why:** go-live blocker work; see [[sportfolio-golive-readiness]], [[sportfolio-status-2026-10-05]].
**How to apply:** before touching RLS, edge fns or invites, read the migration and docs. Write new tables' policies with the helpers (has_org_role, can_manage_tournament/team/club), never a bare `auth.role()='authenticated'`.
